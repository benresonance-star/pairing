create or replace function public.clone_scenario(
    source_scenario_id uuid,
    new_name text,
    user_id text default null
)
returns uuid
language plpgsql
as $$
declare
    source_row public.scenarios%rowtype;
    new_scenario_id uuid;
begin
    select *
    into source_row
    from public.scenarios
    where id = source_scenario_id;

    if not found then
        raise exception 'Scenario % not found', source_scenario_id;
    end if;

    insert into public.scenarios (
        project_id,
        name,
        parent_scenario_id,
        status,
        created_by
    )
    values (
        source_row.project_id,
        new_name,
        source_row.id,
        'draft',
        user_id
    )
    returning id into new_scenario_id;

    insert into public.operational_state (
        project_id,
        scenario_id,
        object_ref_type,
        object_ref_id,
        package_id,
        sequence_group,
        sequence_order,
        planned_start,
        planned_finish,
        actual_start,
        actual_finish,
        construction_state,
        cost_code,
        unit,
        unit_rate,
        quantity_basis,
        budget_amount,
        updated_by
    )
    select
        project_id,
        new_scenario_id,
        object_ref_type,
        object_ref_id,
        package_id,
        sequence_group,
        sequence_order,
        planned_start,
        planned_finish,
        actual_start,
        actual_finish,
        construction_state,
        cost_code,
        unit,
        unit_rate,
        quantity_basis,
        budget_amount,
        user_id
    from public.operational_state
    where scenario_id = source_scenario_id;

    return new_scenario_id;
end;
$$;

create or replace function public.project_summary(project_uuid uuid)
returns table (
    project_id uuid,
    project_name text,
    model_object_count bigint,
    zone_count bigint,
    scenario_count bigint,
    queued_change_set_count bigint
)
language sql
stable
as $$
    select
        p.id,
        p.name,
        (select count(*) from public.model_objects mo where mo.project_id = p.id),
        (select count(*) from public.zones z where z.project_id = p.id),
        (select count(*) from public.scenarios s where s.project_id = p.id),
        (
            select count(*)
            from public.change_sets cs
            where cs.project_id = p.id
            and cs.status = 'queued_for_sync'
        )
    from public.projects p
    where p.id = project_uuid;
$$;

create or replace function public.pending_approved_change_sets(project_uuid uuid)
returns table (
    change_set_id uuid,
    scenario_id uuid,
    title text,
    status text,
    submitted_at timestamptz,
    item_count bigint
)
language sql
stable
as $$
    select
        cs.id,
        cs.scenario_id,
        cs.title,
        cs.status,
        cs.submitted_at,
        count(csi.id) as item_count
    from public.change_sets cs
    left join public.change_set_items csi on csi.change_set_id = cs.id
    where cs.project_id = project_uuid
      and cs.status in ('approved', 'queued_for_sync')
    group by cs.id, cs.scenario_id, cs.title, cs.status, cs.submitted_at
    order by cs.created_at asc;
$$;

create or replace function public.scenario_diff(
    project_uuid uuid,
    scenario_a uuid,
    scenario_b uuid
)
returns table (
    object_ref_type text,
    object_ref_id uuid,
    package_id_a text,
    package_id_b text,
    construction_state_a text,
    construction_state_b text,
    budget_amount_a numeric,
    budget_amount_b numeric
)
language sql
stable
as $$
    with a as (
        select *
        from public.operational_state
        where project_id = project_uuid
          and scenario_id = scenario_a
    ),
    b as (
        select *
        from public.operational_state
        where project_id = project_uuid
          and scenario_id = scenario_b
    )
    select
        coalesce(a.object_ref_type, b.object_ref_type) as object_ref_type,
        coalesce(a.object_ref_id, b.object_ref_id) as object_ref_id,
        a.package_id,
        b.package_id,
        a.construction_state,
        b.construction_state,
        a.budget_amount,
        b.budget_amount
    from a
    full outer join b
      on a.object_ref_type = b.object_ref_type
     and a.object_ref_id = b.object_ref_id
    where a.package_id is distinct from b.package_id
       or a.construction_state is distinct from b.construction_state
       or a.budget_amount is distinct from b.budget_amount;
$$;

create or replace function public.bulk_validate_change_set(change_set_uuid uuid)
returns table (
    change_set_item_id uuid,
    field_name text,
    is_valid boolean,
    validation_error text
)
language sql
stable
as $$
    with items as (
        select
            csi.id,
            csi.field_name,
            csi.new_value_json,
            cs.project_id
        from public.change_set_items csi
        join public.change_sets cs on cs.id = csi.change_set_id
        where csi.change_set_id = change_set_uuid
    )
    select
        i.id,
        i.field_name,
        case
            when i.field_name not in (
                'package_id',
                'sequence_group',
                'sequence_order',
                'planned_start',
                'planned_finish',
                'actual_start',
                'actual_finish',
                'construction_state',
                'cost_code',
                'unit',
                'unit_rate',
                'quantity_basis',
                'budget_amount'
            ) then false
            when i.field_name = 'construction_state'
                 and coalesce(i.new_value_json #>> '{}', '') not in ('not_started', 'ready', 'in_progress', 'blocked', 'complete') then false
            when i.field_name = 'unit'
                 and coalesce(i.new_value_json #>> '{}', '') not in ('m2', 'm3', 'lm', 'count', 'item', 'manual') then false
            when i.field_name = 'package_id'
                 and not exists (
                    select 1
                    from public.work_packages wp
                    where wp.project_id = i.project_id
                      and wp.package_id = i.new_value_json #>> '{}'
                 ) then false
            else true
        end as is_valid,
        case
            when i.field_name not in (
                'package_id',
                'sequence_group',
                'sequence_order',
                'planned_start',
                'planned_finish',
                'actual_start',
                'actual_finish',
                'construction_state',
                'cost_code',
                'unit',
                'unit_rate',
                'quantity_basis',
                'budget_amount'
            ) then 'field is not writable'
            when i.field_name = 'construction_state'
                 and coalesce(i.new_value_json #>> '{}', '') not in ('not_started', 'ready', 'in_progress', 'blocked', 'complete') then 'invalid construction_state'
            when i.field_name = 'unit'
                 and coalesce(i.new_value_json #>> '{}', '') not in ('m2', 'm3', 'lm', 'count', 'item', 'manual') then 'invalid unit'
            when i.field_name = 'package_id'
                 and not exists (
                    select 1
                    from public.work_packages wp
                    where wp.project_id = i.project_id
                      and wp.package_id = i.new_value_json #>> '{}'
                 ) then 'package_id does not exist in work_packages'
            else null
        end as validation_error
    from items i;
$$;
