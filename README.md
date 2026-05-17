# Construction Feasibility Control Plane

This repository contains the current Construction Feasibility Control Plane MVP. The app has grown from an Archicad Construction Control Plane vertical slice into a broader workflow for evaluating development sites, scenario options, embedded feasibility evidence, construction schedules, human/agentic Project Network review, and governed Archicad metadata write-back.

The system is intentionally split into clear responsibilities:

- `specs/`: product and integration specifications; these must be reconciled with code before being treated as current
- `database/`: Supabase schema, policies, and helper functions
- `apps/web/`: the external operational control-plane UI
- `services/connector/`: the Python connector that reads from and writes to Archicad
- `buildsync-archicad-addon/`: native Archicad add-on foundation for BuildSync assembly workflows
- `python_listener/`: local listener for BuildSync/native-side events and commands
- `shared/contracts/`: shared enums, schemas, and TypeScript contracts
- `shared/examples/`: demo state, runtime files, and local validation fixtures

## Current build focus

The current product spine is:

1. select a development site from the opportunity pipeline
2. work scenario options with embedded feasibility evidence
3. compare options across sites in the feasibility decision board
4. review assumptions, risks, and recommendations through Project Network
5. inspect synced Archicad inventory and approve governed model metadata changes
6. sync approved, allowlisted metadata back through Archicad Connect

Demo JSON remains the default local data source. Supabase mode, connector smokes, companion/bridge tooling, and BuildSync/native foundations are in-tree and should be validated against the same workflow boundaries before expanding product scope.

The web app currently includes:

- site opportunity pipeline and scenario options
- scenario-level feasibility cost bands, sales assumptions, margins, and planning-fit signals
- Base Data cost templates, master code/catalog data, and model-target cost links
- read-only linear scheduling with time-location, Gantt, stage-flow, and package filters
- Archicad Connect inventory, operational state, governed model change approvals, and recorded writes
- Project Network inquiries, profiles, knowledge packs, agentic review, and work products
- Archicad Sync desktop companion / bridge controls for inbound, outbound, and snapshot filtering

## System boundaries

- Archicad owns geometry and BIM authoring truth
- Supabase owns operational state, scenarios, approvals, and audit history
- the web app edits operational data only through change sets
- the connector is the only component allowed to write approved CCP properties back to Archicad
- BuildSync/native-side events must use explicit contracts when crossing into Python or web-owned state

## Repository layout

```text
specs/                 Source specifications
docs/                  Architecture notes, ADRs, runbooks
apps/web/              Next.js control-plane UI
services/connector/    Python connector
database/              SQL migrations, policies, helper functions
buildsync-archicad-addon/ Native Archicad add-on foundation
python_listener/       Local listener for BuildSync/native event capture
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
- `primary_workflow_acceptance.md`

## Security documentation

Use these docs alongside the specs during implementation:

- `docs/decisions/ADR-006-security-and-trust-boundaries.md`
- `docs/threat_model.md`

## Source of truth

The current implementation, migrations, shared contracts, tests, and runbooks are the baseline for near-term work. The files in `specs/` remain important design references, but several are behind the app's current direction and must be audited before being used as authoritative acceptance criteria.

Use `docs/product_focus_assessment.md` and `docs/code_modularity_assessment.md` before adding features or reshaping the workflow.