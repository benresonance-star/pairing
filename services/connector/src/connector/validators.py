from __future__ import annotations

from typing import Any

from .shared_contracts import construction_states, unit_values


ALLOWED_FIRST_SLICE_FIELDS = {
    "package_id",
    "construction_state",
    "sequence_group",
    "sequence_order",
    "planned_start",
    "planned_finish",
    "actual_start",
    "actual_finish",
}


def validate_outbound_item(item: dict[str, Any], work_packages: set[str]) -> str | None:
    field_name = item["field_name"]
    new_value = item["new_value_json"]

    if field_name not in ALLOWED_FIRST_SLICE_FIELDS:
        return f"{field_name} is outside the first-slice allowlist"

    if field_name == "package_id" and new_value is not None and new_value not in work_packages:
        return "package_id does not exist in work_packages"

    if field_name == "construction_state" and new_value is not None and new_value not in construction_states():
        return "invalid construction_state"

    if field_name == "unit" and new_value is not None and new_value not in unit_values():
        return "invalid unit"

    return None


def archicad_field_name(field_name: str) -> str:
    mapping = {
        "package_id": "CCP_PackageID",
        "construction_state": "CCP_ConstructionState",
        "sequence_group": "CCP_SequenceGroup",
        "sequence_order": "CCP_SequenceOrder",
        "planned_start": "CCP_PlannedStart",
        "planned_finish": "CCP_PlannedFinish",
        "actual_start": "CCP_ActualStart",
        "actual_finish": "CCP_ActualFinish",
    }
    return mapping[field_name]
