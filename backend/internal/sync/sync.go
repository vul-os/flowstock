// Package sync implements FlowStock's leaderless branch-to-branch replication.
//
// There is no central server. Every node can both serve sync requests (over
// the same HTTP mux as the app) and dial peers. A sync round is stateless and
// symmetric — push what the peer lacks, then pull what we lack — so any
// topology works (pair, hub-and-spoke, full mesh) and a branch that was
// offline simply catches up on its next reachable round.
//
// All endpoints require Authorization: Bearer <shared secret>. With no secret
// configured the endpoints reject every request (fail closed).
package sync

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"flowstock/backend/internal/store"
)

// Batch bounds how many ops travel per request.
const Batch = 2000

// Engine wires the store to the network. SecretFn is read on every request so
// rotating the secret in settings takes effect immediately.
type Engine struct {
	Store    *store.Store
	SecretFn func() string
	// FolderFn, if set, returns the shared-folder path for file-based transport
	// (empty = disabled). Read on every round so toggling it takes effect live.
	FolderFn func() string
	NodeID   string
	client   *http.Client
	mu       sync.Mutex // serializes outbound rounds
}

func New(s *store.Store, secretFn func() string) *Engine {
	return &Engine{
		Store:    s,
		SecretFn: secretFn,
		NodeID:   s.NodeID(),
		client:   &http.Client{Timeout: 20 * time.Second},
	}
}

type opsMsg struct {
	NodeID string     `json:"node_id"`
	Ops    []store.Op `json:"ops"`
}

type pullReq struct {
	Vector map[string]string `json:"vector"`
}

func (e *Engine) authed(r *http.Request) bool {
	secret := e.SecretFn()
	if secret == "" {
		return false
	}
	presented := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	return subtle.ConstantTimeCompare([]byte(presented), []byte(secret)) == 1
}

// Handler returns the /api/sync/* routes.
func (e *Engine) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/sync/ping", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "flowstock")
	})

	mux.HandleFunc("GET /api/sync/vector", func(w http.ResponseWriter, r *http.Request) {
		if !e.authed(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		vec, err := e.Store.Vector()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"node_id": e.NodeID, "org_id": e.Store.OrgID(), "vector": vec})
	})

	mux.HandleFunc("POST /api/sync/ops", func(w http.ResponseWriter, r *http.Request) {
		if !e.authed(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var msg opsMsg
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		applied, err := e.Store.ApplyOps(msg.Ops)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"applied": applied})
	})

	mux.HandleFunc("POST /api/sync/pull", func(w http.ResponseWriter, r *http.Request) {
		if !e.authed(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var req pullReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		ops, err := e.Store.OpsAfter(req.Vector, Batch)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, opsMsg{NodeID: e.NodeID, Ops: ops})
	})

	return mux
}

// Result reports the outcome of syncing one peer.
type Result struct {
	PeerID  string `json:"peer_id"`
	OK      bool   `json:"ok"`
	Pushed  int    `json:"pushed"`
	Pulled  int    `json:"pulled"`
	Adopted bool   `json:"adopted"`
	Error   string `json:"error"`
}

