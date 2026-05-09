"""Snapshot filter normalization and fixture-side application (connector + bridge + companion)."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def load_element_types_from_vocab() -> frozenset[str]:
    vocab_path = _repo_root() / "shared" / "contracts" / "enums" / "vocabularies.json"
    data = json.loads(vocab_path.read_text(encoding="utf-8"))
    types = data.get("firstSliceElementTypes")
    if not isinstance(types, list):
        return frozenset()
    return frozenset(str(t).lower() for t in types)


ALL_ELEMENT_TYPES: frozenset[str] = load_element_types_from_vocab()

SNAPSHOT_ROWS_MAX = 500


def _display_area(item: dict[str, Any]) -> int | float | None:
    if isinstance(item.get("area"), int | float):
        return round(float(item["area"]), 1)
    quantities = item.get("quantities")
    if not isinstance(quantities, dict) or not quantities:
        return None
    area = quantities.get("area")
    return round(float(area), 1) if isinstance(area, int | float) else None


def normalize_snapshot_filter(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Empty layers list => all layers. Missing element_types => all vocab types. include_zones defaults True."""
    if not raw:
        return {"layers": [], "element_types": sorted(ALL_ELEMENT_TYPES), "include_zones": True}
    layers = raw.get("layers")
    if not isinstance(layers, list):
        layers = []
    layers = [str(x) for x in layers if str(x).strip()]
    element_types = raw.get("element_types")
    if not isinstance(element_types, list) or not element_types:
        element_types = sorted(ALL_ELEMENT_TYPES)
    else:
        element_types = [str(x).strip().lower() for x in element_types if str(x).strip()]
        element_types = [t for t in element_types if t in ALL_ELEMENT_TYPES]
        if not element_types:
            element_types = sorted(ALL_ELEMENT_TYPES)
    include_zones = raw.get("include_zones", True)
    if not isinstance(include_zones, bool):
        include_zones = bool(include_zones)
    return {"layers": layers, "element_types": element_types, "include_zones": include_zones}


def _layer_matches(item: dict[str, Any], selected_layers: list[str]) -> bool:
    if not selected_layers:
        return True
    layer = item.get("layer")
    if layer is None or layer == "":
        return False
    return str(layer) in selected_layers


def apply_snapshot_filter(snapshot: dict[str, Any], filt: dict[str, Any]) -> dict[str, Any]:
    """Return a deep copy of snapshot with zones/elements (and snapshot_rows) filtered."""
    out = copy.deepcopy(snapshot)
    layers = filt.get("layers") or []
    element_types: list[str] = list(filt.get("element_types") or [])
    include_zones = bool(filt.get("include_zones", True))

    zones = out.get("zones", [])
    elements = out.get("elements", [])
    if isinstance(zones, list):
        if include_zones:
            out["zones"] = [z for z in zones if isinstance(z, dict) and _layer_matches(z, layers)]
        else:
            out["zones"] = []
    if isinstance(elements, list):
        out["elements"] = [
            e
            for e in elements
            if isinstance(e, dict)
            and e.get("object_type") in element_types
            and _layer_matches(e, layers)
        ]
    rows = out.get("snapshot_rows")
    if isinstance(rows, list):
        out["snapshot_rows"] = [
            r
            for r in rows
            if isinstance(r, dict)
            and (
                (r.get("kind") == "zone" and include_zones and _layer_matches(r, layers))
                or (
                    r.get("kind") == "element"
                    and r.get("type") in element_types
                    and _layer_matches(r, layers)
                )
            )
        ]
    return out


def parse_filter_from_env(raw: str | None) -> dict[str, Any] | None:
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return normalize_snapshot_filter(data)


def build_snapshot_rows(snapshot: dict[str, Any], max_rows: int = SNAPSHOT_ROWS_MAX) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for z in snapshot.get("zones") or []:
        if not isinstance(z, dict):
            continue
        rows.append(
            {
                "kind": "zone",
                "type": "zone",
                "element_id": str(z.get("zone_number") or z.get("archicad_guid") or ""),
                "archicad_guid": z.get("archicad_guid"),
                "layer": z.get("layer"),
                "storey": z.get("storey"),
                "ifc_type": z.get("ifc_type"),
                "area": _display_area(z),
            }
        )
    for e in snapshot.get("elements") or []:
        if not isinstance(e, dict):
            continue
        rows.append(
            {
                "kind": "element",
                "type": str(e.get("object_type") or ""),
                "element_id": str(e.get("name") or e.get("archicad_guid") or ""),
                "archicad_guid": e.get("archicad_guid"),
                "layer": e.get("layer"),
                "storey": e.get("storey"),
                "ifc_type": e.get("ifc_type"),
                "area": _display_area(e),
            }
        )
    return rows[:max_rows]


def snapshot_filter_from_environ() -> dict[str, Any] | None:
    return parse_filter_from_env(os.environ.get("ARCHICAD_SNAPSHOT_FILTER"))
