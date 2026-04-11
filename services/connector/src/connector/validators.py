from __future__ import annotations

from typing import Any

from .shared_contracts import construction_states, unit_values


ALLOWED_FIRST_SLICE_FIELDS = {"package_id"}


def validate_outbound_item(item: dict[str, Any], work_packages: set[str]) -> str | None:
    field_name = item["field_name"]
    new_value = item["new_value_json"]

    if field_name not in ALLOWED_FIRST_SLICE_FIELDS:
        return f"{field_name} is outside the first-slice allowlist"

    if field_name == "package_id" and new_value not in work_packages:
        return "package_id does not exist in work_packages"

    if field_name == "construction_state" and new_value not in construction_states():
        return "invalid construction_state"

    if field_name == "unit" and new_value not in unit_values():
        return "invalid unit"

    return None


def archicad_field_name(field_name: str) -> str:
    mapping = {
        "package_id": "CCP_PackageID",
    }
    return mapping[field_name]
