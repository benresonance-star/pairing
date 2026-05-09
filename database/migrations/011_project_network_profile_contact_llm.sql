-- Project Network profile detail fields for human, agentic, and synthetic identities.

alter table public.network_profiles
    add column if not exists contact_details text,
    add column if not exists preferred_llm text;
