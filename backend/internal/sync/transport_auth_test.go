package sync

import (
	"context"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"flowstock/backend/internal/store"
)

// sign produces a request-envelope signature with node's identity key.
func sign(node *store.Store, method, path string, body []byte, ts, nonce string) string {
	return node.Sign(sigBase(method, path, bodyHashHex(body), ts, nonce))
}

// req sends a request to srv with the given headers and returns status + body.
func req(t *testing.T, method, url string, body []byte, headers map[string]string) (int, string) {
	t.Helper()
	var r io.Reader
	if body != nil {
		r = strings.NewReader(string(body))
	}
	rq, err := http.NewRequest(method, url, r)
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range headers {
		rq.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(rq)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, strings.TrimSpace(string(b))
}

// signedHeaders builds the full X-FS-* header set for a request from `by`.
func signedHeaders(by *store.Store, method, path string, body []byte, ts, nonce string) map[string]string {
	return map[string]string{
		hdrNode:      by.NodeID(),
		hdrPubkey:    by.PublicKeyHex(),
		hdrTimestamp: ts,
		hdrNonce:     nonce,
		hdrSig:       sign(by, method, path, body, ts, nonce),
	}
}

func nowTS() string { return strconv.FormatInt(time.Now().Unix(), 10) }

const vectorPath = "/api/sync/vector"

// enroll performs one bootstrap round so the server records B's key.
func enroll(t *testing.T, server *node, b *store.Store, secret string) {
	t.Helper()
	h := signedHeaders(b, "GET", vectorPath, nil, nowTS(), store.NewID())
	h["Authorization"] = "Bearer " + secret
	if code, body := req(t, "GET", server.server.URL+vectorPath, nil, h); code != 200 {
		t.Fatalf("bootstrap enroll should succeed, got %d: %s", code, body)
	}
	if server.st.PubkeyForNode(b.NodeID()) != b.PublicKeyHex() {
		t.Fatal("server did not enroll the bootstrapping node's key")
	}
}

func TestKeyAuthHappyPath(t *testing.T) {
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")
	enroll(t, a, b.st, "s3cret")

	// Once enrolled, a correctly signed request authenticates by key — with NO
	// bearer secret at all.
	h := signedHeaders(b.st, "GET", vectorPath, nil, nowTS(), store.NewID())
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, h); code != 200 {
		t.Fatalf("enrolled+signed request should succeed without a secret, got %d: %s", code, body)
	}
}

func TestKeyAuthWrongKeyRejected(t *testing.T) {
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")
	enroll(t, a, b.st, "s3cret")

	// Attacker claims B's node id but signs with a different key (and presents
	// its own pubkey) — even with the correct shared secret it is rejected,
	// because the server verifies against the key it recorded for B.
	imposter := newNode(t, "X", "s3cret")
	ts, nonce := nowTS(), store.NewID()
	h := map[string]string{
		hdrNode:         b.st.NodeID(),
		hdrPubkey:       imposter.st.PublicKeyHex(),
		hdrTimestamp:    ts,
		hdrNonce:        nonce,
		hdrSig:          sign(imposter.st, "GET", vectorPath, nil, ts, nonce),
		"Authorization": "Bearer s3cret",
	}
	code, body := req(t, "GET", a.server.URL+vectorPath, nil, h)
	if code != http.StatusUnauthorized {
		t.Fatalf("wrong-key request must be rejected, got %d: %s", code, body)
	}
}

func TestKeyAuthReplayRejected(t *testing.T) {
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")
	enroll(t, a, b.st, "s3cret")

	h := signedHeaders(b.st, "GET", vectorPath, nil, nowTS(), store.NewID())
	if code, _ := req(t, "GET", a.server.URL+vectorPath, nil, h); code != 200 {
		t.Fatal("first use of a signed request should succeed")
	}
	// Replaying the identical (node, nonce) is rejected.
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, h); code != http.StatusUnauthorized {
		t.Fatalf("replayed request must be rejected, got %d: %s", code, body)
	}
}

func TestKeyAuthStaleTimestampRejected(t *testing.T) {
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")
	enroll(t, a, b.st, "s3cret")

	staleTS := strconv.FormatInt(time.Now().Add(-10*time.Minute).Unix(), 10)
	h := signedHeaders(b.st, "GET", vectorPath, nil, staleTS, store.NewID())
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, h); code != http.StatusUnauthorized {
		t.Fatalf("stale-timestamp request must be rejected, got %d: %s", code, body)
	}
}

