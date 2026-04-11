# ADR-001: System Boundaries

## Status

Accepted

## Context

The MVP spans Archicad, Supabase, a web UI, and a Python connector. Without explicit ownership rules, geometry logic, approval logic, and write-back behavior can drift across layers.

## Decision

- Archicad remains the geometry and model-authoring authority.
- Supabase stores operational state, scenarios, approvals, sync runs, and audits.
- The web UI edits operational data through change sets only.
- The Python connector is the sole component allowed to write approved CCP fields back into Archicad.

## Consequences

- UI code must not contain Archicad write logic.
- Connector code must enforce write allowlists.
- Geometry rendering and mutation are deferred from the MVP.
