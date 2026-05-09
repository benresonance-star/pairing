from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from .schemas import AssemblyPayload, TaskPayload


def _model_dump(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


class AssemblyEventStore:
    def __init__(self, db_path: str | Path = "buildsync_listener.sqlite3") -> None:
        self.db_path = str(db_path)
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS assemblies (
                    assembly_uuid TEXT PRIMARY KEY,
                    assembly_id TEXT,
                    name TEXT,
                    type TEXT,
                    zone TEXT,
                    level TEXT,
                    trade TEXT,
                    task_id TEXT,
                    version INTEGER,
                    status TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS assembly_members (
                    assembly_uuid TEXT,
                    element_guid TEXT,
                    element_type TEXT,
                    role TEXT,
                    member_status TEXT,
                    added_at TEXT,
                    PRIMARY KEY (assembly_uuid, element_guid)
                );

                CREATE TABLE IF NOT EXISTS sync_events (
                    event_id TEXT PRIMARY KEY,
                    event_type TEXT,
                    payload_json TEXT,
                    received_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    task_id TEXT PRIMARY KEY,
                    name TEXT,
                    stage TEXT,
                    trade TEXT
                );

                CREATE TABLE IF NOT EXISTS pending_commands (
                    command_id TEXT PRIMARY KEY,
                    type TEXT,
                    assembly_uuid TEXT,
                    status TEXT DEFAULT 'pending'
                );
                """
            )

    def record_event(self, event_type: str, payload: Any) -> str:
        event_id = str(uuid.uuid4())
        payload_json = json.dumps(_model_dump(payload), sort_keys=True)
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO sync_events (event_id, event_type, payload_json) VALUES (?, ?, ?)",
                (event_id, event_type, payload_json),
            )
        return event_id

    def upsert_assembly(self, assembly: AssemblyPayload) -> None:
        data = _model_dump(assembly)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO assemblies (
                    assembly_uuid, assembly_id, name, type, zone, level, trade, task_id,
                    version, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(assembly_uuid) DO UPDATE SET
                    assembly_id=excluded.assembly_id,
                    name=excluded.name,
                    type=excluded.type,
                    zone=excluded.zone,
                    level=excluded.level,
                    trade=excluded.trade,
                    task_id=excluded.task_id,
                    version=excluded.version,
                    status=excluded.status,
                    updated_at=excluded.updated_at
                """,
                (
                    data["assembly_uuid"],
                    data["assembly_id"],
                    data["name"],
                    data["type"],
                    data.get("zone"),
                    data.get("level"),
                    data.get("trade"),
                    data.get("task_id"),
                    data.get("version", 1),
                    data.get("status", "active"),
                    data.get("created_at"),
                    data.get("updated_at"),
                ),
            )

    def replace_members(self, assembly_uuid: str, members: list[Any]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM assembly_members WHERE assembly_uuid = ?", (assembly_uuid,))
            for member in members:
                data = _model_dump(member)
                conn.execute(
                    """
                    INSERT OR REPLACE INTO assembly_members (
                        assembly_uuid, element_guid, element_type, role, member_status, added_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data.get("assembly_uuid") or assembly_uuid,
                        data["element_guid"],
                        data["element_type"],
                        data.get("role"),
                        data.get("member_status", "active"),
                        data.get("added_at"),
                    ),
                )

    def apply_member_delta(self, assembly_uuid: str, added: list[Any], removed: list[Any], current: list[Any]) -> None:
        if current:
            self.replace_members(assembly_uuid, current)
            return
        with self._connect() as conn:
            for member in removed:
                data = _model_dump(member)
                conn.execute(
                    "DELETE FROM assembly_members WHERE assembly_uuid = ? AND element_guid = ?",
                    (assembly_uuid, data["element_guid"]),
                )
            for member in added:
                data = _model_dump(member)
                conn.execute(
                    """
                    INSERT OR REPLACE INTO assembly_members (
                        assembly_uuid, element_guid, element_type, role, member_status, added_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data.get("assembly_uuid") or assembly_uuid,
                        data["element_guid"],
                        data["element_type"],
                        data.get("role"),
                        data.get("member_status", "active"),
                        data.get("added_at"),
                    ),
                )

    def update_assembly_version(self, assembly_uuid: str, version: int) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE assemblies SET version = ? WHERE assembly_uuid = ?", (version, assembly_uuid))

    def list_tasks(self) -> list[TaskPayload]:
        with self._connect() as conn:
            rows = conn.execute("SELECT task_id, name, stage, trade FROM tasks ORDER BY task_id").fetchall()
        return [TaskPayload(**dict(row)) for row in rows]

    def upsert_task(self, task: TaskPayload) -> None:
        data = _model_dump(task)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tasks (task_id, name, stage, trade) VALUES (?, ?, ?, ?)
                ON CONFLICT(task_id) DO UPDATE SET
                    name=excluded.name,
                    stage=excluded.stage,
                    trade=excluded.trade
                """,
                (data["task_id"], data["name"], data.get("stage"), data.get("trade")),
            )

    def list_pending_commands(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT command_id, type, assembly_uuid FROM pending_commands WHERE status = 'pending' ORDER BY command_id"
            ).fetchall()
        return [dict(row) for row in rows]

    def ack_command(self, command_id: str, status: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE pending_commands SET status = ? WHERE command_id = ?", (status, command_id))

    def event_count(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM sync_events").fetchone()
        return int(row["count"])
