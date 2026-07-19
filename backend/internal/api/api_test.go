package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"flowstock/backend/internal/store"
	syncpkg "flowstock/backend/internal/sync"
)

// harness is one FlowStock node's HTTP surface backed by a real store, wired
// exactly as cmd/flowstock wires it (minus the auth middleware, which is the
// auth package's own concern).
type harness struct {
	t   *testing.T
	st  *store.Store
	eng *syncpkg.Engine
	srv *Server
	mux *http.ServeMux
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	eng := syncpkg.New(st, func() string { return st.GetSetting("sync_secret") })
	srv := New(st, eng, "test-version")
	srv.SnapshotDir = t.TempDir()
	mux := http.NewServeMux()
	srv.Routes(mux)
	mux.HandleFunc("POST /api/workspace/join", srv.HandleJoin)
	return &harness{t: t, st: st, eng: eng, srv: srv, mux: mux}
}

// do issues a request against the node and returns the recorder.
func (h *harness) do(method, path, body string) *httptest.ResponseRecorder {
	h.t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	h.mux.ServeHTTP(w, req)
	return w
}

// mustJSON asserts a 200 and decodes the response into v.
func (h *harness) mustJSON(w *httptest.ResponseRecorder, v any) {
	h.t.Helper()
	if w.Code != http.StatusOK {
		h.t.Fatalf("expected 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if err := json.Unmarshal(w.Body.Bytes(), v); err != nil {
		h.t.Fatalf("response is not JSON (%v): %s", err, w.Body.String())
	}
}

func (h *harness) setup() map[string]any {
	h.t.Helper()
	var out map[string]any
	h.mustJSON(h.do("POST", "/api/setup", `{"business_name":"Acme","branch_name":"Main"}`), &out)
	return out
}

// putRow creates a row and returns its id.
func (h *harness) putRow(tbl, body string) string {
	h.t.Helper()
	var row map[string]any
	h.mustJSON(h.do("POST", "/api/rows/"+tbl, body), &row)
	id, _ := row["id"].(string)
	if id == "" {
		h.t.Fatalf("%s row came back without an id: %v", tbl, row)
	}
	return id
}

func (h *harness) rows(tbl string) []map[string]any {
	h.t.Helper()
	var out []map[string]any
	h.mustJSON(h.do("GET", "/api/rows/"+tbl, ""), &out)
	return out
}

// ── bootstrap / setup / settings ─────────────────────────────────────────────

func TestBootstrapBeforeAndAfterSetup(t *testing.T) {
	h := newHarness(t)

	var before map[string]any
	h.mustJSON(h.do("GET", "/api/bootstrap", ""), &before)
	if before["initialized"] != false {
		t.Fatal("a fresh install must report initialized=false")
	}
	if before["node_id"] == "" {
		t.Fatal("bootstrap must always report this node's id")
	}
	if before["version"] != "test-version" {
		t.Fatalf("bootstrap should report the build version, got %v", before["version"])
	}
	// Defaults are applied for an unconfigured workspace.
	cur, _ := before["currency"].(map[string]any)
	if cur["code"] != "ZAR" || cur["symbol"] != "R" {
		t.Fatalf("expected the default currency, got %v", cur)
	}
	if before["tax_rate"] != float64(15) {
		t.Fatalf("expected the default tax rate, got %v", before["tax_rate"])
	}

	after := h.setup()
	if after["initialized"] != true {
		t.Fatal("after setup the workspace must report initialized=true")
	}
	if after["business_name"] != "Acme" || after["branch_name"] != "Main" {
		t.Fatalf("setup did not record the workspace details: %v", after)
	}
	// Setup registers the device as a branch row.
	branches := h.rows("branches")
	if len(branches) != 1 || branches[0]["name"] != "Main" {
		t.Fatalf("setup should create exactly one branch, got %v", branches)
	}
	// A sync secret is minted so the node can be paired without a manual step.
	if h.st.GetSetting("sync_secret") == "" {
		t.Fatal("setup must mint a sync secret")
	}
}

func TestSetupRefusesToReinitialize(t *testing.T) {
	h := newHarness(t)
	h.setup()
	secret := h.st.GetSetting("sync_secret")

	w := h.do("POST", "/api/setup", `{"business_name":"Attacker","branch_name":"Theirs"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("re-running setup must be refused, got %d", w.Code)
	}
	if h.st.GetSetting("business_name") != "Acme" {
		t.Fatal("a refused setup must not overwrite the workspace name")
	}
	if h.st.GetSetting("sync_secret") != secret {
		t.Fatal("a refused setup must not rotate the sync secret")
	}
}

// The settings endpoint has an allowlist. Anything outside it — especially the
// sync secret, the workspace id and this node's key material — must be ignored,
// not written.
func TestUpdateSettingsIgnoresNonAllowlistedKeys(t *testing.T) {
	h := newHarness(t)
	h.setup()
	before := map[string]string{}
	protected := []string{"sync_secret", "org_id", "branch_id", "node_privkey", "node_pubkey", "sync_listen"}
	for _, k := range protected {
		before[k] = h.st.GetSetting(k)
	}

	body := `{"business_name":"Renamed","tax_rate":20,"sync_secret":"attacker-secret",
	          "org_id":"attacker-workspace","branch_id":"attacker-branch",
	          "node_privkey":"00","node_pubkey":"00","sync_listen":"1"}`
	var out map[string]any
	h.mustJSON(h.do("POST", "/api/settings", body), &out)

	if h.st.GetSetting("business_name") != "Renamed" {
		t.Fatal("an allowlisted setting should be written")
	}
	if h.st.GetSetting("tax_rate") != "20" {
		t.Fatalf("numeric settings should be stored as plain strings, got %q", h.st.GetSetting("tax_rate"))
	}
	for _, k := range protected {
		if got := h.st.GetSetting(k); got != before[k] {
			t.Fatalf("%s is not allowlisted and must not be writable through /api/settings (was %q, now %q)", k, before[k], got)
		}
	}
}

func TestMalformedBodiesFailClosedWithBadRequest(t *testing.T) {
	h := newHarness(t)
	h.setup()

	cases := []struct{ name, method, path, body string }{
		{"setup not json", "POST", "/api/setup", `nope`},
		{"settings not json", "POST", "/api/settings", `[1,2,3]`},
		{"row truncated", "POST", "/api/rows/products", `{"data":`},
		{"row wrong shape", "POST", "/api/rows/products", `"a string"`},
		{"adjust not json", "POST", "/api/stock/adjust", `{{`},
		{"transfer not json", "POST", "/api/stock/transfer", `{{`},
		{"order not json", "POST", "/api/orders/save", `<xml/>`},
		{"order status not json", "POST", "/api/orders/status", `nope`},
		{"po not json", "POST", "/api/purchase-orders/save", `nope`},
		{"po status not json", "POST", "/api/purchase-orders/status", `nope`},
		{"po receive not json", "POST", "/api/purchase-orders/receive", `nope`},
		{"sync settings not json", "POST", "/api/sync/settings", `nope`},
		{"peer not json", "POST", "/api/peers", `nope`},
		{"test peer not json", "POST", "/api/sync/test", `nope`},
		{"join not json", "POST", "/api/workspace/join", `nope`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := h.do(c.method, c.path, c.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
		})
	}
}

// A body far larger than any real request must be rejected or absorbed — never
// crash the handler.
func TestOversizedBodyIsHandled(t *testing.T) {
	h := newHarness(t)
	h.setup()
	big := `{"data":{"name":"` + strings.Repeat("A", 4<<20) + `"}}`
	w := h.do("POST", "/api/rows/products", big)
	if w.Code != http.StatusOK && w.Code != http.StatusBadRequest {
		t.Fatalf("an oversized body should be accepted or rejected cleanly, got %d", w.Code)
	}
}

// ── generic catalog CRUD ─────────────────────────────────────────────────────

func TestRowsCRUDRoundTrip(t *testing.T) {
	h := newHarness(t)
	h.setup()

	id := h.putRow("products", `{"data":{"name":"Anvil","sku":"ANV-1"}}`)
	rows := h.rows("products")
	if len(rows) != 1 || rows[0]["name"] != "Anvil" {
		t.Fatalf("expected the created product back, got %v", rows)
	}

	// Updating in place keeps one row.
	h.putRow("products", `{"id":"`+id+`","data":{"name":"Anvil MkII","sku":"ANV-1"}}`)
	rows = h.rows("products")
	if len(rows) != 1 || rows[0]["name"] != "Anvil MkII" {
		t.Fatalf("update should modify in place, got %v", rows)
	}

	// Deleting soft-deletes it out of the listing.
	var del map[string]any
	h.mustJSON(h.do("DELETE", "/api/rows/products/"+id, ""), &del)
	if len(h.rows("products")) != 0 {
		t.Fatal("a deleted product should not be listed")
	}
	// Deleting again is idempotent, not an error.
	if w := h.do("DELETE", "/api/rows/products/"+id, ""); w.Code != http.StatusOK {
		t.Fatalf("deleting a missing row should be a no-op 200, got %d", w.Code)
	}
}

func TestUnknownTableIsRejected(t *testing.T) {
	h := newHarness(t)
	h.setup()
	for _, c := range []struct{ method, path, body string }{
		{"GET", "/api/rows/sqlite_master", ""},
		{"GET", "/api/rows/settings", ""},
		{"GET", "/api/rows/peers", ""},
		{"POST", "/api/rows/settings", `{"data":{"key":"sync_secret","value":"pwned"}}`},
		{"POST", "/api/rows/oplog", `{"data":{}}`},
		{"DELETE", "/api/rows/settings/sync_secret", ""},
	} {
		w := h.do(c.method, c.path, c.body)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s %s: an unknown/internal table must be rejected, got %d: %s",
				c.method, c.path, w.Code, strings.TrimSpace(w.Body.String()))
		}
	}
	// The secret really is untouched.
	if h.st.GetSetting("sync_secret") == "pwned" {
		t.Fatal("generic row CRUD must never reach the settings table")
	}
}

// stock_movements and po_receipts are append-only ledgers written by domain
// operations. Generic CRUD must not be able to forge or erase stock history.
func TestLedgerTablesAreNotWritableThroughGenericCRUD(t *testing.T) {
	h := newHarness(t)
	h.setup()
	branch := h.rows("branches")[0]["id"].(string)
	variant := h.putRow("product_variants", `{"data":{"name":"Anvil / L"}}`)
	h.mustJSON(h.do("POST", "/api/stock/adjust",
		`{"variant_id":"`+variant+`","branch_id":"`+branch+`","qty_delta":10,"kind":"receive"}`), &map[string]any{})

	movements := h.rows("stock_movements")
	if len(movements) != 1 {
		t.Fatalf("expected one ledger row from the adjustment, got %d", len(movements))
	}
	moveID := movements[0]["id"].(string)

	for _, tbl := range []string{"stock_movements", "po_receipts"} {
		if w := h.do("POST", "/api/rows/"+tbl, `{"data":{"variant_id":"x","qty_delta":9999}}`); w.Code != http.StatusBadRequest {
			t.Fatalf("forging a %s row must be refused, got %d", tbl, w.Code)
		}
		if w := h.do("DELETE", "/api/rows/"+tbl+"/"+moveID, ""); w.Code != http.StatusBadRequest {
			t.Fatalf("erasing a %s row must be refused, got %d", tbl, w.Code)
		}
	}
	if len(h.rows("stock_movements")) != 1 {
		t.Fatal("the ledger must be unchanged after the refused writes")
	}
	if got := stockOnHand(t, h, variant); got != 10 {
		t.Fatalf("stock should still be 10, got %v", got)
	}
}

func stockOnHand(t *testing.T, h *harness, variant string) float64 {
	t.Helper()
	var levels []store.StockLevel
	h.mustJSON(h.do("GET", "/api/stock/levels", ""), &levels)
	var total float64
	for _, l := range levels {
		if l.VariantID == variant {
			total += l.Qty
		}
	}
	return total
}

// Listing empty tables must answer [] rather than null, which the UI iterates
// over directly.
func TestEmptyCollectionsSerializeAsArrays(t *testing.T) {
	h := newHarness(t)
	for _, path := range []string{"/api/rows/products", "/api/stock/levels", "/api/peers"} {
		w := h.do("GET", path, "")
		if w.Code != http.StatusOK {
			t.Fatalf("%s: got %d", path, w.Code)
		}
		if got := strings.TrimSpace(w.Body.String()); got != "[]" {
			t.Fatalf("%s: expected [], got %s", path, got)
		}
	}
}
