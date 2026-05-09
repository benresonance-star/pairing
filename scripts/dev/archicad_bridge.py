from __future__ import annotations

import argparse
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from uuid import UUID

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CONNECTOR_SRC = _REPO_ROOT / "services" / "connector" / "src"
if str(_CONNECTOR_SRC) not in sys.path:
    sys.path.insert(0, str(_CONNECTOR_SRC))

from connector.snapshot_filter import (  # noqa: E402
    SNAPSHOT_ROWS_MAX,
    apply_snapshot_filter,
    build_snapshot_rows,
    normalize_snapshot_filter,
)


BUILTIN_PROPERTIES = {
    "element_id": "General_ElementID",
    "element_name": "IdAndCategories_Name",
    "related_zone_name": "General_RelatedZoneName",
    "related_zone_number": "General_RelatedZoneNumber",
    "zone_name": "Zone_ZoneName",
    "zone_number": "Zone_ZoneNumber",
    "zone_area": "Zone_CalculatedArea",
    "layer_name": "ModelView_LayerName",
    "top_link_story": "General_TopLinkStory",
    "elevation_to_story": "General_ElevationToStory",
    "slab_top_area": "Slab_ConditionalTopSurfaceArea",
    "slab_gross_top_area": "Slab_GrossTopSurfaceArea",
    "slab_holes_area": "Slab_HolesSurfaceArea",
    "wall_face_area": "Wall_NetOutsideSurfaceArea",
    "element_classification": "General_ElementClassification",
    "ifc_predefined_type": "IFC_IFCPredefinedType",
}

CCP_PROPERTY_GROUP = "CCP_Operational"
CCP_PROPERTIES = {
    "CCP_PackageID": "package_id",
    "CCP_ConstructionState": "construction_state",
    "CCP_SequenceGroup": "sequence_group",
    "CCP_SequenceOrder": "sequence_order",
    "CCP_PlannedStart": "planned_start",
    "CCP_PlannedFinish": "planned_finish",
    "CCP_ActualStart": "actual_start",
    "CCP_ActualFinish": "actual_finish",
}

BUILDSYNC_PROPERTY_GROUP = "BuildSync"
BUILDSYNC_PROPERTIES = {
    "BS_AssemblyID": "assembly_id",
    "BS_AssemblyUUID": "assembly_uuid",
    "BS_AssemblyName": "name",
    "BS_AssemblyType": "type",
    "BS_AssemblyRole": "role",
    "BS_AssemblyVersion": "version",
    "BS_TaskID": "task_id",
    "BS_Trade": "trade",
    "BS_Status": "status",
}

# (GetElementsByType name, object_type string for CCP snapshot)
ELEMENT_SPECS: list[tuple[str, str]] = [
    ("Wall", "wall"),
    ("Slab", "slab"),
    ("Roof", "roof"),
    ("Window", "window"),
    ("Door", "door"),
    ("Column", "column"),
    ("Beam", "beam"),
    ("Object", "object"),
]


class ArchicadBridgeError(RuntimeError):
    pass


def connect_to_archicad():
    try:
        from archicad import ACConnection  # type: ignore[import-not-found]
    except ImportError as error:
        raise ArchicadBridgeError("Install Graphisoft's Python package with: pip install archicad") from error

    connection = ACConnection.connect()
    if connection is None:
        raise ArchicadBridgeError("No running Archicad instance was found")
    return connection


def element_guid(element: Any) -> str:
    return str(element.elementId.guid).upper()


def json_value(value: Any) -> Any:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def property_value(wrapper: Any) -> Any:
    property_value_obj = getattr(wrapper, "propertyValue", None)
    if property_value_obj is None:
        return None
    if getattr(property_value_obj, "status", None) != "normal":
        return None
    return json_value(getattr(property_value_obj, "value", None))


def property_error(item: Any) -> str | None:
    error = getattr(item, "error", None)
    if error is None:
        return None
    return str(getattr(error, "message", error))


def resolve_property_ids(commands: Any, types: Any, property_names: dict[str, str]) -> dict[str, Any]:
    requested = [
        types.PropertyUserId("BuiltIn", nonLocalizedName=non_localized_name)
        for non_localized_name in property_names.values()
    ]
    resolved = commands.GetPropertyIds(requested)
    property_ids: dict[str, Any] = {}
    for key, item in zip(property_names.keys(), resolved, strict=True):
        property_id = getattr(item, "propertyId", None)
        if property_id is not None:
            property_ids[key] = property_id
    return property_ids


