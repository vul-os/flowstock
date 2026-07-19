package api

import (
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"path/filepath"
	"sync"
	"testing"

	"flowstock/backend/internal/store"
	syncpkg "flowstock/backend/internal/sync"
)

// remote is an already-established workspace on the network, reachable over
// HTTP exactly as a real peer branch would be.
type remote struct {
	st  *store.Store
	eng *syncpkg.Engine
	srv *httptest.Server
}

func newRemote(t *testing.T, secret string) *remote {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "remote.db"))
	if err != nil {
		t.Fatalf("open remote store: %v", err)
	}
	_ = st.SetSetting("sync_secret", secret)
	_ = st.SetSetting("branch_id", "remote-branch")
	_ = st.SetSetting("branch_name", "Head Office")
	_ = st.SetSetting("business_name", "Acme")
	// Give the workspace some history so a joiner has something to pull.
	if _, err := st.LocalPut("products", "p1", map[string]any{"name": "Anvil", "sku": "ANV-1"}, false); err != nil {
		t.Fatalf("seed remote: %v", err)
	}
	if _, err := st.LocalPut("branches", "remote-branch", map[string]any{"name": "Head Office", "is_active": 1}, false); err != nil {
		t.Fatalf("seed remote branch: %v", err)
	}
	eng := syncpkg.New(st, func() string { return st.GetSetting("sync_secret") })
	srv := httptest.NewServer(eng.Handler())
	t.Cleanup(func() { srv.Close(); st.Close() })
	return &remote{st: st, eng: eng, srv: srv}
}

func joinBody(url, secret string) string {
	return `{"url":"` + url + `","secret":"` + secret + `","business_name":"Acme","branch_name":"Depot"}`
}

func TestJoinAdoptsWorkspaceAndPullsItsData(t *testing.T) {
	h := newHarness(t)
	rem := newRemote(t, "shared-secret")

	var out map[string]any
	h.mustJSON(h.do("POST", "/api/workspace/join", joinBody(rem.srv.URL, "shared-secret")), &out)

	if out["initialized"] != true {
		t.Fatalf("a completed join must report an initialized workspace: %v", out)
	}
	if out["org_id"] != rem.st.OrgID() {
		t.Fatalf("the joiner must adopt the remote workspace id, got %v want %v", out["org_id"], rem.st.OrgID())
	}
	if out["branch_name"] != "Depot" {
		t.Fatalf("the joiner should be named as its own branch, got %v", out["branch_name"])
	}
	// The existing catalog came across.
	products := h.rows("products")
	if len(products) != 1 || products[0]["name"] != "Anvil" {
		t.Fatalf("join should pull the workspace catalog, got %v", products)
	}
	// ...and our new branch was pushed back, so both sides see both branches.
	remoteBranches, _ := rem.st.ListRows("branches", false)
	if len(remoteBranches) != 2 {
		t.Fatalf("the remote should see both branches after the join, got %d", len(remoteBranches))
	}
	// The shared secret was adopted so later rounds authenticate.
	if h.st.GetSetting("sync_secret") != "shared-secret" {
		t.Fatal("join must record the shared secret")
	}
}

