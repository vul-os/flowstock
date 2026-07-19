// Package store is FlowStock's decentralized data engine: a local SQLite
// database plus an append-only oplog. Every mutation is journalled with a
// hybrid-logical-clock timestamp; branches converge by exchanging oplog
// entries. Catalog rows merge last-writer-wins; stock movements are
// insert-only and merge by union. There is no central authority — any node
// can relay any other node's ops.
package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	_ "modernc.org/sqlite"
)

// Op is one journalled mutation. It is the unit of replication.
//
// OrgID names the workspace that produced the op. It travels with every op so
// data is self-describing: a node rejects ops from a different workspace even
// if a shared sync secret happens to match (see ApplyOps).
type Op struct {
	HLC     string          `json:"hlc"`
	NodeID  string          `json:"node_id"`
	OrgID   string          `json:"org_id"`
	Tbl     string          `json:"tbl"`
	RowID   string          `json:"row_id"`
	Deleted bool            `json:"deleted"`
	Payload json.RawMessage `json:"payload"`
}

// Store owns the database and the local clock. All methods are safe for
// concurrent use.
type Store struct {
	mu     sync.Mutex
	db     *sql.DB
	clock  *HLC
	nodeID string
	orgID  string
	// onChange fires after any committed local or remote mutation so the UI
	// can refresh (wired to an SSE broadcaster in the api layer).
	onChange func()
}

// Open opens (or creates) the database at path and prepares the schema, node
// id and clock. A brand-new database is assigned a fresh node id.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // single writer; WAL handles concurrent readers within the process
	if err := initSchema(db); err != nil {
		return nil, err
	}

	s := &Store{db: db}
	node, err := s.getSetting("node_id")
	if err != nil {
		return nil, err
	}
	if node == "" {
		node = NewID()
		if err := s.SetSetting("node_id", node); err != nil {
			return nil, err
		}
	}
	s.nodeID = node

	// Every workspace has a stable org id, generated once on a brand-new
	// database. A node adopts a peer's org id when it pairs into an existing
	// workspace (see AdoptOrg); until then it owns its own.
	org, err := s.getSetting("org_id")
	if err != nil {
		return nil, err
	}
	if org == "" {
		org = NewID()
		if err := s.SetSetting("org_id", org); err != nil {
			return nil, err
		}
	}
	s.orgID = org

	// Seed the clock past everything already journalled.
	var maxHLC sql.NullString
	_ = db.QueryRow("SELECT MAX(hlc) FROM oplog").Scan(&maxHLC)
	s.clock = NewHLC(node, maxHLC.String)
	return s, nil
}

func (s *Store) Close() error   { return s.db.Close() }
func (s *Store) NodeID() string { return s.nodeID }

// OrgID returns this node's workspace id.
func (s *Store) OrgID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.orgID
}

// LocalOpCount returns how many ops this node has authored itself. A node that
// has authored none is "unadopted" and may still join another workspace.
func (s *Store) LocalOpCount() (int, error) {
	var n int
	err := s.db.QueryRow("SELECT COUNT(*) FROM oplog WHERE node_id = ?", s.nodeID).Scan(&n)
	return n, err
}

// AdoptOrg makes this node part of the workspace identified by org. It is only
// permitted while the node has authored no ops of its own (a fresh install that
// is pairing into an existing workspace); a node that already has local history
// keeps its own workspace, so two established workspaces can never silently
// merge. Returns true if the org was adopted.
func (s *Store) AdoptOrg(org string) (bool, error) {
	if org == "" {
		return false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if org == s.orgID {
		return false, nil
	}
	var n int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM oplog WHERE node_id = ?", s.nodeID).Scan(&n); err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil // established node: never re-home
	}
	if err := s.SetSetting("org_id", org); err != nil {
		return false, err
	}
	s.orgID = org
	return true, nil
}

// SetOnChange registers a callback fired after every committed mutation.
func (s *Store) SetOnChange(fn func()) { s.onChange = fn }

func (s *Store) fireChange() {
	if s.onChange != nil {
		s.onChange()
	}
}

// ── settings ────────────────────────────────────────────────────────────────

