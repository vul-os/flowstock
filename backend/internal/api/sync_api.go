package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"flowstock/backend/internal/store"
)

func (s *Server) handleGetSyncSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.syncSettings())
}

func (s *Server) syncSettings() map[string]any {
	listen := s.Store.GetSetting("sync_listen") == "1"
	port := orDefault(s.Store.GetSetting("sync_port"), "8787")
	return map[string]any{
		"listen":    listen,
		"port":      port,
		"bind_addr": orDefault(s.Store.GetSetting("sync_bind_addr"), "0.0.0.0"),
		"secret":    s.Store.GetSetting("sync_secret"),
		"listening": listen,
		"node_id":   s.Store.NodeID(),
		"org_id":    s.Store.OrgID(),
		"pubkey":    s.Store.PublicKeyHex(),
		"folder":    s.Store.GetSetting("sync_folder"),
	}
}

func (s *Server) handleSetSyncSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Listen   bool    `json:"listen"`
		Port     string  `json:"port"`
		BindAddr string  `json:"bind_addr"`
		Secret   string  `json:"secret"`
		Folder   *string `json:"folder"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	// FlowStock always serves the sync endpoints on its main listener; the
	// "listen" flag just records the operator's intent and gates whether we
	// advertise ourselves. Refuse to advertise without a secret (fail closed).
	if body.Listen && body.Secret == "" {
		badRequest(w, errSecret)
		return
	}
	_ = s.Store.SetSetting("sync_listen", boolStr(body.Listen))
	if body.Port != "" {
		_ = s.Store.SetSetting("sync_port", body.Port)
	}
	if body.BindAddr != "" {
		_ = s.Store.SetSetting("sync_bind_addr", body.BindAddr)
	}
	_ = s.Store.SetSetting("sync_secret", body.Secret)
	// Optional shared-folder transport (Dropbox/Syncthing/NAS/USB). nil = leave
	// unchanged; "" = disable.
	if body.Folder != nil {
		_ = s.Store.SetSetting("sync_folder", strings.TrimSpace(*body.Folder))
	}
	writeJSON(w, s.syncSettings())
}

// handleSyncFolderNow runs one folder export+import round immediately and
// reports what moved. Requires a sync folder to be configured.
func (s *Server) handleSyncFolderNow(w http.ResponseWriter, r *http.Request) {
	dir := s.Store.GetSetting("sync_folder")
	if dir == "" {
		badRequest(w, fmt.Errorf("no sync folder configured"))
		return
	}
	res := s.Sync.FolderSync(dir)
	if res.Error != "" {
		serverError(w, fmt.Errorf("%s", res.Error))
		return
	}
	writeJSON(w, res)
}

// handleCompact writes a fresh checksummed snapshot and prunes oplog entries
// that every enabled peer has acknowledged. Pruning is conservative and a no-op
// without at least one acknowledging peer.
func (s *Server) handleCompact(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{}
	if s.SnapshotDir != "" {
		snap, err := s.Store.WriteSnapshot(filepath.Join(s.SnapshotDir, "snapshot.json"))
		if err != nil {
			serverError(w, err)
			return
		}
		out["snapshot"] = map[string]any{
			"created_at": snap.CreatedAt,
			"checksum":   snap.Checksum,
			"path":       filepath.Join(s.SnapshotDir, "snapshot.json"),
		}
	}
	pruned, err := s.Store.PruneAckedOps()
	if err != nil {
		serverError(w, err)
		return
	}
	out["pruned"] = pruned
	writeJSON(w, out)
}

func (s *Server) handleNewSecret(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"secret": store.NewID() + store.NewID()})
}

func (s *Server) handleListPeers(w http.ResponseWriter, r *http.Request) {
	peers, err := s.Store.ListPeers()
	if err != nil {
		serverError(w, err)
		return
	}
	if peers == nil {
		peers = []store.Peer{}
	}
	writeJSON(w, peers)
}

func (s *Server) handleSavePeer(w http.ResponseWriter, r *http.Request) {
	var p store.Peer
	if err := decode(r, &p); err != nil {
		badRequest(w, err)
		return
	}
	if !validPeerURL(p.URL) {
		badRequest(w, errPeerURL)
		return
	}
	if err := s.Store.SavePeer(p); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (s *Server) handleDeletePeer(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeletePeer(r.PathValue("id")); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (s *Server) handleSyncNow(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PeerID string `json:"peer_id"`
	}
	_ = decode(r, &body)
	results := s.Sync.SyncAll(r.Context(), body.PeerID)
	if results == nil {
		results = []syncResult{}
	}
	writeJSON(w, results)
}

func (s *Server) handleTestPeer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL string `json:"url"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": s.Sync.TestPeer(r.Context(), body.URL)})
}
