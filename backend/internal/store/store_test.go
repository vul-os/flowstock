package store

import (
	"encoding/json"
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

func TestConcurrentPOReceivesConverge(t *testing.T) {
	a := newNode(t, "A")
	b := newNode(t, "B")
	// One PO line item, ordered 10. Both branches receive a partial shipment
	// while offline: A takes in 6, B takes in 4.
	put(t, a, "purchase_order_items", "poi1", map[string]any{
		"purchase_order_id": "po1", "item_type": "product", "product_variant_id": "v1", "quantity": 10.0,
	}, false)
	syncRound(t, a, b)

	put(t, a, "po_receipts", "r1", map[string]any{
		"purchase_order_id": "po1", "po_item_id": "poi1", "variant_id": "v1", "branch_id": "bA", "qty": 6.0,
	}, false)
	put(t, b, "po_receipts", "r2", map[string]any{
		"purchase_order_id": "po1", "po_item_id": "poi1", "variant_id": "v1", "branch_id": "bB", "qty": 4.0,
	}, false)

	syncRound(t, a, b)
	syncRound(t, a, b) // idempotent

	// Both branches must agree the line is fully received (6 + 4), where a
	// stored LWW received_quantity counter would have kept only 6 or only 4.
	for _, n := range []*Store{a, b} {
		got, err := n.ReceivedByItem()
		if err != nil {
			t.Fatal(err)
		}
		if got["poi1"] != 10.0 {
			t.Fatalf("received for poi1 = %v, want 10 (union of both partial receipts)", got["poi1"])
		}
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

// ApplyOps is where an op authored by another node — a JSON body this node
// authenticates but does not itself format — crosses into the oplog's and the
// row table's hlc columns, both of which are compared lexically (MAX(hlc);
// writeRow's "WHERE excluded.hlc > tbl.hlc" guard). A peer's op.HLC that
// doesn't round-trip through ParseHLC must never reach either column: it is
// exactly the string ParseHLC's fixed-width rejection (hlc.go) exists to keep
// out of that ordered domain — the same network-reachable hazard 0c6beba fixed
// for the local clock's Observe path, reopened here at a second entry point
// that fix didn't touch.
func TestApplyOpsRejectsOutOfWidthRemoteHLC(t *testing.T) {
	b := newNode(t, "B")
	for name, badHLC := range map[string]string{
		"counter one past its width": "1700000000000-10000-A",
		"wall one digit too wide":    "10000000000000-0001-A",
		"negative wall":              "-0001-0001-A",
		"unparseable garbage":        "not-an-hlc-at-all",
	} {
		t.Run(name, func(t *testing.T) {
			op := Op{
				HLC: badHLC, NodeID: "A", OrgID: "test-org",
				Tbl: "products", RowID: "bad-" + name,
				Payload: json.RawMessage(`{"name":"should not land"}`),
			}
			applied, err := b.ApplyOps([]Op{op})
			if err != nil {
				t.Fatalf("ApplyOps should skip a malformed op, not error: %v", err)
			}
			if applied != 0 {
				t.Fatalf("expected the malformed op to be skipped, got applied=%d", applied)
			}
			if n, err := b.oplogCount(); err != nil || n != 0 {
				t.Fatalf("a malformed hlc must never enter the oplog, got %d rows (err %v)", n, err)
			}
			if rows, _ := b.ListRows("products", true); len(rows) != 0 {
				t.Fatalf("a malformed hlc must never enter the row table, got %d rows", len(rows))
			}
		})
	}
}

// The companion positive case: a well-formed remote op (right at the width
// boundary) is still accepted, so the rejection above is about malformed
// strings specifically, not a regression that blocks legitimate high values.
func TestApplyOpsAcceptsWellFormedRemoteHLCAtTheWidthBoundary(t *testing.T) {
	b := newNode(t, "B")
	op := Op{
		HLC: "9999999999999-ffff-A", NodeID: "A", OrgID: "test-org",
		Tbl: "products", RowID: "boundary",
		Payload: json.RawMessage(`{"name":"at the edge"}`),
	}
	applied, err := b.ApplyOps([]Op{op})
	if err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("expected the well-formed boundary op to apply, got applied=%d", applied)
	}
	row, _ := b.GetRow("products", "boundary")
	if row == nil {
		t.Fatal("the accepted op did not land in the row table")
	}
}
