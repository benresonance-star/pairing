from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from python_listener.main import create_app
from python_listener.schemas import TaskPayload
from python_listener.storage import AssemblyEventStore


def test_health_returns_listener_identity(tmp_path: Path) -> None:
    app = create_app(AssemblyEventStore(tmp_path / "listener.sqlite3"))
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "buildsync-python-listener",
        "version": "0.1",
    }


def test_assembly_created_persists_event_and_members(tmp_path: Path) -> None:
    store = AssemblyEventStore(tmp_path / "listener.sqlite3")
    app = create_app(store)
    client = TestClient(app)

    response = client.post(
        "/events/assembly-created",
        json={
            "event_type": "assembly_created",
            "project_id": "local-project",
            "assembly": {
                "assembly_uuid": "uuid-jn-014",
                "assembly_id": "JN-014",
                "name": "Kitchen Island",
                "type": "Joinery",
                "version": 1,
            },
            "members": [{"element_guid": "GUID-001", "element_type": "Slab", "role": "Benchtop"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert store.event_count() == 1


def test_invalid_event_payload_is_rejected(tmp_path: Path) -> None:
    app = create_app(AssemblyEventStore(tmp_path / "listener.sqlite3"))
    client = TestClient(app)

    response = client.post(
        "/events/assembly-created",
        json={"event_type": "assembly_created", "project_id": "local-project"},
    )

    assert response.status_code == 422


def test_assembly_update_and_validation_endpoints(tmp_path: Path) -> None:
    store = AssemblyEventStore(tmp_path / "listener.sqlite3")
    app = create_app(store)
    client = TestClient(app)

    update_response = client.post(
        "/events/assembly-updated",
        json={
            "event_type": "assembly_updated",
            "project_id": "local-project",
            "assembly_uuid": "uuid-jn-014",
            "version": 2,
            "members_added": [],
            "members_removed": [],
            "members_current": [{"element_guid": "GUID-002", "element_type": "Wall"}],
        },
    )
    validate_response = client.post(
        "/events/assembly-validated",
        json={
            "event_type": "assembly_validated",
            "project_id": "local-project",
            "assembly_uuid": "uuid-jn-014",
            "result": {
                "status": "warning",
                "issues": [{"code": "MISSING_MEMBER", "severity": "warning", "message": "Stored member no longer exists."}],
            },
        },
    )

    assert update_response.status_code == 200
    assert validate_response.status_code == 200
    assert store.event_count() == 2


def test_tasks_and_commands(tmp_path: Path) -> None:
    store = AssemblyEventStore(tmp_path / "listener.sqlite3")
    store.upsert_task(TaskPayload(task_id="TASK-240", name="Install kitchen joinery", stage="Fitout", trade="Joinery"))
    app = create_app(store)
    client = TestClient(app)

    tasks = client.get("/tasks")
    pending = client.get("/commands/pending")
    ack = client.post("/commands/ack", json={"command_id": "cmd-001", "status": "completed"})

    assert tasks.status_code == 200
    assert tasks.json()["tasks"][0]["task_id"] == "TASK-240"
    assert pending.status_code == 200
    assert pending.json() == {"commands": []}
    assert ack.status_code == 200
