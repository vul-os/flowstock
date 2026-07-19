package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"flowstock/backend/internal/store"
)

func TestPeerPublicKeyLearnedOnSync(t *testing.T) {
	ctx := context.Background()
	a := newNode(t, "A", "secret")
	b := newNode(t, "B", "secret")

	// B records A as a peer and syncs; A's public key is learned in the handshake.
	if err := b.st.SavePeer(store.Peer{ID: "peerA", Name: "A", URL: a.server.URL, Enabled: true}); err != nil {
		t.Fatal(err)
	}
	res := b.eng.SyncPeer(ctx, "peerA", a.server.URL)
	if !res.OK {
		t.Fatalf("sync failed: %s", res.Error)
	}
	got := b.st.PeerPubkey("peerA")
	if got == "" || got != a.st.PublicKeyHex() {
		t.Fatalf("peer pubkey not learned: got %q want %q", got, a.st.PublicKeyHex())
	}
}

func TestTamperedOpBatchRejected(t *testing.T) {
	a := newNode(t, "A", "secret")
	b := newNode(t, "B", "secret")

	put(t, b.st, "products", "p1", map[string]any{"name": "legit"})
	ops, _ := b.st.OpsAfter(map[string]string{}, 100)

	// Sign the batch, then tamper the payload after signing.
	body, _ := json.Marshal(ops)
	sig := b.st.Sign(body)
	if len(ops) > 0 {
		ops[0].Payload = json.RawMessage(`{"name":"tampered"}`)
	}
	buf, _ := json.Marshal(opsMsg{NodeID: b.st.NodeID(), Ops: ops, PubKey: b.st.PublicKeyHex(), Sig: sig})

	req, _ := http.NewRequest("POST", a.server.URL+"/api/sync/ops", bytes.NewReader(buf))
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("tampered signed batch should be rejected (400), got %d", resp.StatusCode)
	}
	// And nothing landed.
	if rows, _ := a.st.ListRows("products", false); len(rows) != 0 {
		t.Fatalf("tampered batch leaked %d rows into A", len(rows))
	}
}
