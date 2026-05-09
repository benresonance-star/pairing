from __future__ import annotations

from scripts.dev.desktop_companion import CompanionState


def test_status_derives_layers_and_rows_from_legacy_snapshot() -> None:
    state = CompanionState(
        bridge_host="127.0.0.1",
        bridge_port=19724,
        connector_project_id="11111111-1111-1111-1111-111111111111",
        token=None,
    )

    def request_bridge(path: str) -> dict[str, object]:
        if path == "product-info":
            return {"product_name": "Archicad 28", "connection": "build 6100 AUS"}
        if path == "snapshot/layers":
            raise RuntimeError("old bridge does not expose snapshot/layers")
        raise AssertionError(f"unexpected bridge GET path: {path}")

    def request_bridge_post(path: str, payload: dict[str, object], *, timeout: float = 60) -> dict[str, object]:
        assert path == "snapshot"
        assert payload["layers"] == []
        assert timeout == 60
        return {
            "zones": [
                {
                    "zone_number": "Z-01",
                    "archicad_guid": "ZONE-GUID",
                    "layer": "A-Zone",
                    "storey": "Ground",
                }
            ],
            "elements": [
                {
                    "object_type": "wall",
                    "name": "W-01",
                    "archicad_guid": "WALL-GUID",
                    "layer": "A-Wall",
                    "storey": "Ground",
                }
            ],
        }

    state._request_bridge = request_bridge  # type: ignore[method-assign]
    state._request_bridge_post = request_bridge_post  # type: ignore[method-assign]

    status = state.status()

    assert status["bridge"]["available_layers"] == ["A-Wall", "A-Zone"]
    assert status["bridge"]["snapshot_preview"]["layer_names"] == ["A-Wall", "A-Zone"]
    assert status["bridge"]["snapshot_preview"]["snapshot_rows"] == [
        {
            "kind": "zone",
            "type": "zone",
            "element_id": "Z-01",
            "archicad_guid": "ZONE-GUID",
            "layer": "A-Zone",
            "storey": "Ground",
            "ifc_type": None,
        },
        {
            "kind": "element",
            "type": "wall",
            "element_id": "W-01",
            "archicad_guid": "WALL-GUID",
            "layer": "A-Wall",
            "storey": "Ground",
            "ifc_type": None,
        },
    ]
