-- Row-Level Security: tenant isolation enforced at the database layer.
--
-- The app connects as role `constructflow` (NOT a superuser, NO bypassrls), so
-- FORCE ROW LEVEL SECURITY applies even though it owns the tables. Each request
-- opens a transaction and runs `set_config('app.current_company_id', <uuid>, true)`;
-- every policy then filters rows to that tenant. The `constructflow_auth` role has
-- BYPASSRLS and is used only for pre-tenant lookups (signup / login / sessions).
--
-- This file is idempotent and re-applied on every migrate.

create or replace function public.current_company_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_company_id', true), '')::uuid
$$;

do $$
declare
  t text;
  tenant_tables text[] := array[
    'users','sessions','invitations','number_sequences','vendors','projects',
    'project_members','wbs_codes','tasks','task_dependencies',
    'task_checklist_items','task_comments','milestones',
    'project_requirements','rfqs','rfq_lines','rfq_vendors','vendor_quotes',
    'vendor_quote_lines','purchase_orders','purchase_order_lines','warehouses',
    'goods_receipts','goods_receipt_lines','inventory_items','inventory_movements',
    'inventory_allocations','change_orders','cost_postings','invoices',
    'invoice_lines','payments','approvals','attachments','audit_events'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I using (company_id = public.current_company_id()) with check (company_id = public.current_company_id())',
      t
    );
  end loop;

  -- audit_events is append-only. Replace the generic all-command policy with
  -- tenant-scoped SELECT + INSERT only; with FORCE RLS and no UPDATE/DELETE
  -- policy those commands match zero rows. Also revoke the mutating table grants
  -- as defence in depth — including TRUNCATE, which bypasses RLS and would
  -- otherwise let the whole log be wiped. An audit trail you can edit or erase
  -- isn't an audit trail.
  execute 'drop policy if exists tenant_isolation on public.audit_events';
  execute 'create policy audit_select on public.audit_events for select using (company_id = public.current_company_id())';
  execute 'create policy audit_insert on public.audit_events for insert with check (company_id = public.current_company_id())';
  execute 'revoke update, delete, truncate on public.audit_events from constructflow';

  -- companies is keyed by `id` (not `company_id`)
  execute 'alter table public.companies enable row level security';
  execute 'alter table public.companies force row level security';
  execute 'drop policy if exists tenant_isolation on public.companies';
  execute 'create policy tenant_isolation on public.companies using (id = public.current_company_id()) with check (id = public.current_company_id())';
end $$;
