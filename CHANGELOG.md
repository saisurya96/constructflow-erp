# Changelog

All notable work on ConstructFlow ERP. This is a single-app v1; entries are
grouped by the hardening rounds rather than semver releases.

## v1 — hardened for a pre-cloud pilot (2026-06)

A complete, internally-consistent ERP for a small construction firm: project
management woven into the material value chain, on Postgres with forced RLS.
See [`docs/launch-readiness.md`](docs/launch-readiness.md) for production status.

### Initial build
- The full workflow spine: projects/schedule/WBS → requirements → RFQ/compare/
  award → PO/subcontract → goods receipt → inventory/allocation → costing →
  billing → approvals → dashboards → audit.
- Multi-tenant isolation via Postgres Row-Level Security (forced on the app
  role); argon2 + DB-backed session auth; role-based capability matrix.
- "Blueprint" design language (warm paper, hi-vis orange, Space Grotesk, mono
  eyebrows).

### Hardening round 1 — cost-ledger correctness
- PO cancel reverses only the *outstanding* commitment; invoice overpayment
  guard + row lock; milestone double-bill guard; task progress clamped; change
  orders can be deductive; storekeeper financial leak closed.

### Hardening round 2 — forecast, concurrency, features
- EAC/forecast-at-completion (replaces the misleading `actual + committed`);
  per-WBS attribution of commitment/actual/relief; concurrency row-locks; DB
  CHECK constraints; GRN reversal/void; list pagination; printable PO/RFQ/invoice
  PDFs; attachments; multi-line RFQs.

### Hardening round 3 — final pre-cloud pass (49-issue audit)
- **Lifecycle completion** — added edit/delete/cancel/reverse across projects,
  WBS codes (+budgets), tasks, milestones, requirements, RFQs, draft POs, draft
  invoices, vendors, warehouses, users, reorder points, payments, and cost
  postings.
- **Correctness fixes** — vendor spend/on-time/defect computed live;
  requirement coverage counts received-into-stock (no false shortage); RFQ award
  blocks incomplete/zero quotes; cancelling a pending PO withdraws its approval
  and the release guard now refuses cancelled orders (no resurrection); over-
  billing guard vs contract value; removed the ignored manual "forecast" posting
  type; per-WBS budget reconciliation; correct milestone restore on void;
  stock-adjustment guarded below reserved quantity.
- **Dead-ends closed** — read-only Approvals for PM/buyer; rejection reasons
  surfaced; admin Deliveries nav; "Receive against this PO" deep link; Blueprint
  not-found/error boundaries inside the app shell.
- **New surfaces** — project commercial summary (contract/forecast/margin/
  billed-vs-contract); GRN detail view + rejected-qty capture; audit pagination
  + CSV export + entity deep-links; admin password reset / edit user; attachment
  labels + role-gated download. RFQs are now created as drafts.

### Deferred
- **Decimal/minor-unit money** — amounts round on every write (drift bounded
  sub-cent); a full integer-cents refactor is the one outstanding correctness
  item, left as future hardening.