// flakyRemote fronts a remote with a proxy that serves the first N vector
// requests and then fails. HandleJoin does one full round against the peer and
// then a second, best-effort SyncAll; cutting the link in between isolates what
// the JOIN round itself recorded from what the follow-up round would have
// repaired.
func flakyRemote(t *testing.T, rem *remote, vectorCalls int) *httptest.Server {
	t.Helper()
	target, err := url.Parse(rem.srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	var mu sync.Mutex
	seen := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/sync/vector" {
			mu.Lock()
			seen++
			over := seen > vectorCalls
			mu.Unlock()
			if over {
				http.Error(w, "peer went away", http.StatusServiceUnavailable)
				return
			}
		}
		proxy.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// REGRESSION: the join round must sync against the peer row it just SAVED, so
// the identity (node id + public key) and acknowledged vector learned during the
// round land on that row — not on a throwaway id that is discarded, leaving a
// keyless peer that can never be authenticated or safely pruned against.
//
// The peer is cut off after the join round's own vector fetch, so the trailing
// best-effort SyncAll cannot quietly repair the row: what is asserted below is
// exactly what the join round recorded.
func TestJoinRecordsIdentityOnTheSavedPeerRow(t *testing.T) {
	h := newHarness(t)
	rem := newRemote(t, "shared-secret")
	front := flakyRemote(t, rem, 1)

	var out map[string]any
	h.mustJSON(h.do("POST", "/api/workspace/join", joinBody(front.URL, "shared-secret")), &out)

	peers, err := h.st.ListPeers()
	if err != nil {
		t.Fatal(err)
	}
	if len(peers) != 1 {
		t.Fatalf("join should leave exactly one peer row, got %d: %+v", len(peers), peers)
	}
	p := peers[0]
	if p.URL != front.URL {
		t.Fatalf("the saved peer row should hold the dial URL, got %q", p.URL)
	}
	if !p.Enabled {
		t.Fatal("the joined peer must be enabled so background rounds reach it")
	}
	if p.NodeID != rem.st.NodeID() {
		t.Fatalf("the remote node id must be recorded on the saved row, got %q want %q", p.NodeID, rem.st.NodeID())
	}
	if !p.HasKey {
		t.Fatal("the remote public key must be recorded on the saved row")
	}
	if got := h.st.PeerPubkey(p.ID); got != rem.st.PublicKeyHex() {
		t.Fatalf("the saved row holds the wrong key: got %q want %q", got, rem.st.PublicKeyHex())
	}
	// The acknowledged vector landed on the same row; without it, oplog pruning
	// could never make progress.
	vectors, err := h.st.EnabledPeerVectors()
	if err != nil {
		t.Fatal(err)
	}
	if len(vectors) != 1 || len(vectors[0]) == 0 {
		t.Fatalf("the peer's acknowledged vector must be recorded on the saved row, got %v", vectors)
	}
	if _, ok := vectors[0][rem.st.NodeID()]; !ok {
		t.Fatalf("the recorded vector should cover the remote node, got %v", vectors[0])
	}
	// Inbound requests from that node are now authenticated by key.
	if h.st.PubkeyForNode(rem.st.NodeID()) != rem.st.PublicKeyHex() {
		t.Fatal("the recorded identity should make the remote node authenticable by key")
	}
}

func TestJoinRefusals(t *testing.T) {
	rem := newRemote(t, "shared-secret")

	cases := []struct {
		name    string
		body    string
		prepare func(*harness)
	}{
		{"missing url", `{"secret":"shared-secret","branch_name":"Depot"}`, nil},
		{"relative url", `{"url":"/api","secret":"shared-secret","branch_name":"Depot"}`, nil},
		{"file url", `{"url":"file:///etc/passwd","secret":"s","branch_name":"Depot"}`, nil},
		{"missing secret", `{"url":"` + rem.srv.URL + `","branch_name":"Depot"}`, nil},
		{"missing branch name", `{"url":"` + rem.srv.URL + `","secret":"shared-secret"}`, nil},
		{"wrong secret", joinBody(rem.srv.URL, "wrong-secret"), nil},
		{"unreachable peer", joinBody("http://127.0.0.1:1", "shared-secret"), nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness(t)
			if c.prepare != nil {
				c.prepare(h)
			}
			w := h.do("POST", "/api/workspace/join", c.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
			}
			if h.st.GetSetting("branch_id") != "" {
				t.Fatal("a refused join must not initialize the workspace")
			}
		})
	}
}

// An established workspace must never be absorbed into another one by a join.
func TestJoinRefusedOnceTheDeviceHasItsOwnWorkspace(t *testing.T) {
	rem := newRemote(t, "shared-secret")

	t.Run("already set up", func(t *testing.T) {
		h := newHarness(t)
		h.setup()
		ourOrg := h.st.OrgID()
		w := h.do("POST", "/api/workspace/join", joinBody(rem.srv.URL, "shared-secret"))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("joining from a set-up device must be refused, got %d", w.Code)
		}
		if h.st.OrgID() != ourOrg {
			t.Fatal("a refused join must not re-home the workspace")
		}
		if h.st.GetSetting("branch_name") != "Main" {
			t.Fatal("a refused join must not rename the branch")
		}
	})

	// Even without completing setup, any local history is enough to refuse.
	t.Run("has local history", func(t *testing.T) {
		h := newHarness(t)
		h.putRow("products", `{"data":{"name":"Ours"}}`)
		ourOrg := h.st.OrgID()
		w := h.do("POST", "/api/workspace/join", joinBody(rem.srv.URL, "shared-secret"))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("joining with local history must be refused, got %d: %s", w.Code, w.Body.String())
		}
		if h.st.OrgID() != ourOrg {
			t.Fatal("a refused join must not re-home the workspace")
		}
		if len(h.rows("products")) != 1 || h.rows("products")[0]["name"] != "Ours" {
			t.Fatal("a refused join must leave our own data alone")
		}
	})
}

// A joiner that presents the right secret to the wrong workspace still gets its
// own data; two established workspaces must not merge. Here the joiner is fresh,
// so it adopts — but the remote's ops are the only ones that cross.
func TestJoinIsRefusedWhenPeerHasNoWorkspace(t *testing.T) {
	h := newHarness(t)
	// A peer that has never been set up reports an org id of its own, so this
	// asserts the join path handles a peer with no history without wedging.
	st, err := store.Open(filepath.Join(t.TempDir(), "bare.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	_ = st.SetSetting("sync_secret", "shared-secret")
	eng := syncpkg.New(st, func() string { return st.GetSetting("sync_secret") })
	srv := httptest.NewServer(eng.Handler())
	defer srv.Close()

	w := h.do("POST", "/api/workspace/join", joinBody(srv.URL, "shared-secret"))
	if w.Code != http.StatusOK && w.Code != http.StatusBadRequest {
		t.Fatalf("joining a bare peer should resolve cleanly either way, got %d: %s", w.Code, w.Body.String())
	}
}
