from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol


class ArchicadClientProtocol(Protocol):
    def get_product_info(self) -> dict[str, str]: ...
    def read_snapshot(self) -> dict[str, Any]: ...
    def write_property(self, *, archicad_guid: str, field_name: str, field_value: Any) -> None: ...


class DemoArchicadClient:
    def __init__(self, snapshot_path: Path) -> None:
        self.snapshot_path = snapshot_path

    def get_product_info(self) -> dict[str, str]:
        return {
            "product_name": "Archicad Demo Adapter",
            "connection": "fixture",
        }

    def read_snapshot(self) -> dict[str, Any]:
        return json.loads(self.snapshot_path.read_text(encoding="utf-8"))

    def write_property(self, *, archicad_guid: str, field_name: str, field_value: Any) -> None:
        _ = (archicad_guid, field_name, field_value)


class LiveArchicadClient:
    def __init__(self, *, host: str, port: int) -> None:
        self.host = host
        self.port = port

    def get_product_info(self) -> dict[str, str]:
        return {
            "product_name": "Archicad Live Adapter",
            "connection": f"{self.host}:{self.port}",
        }

    def read_snapshot(self) -> dict[str, Any]:
        raise NotImplementedError("Live Archicad inbound reads are not implemented yet")

    def write_property(self, *, archicad_guid: str, field_name: str, field_value: Any) -> None:
        _ = (archicad_guid, field_name, field_value)
        raise NotImplementedError("Live Archicad property writes are not implemented yet")
