from __future__ import annotations

from connector.validators import validate_outbound_item


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


def test_validate_outbound_item_rejects_non_first_slice_field() -> None:
    error = validate_outbound_item(
        {
            "field_name": "construction_state",
            "new_value_json": "ready",
        },
        {"PKG-ZONE-L08"},
    )
    assert error == "construction_state is outside the first-slice allowlist"