func (s *Store) getSetting(key string) (string, error) {
	var v string
	err := s.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

// GetSetting returns a setting value, or "" if unset.
func (s *Store) GetSetting(key string) string {
	v, _ := s.getSetting(key)
	return v
}

// SetSetting upserts a setting.
func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO settings(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// ── row writes ──────────────────────────────────────────────────────────────

func coerce(k colKind, v any) any {
	if v == nil {
		return nil
	}
	switch k {
	case kindText:
		switch x := v.(type) {
		case string:
			return x
		default:
			b, _ := json.Marshal(x)
			return string(b)
		}
	case kindReal:
		switch x := v.(type) {
		case float64:
			return x
		case string:
			var f float64
			if _, err := fmt.Sscan(x, &f); err == nil {
				return f
			}
			return nil
		case bool:
			if x {
				return 1.0
			}
			return 0.0
		}
	case kindInt:
		switch x := v.(type) {
		case float64:
			return int64(x)
		case bool:
			if x {
				return int64(1)
			}
			return int64(0)
		case string:
			var i int64
			if _, err := fmt.Sscan(x, &i); err == nil {
				return i
			}
			return nil
		}
	}
	return nil
}

// writeRow upserts a row from an op payload inside tx. Mutable tables resolve
// last-writer-wins on the hlc column; insert-only tables ignore conflicts.
func writeRow(tx *sql.Tx, td tableDef, op Op) error {
	var payload map[string]any
	if len(op.Payload) > 0 {
		_ = json.Unmarshal(op.Payload, &payload)
	}

	names := make([]string, len(td.cols))
	placeholders := make([]string, len(td.cols))
	args := []any{op.RowID, op.HLC, boolToInt(op.Deleted), op.OrgID}
	for i, c := range td.cols {
		names[i] = c.name
		placeholders[i] = "?"
		args = append(args, coerce(c.kind, payload[c.name]))
	}

	colList := ""
	valList := ""
	for i, n := range names {
		colList += ", " + n
		valList += ", " + placeholders[i]
	}

	var stmt string
	if td.insertOnly {
		stmt = fmt.Sprintf("INSERT OR IGNORE INTO %s (id, hlc, deleted, org_id%s) VALUES (?, ?, ?, ?%s)",
			td.name, colList, valList)
	} else {
		updates := "hlc = excluded.hlc, deleted = excluded.deleted, org_id = excluded.org_id"
		for _, n := range names {
			updates += fmt.Sprintf(", %s = excluded.%s", n, n)
		}
		stmt = fmt.Sprintf(`INSERT INTO %s (id, hlc, deleted, org_id%s) VALUES (?, ?, ?, ?%s)
			ON CONFLICT(id) DO UPDATE SET %s WHERE excluded.hlc > %s.hlc`,
			td.name, colList, valList, updates, td.name)
	}
	_, err := tx.Exec(stmt, args...)
	return err
}

func appendOplog(tx *sql.Tx, op Op) (bool, error) {
	res, err := tx.Exec(
		`INSERT OR IGNORE INTO oplog (hlc, node_id, org_id, tbl, row_id, deleted, payload)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		op.HLC, op.NodeID, op.OrgID, op.Tbl, op.RowID, boolToInt(op.Deleted), string(op.Payload))
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// LocalPut stamps a fresh HLC and writes row + oplog atomically. It is the
// only entry point for local mutations.
func (s *Store) LocalPut(tbl, rowID string, payload map[string]any, deleted bool) (Op, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	td, ok := tableByName(tbl)
	if !ok {
		return Op{}, fmt.Errorf("unknown table: %s", tbl)
	}
	if td.insertOnly && deleted {
		return Op{}, fmt.Errorf("table %s is insert-only", tbl)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return Op{}, err
	}
	op := Op{HLC: s.clock.Tick(), NodeID: s.nodeID, OrgID: s.orgID, Tbl: tbl, RowID: rowID, Deleted: deleted, Payload: raw}

	tx, err := s.db.Begin()
	if err != nil {
		return Op{}, err
	}
	if err := writeRow(tx, td, op); err != nil {
		tx.Rollback()
		return Op{}, err
	}
	if _, err := appendOplog(tx, op); err != nil {
		tx.Rollback()
		return Op{}, err
	}
	if err := tx.Commit(); err != nil {
		return Op{}, err
	}
	s.fireChange()
	return op, nil
}

// ApplyOps applies remote ops idempotently and returns how many were new.
func (s *Store) ApplyOps(ops []Op) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	fresh := 0
	for _, op := range ops {
		td, ok := tableByName(op.Tbl)
		if !ok {
			continue
		}
		// Isolation boundary: never merge another workspace's ops, even if a
		// shared sync secret let them through the transport. Ops with no org id
		// (legacy/pre-org data) are accepted and inherit ours implicitly.
		if op.OrgID != "" && op.OrgID != s.orgID {
			continue
		}
		isNew, err := appendOplog(tx, op)
		if err != nil {
			tx.Rollback()
			return 0, err
		}
		if isNew {
			if err := writeRow(tx, td, op); err != nil {
				tx.Rollback()
				return 0, err
			}
			s.clock.Observe(op.HLC)
			fresh++
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	if fresh > 0 {
		s.fireChange()
	}
	return fresh, nil
}

// ── version vector + op selection ─────────────────────────────────────────────

// Vector is this node's knowledge: newest hlc seen per origin node.
func (s *Store) Vector() (map[string]string, error) {
	rows, err := s.db.Query("SELECT node_id, MAX(hlc) FROM oplog GROUP BY node_id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var node, hlc string
		if err := rows.Scan(&node, &hlc); err != nil {
			return nil, err
		}
		out[node] = hlc
	}
	return out, rows.Err()
}

// OpsAfter returns ops the holder of remoteVector has not seen, oldest first,
// up to limit.
func (s *Store) OpsAfter(remoteVector map[string]string, limit int) ([]Op, error) {
	rows, err := s.db.Query(
		"SELECT hlc, node_id, org_id, tbl, row_id, deleted, payload FROM oplog ORDER BY hlc ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Op
	for rows.Next() {
		var op Op
		var del int
		var payload string
		if err := rows.Scan(&op.HLC, &op.NodeID, &op.OrgID, &op.Tbl, &op.RowID, &del, &payload); err != nil {
			return nil, err
		}
		op.Deleted = del != 0
		op.Payload = json.RawMessage(payload)
		if seen, ok := remoteVector[op.NodeID]; ok && op.HLC <= seen {
			continue
		}
		out = append(out, op)
		if len(out) >= limit {
			break
		}
	}
	return out, rows.Err()
}

// ── reads ─────────────────────────────────────────────────────────────────────

// ListRows returns all live (or all, if includeDeleted) rows of a table as
// JSON objects keyed by column name.
func (s *Store) ListRows(tbl string, includeDeleted bool) ([]map[string]any, error) {
	if _, ok := tableByName(tbl); !ok {
		return nil, fmt.Errorf("unknown table: %s", tbl)
	}
	where := "WHERE deleted = 0"
	if includeDeleted {
		where = ""
	}
	rows, err := s.db.Query(fmt.Sprintf("SELECT * FROM %s %s ORDER BY id ASC", tbl, where))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	var out []map[string]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		obj := map[string]any{}
		for i, c := range cols {
			obj[c] = normalize(vals[i])
		}
		out = append(out, obj)
	}
	return out, rows.Err()
}

// GetRow returns one row (including soft-deleted) or nil.
func (s *Store) GetRow(tbl, id string) (map[string]any, error) {
	rows, err := s.ListRows(tbl, true)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r["id"] == id {
			return r, nil
		}
	}
	return nil, nil
}

// StockLevel is on-hand quantity for a (variant, branch) pair.
type StockLevel struct {
	VariantID string  `json:"variant_id"`
	BranchID  string  `json:"branch_id"`
	Qty       float64 `json:"qty"`
}

// StockLevels sums the movement ledger per (variant, branch).
func (s *Store) StockLevels() ([]StockLevel, error) {
	rows, err := s.db.Query(
		`SELECT variant_id, branch_id, SUM(qty_delta) FROM stock_movements
		 GROUP BY variant_id, branch_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StockLevel
	for rows.Next() {
		var l StockLevel
		if err := rows.Scan(&l.VariantID, &l.BranchID, &l.Qty); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// MovementsForRef returns movements written against a document (order/PO) of a
// given kind — used to make status transitions idempotent.
func (s *Store) MovementsForRef(refKind, refID, kind string) ([]map[string]any, error) {
	rows, err := s.db.Query(
		`SELECT id, variant_id, branch_id, qty_delta FROM stock_movements
		 WHERE ref_kind = ? AND ref_id = ? AND kind = ?`, refKind, refID, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, variant, branch string
		var delta float64
		if err := rows.Scan(&id, &variant, &branch, &delta); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "variant_id": variant, "branch_id": branch, "qty_delta": delta})
	}
	return out, rows.Err()
}

// ── peers ─────────────────────────────────────────────────────────────────────

// Peer is another branch node.
type Peer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	URL        string `json:"url"`
	Enabled    bool   `json:"enabled"`
	LastSyncAt string `json:"last_sync_at"`
	LastStatus string `json:"last_status"`
}

func (s *Store) ListPeers() ([]Peer, error) {
	rows, err := s.db.Query(
		"SELECT id, name, url, enabled, last_sync_at, last_status FROM peers ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Peer
	for rows.Next() {
		var p Peer
		var en int
		if err := rows.Scan(&p.ID, &p.Name, &p.URL, &en, &p.LastSyncAt, &p.LastStatus); err != nil {
			return nil, err
		}
		p.Enabled = en != 0
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) SavePeer(p Peer) error {
	if p.ID == "" {
		p.ID = NewID()
	}
	_, err := s.db.Exec(
		`INSERT INTO peers (id, name, url, enabled) VALUES (?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, enabled = excluded.enabled`,
		p.ID, p.Name, p.URL, boolToInt(p.Enabled))
	return err
}

func (s *Store) DeletePeer(id string) error {
	_, err := s.db.Exec("DELETE FROM peers WHERE id = ?", id)
	return err
}

func (s *Store) UpdatePeerStatus(id, at, status string) {
	_, _ = s.db.Exec("UPDATE peers SET last_sync_at = ?, last_status = ? WHERE id = ?", at, status, id)
}

// ── helpers ────────────────────────────────────────────────────────────────

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// normalize turns a SQLite driver value into a clean JSON-friendly Go value.
func normalize(v any) any {
	switch x := v.(type) {
	case []byte:
		return string(x)
	case int64:
		return x
	case float64:
		return x
	case string:
		return x
	case nil:
		return nil
	default:
		return fmt.Sprintf("%v", x)
	}
}

// SplitList splits a comma/space/newline separated string, trimming blanks.
func SplitList(s string) []string {
	fields := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == ' ' || r == '\n' || r == '\t' || r == '\r'
	})
	return fields
}
