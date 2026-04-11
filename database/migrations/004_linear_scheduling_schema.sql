create table if not exists public.location_axes (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    description text,
    units_label text,
    location_reference_model text not null,
    orientation_default text not null default 'time_horizontal',
    locations_json jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint location_axes_reference_model_check check (
        location_reference_model in ('stationing', 'storey_sequence', 'named_segments')
    ),
    constraint location_axes_orientation_check check (
        orientation_default in ('time_horizontal', 'time_vertical')
    )
);

create table if not exists public.linear_schedule_views (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_id uuid references public.scenarios(id) on delete set null,
    location_axis_id uuid not null references public.location_axes(id) on delete cascade,
    name text not null,
    description text,
    time_axis_start date not null,
    time_axis_finish date not null,
    data_date date,
    orientation text not null default 'time_horizontal',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint linear_schedule_views_orientation_check check (
        orientation in ('time_horizontal', 'time_vertical')
    )
);

create table if not exists public.linear_schedule_activities (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    scenario_id uuid references public.scenarios(id) on delete set null,
    linear_schedule_view_id uuid not null references public.linear_schedule_views(id) on delete cascade,
    object_ref_type text,
    object_ref_id uuid,
    package_id text,
    workfront text,
    activity_name text not null,
    activity_type text not null,
    display_layer text not null default 'planned',
    color_key text,
    start_date date not null,
    finish_date date not null,
    location_ref text,
    start_location_ref text,
    finish_location_ref text,
    sequence_group text,
    sequence_order integer,
    metadata_json jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint linear_schedule_activities_object_ref_type_check check (
        object_ref_type is null or object_ref_type in ('model_object', 'zone', 'hotlink_instance')
    ),
    constraint linear_schedule_activities_activity_type_check check (
        activity_type in ('linear', 'bar', 'block', 'milestone')
    ),
    constraint linear_schedule_activities_display_layer_check check (
        display_layer in ('baseline', 'planned', 'actual', 'remaining')
    )
);

create table if not exists public.linear_progress_points (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    linear_schedule_activity_id uuid not null references public.linear_schedule_activities(id) on delete cascade,
    progress_date date not null,
    location_ref text not null,
    note text,
    created_at timestamptz not null default now()
);

create index if not exists idx_location_axes_project_id on public.location_axes(project_id);
create index if not exists idx_linear_schedule_views_project_id on public.linear_schedule_views(project_id);
create index if not exists idx_linear_schedule_views_scenario_id on public.linear_schedule_views(scenario_id);
create index if not exists idx_linear_schedule_activities_view on public.linear_schedule_activities(project_id, linear_schedule_view_id);
create index if not exists idx_linear_schedule_activities_package on public.linear_schedule_activities(project_id, package_id);
create index if not exists idx_linear_schedule_activities_workfront on public.linear_schedule_activities(project_id, workfront);
create index if not exists idx_linear_schedule_activities_scenario_layer on public.linear_schedule_activities(scenario_id, display_layer);
create index if not exists idx_linear_progress_points_activity on public.linear_progress_points(project_id, linear_schedule_activity_id);
create index if not exists idx_linear_progress_points_date on public.linear_progress_points(project_id, progress_date);

drop trigger if exists location_axes_set_updated_at on public.location_axes;
create trigger location_axes_set_updated_at
before update on public.location_axes
for each row execute function public.set_updated_at();

drop trigger if exists linear_schedule_views_set_updated_at on public.linear_schedule_views;
create trigger linear_schedule_views_set_updated_at
before update on public.linear_schedule_views
for each row execute function public.set_updated_at();

drop trigger if exists linear_schedule_activities_set_updated_at on public.linear_schedule_activities;
create trigger linear_schedule_activities_set_updated_at
before update on public.linear_schedule_activities
for each row execute function public.set_updated_at();

alter table public.location_axes enable row level security;
alter table public.linear_schedule_views enable row level security;
alter table public.linear_schedule_activities enable row level security;
alter table public.linear_progress_points enable row level security;

drop policy if exists location_axes_access on public.location_axes;
create policy location_axes_access on public.location_axes
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists linear_schedule_views_access on public.linear_schedule_views;
create policy linear_schedule_views_access on public.linear_schedule_views
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists linear_schedule_activities_access on public.linear_schedule_activities;
create policy linear_schedule_activities_access on public.linear_schedule_activities
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists linear_progress_points_access on public.linear_progress_points;
create policy linear_progress_points_access on public.linear_progress_points
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));
