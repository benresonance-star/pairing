# Archicad Construction Control Plane MVP

This repository contains the implementation scaffold for the Archicad Construction Control Plane (CCP) MVP.

The system is intentionally split into four clear responsibilities:

- `specs/`: source-of-truth product and integration specifications
- `database/`: Supabase schema, policies, and helper functions
- `apps/web/`: the external operational control-plane UI
- `services/connector/`: the Python connector that reads from and writes to Archicad

## Current build focus

The implementation follows a vertical-slice-first strategy:

1. normalize the repo and document system boundaries
2. establish the Supabase schema and shared contracts
3. prove a first end-to-end slice for `zones` plus a small element subset
4. write back only approved `CCP_PackageID` changes first

The current implementation uses demo adapters and runtime files for local validation. Real Supabase and live Archicad integrations remain future work behind the same architecture boundaries.

The repo now also includes a first read-only linear scheduling path in the web app, driven by explicit location-axis and plotted-activity metadata rather than direct geometry rendering.

That current demo path is modeled as a four-townhouse Melbourne-style development and now includes:

- a linked time-location chart and companion Gantt
- a high-level stage-flow panel rendered from explicit schedule-view metadata
- package checkbox filtering, including multi-package selection
- automatic refresh of the mutable demo runtime when the seed file is newer

## System boundaries

- Archicad owns geometry and BIM authoring truth
- Supabase owns operational state, scenarios, approvals, and audit history
- the web app edits operational data only through change sets
- the connector is the only component allowed to write approved CCP properties back to Archicad

## Repository layout

```text
specs/                 Source specifications
docs/                  Architecture notes, ADRs, runbooks
apps/web/              Next.js control-plane UI
services/connector/    Python connector
database/              SQL migrations, policies, helper functions
shared/contracts/      Shared enums and payload contracts
shared/examples/       Example data for local development and validation
scripts/               Local development and CI helpers
```

## Local development

Start with the runbooks in `docs/runbooks/`:

- `local_dev.md`
- `inbound_sync_test.md`
- `outbound_sync_test.md`
- `archicad_live_adapter.md`
- `archicad_validation.md`
- `scenario_clone_validation.md`

## Security documentation

Use these docs alongside the specs during implementation:

- `docs/decisions/ADR-006-security-and-trust-boundaries.md`
- `docs/threat_model.md`

## Source of truth

The files in `specs/` must remain the primary reference. Implementation should not silently diverge from those documents.