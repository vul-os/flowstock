package store

import (
	"path/filepath"
	"testing"
	"time"
)

func newNode(t *testing.T, name string) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), name+".db"))
	if err != nil {
		t.Fatalf("open %s: %v", name, err)
	}
	// Force a stable, distinct node id per logical node, and a shared workspace
	// id so nodes in the same test belong to one workspace and their ops merge.
	s.nodeID = name
	s.clock = NewHLC(name, "")
	s.orgID = "test-org"
	_ = s.SetSetting("org_id", "test-org")
	t.Cleanup(func() { s.Close() })
	return s
}

func put(t *testing.T, s *Store, tbl, id string, payload map[string]any, del bool) {
	t.Helper()
	if _, err := s.LocalPut(tbl, id, payload, del); err != nil {
		t.Fatalf("put %s/%s: %v", tbl, id, err)
	}
}

// syncRound: b pulls from a, then a pulls from b (a full bidirectional round).
func syncRound(t *testing.T, a, b *Store) {
	t.Helper()
	vb, _ := b.Vector()
	ops, _ := a.OpsAfter(vb, 100000)
	if _, err := b.ApplyOps(ops); err != nil {
		t.Fatal(err)
	}
	va, _ := a.Vector()
	ops, _ = b.OpsAfter(va, 100000)
	if _, err := a.ApplyOps(ops); err != nil {
		t.Fatal(err)
	}
}

func stock(t *testing.T, s *Store, variant string) float64 {
	t.Helper()
	levels, err := s.StockLevels()
	if err != nil {
		t.Fatal(err)
	}
	var total float64
	for _, l := range levels {
		if l.VariantID == variant {
			total += l.Qty
		}
	}
	return total
}

func TestHLCMonotonic(t *testing.T) {
	c := NewHLC("A", "")
	prev := c.Tick()
	for i := 0; i < 1000; i++ {
		next := c.Tick()
		if next <= prev {
			t.Fatalf("%s not > %s", next, prev)
		}
		prev = next
	}
}

func TestLWWRowMerge(t *testing.T) {
	a := newNode(t, "A")
	b := newNode(t, "B")
	put(t, a, "products", "p1", map[string]any{"name": "Bolt M6"}, false)
	syncRound(t, a, b)

	put(t, a, "products", "p1", map[string]any{"name": "Bolt M6 (A)"}, false)
	time.Sleep(3 * time.Millisecond)
	put(t, b, "products", "p1", map[string]any{"name": "Bolt M6 (B)"}, false)
	syncRound(t, a, b)

	ra, _ := a.GetRow("products", "p1")
	rb, _ := b.GetRow("products", "p1")
	if ra["name"] != rb["name"] {
		t.Fatalf("did not converge: %v vs %v", ra["name"], rb["name"])
	}
	if ra["name"] != "Bolt M6 (B)" {
		t.Fatalf("expected later write B to win, got %v", ra["name"])
	}
}

func TestOfflineStockUnionMerge(t *testing.T) {
	a := newNode(t, "A")
	b := newNode(t, "B")
	// Both branches trade the same item while offline.
	put(t, a, "stock_movements", "m1", map[string]any{"variant_id": "v1", "branch_id": "bA", "qty_delta": -3.0, "kind": "sale"}, false)
	put(t, a, "stock_movements", "m2", map[string]any{"variant_id": "v1", "branch_id": "bA", "qty_delta": 10.0, "kind": "receive"}, false)
	put(t, b, "stock_movements", "m3", map[string]any{"variant_id": "v1", "branch_id": "bB", "qty_delta": -2.0, "kind": "sale"}, false)
	syncRound(t, a, b)
	syncRound(t, a, b) // idempotent
	if got := stock(t, a, "v1"); got != 5.0 {
		t.Fatalf("A stock = %v, want 5", got)
	}
	if got := stock(t, b, "v1"); got != 5.0 {
		t.Fatalf("B stock = %v, want 5", got)
	}
}

