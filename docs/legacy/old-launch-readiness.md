# Launch Readiness Runbook

This runbook describes the current local launch gate for BuildFlow ERP and the production gaps that remain before using it with a real 50-100 person construction/manufacturing company.

## Current Scope

The local app is a realistic ERP foundation with authenticated workflows, company-scoped SQLite persistence, seeded roles, workflow mutations, attachment metadata, notifications, export packets, audit events, and Playwright coverage across API and UI paths. It is suitable for internal demos, stakeholder workflow validation, and migration planning.

It is not yet a multi-tenant production system. Do not use the local SQLite deployment as the system of record for real jobs, payroll, invoices, or procurement commitments.

## Required Local Gate

Run the full launch gate before handing off a build:

```bash
npm run check:launch
```

The gate runs:

- `npm run lint`
- `npm run build`
- `npm run typecheck:server`
- `npm test`
- `npm run test:prod`

`npm test` starts the integrated dev server through Playwright. `npm run test:prod` runs the built app through `npm run preview:full` on `http://127.0.0.1:4173`.

Both Playwright commands use isolated generated SQLite files under `test-results/` and clear those files before each run. This keeps CI/local validation independent from the demo database at `data/buildflow.db`.

The UI smoke setup resets the workspace through the API before signing in through the rendered login screen. The in-app `Workspace reset` control has its own smoke test, so reset remains covered without making every mobile workflow depend on that setup path.

## Production-Readiness Invariants Covered By Tests

- Authenticated API access is required for protected bootstrap and workflow endpoints.
- Login and bootstrap responses do not expose password hashes.
- Reset invalidates old sessions and logout invalidates the active session.
- Role permissions block cross-functional access for procurement, field, finance, security, and reset operations.
- Tenant/company ids are carried through auth, bootstrap, workflow mutations, attachment metadata, notifications, exports, and report payloads.
- Seeded projects, materials, purchase orders, crews, work orders, invoices, users, roles, and project-scoped rows keep valid references.
- Money and progress values stay inside launch-safe bounds such as billed <= budget, cash collected <= billed, completion between 0 and 100, received <= ordered, and completed <= quantity.
- Attachment metadata, notification create/read, and export packets persist through the backend and are exercised from the UI.
- Workflow endpoints reject malformed JSON, oversized bodies, invalid actions, missing records, and unknown routes with explicit error statuses.
- Core UI workflows remain covered on desktop and mobile, including module navigation, backend persistence, audit feedback, and mobile material cards.

## Demo Reset Procedure

Use a reset before every stakeholder demo:

```bash
npm run seed
npm run dev
```

If `npm run seed` fails after a schema change, stop the dev server and remove the generated local SQLite files in `data/` before reseeding:

```bash
rm -f data/buildflow.db data/buildflow.db-shm data/buildflow.db-wal
npm run seed
```

Then sign in with:

- Email: `admin@buildflow.local`
- Password: `buildflow`

The in-app `Workspace reset` button reseeds the database and issues a fresh admin token. Existing tokens are invalid after reset.

## Operational Gaps Before Real Production

- Replace SQLite and seeded data with Supabase/Postgres migrations, backups, restore drills, and database-enforced row-level security.
- Replace local bearer sessions with managed auth, tenant provisioning, user invitations, password reset, MFA options, and role administration.
- Expand tenant isolation from API-scoped local enforcement to database-level RLS and per-project/team membership.
- Add full CRUD for master data and transaction records instead of relying partly on seeded records and workflow-focused mutations.
- Add immutable audit retention, export, and admin review controls.
- Replace local attachment metadata with object storage and virus-scanned file/photo handling for drawings, submittals, daily logs, receipts, and invoices.
- Add accounting, payroll, procurement, email, and external notification integrations.
- Add import validation for spreadsheet/job kickoff data.
- Add monitoring, structured logs, error reporting, rate limits, deployment secrets, and backup alerts.
- Add browser/device coverage beyond Chromium before field rollout.

## Release Handoff Checklist

- Full launch gate passes on a clean checkout.
- Demo database has been reseeded.
- Known production gaps are included in the handoff notes.
- Any failed or skipped checks include the exact command, failure, and owner.
- The recipient understands this is a local prototype until the migration gaps above are closed.
