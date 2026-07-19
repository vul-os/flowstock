# Testing

FlowStock has two test suites. They overlap on purpose: the Go tests prove the
merge rules hold at the store and protocol level, and the browser tests prove
the person standing at the counter actually sees the result.

```bash
npm run test:go     # Go: store invariants, sync protocol, two-node convergence
npm run test:e2e    # Browser: the real binary, driven by Playwright
npm test            # both
```

## Go tests

`go test ./backend/...` — see `backend/internal/store/` (merge and ledger
invariants, HLC ordering, snapshots) and `backend/internal/sync/` (the sync
protocol, signed batches, folder transport, workspace isolation and pairing).
These are fast and need no browser.

## Browser tests

`npm run test:e2e` runs Playwright against **the real binary**, not the demo
data. This distinction matters: served from the Vite dev server on port 5173,
the UI swaps in a browser-only demo driver with seeded rows (see
`src/services/api.js`). Served by the Go binary on any other port it uses the
HTTP driver, so every assertion goes through SQLite, the oplog and the sync
mesh.

One-time setup:

```bash
npx playwright install chromium
```

### How a test gets a server

`e2e/helpers/node.js` boots one `flowstock` process per test against a fresh
temp data dir (`FLOWSTOCK_DATA_DIR`) on a free port (`FLOWSTOCK_PORT`), waits
for `/api/bootstrap` to answer, and deletes the data dir afterwards. Nothing is
shared between tests, so they run in parallel and a two-node test is simply two
of them.

`e2e/helpers/fixtures.js` provides the `node` and `app` fixtures (a booted node,
and a page pointed at it with console errors collected). `e2e/helpers/seed.js`
creates prerequisites — a workspace, a catalog, a customer — over the API, so
each spec spends its time on the flow it is actually testing. **The flow under
test is always driven through the browser.**

The binary is built by `e2e/global-setup.js` before the suite runs, and the
build is skipped when the binary is already newer than every source file.
Set `FLOWSTOCK_SKIP_BUILD=1` to skip it outright, or point `FLOWSTOCK_BIN` at a
prebuilt binary (CI builds it as its own step).

### What is covered

| Spec | What it proves |
| --- | --- |
| `catalog.spec.js` | Creating a product and a variant through the UI, persisted to SQLite and surviving reload |
| `stock.spec.js` | A recorded movement updates stock on hand and appears in the ledger; a transfer writes paired out/in movements sharing one `ref_id` |
| `orders.spec.js` | Confirming a sales order deducts stock via a `sale` movement; receiving a purchase order twice appends two `po_receipts` rows summing to the total, with `received_quantity` derived at read time and over-receipt refused |
| `setup-pairing.spec.js` | First run creates a workspace; a second device joins using the secret shown in the first device's Settings — entirely through the browser, no API calls |
| `sync-two-node.spec.js` | **The core claim.** Two processes, two databases, divergent offline edits, then convergence asserted in both UIs. Includes concurrent movements at the *same* branch, which must union-merge rather than clobber, and an unreachable-peer round that delivers once the peer returns |
| `folder-sync.spec.js` | The zero-infrastructure path: with all network peers deleted, two nodes converge purely through `ops-<node>.jsonl` files in a shared folder, idempotently |
| `ui-guards.spec.js` | Every route renders in **both** themes with readable headings (computed WCAG contrast against the real backdrop), a clean console, and working navigation |

### Conventions

- **No arbitrary sleeps.** Use Playwright's auto-retrying assertions, or the
  `until()` helper for non-DOM conditions.
- **Drive sync explicitly.** The product syncs on a 60s background timer;
  tests call `POST /api/sync/now` (`node.syncNow()`) instead of waiting for it,
  which is what keeps the whole suite under half a minute.
- **Desktop viewport.** The top bar hides its "Sync now" label below the `sm`
  breakpoint, and the mobile drawer mounts a second sidebar that makes nav
  links ambiguous. The config pins 1440×900.
- **Scope table assertions.** `/stock` renders two tables (stock on hand, then
  the movement ledger) and both mention the SKU.
- **Status text is lowercase in the DOM** (`draft`, `confirmed`, `partially
  received`) — the capitalisation is CSS only.
- Selects are Radix, not native: click the trigger, then the option (there is a
  `chooseOption` helper). Options are portalled to `body`, so scope option
  clicks to the page, not the dialog.

### Debugging a failure

```bash
npx playwright test e2e/sync-two-node.spec.js   # one spec
npx playwright test -g "converge"               # one test by name
npm run test:e2e:ui                             # interactive UI mode
npm run test:e2e:report                         # open the last HTML report
```

Failures keep a trace and a screenshot under `test-results/`; open a trace with
`npx playwright show-trace <path>`. To inspect a node's database after a
failure, set `FLOWSTOCK_KEEP_DATA=1` and the temp data dirs are left in place.

## CI

`.github/workflows/ci.yml` runs lint, the Go tests, the embedded build, and the
browser suite on every push to `main` and every pull request. The Playwright
HTML report is uploaded as an artifact when the suite fails.