def resolve_ccp_property_ids(commands: Any, types: Any) -> dict[str, Any]:
    requested = [
        types.PropertyUserId("UserDefined", localizedName=[CCP_PROPERTY_GROUP, archicad_name])
        for archicad_name in CCP_PROPERTIES
    ]
    resolved = commands.GetPropertyIds(requested)
    property_ids: dict[str, Any] = {}
    for archicad_name, item in zip(CCP_PROPERTIES.keys(), resolved, strict=True):
        property_id = getattr(item, "propertyId", None)
        if property_id is not None:
            property_ids[archicad_name] = property_id
    return property_ids


def resolve_buildsync_property_ids(commands: Any, types: Any) -> dict[str, Any]:
    requested = [
        types.PropertyUserId("UserDefined", localizedName=[BUILDSYNC_PROPERTY_GROUP, archicad_name])
        for archicad_name in BUILDSYNC_PROPERTIES
    ]
    resolved = commands.GetPropertyIds(requested)
    property_ids: dict[str, Any] = {}
    for archicad_name, item in zip(BUILDSYNC_PROPERTIES.keys(), resolved, strict=True):
        property_id = getattr(item, "propertyId", None)
        if property_id is not None:
            property_ids[archicad_name] = property_id
    return property_ids


def values_for_elements(commands: Any, types: Any, elements: list[Any], property_ids: dict[str, Any]) -> list[dict[str, Any]]:
    if not elements or not property_ids:
        return [{} for _ in elements]

    keys = list(property_ids.keys())
    property_items = [types.PropertyIdArrayItem(property_ids[key]) for key in keys]
    rows = commands.GetPropertyValuesOfElements(elements, property_items)
    values: list[dict[str, Any]] = []
    for row in rows:
        property_values = getattr(row, "propertyValues", [])
        values.append(
            {
                key: property_value(item)
                for key, item in zip(keys, property_values, strict=False)
                if property_error(item) is None
            }
        )
    return values


def layer_index_name_map(commands: Any, types: Any) -> dict[int, str]:
    """Map Archicad attribute indices for numeric layer property fallbacks."""
    try:
        attr_items = commands.GetAttributesByType("Layer")
        index_rows = commands.GetAttributesIndices(attr_items)
        layer_rows = commands.GetLayerAttributes(attr_items)
    except Exception:  # noqa: BLE001
        return {}

    names_by_index: dict[int, str] = {}
    for index_row, layer_row in zip(index_rows, layer_rows, strict=False):
        index_and_guid = getattr(index_row, "attributeIndexAndGuid", None)
        layer_attr = getattr(layer_row, "layerAttribute", None)
        index = getattr(index_and_guid, "index", None)
        name = getattr(layer_attr, "name", None)
        if index is None or not name:
            continue
        try:
            names_by_index[int(index)] = str(name)
        except (TypeError, ValueError):
            continue
    return names_by_index


def layer_name_from_value(value: Any, names_by_index: dict[int, str]) -> str | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return names_by_index.get(int(value), str(value))
    text = str(value)
    if not text:
        return None
    if len(text) == 1 and ord(text) < 32:
        if "Archicad Layer" in names_by_index.values():
            return "Archicad Layer"
        return text
    if text.isdigit():
        return names_by_index.get(int(text), text)
    return text


def project_story_names_by_index(commands: Any, types: Any) -> dict[int, str]:
    return {index: info["name"] for index, info in project_story_info_by_index(commands, types).items()}


def project_story_info_by_index(commands: Any, types: Any) -> dict[int, dict[str, Any]]:
    try:
        tree = commands.GetNavigatorItemTree(types.NavigatorTreeId("ProjectMap"))
        root = tree.to_dict().get("rootItem", {}) if hasattr(tree, "to_dict") else {}
    except Exception:  # noqa: BLE001
        return {}

    story_items: list[dict[str, Any]] = []

    def walk(item: dict[str, Any]) -> None:
        if item.get("type") == "StoryItem":
            story_items.append(item)
        for child in item.get("children", []) or []:
            child_item = child.get("navigatorItem") if isinstance(child, dict) else None
            if isinstance(child_item, dict):
                walk(child_item)

    walk(root)
    stories: dict[int, dict[str, Any]] = {}
    try:
        wrappers = [
            types.NavigatorItemIdWrapper(types.NavigatorItemId(item["navigatorItemId"]["guid"]))
            for item in story_items
            if isinstance(item.get("navigatorItemId"), dict)
        ]
        detail_rows = commands.GetStoryNavigatorItems(wrappers)
    except Exception:  # noqa: BLE001
        detail_rows = []

    for ordinal, item in enumerate(story_items):
        prefix = str(item.get("prefix") or "").strip().rstrip(".")
        try:
            index = int(prefix)
        except ValueError:
            index = ordinal
        name = str(item.get("name") or "").strip() or f"{index}. Story"
        floor_level = None
        if ordinal < len(detail_rows):
            story_item = getattr(detail_rows[ordinal], "storyNavigatorItem", None)
            floor_level = getattr(story_item, "floorLevel", None)
            name = str(getattr(story_item, "name", None) or name)
        stories[index] = {"name": name, "floor_level": floor_level}
    return stories


