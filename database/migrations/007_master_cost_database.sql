-- Separate reusable master cost items from template-specific cost assemblies.

create table if not exists public.master_cost_items (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    cost_code text not null,
    title text not null,
    trade_code text,
    package_id text,
    estimate_granularity text not null,
    costing_method text not null,
    unit text not null,
    base_rate numeric not null default 0,
    source_label text,
    source_url text,
    source_notes text,
    notes text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.master_cost_item_sources (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    master_cost_item_id text not null references public.master_cost_items(id) on delete cascade,
    source_type text not null default 'benchmark',
    source_label text not null,
    source_url text,
    source_date date,
    confidence text,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.master_cost_item_target_links (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    master_cost_item_id text not null references public.master_cost_items(id) on delete cascade,
    target_type text not null,
    target_ref text not null,
    link_basis text,
    notes text,
    created_at timestamptz not null default now()
);

alter table public.master_cost_template_items
    add column if not exists master_cost_item_id text references public.master_cost_items(id) on delete set null;

create index if not exists idx_master_cost_items_project on public.master_cost_items(project_id);
create index if not exists idx_master_cost_items_code on public.master_cost_items(project_id, cost_code);
create index if not exists idx_master_cost_item_sources_item on public.master_cost_item_sources(master_cost_item_id);
create index if not exists idx_master_cost_item_target_links_item on public.master_cost_item_target_links(master_cost_item_id);
create index if not exists idx_master_cost_template_items_source on public.master_cost_template_items(master_cost_item_id);

alter table public.master_cost_items enable row level security;
alter table public.master_cost_item_sources enable row level security;
alter table public.master_cost_item_target_links enable row level security;

drop policy if exists master_cost_items_project_access on public.master_cost_items;
create policy master_cost_items_project_access
    on public.master_cost_items
    using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));

drop policy if exists master_cost_item_sources_project_access on public.master_cost_item_sources;
create policy master_cost_item_sources_project_access
    on public.master_cost_item_sources
    using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));

drop policy if exists master_cost_item_target_links_project_access on public.master_cost_item_target_links;
create policy master_cost_item_target_links_project_access
    on public.master_cost_item_target_links
    using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));
