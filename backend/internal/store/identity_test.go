package store

import (
	"path/filepath"
	"testing"
)

func TestNodeIdentityGeneratedAndStable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "id.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	pub := s.PublicKeyHex()
	if len(pub) != 64 { // 32-byte Ed25519 public key, hex
		t.Fatalf("expected a 64-hex-char public key, got %q", pub)
	}
	msg := []byte("stock batch")
	sig := s.Sign(msg)
	if !VerifySig(pub, msg, sig) {
		t.Fatal("node's own signature must verify")
	}
	if VerifySig(pub, []byte("tampered"), sig) {
		t.Fatal("signature must not verify against different bytes")
	}
	s.Close()

	// Reopening the same database keeps the same identity.
	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if s2.PublicKeyHex() != pub {
		t.Fatalf("identity changed across reopen: %s vs %s", s2.PublicKeyHex(), pub)
	}
}

func TestSnapshotIsSigned(t *testing.T) {
	a := newNode(t, "A") // newNode forces node id/org but keeps a real keypair
	put(t, a, "products", "p1", map[string]any{"name": "Signed thing"}, false)
	path := filepath.Join(t.TempDir(), "snap.json")
	snap, err := a.WriteSnapshot(path)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Signature == "" || snap.PublicKey == "" {
		t.Fatal("written snapshot should carry a signature and public key")
	}
	loaded, err := ReadSnapshot(path)
	if err != nil {
		t.Fatal(err)
	}
	if !loaded.VerifySignature() {
		t.Fatal("snapshot signature must verify")
	}
	// Flip the last checksum hex digit to a guaranteed-different value (using
	// "0" unconditionally would be a no-op ~1/16 of the time).
	last := loaded.Checksum[len(loaded.Checksum)-1]
	repl := byte('0')
	if last == '0' {
		repl = '1'
	}
	loaded.Checksum = loaded.Checksum[:len(loaded.Checksum)-1] + string(repl)
	if loaded.VerifySignature() {
		t.Fatal("a mutated checksum must break signature verification")
	}
}
