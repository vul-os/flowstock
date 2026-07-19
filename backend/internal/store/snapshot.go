package store

// Snapshots are the compaction counterpart to the oplog. A snapshot captures
// the full materialized state (every row of every synced table, including
// tombstones) plus the version vector it represents, checksummed so corruption
// is detectable and — once per-node identity exists — signed by the author.
//
// After a snapshot is written, ops it covers can be pruned from the oplog
// (see PruneAckedOps). A brand-new node then catches up by importing the
// snapshot and syncing only the ops minted since.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// SnapshotVersion is the on-disk snapshot format version.
const SnapshotVersion = 1

// Snapshot is a self-describing, verifiable point-in-time state capture.
type Snapshot struct {
	Version   int                        `json:"version"`
	OrgID     string                     `json:"org_id"`
	NodeID    string                     `json:"node_id"`
	CreatedAt string                     `json:"created_at"`
	Vector    map[string]string          `json:"vector"`
	Tables    map[string][]map[string]any `json:"tables"`
	Checksum  string                     `json:"checksum"`            // sha256 hex over the body
	Signature string                     `json:"signature,omitempty"` // Ed25519 hex over the checksum (optional)
	PublicKey string                     `json:"public_key,omitempty"`
}

// checksumBody hashes everything that defines the snapshot's content, excluding
// the checksum/signature fields themselves, so the digest is stable.
func (snap *Snapshot) checksumBody() string {
	body := struct {
		Version   int                         `json:"version"`
		OrgID     string                      `json:"org_id"`
		NodeID    string                      `json:"node_id"`
		CreatedAt string                      `json:"created_at"`
		Vector    map[string]string           `json:"vector"`
		Tables    map[string][]map[string]any `json:"tables"`
	}{snap.Version, snap.OrgID, snap.NodeID, snap.CreatedAt, snap.Vector, snap.Tables}
	b, _ := json.Marshal(body)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Snapshot builds an in-memory snapshot of the current state.
func (s *Store) Snapshot() (*Snapshot, error) {
	vec, err := s.Vector()
	if err != nil {
		return nil, err
	}
	snap := &Snapshot{
		Version:   SnapshotVersion,
		OrgID:     s.OrgID(),
		NodeID:    s.nodeID,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Vector:    vec,
		Tables:    map[string][]map[string]any{},
	}
	for _, td := range tables {
		rows, err := s.ListRows(td.name, true) // include tombstones
		if err != nil {
			return nil, err
		}
		if rows == nil {
			rows = []map[string]any{}
		}
		snap.Tables[td.name] = rows
	}
	snap.Checksum = snap.checksumBody()
	return snap, nil
}

// Verify recomputes the checksum and reports whether the snapshot is intact.
func (snap *Snapshot) Verify() bool {
	return snap.Checksum != "" && snap.Checksum == snap.checksumBody()
}

// WriteSnapshot writes a verified snapshot to path atomically.
func (s *Store) WriteSnapshot(path string) (*Snapshot, error) {
	snap, err := s.Snapshot()
	if err != nil {
		return nil, err
	}
	if err := writeSnapshotFile(path, snap); err != nil {
		return nil, err
	}
	return snap, nil
}

func writeSnapshotFile(path string, snap *Snapshot) error {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	b, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ReadSnapshot loads and integrity-checks a snapshot file.
func ReadSnapshot(path string) (*Snapshot, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var snap Snapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return nil, err
	}
	if !snap.Verify() {
		return nil, fmt.Errorf("snapshot checksum mismatch: file is corrupt or tampered")
	}
	return &snap, nil
}

// ImportSnapshot merges a snapshot's rows into this node (last-writer-wins per
// row, union for insert-only tables) and folds its vector into the snapshot
// floor, so the node counts the snapshot's history as seen without needing the
// individual ops. It refuses a snapshot from a different workspace.
func (s *Store) ImportSnapshot(snap *Snapshot) (int, error) {
	if !snap.Verify() {
		return 0, fmt.Errorf("refusing to import a snapshot that fails its checksum")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if snap.OrgID != "" && s.orgID != "" && snap.OrgID != s.orgID {
		return 0, fmt.Errorf("snapshot belongs to a different workspace")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	applied := 0
	for tbl, rows := range snap.Tables {
		td, ok := tableByName(tbl)
		if !ok {
			continue
		}
		for _, row := range rows {
			op := Op{
				HLC:     asStr(row["hlc"]),
				OrgID:   orDefaultStr(asStr(row["org_id"]), snap.OrgID),
				Tbl:     tbl,
				RowID:   asStr(row["id"]),
				Deleted: asInt(row["deleted"]) != 0,
			}
			payload := map[string]any{}
			for k, v := range row {
				if k == "id" || k == "hlc" || k == "deleted" || k == "org_id" {
					continue
				}
				payload[k] = v
			}
			raw, _ := json.Marshal(payload)
			op.Payload = raw
			if err := writeRow(tx, td, op); err != nil {
				tx.Rollback()
				return 0, err
			}
			applied++
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	// Adopt the org if we were fresh, then count the snapshot's history as seen.
	if s.orgID == "" && snap.OrgID != "" {
		_ = s.SetSetting("org_id", snap.OrgID)
		s.orgID = snap.OrgID
	}
	if err := s.mergeSnapshotFloor(snap.Vector); err != nil {
		return applied, err
	}
	if s.onChange != nil {
		s.onChange()
	}
	return applied, nil
}

func asStr(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", x)
	}
}

func asInt(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	case string:
		var i int64
		fmt.Sscan(x, &i)
		return i
	}
	return 0
}

func orDefaultStr(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
