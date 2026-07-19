package api

import "net/http"

// handleSubstrate reports whether the shared DMTAP sync engine is deciding
// merges and, if so, the state root of this replica's whole observable state
// (SYNC.md §6.1).
//
// The root is the useful part. Two branches that have converged agree on it byte
// for byte — over every register, set element and tombstone, including the ones
// no screen shows — which is a far stronger check than comparing rendered rows,
// and it is what the two-node end-to-end test asserts.
//
// legacy_ops is the number to watch in a real deployment: it counts ops that
// arrived from a peer still merging with the built-in engine. A mesh running two
// algebras converges only by luck, so a non-zero value is an operator's signal
// that the rollout is half-done, not a benign statistic.
func (s *Server) handleSubstrate(w http.ResponseWriter, r *http.Request) {
	if s.Substrate == nil {
		writeJSON(w, map[string]any{"enabled": false})
		return
	}
	root, err := s.Substrate.StateRoot()
	if err != nil {
		serverError(w, err)
		return
	}
	st := s.Substrate.Stats()
	writeJSON(w, map[string]any{
		"enabled":    true,
		"state_root": root,
		"ingested":   st.Ingested,
		"minted":     st.Minted,
		"legacy_ops": st.LegacyOps,
		"refused":    st.Refused,
	})
}
