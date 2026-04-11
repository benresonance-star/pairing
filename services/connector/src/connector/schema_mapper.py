from __future__ import annotations

import uuid
from typing import Any

from .models import ModelObjectRecord, ZoneRecord


def _stable_uuid(project_id: str, namespace: str, key: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{project_id}:{namespace}:{key}"))


def build_zone_key(storey: str | None, zone_number: str | None) -> str:
    return f"{storey or 'UNKNOWN'}:{zone_number or 'UNSET'}"


def map_zone(project_id: str, raw_zone: dict[str, Any]) -> ZoneRecord:
    zone_key = build_zone_key(raw_zone.get("storey"), raw_zone.get("zone_number"))
    return ZoneRecord(
        id=_stable_uuid(project_id, "zone", zone_key),
        project_id=project_id,
        zone_key=zone_key,
        zone_name=raw_zone.get("zone_name"),
        storey=raw_zone.get("storey"),
        archicad_guid=raw_zone.get("archicad_guid"),
        area=raw_zone.get("area"),
        metadata_json={
            "zone_number": raw_zone.get("zone_number"),
            "ccp_operational": raw_zone.get("ccp_operational", {}),
        },
    )


def map_element(project_id: str, raw_element: dict[str, Any]) -> ModelObjectRecord:
    zone_key = build_zone_key(raw_element.get("storey"), raw_element.get("zone_number"))
    archicad_guid = raw_element["archicad_guid"]
    return ModelObjectRecord(
        id=_stable_uuid(project_id, "model_object", archicad_guid),
        project_id=project_id,
        archicad_guid=archicad_guid,
        object_type=raw_element["object_type"],
        classification=raw_element.get("classification"),
        storey=raw_element.get("storey"),
        zone_key=zone_key,
        hotlink_key=None,
        name=raw_element.get("name"),
        quantity_json=raw_element.get("quantities", {}),
        archicad_snapshot_json=raw_element,
    )


def build_operational_state_id(scenario_id: str, object_ref_type: str, object_ref_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{scenario_id}:{object_ref_type}:{object_ref_id}"))
