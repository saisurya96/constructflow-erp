# ConstructFlow ERP

The first ERP a small construction firm actually *wants* to use. It weaves
**project management** together with the **material value chain** so a PM, a
buyer, a storekeeper and a cost/finance person each work in a screen built for
their job — and data entered once flows to everyone else.

> Built to compete with spreadsheets, WhatsApp and paper — not with SAP.

---

## The spine (enter once, flow everywhere)

```
Set up project + schedule (tasks / milestones, WBS budget)
  → PM raises a material requirement on a task
    → Buyer runs an RFQ, compares vendors, releases a PO / subcontract
      → Storekeeper posts a Goods Receipt (GRN) at the gate
        → stock rises, the PO line closes, cost posts to the job, the blocked task clears
          → Stock is allocated / issued to the task
            → Progress tracked, change orders managed, progress invoices raised
              → Dashboards + a full audit trail reflect it all live
```

## Role workspaces

| Role | Lands in | Can do |
|------|----------|--------|
| **Project Manager** | Projects, schedule, requirements | WBS budget, tasks & milestones, raise material needs, change orders |
| **Procurement / Buyer** | Sourcing inbox, RFQs, orders, vendors | RFQ → quote comparison → award → PO/subcontract, vendor directory |
| **Stores / Storekeeper** | Deliveries, goods receipts, inventory, allocations | GRN at the gate, stock ledger, reserve/issue stock (no financials) |
| **Cost & Finance** | Job costing, billing, approvals, audit | Budget vs committed vs actual vs forecast, invoices & payments, approvals |
| **Administrator** | Everything + admin | Company settings, users & roles, full oversight |

---

## Architecture

- **Next.js 16** (App Router, React Server Components) + **React 19** + **TypeScript**
- **PostgreSQL** with **Row-Level Security** — true multi-tenant isolation enforced
  at the database layer. The app connects as a non-superuser role subject to RLS;
  every request runs in a transaction pinned to the current company.
- **Drizzle ORM** for schema + queries
- **Tailwind v4** + **shadcn/ui** (base-ui) + **lucide** + **Recharts**
- Local **session auth** (argon2 + DB-backed sessions, httpOnly cookie) — swappable
  for Supabase Auth later
- Local disk for attachments — swappable for Supabase Storage later

Everything runs **locally, no cloud required**. Because the database is plain
Postgres, moving to a hosted Supabase project later is a connection-string swap.

### Key directories

```
src/
  db/            schema.ts (30+ tables), client.ts (RLS-scoped db()), rls.sql, seed.ts
  lib/           auth/ (password, session, context), rbac, audit, numbering,
                 severity, queries (cost rollup + coverage), effects (cost model)
  components/
    app/         design system (page-header, stat-card, status-badge, meters,
                 form-dialog, action-button, field, …)
    ui/          shadcn primitives
  app/
    (auth)/      login, signup
    (app)/       dashboard, projects, requirements, rfqs, orders, vendors,
                 deliveries, receipts, inventory, allocations, costing, billing,
                 approvals, audit, admin
e2e/             Playwright spine walkthrough
```

---

## Getting started

Prereqs: **Node 20+** and **PostgreSQL 17** running locally.

```bash
# 1. PostgreSQL (macOS / Homebrew)
brew install postgresql@17 && brew services start postgresql@17

# 2. Create the app + auth roles and the database (one time)
psql -d postgres <<'SQL'
CREATE ROLE constructflow      WITH LOGIN PASSWORD 'constructflow' CREATEDB;
CREATE ROLE constructflow_auth WITH LOGIN PASSWORD 'constructflow' BYPASSRLS;
GRANT constructflow TO constructflow_auth;
CREATE DATABASE constructflow_dev OWNER constructflow;
SQL

# 3. Install deps + env
npm install
cp .env.example .env.local   # then set a SESSION_SECRET

# 4. Build the schema, apply RLS, seed demo data
npm run db:setup     # drizzle-kit push + RLS policies
npm run db:seed      # demo tenant "Buildwell Contracting" + a second tenant

# 5. Run
npm run dev          # http://localhost:3000
```

> **Two database roles, on purpose.** `constructflow` is *not* a superuser and has
> RLS forced on it — so tenant isolation is real even for the app itself.
> `constructflow_auth` has `BYPASSRLS` and is used **only** for pre-login lookups
> (signup / login / session validation), where there is no tenant context yet.

### Demo logins (password `password123`)

| Role | Email |
|------|-------|
| Administrator | `admin@buildwell.test` |
| Project Manager | `pm@buildwell.test` |
| Procurement | `buyer@buildwell.test` |
| Stores | `stores@buildwell.test` |
| Cost & Finance | `finance@buildwell.test` |

A second company (**Skyline Builders**, `admin@skyline.test`) exists only to prove
RLS isolation — Buildwell users can never see its data.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:setup` | Apply schema (`drizzle-kit push`) + RLS policies |
| `npm run db:seed` | (Re)seed the demo tenants |
| `npm run db:reset` | Drop schema → setup → seed (clean slate) |
| `npm run db:studio` | Drizzle Studio |
| `npm run test:e2e` | Playwright spine walkthrough (dev server must be running) |

---

## Notes for this machine

The repo lives on an **exFAT** volume, where macOS writes `._*` AppleDouble files
for every file. Two adjustments make the toolchain happy:

- DB schema is applied with `drizzle-kit push` (the migration-snapshot path chokes
  on `._*` files).
- `dev`/`build` use the **webpack** bundler (`--webpack`); Turbopack's persistent
  cache database can't open on exFAT.

Both are transparent — captured in the npm scripts.

## Roadmap (demand-driven)

Daily site logs / RFIs, richer scheduling (CPM/Gantt), equipment & plant,
HR/timesheets, document control, accounting integrations, and the cloud cut-over
(Supabase Postgres + Auth + Storage, Vercel hosting).
