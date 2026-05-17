alter table public.scenario_options
    add column if not exists pinned_at timestamptz,
    add column if not exists pinned_reason text;

create index if not exists idx_scenario_options_pinned_at
    on public.scenario_options(pinned_at)
    where pinned_at is not null;
