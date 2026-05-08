from __future__ import annotations

from typing import Any

import pytest

from connector.archicad_writer import ArchicadWriter


class RecordingSupabaseClient:
    def __init__(self) -> None:
        self.writes: list[dict[str, Any]] = []

    def record_archicad_write(self, payload: dict[str, Any]) -> None:
        self.writes.append(payload)


class RecordingArchicadClient:
    def __init__(self) -> None:
        self.property_writes: list[dict[str, Any]] = []

    def get_product_info(self) -> dict[str, str]:
        return {"product_name": "Test", "connection": "test"}

    def read_snapshot(self) -> dict[str, Any]:
        return {"zones": [], "elements": []}

    def write_property(self, *, archicad_guid: str, field_name: str, field_value: Any) -> None:
        self.property_writes.append(
            {
                "archicad_guid": archicad_guid,
                "field_name": field_name,
                "field_value": field_value,
            }
        )


def build_item() -> dict[str, Any]:
    return {
        "change_set_id": "change-set-1",
        "field_name": "construction_state",
        "new_value_json": "blocked",
        "scenario_id": "scenario-1",
    }


def test_archicad_writer_calls_client_before_recording_non_dry_run_write() -> None:
    supabase_client = RecordingSupabaseClient()
    archicad_client = RecordingArchicadClient()
    writer = ArchicadWriter(supabase_client, archicad_client, dry_run=False)

    writer.apply_change(build_item(), "ARCHICAD-GUID-1")

    assert archicad_client.property_writes == [
        {
            "archicad_guid": "ARCHICAD-GUID-1",
            "field_name": "CCP_ConstructionState",
            "field_value": "blocked",
        }
    ]
    assert supabase_client.writes[0]["field_name"] == "CCP_ConstructionState"
    assert supabase_client.writes[0]["dry_run"] is False


def test_archicad_writer_skips_client_call_for_dry_run_write() -> None:
    supabase_client = RecordingSupabaseClient()
    archicad_client = RecordingArchicadClient()
    writer = ArchicadWriter(supabase_client, archicad_client, dry_run=True)

    writer.apply_change(build_item(), "ARCHICAD-GUID-1")

    assert archicad_client.property_writes == []
    assert supabase_client.writes[0]["dry_run"] is True


def test_archicad_writer_requires_guid_for_non_dry_run_write() -> None:
    writer = ArchicadWriter(RecordingSupabaseClient(), RecordingArchicadClient(), dry_run=False)

    with pytest.raises(ValueError, match="Archicad GUID"):
        writer.apply_change(build_item(), None)
