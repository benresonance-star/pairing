-- Project Network CRUD guidance: Markdown-readable capabilities and richer agent runtime cards.

alter table public.network_profile_capabilities
    add column if not exists operating_instructions_md text,
    add column if not exists constraints_md text,
    add column if not exists review_policy_md text;

alter table public.network_agent_cards
    add column if not exists persona_md text,
    add column if not exists memory_md text,
    add column if not exists skill_policy_json jsonb not null default '[]'::jsonb,
    add column if not exists review_policy_md text,
    add column if not exists escalation_policy_md text;

create unique index if not exists idx_network_profile_capabilities_profile_unique
    on public.network_profile_capabilities(project_id, profile_id);

create unique index if not exists idx_network_profile_knowledge_packs_unique
    on public.network_profile_knowledge_packs(project_id, profile_id, knowledge_pack_id);

create unique index if not exists idx_network_agent_cards_profile_unique
    on public.network_agent_cards(project_id, profile_id);
