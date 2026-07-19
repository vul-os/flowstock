# Multi-branch sync

FlowStock's sync is built around one requirement: **a branch must keep working
with no connectivity at all**, and still end up consistent with every other
branch later. There is no central server and no "primary" branch — replication
is leaderless and peer-to-peer.

## Mental model

- Every install is a **node** with its own SQLite database.
- Every change is journalled as an **op** with a hybrid-logical-clock
  timestamp that is unique and causally ordered.
- Syncing = exchanging ops. Ops are idempotent; applying the same op twice is a
  no-op. Any node can relay any other node's ops.

## Workspaces (org id)

Every database belongs to a **workspace**, identified by an `org_id` generated
on first run. That id travels in the envelope of every synced row and every op,
so the data is **self-describing**: `ApplyOps` drops any op whose `org_id` does
not match this node's, and `SyncPeer` refuses a peer that reports a different
workspace. Isolation therefore no longer rests only on the shared secret — even
if two unrelated businesses picked the same secret, their data can never merge.

**Pairing** a brand-new device into an existing workspace: the fresh node (one
that has authored no ops yet) **adopts** the peer's `org_id` during the first
sync handshake, then pulls the catalog, stock and branches. An established node
never re-homes, so two real workspaces can never silently absorb one another.

## What merges how

- **Stock movements** are immutable facts ("JHB sold 3 of SKU X at 14:02").
  They merge by union. Stock on hand is the sum of movements, so two branches
  selling the same product offline never conflict — the totals simply add up.
- **Goods receipts** work the same way: receiving against a purchase order
  writes an immutable row to the `po_receipts` ledger, and a line's received
  quantity is `SUM(qty)` over those rows — never a stored counter. Two branches
  that each receive part of the same PO offline **add up** instead of one
  clobbering the other (which a last-writer-wins counter would have done).
- **Catalog rows** (products, prices, customers, orders, …) merge row-level
  **last-writer-wins**: the edit with the newest timestamp wins on every node.
  Deletions are soft (a `deleted` flag) so they replicate too.
- **Order/PO stock effects** are snapshotted as movements at the branch that
  confirmed/received them, so merging documents never double-counts stock. Line
  items lock once an order leaves draft.

## Topologies

Anything works, because ops relay transitively:

- **Pair** — two shops; one is reachable, the other dials it.
- **Hub and spoke** — head office is reachable; every branch adds only head
  office as a peer. Branches still receive each other's changes via the hub.
- **Mesh** — everyone lists everyone; most resilient.

A sync round with one peer both pushes and pulls, so only one side of any pair
needs to be reachable.

## Transport & security

- The sync endpoints (`/api/sync/*`) live on the app's HTTP port and
  authenticate every request with `Authorization: Bearer <shared secret>`.
  **No secret → every sync request is rejected (401).** All branches of a
  business share one secret.
