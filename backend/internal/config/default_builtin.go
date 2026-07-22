//go:build !dmtap

package config

// defaultUseSubstrate is what Config.UseSubstrate returns when SubstrateSync
// is unset, in a plain build (no dmtap tag). False, because this binary
// carries no DMTAP substrate binding at all — see
// backend/internal/substrate/substrate_stub.go. Setting SubstrateSync=true
// explicitly on this build is a configuration error: main.go's existing
// fatal-on-error guard around substrate.OpenForStore reports it as
// substrate.ErrNotBuilt rather than silently falling back.
const defaultUseSubstrate = false
