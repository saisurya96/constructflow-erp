# Launch Readiness — ConstructFlow ERP

Where the current build stands against a real production deployment for a small
construction firm. The app is a **complete, internally-consistent v1** running
on PostgreSQL with database-enforced multi-tenant isolation — suitable for
pilots, stakeholder demos, and migration planning. It is **not yet wired to
managed cloud infrastructure**; see the gaps below for the cloud cutover.

> The previous SQLite/"BuildFlow" prototype runbook is archived at
> [`legacy/old-launch-readiness.md`](legacy/old-launch-readiness.md). It describes
> a different, earlier codebase and does not apply to this app.

## What's production-grade today

- **Tenant isolation at the database.** Postgres Row-Level Security, *forced* on
  the app role (`constructflow`, a non-superuser). A separate `constructflow_auth`
  role with `BYPASSRLS` is used only for pre-login lookups. A second seeded
  company proves Buildwell users can never see Skyline's data.
- **Auth.** Argon2-hashed passwords; hashed, DB-backed sessions (30-day expiry,
  validated per request); httpOnly cookie. Deactivation/role changes take effect
  on the next request. Admin can reset a user's password.
- **RBAC.** A capability matrix per role gates every server action and page
  loader; nav is role-scoped; requesters get read-only views where appropriate.
- **The full workflow spine, end to end.** Plan → requirement → RFQ/compare/award
  → PO → GRN at the gate → stock/allocation → progress/change-orders → billing →
  dashboards + audit, with a **trustworthy cost ledger**: commitment on release,
  actual + commitment relief on receipt, EAC forecast, per-WBS attribution,
  row-locks, and GRN reversal.
- **Complete CRUD lifecycles.** Create / edit / delete / cancel / reverse across
  projects, WBS codes, tasks, milestones, requirements, RFQs, purchase orders,
  invoices, payments, vendors, warehouses, users, and cost postings (2026-06
  hardening pass). Mistakes are correctable; states the schema models are
  reachable.
- **Guardrails.** Over-billing vs contract value; RFQ award blocks incomplete /
  zero-value quotes; cancelling a pending PO withdraws its approval (no
  "resurrection"); stock adjustments can't drop below reserved; concurrency
  row-locks + DB CHECK constraints.
- **Audit trail.** Every consequential action recorded with actor, summary, risk
  and entity link; paginated; CSV export.
- **Crafted UX.** "Blueprint" design language, text-first status (not colour
  only), responsive/mobile, labelled controls, styled not-found/error pages.

## Gaps before real production (cloud cutover)

- **Hosting & database.** Move local Postgres → managed Supabase/Postgres:
  proper migrations (currently `drizzle-kit push`), automated backups + restore
  drills, connection pooling. *RLS and the schema already match a hosted
  Postgres, so this is largely a connection-string + migrations exercise.*
- **Auth.** Add a self-service **forgot-password email** flow and optional MFA
  (admin-initiated reset exists today); optionally swap local sessions for
  Supabase Auth.
- **Attachments.** Currently stored **inline as base64 in the DB** (8 MB cap).
  Move to object storage (Supabase Storage) with virus scanning; add an
  attachment-download audit event.
- **Observability.** Structured logs, external error reporting, rate limits,
  deployment secret management, backup alerts. (An app error boundary exists; no
  external reporting yet.)
- **Decimal money.** Monetary amounts are `numeric`, rounded on every write
  (`money()`/`quantity()`), so float drift is bounded sub-cent — but a full
  integer-minor-unit refactor is the one deliberately deferred correctness item.
- **Integrations & import.** Accounting / payroll / email / notification
  adapters; spreadsheet job-kickoff import with validation.
- **Testing.** Broaden the Playwright spine walkthrough; cross-browser/device
  coverage before field rollout.

## Local gate before a handoff

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, expect 0/0
npm run db:reset       # rebuild schema, RE-APPLY RLS, reseed both demo tenants
npm run dev            # http://localhost:3000
```

- ⚠️ **`drizzle-kit push` drops RLS policies** (they live in `apply-rls`, not the
  schema). `db:reset`/`db:setup` re-apply them — but after any manual `db:push`,
  run `npm run db:rls`. Verify with:
  ```sql
  select relname, relrowsecurity, relforcerowsecurity
  from pg_class where relname in ('projects','invoices','purchase_orders');
  -- expect t | t on every row
  ```
- Demo logins (password `password123`): `admin@ / pm@ / buyer@ / stores@ /
  finance@buildwell.test`. Second tenant: `admin@skyline.test`.

## Handoff checklist

- [ ] `typecheck` + `lint` clean on a fresh checkout
- [ ] `db:reset` succeeds and RLS is forced (`t|t`) on tenant tables
- [ ] App boots and the spine walkthrough passes end to end
- [ ] Open production gaps above are in the handoff notes
- [ ] Recipient understands this is a local build until the cloud gaps are closed
