from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI

from .schemas import (
    AssemblyCreatedEvent,
    AssemblyUpdatedEvent,
    AssemblyValidatedEvent,
    CommandAck,
    EventResponse,
)
from .storage import AssemblyEventStore


def default_db_path() -> Path:
    configured = os.environ.get("BUILDSYNC_LISTENER_DB")
    if configured:
        return Path(configured)
    base = Path(os.environ.get("LOCALAPPDATA", "."))
    return base / "BuildSync" / "buildsync_listener.sqlite3"


def create_app(store: AssemblyEventStore | None = None) -> FastAPI:
    event_store = store or AssemblyEventStore(default_db_path())
    app = FastAPI(title="BuildSync Python Listener", version="0.1")
    app.state.store = event_store

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "buildsync-python-listener", "version": "0.1"}

    @app.get("/tasks")
    def tasks() -> dict[str, object]:
        return {"tasks": event_store.list_tasks()}

    @app.post("/events/assembly-created", response_model=EventResponse)
    def assembly_created(event: AssemblyCreatedEvent) -> EventResponse:
        event_store.upsert_assembly(event.assembly)
        event_store.replace_members(event.assembly.assembly_uuid, event.members)
        event_id = event_store.record_event(event.event_type, event)
        return EventResponse(event_id=event_id, message="Assembly event received.")

    @app.post("/events/assembly-updated", response_model=EventResponse)
    def assembly_updated(event: AssemblyUpdatedEvent) -> EventResponse:
        event_store.update_assembly_version(event.assembly_uuid, event.version)
        event_store.apply_member_delta(
            event.assembly_uuid,
            event.members_added,
            event.members_removed,
            event.members_current,
        )
        event_id = event_store.record_event(event.event_type, event)
        return EventResponse(event_id=event_id, message="Assembly update received.")

    @app.post("/events/assembly-validated", response_model=EventResponse)
    def assembly_validated(event: AssemblyValidatedEvent) -> EventResponse:
        event_id = event_store.record_event(event.event_type, event)
        return EventResponse(event_id=event_id, message="Assembly validation received.")

    @app.get("/commands/pending")
    def pending_commands() -> dict[str, object]:
        return {"commands": event_store.list_pending_commands()}

    @app.post("/commands/ack")
    def ack_command(ack: CommandAck) -> dict[str, object]:
        event_store.ack_command(ack.command_id, ack.status)
        return {"ok": True}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("python_listener.main:app", host="127.0.0.1", port=8765, reload=False)
