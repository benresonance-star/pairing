from __future__ import annotations

from typing import Any

import pytest

from connector.archicad_client import ArchicadClientError, LiveArchicadClient


class FakeResponse:
    def __init__(self, *, status_code: int = 200, payload: Any = None, text: str | None = None) -> None:
        self.status_code = status_code
        self.payload = payload
        self.text = text if text is not None else ("" if payload is None else "json")

    def json(self) -> Any:
        return self.payload


class FakeSession:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
        self.requests: list[dict[str, Any]] = []

    def request(
        self,
        method: str,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        timeout: int,
    ) -> FakeResponse:
        self.requests.append(
            {
                "method": method,
                "url": url,
                "json": json,
                "timeout": timeout,
            }
        )
        if not self.responses:
            raise AssertionError("No fake response was configured")
        return self.responses.pop(0)


def test_live_archicad_client_reads_product_info() -> None:
    session = FakeSession(
        [
            FakeResponse(
                payload={
                    "product_name": "Archicad 28",
                    "connection": "127.0.0.1:19723",
                }
            )
        ]
    )
    client = LiveArchicadClient(host="127.0.0.1", port=19723, session=session)  # type: ignore[arg-type]

    assert client.get_product_info() == {
        "product_name": "Archicad 28",
        "connection": "127.0.0.1:19723",
    }
    assert session.requests[0]["method"] == "GET"
    assert session.requests[0]["url"] == "http://127.0.0.1:19723/api/v1/product-info"


def test_live_archicad_client_reads_snapshot() -> None:
    session = FakeSession([FakeResponse(payload={"zones": [{"id": "zone-1"}], "elements": []})])
    client = LiveArchicadClient(host="127.0.0.1", port=19723, session=session)  # type: ignore[arg-type]

    snapshot = client.read_snapshot()

    assert snapshot["zones"] == [{"id": "zone-1"}]
    assert snapshot["elements"] == []
    assert session.requests[0]["method"] == "GET"
    assert session.requests[0]["url"] == "http://127.0.0.1:19723/api/v1/snapshot"


def test_live_archicad_client_writes_property() -> None:
    session = FakeSession([FakeResponse(payload={"status": "ok"})])
    client = LiveArchicadClient(host="127.0.0.1", port=19723, session=session)  # type: ignore[arg-type]

    client.write_property(
        archicad_guid="ARCHICAD-GUID-1",
        field_name="CCP_ConstructionState",
        field_value="blocked",
    )

    assert session.requests[0] == {
        "method": "POST",
        "url": "http://127.0.0.1:19723/api/v1/properties",
        "json": {
            "archicad_guid": "ARCHICAD-GUID-1",
            "field_name": "CCP_ConstructionState",
            "field_value": "blocked",
        },
        "timeout": 30,
    }


def test_live_archicad_client_raises_safe_error_for_non_success_response() -> None:
    session = FakeSession([FakeResponse(status_code=500, text="boom")])
    client = LiveArchicadClient(host="127.0.0.1", port=19723, session=session)  # type: ignore[arg-type]

    with pytest.raises(ArchicadClientError, match="failed with 500"):
        client.read_snapshot()


def test_live_archicad_client_rejects_malformed_snapshot() -> None:
    session = FakeSession([FakeResponse(payload={"zones": {}})])
    client = LiveArchicadClient(host="127.0.0.1", port=19723, session=session)  # type: ignore[arg-type]

    with pytest.raises(ArchicadClientError, match="zones and elements arrays"):
        client.read_snapshot()


def test_live_archicad_client_rejects_malformed_product_info() -> None:
    session = FakeSession([FakeResponse(payload={"product_name": 28})])
    client = LiveArchicadClient(host="127.0.0.1", port=19723, session=session)  # type: ignore[arg-type]

    with pytest.raises(ArchicadClientError, match="missing string fields"):
        client.get_product_info()
