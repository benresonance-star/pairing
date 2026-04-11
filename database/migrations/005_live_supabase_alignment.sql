alter table public.change_sets
add column if not exists sync_errors text[] not null default '{}'::text[];

alter table public.linear_schedule_views
add column if not exists metadata_json jsonb;

create table if not exists public.archicad_writes (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    change_set_id uuid references public.change_sets(id) on delete set null,
    archicad_guid text,
    field_name text not null,
    field_value jsonb,
    applied_at timestamptz not null default now(),
    dry_run boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists idx_archicad_writes_project_applied_at
on public.archicad_writes(project_id, applied_at desc);

create index if not exists idx_archicad_writes_change_set_id
on public.archicad_writes(change_set_id);

alter table public.archicad_writes enable row level security;

drop policy if exists archicad_writes_access on public.archicad_writes;
create policy archicad_writes_access on public.archicad_writes
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));
