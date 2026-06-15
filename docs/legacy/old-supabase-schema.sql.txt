-- BuildFlow ERP initial Supabase/Postgres blueprint.
-- Apply after enabling Supabase Auth. These tables assume auth.uid() maps to users.id.

create type public.project_type as enum ('Construction', 'Manufacturing');
create type public.severity as enum ('critical', 'warning', 'good', 'neutral');
create type public.approval_status as enum ('Open', 'Approved', 'Rejected');
create type public.field_kind as enum ('RFI', 'Submittal', 'Daily log', 'Issue');
create type public.field_status as enum ('Draft', 'Open', 'In review', 'Answered', 'Closed');
create type public.po_status as enum ('Draft', 'Waiting approval', 'Released', 'Partially received', 'Received', 'Matched');
create type public.work_order_status as enum ('Planned', 'Released', 'Blocked', 'In production', 'Complete');
create type public.change_order_status as enum ('Potential', 'Quoted', 'Submitted', 'Approved');
create type public.report_status as enum ('Ready');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  role text not null,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  access text not null default '',
  risk public.severity not null default 'neutral',
  unique (company_id, name)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  client text not null,
  type public.project_type not null,
  location text not null,
  stage text not null,
  health public.severity not null default 'neutral',
  completion numeric not null default 0 check (completion between 0 and 100),
  deadline date,
  schedule_delta integer not null default 0,
  budget numeric not null default 0,
  committed numeric not null default 0,
  actual numeric not null default 0,
  forecast numeric not null default 0,
  billed numeric not null default 0,
  cash_collected numeric not null default 0,
  margin numeric not null default 0,
  planned_margin numeric not null default 0,
  labor_coverage numeric not null default 0,
  material_coverage numeric not null default 0,
  open_risk text not null default '',
  next_best_action text not null default '',
  created_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  score numeric not null default 0,
  risk text not null default '',
  spend numeric not null default 0,
  on_time_rate numeric not null default 0,
  defect_rate numeric not null default 0
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item text not null,
  needed numeric not null default 0,
  on_hand numeric not null default 0,
  inbound numeric not null default 0,
  unit text not null,
  eta date,
  reorder_point numeric not null default 0,
  vendor_id uuid references public.vendors(id),
  status public.severity not null default 'neutral',
  delay_days integer not null default 0,
  cost_impact numeric not null default 0,
  schedule_impact integer not null default 0,
  owner_id uuid references public.users(id),
  linked_po_id uuid
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  material_id uuid references public.materials(id),
  title text not null,
  amount numeric not null default 0,
  status public.po_status not null default 'Draft',
  ordered numeric not null default 0,
  received numeric not null default 0,
  invoice_matched boolean not null default false,
  eta date,
  owner_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  check (ordered >= 0),
  check (received >= 0),
  check (received <= ordered)
);

alter table public.materials
add constraint materials_linked_po_id_fkey
foreign key (linked_po_id) references public.purchase_orders(id);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  planned integer not null default 0,
  assigned integer not null default 0,
  productivity numeric not null default 0,
  overtime numeric not null default 0,
  status public.severity not null default 'neutral',
  skill text not null default '',
  next_blocker text not null default '',
  check (planned >= 0),
  check (assigned >= 0)
);

create table public.field_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.field_kind not null,
  title text not null,
  status public.field_status not null default 'Open',
  ball_in_court text not null default '',
  schedule_impact integer not null default 0,
  cost_impact numeric not null default 0,
  due date,
  created_at timestamptz not null default now()
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item text not null,
  quantity numeric not null default 0,
  completed numeric not null default 0,
  cell text not null default '',
  status public.work_order_status not null default 'Planned',
  bom_ready numeric not null default 0,
  labor_ready numeric not null default 0,
  due date,
  blocker text not null default '',
  check (quantity >= 0),
  check (completed >= 0),
  check (completed <= quantity),
  check (bom_ready between 0 and 100),
  check (labor_ready between 0 and 100)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  severity public.severity not null default 'neutral',
  title text not null,
  detail text not null default '',
  impact text not null default '',
  action text not null default '',
  created_at timestamptz not null default now()
);

create table public.done_actions (
  action_id uuid primary key references public.actions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  completed_by uuid references public.users(id),
  completed_at timestamptz not null default now()
);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status public.change_order_status not null default 'Potential',
  revenue numeric not null default 0,
  cost numeric not null default 0,
  schedule_impact integer not null default 0,
  owner_id uuid references public.users(id),
  approved_impact_applied boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric not null check (amount > 0),
  cash_collected numeric not null default 0,
  status text not null default 'Submitted',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.report_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  owner_role text not null default '',
  cadence text not null default ''
);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.report_views(id) on delete cascade,
  title text not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.users(id),
  status public.report_status not null default 'Ready',
  payload_json jsonb not null default '{}'::jsonb
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null,
  title text not null,
  amount numeric not null default 0,
  owner text not null default '',
  risk text not null default '',
  status public.approval_status not null default 'Open',
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.users(id),
  actor_name text not null,
  action text not null,
  target text not null,
  risk public.severity not null default 'neutral',
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.sessions enable row level security;
alter table public.projects enable row level security;
alter table public.vendors enable row level security;
alter table public.materials enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.crews enable row level security;
alter table public.field_items enable row level security;
alter table public.work_orders enable row level security;
alter table public.actions enable row level security;
alter table public.done_actions enable row level security;
alter table public.change_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.report_views enable row level security;
alter table public.report_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid()
$$;

create policy "company members read users"
on public.users for select
using (company_id = public.current_company_id());

create policy "company scoped roles"
on public.roles for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped sessions"
on public.sessions for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped projects"
on public.projects for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped vendors"
on public.vendors for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped materials"
on public.materials for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped purchase orders"
on public.purchase_orders for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped crews"
on public.crews for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped field items"
on public.field_items for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped work orders"
on public.work_orders for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped actions"
on public.actions for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped done actions"
on public.done_actions for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped change orders"
on public.change_orders for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped invoices"
on public.invoices for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped report views"
on public.report_views for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped report runs"
on public.report_runs for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped approvals"
on public.approvals for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "company scoped audit reads"
on public.audit_events for select
using (company_id = public.current_company_id());

create policy "company scoped audit inserts"
on public.audit_events for insert
with check (company_id = public.current_company_id());
