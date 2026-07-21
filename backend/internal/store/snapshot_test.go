package store

import (
	"path/filepath"
	"testing"
)

func (s *Store) oplogCount() (int, error) {
	var n int
	err := s.db.QueryRow("SELECT COUNT(*) FROM oplog").Scan(&n)
	return n, err
}

func TestSnapshotChecksumRoundTrip(t *testing.T) {
	a := newNode(t, "A")
	put(t, a, "products", "p1", map[string]any{"name": "Widget"}, false)
	put(t, a, "stock_movements", "m1", map[string]any{"variant_id": "v1", "branch_id": "b", "qty_delta": 7.0, "kind": "receive"}, false)

	path := filepath.Join(t.TempDir(), "snapshot.json")
	snap, err := a.WriteSnapshot(path)
	if err != nil {
		t.Fatal(err)
	}
	if !snap.Verify() {
		t.Fatal("fresh snapshot must verify")
	}

	loaded, err := ReadSnapshot(path)
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	if loaded.Checksum != snap.Checksum || loaded.OrgID != "test-org" {
		t.Fatalf("round-trip mismatch")
	}

	// Tamper detection.
	loaded.Tables["products"][0]["name"] = "Tampered"
	if loaded.Verify() {
		t.Fatal("tampered snapshot must fail verification")
	}
}

func TestPruneOnlyWhatAllPeersAcked(t *testing.T) {
	a := newNode(t, "A")
	put(t, a, "products", "p1", map[string]any{"name": "one"}, false)
	put(t, a, "products", "p2", map[string]any{"name": "two"}, false)
	put(t, a, "products", "p3", map[string]any{"name": "three"}, false)

	before, _ := a.oplogCount()

	// No peers → conservative no-op.
	if n, err := a.PruneAckedOps(); err != nil || n != 0 {
		t.Fatalf("prune with no peers should be 0, got %d err %v", n, err)
	}

	// Register a peer that has acknowledged only up to the 2nd op.
	if err := a.SavePeer(Peer{ID: "peer1", Name: "P", URL: "http://x", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	vec, _ := a.Vector()
	full := vec["A"] // newest hlc A has authored
	// Craft an ack vector that stops one op short of the newest.
	ops, _ := a.OwnOpsAfter("")
	if len(ops) < 3 {
		t.Fatalf("expected 3 authored ops, got %d", len(ops))
	}
	ackHLC := ops[1].HLC // acknowledged the first two only
	a.SavePeerVector("peer1", map[string]string{"A": ackHLC})

	vecBefore, _ := a.Vector()
	pruned, err := a.PruneAckedOps()
	if err != nil {
		t.Fatal(err)
	}
	if pruned == 0 {
		t.Fatal("expected at least one op pruned")
	}
	after, _ := a.oplogCount()
	if after >= before {
		t.Fatalf("oplog did not shrink: before %d after %d", before, after)
	}

	// The newest op is never pruned, and the version vector must not regress.
	vecAfter, _ := a.Vector()
	if vecAfter["A"] != vecBefore["A"] || vecAfter["A"] != full {
		t.Fatalf("vector regressed after prune: %s -> %s (full %s)", vecBefore["A"], vecAfter["A"], full)
	}

	// The pruned op that the peer had NOT acked (the 3rd) must still be servable.
	served, _ := a.OpsAfter(map[string]string{"A": ackHLC}, 100)
	if len(served) == 0 {
		t.Fatal("the un-acked newest op should still be servable after prune")
	}
}

func TestSnapshotImportRebuildsLateJoiner(t *testing.T) {
	a := newNode(t, "A")
	put(t, a, "products", "p1", map[string]any{"name": "Widget"}, false)
	put(t, a, "customers", "c1", map[string]any{"name": "Acme"}, false)
	put(t, a, "stock_movements", "m1", map[string]any{"variant_id": "v1", "branch_id": "b", "qty_delta": 9.0, "kind": "receive"}, false)
	snap, err := a.Snapshot()
	if err != nil {
		t.Fatal(err)
	}

	// A brand-new node imports the snapshot alone and reconstructs the state.
	j := newNode(t, "J")
	n, err := j.ImportSnapshot(snap)
	if err != nil {
		t.Fatal(err)
	}
	if n == 0 {
		t.Fatal("expected rows imported")
	}
	if got := stock(t, j, "v1"); got != 9.0 {
		t.Fatalf("joiner stock from snapshot = %v, want 9", got)
	}
	if row, _ := j.GetRow("products", "p1"); row["name"] != "Widget" {
		t.Fatalf("joiner catalog from snapshot missing: %v", row)
	}
	// The snapshot's vector is folded into the floor, so the joiner counts A's
	// history as already seen and would only pull ops minted afterwards.
	jv, _ := j.Vector()
	if jv["A"] < snap.Vector["A"] {
		t.Fatalf("joiner vector floor not applied: %s < %s", jv["A"], snap.Vector["A"])
	}
}

// A snapshot file's per-row hlc is exactly as untrusted as an op's (see
// TestApplyOpsRejectsOutOfWidthRemoteHLC in store_test.go): writeRow's LWW
// guard compares it lexically, so a row whose hlc doesn't round-trip through
// ParseHLC must be skipped rather than imported. The checksum only proves the
// file is internally consistent, not that whoever wrote hlc chose a
// well-formed value.
func TestSnapshotImportRejectsOutOfWidthRowHLC(t *testing.T) {
	a := newNode(t, "A")
	put(t, a, "products", "p1", map[string]any{"name": "Widget"}, false)
	snap, err := a.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	snap.Tables["products"][0]["hlc"] = "1700000000000-10000-A" // counter one past its width
	snap.Checksum = snap.checksumBody()                         // keep the file internally consistent
	if !snap.Verify() {
		t.Fatal("precondition: the tampered snapshot should still verify its own checksum")
	}

	j := newNode(t, "J")
	n, err := j.ImportSnapshot(snap)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("expected the malformed row to be skipped, got %d applied", n)
	}
	if rows, _ := j.ListRows("products", true); len(rows) != 0 {
		t.Fatalf("a malformed row hlc must never enter the row table, got %d rows", len(rows))
	}
}
