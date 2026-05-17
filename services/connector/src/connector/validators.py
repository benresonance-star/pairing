from __future__ import annotations

from typing import Any

from .shared_contracts import archicad_writable_fields, construction_states, operational_writable_fields


OPERATIONAL_TO_ARCHICAD_FIELD = {
    "package_id": "CCP_PackageID",
    "construction_state": "CCP_ConstructionState",
    "sequence_group": "CCP_SequenceGroup",
    "sequence_order": "CCP_SequenceOrder",
    "planned_start": "CCP_PlannedStart",
    "planned_finish": "CCP_PlannedFinish",
    "actual_start": "CCP_ActualStart",
    "actual_finish": "CCP_ActualFinish",
}

ALLOWED_FIRST_SLICE_FIELDS = set(OPERATIONAL_TO_ARCHICAD_FIELD)


def validate_writable_field_contract() -> list[str]:
    errors: list[str] = []
    operational_fields = operational_writable_fields()
    archicad_fields = archicad_writable_fields()

    for operational_field, archicad_field in OPERATIONAL_TO_ARCHICAD_FIELD.items():
        if operational_field not in operational_fields:
            errors.append(f"{operational_field} is missing from operationalWritableFields")
        if archicad_field not in archicad_fields:
            errors.append(f"{archicad_field} is missing from archicadWritableFields")

    return errors


def validate_outbound_item(item: dict[str, Any], work_packages: set[str]) -> str | None:
    field_name = item["field_name"]
    new_value = item["new_value_json"]

    if field_name not in ALLOWED_FIRST_SLICE_FIELDS:
        return f"{field_name} is outside the first-slice allowlist"

    if field_name == "package_id" and new_value is not None and new_value not in work_packages:
        return "package_id does not exist in work_packages"

    if field_name == "construction_state" and new_value is not None and new_value not in construction_states():
        return "invalid construction_state"

    return None


def archicad_field_name(field_name: str) -> str:
    return OPERATIONAL_TO_ARCHICAD_FIELD[field_name]
