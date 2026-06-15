# BuildFlow Product Blueprint

## Buyer

Small construction and manufacturing companies with roughly 50-100 employees that are too operationally complex for spreadsheets but do not want SAP, NetSuite, Dynamics, or Epicor implementation weight.

## Product Thesis

Legacy ERPs are strongest at system-of-record coverage. BuildFlow should win on system-of-action clarity:

- Every risk has an owner, deadline, cost impact, schedule impact, and next action.
- Field and shop-floor updates feed finance, procurement, and project schedules.
- Approvals are one inbox with audit history, not scattered emails and spreadsheet comments.
- Mobile entry is short and role-specific.

## Launch Modules

- Dashboard: action queue, risk summaries, decision simulator, audit events.
- Projects: portfolio health, forecast cost, schedule delta, margins.
- Field: RFIs, submittals, daily logs, issues, ball in court.
- Materials: inventory position, inbound receipts, shortage board.
- Procurement: PO release, receiving, three-way-match readiness.
- Production: work orders, BOM readiness, labor readiness, blockers.
- Labor: crew assignment, productivity, overtime, skill gaps.
- Money: budget, actual, committed, forecast, billing, change events.
- Approvals: change orders, POs, overtime, invoices.
- Security: roles, tenant boundaries, immutable audit preview.

## Production Gaps To Close During Migration

- Replace seeded SQLite data with Supabase tables, migrations, backups, and RLS.
- Replace local bearer sessions with Supabase Auth, tenant creation, invitations, and admin-managed role assignment.
- Add CRUD forms for projects, vendors, POs, RFIs, work orders, and approvals.
- Add file/photo upload for drawings, daily logs, receipts, invoices, and submittals.
- Add importers for spreadsheet kickoff data.
- Add accounting/payroll integration adapters.
- Add email notifications for approvals and ball-in-court changes.
- Add offline mobile queue for field/shop capture.
- Add production observability, backup restore drills, and tenant audit export.

## UX Standards

- No generic ERP mega-forms as the default screen.
- Mobile tables must collapse into cards.
- Status must be visible by text, not only color.
- Every money-moving action creates an audit event.
- Every workflow card must answer: what is this, who owns it, what happens if ignored, and what action is available?