func TestSoftDeleteReplicates(t *testing.T) {
	a := newNode(t, "A")
	b := newNode(t, "B")
	put(t, a, "customers", "c1", map[string]any{"name": "Acme"}, false)
	syncRound(t, a, b)
	put(t, b, "customers", "c1", map[string]any{"name": "Acme"}, true)
	syncRound(t, a, b)
	rows, _ := a.ListRows("customers", false)
	if len(rows) != 0 {
		t.Fatalf("expected deletion to replicate, got %d live rows", len(rows))
	}
}

func TestThreeNodesConvergeViaHub(t *testing.T) {
	a := newNode(t, "A")
	b := newNode(t, "B")
	c := newNode(t, "C")
	// A and C never talk directly; B relays.
	put(t, a, "stock_movements", "ma", map[string]any{"variant_id": "v9", "branch_id": "bA", "qty_delta": 4.0, "kind": "receive"}, false)
	put(t, c, "stock_movements", "mc", map[string]any{"variant_id": "v9", "branch_id": "bC", "qty_delta": -1.0, "kind": "sale"}, false)
	syncRound(t, a, b)
	syncRound(t, b, c)
	syncRound(t, a, b)
	for _, n := range []*Store{a, b, c} {
		if got := stock(t, n, "v9"); got != 3.0 {
			t.Fatalf("node stock = %v, want 3", got)
		}
	}
}

func TestCrossOrgOpsAreRejected(t *testing.T) {
	a := newNode(t, "A")
	b := newNode(t, "B")
	// B belongs to a different workspace than A.
	b.orgID = "other-org"
	_ = b.SetSetting("org_id", "other-org")

	put(t, a, "products", "p1", map[string]any{"name": "A's product"}, false)
	put(t, a, "stock_movements", "m1", map[string]any{"variant_id": "v1", "branch_id": "bA", "qty_delta": 5.0, "kind": "receive"}, false)

	// Feed A's ops directly to B. Different-org ops must be dropped, not merged.
	va, _ := b.Vector()
	ops, _ := a.OpsAfter(va, 100000)
	applied, err := b.ApplyOps(ops)
	if err != nil {
		t.Fatal(err)
	}
	if applied != 0 {
		t.Fatalf("expected 0 cross-org ops applied, got %d", applied)
	}
	if rows, _ := b.ListRows("products", false); len(rows) != 0 {
		t.Fatalf("cross-org product leaked into B: %d rows", len(rows))
	}
	if got := stock(t, b, "v1"); got != 0 {
		t.Fatalf("cross-org stock leaked into B: %v", got)
	}
}

func TestFreshNodeAdoptsOrgButEstablishedDoesNot(t *testing.T) {
	// A fresh node (no authored ops) adopts the workspace it joins.
	fresh := newNode(t, "F")
	fresh.orgID = "F-own"
	_ = fresh.SetSetting("org_id", "F-own")
	adopted, err := fresh.AdoptOrg("workspace-1")
	if err != nil {
		t.Fatal(err)
	}
	if !adopted || fresh.OrgID() != "workspace-1" {
		t.Fatalf("fresh node should adopt: adopted=%v org=%s", adopted, fresh.OrgID())
	}

	// An established node (has authored ops) refuses to re-home.
	est := newNode(t, "E")
	put(t, est, "products", "p1", map[string]any{"name": "x"}, false)
	adopted, err = est.AdoptOrg("workspace-2")
	if err != nil {
		t.Fatal(err)
	}
	if adopted || est.OrgID() != "test-org" {
		t.Fatalf("established node must not re-home: adopted=%v org=%s", adopted, est.OrgID())
	}
}

func TestStaleOpDoesNotClobber(t *testing.T) {
	a := newNode(t, "A")
	b := newNode(t, "B")
	old, _ := a.LocalPut("categories", "cat1", map[string]any{"name": "Old"}, false)
	time.Sleep(3 * time.Millisecond)
	put(t, b, "categories", "cat1", map[string]any{"name": "New"}, false)
	if _, err := b.ApplyOps([]Op{old}); err != nil {
		t.Fatal(err)
	}
	row, _ := b.GetRow("categories", "cat1")
	if row["name"] != "New" {
		t.Fatalf("stale op clobbered newer row: %v", row["name"])
	}
}