def story_from_elevation(values: dict[str, Any], story_info_by_index: dict[int, dict[str, Any]]) -> str | None:
    elevation = values.get("elevation_to_story")
    if not isinstance(elevation, int | float):
        return None
    candidates = [
        (index, info)
        for index, info in story_info_by_index.items()
        if isinstance(info.get("floor_level"), int | float) and float(info["floor_level"]) <= float(elevation) + 1e-6
    ]
    if not candidates:
        return None
    index, info = max(candidates, key=lambda item: float(item[1]["floor_level"]))
    return str(info.get("name") or f"{index}. Story")


def story_display(values: dict[str, Any], story_info_by_index: dict[int, dict[str, Any]] | None = None) -> str | None:
    story = values.get("home_story")
    if story is not None:
        return str(story)
    story_info = story_info_by_index or {}
    top_link_story = values.get("top_link_story")
    if top_link_story is None:
        return story_from_elevation(values, story_info)
    text = str(top_link_story)
    match = re.match(r"^Home\s*([+-])\s*(\d+)\s*\((?:.*?\s)?([-+]?\d+)(?:\.\s*Story)?\)$", text)
    if match:
        sign, delta_text, linked_index_text = match.groups()
        linked_index = int(linked_index_text)
        delta = int(delta_text)
        home_index = linked_index - delta if sign == "+" else linked_index + delta
        return str(story_info.get(home_index, {}).get("name") or f"{home_index}. Story")
    if text == "Home":
        return str(story_info.get(0, {}).get("name") or text)
    return story_from_elevation(values, story_info)


def classification_display_for_elements(commands: Any, types: Any, elements: list[Any]) -> dict[str, str]:
    if not elements:
        return {}
    try:
        system_ids = commands.GetClassificationSystemIds()
        classification_rows = commands.GetClassificationsOfElements(elements, system_ids)
    except Exception:  # noqa: BLE001
        return {}

    item_wrappers: list[Any] = []
    item_keys: list[tuple[str, str]] = []
    by_guid: dict[str, list[str]] = {}
    for element, row in zip(elements, classification_rows, strict=False):
        guid = element_guid(element)
        for wrapper in getattr(row, "classificationIds", []) or []:
            classification_id = getattr(wrapper, "classificationId", None)
            item_id = getattr(classification_id, "classificationItemId", None)
            if item_id is None:
                continue
            item_guid = str(getattr(item_id, "guid", ""))
            item_keys.append((guid, item_guid))
            item_wrappers.append(types.ClassificationItemIdArrayItem(item_id))
            if item_guid:
                by_guid.setdefault(guid, []).append(item_guid)

    if not item_wrappers:
        return {}

    try:
        detail_rows = commands.GetDetailsOfClassificationItems(item_wrappers)
    except Exception:  # noqa: BLE001
        return {guid: ", ".join(items) for guid, items in by_guid.items()}

    details_by_item_guid: dict[str, str] = {}
    for (_, item_guid), detail_row in zip(item_keys, detail_rows, strict=False):
        item = getattr(detail_row, "classificationItem", None)
        item_id = getattr(item, "id", None)
        item_name = getattr(item, "name", None)
        display = str(item_name or item_id or item_guid)
        if display:
            details_by_item_guid[item_guid] = display

    display_by_element: dict[str, list[str]] = {}
    for guid, item_guid in item_keys:
        display = details_by_item_guid.get(item_guid, item_guid)
        if display:
            display_by_element.setdefault(guid, []).append(display)
    return {guid: ", ".join(dict.fromkeys(displays)) for guid, displays in display_by_element.items()}


