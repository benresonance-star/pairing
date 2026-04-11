# ADR-006: Security And Trust Boundaries

## Status

Accepted

## Context

The MVP spans four distinct trust zones:

- Archicad as the geometry and property host
- Supabase as the operational system of record
- the web app as the user-facing control plane
- the connector as the only approved write-back path into Archicad

The system already relies on approval-gated change sets, shared contracts, and project-scoped data access. Without an explicit security decision, future implementation work could blur those boundaries by exposing elevated credentials to the browser, bypassing approval checks, or expanding Archicad write scope without matching controls.

## Decision

- The browser must never receive service-role or connector-grade credentials.
- The web app may read and create operational changes, but it must not write directly to Archicad.
- The connector is the only component allowed to execute approved outbound Archicad writes.
- Every new write path must ship with authorization checks, validation, and audit coverage in the same milestone.
- Outbound Archicad writes must stay on an explicit allowlist and fail closed on unknown fields or missing approval context.
- Secrets must be loaded from environment or managed secret sources and must not be stored in source control, logs, database business tables, or Archicad properties.
- Demo mode must preserve the same logical trust boundaries as live mode, even if it uses local runtime files instead of live auth and network services.

## Consequences

- UI features must continue to model changes as change sets, not direct write operations.
- Connector implementations must separate demo adapters from live credentialed adapters cleanly.
- Database and API work must treat project scoping, role boundaries, and audit events as core acceptance criteria.
- Logging and debugging utilities must be designed to avoid leaking secrets or privileged payloads.
- Security work is part of normal milestone completion, not a final-stage hardening-only task.
