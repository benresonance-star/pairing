-- Assumption Graph: reusable templates, applied assumptions, validations, evidence, actions, and future simulations.

create table if not exists public.site_templates (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    description text,
    locality_profile text,
    planning_authority text,
    acquisition_strategy text,
    default_finance_pack_id text,
    default_tax_rule_set_id text,
    target_margin_percent numeric,
    required_participant_roles_json jsonb not null default '[]'::jsonb,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.scenario_templates (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    description text,
    development_type text,
    dwellings numeric,
    sell_count numeric,
    retain_count numeric,
    gross_floor_area_sqm numeric,
    planning_pathway text,
    master_cost_template_id text references public.master_cost_templates(id) on delete set null,
    unit_schedule_json jsonb not null default '[]'::jsonb,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.feasibility_templates (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    description text,
    calculation_mode text not null,
    target_margin_percent numeric,
    target_net_position_ratio numeric,
    sensitivity_ranges_json jsonb not null default '{}'::jsonb,
    required_validation_rules_json jsonb not null default '[]'::jsonb,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.feasibility_branches (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    site_id text not null references public.sites(id) on delete cascade,
    scenario_option_id text references public.scenario_options(id) on delete cascade,
    scenario_id text,
    feasibility_template_id text references public.feasibility_templates(id) on delete set null,
    name text not null,
    status text not null default 'draft',
    summary text,
    target_margin_percent numeric,
    target_net_position_ratio numeric,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.assumption_templates (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    category text not null,
    assumption_kind text not null,
    impact_area text not null,
    value_type text not null default 'fixed',
    unit text,
    default_value jsonb,
    min_value numeric,
    max_value numeric,
    most_likely_value numeric,
    step numeric,
    distribution_type text,
    formula_key text,
    source_type text,
    source_ref text,
    default_validator_profile_id text references public.network_profiles(id) on delete set null,
    evidence_requirement text,
    task_trigger_json jsonb not null default '{}'::jsonb,
    enabled_for_simulation boolean not null default false,
    correlation_group text,
    notes text,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.assumption_applications (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    assumption_template_id text not null references public.assumption_templates(id) on delete cascade,
    applied_ref_type text not null,
    applied_ref_id text not null,
    feasibility_branch_id text references public.feasibility_branches(id) on delete cascade,
    local_value jsonb,
    local_min_value numeric,
    local_max_value numeric,
    local_most_likely_value numeric,
    enabled_for_simulation boolean,
    confidence text,
    status text not null default 'applied',
    calculation_impact_json jsonb not null default '{}'::jsonb,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.assumption_validations (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    assumption_application_id text not null references public.assumption_applications(id) on delete cascade,
    profile_id text not null references public.network_profiles(id) on delete cascade,
    relationship_type text not null,
    status text not null default 'pending',
    confidence text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.assumption_evidence (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    assumption_application_id text not null references public.assumption_applications(id) on delete cascade,
    evidence_type text not null,
    title text not null,
    linked_ref_type text,
    linked_ref_id text,
    url text,
    notes text,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.assumption_actions (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    assumption_application_id text not null references public.assumption_applications(id) on delete cascade,
    action_template_id text,
    title text not null,
    stage text,
    timing_offset_days integer,
    priority text not null default 'MEDIUM',
    responsible_profile_id text references public.network_profiles(id) on delete set null,
    linked_task_id text,
    risk_if_delayed text,
    status text not null default 'open',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.simulation_templates (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    description text,
    sample_count integer not null default 1000,
    target_metrics_json jsonb not null default '[]'::jsonb,
    enabled_assumption_categories_json jsonb not null default '[]'::jsonb,
    optimisation_constraints_json jsonb not null default '{}'::jsonb,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.simulation_runs (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    feasibility_branch_id text not null references public.feasibility_branches(id) on delete cascade,
    simulation_template_id text references public.simulation_templates(id) on delete set null,
    name text not null,
    status text not null default 'draft',
    sample_count integer not null default 0,
    started_at timestamptz,
    completed_at timestamptz,
    summary_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.simulation_samples (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    simulation_run_id text not null references public.simulation_runs(id) on delete cascade,
    sample_index integer not null,
    sampled_values_json jsonb not null default '{}'::jsonb,
    result_json jsonb not null default '{}'::jsonb,
    verdict text,
    created_at timestamptz not null default now()
);

create index if not exists idx_assumption_templates_project_category on public.assumption_templates(project_id, category);
create index if not exists idx_assumption_applications_ref on public.assumption_applications(project_id, applied_ref_type, applied_ref_id);
create index if not exists idx_assumption_applications_branch on public.assumption_applications(project_id, feasibility_branch_id);
create index if not exists idx_assumption_validations_profile on public.assumption_validations(project_id, profile_id, status);
create index if not exists idx_assumption_actions_project_status on public.assumption_actions(project_id, status);
create index if not exists idx_simulation_runs_branch on public.simulation_runs(project_id, feasibility_branch_id);

alter table public.site_templates enable row level security;
alter table public.scenario_templates enable row level security;
alter table public.feasibility_templates enable row level security;
alter table public.feasibility_branches enable row level security;
alter table public.assumption_templates enable row level security;
alter table public.assumption_applications enable row level security;
alter table public.assumption_validations enable row level security;
alter table public.assumption_evidence enable row level security;
alter table public.assumption_actions enable row level security;
alter table public.simulation_templates enable row level security;
alter table public.simulation_runs enable row level security;
alter table public.simulation_samples enable row level security;

drop policy if exists site_templates_access on public.site_templates;
create policy site_templates_access on public.site_templates for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists scenario_templates_access on public.scenario_templates;
create policy scenario_templates_access on public.scenario_templates for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists feasibility_templates_access on public.feasibility_templates;
create policy feasibility_templates_access on public.feasibility_templates for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists feasibility_branches_access on public.feasibility_branches;
create policy feasibility_branches_access on public.feasibility_branches for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists assumption_templates_access on public.assumption_templates;
create policy assumption_templates_access on public.assumption_templates for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists assumption_applications_access on public.assumption_applications;
create policy assumption_applications_access on public.assumption_applications for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists assumption_validations_access on public.assumption_validations;
create policy assumption_validations_access on public.assumption_validations for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists assumption_evidence_access on public.assumption_evidence;
create policy assumption_evidence_access on public.assumption_evidence for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists assumption_actions_access on public.assumption_actions;
create policy assumption_actions_access on public.assumption_actions for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists simulation_templates_access on public.simulation_templates;
create policy simulation_templates_access on public.simulation_templates for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists simulation_runs_access on public.simulation_runs;
create policy simulation_runs_access on public.simulation_runs for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists simulation_samples_access on public.simulation_samples;
create policy simulation_samples_access on public.simulation_samples for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));

notify pgrst, 'reload schema';
