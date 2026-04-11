create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    archicad_project_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.model_objects (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    archicad_guid text not null,
    object_type text not null,
    classification text,
    storey text,
    zone_key text,
    hotlink_key text,
    name text,
    quantity_json jsonb,
    archicad_snapshot_json jsonb,
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint model_objects_project_guid_unique unique (project_id, archicad_guid)
);

create table if not exists public.zones (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    zone_key text not null,
    zone_name text,
    storey text,
    archicad_guid text,
    area numeric,
    metadata_json jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint zones_project_zone_key_unique unique (project_id, zone_key)
);

create table if not exists public.hotlink_instances (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    hotlink_key text not null,
    archicad_guid text,
    module_name text,
    instance_name text,
    storey text,
    metadata_json jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint hotlink_instances_project_hotlink_key_unique unique (project_id, hotlink_key)
);

create table if not exists public.work_packages (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    package_id text not null,
    package_name text not null,
    trade_code text,
    workfront text,
    description text,
    color_key text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint work_packages_project_package_id_unique unique (project_id, package_id)
);

create table if not exists public.scenarios (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    parent_scenario_id uuid references public.scenarios(id) on delete set null,
    status text not null default 'draft',
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint scenarios_status_check check (status in ('baseline', 'draft', 'active', 'archived'))
);

create table if not exists public.operational_state (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_id uuid not null references public.scenarios(id) on delete cascade,
    object_ref_type text not null,
    object_ref_id uuid not null,
    package_id text,
    sequence_group text,
    sequence_order integer,
    planned_start date,
    planned_finish date,
    actual_start date,
    actual_finish date,
    construction_state text,
    cost_code text,
    unit text,
    unit_rate numeric,
    quantity_basis numeric,
    budget_amount numeric,
    updated_by text,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint operational_state_object_ref_type_check check (object_ref_type in ('model_object', 'zone', 'hotlink_instance')),
    constraint operational_state_construction_state_check check (
        construction_state is null
        or construction_state in ('not_started', 'ready', 'in_progress', 'blocked', 'complete')
    ),
    constraint operational_state_unit_check check (
        unit is null
        or unit in ('m2', 'm3', 'lm', 'count', 'item', 'manual')
    ),
    constraint operational_state_unique_per_scenario unique (scenario_id, object_ref_type, object_ref_id)
);

create table if not exists public.change_sets (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_id uuid not null references public.scenarios(id) on delete cascade,
    title text not null,
    description text,
    status text not null default 'draft',
    submitted_by text,
    submitted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint change_sets_status_check check (
        status in ('draft', 'submitted', 'approved', 'rejected', 'queued_for_sync', 'synced', 'sync_failed')
    )
);

create table if not exists public.change_set_items (
    id uuid primary key default gen_random_uuid(),
    change_set_id uuid not null references public.change_sets(id) on delete cascade,
    object_ref_type text not null,
    object_ref_id uuid not null,
    field_name text not null,
    old_value_json jsonb,
    new_value_json jsonb,
    created_at timestamptz not null default now(),
    constraint change_set_items_object_ref_type_check check (object_ref_type in ('model_object', 'zone', 'hotlink_instance'))
);

create table if not exists public.approvals (
    id uuid primary key default gen_random_uuid(),
    change_set_id uuid not null references public.change_sets(id) on delete cascade,
    reviewer text not null,
    decision text not null,
    comment text,
    decided_at timestamptz not null default now(),
    constraint approvals_decision_check check (decision in ('approved', 'rejected'))
);

create table if not exists public.sync_runs (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_id uuid references public.scenarios(id) on delete set null,
    direction text not null,
    status text not null,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    summary_json jsonb,
    created_at timestamptz not null default now(),
    constraint sync_runs_direction_check check (direction in ('archicad_to_supabase', 'supabase_to_archicad')),
    constraint sync_runs_status_check check (status in ('running', 'completed', 'completed_with_errors', 'failed'))
);

create table if not exists public.audit_events (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    event_type text not null,
    object_ref_type text,
    object_ref_id uuid,
    actor text,
    event_time timestamptz not null default now(),
    payload_json jsonb
);

create index if not exists idx_model_objects_project_id on public.model_objects(project_id);
create index if not exists idx_model_objects_project_object_type on public.model_objects(project_id, object_type);
create index if not exists idx_model_objects_project_zone_key on public.model_objects(project_id, zone_key);
create index if not exists idx_model_objects_project_hotlink_key on public.model_objects(project_id, hotlink_key);

create index if not exists idx_zones_project_storey on public.zones(project_id, storey);

create index if not exists idx_work_packages_project_trade_code on public.work_packages(project_id, trade_code);

create index if not exists idx_scenarios_project_id on public.scenarios(project_id);
create index if not exists idx_scenarios_project_status on public.scenarios(project_id, status);

create index if not exists idx_operational_state_project_scenario on public.operational_state(project_id, scenario_id);
create index if not exists idx_operational_state_scenario_package on public.operational_state(scenario_id, package_id);
create index if not exists idx_operational_state_scenario_construction_state on public.operational_state(scenario_id, construction_state);

create index if not exists idx_change_sets_project_status on public.change_sets(project_id, status);
create index if not exists idx_change_sets_scenario_status on public.change_sets(scenario_id, status);

create index if not exists idx_change_set_items_change_set_id on public.change_set_items(change_set_id);
create index if not exists idx_change_set_items_object_ref on public.change_set_items(object_ref_type, object_ref_id);

create index if not exists idx_audit_events_project_time on public.audit_events(project_id, event_time);
create index if not exists idx_audit_events_event_type on public.audit_events(event_type);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists model_objects_set_updated_at on public.model_objects;
create trigger model_objects_set_updated_at
before update on public.model_objects
for each row execute function public.set_updated_at();

drop trigger if exists zones_set_updated_at on public.zones;
create trigger zones_set_updated_at
before update on public.zones
for each row execute function public.set_updated_at();

drop trigger if exists hotlink_instances_set_updated_at on public.hotlink_instances;
create trigger hotlink_instances_set_updated_at
before update on public.hotlink_instances
for each row execute function public.set_updated_at();

drop trigger if exists work_packages_set_updated_at on public.work_packages;
create trigger work_packages_set_updated_at
before update on public.work_packages
for each row execute function public.set_updated_at();

drop trigger if exists scenarios_set_updated_at on public.scenarios;
create trigger scenarios_set_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

drop trigger if exists operational_state_set_updated_at on public.operational_state;
create trigger operational_state_set_updated_at
before update on public.operational_state
for each row execute function public.set_updated_at();

drop trigger if exists change_sets_set_updated_at on public.change_sets;
create trigger change_sets_set_updated_at
before update on public.change_sets
for each row execute function public.set_updated_at();
