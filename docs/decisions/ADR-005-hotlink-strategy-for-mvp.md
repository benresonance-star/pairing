# ADR-005: Hotlink Strategy For MVP

## Status

Accepted

## Context

Hotlink support is required for reporting and identity coverage, but deep hotlink mutation introduces API and workflow complexity that is not necessary to prove the MVP loop.

## Decision

- the MVP reads accessible hotlink instance metadata where available
- hotlink identity is normalized through `hotlink_key`
- the first closed loop does not depend on advanced hotlink mutation
- outbound write-back focuses on zones and selected element records first

## Consequences

- the first delivery slice stays smaller and less risky
- hotlink reporting can still be added incrementally
- future extension remains possible without blocking the core architecture