def ccp_operational(values: dict[str, Any]) -> dict[str, Any]:
    operational: dict[str, Any] = {}
    for archicad_name, field_name in CCP_PROPERTIES.items():
        if archicad_name in values and values[archicad_name] is not None:
            operational[field_name] = values[archicad_name]
    return operational


def buildsync_assembly(values: dict[str, Any]) -> dict[str, Any] | None:
    assembly: dict[str, Any] = {}
    for archicad_name, field_name in BUILDSYNC_PROPERTIES.items():
        if archicad_name in values and values[archicad_name] not in (None, ""):
            assembly[field_name] = values[archicad_name]
    return assembly or None


def element_area(object_type: str, values: dict[str, Any]) -> int | float | None:
    if object_type == "slab":
        if isinstance(values.get("slab_top_area"), int | float):
            return round(float(values["slab_top_area"]), 1)
        gross = values.get("slab_gross_top_area")
        holes = values.get("slab_holes_area")
        if isinstance(gross, int | float):
            area = gross - holes if isinstance(holes, int | float) else gross
            return round(float(area), 1)
    if object_type == "wall" and isinstance(values.get("wall_face_area"), int | float):
        return round(float(values["wall_face_area"]), 1)
    return None


def _ifc_display(values: dict[str, Any]) -> str | None:
    if values.get("ifc_predefined_type"):
        return str(values["ifc_predefined_type"])
    if values.get("element_classification"):
        return str(values["element_classification"])
    return None


def distinct_layer_names_from_zones_elements(zones: Any, elements: Any) -> list[str]:
    """Layer strings present on filtered snapshot items (same source as the preview table)."""
    seen: set[str] = set()
    if isinstance(zones, list):
        for z in zones:
            if isinstance(z, dict):
                layer = z.get("layer")
                if layer is not None and str(layer).strip():
                    seen.add(str(layer))
    if isinstance(elements, list):
        for e in elements:
            if isinstance(e, dict):
                layer = e.get("layer")
                if layer is not None and str(layer).strip():
                    seen.add(str(layer))
    return sorted(seen)


