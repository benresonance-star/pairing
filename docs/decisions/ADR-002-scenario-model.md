# ADR-002: Scenario Model

## Status

Accepted

## Context

Operational planning needs versioned scenario data without duplicating the stable identity tables that mirror Archicad objects.

## Decision

- `projects`, `model_objects`, `zones`, and `hotlink_instances` represent stable identity layers.
- `scenarios` and `operational_state` overlay planning data on top of those identities.
- Scenario cloning copies operational records only and preserves references to the shared identity tables.

## Consequences

- scenario comparison stays lightweight
- Archicad identity does not drift between scenarios
- outbound sync can target the same underlying model-linked objects across scenario variants
