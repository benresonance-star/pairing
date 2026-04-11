# ADR-004: Controlled Vocabularies

## Status

Accepted

## Context

The web app, database, and connector all rely on the same statuses, units, and object reference types. Divergent enum values would create validation failures and schema drift.

## Decision

The following values are treated as shared contracts:

- change set statuses
- sync run statuses
- construction states
- unit values
- object reference types
- sync directions

These vocabularies are defined centrally under `shared/contracts/` and mirrored into both TypeScript and Python modules.

## Consequences

- new values require contract updates, not isolated local changes
- tests can validate cross-language alignment
- runtime validation becomes simpler and more explicit
