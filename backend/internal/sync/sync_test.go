package sync

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"flowstock/backend/internal/store"
)

// node spins up a store plus an httptest server exposing its sync handler,
// mimicking a real branch reachable over HTTP.
type node struct {
	st     *store.Store
	eng    *Engine
	server *httptest.Server
}

func newNode(t *testing.T, name, secret string) *node {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), name+".db"))
	if err != nil {
		t.Fatalf("open %s: %v", name, err)
	}
	_ = st.SetSetting("sync_secret", secret)
	_ = st.SetSetting("branch_id", "branch-"+name)
	_ = st.SetSetting("branch_name", "Branch "+name)
	eng := New(st, func() string { return st.GetSetting("sync_secret") })
	srv := httptest.NewServer(eng.Handler())
	t.Cleanup(func() { srv.Close(); st.Close() })
	return &node{st: st, eng: eng, server: srv}
}

func put(t *testing.T, st *store.Store, tbl, id string, payload map[string]any) {
	t.Helper()
	if _, err := st.LocalPut(tbl, id, payload, false); err != nil {
		t.Fatalf("put: %v", err)
	}
}

func stock(t *testing.T, st *store.Store, variant string) float64 {
	t.Helper()
	levels, _ := st.StockLevels()
	var total float64
	for _, l := range levels {
		if l.VariantID == variant {
			total += l.Qty
		}
	}
	return total
}

func TestTwoBranchesSyncOverHTTPAndSurviveOffline(t *testing.T) {
	ctx := context.Background()
	a := newNode(t, "A", "shared-secret")
	b := newNode(t, "B", "shared-secret")

	// Round 1: A builds catalog + stock; B sells while never having synced.
	put(t, a.st, "products", "p1", map[string]any{"name": "Hex Bolts M6"})
	put(t, a.st, "product_variants", "v1", map[string]any{"product_id": "p1", "sku": "FAS-1", "price": 189.0})
	put(t, a.st, "stock_movements", "mA1", map[string]any{"variant_id": "v1", "branch_id": "brA", "qty_delta": 100.0, "kind": "receive"})
	put(t, b.st, "stock_movements", "mB1", map[string]any{"variant_id": "v1", "branch_id": "brB", "qty_delta": -7.0, "kind": "sale"})

	res := b.eng.SyncPeer(ctx, "peerA", a.server.URL)
	if !res.OK {
		t.Fatalf("sync failed: %s", res.Error)
	}
	if got := stock(t, a.st, "v1"); got != 93.0 {
		t.Fatalf("A stock = %v, want 93", got)
	}
	if got := stock(t, b.st, "v1"); got != 93.0 {
		t.Fatalf("B stock = %v, want 93", got)
	}

	// Round 2 ("offline week"): both keep writing without contact.
	put(t, a.st, "stock_movements", "mA2", map[string]any{"variant_id": "v1", "branch_id": "brA", "qty_delta": -20.0, "kind": "sale"})
	put(t, a.st, "customers", "c1", map[string]any{"name": "Mokoena Construction"})
	put(t, b.st, "stock_movements", "mB2", map[string]any{"variant_id": "v1", "branch_id": "brB", "qty_delta": -5.0, "kind": "sale"})
	time.Sleep(3 * time.Millisecond)
	put(t, b.st, "products", "p1", map[string]any{"name": "Hex Bolts M6 (renamed at B)"})

	if got := stock(t, a.st, "v1"); got != 73.0 {
		t.Fatalf("A offline view = %v, want 73", got)
	}
	if got := stock(t, b.st, "v1"); got != 88.0 {
		t.Fatalf("B offline view = %v, want 88", got)
	}

	// Reconnect: one round converges both.
	res = b.eng.SyncPeer(ctx, "peerA", a.server.URL)
	if !res.OK {
		t.Fatalf("reconnect sync failed: %s", res.Error)
	}
	if got := stock(t, a.st, "v1"); got != 68.0 {
		t.Fatalf("A converged stock = %v, want 68", got)
	}
	if got := stock(t, b.st, "v1"); got != 68.0 {
		t.Fatalf("B converged stock = %v, want 68", got)
	}
	for _, n := range []*node{a, b} {
		row, _ := n.st.GetRow("products", "p1")
		if row["name"] != "Hex Bolts M6 (renamed at B)" {
			t.Fatalf("LWW rename did not win: %v", row["name"])
		}
	}

	// Idempotence.
	res = b.eng.SyncPeer(ctx, "peerA", a.server.URL)
	if res.Pushed != 0 || res.Pulled != 0 {
		t.Fatalf("expected a quiet round, got pushed=%d pulled=%d", res.Pushed, res.Pulled)
	}

	// Auth: wrong secret is rejected.
	_ = b.st.SetSetting("sync_secret", "wrong")
	res = b.eng.SyncPeer(ctx, "peerA", a.server.URL)
	if res.OK {
		t.Fatal("sync with wrong secret must fail")
	}

	// No-secret listener rejects (fail closed).
	_ = a.st.SetSetting("sync_secret", "")
	req, _ := http.NewRequest("GET", a.server.URL+"/api/sync/vector", nil)
	req.Header.Set("Authorization", "Bearer anything")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no-secret listener should 401, got %d", resp.StatusCode)
	}
}
