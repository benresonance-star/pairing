from __future__ import annotations

from scripts.dev.archicad_bridge import (
    buildsync_assembly,
    dedupe_zones_for_snapshot,
    element_area,
    layer_name_from_value,
    story_display,
)


def test_layer_name_from_value_maps_archicad_control_character_to_default_layer() -> None:
    names_by_index = {1: "Archicad Layer", 20: "MEP - Electrical"}

    assert layer_name_from_value("\x14", names_by_index) == "Archicad Layer"


def test_layer_name_from_value_preserves_string_layer_names() -> None:
    assert layer_name_from_value("Archicad Layer", {1: "Other"}) == "Archicad Layer"


def test_dedupe_zones_for_snapshot_uses_connector_zone_key() -> None:
    zones = [
        {"archicad_guid": "zone-guid-1", "zone_number": "01", "storey": None, "ccp_operational": {}},
        {"archicad_guid": "zone-guid-2", "zone_number": "02", "storey": None, "ccp_operational": {}},
        {"archicad_guid": "zone-guid-3", "zone_number": "01", "storey": None, "ccp_operational": {}},
    ]

    assert dedupe_zones_for_snapshot(zones) == zones[:2]


def test_story_display_infers_home_storey_from_top_link_story() -> None:
    assert story_display(
        {"top_link_story": "Home + 1 (1. Story)"},
        {0: {"name": "Ground Floor", "floor_level": 0.0}, 1: {"name": "Storeys", "floor_level": 3.0}},
    ) == "Ground Floor"


def test_story_display_infers_home_storey_from_named_top_link_story() -> None:
    assert story_display(
        {"top_link_story": "Home + 1 (Level 1)"},
        {0: {"name": "Ground Floor", "floor_level": 0.0}, 1: {"name": "Level 1", "floor_level": 3.0}},
    ) == "Ground Floor"


def test_story_display_falls_back_to_elevation_to_story() -> None:
    assert story_display(
        {"elevation_to_story": 0.1},
        {0: {"name": "Ground Floor", "floor_level": 0.0}, 1: {"name": "Storeys", "floor_level": 3.0}},
    ) == "Ground Floor"


def test_element_area_maps_wall_and_slab_only() -> None:
    assert element_area("wall", {"wall_face_area": 12.54}) == 12.5
    assert element_area("slab", {"slab_top_area": 20.04, "slab_holes_area": 2.0}) == 20.0
    assert element_area("slab", {"slab_gross_top_area": 20.04, "slab_holes_area": 2.0}) == 18.0
    assert element_area("beam", {"area": 99.0}) is None


def test_buildsync_assembly_maps_bs_properties() -> None:
    assert buildsync_assembly(
        {
            "BS_AssemblyID": "JN-014",
            "BS_AssemblyUUID": "uuid-jn-014",
            "BS_AssemblyName": "Kitchen Island",
            "BS_AssemblyType": "Joinery",
            "BS_AssemblyRole": "Benchtop",
            "BS_AssemblyVersion": 2,
            "BS_TaskID": "TASK-240",
            "BS_Trade": "Joinery",
            "BS_Status": "active",
        }
    ) == {
        "assembly_id": "JN-014",
        "assembly_uuid": "uuid-jn-014",
        "name": "Kitchen Island",
        "type": "Joinery",
        "role": "Benchtop",
        "version": 2,
        "task_id": "TASK-240",
        "trade": "Joinery",
        "status": "active",
    }
