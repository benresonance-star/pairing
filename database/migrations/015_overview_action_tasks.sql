-- Per-project overview dashboard action tasks (CRUD + manual sort order).

create table if not exists public.overview_action_tasks (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    sort_order integer not null,
    title text not null,
    notes text,
    priority text not null,
    link_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint overview_action_tasks_priority_check check (priority in ('HIGH', 'MEDIUM', 'LOW'))
);

create index if not exists idx_overview_action_tasks_project_sort
    on public.overview_action_tasks(project_id, sort_order);

drop trigger if exists trg_overview_action_tasks_updated_at on public.overview_action_tasks;
create trigger trg_overview_action_tasks_updated_at
    before update on public.overview_action_tasks
    for each row
    execute function public.set_updated_at();

alter table public.overview_action_tasks enable row level security;

drop policy if exists overview_action_tasks_project_access on public.overview_action_tasks;
create policy overview_action_tasks_project_access
    on public.overview_action_tasks
    for all
    using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));

notify pgrst, 'reload schema';
