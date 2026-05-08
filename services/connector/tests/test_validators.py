from __future__ import annotations

from connector.validators import archicad_field_name, validate_outbound_item


def test_validate_outbound_item_accepts_known_package() -> None:
    error = validate_outbound_item(
        {
            "field_name": "package_id",
            "new_value_json": "PKG-ZONE-L08",
        },
        {"PKG-ZONE-L08"},
    )
    assert error is None


def test_validate_outbound_item_rejects_unknown_package() -> None:
    error = validate_outbound_item(
        {
            "field_name": "package_id",
            "new_value_json": "PKG-UNKNOWN",
        },
        {"PKG-ZONE-L08"},
    )
    assert error == "package_id does not exist in work_packages"


def test_validate_outbound_item_accepts_governed_scenario_fields() -> None:
    error = validate_outbound_item(
        {
            "field_name": "construction_state",
            "new_value_json": "ready",
        },
        {"PKG-ZONE-L08"},
    )
    assert error is None


def test_validate_outbound_item_rejects_unknown_field() -> None:
    error = validate_outbound_item(
        {
            "field_name": "cost_code",
            "new_value_json": "COST-01",
        },
        {"PKG-ZONE-L08"},
    )
    assert error == "cost_code is outside the first-slice allowlist"


def test_archicad_field_name_maps_scenario_operational_fields() -> None:
    assert archicad_field_name("construction_state") == "CCP_ConstructionState"
    assert archicad_field_name("planned_start") == "CCP_PlannedStart"
