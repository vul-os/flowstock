package store

import (
	"path/filepath"
	"testing"
)

// TestFreshNodeIDIsThePublicKey: FlowStock breaks an exact HLC tie on node id
// and the substrate engine breaks it on the author's public key. Both converge,
// but given identical history they can pick different winners, which is what
// forces substrate adoption to be a deployment-wide switch. Making the two
// values the same removes the divergence at its source.
func TestFreshNodeIDIsThePublicKey(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "f.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	pub := s.PublicKeyHex()
	if pub == "" {
		t.Fatal("no identity was created")
	}
	if s.NodeID() != pub {
		t.Fatalf("a fresh node id should be its public key:\n  node id = %s\n  pubkey  = %s", s.NodeID(), pub)
	}
}

// TestExistingNodeKeepsItsID is the migration-safety half. An established node's
// peers enrolled its old id at pairing and every oplog row is keyed by it, so
// rewriting it would invalidate the mesh and the history together. Those nodes
// keep the id — and the tie-break — they already had.
func TestExistingNodeKeepsItsID(t *testing.T) {
	path := filepath.Join(t.TempDir(), "f.db")

	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	// Simulate a database created before this change: a ULID node id.
	legacy := NewID()
	if err := s.SetSetting("node_id", legacy); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()

	if reopened.NodeID() != legacy {
		t.Fatalf("an existing node's id was rewritten: %s -> %s\nthis would orphan every enrolled peer and every oplog row", legacy, reopened.NodeID())
	}
}

// TestNodeIDIsStableAcrossReopen guards the obvious catastrophe: an id derived
// at open time must come from the persisted key, not be regenerated.
func TestNodeIDIsStableAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "f.db")
	first, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	id := first.NodeID()
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}

	second, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	if second.NodeID() != id {
		t.Fatalf("node id changed across reopen: %s -> %s", id, second.NodeID())
	}
}