def dedupe_zones_for_snapshot(zones: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep one Archicad zone per connector zone key (storey + zone number)."""
    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for zone in zones:
        key = (str(zone.get("storey") or "UNKNOWN"), str(zone.get("zone_number") or "UNSET"))
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = zone
            continue
        existing_ops = existing.get("ccp_operational") if isinstance(existing.get("ccp_operational"), dict) else {}
        next_ops = zone.get("ccp_operational") if isinstance(zone.get("ccp_operational"), dict) else {}
        if not existing_ops and next_ops:
            deduped[key] = zone
    return list(deduped.values())


class ArchicadSnapshotBuilder:
    def __init__(self) -> None:
        self.connection = connect_to_archicad()
        self.commands = self.connection.commands
        self.types = self.connection.types

    def product_info(self) -> dict[str, str]:
        version, build, language = self.commands.GetProductInfo()
        return {
            "product_name": f"Archicad {version}",
            "connection": f"build {build} {language}",
        }

    def _try_get_elements_by_type(self, type_name: str) -> list[Any]:
        try:
            result = self.commands.GetElementsByType(type_name)
        except Exception:  # noqa: BLE001
            return []
        return result if isinstance(result, list) else []

    def list_layer_names(self) -> dict[str, Any]:
        names: set[str] = set()
        try:
            attr_items = self.commands.GetAttributesByType("Layer")
            if attr_items:
                wrappers: list[Any] = []
                for item in attr_items:
                    aid = getattr(item, "attributeId", None)
                    if aid is not None:
                        wrappers.append(self.types.AttributeIdWrapperItem(aid))
                if wrappers:
                    rows = self.commands.GetLayerAttributes(wrappers)
                    for row in rows:
                        la = getattr(row, "layerAttribute", None)
                        if la is not None and getattr(la, "name", None):
                            names.add(str(la.name))
        except Exception:  # noqa: BLE001
            pass
        if names:
            return {"layers": sorted(names)}
        return {"layers": self._distinct_layers_from_elements_scan()}

    def _distinct_layers_from_elements_scan(self, max_elements: int = 4000) -> list[str]:
        seen: set[str] = set()
        builtins = resolve_property_ids(self.commands, self.types, BUILTIN_PROPERTIES)
        layer_key = "layer_name"
        if layer_key not in builtins:
            return []
        pid = {layer_key: builtins[layer_key]}
        scanned = 0
        for ac_type, _ot in ELEMENT_SPECS:
            elements = self._try_get_elements_by_type(ac_type)
            for chunk_start in range(0, len(elements), 400):
                if scanned >= max_elements:
                    return sorted(seen)
                chunk = elements[chunk_start : chunk_start + 400]
                if not chunk:
                    break
                rows = values_for_elements(self.commands, self.types, chunk, pid)
                for vals in rows:
                    layer = vals.get("layer_name")
                    if layer:
                        seen.add(str(layer))
                scanned += len(chunk)
        return sorted(seen)

    def snapshot(self, snapshot_filter: dict[str, Any] | None = None) -> dict[str, Any]:
        filt = normalize_snapshot_filter(snapshot_filter or {})
        builtins = resolve_property_ids(self.commands, self.types, BUILTIN_PROPERTIES)
        ccp_ids = resolve_ccp_property_ids(self.commands, self.types)
        buildsync_ids = resolve_buildsync_property_ids(self.commands, self.types)
        property_ids = {**builtins, **ccp_ids, **buildsync_ids}
        layer_names_by_index = layer_index_name_map(self.commands, self.types)
        story_info_by_index = project_story_info_by_index(self.commands, self.types)

        zones_raw: list[dict[str, Any]] = []
        if filt["include_zones"]:
            zone_elements = self._try_get_elements_by_type("Zone")
            zone_values = values_for_elements(self.commands, self.types, zone_elements, property_ids)
            zone_classifications = classification_display_for_elements(self.commands, self.types, zone_elements)
            zones_raw = [
                self.zone_payload(
                    element,
                    values,
                    layer_names_by_index,
                    story_info_by_index,
                    zone_classifications.get(element_guid(element)),
                )
                for element, values in zip(zone_elements, zone_values, strict=True)
            ]

        elements_raw: list[dict[str, Any]] = []
        wanted_types = set(filt["element_types"])
        for ac_type, object_type in ELEMENT_SPECS:
            if object_type not in wanted_types:
                continue
            els = self._try_get_elements_by_type(ac_type)
            if not els:
                continue
            vals = values_for_elements(self.commands, self.types, els, property_ids)
            classifications = classification_display_for_elements(self.commands, self.types, els)
            elements_raw.extend(
                [
                    self.element_payload(
                        object_type,
                        element,
                        v,
                        layer_names_by_index,
                        story_info_by_index,
                        classifications.get(element_guid(element)),
                    )
                    for element, v in zip(els, vals, strict=True)
                ]
            )

        combined = {"zones": zones_raw, "elements": elements_raw}
        filtered = apply_snapshot_filter(combined, filt)
        filtered["snapshot_rows"] = build_snapshot_rows(filtered, SNAPSHOT_ROWS_MAX)
        counts: dict[str, int] = {"zone": len(filtered["zones"])}
        for elem in filtered.get("elements", []):
            if isinstance(elem, dict):
                ot = str(elem.get("object_type") or "unknown")
                counts[ot] = counts.get(ot, 0) + 1
        filtered["counts_by_type"] = counts
        filtered["snapshot_rows_truncated"] = len(filtered["snapshot_rows"]) >= SNAPSHOT_ROWS_MAX
        filtered["layer_names"] = distinct_layer_names_from_zones_elements(filtered.get("zones"), filtered.get("elements"))
        return filtered

    def zone_payload(
        self,
        element: Any,
        values: dict[str, Any],
        layer_names_by_index: dict[int, str],
        story_info_by_index: dict[int, dict[str, Any]],
        classification: str | None,
    ) -> dict[str, Any]:
        guid = element_guid(element)
        zone_number = values.get("zone_number") or values.get("element_id") or guid
        storey_val = story_display(values, story_info_by_index)
        layer = layer_name_from_value(values.get("layer_name"), layer_names_by_index)
        return {
            "archicad_guid": guid,
            "zone_number": zone_number,
            "zone_name": values.get("zone_name") or values.get("element_name") or zone_number,
            "storey": storey_val,
            "layer": layer,
            "area": round(float(values["zone_area"]), 1) if isinstance(values.get("zone_area"), int | float) else None,
            "ifc_type": _ifc_display(values) or classification,
            "ccp_operational": ccp_operational(values),
        }

    def element_payload(
        self,
        object_type: str,
        element: Any,
        values: dict[str, Any],
        layer_names_by_index: dict[int, str],
        story_info_by_index: dict[int, dict[str, Any]],
        classification: str | None,
    ) -> dict[str, Any]:
        guid = element_guid(element)
        storey_val = story_display(values, story_info_by_index)
        layer = layer_name_from_value(values.get("layer_name"), layer_names_by_index)
        element_classification = _ifc_display(values) or classification
        area = element_area(object_type, values)
        payload = {
            "archicad_guid": guid,
            "object_type": object_type,
            "classification": element_classification,
            "storey": storey_val,
            "layer": layer,
            "zone_number": values.get("related_zone_number"),
            "name": values.get("element_name") or values.get("element_id") or guid,
            "quantities": {"area": area} if area is not None else {},
            "area": area,
            "ifc_type": element_classification,
            "ccp_operational": ccp_operational(values),
        }
        assembly = buildsync_assembly(values)
        if assembly:
            payload["buildsync_assembly"] = assembly
        return payload

    def write_property(self, payload: dict[str, Any]) -> None:
        archicad_guid = str(payload.get("archicad_guid") or "")
        field_name = str(payload.get("field_name") or "")
        field_value = payload.get("field_value")
        if not archicad_guid or not field_name:
            raise ArchicadBridgeError("archicad_guid and field_name are required")
        if field_name not in CCP_PROPERTIES:
            raise ArchicadBridgeError(f"'{field_name}' is not an allowlisted CCP property")

        ccp_ids = resolve_ccp_property_ids(self.commands, self.types)
        property_id = ccp_ids.get(field_name)
        if property_id is None:
            raise ArchicadBridgeError(
                f"Property '{CCP_PROPERTY_GROUP}/{field_name}' does not exist in the active Archicad model"
            )

        property_value = self.to_archicad_property_value(field_value)
        element_id = self.types.ElementId(UUID(archicad_guid))
        result = self.commands.SetPropertyValuesOfElements(
            [
                self.types.ElementPropertyValue(
                    element_id,
                    property_id,
                    property_value,
                )
            ]
        )
        errors = [property_error(item) for item in result if property_error(item)]
        if errors:
            raise ArchicadBridgeError("; ".join(errors))

    def to_archicad_property_value(self, value: Any) -> Any:
        if isinstance(value, bool):
            return self.types.NormalStringPropertyValue(str(value).lower())
        if isinstance(value, int):
            return self.types.NormalIntegerPropertyValue(value)
        if isinstance(value, float):
            return self.types.NormalNumberPropertyValue(value)
        return self.types.NormalStringPropertyValue("" if value is None else str(value))


def build_handler(builder: ArchicadSnapshotBuilder):
    class ArchicadBridgeHandler(BaseHTTPRequestHandler):
        server_version = "ArchicadPythonBridge/0.1"

        def log_message(self, format: str, *args: object) -> None:
            return

        def send_json(self, status_code: int, payload: Any) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def read_body(self) -> dict[str, Any]:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ArchicadBridgeError("request body must be a JSON object")
            return payload

        def handle_error(self, error: Exception) -> None:
            self.send_json(500, {"error": str(error)})

        def api_path(self) -> str:
            raw = self.path.split("?", 1)[0]
            if len(raw) > 1 and raw.endswith("/"):
                raw = raw[:-1]
            return raw

        def do_GET(self) -> None:
            try:
                path = self.api_path()
                if path == "/api/v1/product-info":
                    self.send_json(200, builder.product_info())
                    return
                if path == "/api/v1/snapshot":
                    self.send_json(200, builder.snapshot(None))
                    return
                if path == "/api/v1/snapshot/layers":
                    self.send_json(200, builder.list_layer_names())
                    return
                self.send_json(404, {"error": "not found"})
            except Exception as error:  # noqa: BLE001
                self.handle_error(error)

        def do_POST(self) -> None:
            try:
                path = self.api_path()
                if path == "/api/v1/snapshot":
                    body = self.read_body()
                    self.send_json(200, builder.snapshot(body))
                    return
                if path == "/api/v1/properties":
                    builder.write_property(self.read_body())
                    self.send_json(200, {"status": "ok"})
                    return
                self.send_json(404, {"error": "not found"})
            except Exception as error:  # noqa: BLE001
                self.handle_error(error)

    return ArchicadBridgeHandler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="HTTP bridge from the CCP connector to a running Archicad instance")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19724)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    builder = ArchicadSnapshotBuilder()
    server = HTTPServer((args.host, args.port), build_handler(builder))
    print(
        json.dumps(
            {
                "status": "ready",
                "host": args.host,
                "port": args.port,
            }
        ),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
