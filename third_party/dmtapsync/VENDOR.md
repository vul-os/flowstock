# Vendored: `dmtapsync` — the DMTAP Sync engine, Go binding

This directory is a **byte-for-byte copy** of the Go binding to the shared DMTAP Sync engine
(`substrate/SYNC.md` capability ③). It is not FlowStock code and is not edited here.

|                               |                                                                    |
| ----------------------------- | ------------------------------------------------------------------ |
| Upstream                      | `github.com/vul-os/envoir`, path `bindings/go`                     |
| Commit                        | `5e07cdb39b99b0107569774551602b67978db6bd` (2026-07-20)            |
| Engine artifact               | `dmtap_sync_abi.wasm`, 426,890 bytes                               |
| `sha256(dmtap_sync_abi.wasm)` | `dd7787106934346138b3569522224ddae24034e424d957cbf7726f4903ea6bb7` |
| Licence                       | MIT (`LICENSE`)                                                    |

## Why vendored rather than a module dependency

Two reasons, both hard:

1. **`dmtap_sync_abi.wasm` is gitignored upstream.** It is build output of
   `crates/dmtap-sync-wasm/build-abi.sh`, which needs a Rust toolchain and the
   `wasm32-unknown-unknown` target. A module fetched from the proxy therefore arrives with the
   `//go:embed` target missing and does not compile.
2. **FlowStock's CI checks out FlowStock only.** A `replace` pointing at a sibling `envoir`
   checkout builds on a developer laptop and fails everywhere else, which is the worst of the
   available failure modes.

This mirrors what Ofisi did for the same engine's JavaScript surface
(`third_party/dmtap-sync-wasm/VENDOR.md`) and for the same reason.

## The drift risk, and what guards it

Upstream's `embed.go` documents that committing this artifact **has already cost a real bug**: a
checked-in module went stale against a fix in `src/abi.rs`, and nothing in git ties a binary blob to
the source that produced it. Vendoring re-accepts that risk, so FlowStock pays for a guard:

`vendor_drift_test.go` (package `substrate`) resolves a sibling `envoir` checkout — via
`FLOWSTOCK_ENVOIR_DIR` or the conventional `../envoir` — and asserts every vendored file is
byte-identical to upstream. With no such checkout it skips, so CI stays green; on any machine that
has both repos, drift is a **failing test** rather than an invisible divergence.

## Refreshing

```sh
crates/dmtap-sync-wasm/build-abi.sh          # in the envoir checkout
cp envoir/bindings/go/{*.go,go.mod,go.sum,dmtap_sync_abi.wasm} \
   flowstock/third_party/dmtapsync/          # excluding _test.go
```

Then update the table above (commit, size, digest) and run `go test ./backend/internal/substrate/`.
Tests are deliberately not vendored: they require the sibling `dmtap` spec repo for the frozen
conformance vectors, and their home is upstream, where a failure means what it says.
