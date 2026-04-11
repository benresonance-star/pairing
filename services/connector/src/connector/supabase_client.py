from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import ModelObjectRecord, OperationalStateRecord, SyncRunSummary, ZoneRecord
from .runtime_state import (
    RuntimeStateError,
    baseline_scenario_id,
    find_object_record,
    find_operational_state_record,
    normalize_runtime_state,
    transition_change_set_status,
)


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class DemoSupabaseClient:
    def __init__(self, *, seed_state_path: Path, runtime_state_path: Path) -> None:
        self.seed_state_path = seed_state_path
        self.runtime_state_path = runtime_state_path

    def seed_runtime_state(self) -> None:
        self.runtime_state_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.runtime_state_path.exists():
            if not self.seed_state_path.exists():
                raise FileNotFoundError(f"seed runtime state not found at {self.seed_state_path}")
            shutil.copyfile(self.seed_state_path, self.runtime_state_path)

    def load_state(self) -> dict[str, Any]:
        self.seed_runtime_state()
        raw = json.loads(self.runtime_state_path.read_text(encoding="utf-8"))
        return normalize_runtime_state(raw)

    def save_state(self, state: dict[str, Any]) -> None:
        self.runtime_state_path.parent.mkdir(parents=True, exist_ok=True)
        normalized = normalize_runtime_state(state)
        self.runtime_state_path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")

    def reset_runtime_state(self) -> None:
        self.runtime_state_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.seed_state_path.exists():
            raise FileNotFoundError(f"seed runtime state not found at {self.seed_state_path}")
        shutil.copyfile(self.seed_state_path, self.runtime_state_path)
        self.save_state(self.load_state())

    def baseline_scenario_id(self) -> str:
        state = self.load_state()
        return baseline_scenario_id(state)

    def create_sync_run(self, *, project_id: str, direction: str) -> str:
        state = self.load_state()
        run_id = str(uuid.uuid4())
        state["sync_runs"].append(
            {
                "id": run_id,
                "project_id": project_id,
                "scenario_id": self.baseline_scenario_id(),
                "direction": direction,
                "status": "running",
                "started_at": _now(),
                "completed_at": None,
                "summary_json": None,
            }
        )
        self.save_state(state)
        return run_id

    def finalize_sync_run(self, run_id: str, summary: SyncRunSummary) -> None:
        state = self.load_state()
        for run in state["sync_runs"]:
            if run["id"] == run_id:
                run["status"] = summary.status
                run["completed_at"] = _now()
                run["summary_json"] = summary.to_dict()
                break
        self.save_state(state)

    def upsert_zones(self, zones: list[ZoneRecord]) -> int:
        state = self.load_state()
        existing = {zone["id"]: zone for zone in state["zones"]}
        for zone in zones:
            existing[zone.id] = zone.to_dict()
        state["zones"] = list(existing.values())
        self.save_state(state)
        return len(zones)

    def upsert_model_objects(self, model_objects: list[ModelObjectRecord]) -> int:
        state = self.load_state()
        existing = {obj["id"]: obj for obj in state["model_objects"]}
        for model_object in model_objects:
            existing[model_object.id] = model_object.to_dict()
        state["model_objects"] = list(existing.values())
        self.save_state(state)
        return len(model_objects)

    def ensure_operational_state(self, records: list[OperationalStateRecord]) -> None:
        state = self.load_state()
        existing = {record["id"]: record for record in state["operational_state"]}
        for record in records:
            payload = record.to_dict()
            existing.setdefault(record.id, payload)
        state["operational_state"] = list(existing.values())
        self.save_state(state)

    def get_work_packages(self) -> set[str]:
        state = self.load_state()
        return {item["package_id"] for item in state["work_packages"] if item.get("active", True)}

    def fetch_queued_change_sets(self) -> list[dict[str, Any]]:
        state = self.load_state()
        items_by_change_set: dict[str, list[dict[str, Any]]] = {}
        for item in state["change_set_items"]:
            items_by_change_set.setdefault(item["change_set_id"], []).append(item)
        queued = [
            {**change_set, "items": items_by_change_set.get(change_set["id"], [])}
            for change_set in state["change_sets"]
            if change_set["status"] == "queued_for_sync"
        ]
        return sorted(queued, key=lambda item: str(item.get("created_at", "")))

    def get_record_guid(self, object_ref_type: str, object_ref_id: str) -> str | None:
        state = self.load_state()
        record = find_object_record(state, object_ref_type, object_ref_id)
        return None if record is None else record.get("archicad_guid")

    def record_archicad_write(self, payload: dict[str, Any]) -> None:
        state = self.load_state()
        state["archicad_writes"].append(payload)
        self.save_state(state)

    def apply_change_set_item(self, change_set_item: dict[str, Any]) -> None:
        state = self.load_state()
        record = find_operational_state_record(
            state,
            str(change_set_item["object_ref_type"]),
            str(change_set_item["object_ref_id"]),
        )
        if record is None:
            raise RuntimeStateError(
                f"missing operational_state record for {change_set_item['object_ref_type']}:{change_set_item['object_ref_id']}"
            )
        record[change_set_item["field_name"]] = change_set_item["new_value_json"]
        record["updated_by"] = "connector"
        self.save_state(state)

    def update_change_set_status(self, change_set_id: str, status: str, *, errors: list[str] | None = None) -> None:
        state = self.load_state()
        matched = False
        for change_set in state["change_sets"]:
            if change_set["id"] == change_set_id:
                transition_change_set_status(str(change_set["status"]), status)
                change_set["status"] = status
                change_set["sync_errors"] = errors or []
                matched = True
                break
        if not matched:
            raise RuntimeStateError(f"change set '{change_set_id}' was not found")
        self.save_state(state)

    def create_audit_event(self, *, project_id: str, event_type: str, payload_json: dict[str, Any]) -> None:
        state = self.load_state()
        state["audit_events"].append(
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "event_type": event_type,
                "actor": "connector",
                "event_time": _now(),
                "payload_json": payload_json,
            }
        )
        self.save_state(state)
