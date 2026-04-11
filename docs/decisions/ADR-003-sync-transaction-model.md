# ADR-003: Outbound Sync Transaction Model

## Status

Accepted

## Context

Outbound writes into Archicad are safety-critical and must remain auditable, reviewable, and replay-safe.

## Decision

- edits are captured as `change_sets` and `change_set_items`
- only approved change sets can move to `queued_for_sync`
- the connector reads queued approved changes, validates every item, and writes final sync status
- the first write-back slice supports only `CCP_PackageID`

## Consequences

- the UI never writes directly to Archicad
- failed writes can be traced to individual change items
- repeat sync execution is safer because state transitions are explicit
