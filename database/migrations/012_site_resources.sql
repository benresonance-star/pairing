-- Site resources and planning highlights for acquisition/planning intelligence.

create table if not exists public.site_resources (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    site_id text not null references public.sites(id) on delete cascade,
    resource_type text not null,
    title text not null,
    url text,
    storage_path text,
    source_label text,
    notes text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.site_planning_highlights (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    site_id text not null references public.sites(id) on delete cascade,
    source_resource_id text references public.site_resources(id) on delete set null,
    council text,
    planning_scheme text,
    zoning text,
    overlays_json jsonb not null default '[]'::jsonb,
    site_area_sqm numeric,
    lot_plan text,
    heritage_status text,
    flood_status text,
    bushfire_status text,
    vegetation_status text,
    easements text,
    planning_summary text,
    source_date text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create index if not exists idx_site_resources_site on public.site_resources(project_id, site_id);
create index if not exists idx_site_resources_type on public.site_resources(project_id, resource_type);
create index if not exists idx_site_planning_highlights_site on public.site_planning_highlights(project_id, site_id);
create index if not exists idx_site_planning_highlights_status on public.site_planning_highlights(project_id, status);

alter table public.site_resources enable row level security;
alter table public.site_planning_highlights enable row level security;

drop policy if exists site_resources_project_access on public.site_resources;
create policy site_resources_project_access
    on public.site_resources
    for all
    using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));

drop policy if exists site_planning_highlights_project_access on public.site_planning_highlights;
create policy site_planning_highlights_project_access
    on public.site_planning_highlights
    for all
    using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));

notify pgrst, 'reload schema';
