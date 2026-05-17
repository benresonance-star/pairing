-- Codify participant roles on applied assumptions and enforce one accountable owner.

update public.assumption_validations
set relationship_type = 'accountable_owner'
where relationship_type in ('owns_risk', 'owns_strategy');

alter table public.assumption_validations
drop constraint if exists assumption_validations_relationship_type_check;

alter table public.assumption_validations
add constraint assumption_validations_relationship_type_check
check (
    relationship_type in (
        'accountable_owner',
        'validates_assumption',
        'provides_evidence',
        'approves_strategy',
        'challenges',
        'watcher'
    )
);

create unique index if not exists idx_assumption_validations_unique_role
on public.assumption_validations(assumption_application_id, profile_id, relationship_type);

create unique index if not exists idx_assumption_validations_one_owner
on public.assumption_validations(assumption_application_id)
where relationship_type = 'accountable_owner';

notify pgrst, 'reload schema';
