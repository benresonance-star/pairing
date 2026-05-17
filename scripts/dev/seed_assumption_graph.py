from __future__ import annotations

import psycopg

from bootstrap_supabase import (
    ASSUMPTION_GRAPH_TABLE_ORDER,
    apply_migrations,
    delete_seeded_records,
    insert_records,
    load_dotenv,
    load_seed_state,
    records_for_table,
    required_env,
)


def assumption_records_for_table(
    seed_state: dict[str, object],
    table_name: str,
    project_id: str,
) -> list[dict[str, object]]:
    records = records_for_table(seed_state, table_name, project_id)
    for record in records:
        record["project_id"] = project_id
    return records


def seed_assumption_graph(connection: psycopg.Connection[object], seed_state: dict[str, object], project_id: str) -> None:
    with connection.cursor() as cursor:
        for table_name in reversed(ASSUMPTION_GRAPH_TABLE_ORDER):
            rows = assumption_records_for_table(seed_state, table_name, project_id)
            delete_seeded_records(cursor, table_name, rows)
            print(f"Removed seeded {table_name} rows ({len(rows)} IDs)")

        for table_name in ASSUMPTION_GRAPH_TABLE_ORDER:
            rows = assumption_records_for_table(seed_state, table_name, project_id)
            insert_records(cursor, table_name, rows)
            print(f"Seeded {table_name} ({len(rows)} rows)")

        cursor.execute("notify pgrst, 'reload schema'")


def main() -> None:
    load_dotenv()
    connection_url = required_env("SUPABASE_DB_URL")
    project_id = required_env("PROJECT_ID")

    with psycopg.connect(connection_url, autocommit=True) as connection:
        apply_migrations(connection)
        seed_assumption_graph(connection, load_seed_state(), project_id)

    print("Supabase assumption graph seed complete")


if __name__ == "__main__":
    main()
