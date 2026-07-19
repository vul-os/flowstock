# Configuration

FlowStock runs with zero configuration. A config file is optional; settings
resolve in the order **config file → environment variable → default**.

## Config file

`flowstock.config.json`, searched in: the working directory (and parents),
`~/.config/flowstock/`, `~/.flowstock/`, then next to the executable. Example:

```json
{
  "port": "8787",
  "host": "0.0.0.0",
  "data_dir": "/var/lib/flowstock",
  "password": "",
  "frame_ancestors": ""
}
```

| Key | Env | Default | Notes |
|---|---|---|---|
| `port` | `FLOWSTOCK_PORT` | `8787` | HTTP listen port (also serves the sync mesh) |
| `host` | `FLOWSTOCK_HOST` | `127.0.0.1` | bind interface — set `0.0.0.0` so other branches can reach this one |
| `data_dir` | `FLOWSTOCK_DATA_DIR` | `~/.flowstock` | holds `flowstock.db` (and `snapshot.json` after a Compact) |
| `password` | `FLOWSTOCK_PASSWORD` | *(empty)* | if set, gates the app + data API behind an owner password |
| `frame_ancestors` | `FLOWSTOCK_FRAME_ANCESTORS` | *(empty)* | origins allowed to iframe FlowStock, e.g. `https://vulos.org` (for the Vulos OS shell) |
| `sync_secret_fallback` | `FLOWSTOCK_SYNC_SECRET_FALLBACK` | `false` | when `true`, lets an already-enrolled sync peer authenticate with the shared secret alone instead of a request signature — a compatibility escape hatch for mixed-version fleets. Default `false` = mutual key auth is required once a peer has enrolled a key (the mesh fails closed) |

The `--port` flag overrides the port; `--version` prints the version.

## In-app settings (Settings page)

These live in the database and, except business identity, **sync between
branches**:

- **Business** — business name, this branch's name, currency code/symbol, tax
  rate (VAT %, applied to purchase orders).
- **Branches** — the shared branch registry; each install picks which branch it
  *is* at first run. Stock levels and transfers are per branch.
- **Sync** — the shared secret (required to accept sync — no secret means the
  mesh rejects everything), the reachable address to advertise to peers, the
  peer list (name + URL, enable/disable, test, sync-now, per-peer status), an
  optional **Sync folder** path, and a **Compact** action.
  - **Sync folder** — a shared folder (Dropbox, Google Drive, Syncthing, a NAS
    mount, or a USB stick) used as an alternative transport. Each device writes
    only its own `ops-<node_id>.jsonl` file, so file-sync never conflicts; no
    ports or secret are needed for this path. Point every branch at the same
    folder. See [SYNC.md](SYNC.md) for the USB/sneakernet workflow.
  - **Compact** — writes a checksummed, signed `snapshot.json` to the data
    directory and prunes oplog entries every peer has acknowledged.

Each install also has, in its database, a **workspace id** (`org_id`, generated
on first run and shared by pairing) and a **node identity** (an Ed25519 keypair,
generated on first run). Neither is edited by hand. See [SYNC.md](SYNC.md).

## Security notes

- The sync mesh uses **mutual Ed25519 key authentication** and **fails closed**:
  each request is signed by the caller's node key and verified against the key
  recorded for that node, with ±5-minute freshness and replay protection. The
  shared secret only **bootstraps pairing** (it authorizes enrolling a new
  node's key) and, if `sync_secret_fallback` is on, is an opt-in compatibility
  path. With no secret and no enrolled key, `/api/sync/*` returns 401. Full
  detail and threat model: [SYNC.md](SYNC.md).
- **Revocation:** remove a peer row to drop its key; rotate the shared secret to
  stop a removed node from re-bootstrapping a new key.
- Beyond auth, ops carry an `org_id` (a foreign workspace's ops are dropped even
  if the transport authenticated) and are **signed** with the node's Ed25519 key
  and verified on receipt (tamper-evident).
- Sync signatures authenticate peers but do not encrypt the payload. Sync is
  plain HTTP over whatever network you run it on. Use a trusted LAN, a
  VPN/overlay (Tailscale, WireGuard, Netbird), or an HTTPS tunnel
  (Vulos Relay, an *optional* convenience — never required). Peer URLs may be
  `http://` or `https://`.
- The **Sync folder** carries the same business data as the mesh. Treat it as
  trusted storage: a shared/private Dropbox or Syncthing folder, a NAS share
  you control, or a USB stick you keep custody of.
- Set `password` for a shared or internet-exposed machine; leave it empty for a
  trusted single-user device or when the Vulos OS shell provides the gate.

## Running two nodes on one machine (testing)

```bash
FLOWSTOCK_DATA_DIR=/tmp/fs-a FLOWSTOCK_PORT=8787 ./flowstock
FLOWSTOCK_DATA_DIR=/tmp/fs-b FLOWSTOCK_PORT=8788 ./flowstock
# then add http://127.0.0.1:8787 as a peer on node B (same secret on both)
```
