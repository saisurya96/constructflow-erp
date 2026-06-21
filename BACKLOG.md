# ConstructFlow — Backlog

Open work after the **demo-readiness roundup** (2026-06-21). The roundup fixed
~60 of an 88-finding adversarial audit; what remains is captured here so any
future session or teammate can pick it up. Items reference the audit finding
numbers where they exist.

> History: see commits `c8ff247` (roundup) and `defe00e` (auto-unblock fix +
> deferred owned-file hardening). Full audit detail was generated at
> `/tmp/audit-full.md` during the roundup session.

---

## 0. Deploy follow-up (do once, after a deploy)

- [ ] **Re-apply RLS on production** — `src/db/rls.sql` now makes `audit_events`
  append-only (SELECT/INSERT-only policies + `revoke update, delete`). It only
  takes effect after `npm run db:rls` is run against the live Supabase DB. The
  app works without it; this just enforces audit immutability. **No schema
  migration is needed** (the roundup used soft pre-checks, not new indexes).

---

## 1. Product decisions (need a call before building)

- [ ] **Segregation of duties** (#43) — let firms require a *second* approver so an
  admin can't approve their own PO/CO. Add a `companies.requireSecondApprover`
  flag (default false → keeps the single-admin demo working), gate
  `decideApproval` on `approved && flag && requestedBy === ctx.userId`, and show a
  "Your request" pill instead of Approve in the UI. Needs a schema migration.
- [ ] **3-decimal currencies** (#21) — BHD / KWD / OMR are truncated to 2dp in
  storage and on tax invoices. Proper support needs currency-aware minor units
  and a `numeric(_,3)`-capable money column (schema change). Not blocking for
  US/UK/EU/AED demos.
- [ ] **Login rate-limiting / lockout** (#23/#53) — no throttle on password
  guessing. Serverless makes in-memory useless; needs a DB-backed attempt
  counter (or an edge/WAF rule). Low priority for controlled demos.
- [ ] **Account enumeration on signup** (#52) — signup reveals whether an email is
  already registered. Intentional UX trade-off today; revisit if it matters.

## 2. Net-new features (additive, not bugs)

- [ ] **Stock-movement history view** (#29) — `inventory_movements` is write-only;
  there's no UI to see receipts / issues / adjustments per item. Add a movements
  panel on the inventory item / page.
- [ ] **Reverse an applied change order** (#88) — an approved CO permanently grows
  budget / contract value / end date with no un-apply path. Add a guarded
  `reverseChangeOrder` that posts the offsetting budget adjustment and subtracts
  the schedule days.
- [ ] **Self-service teammate invites** — the `invitations` table is scaffolded but
  unwired. *Decided not needed for now* (admin can create unlimited users/emails,
  multiple per role). Revisit if "let teammates set their own password via a
  link" becomes desirable (copyable link = no email infra; auto-email = needs a
  provider like Resend/SMTP).

## 3. Costing precision (known limitations)

- [ ] **GRN-reversal cost basis** (#19/#74) — reversal backs stock out at the
  receipt's landed cost using the *current* weighted average; an intervening
  cost-changing adjustment can leave a slightly wrong unit cost on residual
  stock. A correct fix needs FIFO / cost-layer tracking.
- [ ] **Sub-cent commitment residual** (#87) — per-receipt rounding can leave a
  sub-cent open commitment after a PO is fully received. Cosmetic at the cent
  level (forecast uses `max(budget, incurred)`), but worth a reconcile-to-zero on
  final receipt.

## 4. Cosmetic dead code (zero behavior change)

- [ ] **Dead `approved` PO status** (#57/#66) — the `po_status` enum has `approved`
  but no code path ever writes it (approval releases straight to `released`).
  Remove it from the runtime INBOUND/OPEN arrays in `effects.ts`,
  `lib/queries.ts`, `orders/page.tsx`, `requirements/page.tsx`,
  `allocations/page.tsx`, `orders/[id]/page.tsx`, `vendors/[id]/page.tsx`.
  Dropping the enum *value* itself needs a Postgres migration.
- [ ] **Dead `damaged` GRN condition** (#72) — `grn_line_condition` has `damaged`
  but the receipt form only offers accepted/rejected, so it's never written. Add
  a "damaged" option or drop the value.
- [ ] **Fully-rejected delivery signal** (#73) — a 100%-rejected GRN correctly
  leaves the PO outstanding (vendor owes a redelivery) but gives no UI hint that
  one is owed.

## 5. Polish (low)

- [ ] Raw `money()` values (no symbol/grouping) still leak into a few server-action
  error/audit *strings* (#58).
- [ ] Optimistic Kanban board reverts *all* local task state on a failed/concurrent
  move (#69); Gantt bars can render past the chart's right edge (#70); board
  drag-drop has no touch support on mobile/tablet (#81).
- [ ] Audit `entityId` is omitted on a few create events (#51) — harmless today
  (tasks/milestones/WBS have no standalone detail route to deep-link to).
