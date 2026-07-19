package sync

import (
	"os"
	"path/filepath"
	"testing"
)

// TestFolderSyncTwoNodesViaSharedDir proves the "files as transport" path: two
// nodes that never talk over HTTP converge by reading and writing a shared
// folder (a Dropbox/Syncthing/USB stand-in), each writing only its own file.
func TestFolderSyncTwoNodesViaSharedDir(t *testing.T) {
	dir := t.TempDir() // stands in for the shared/synced folder

	a := newNode(t, "A", "secret")
	b := newNode(t, "B", "secret")

	// Both branches trade offline; neither has a peer configured.
	put(t, a.st, "products", "p1", map[string]any{"name": "Rebar 12mm"})
	put(t, a.st, "stock_movements", "mA", map[string]any{"variant_id": "v1", "branch_id": "brA", "qty_delta": 50.0, "kind": "receive"})
	put(t, b.st, "stock_movements", "mB", map[string]any{"variant_id": "v1", "branch_id": "brB", "qty_delta": -8.0, "kind": "sale"})

	// Round 1: each node exports its own file and imports the other's.
	if r := a.eng.FolderSync(dir); r.Error != "" {
		t.Fatalf("A folder sync: %s", r.Error)
	}
	if r := b.eng.FolderSync(dir); r.Error != "" {
		t.Fatalf("B folder sync: %s", r.Error)
	}
	// A wrote before B imported, so A must run once more to pick up B's file.
	if r := a.eng.FolderSync(dir); r.Error != "" {
		t.Fatalf("A folder sync 2: %s", r.Error)
	}

	// One file per writer, single-writer-per-file (so file-sync never conflicts).
	entries, _ := os.ReadDir(dir)
	jsonl := 0
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".jsonl" {
			jsonl++
		}
	}
	if jsonl != 2 {
		t.Fatalf("expected one export file per writer (2), found %d", jsonl)
	}

	if got := stock(t, a.st, "v1"); got != 42.0 {
		t.Fatalf("A stock via folder = %v, want 42", got)
	}
	if got := stock(t, b.st, "v1"); got != 42.0 {
		t.Fatalf("B stock via folder = %v, want 42", got)
	}
	if row, _ := b.st.GetRow("products", "p1"); row["name"] != "Rebar 12mm" {
		t.Fatalf("catalog did not replicate via folder: %v", row["name"])
	}

	// Incremental + idempotent: a fresh write exports, and a quiet round is a
	// no-op (nothing new imported).
	put(t, a.st, "products", "p2", map[string]any{"name": "Wire mesh"})
	_ = a.eng.FolderSync(dir)
	if r := b.eng.FolderSync(dir); r.Imported != 1 {
		t.Fatalf("expected 1 new op imported at B, got %d", r.Imported)
	}
	if r := b.eng.FolderSync(dir); r.Imported != 0 {
		t.Fatalf("expected a quiet folder round, imported %d", r.Imported)
	}

	// Late joiner: a brand-new node pointed only at the folder replays the full
	// history from the files alone.
	c := newNode(t, "C", "secret")
	if r := c.eng.FolderSync(dir); r.Error != "" {
		t.Fatalf("C folder sync: %s", r.Error)
	}
	if got := stock(t, c.st, "v1"); got != 42.0 {
		t.Fatalf("late joiner C stock via folder = %v, want 42", got)
	}
}
