# Deploy runbook — ConstructFlow on Vercel + Supabase

This deploys the app to **Vercel** with **Supabase Postgres** as the database. It
is a pilot/demo-grade cutover: the security model (forced RLS, two roles, hashed
sessions) goes live unchanged; the known production gaps in
[`launch-readiness.md`](launch-readiness.md) (self-service password reset, object
storage for attachments, decimal-money refactor) stay deferred and are fine for a
pilot with a small number of trusted users.

## Mental model

This is a **Next.js monolith** — server actions + RSC + route handlers *are* the
backend. Vercel runs the whole app; **Supabase is only the Postgres host**. Two
roles, two pooler modes:

| Who | Role | Supabase pooler | Port |
|-----|------|-----------------|------|
| The app on Vercel (serverless) | `constructflow`, `constructflow_auth` | **Transaction** | `6543` |
| You, provisioning from your laptop | `postgres` (admin), then the two app roles | **Session** | `5432` |

TLS + a small connection pool are applied automatically for any non-local host
(`src/db/pg-options.ts`), so you only ever paste plain pooler URLs.

> The old direct connection (`db.<ref>.supabase.co:5432`) is now IPv6-only. Use
> the **pooler host** (`aws-0-<region>.pooler.supabase.com`) for everything.

---

## Part A — Supabase project + roles

1. **Create a project** at https://supabase.com → note the **Project Ref** (the
   `abcd...` in the project URL), pick a **region** close to you, and save the
   database password it generates (this is the `postgres` password).

2. **Create the two app roles.** Open **SQL Editor** (it runs as the privileged
   `postgres` role) and run — replacing the two passwords with strong secrets:

   ```sql
   -- App role: NOT a superuser, NO bypassrls → RLS is forced on it.
   create role constructflow login password '<APP_PW>';
   -- Auth role: bypasses RLS for pre-login lookups; inherits table access.
   create role constructflow_auth login password '<AUTH_PW>' bypassrls;
   grant constructflow to constructflow_auth;

   -- Let the app role create + own the tables, and let both use the schema.
   grant all on schema public to constructflow;
   grant all on schema public to constructflow_auth;
   ```

3. **Verify the auth role really has BYPASSRLS** (this is the one Supabase-version
   risk):

   ```sql
   select rolname, rolbypassrls from pg_roles
   where rolname in ('constructflow','constructflow_auth');
   -- expect:  constructflow      | f
   --          constructflow_auth | t
   ```

   - If `constructflow_auth` shows **`t`** → 👍 continue to Part B.
   - If the `create role ... bypassrls` **errored** ("permission denied") or shows
     **`f`** → your project can't grant BYPASSRLS. Ping me; I'll apply the
     **portable fallback**: drop the attribute and instead allow the auth role
     inside the RLS policies (a ~3-line change to `src/db/rls.sql`). The app code
     does not change.

---

## Part B — Provision the schema (from your laptop, once)

Use the **session pooler (5432)**. Create a throwaway env file so your real
`.env.local` is untouched:

```bash
# .env.deploy  (do not commit)
DATABASE_URL="postgresql://constructflow.<PROJECT_REF>:<APP_PW>@aws-0-<REGION>.pooler.supabase.com:5432/postgres"
AUTH_DATABASE_URL="postgresql://constructflow_auth.<PROJECT_REF>:<AUTH_PW>@aws-0-<REGION>.pooler.supabase.com:5432/postgres"
```

```bash
# point the tooling at Supabase for these commands only
set -a && . ./.env.deploy && set +a

npm run db:push      # drizzle-kit creates the 36 tables (owned by constructflow)
npm run db:rls       # enable + FORCE row-level security, create tenant policies
```

Verify RLS is forced (run in SQL Editor):

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('projects','invoices','purchase_orders','companies');
-- expect t | t on every row
```

**Demo data (optional — for a demo link):**

```bash
npm run db:seed      # seeds "Buildwell Contracting" + "Skyline Builders"
```

Demo logins (password `password123`): `admin@ / pm@ / buyer@ / stores@ /
finance@buildwell.test`, plus `admin@skyline.test` (proves tenant isolation).
Only exposed publicly if you set `NEXT_PUBLIC_DEMO_LOGINS=true` on Vercel.

> ⚠️ Do **not** run `npm run db:reset` against Supabase — it drops `schema public
> CASCADE`. The script now refuses non-local DBs unless `ALLOW_REMOTE_RESET=true`.

---

## Part C — Vercel

1. **Push the repo to GitHub** (the `saisurya96/constructflow-erp` remote is empty
   today). Decide `main` vs the current feature branch first (see the question I'll
   ask). Vercel deploys the **Production Branch** (default `main`).

2. **Import** the GitHub repo at https://vercel.com → it auto-detects Next.js.
   Set the project **region** to match your Supabase region (one round-trip per DB
   call — co-locating matters).

3. **Environment variables** (Production + Preview) — use the **transaction pooler
   (6543)**:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | `postgresql://constructflow.<PROJECT_REF>:<APP_PW>@aws-0-<REGION>.pooler.supabase.com:6543/postgres` |
   | `AUTH_DATABASE_URL` | `postgresql://constructflow_auth.<PROJECT_REF>:<AUTH_PW>@aws-0-<REGION>.pooler.supabase.com:6543/postgres` |
   | `NEXT_PUBLIC_DEMO_LOGINS` | `true` for a demo link, otherwise omit |

   `NODE_ENV=production` is set by Vercel automatically (this is what flips session
   cookies to `Secure`). `DB_POOL_MAX` is optional (defaults to 1 for remote).

4. **Deploy.** The build runs `next build` and does not touch the database (every
   app page uses `cookies()`, so nothing is statically prerendered against the DB).

---

## Part D — Smoke test after deploy

1. Open the deployment URL → the landing page renders.
2. Sign in (a demo account, or sign up a fresh company).
3. Walk one step of the spine (create a project / open the dashboard) → confirms
   the app role + RLS transaction context works through the transaction pooler.
4. **Tenant isolation:** sign in as `admin@buildwell.test`, confirm you cannot see
   Skyline's data anywhere.
5. Upload a small attachment → confirms base64-in-Postgres round-trips (8 MB cap).

---

## Known, pilot-acceptable gaps (from launch-readiness)

- No self-service "forgot password" email yet (admin can reset).
- Attachments are base64 in Postgres (8 MB cap) — not object storage.
- `drizzle-kit push` (no migration history); fine for initial provisioning, but
  move to migration files before mutating a DB that holds real client data.
- No external error reporting / rate limiting yet.

Close these before onboarding a paying client with real project data — and do the
strict security review of the auth/session + RLS paths first.
