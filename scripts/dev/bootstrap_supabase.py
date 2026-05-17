from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg
from psycopg.sql import Identifier, Placeholder, SQL
from psycopg.types.json import Jsonb


JSON_COLUMNS = {
    "metadata_json",
    "locations_json",
    "summary_json",
    "payload_json",
    "old_value_json",
    "new_value_json",
    "field_value",
    "quantity_json",
    "archicad_snapshot_json",
    "skills_json",
    "constraints_json",
    "question_types_json",
    "output_types_json",
    "sources_json",
    "tools_json",
    "citations_json",
    "tool_policy_json",
    "skill_policy_json",
    "output_schema_json",
    "evidence_refs_json",
    "output_json",
    "overlays_json",
    "required_participant_roles_json",
    "unit_schedule_json",
    "sensitivity_ranges_json",
    "required_validation_rules_json",
    "default_value",
    "task_trigger_json",
    "local_value",
    "calculation_impact_json",
    "target_metrics_json",
    "enabled_assumption_categories_json",
    "optimisation_constraints_json",
    "sampled_values_json",
    "result_json",
}

GLOBAL_SEED_TABLE_ORDER = [
    "master_code_catalogs",
    "master_code_items",
]

ASSUMPTION_GRAPH_TABLE_ORDER = [
    "site_templates",
    "scenario_templates",
    "feasibility_templates",
    "feasibility_branches",
    "assumption_templates",
    "assumption_applications",
    "assumption_validations",
    "assumption_evidence",
    "assumption_actions",
    "simulation_templates",
    "simulation_runs",
    "simulation_samples",
]

PROJECT_SCOPED_SEED_TABLES = {
    "sites",
    "site_constraints",
    "master_cost_templates",
    "master_cost_items",
    "master_cost_item_sources",
    "master_cost_item_target_links",
    "master_cost_template_items",
    "master_cost_item_links",
    "scenario_options",
    "scenario_cost_ranges",
    "sales_assumptions",
    "archicad_links",
    "site_resources",
    "site_planning_highlights",
    *ASSUMPTION_GRAPH_TABLE_ORDER,
    "network_organisations",
    "network_profiles",
    "network_profile_capabilities",
    "network_knowledge_packs",
    "network_profile_knowledge_packs",
    "network_inquiries",
    "network_inquiry_messages",
    "network_work_products",
    "network_work_product_links",
    "network_agent_cards",
    "network_agent_sessions",
    "network_agent_session_participants",
    "network_agent_messages",
    "network_agent_tool_calls",
    "network_agent_outputs",
    "scenario_cost_plan_items",
    "work_packages",
    "scenarios",
    "zones",
    "model_objects",
    "hotlink_instances",
    "operational_state",
    "change_sets",
    "sync_runs",
    "audit_events",
    "archicad_writes",
    "location_axes",
    "linear_schedule_views",
    "linear_schedule_activities",
    "linear_progress_points",
}

SEED_TABLE_ORDER = [
    "work_packages",
    "scenarios",
    "sites",
    "site_constraints",
    "master_cost_templates",
    "master_cost_items",
    "master_cost_item_sources",
    "master_cost_item_target_links",
    "master_cost_template_items",
    "master_cost_item_links",
    "scenario_options",
    "scenario_cost_ranges",
    "sales_assumptions",
    "archicad_links",
    "site_resources",
    "site_planning_highlights",
    "site_templates",
    "scenario_templates",
    "feasibility_templates",
    "feasibility_branches",
    "assumption_templates",
    "assumption_applications",
    "assumption_validations",
    "assumption_evidence",
    "assumption_actions",
    "simulation_templates",
    "simulation_runs",
    "simulation_samples",
    "network_organisations",
    "network_profiles",
    "network_profile_capabilities",
    "network_knowledge_packs",
    "network_profile_knowledge_packs",
    "network_inquiries",
    "network_inquiry_messages",
    "network_work_products",
    "network_work_product_links",
    "network_agent_cards",
    "network_agent_sessions",
    "network_agent_session_participants",
    "network_agent_messages",
    "network_agent_tool_calls",
    "network_agent_outputs",
    "scenario_cost_plan_items",
    "zones",
    "model_objects",
    "hotlink_instances",
    "operational_state",
    "change_sets",
    "change_set_items",
    "approvals",
    "sync_runs",
    "audit_events",
    "archicad_writes",
    "location_axes",
    "linear_schedule_views",
    "linear_schedule_activities",
    "linear_progress_points",
]


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable '{name}'")
    return value


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_dotenv() -> None:
    env_path = repo_root() / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip())


