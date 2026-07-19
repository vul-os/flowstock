package substrate_test

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestVendoredEngineMatchesUpstream is the price FlowStock pays for vendoring.
//
// Upstream's own embed.go records that checking this artifact into git has
// already cost a real bug: a committed module went stale against a fix in
// src/abi.rs, and every response whose Rust-side String capacity outran its
// length aborted the allocator. Nothing in git ties a binary blob to the source
// that produced it — so drift is invisible until it bites.
//
// FlowStock re-accepts that risk for a good reason (see VENDOR.md: the artifact
// is gitignored upstream and CI checks out FlowStock only) and buys this guard
// with it. On any machine that has both repos, drift is a failing test. With no
// sibling checkout the test skips, so CI stays green — which is the honest
// trade, not a loophole: the guard fires exactly where the two versions are both
// present to be compared.
func TestVendoredEngineMatchesUpstream(t *testing.T) {
	upstream := findUpstream(t)
	if upstream == "" {
		t.Skip("no sibling envoir checkout; set FLOWSTOCK_ENVOIR_DIR to enable the drift check")
	}

	vendored := filepath.Join("..", "..", "..", "third_party", "dmtapsync")
	entries, err := os.ReadDir(vendored)
	if err != nil {
		t.Fatalf("read vendored dir: %v", err)
	}

	checked := 0
	for _, e := range entries {
		name := e.Name()
		// VENDOR.md and LICENSE are FlowStock's own provenance record and the
		// upstream repo's root licence; neither is copied from bindings/go.
		if name == "VENDOR.md" || name == "LICENSE" || e.IsDir() {
			continue
		}
		if !strings.HasSuffix(name, ".go") && name != "go.mod" && name != "go.sum" &&
			name != "dmtap_sync_abi.wasm" {
			continue
		}
		up := filepath.Join(upstream, "bindings", "go", name)
		upBytes, err := os.ReadFile(up)
		if err != nil {
			if os.IsNotExist(err) && name == "dmtap_sync_abi.wasm" {
				// Build output the upstream checkout has not generated. Nothing
				// to compare against, and not evidence of drift either way.
				continue
			}
			t.Fatalf("read upstream %s: %v", name, err)
		}
		vendBytes, err := os.ReadFile(filepath.Join(vendored, name))
		if err != nil {
			t.Fatalf("read vendored %s: %v", name, err)
		}
		if sha256.Sum256(upBytes) != sha256.Sum256(vendBytes) {
			t.Errorf("%s has drifted from upstream\n  upstream sha256 %s\n  vendored sha256 %s\n"+
				"  refresh it and update third_party/dmtapsync/VENDOR.md",
				name, sum(upBytes), sum(vendBytes))
		}
		checked++
	}
	if checked == 0 {
		t.Fatal("the drift check compared nothing; the vendored layout has changed")
	}
}

func findUpstream(t *testing.T) string {
	t.Helper()
	if dir := os.Getenv("FLOWSTOCK_ENVOIR_DIR"); dir != "" {
		return dir
	}
	// The conventional side-by-side layout: .../vulos/flowstock and .../vulos/envoir.
	wd, err := os.Getwd()
	if err != nil {
		return ""
	}
	guess := filepath.Join(wd, "..", "..", "..", "..", "envoir")
	if _, err := os.Stat(filepath.Join(guess, "bindings", "go", "api.go")); err == nil {
		return guess
	}
	return ""
}

func sum(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
