package sync

// Mutual Ed25519 transport authentication for the node↔node sync mesh.
//
// Every sync request carries a signature over a canonical envelope —
// method, path, body hash, timestamp and nonce — made with the caller's
// per-node Ed25519 identity key. The responder verifies it against the public
// key it has recorded for that node id (learned at pairing / first contact),
// checks the timestamp is fresh (±5 min) and that the nonce has not been seen
// before (replay protection).
//
// The shared secret is retained for two roles only:
//   - PAIRING BOOTSTRAP: a node that has not yet enrolled a key proves it knows
//     the secret, which authorizes recording (TOFU) its presented public key.
//     From then on that node authenticates by key.
//   - COMPATIBILITY FALLBACK: behind AllowSecretFallback (default off), an
//     already-enrolled peer may still authenticate with the secret alone. With
//     the default off, an enrolled peer that sends no valid signature is
//     rejected — key auth is required and the mesh fails closed.
//
// Revocation: deleting a peer row removes its recorded key, so the node is no
// longer trusted by key. (It can re-enroll only if it still knows the shared
// secret, so full revocation = remove the row AND rotate the secret.)

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"flowstock/backend/internal/store"
)

const (
	hdrNode      = "X-FS-Node"
	hdrPubkey    = "X-FS-Pubkey"
	hdrTimestamp = "X-FS-Timestamp"
	hdrNonce     = "X-FS-Nonce"
	hdrSig       = "X-FS-Sig"

	// authSkew is the tolerated clock skew for a request timestamp.
	authSkew = 5 * time.Minute
	// maxSyncBody caps a sync request body (must be read fully to hash it).
	maxSyncBody = 64 << 20
)

// nonceCache remembers recently seen (node, nonce) pairs to reject replays.
// Entries expire after twice the freshness window, matching the point past
// which a replayed request would be rejected for a stale timestamp anyway.
type nonceCache struct {
	mu   sync.Mutex
	seen map[string]time.Time
}

func newNonceCache() *nonceCache { return &nonceCache{seen: map[string]time.Time{}} }

// checkAndAdd returns true if key is fresh (and records it); false on replay.
func (c *nonceCache) checkAndAdd(key string, ttl time.Duration) bool {
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, exp := range c.seen { // lazy prune
		if now.After(exp) {
			delete(c.seen, k)
		}
	}
	if exp, ok := c.seen[key]; ok && now.Before(exp) {
		return false
	}
	c.seen[key] = now.Add(ttl)
	return true
}

func bodyHashHex(body []byte) string {
	h := sha256.Sum256(body)
	return hex.EncodeToString(h[:])
}

// sigBase is the canonical string signed by the caller and verified by the
// responder. Every field is bound in, so a signature cannot be replayed against
// a different method, path or body, or outside its freshness window.
func sigBase(method, path, bodyHash, ts, nonce string) []byte {
	return []byte(method + "\n" + path + "\n" + bodyHash + "\n" + ts + "\n" + nonce)
}

// bearerOK reports whether the request presents the current shared secret
// with the required "Bearer " scheme — a bare `Authorization: <secret>` (no
// scheme) does not authenticate, consistent with internal/auth.
func (e *Engine) bearerOK(r *http.Request) bool {
	secret := e.SecretFn()
	if secret == "" {
		return false
	}
	hdr := r.Header.Get("Authorization")
	presented, ok := strings.CutPrefix(hdr, "Bearer ")
	if !ok {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(presented), []byte(secret)) == 1
}

// verifyRequest authenticates one inbound sync request against body. It returns
// ok plus, on failure, a short client-facing reason. Enrollment (recording a
// bootstrapping node's key) happens here as a side effect once the node has
// proven possession of both the key and the shared secret.
func (e *Engine) verifyRequest(r *http.Request, body []byte) (bool, string) {
	node := r.Header.Get(hdrNode)
	pub := r.Header.Get(hdrPubkey)
	ts := r.Header.Get(hdrTimestamp)
	nonce := r.Header.Get(hdrNonce)
	sig := r.Header.Get(hdrSig)

	signed := node != "" && sig != "" && ts != "" && nonce != ""
	if signed {
		tsec, err := strconv.ParseInt(ts, 10, 64)
		if err != nil {
			return false, "bad request timestamp"
		}
		if d := time.Since(time.Unix(tsec, 0)); d > authSkew || d < -authSkew {
			return false, "stale request timestamp (clock skew beyond ±5m)"
		}

		recorded := e.Store.PubkeyForNode(node)
		verifyKey := recorded
		enrolling := false
		if recorded == "" {
			// Not yet enrolled: the shared secret authorizes trust-on-first-use
			// of the presented key.
			if !e.bearerOK(r) {
				return false, "unenrolled peer: a valid shared secret is required to enroll a key"
			}
			if pub == "" {
				return false, "unenrolled peer: pubkey header required to enroll"
			}
			verifyKey = pub
			enrolling = true
		}

		base := sigBase(r.Method, r.URL.Path, bodyHashHex(body), ts, nonce)
		if !store.VerifySig(verifyKey, base, sig) {
			return false, "request signature invalid"
		}
		if !e.nonces.checkAndAdd(node+"|"+nonce, 2*authSkew) {
			return false, "replayed request nonce"
		}
		if enrolling {
			e.Store.RecordPeerIdentity(node, pub)
		}
		return true, ""
	}

	// Unsigned request: shared-secret compatibility path.
	if node != "" && e.Store.PubkeyForNode(node) != "" && !e.AllowSecretFallback {
		return false, "key authentication required: peer is enrolled but sent no request signature"
	}
	if !e.bearerOK(r) {
		return false, "unauthorized"
	}
	return true, ""
}

// guard wraps a sync handler with transport authentication. It reads the body
// (needed to hash it), verifies, then restores the body for the handler.
func (e *Engine) guard(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, maxSyncBody))
		if err != nil {
			http.Error(w, "could not read request body", http.StatusBadRequest)
			return
		}
		_ = r.Body.Close()
		if ok, reason := e.verifyRequest(r, body); !ok {
			http.Error(w, reason, http.StatusUnauthorized)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		next(w, r)
	}
}

// signRequest signs an outbound sync request with this node's identity key so
// the peer can authenticate it by key. body must be the exact bytes sent.
func (e *Engine) signRequest(req *http.Request, body []byte) {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	nonce := store.NewID()
	base := sigBase(req.Method, req.URL.Path, bodyHashHex(body), ts, nonce)
	req.Header.Set(hdrNode, e.NodeID)
	if pk := e.Store.PublicKeyHex(); pk != "" {
		req.Header.Set(hdrPubkey, pk)
	}
	req.Header.Set(hdrTimestamp, ts)
	req.Header.Set(hdrNonce, nonce)
	req.Header.Set(hdrSig, e.Store.Sign(base))
}
