from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AssemblyMember(BaseModel):
    assembly_uuid: str | None = None
    element_guid: str
    element_type: str
    role: str | None = None
    member_status: str = "active"
    added_at: str | None = None


class AssemblyPayload(BaseModel):
    assembly_uuid: str
    assembly_id: str
    name: str
    type: str
    zone: str | None = None
    level: str | None = None
    trade: str | None = None
    task_id: str | None = None
    version: int = 1
    status: str = "active"
    created_at: str | None = None
    updated_at: str | None = None


class AssemblyCreatedEvent(BaseModel):
    event_type: Literal["assembly_created"]
    project_id: str
    assembly: AssemblyPayload
    members: list[AssemblyMember] = Field(default_factory=list)


class AssemblyUpdatedEvent(BaseModel):
    event_type: Literal["assembly_updated"]
    project_id: str
    assembly_uuid: str
    version: int
    members_added: list[AssemblyMember] = Field(default_factory=list)
    members_removed: list[AssemblyMember] = Field(default_factory=list)
    members_current: list[AssemblyMember] = Field(default_factory=list)


class ValidationIssue(BaseModel):
    code: str
    severity: Literal["info", "warning", "error"]
    message: str
    element_guid: str | None = None


class ValidationResult(BaseModel):
    status: Literal["ok", "warning", "error"]
    issues: list[ValidationIssue] = Field(default_factory=list)
    missing_members: list[str] = Field(default_factory=list)
    orphaned_members: list[str] = Field(default_factory=list)
    duplicate_ids: list[str] = Field(default_factory=list)


class AssemblyValidatedEvent(BaseModel):
    event_type: Literal["assembly_validated"]
    project_id: str
    assembly_uuid: str
    result: ValidationResult


class TaskPayload(BaseModel):
    task_id: str
    name: str
    stage: str | None = None
    trade: str | None = None


class PendingCommand(BaseModel):
    command_id: str
    type: str
    assembly_uuid: str | None = None


class CommandAck(BaseModel):
    command_id: str
    status: Literal["completed", "failed", "ignored"]


class EventResponse(BaseModel):
    ok: bool = True
    event_id: str
    message: str
