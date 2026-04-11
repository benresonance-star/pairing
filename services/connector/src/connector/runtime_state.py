from __future__ import annotations

from typing import Any


REQUIRED_ARRAY_KEYS = (
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
)

ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"submitted"},
    "submitted": {"approved"},
    "approved": {"queued_for_sync"},
    "queued_for_sync": {"synced", "sync_failed"},
    "rejected": set(),
    "synced": set(),
    "sync_failed": set(),
}


class RuntimeStateError(ValueError):
    """Raised when the demo runtime state is malformed."""


def _require_dict(value: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeStateError(f"{context} must be an object")
    return value


def _require_str(record: dict[str, Any], key: str, *, context: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value:
        raise RuntimeStateError(f"{context} is missing required string field '{key}'")
    return value


def normalize_runtime_state(raw: Any) -> dict[str, Any]:
    state = _require_dict(raw, context="runtime state")
    project = _require_dict(state.get("project"), context="runtime state.project")

    normalized: dict[str, Any] = {
        "project": {
            "id": _require_str(project, "id", context="project"),
            "name": _require_str(project, "name", context="project"),
            "archicad_project_id": _require_str(
                project, "archicad_project_id", context="project"
            ),
        }
    }

    for key in REQUIRED_ARRAY_KEYS:
        value = state.get(key)
        if not isinstance(value, list):
            raise RuntimeStateError(f"runtime state key '{key}' must be an array")
        normalized[key] = value

    if not normalized["scenarios"]:
        raise RuntimeStateError("runtime state must contain at least one scenario")

    return normalized


def baseline_scenario_id(state: dict[str, Any]) -> str:
    first_scenario = _require_dict(state["scenarios"][0], context="runtime state.scenarios[0]")
    return _require_str(first_scenario, "id", context="baseline scenario")


def transition_change_set_status(current_status: str, next_status: str) -> None:
    allowed = ALLOWED_STATUS_TRANSITIONS.get(current_status)
    if allowed is None:
        raise RuntimeStateError(f"unknown change set status '{current_status}'")
    if next_status not in allowed:
        raise RuntimeStateError(
            f"invalid change set status transition from '{current_status}' to '{next_status}'"
        )


def object_records(state: dict[str, Any], object_ref_type: str) -> list[dict[str, Any]]:
    if object_ref_type == "zone":
        return state["zones"]
    if object_ref_type == "model_object":
        return state["model_objects"]
    raise RuntimeStateError(f"unsupported object_ref_type '{object_ref_type}'")


def find_object_record(
    state: dict[str, Any], object_ref_type: str, object_ref_id: str
) -> dict[str, Any] | None:
    for record in object_records(state, object_ref_type):
        if str(record.get("id")) == object_ref_id:
            return record
    return None


def find_operational_state_record(
    state: dict[str, Any], object_ref_type: str, object_ref_id: str
) -> dict[str, Any] | None:
    scenario_id = baseline_scenario_id(state)
    for record in state["operational_state"]:
        if (
            record.get("scenario_id") == scenario_id
            and record.get("object_ref_type") == object_ref_type
            and record.get("object_ref_id") == object_ref_id
        ):
            return record
    return None