- To be reachable by other branches, run with `host: 0.0.0.0`. Peers connect to
  `http://<host>:<port>` (the app's own address).
- Sync traffic is business data — run it on a **trusted network**: a LAN, a
  VPN/overlay (Tailscale, WireGuard, Netbird), or an HTTPS tunnel such as a
  [Vulos Relay](https://github.com/vul-os/vulos-relay) exposing the port as
  `https://…`. Peer URLs may be `http://` or `https://`.
- The secret is compared in constant time; failed auth returns 401 with no
  detail.

### Independence first

FlowStock never *needs* the internet or any Vulos service to sync. A LAN, a
VPN/overlay you run yourself, or the folder transport below are all first-class.
A **Vulos Relay** tunnel is only ever an *optional convenience* for reaching a
branch across the internet without opening a port — nothing about sync depends
on it.

## Folder sync (files as transport)

Networking is not the only way to replicate. FlowStock can also sync through a
**shared folder** — Dropbox, Google Drive, Syncthing, a NAS mount, or a USB
stick. Set it under **Settings → Sync → Sync folder** (or the `sync_folder`
setting) and point every branch at the same folder.

How it works, and why it never conflicts:

- Each node writes **only its own** ops to `ops-<node_id>.jsonl` in the folder
  (append-only). Because every node owns a single file, the file-sync tool never
  has two writers on one file — there is nothing to merge or conflict.
- Each node periodically **imports every other** `ops-*.jsonl` through the same
  idempotent `ApplyOps` used by network sync. Imports are incremental (a byte
  offset per file) and only consume whole lines, so a file still being written
  is read safely up to its last complete line.
- The files are **transport, never truth** — the database remains authoritative.
  The files are a durable, replayable log; a brand-new node pointed at the
  folder replays the full history from the files alone.

This needs no ports, no secret, and no simultaneous connectivity — the two
branches never have to be online at the same time.

### USB / sneakernet workflow

For sites with no shared network at all, carry the folder on a USB stick:

1. On branch **A**, set the Sync folder to the USB stick (e.g.
   `/Volumes/USB/flowstock`) and click **Sync folder now**. A writes
   `ops-<A>.jsonl` and imports any files already on the stick.
2. Eject and carry the stick to branch **B**. Set B's Sync folder to the stick
   and **Sync folder now**. B imports A's file (catching up on A's changes) and
   writes its own `ops-<B>.jsonl`.
3. Carry the stick back to A and sync again; A now imports B's file. Both
   branches have converged, with no network involved.

Because the per-node files are append-only and idempotent, it does not matter
how often the stick is carried, in what order, or if a trip is skipped — every
node eventually converges once the files reach it. For a late joiner, pair a
**snapshot** (below) with the op files so it starts from state rather than
replaying all history.

## Compaction & snapshots

The oplog is the sync source of truth and grows with history. **Compaction**
(Settings → Sync → **Compact**, or `POST /api/sync/compact`) keeps it bounded:

- It writes a **snapshot** — the full materialized state plus the version
  vector — to `snapshot.json` in the data directory. The snapshot is SHA-256
  **checksummed** (corruption/tamper is detectable on read) and **signed** with
  the node's identity key. A fresh node can rebuild from a snapshot alone.
- It then **prunes** oplog entries that **every enabled peer has already
  acknowledged** (peer version vectors are recorded on each sync round), always
  keeping the newest op per origin node so the version vector never regresses.

Pruning is deliberately conservative: with no peers, or any peer whose
acknowledgement is unknown, nothing is pruned. **Tradeoff:** after pruning, a
brand-new peer can no longer catch up from the oplog for the pruned range — it
imports a snapshot and then syncs the newer ops. Already-registered peers are
unaffected because, by definition, they acknowledged everything pruned. (The
folder-sync `ops-*.jsonl` files are unaffected by oplog pruning — they retain
the lines already written, so folder late-joiners still replay in full.)

## Per-node identity

Each node generates an **Ed25519 keypair** on first run. It signs the op
batches it pushes and the snapshots it writes, so replicated data is
attributable and **tamper-evident** — a receiver verifies a signed batch and
rejects it if the signature does not match. Public keys are exchanged in the
sync handshake and recorded against each peer (`peers.pubkey`) on pairing.

This is groundwork. Transport auth is **still the shared Bearer secret** exactly
as described above; upgrading the transport to mutual key authentication (keys
instead of a shared secret) is the intended next step and is not forced today.

## Conflict examples

| Scenario | Outcome |
|---|---|
| JHB and CPT both sell SKU X while offline | Both sale movements survive; total stock reflects both |
| Both edit the same product's price offline | Newest edit wins everywhere (LWW) |
| JHB cancels an order CPT already synced | Cancellation + stock reversal replicate |
| A branch is offline for a month | First reconnect replays everything both ways in batches |

## Operational notes

- Background sync runs once a minute per enabled peer; "Sync now" (top bar or
  Settings) runs immediately and reports pushed/pulled counts per peer.
- Peer status (last attempt, result) is shown in Settings → Sync.
- The oplog is the sync source of truth and grows with history. Ops are compact
  JSON rows so the cost is small, but you can bound it with **Compact** (see
  Compaction & snapshots above), which snapshots state and prunes ops every peer
  has acknowledged.
- Clocks: the HLC tolerates skewed wall clocks (observed timestamps push the
  clock forward), but keep branch clocks roughly sane (NTP) so
  last-writer-wins matches human expectations.
