package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"flowstock/backend/internal/store"
)

func (h *harness) syncSettings() map[string]any {
	h.t.Helper()
	var out map[string]any
	h.mustJSON(h.do("GET", "/api/sync/settings", ""), &out)
	return out
}

func TestSyncSettingsReportDefaults(t *testing.T) {
	h := newHarness(t)
	s := h.syncSettings()

	if s["listen"] != false {
		t.Fatal("a fresh node must not be advertising itself")
	}
	if s["port"] != "8787" || s["bind_addr"] != "0.0.0.0" {
		t.Fatalf("expected the documented defaults, got port=%v bind=%v", s["port"], s["bind_addr"])
	}
	if s["node_id"] != h.st.NodeID() || s["pubkey"] != h.st.PublicKeyHex() {
		t.Fatal("sync settings must report this node's own identity")
	}
	if s["pubkey"] == "" {
		t.Fatal("a node should have generated an identity key on first open")
	}
}

// Advertising a branch without a shared secret would leave the mesh open, so it
// is refused.
func TestSyncSettingsRefuseToListenWithoutASecret(t *testing.T) {
	h := newHarness(t)

	w := h.do("POST", "/api/sync/settings", `{"listen":true,"secret":"","port":"9000"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("listening without a secret must be refused, got %d", w.Code)
	}
	if h.st.GetSetting("sync_listen") == "1" {
		t.Fatal("a refused settings write must not enable listening")
	}
	if h.st.GetSetting("sync_port") == "9000" {
		t.Fatal("a refused settings write must not apply any of its other fields")
	}

	// With a secret it is accepted.
	var out map[string]any
	h.mustJSON(h.do("POST", "/api/sync/settings", `{"listen":true,"secret":"s3cret","port":"9000","bind_addr":"127.0.0.1"}`), &out)
	if out["listen"] != true || out["port"] != "9000" || out["bind_addr"] != "127.0.0.1" {
		t.Fatalf("settings were not applied: %v", out)
	}
	if out["secret"] != "s3cret" {
		t.Fatalf("the secret should be readable back by the operator, got %v", out["secret"])
	}
}

// Empty port/bind values mean "leave as is" rather than "blank it out", so a
// partial write from the UI cannot strand the node on no port at all.
func TestSyncSettingsKeepExistingPortAndBindWhenBlank(t *testing.T) {
	h := newHarness(t)
	h.mustJSON(h.do("POST", "/api/sync/settings", `{"listen":true,"secret":"s3cret","port":"9000","bind_addr":"127.0.0.1"}`), &map[string]any{})

	var out map[string]any
	h.mustJSON(h.do("POST", "/api/sync/settings", `{"listen":true,"secret":"s3cret"}`), &out)
	if out["port"] != "9000" || out["bind_addr"] != "127.0.0.1" {
		t.Fatalf("blank port/bind must leave the existing values alone, got %v", out)
	}
}

// The folder transport uses a pointer so the UI can distinguish "unchanged"
// from "turn it off".
func TestSyncFolderSettingDistinguishesUnchangedFromCleared(t *testing.T) {
	h := newHarness(t)
	dir := t.TempDir()

	h.mustJSON(h.do("POST", "/api/sync/settings", jsonf(map[string]any{
		"listen": true, "secret": "s3cret", "folder": dir,
	})), &map[string]any{})
	if h.st.GetSetting("sync_folder") != dir {
		t.Fatal("the folder should have been set")
	}

	// Omitted → unchanged.
	h.mustJSON(h.do("POST", "/api/sync/settings", `{"listen":true,"secret":"s3cret"}`), &map[string]any{})
	if h.st.GetSetting("sync_folder") != dir {
		t.Fatal("omitting the folder must leave it configured")
	}

	// Explicit empty string → cleared.
	h.mustJSON(h.do("POST", "/api/sync/settings", `{"listen":true,"secret":"s3cret","folder":""}`), &map[string]any{})
	if h.st.GetSetting("sync_folder") != "" {
		t.Fatal("an explicit empty folder must disable the folder transport")
	}
}

func TestFolderSyncRequiresAConfiguredFolder(t *testing.T) {
	h := newHarness(t)
	h.setup()

	if w := h.do("POST", "/api/sync/folder", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("a folder round with no folder configured must be refused, got %d", w.Code)
	}

	dir := t.TempDir()
	_ = h.st.SetSetting("sync_folder", dir)
	var out map[string]any
	h.mustJSON(h.do("POST", "/api/sync/folder", ""), &out)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("a folder round should export this node's ops into the folder")
	}
}

func TestNewSecretIsLongAndUnique(t *testing.T) {
	h := newHarness(t)
	seen := map[string]bool{}
	for i := 0; i < 16; i++ {
		var out map[string]any
		h.mustJSON(h.do("GET", "/api/sync/secret/new", ""), &out)
		secret, _ := out["secret"].(string)
		if len(secret) < 32 {
			t.Fatalf("a generated secret should be long, got %d chars", len(secret))
		}
		if seen[secret] {
			t.Fatal("generated secrets must never repeat")
		}
		seen[secret] = true
	}
	// Generating a secret must not apply it; the operator saves it explicitly.
	if h.st.GetSetting("sync_secret") != "" {
		t.Fatal("generating a secret must not change the configured one")
	}
}

// ── peers ────────────────────────────────────────────────────────────────────

func TestPeerCRUD(t *testing.T) {
	h := newHarness(t)
	h.setup()

	var ok map[string]any
	h.mustJSON(h.do("POST", "/api/peers", `{"id":"peer-1","name":"Depot","url":"https://depot.example:8787","enabled":true}`), &ok)

	var peers []store.Peer
	h.mustJSON(h.do("GET", "/api/peers", ""), &peers)
	if len(peers) != 1 || peers[0].Name != "Depot" || !peers[0].Enabled {
		t.Fatalf("expected the saved peer back, got %+v", peers)
	}

	// Saving the same id updates in place.
	h.mustJSON(h.do("POST", "/api/peers", `{"id":"peer-1","name":"Depot North","url":"http://10.0.0.5:8787","enabled":false}`), &ok)
	h.mustJSON(h.do("GET", "/api/peers", ""), &peers)
	if len(peers) != 1 || peers[0].Name != "Depot North" || peers[0].Enabled {
		t.Fatalf("saving an existing peer should update it, got %+v", peers)
	}

	h.mustJSON(h.do("DELETE", "/api/peers/peer-1", ""), &ok)
	h.mustJSON(h.do("GET", "/api/peers", ""), &peers)
	if len(peers) != 0 {
		t.Fatalf("the peer should be gone, got %+v", peers)
	}
	// Deleting a peer that is not there is a no-op, not an error.
	if w := h.do("DELETE", "/api/peers/nobody", ""); w.Code != http.StatusOK {
		t.Fatalf("deleting a missing peer should succeed, got %d", w.Code)
	}
}

func TestPeerURLValidation(t *testing.T) {
	h := newHarness(t)
	for name, url := range map[string]string{
		"empty":          "",
		"scheme-less":    "depot.example:8787",
		"relative":       "/api/sync",
		"file":           "file:///etc/passwd",
		"javascript":     "javascript:alert(1)",
		"ftp":            "ftp://depot.example",
		"almost http":    "htp://depot.example",
		"leading spaces": "   ",
	} {
		t.Run(name, func(t *testing.T) {
			body := jsonf(map[string]any{"name": "X", "url": url, "enabled": true})
			if got := h.do("POST", "/api/peers", body).Code; got != http.StatusBadRequest {
				t.Fatalf("%q must be refused, got %d", url, got)
			}
			if got := h.do("POST", "/api/sync/test", jsonf(map[string]any{"url": url})).Code; got == http.StatusInternalServerError {
				t.Fatalf("testing %q must not fault the server", url)
			}
		})
	}
	var peers []store.Peer
	h.mustJSON(h.do("GET", "/api/peers", ""), &peers)
	if len(peers) != 0 {
		t.Fatalf("no invalid peer should have been stored, got %+v", peers)
	}
}

// Peer listings drive an operator UI. They report whether a key is enrolled but
// must never hand back the key material or the shared secret.
func TestPeerListingDoesNotLeakKeyMaterial(t *testing.T) {
	h := newHarness(t)
	rem := newRemote(t, "shared-secret")
	h.mustJSON(h.do("POST", "/api/workspace/join", joinBody(rem.srv.URL, "shared-secret")), &map[string]any{})

	w := h.do("GET", "/api/peers", "")
	body := w.Body.String()
	if strings.Contains(body, rem.st.PublicKeyHex()) {
		t.Fatal("the peers listing must not include raw public key material")
	}
	if strings.Contains(body, "shared-secret") {
		t.Fatal("the peers listing must not include the shared secret")
	}
	var peers []store.Peer
	if err := json.Unmarshal(w.Body.Bytes(), &peers); err != nil {
		t.Fatal(err)
	}
	if len(peers) != 1 || !peers[0].HasKey {
		t.Fatalf("the listing should still report that a key is enrolled, got %+v", peers)
	}
}

// ── rounds + compaction ──────────────────────────────────────────────────────

func TestSyncNowWithNoPeersIsAnEmptyList(t *testing.T) {
	h := newHarness(t)
	h.setup()
	w := h.do("POST", "/api/sync/now", `{}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if got := strings.TrimSpace(w.Body.String()); got != "[]" {
		t.Fatalf("expected an empty result list, got %s", got)
	}
}

func TestSyncNowReportsAnUnreachablePeerWithoutFailing(t *testing.T) {
	h := newHarness(t)
	h.setup()
	h.mustJSON(h.do("POST", "/api/peers", `{"id":"p1","name":"Gone","url":"http://127.0.0.1:1","enabled":true}`), &map[string]any{})

	var results []syncResult
	h.mustJSON(h.do("POST", "/api/sync/now", `{}`), &results)
	if len(results) != 1 {
		t.Fatalf("expected one result, got %+v", results)
	}
	if results[0].OK || results[0].Error == "" {
		t.Fatalf("an unreachable peer should be reported as a failed round, got %+v", results[0])
	}
	// The failure is recorded against the peer for the operator to see.
	var peers []store.Peer
	h.mustJSON(h.do("GET", "/api/peers", ""), &peers)
	if !strings.HasPrefix(peers[0].LastStatus, "error:") {
		t.Fatalf("the peer's last status should record the error, got %q", peers[0].LastStatus)
	}
}

func TestCompactWritesAVerifiableSnapshot(t *testing.T) {
	h := newHarness(t)
	h.setup()
	h.putRow("products", `{"data":{"name":"Anvil"}}`)

	var out map[string]any
	h.mustJSON(h.do("POST", "/api/sync/compact", ""), &out)

	snap, _ := out["snapshot"].(map[string]any)
	if snap == nil || snap["checksum"] == "" {
		t.Fatalf("compaction should report a checksummed snapshot, got %v", out)
	}
	path := filepath.Join(h.srv.SnapshotDir, "snapshot.json")
	if snap["path"] != path {
		t.Fatalf("expected the snapshot path back, got %v", snap["path"])
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the snapshot should be on disk: %v", err)
	}
	var written map[string]any
	if err := json.Unmarshal(raw, &written); err != nil {
		t.Fatalf("the snapshot on disk is not JSON: %v", err)
	}
	if written["checksum"] != snap["checksum"] {
		t.Fatal("the reported checksum should match the file on disk")
	}
	// With no acknowledging peer, pruning is conservative and drops nothing.
	if pruned := asFloat(out["pruned"]); pruned != 0 {
		t.Fatalf("pruning with no acknowledging peer must be a no-op, got %v", pruned)
	}
}

// A node with no snapshot directory configured still compacts; it just does not
// write a snapshot file.
func TestCompactWithoutASnapshotDirOnlyPrunes(t *testing.T) {
	h := newHarness(t)
	h.srv.SnapshotDir = ""
	h.setup()

	var out map[string]any
	h.mustJSON(h.do("POST", "/api/sync/compact", ""), &out)
	if _, ok := out["snapshot"]; ok {
		t.Fatalf("no snapshot should be reported without a directory, got %v", out)
	}
	if _, ok := out["pruned"]; !ok {
		t.Fatal("compaction should still report what it pruned")
	}
}

// SHARP EDGE, pinned deliberately: unlike port, bind_addr and folder — which all
// treat a blank/omitted value as "leave unchanged" — the secret is written
// through unconditionally, so a settings POST that omits it CLEARS it and
// silently breaks every paired peer. The bundled UI always sends the secret back
// from its form state, so this is not reachable from the app today; it is a trap
// for any other client. Recorded here so a change to it is a deliberate one.
func TestSyncSettingsSecretIsOverwrittenNotPreserved(t *testing.T) {
	h := newHarness(t)
	h.setup()
	_ = h.st.SetSetting("sync_secret", "established-secret")

	h.mustJSON(h.do("POST", "/api/sync/settings", `{"listen":false}`), &map[string]any{})
	if got := h.st.GetSetting("sync_secret"); got != "" {
		t.Fatalf("expected the documented (surprising) clear-on-omit behaviour, got %q", got)
	}
}
