create or replace function public.request_project_ids()
returns uuid[]
language sql
stable
as $$
    select coalesce(
        array_agg(value::text::uuid),
        '{}'::uuid[]
    )
    from jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'app_metadata' -> 'project_ids', '[]'::jsonb)
    );
$$;

create or replace function public.has_project_access(target_project_id uuid)
returns boolean
language sql
stable
as $$
    select
        auth.role() = 'service_role'
        or target_project_id = any(public.request_project_ids());
$$;

create or replace function public.has_change_set_project_access(target_change_set_id uuid)
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.change_sets cs
        where cs.id = target_change_set_id
          and public.has_project_access(cs.project_id)
    );
$$;

alter table public.projects enable row level security;
alter table public.model_objects enable row level security;
alter table public.zones enable row level security;
alter table public.hotlink_instances enable row level security;
alter table public.work_packages enable row level security;
alter table public.scenarios enable row level security;
alter table public.operational_state enable row level security;
alter table public.change_sets enable row level security;
alter table public.change_set_items enable row level security;
alter table public.approvals enable row level security;
alter table public.sync_runs enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists projects_access on public.projects;
create policy projects_access on public.projects
for all
using (public.has_project_access(id))
with check (public.has_project_access(id));

drop policy if exists model_objects_access on public.model_objects;
create policy model_objects_access on public.model_objects
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists zones_access on public.zones;
create policy zones_access on public.zones
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists hotlink_instances_access on public.hotlink_instances;
create policy hotlink_instances_access on public.hotlink_instances
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists work_packages_access on public.work_packages;
create policy work_packages_access on public.work_packages
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists scenarios_access on public.scenarios;
create policy scenarios_access on public.scenarios
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists operational_state_access on public.operational_state;
create policy operational_state_access on public.operational_state
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists change_sets_access on public.change_sets;
create policy change_sets_access on public.change_sets
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists change_set_items_access on public.change_set_items;
create policy change_set_items_access on public.change_set_items
for all
using (public.has_change_set_project_access(change_set_id))
with check (public.has_change_set_project_access(change_set_id));

drop policy if exists approvals_access on public.approvals;
create policy approvals_access on public.approvals
for all
using (public.has_change_set_project_access(change_set_id))
with check (public.has_change_set_project_access(change_set_id));

drop policy if exists sync_runs_access on public.sync_runs;
create policy sync_runs_access on public.sync_runs
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));

drop policy if exists audit_events_access on public.audit_events;
create policy audit_events_access on public.audit_events
for all
using (public.has_project_access(project_id))
with check (public.has_project_access(project_id));
