from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class ZoneRecord:
    id: str
    project_id: str
    zone_key: str
    zone_name: str | None
    storey: str | None
    archicad_guid: str | None
    area: float | None
    metadata_json: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ModelObjectRecord:
    id: str
    project_id: str
    archicad_guid: str
    object_type: str
    classification: str | None
    storey: str | None
    zone_key: str | None
    hotlink_key: str | None
    name: str | None
    quantity_json: dict[str, Any] | None = None
    archicad_snapshot_json: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class OperationalStateRecord:
    id: str
    project_id: str
    scenario_id: str
    object_ref_type: str
    object_ref_id: str
    package_id: str | None = None
    construction_state: str | None = None
    updated_by: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ChangeSetItem:
    id: str
    change_set_id: str
    object_ref_type: str
    object_ref_id: str
    field_name: str
    old_value_json: Any
    new_value_json: Any

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class SyncRunSummary:
    direction: str
    status: str
    objects_read: int = 0
    objects_written: int = 0
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
