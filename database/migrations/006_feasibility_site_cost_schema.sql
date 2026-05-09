alter table public.scenarios
add column if not exists scenario_kind text not null default 'legacy',
add column if not exists template_scenario_id uuid references public.scenarios(id) on delete set null;

alter table public.scenarios
drop constraint if exists scenarios_status_check;

alter table public.scenarios
add constraint scenarios_status_check
check (status in ('baseline', 'draft', 'active', 'archived', 'template'));

create table if not exists public.sites (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    address text not null,
    locality text,
    status text not null default 'screening',
    current_stage text,
    acquisition_status text,
    priority text,
    site_area_sqm numeric,
    summary text,
    created_at timestamptz not null default now()
);

create table if not exists public.site_constraints (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    site_id text not null references public.sites(id) on delete cascade,
    category text not null,
    title text not null,
    description text not null,
    severity text not null,
    status text,
    authority text,
    source text,
    created_at timestamptz not null default now()
);

create table if not exists public.master_cost_templates (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    description text,
    status text not null default 'active',
    template_type text,
    created_at timestamptz not null default now()
);

create table if not exists public.master_cost_template_items (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    master_cost_template_id text not null references public.master_cost_templates(id) on delete cascade,
    parent_item_id text references public.master_cost_template_items(id) on delete set null,
    cost_code text not null,
    title text not null,
    trade_code text,
    package_id text,
    estimate_granularity text not null,
    costing_method text not null,
    unit text not null,
    base_rate numeric not null default 0,
    default_quantity numeric,
    quantity_basis text,
    low_factor numeric,
    mid_factor numeric,
    high_factor numeric,
    contingency_percent numeric,
    notes text,
    sort_order integer,
    created_at timestamptz not null default now()
);

create table if not exists public.master_cost_item_links (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    master_cost_template_item_id text not null references public.master_cost_template_items(id) on delete cascade,
    target_type text not null,
    target_ref text not null,
    link_basis text,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.scenario_options (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    site_id text not null references public.sites(id) on delete cascade,
    scenario_id uuid references public.scenarios(id) on delete set null,
    scenario_template_id uuid references public.scenarios(id) on delete set null,
    master_cost_template_id text references public.master_cost_templates(id) on delete set null,
    name text not null,
    configuration text not null,
    dwellings integer,
    gross_floor_area_sqm numeric,
    planning_fit text,
    status text not null default 'testing',
    summary text,
    target_margin_percent numeric,
    created_at timestamptz not null default now()
);

create table if not exists public.scenario_cost_ranges (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_option_id text not null references public.scenario_options(id) on delete cascade,
    range_key text not null,
    label text not null,
    construction_cost numeric not null default 0,
    professional_fees numeric,
    contingency numeric,
    statutory_fees numeric,
    finance_cost numeric,
    other_costs numeric,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.sales_assumptions (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_option_id text not null references public.scenario_options(id) on delete cascade,
    gross_realisation numeric not null default 0,
    average_sale_price numeric,
    sale_rate_per_month numeric,
    settlement_months integer,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.archicad_links (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    site_id text not null references public.sites(id) on delete cascade,
    scenario_option_id text references public.scenario_options(id) on delete cascade,
    archicad_project_id text not null,
    file_label text not null,
    file_url text,
    model_scope text,
    linked_guid_count integer,
    assembly_task_ids text[] not null default '{}'::text[],
    last_snapshot_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.scenario_cost_plan_items (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_option_id text not null references public.scenario_options(id) on delete cascade,
    master_cost_template_item_id text references public.master_cost_template_items(id) on delete set null,
    parent_item_id text references public.scenario_cost_plan_items(id) on delete set null,
    cost_code text not null,
    title text not null,
    estimate_granularity text not null,
    costing_method text not null,
    unit text not null,
    quantity numeric not null default 1,
    rate numeric not null default 0,
    range_key text,
    confidence text,
    inclusion_status text,
    linked_target_type text,
    linked_target_ref text,
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_scenario_options_site_id on public.scenario_options(site_id);
create index if not exists idx_scenario_options_scenario_id on public.scenario_options(scenario_id);
create index if not exists idx_master_cost_template_items_template on public.master_cost_template_items(master_cost_template_id);
create index if not exists idx_scenario_cost_plan_items_option on public.scenario_cost_plan_items(scenario_option_id);

alter table public.sites enable row level security;
alter table public.site_constraints enable row level security;
alter table public.master_cost_templates enable row level security;
alter table public.master_cost_template_items enable row level security;
alter table public.master_cost_item_links enable row level security;
alter table public.scenario_options enable row level security;
alter table public.scenario_cost_ranges enable row level security;
alter table public.sales_assumptions enable row level security;
alter table public.archicad_links enable row level security;
alter table public.scenario_cost_plan_items enable row level security;

drop policy if exists sites_access on public.sites;
create policy sites_access on public.sites for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists site_constraints_access on public.site_constraints;
create policy site_constraints_access on public.site_constraints for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists master_cost_templates_access on public.master_cost_templates;
create policy master_cost_templates_access on public.master_cost_templates for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists master_cost_template_items_access on public.master_cost_template_items;
create policy master_cost_template_items_access on public.master_cost_template_items for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists master_cost_item_links_access on public.master_cost_item_links;
create policy master_cost_item_links_access on public.master_cost_item_links for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists scenario_options_access on public.scenario_options;
create policy scenario_options_access on public.scenario_options for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists scenario_cost_ranges_access on public.scenario_cost_ranges;
create policy scenario_cost_ranges_access on public.scenario_cost_ranges for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists sales_assumptions_access on public.sales_assumptions;
create policy sales_assumptions_access on public.sales_assumptions for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists archicad_links_access on public.archicad_links;
create policy archicad_links_access on public.archicad_links for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists scenario_cost_plan_items_access on public.scenario_cost_plan_items;
create policy scenario_cost_plan_items_access on public.scenario_cost_plan_items for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
