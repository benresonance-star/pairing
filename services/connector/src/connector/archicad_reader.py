from __future__ import annotations

from typing import Any

from .archicad_client import DemoArchicadClient
from .shared_contracts import first_slice_element_types


class ArchicadReader:
    def __init__(self, client: DemoArchicadClient) -> None:
        self.client = client

    def read_zones_and_elements(self) -> dict[str, list[dict[str, Any]]]:
        snapshot = self.client.read_snapshot()
        allowed_types = first_slice_element_types()
        filtered_elements = [
            element
            for element in snapshot.get("elements", [])
            if element.get("object_type") in allowed_types
        ]
        return {
            "zones": snapshot.get("zones", []),
            "elements": filtered_elements,
        }
