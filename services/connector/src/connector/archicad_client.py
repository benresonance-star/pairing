from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urljoin

import requests


class ArchicadClientError(RuntimeError):
    """Raised when the live Archicad adapter cannot trust a response."""


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
    def __init__(self, *, host: str, port: int, session: requests.Session | None = None) -> None:
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}/api/v1/"
        self.session = session or requests.Session()

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        try:
            response = self.session.request(
                method,
                urljoin(self.base_url, path),
                json=payload,
                timeout=30,
            )
        except requests.RequestException as error:
            raise ArchicadClientError(f"Archicad request to '{path}' failed: {error}") from error
        if response.status_code >= 400:
            raise ArchicadClientError(
                f"Archicad request to '{path}' failed with {response.status_code}: {response.text}"
            )
        if not response.text:
            return None
        return response.json()

    def get_product_info(self) -> dict[str, str]:
        data = self._request("GET", "product-info")
        if not isinstance(data, dict):
            raise ArchicadClientError("Archicad product-info response must be an object")
        product_name = data.get("product_name")
        connection = data.get("connection", f"{self.host}:{self.port}")
        if not isinstance(product_name, str) or not isinstance(connection, str):
            raise ArchicadClientError("Archicad product-info response is missing string fields")
        return {
            "product_name": product_name,
            "connection": connection,
        }

    def read_snapshot(self) -> dict[str, Any]:
        data = self._request("GET", "snapshot")
        if not isinstance(data, dict):
            raise ArchicadClientError("Archicad snapshot response must be an object")
        zones = data.get("zones")
        elements = data.get("elements")
        if not isinstance(zones, list) or not isinstance(elements, list):
            raise ArchicadClientError("Archicad snapshot response must include zones and elements arrays")
        return data

    def write_property(self, *, archicad_guid: str, field_name: str, field_value: Any) -> None:
        self._request(
            "POST",
            "properties",
            payload={
                "archicad_guid": archicad_guid,
                "field_name": field_name,
                "field_value": field_value,
            },
        )
