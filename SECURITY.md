# Security Policy

FlowStock is a self-hosted, offline-first inventory system: products, stock,
orders, purchasing and accounts for multi-branch businesses, kept in sync across
branches with leaderless peer sync. Security reports are taken seriously and
handled with priority.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

- Preferred: [GitHub private vulnerability reporting](https://github.com/vul-os/flowstock/security/advisories/new) on `vul-os/flowstock`.
- Alternatively, email **vulosorg@gmail.com** with `[flowstock security]` in the subject.

Include what you can: affected area (auth/session, a branch-sync path, orders or
purchasing, the accounts ledger), reproduction steps, and impact as you
understand it. You'll get an acknowledgement within **72 hours** and a status
update at least every **14 days** until resolution. Please give a reasonable
window to ship a fix before public disclosure — we'll credit you in the release
notes unless you'd rather stay anonymous.

## Scope

Especially interested in:

- **Authentication & authorization** — any path that lets a user act outside
  their role or branch scope, or that bypasses login.
- **Branch sync** — a malicious or malformed peer corrupting another branch's
  data, forging updates, or causing divergence that silently loses writes.
- **Accounts & stock integrity** — moving value or stock without authorization,
  or mutating the ledger in a way the audit trail doesn't reflect.
- **Multi-tenant isolation** — one business's data reachable from another.

Out of scope: vulnerabilities requiring an already-compromised host or an
operator with direct database access (inherent to self-hosting), and issues in
third-party services the operator configures.

## Supported versions

Only the latest release (and `main`) receives fixes.