def encode_value(column: str, value: object) -> object:
    if value is None:
        return None
    if column in JSON_COLUMNS:
        return Jsonb(value)
    return value


def insert_records(cursor: psycopg.Cursor[object], table_name: str, records: list[dict[str, object]]) -> None:
    if not records:
        return

    columns = list(dict.fromkeys(column for record in records for column in record.keys()))
    statement = SQL("insert into public.{} ({}) values ({})").format(
        Identifier(table_name),
        SQL(", ").join(Identifier(column) for column in columns),
        SQL(", ").join(Placeholder() for _ in columns),
    )

    values = [
        tuple(encode_value(column, record.get(column)) for column in columns)
        for record in records
    ]
    cursor.executemany(statement, values)


def records_for_table(seed_state: dict[str, object], table_name: str, project_id: str) -> list[dict[str, object]]:
    rows = seed_state.get(table_name, [])
    if not isinstance(rows, list):
        raise RuntimeError(f"Seed key '{table_name}' must be an array")
    records = [dict(row) for row in rows if isinstance(row, dict)]
    if len(records) != len(rows):
        raise RuntimeError(f"Seed key '{table_name}' must contain only objects")
    if table_name in PROJECT_SCOPED_SEED_TABLES:
        for record in records:
            record.setdefault("project_id", project_id)
    return records


def delete_seeded_records(cursor: psycopg.Cursor[object], table_name: str, records: list[dict[str, object]]) -> None:
    ids = [record.get("id") for record in records if record.get("id")]
    if not ids:
        return
    cursor.execute(
        SQL("delete from public.{} where id = any(%s)").format(Identifier(table_name)),
        (ids,),
    )


def apply_migrations(connection: psycopg.Connection[object]) -> None:
    migration_dir = repo_root() / "database" / "migrations"
    for migration_path in sorted(migration_dir.glob("*.sql")):
        sql_text = migration_path.read_text(encoding="utf-8")
        with connection.cursor() as cursor:
            cursor.execute(sql_text)
        print(f"Applied migration {migration_path.name}")
    with connection.cursor() as cursor:
        cursor.execute("notify pgrst, 'reload schema'")
    print("Requested Supabase API schema cache reload")


def load_seed_state() -> dict[str, object]:
    seed_path = repo_root() / "shared" / "examples" / "demo_state.seed.json"
    return json.loads(seed_path.read_text(encoding="utf-8"))


def seed_database(connection: psycopg.Connection[object], seed_state: dict[str, object], project_id: str) -> None:
    project = seed_state["project"]
    if not isinstance(project, dict):
        raise RuntimeError("Seed file does not contain a valid project block")
    if str(project.get("id")) != project_id:
        raise RuntimeError(
            f"Seed project id '{project.get('id')}' does not match PROJECT_ID '{project_id}'"
        )

    with connection.cursor() as cursor:
        for table_name in reversed(GLOBAL_SEED_TABLE_ORDER):
            rows = records_for_table(seed_state, table_name, project_id)
            delete_seeded_records(cursor, table_name, rows)

        cursor.execute("delete from public.projects where id = %s", (project_id,))

        for table_name in GLOBAL_SEED_TABLE_ORDER:
            rows = records_for_table(seed_state, table_name, project_id)
            insert_records(cursor, table_name, rows)
            print(f"Seeded {table_name} ({len(rows)} rows)")

        insert_records(cursor, "projects", [project])
        for table_name in SEED_TABLE_ORDER:
            rows = records_for_table(seed_state, table_name, project_id)
            insert_records(cursor, table_name, rows)
            print(f"Seeded {table_name} ({len(rows)} rows)")


def main() -> None:
    load_dotenv()
    connection_url = required_env("SUPABASE_DB_URL")
    project_id = required_env("PROJECT_ID")

    with psycopg.connect(connection_url, autocommit=True) as connection:
        apply_migrations(connection)
        seed_database(connection, load_seed_state(), project_id)

    print("Supabase bootstrap complete")


if __name__ == "__main__":
    main()
