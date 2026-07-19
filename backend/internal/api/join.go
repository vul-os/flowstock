package api

import (
	"fmt"
	"net/http"

	"flowstock/backend/internal/store"
)

// handleJoin pairs a brand-new install into an existing workspace instead of
// starting its own. It sets the shared secret, records the peer, and runs one
// sync round — which, on a fresh node, adopts the peer's workspace id and pulls
// its catalog, stock and branches. It then registers this device as a new
// branch in that (now shared) workspace.
//
// It is refused once this node has data of its own, so an established workspace
// can never be silently absorbed into another.
func (s *Server) HandleJoin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL          string `json:"url"`
		Secret       string `json:"secret"`
		BusinessName string `json:"business_name"`
		BranchName   string `json:"branch_name"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	if s.Store.GetSetting("branch_id") != "" {
		badRequest(w, fmt.Errorf("this device is already set up"))
		return
	}
	if n, _ := s.Store.LocalOpCount(); n > 0 {
		badRequest(w, fmt.Errorf("this device already has its own workspace and cannot join another"))
		return
	}
	if !validPeerURL(body.URL) {
		badRequest(w, errPeerURL)
		return
	}
	if body.Secret == "" {
		badRequest(w, fmt.Errorf("a shared secret is required to join"))
		return
	}
	if body.BranchName == "" {
		badRequest(w, fmt.Errorf("name this branch"))
		return
	}

	_ = s.Store.SetSetting("sync_secret", body.Secret)
	// Save the peer with a known id and sync against THAT id, so the peer's
	// identity (node id + key) and acknowledged vector learned during the join
	// round are recorded on the row we just created, not a throwaway id.
	peerID := store.NewID()
	if err := s.Store.SavePeer(store.Peer{ID: peerID, Name: "Workspace", URL: body.URL, Enabled: true}); err != nil {
		serverError(w, err)
		return
	}

	// Pull the existing workspace. On a fresh node this adopts its org id.
	res := s.Sync.SyncPeer(r.Context(), peerID, body.URL)
	if !res.OK {
		badRequest(w, fmt.Errorf("could not join: %s", res.Error))
		return
	}
	if !res.Adopted && s.Store.OrgID() == "" {
		badRequest(w, fmt.Errorf("peer did not report a workspace to join"))
		return
	}

	// Register this device as a new branch in the shared workspace.
	branchID := store.NewID()
	if body.BusinessName != "" {
		_ = s.Store.SetSetting("business_name", body.BusinessName)
	}
	_ = s.Store.SetSetting("branch_name", body.BranchName)
	_ = s.Store.SetSetting("branch_id", branchID)
	if _, err := s.Store.LocalPut("branches", branchID, map[string]any{
		"name": body.BranchName, "code": "", "address": "", "is_active": 1,
		"created_at": nowISO(),
	}, false); err != nil {
		serverError(w, err)
		return
	}

	// Push our new branch to the peer straight away so it shows up there too.
	_ = s.Sync.SyncAll(r.Context(), "")

	s.handleBootstrap(w, r)
}
