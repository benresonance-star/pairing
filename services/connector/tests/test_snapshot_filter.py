from __future__ import annotations

from connector.snapshot_filter import (
    ALL_ELEMENT_TYPES,
    apply_snapshot_filter,
    build_snapshot_rows,
    normalize_snapshot_filter,
    parse_filter_from_env,
)


def test_normalize_defaults_include_all_vocab_types() -> None:
    n = normalize_snapshot_filter(None)
    assert n["include_zones"] is True
    assert set(n["element_types"]) == ALL_ELEMENT_TYPES
    assert n["layers"] == []


def test_apply_filter_layers_and_types() -> None:
    snap = {
        "zones": [
            {"archicad_guid": "z1", "zone_number": "A", "layer": "L1"},
            {"archicad_guid": "z2", "zone_number": "B", "layer": "L2"},
        ],
        "elements": [
            {"archicad_guid": "w1", "object_type": "wall", "layer": "L1"},
            {"archicad_guid": "s1", "object_type": "slab", "layer": "L2"},
        ],
    }
    filt = normalize_snapshot_filter({"layers": ["L1"], "element_types": ["wall"], "include_zones": True})
    out = apply_snapshot_filter(snap, filt)
    assert len(out["zones"]) == 1
    assert len(out["elements"]) == 1


def test_parse_filter_from_env_invalid_returns_none() -> None:
    assert parse_filter_from_env("not-json") is None


def test_build_snapshot_rows_order() -> None:
    snap = {
        "zones": [{"archicad_guid": "z", "zone_number": "ZN", "layer": "A", "area": 42.54}],
        "elements": [
            {
                "archicad_guid": "e",
                "object_type": "wall",
                "name": "W",
                "layer": "B",
                "quantities": {"area": 3.04},
                "buildsync_assembly": {
                    "assembly_uuid": "uuid-jn-014",
                    "assembly_id": "JN-014",
                    "name": "Kitchen Island",
                    "type": "Joinery",
                    "trade": "Joinery",
                    "status": "active",
                    "task_id": "TASK-240",
                },
            }
        ],
    }
    rows = build_snapshot_rows(snap, 10)
    assert len(rows) == 2
    assert rows[0]["kind"] == "zone"
    assert rows[0]["area"] == 42.5
    assert rows[1]["kind"] == "element"
    assert rows[1]["area"] == 3.0
    assert rows[1]["assembly_uuid"] == "uuid-jn-014"
    assert rows[1]["assembly_id"] == "JN-014"
    assert rows[1]["assembly_name"] == "Kitchen Island"
    assert rows[1]["assembly_type"] == "Joinery"
    assert rows[1]["assembly_trade"] == "Joinery"
    assert rows[1]["assembly_status"] == "active"
    assert rows[1]["assembly_task_id"] == "TASK-240"
