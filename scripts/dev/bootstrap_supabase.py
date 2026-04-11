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
}

SEED_TABLE_ORDER = [
    "work_packages",
    "scenarios",
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


def encode_value(column: str, value: object) -> object:
    if value is None:
        return None
    if column in JSON_COLUMNS:
        return Jsonb(value)
    return value


def insert_records(cursor: psycopg.Cursor[object], table_name: str, records: list[dict[str, object]]) -> None:
    if not records:
        return

    columns = list(records[0].keys())
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


def apply_migrations(connection: psycopg.Connection[object]) -> None:
    migration_dir = repo_root() / "database" / "migrations"
    for migration_path in sorted(migration_dir.glob("*.sql")):
        sql_text = migration_path.read_text(encoding="utf-8")
        with connection.cursor() as cursor:
            cursor.execute(sql_text)
        print(f"Applied migration {migration_path.name}")


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
        cursor.execute("delete from public.projects where id = %s", (project_id,))

        insert_records(cursor, "projects", [project])
        for table_name in SEED_TABLE_ORDER:
            rows = seed_state.get(table_name, [])
            if not isinstance(rows, list):
                raise RuntimeError(f"Seed key '{table_name}' must be an array")
            insert_records(cursor, table_name, rows)
            print(f"Seeded {table_name} ({len(rows)} rows)")


def main() -> None:
    connection_url = required_env("SUPABASE_DB_URL")
    project_id = required_env("PROJECT_ID")

    with psycopg.connect(connection_url, autocommit=True) as connection:
        apply_migrations(connection)
        seed_database(connection, load_seed_state(), project_id)

    print("Supabase bootstrap complete")


if __name__ == "__main__":
    main()
