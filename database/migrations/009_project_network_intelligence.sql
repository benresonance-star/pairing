-- Project Network: human and agentic participant profiles, knowledge, inquiries, and advisory outputs.

create table if not exists public.network_organisations (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    name text not null,
    organisation_type text not null,
    description text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.network_profiles (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    organisation_id text references public.network_organisations(id) on delete set null,
    display_name text not null,
    profile_type text not null,
    category text not null,
    domain text not null,
    summary text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.network_profile_capabilities (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    profile_id text not null references public.network_profiles(id) on delete cascade,
    skills_json jsonb not null default '[]'::jsonb,
    base_knowledge text,
    scope text,
    constraints_json jsonb not null default '[]'::jsonb,
    question_types_json jsonb not null default '[]'::jsonb,
    output_types_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.network_knowledge_packs (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    title text not null,
    domain text not null,
    instructions text,
    constraints_json jsonb not null default '[]'::jsonb,
    sources_json jsonb not null default '[]'::jsonb,
    tools_json jsonb not null default '[]'::jsonb,
    output_policy text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.network_profile_knowledge_packs (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    profile_id text not null references public.network_profiles(id) on delete cascade,
    knowledge_pack_id text not null references public.network_knowledge_packs(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table if not exists public.network_inquiries (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    title text not null,
    question text not null,
    status text not null default 'open',
    linked_ref_type text,
    linked_ref_id text,
    created_by text,
    created_at timestamptz not null default now()
);

create table if not exists public.network_inquiry_messages (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    inquiry_id text not null references public.network_inquiries(id) on delete cascade,
    profile_id text references public.network_profiles(id) on delete set null,
    author_label text not null,
    author_type text not null,
    message text not null,
    citations_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.network_work_products (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    inquiry_id text references public.network_inquiries(id) on delete set null,
    profile_id text references public.network_profiles(id) on delete set null,
    title text not null,
    product_type text not null,
    status text not null default 'draft',
    summary text,
    created_at timestamptz not null default now()
);

create table if not exists public.network_work_product_links (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    work_product_id text not null references public.network_work_products(id) on delete cascade,
    linked_ref_type text not null,
    linked_ref_id text not null,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.network_agent_cards (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    profile_id text not null references public.network_profiles(id) on delete cascade,
    model_label text,
    system_instructions text,
    context_policy text,
    tool_policy_json jsonb not null default '[]'::jsonb,
    output_schema_json jsonb not null default '{}'::jsonb,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.network_agent_sessions (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    inquiry_id text references public.network_inquiries(id) on delete set null,
    title text not null,
    status text not null default 'draft',
    objective text,
    linked_ref_type text,
    linked_ref_id text,
    created_at timestamptz not null default now()
);

create table if not exists public.network_agent_session_participants (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    session_id text not null references public.network_agent_sessions(id) on delete cascade,
    profile_id text not null references public.network_profiles(id) on delete cascade,
    session_role text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.network_agent_messages (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    session_id text not null references public.network_agent_sessions(id) on delete cascade,
    profile_id text references public.network_profiles(id) on delete set null,
    author_label text not null,
    message_role text not null,
    content text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.network_agent_tool_calls (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    session_id text not null references public.network_agent_sessions(id) on delete cascade,
    profile_id text references public.network_profiles(id) on delete set null,
    tool_name text not null,
    input_summary text,
    output_summary text,
    evidence_refs_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.network_agent_outputs (
    id text primary key,
    project_id uuid not null references public.projects(id) on delete cascade,
    session_id text not null references public.network_agent_sessions(id) on delete cascade,
    profile_id text references public.network_profiles(id) on delete set null,
    output_type text not null,
    title text not null,
    summary text,
    output_json jsonb not null default '{}'::jsonb,
    status text not null default 'draft',
    created_at timestamptz not null default now()
);

create index if not exists idx_network_profiles_project on public.network_profiles(project_id);
create index if not exists idx_network_profiles_category on public.network_profiles(project_id, category);
create index if not exists idx_network_inquiries_project on public.network_inquiries(project_id, status);
create index if not exists idx_network_work_products_project on public.network_work_products(project_id, status);
create index if not exists idx_network_agent_sessions_project on public.network_agent_sessions(project_id, status);

alter table public.network_organisations enable row level security;
alter table public.network_profiles enable row level security;
alter table public.network_profile_capabilities enable row level security;
alter table public.network_knowledge_packs enable row level security;
alter table public.network_profile_knowledge_packs enable row level security;
alter table public.network_inquiries enable row level security;
alter table public.network_inquiry_messages enable row level security;
alter table public.network_work_products enable row level security;
alter table public.network_work_product_links enable row level security;
alter table public.network_agent_cards enable row level security;
alter table public.network_agent_sessions enable row level security;
alter table public.network_agent_session_participants enable row level security;
alter table public.network_agent_messages enable row level security;
alter table public.network_agent_tool_calls enable row level security;
alter table public.network_agent_outputs enable row level security;

drop policy if exists network_organisations_access on public.network_organisations;
create policy network_organisations_access on public.network_organisations for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_profiles_access on public.network_profiles;
create policy network_profiles_access on public.network_profiles for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_profile_capabilities_access on public.network_profile_capabilities;
create policy network_profile_capabilities_access on public.network_profile_capabilities for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_knowledge_packs_access on public.network_knowledge_packs;
create policy network_knowledge_packs_access on public.network_knowledge_packs for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_profile_knowledge_packs_access on public.network_profile_knowledge_packs;
create policy network_profile_knowledge_packs_access on public.network_profile_knowledge_packs for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_inquiries_access on public.network_inquiries;
create policy network_inquiries_access on public.network_inquiries for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_inquiry_messages_access on public.network_inquiry_messages;
create policy network_inquiry_messages_access on public.network_inquiry_messages for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_work_products_access on public.network_work_products;
create policy network_work_products_access on public.network_work_products for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_work_product_links_access on public.network_work_product_links;
create policy network_work_product_links_access on public.network_work_product_links for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_agent_cards_access on public.network_agent_cards;
create policy network_agent_cards_access on public.network_agent_cards for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_agent_sessions_access on public.network_agent_sessions;
create policy network_agent_sessions_access on public.network_agent_sessions for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_agent_session_participants_access on public.network_agent_session_participants;
create policy network_agent_session_participants_access on public.network_agent_session_participants for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_agent_messages_access on public.network_agent_messages;
create policy network_agent_messages_access on public.network_agent_messages for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_agent_tool_calls_access on public.network_agent_tool_calls;
create policy network_agent_tool_calls_access on public.network_agent_tool_calls for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
drop policy if exists network_agent_outputs_access on public.network_agent_outputs;
create policy network_agent_outputs_access on public.network_agent_outputs for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));
