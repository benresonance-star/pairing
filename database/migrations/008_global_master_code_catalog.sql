-- Global editable code catalog used by all projects for costing codes, trades, and packages.

create table if not exists public.master_code_catalogs (
    id text primary key,
    name text not null,
    description text,
    status text not null default 'active',
    version_label text,
    created_at timestamptz not null default now()
);

create table if not exists public.master_code_items (
    id text primary key,
    catalog_id text not null references public.master_code_catalogs(id) on delete cascade,
    parent_item_id text references public.master_code_items(id) on delete set null,
    code text not null,
    title text not null,
    code_type text not null,
    trade_code text,
    package_id text,
    default_unit text,
    default_estimate_granularity text,
    default_costing_method text,
    notes text,
    status text not null default 'active',
    sort_order integer,
    created_at timestamptz not null default now()
);

alter table public.master_cost_items
    add column if not exists master_code_item_id text references public.master_code_items(id) on delete set null;

alter table public.master_cost_template_items
    add column if not exists master_code_item_id text references public.master_code_items(id) on delete set null;

create index if not exists idx_master_code_items_catalog on public.master_code_items(catalog_id);
create index if not exists idx_master_code_items_parent on public.master_code_items(parent_item_id);
create index if not exists idx_master_code_items_type_code on public.master_code_items(code_type, code);
create unique index if not exists idx_master_code_catalogs_name_unique on public.master_code_catalogs(lower(name));
create unique index if not exists idx_master_code_items_catalog_code_unique on public.master_code_items(catalog_id, lower(code));
create index if not exists idx_master_cost_items_master_code on public.master_cost_items(master_code_item_id);
create index if not exists idx_master_cost_template_items_master_code on public.master_cost_template_items(master_code_item_id);

alter table public.master_code_catalogs enable row level security;
alter table public.master_code_items enable row level security;

drop policy if exists master_code_catalogs_global_access on public.master_code_catalogs;
create policy master_code_catalogs_global_access
    on public.master_code_catalogs
    for all
    using (false)
    with check (false);

drop policy if exists master_code_items_global_access on public.master_code_items;
create policy master_code_items_global_access
    on public.master_code_items
    for all
    using (false)
    with check (false);
