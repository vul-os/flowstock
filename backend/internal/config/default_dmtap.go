//go:build dmtap

package config

// defaultUseSubstrate is what Config.UseSubstrate returns when SubstrateSync
// is unset, in a binary built with the shared DMTAP sync engine compiled in.
// True reproduces this build's behaviour from before the plain (non-dmtap)
// build existed: the substrate is the merge authority unless an operator
// opts out.
const defaultUseSubstrate = true