// SyncPeer runs one full round against a peer base URL.
func (e *Engine) SyncPeer(ctx context.Context, peerID, baseURL string) Result {
	e.mu.Lock()
	defer e.mu.Unlock()

	res := Result{PeerID: peerID}
	secret := e.SecretFn()
	if secret == "" {
		res.Error = "sync secret not set"
		return res
	}
	base := strings.TrimRight(baseURL, "/")
	auth := "Bearer " + secret

	// 1. Learn the peer's vector (and workspace id), then push everything it
	// lacks. The window vector advances past each pushed batch so batches never
	// overlap.
	peerVec, peerOrg, err := e.fetchVector(ctx, base, auth)
	if err != nil {
		res.Error = err.Error()
		return res
	}
	// Pairing: a brand-new node adopts the workspace it is joining. An
	// established node keeps its own workspace, and mismatched ops are rejected
	// on apply, so two real workspaces never silently merge over a shared secret.
	if adopted, aerr := e.Store.AdoptOrg(peerOrg); aerr != nil {
		res.Error = aerr.Error()
		return res
	} else if adopted {
		res.Adopted = true
	}
	if myOrg := e.Store.OrgID(); peerOrg != "" && myOrg != "" && peerOrg != myOrg {
		res.Error = fmt.Sprintf("peer is a different workspace (%s ≠ %s); refusing to sync", peerOrg, myOrg)
		return res
	}
	window := peerVec
	for {
		ops, err := e.Store.OpsAfter(window, Batch)
		if err != nil {
			res.Error = err.Error()
			return res
		}
		if len(ops) == 0 {
			break
		}
		for _, op := range ops {
			if op.HLC > window[op.NodeID] {
				window[op.NodeID] = op.HLC
			}
		}
		if err := e.postOps(ctx, base, auth, ops); err != nil {
			res.Error = err.Error()
			return res
		}
		res.Pushed += len(ops)
		if len(ops) < Batch {
			break
		}
	}

	// 2. Pull everything we lack.
	for {
		myVec, err := e.Store.Vector()
		if err != nil {
			res.Error = err.Error()
			return res
		}
		ops, err := e.pull(ctx, base, auth, myVec)
		if err != nil {
			res.Error = err.Error()
			return res
		}
		if len(ops) == 0 {
			break
		}
		n, err := e.Store.ApplyOps(ops)
		if err != nil {
			res.Error = err.Error()
			return res
		}
		res.Pulled += n
		if len(ops) < Batch {
			break
		}
	}

	res.OK = true
	return res
}

func (e *Engine) fetchVector(ctx context.Context, base, auth string) (map[string]string, string, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", base+"/api/sync/vector", nil)
	req.Header.Set("Authorization", auth)
	resp, err := e.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, "", fmt.Errorf("vector: HTTP %d", resp.StatusCode)
	}
	var body struct {
		Vector map[string]string `json:"vector"`
		OrgID  string            `json:"org_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, "", err
	}
	if body.Vector == nil {
		body.Vector = map[string]string{}
	}
	return body.Vector, body.OrgID, nil
}

func (e *Engine) postOps(ctx context.Context, base, auth string, ops []store.Op) error {
	buf, _ := json.Marshal(opsMsg{NodeID: e.NodeID, Ops: ops})
	req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/sync/ops", bytes.NewReader(buf))
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("push: HTTP %d", resp.StatusCode)
	}
	return nil
}

func (e *Engine) pull(ctx context.Context, base, auth string, vec map[string]string) ([]store.Op, error) {
	buf, _ := json.Marshal(pullReq{Vector: vec})
	req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/sync/pull", bytes.NewReader(buf))
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("pull: HTTP %d", resp.StatusCode)
	}
	var msg opsMsg
	if err := json.NewDecoder(resp.Body).Decode(&msg); err != nil {
		return nil, err
	}
	return msg.Ops, nil
}

// TestPeer checks reachability + auth against a peer URL.
func (e *Engine) TestPeer(ctx context.Context, baseURL string) bool {
	base := strings.TrimRight(baseURL, "/")
	req, _ := http.NewRequestWithContext(ctx, "GET", base+"/api/sync/vector", nil)
	req.Header.Set("Authorization", "Bearer "+e.SecretFn())
	resp, err := e.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

// SyncAll syncs every enabled peer (or one, if only != "") and records the
// outcome on the peers table.
func (e *Engine) SyncAll(ctx context.Context, only string) []Result {
	peers, err := e.Store.ListPeers()
	if err != nil {
		return nil
	}
	var results []Result
	for _, p := range peers {
		if !p.Enabled || (only != "" && p.ID != only) {
			continue
		}
		res := e.SyncPeer(ctx, p.ID, p.URL)
		status := "ok: pushed " + itoa(res.Pushed) + ", pulled " + itoa(res.Pulled)
		if !res.OK {
			status = "error: " + res.Error
		}
		e.Store.UpdatePeerStatus(p.ID, time.Now().UTC().Format(time.RFC3339), status)
		results = append(results, res)
	}
	// Flush to / drain from the shared folder too, if one is configured. This
	// runs even with no peers, so a folder-only (offline / sneakernet) topology
	// works with no network sync at all.
	if e.FolderFn != nil {
		if dir := e.FolderFn(); dir != "" {
			e.FolderSync(dir)
		}
	}
	return results
}

// RunBackground syncs all enabled peers every interval until ctx is cancelled.
func (e *Engine) RunBackground(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.SyncAll(ctx, "")
		}
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func itoa(n int) string { return fmt.Sprintf("%d", n) }
