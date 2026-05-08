from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from uuid import UUID


BUILTIN_PROPERTIES = {
    "element_id": "General_ElementID",
    "element_name": "IdAndCategories_Name",
    "related_zone_name": "General_RelatedZoneName",
    "related_zone_number": "General_RelatedZoneNumber",
    "zone_name": "Zone_ZoneName",
    "zone_number": "Zone_ZoneNumber",
    "zone_area": "Zone_CalculatedArea",
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


def ccp_operational(values: dict[str, Any]) -> dict[str, Any]:
    operational: dict[str, Any] = {}
    for archicad_name, field_name in CCP_PROPERTIES.items():
        if archicad_name in values and values[archicad_name] is not None:
            operational[field_name] = values[archicad_name]
    return operational


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

    def snapshot(self) -> dict[str, Any]:
        builtins = resolve_property_ids(self.commands, self.types, BUILTIN_PROPERTIES)
        ccp_ids = resolve_ccp_property_ids(self.commands, self.types)
        property_ids = {**builtins, **ccp_ids}

        zone_elements = self.commands.GetElementsByType("Zone")
        wall_elements = self.commands.GetElementsByType("Wall")
        slab_elements = self.commands.GetElementsByType("Slab")

        zone_values = values_for_elements(self.commands, self.types, zone_elements, property_ids)
        wall_values = values_for_elements(self.commands, self.types, wall_elements, property_ids)
        slab_values = values_for_elements(self.commands, self.types, slab_elements, property_ids)

        return {
            "zones": [
                self.zone_payload(element, values)
                for element, values in zip(zone_elements, zone_values, strict=True)
            ],
            "elements": [
                self.element_payload("wall", element, values)
                for element, values in zip(wall_elements, wall_values, strict=True)
            ]
            + [
                self.element_payload("slab", element, values)
                for element, values in zip(slab_elements, slab_values, strict=True)
            ],
        }

    def zone_payload(self, element: Any, values: dict[str, Any]) -> dict[str, Any]:
        guid = element_guid(element)
        zone_number = values.get("zone_number") or values.get("element_id") or guid
        return {
            "archicad_guid": guid,
            "zone_number": zone_number,
            "zone_name": values.get("zone_name") or values.get("element_name") or zone_number,
            "storey": None,
            "area": values.get("zone_area"),
            "ccp_operational": ccp_operational(values),
        }

    def element_payload(self, object_type: str, element: Any, values: dict[str, Any]) -> dict[str, Any]:
        guid = element_guid(element)
        return {
            "archicad_guid": guid,
            "object_type": object_type,
            "classification": None,
            "storey": None,
            "zone_number": values.get("related_zone_number"),
            "name": values.get("element_name") or values.get("element_id") or guid,
            "quantities": {},
            "ccp_operational": ccp_operational(values),
        }

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

        def do_GET(self) -> None:
            try:
                if self.path == "/api/v1/product-info":
                    self.send_json(200, builder.product_info())
                    return
                if self.path == "/api/v1/snapshot":
                    self.send_json(200, builder.snapshot())
                    return
                self.send_json(404, {"error": "not found"})
            except Exception as error:  # noqa: BLE001
                self.handle_error(error)

        def do_POST(self) -> None:
            try:
                if self.path != "/api/v1/properties":
                    self.send_json(404, {"error": "not found"})
                    return
                builder.write_property(self.read_body())
                self.send_json(200, {"status": "ok"})
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
