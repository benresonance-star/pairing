from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urljoin

import requests

from .models import ModelObjectRecord, OperationalStateRecord, SyncRunSummary, ZoneRecord
from .runtime_state import (
    RuntimeStateError,
    baseline_scenario_id,
    find_object_record,
    find_operational_state_record,
    require_active_scenario,
    normalize_runtime_state,
    transition_change_set_status,
)


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class SupabaseClientProtocol(Protocol):
    def seed_runtime_state(self) -> None: ...
    def reset_runtime_state(self) -> None: ...
    def baseline_scenario_id(self) -> str: ...
    def resolve_scenario_id(self, scenario_id: str | None = None) -> str: ...
    def create_sync_run(self, *, project_id: str, direction: str, scenario_id: str | None = None) -> str: ...
    def finalize_sync_run(self, run_id: str, summary: SyncRunSummary) -> None: ...
    def upsert_zones(self, zones: list[ZoneRecord]) -> int: ...
    def upsert_model_objects(self, model_objects: list[ModelObjectRecord]) -> int: ...
    def ensure_operational_state(self, records: list[OperationalStateRecord]) -> None: ...
    def get_work_packages(self) -> set[str]: ...
    def fetch_queued_change_sets(self) -> list[dict[str, Any]]: ...
    def get_record_guid(self, object_ref_type: str, object_ref_id: str) -> str | None: ...
    def record_archicad_write(self, payload: dict[str, Any]) -> None: ...
    def apply_change_set_item(
        self, change_set_item: dict[str, Any], *, scenario_id: str | None = None
    ) -> None: ...
    def update_change_set_status(
        self, change_set_id: str, status: str, *, errors: list[str] | None = None
    ) -> None: ...
    def create_audit_event(
        self, *, project_id: str, event_type: str, payload_json: dict[str, Any]
    ) -> None: ...


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

    def resolve_scenario_id(self, scenario_id: str | None = None) -> str:
        state = self.load_state()
        return str(require_active_scenario(state, scenario_id).get("id"))

    def create_sync_run(self, *, project_id: str, direction: str, scenario_id: str | None = None) -> str:
        state = self.load_state()
        run_id = str(uuid.uuid4())
        state["sync_runs"].append(
            {
                "id": run_id,
                "project_id": project_id,
                "scenario_id": self.resolve_scenario_id(scenario_id),
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

    def apply_change_set_item(
        self, change_set_item: dict[str, Any], *, scenario_id: str | None = None
    ) -> None:
        state = self.load_state()
        record = find_operational_state_record(
            state,
            str(change_set_item["object_ref_type"]),
            str(change_set_item["object_ref_id"]),
            scenario_id,
        )
        if record is None:
            raise RuntimeStateError(
                f"missing operational_state record for {change_set_item['object_ref_type']}:{change_set_item['object_ref_id']}"
            )
        record[change_set_item["field_name"]] = change_set_item["new_value_json"]
        record["updated_by"] = "connector"
        self.save_state(state)

    def update_change_set_status(
        self, change_set_id: str, status: str, *, errors: list[str] | None = None
    ) -> None:
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


class LiveSupabaseClient:
    def __init__(self, *, url: str, service_role_key: str, project_id: str) -> None:
        self.project_id = project_id
        self.base_url = urljoin(url.rstrip("/") + "/", "rest/v1/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
            }
        )

    def _request(
        self,
        method: str,
        table_name: str,
        *,
        params: dict[str, str] | None = None,
        payload: dict[str, Any] | list[dict[str, Any]] | None = None,
        prefer: str | None = None,
    ) -> list[dict[str, Any]]:
        headers: dict[str, str] = {}
        if prefer:
            headers["Prefer"] = prefer
        response = self.session.request(
            method,
            urljoin(self.base_url, table_name),
            params=params,
            json=payload,
            headers=headers,
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeStateError(
                f"Supabase request to '{table_name}' failed with {response.status_code}: {response.text}"
            )
        if not response.text:
            return []
        data = response.json()
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
        return []

    def _upsert(self, table_name: str, rows: list[dict[str, Any]], *, on_conflict: str) -> None:
        if not rows:
            return
        self._request(
            "POST",
            table_name,
            params={"on_conflict": on_conflict},
            payload=rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def seed_runtime_state(self) -> None:
        raise RuntimeStateError(
            "Live Supabase mode does not support 'seed-runtime'. Use the bootstrap Supabase script instead."
        )

    def reset_runtime_state(self) -> None:
        raise RuntimeStateError(
            "Live Supabase mode does not support 'reset-runtime'. Re-run the bootstrap Supabase script instead."
        )

    def baseline_scenario_id(self) -> str:
        rows = self._request(
            "GET",
            "scenarios",
            params={
                "select": "id",
                "project_id": f"eq.{self.project_id}",
                "status": "eq.baseline",
                "order": "created_at",
                "limit": "1",
            },
        )
        if not rows:
            raise RuntimeStateError(f"project '{self.project_id}' does not contain a baseline scenario")
        return str(rows[0]["id"])

    def resolve_scenario_id(self, scenario_id: str | None = None) -> str:
        if scenario_id:
            return scenario_id
        return self.baseline_scenario_id()

    def create_sync_run(self, *, project_id: str, direction: str, scenario_id: str | None = None) -> str:
        payload = {
            "project_id": project_id,
            "scenario_id": self.resolve_scenario_id(scenario_id),
            "direction": direction,
            "status": "running",
            "started_at": _now(),
            "summary_json": None,
        }
        rows = self._request(
            "POST", "sync_runs", payload=payload, prefer="return=representation"
        )
        if not rows:
            raise RuntimeStateError("Supabase did not return the created sync run")
        return str(rows[0]["id"])

    def finalize_sync_run(self, run_id: str, summary: SyncRunSummary) -> None:
        self._request(
            "PATCH",
            "sync_runs",
            params={"id": f"eq.{run_id}", "project_id": f"eq.{self.project_id}"},
            payload={
                "status": summary.status,
                "completed_at": _now(),
                "summary_json": summary.to_dict(),
            },
            prefer="return=minimal",
        )

    def upsert_zones(self, zones: list[ZoneRecord]) -> int:
        if not zones:
            return 0
        self._upsert("zones", [zone.to_dict() for zone in zones], on_conflict="id")
        return len(zones)

    def upsert_model_objects(self, model_objects: list[ModelObjectRecord]) -> int:
        if not model_objects:
            return 0
        self._upsert(
            "model_objects",
            [model_object.to_dict() for model_object in model_objects],
            on_conflict="id",
        )
        return len(model_objects)

    def ensure_operational_state(self, records: list[OperationalStateRecord]) -> None:
        if not records:
            return
        self._upsert(
            "operational_state",
            [record.to_dict() for record in records],
            on_conflict="id",
        )

    def get_work_packages(self) -> set[str]:
        rows = self._request(
            "GET",
            "work_packages",
            params={
                "select": "package_id",
                "project_id": f"eq.{self.project_id}",
                "active": "eq.true",
            },
        )
        return {str(item["package_id"]) for item in rows}

    def fetch_queued_change_sets(self) -> list[dict[str, Any]]:
        rows = self._request(
            "GET",
            "change_sets",
            params={
                "select": "*,change_set_items(*)",
                "project_id": f"eq.{self.project_id}",
                "status": "eq.queued_for_sync",
                "order": "created_at",
            },
        )
        queued: list[dict[str, Any]] = []
        for row in rows:
            payload = dict(row)
            payload["items"] = list(payload.pop("change_set_items", []) or [])
            queued.append(payload)
        return queued

    def get_record_guid(self, object_ref_type: str, object_ref_id: str) -> str | None:
        table_name = {
            "zone": "zones",
            "model_object": "model_objects",
            "hotlink_instance": "hotlink_instances",
        }.get(object_ref_type)
        if table_name is None:
            raise RuntimeStateError(f"unsupported object_ref_type '{object_ref_type}'")
        rows = self._request(
            "GET",
            table_name,
            params={
                "select": "archicad_guid",
                "project_id": f"eq.{self.project_id}",
                "id": f"eq.{object_ref_id}",
                "limit": "1",
            },
        )
        if not rows:
            return None
        value = rows[0].get("archicad_guid")
        return None if value is None else str(value)

    def record_archicad_write(self, payload: dict[str, Any]) -> None:
        self._request(
            "POST",
            "archicad_writes",
            payload={
                "project_id": self.project_id,
                "change_set_id": payload.get("change_set_id"),
                "archicad_guid": payload.get("archicad_guid"),
                "field_name": payload.get("field_name"),
                "field_value": payload.get("field_value"),
                "applied_at": payload.get("applied_at", _now()),
                "dry_run": bool(payload.get("dry_run", False)),
            },
            prefer="return=minimal",
        )

    def apply_change_set_item(
        self, change_set_item: dict[str, Any], *, scenario_id: str | None = None
    ) -> None:
        active_scenario_id = self.resolve_scenario_id(scenario_id)
        field_name = str(change_set_item["field_name"])
        rows = self._request(
            "GET",
            "operational_state",
            params={
                "select": "id",
                "project_id": f"eq.{self.project_id}",
                "scenario_id": f"eq.{active_scenario_id}",
                "object_ref_type": f"eq.{str(change_set_item['object_ref_type'])}",
                "object_ref_id": f"eq.{str(change_set_item['object_ref_id'])}",
                "limit": "1",
            },
        )
        if not rows:
            raise RuntimeStateError(
                f"missing operational_state record for {change_set_item['object_ref_type']}:{change_set_item['object_ref_id']}"
            )
        self._request(
            "PATCH",
            "operational_state",
            params={"id": f"eq.{str(rows[0]['id'])}", "project_id": f"eq.{self.project_id}"},
            payload={
                field_name: change_set_item["new_value_json"],
                "updated_by": "connector",
            },
            prefer="return=minimal",
        )

    def update_change_set_status(
        self, change_set_id: str, status: str, *, errors: list[str] | None = None
    ) -> None:
        self._request(
            "PATCH",
            "change_sets",
            params={"id": f"eq.{change_set_id}", "project_id": f"eq.{self.project_id}"},
            payload={
                "status": status,
                "sync_errors": errors or [],
            },
            prefer="return=minimal",
        )

    def create_audit_event(self, *, project_id: str, event_type: str, payload_json: dict[str, Any]) -> None:
        self._request(
            "POST",
            "audit_events",
            payload={
                "project_id": project_id,
                "event_type": event_type,
                "actor": "connector",
                "event_time": _now(),
                "payload_json": payload_json,
            },
            prefer="return=minimal",
        )