func TestUnenrolledSignedRequestNeedsSecret(t *testing.T) {
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")

	// Not enrolled yet, signed, but no shared secret presented → cannot bootstrap.
	h := signedHeaders(b.st, "GET", vectorPath, nil, nowTS(), store.NewID())
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, h); code != http.StatusUnauthorized {
		t.Fatalf("unenrolled signed request without a secret must be rejected, got %d: %s", code, body)
	}
	// Same request WITH the secret bootstraps (enrolls) and succeeds.
	h["Authorization"] = "Bearer s3cret"
	// fresh nonce (the previous attempt never recorded one, but be explicit)
	h[hdrNonce] = store.NewID()
	h[hdrSig] = sign(b.st, "GET", vectorPath, nil, h[hdrTimestamp], h[hdrNonce])
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, h); code != 200 {
		t.Fatalf("unenrolled signed request WITH the secret should enroll+succeed, got %d: %s", code, body)
	}
}

func TestEnrolledPeerUnsignedFailsClosedUnlessFallback(t *testing.T) {
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")
	enroll(t, a, b.st, "s3cret")

	// Enrolled node sends an UNSIGNED request (secret only). Default: key auth is
	// required → rejected.
	unsigned := map[string]string{
		hdrNode:         b.st.NodeID(),
		"Authorization": "Bearer s3cret",
	}
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, unsigned); code != http.StatusUnauthorized {
		t.Fatalf("enrolled peer without a signature must fail closed by default, got %d: %s", code, body)
	}

	// With the compatibility fallback enabled, the same secret-only request is
	// accepted.
	a.eng.AllowSecretFallback = true
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, unsigned); code != 200 {
		t.Fatalf("with fallback enabled, enrolled peer secret-only should succeed, got %d: %s", code, body)
	}
}

func TestLegacyUnsignedBearerStillBootstraps(t *testing.T) {
	a := newNode(t, "A", "s3cret")

	// A legacy client that never signs (no node header, no signature) still works
	// with the shared secret — this is the compatibility path for mixed fleets.
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil,
		map[string]string{"Authorization": "Bearer s3cret"}); code != 200 {
		t.Fatalf("legacy bearer-only request should succeed, got %d: %s", code, body)
	}
	// Wrong secret, no signature → rejected.
	if code, _ := req(t, "GET", a.server.URL+vectorPath, nil,
		map[string]string{"Authorization": "Bearer nope"}); code != http.StatusUnauthorized {
		t.Fatal("wrong bearer secret with no signature must be rejected")
	}
}

func TestRevocationByRemovingPeerRow(t *testing.T) {
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")
	enroll(t, a, b.st, "s3cret")

	// Find and delete the inbound enrollment row for B on A.
	peers, _ := a.st.ListPeers()
	var rowID string
	for _, p := range peers {
		if p.NodeID == b.st.NodeID() {
			rowID = p.ID
		}
	}
	if rowID == "" {
		t.Fatal("expected an inbound enrollment row for B on A")
	}
	if err := a.st.DeletePeer(rowID); err != nil {
		t.Fatal(err)
	}
	if a.st.PubkeyForNode(b.st.NodeID()) != "" {
		t.Fatal("removing the peer row should revoke the recorded key")
	}

	// Also rotate the secret so the revoked node cannot simply re-bootstrap.
	_ = a.st.SetSetting("sync_secret", "rotated")
	h := signedHeaders(b.st, "GET", vectorPath, nil, nowTS(), store.NewID())
	h["Authorization"] = "Bearer s3cret" // the old secret B still knows
	if code, body := req(t, "GET", a.server.URL+vectorPath, nil, h); code != http.StatusUnauthorized {
		t.Fatalf("revoked node with the old secret must be rejected, got %d: %s", code, body)
	}
}

func TestFullRoundEnrollsPeer(t *testing.T) {
	ctx := context.Background()
	a := newNode(t, "A", "s3cret")
	b := newNode(t, "B", "s3cret")
	put(t, a.st, "products", "p1", map[string]any{"name": "Anvil"})

	// A normal SyncPeer round (B dials A) signs every request and, on first
	// contact, enrolls B's key on A — pairing still works end to end.
	res := b.eng.SyncPeer(ctx, "peerA", a.server.URL)
	if !res.OK {
		t.Fatalf("sync round failed: %s", res.Error)
	}
	if a.st.PubkeyForNode(b.st.NodeID()) != b.st.PublicKeyHex() {
		t.Fatal("a full sync round should enroll the dialing node's key on the server")
	}
}
