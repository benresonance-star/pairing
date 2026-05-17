# Product Focus Assessment

## Current Baseline

The app is now a construction feasibility, scenario review, and Archicad-connect plane. The codebase has moved beyond the older Archicad-only vertical-slice framing into a workflow that combines site opportunity pipelines, scenario-level feasibility evidence, reusable base data, active human/agentic Project Network review, and governed Archicad metadata write-back.

Treat implemented routes, migrations, shared contracts, tests, and connector behavior as the current baseline. Treat older specs as design references that need reconciliation before they are used as acceptance criteria.

## Primary Workflow Spine

The product spine is:

1. Select a development site from the opportunity pipeline.
2. Work site scenario options with embedded feasibility evidence: yield, cost, revenue, margin, planning fit, schedule, and evidence.
3. Use Project Network for human and agentic review of scenario assumptions, risks, recommendations, and unresolved questions.
4. Use Base Data for reusable costs, planning rules, assumptions, and reference knowledge that feed decisions but do not belong to one site.
5. Use Archicad Connect to inspect synced inventory, approve governed model metadata changes, and sync allowlisted writes through the connector.
6. Review recorded writes and audit evidence.

This workflow should be made excellent before broadening the app.

## Screen Classification

Core:

- `apps/web/src/app/page.tsx`: workflow dashboard, mode/status indicators, recent write evidence.
- `apps/web/src/app/sites/page.tsx` and `apps/web/src/app/sites/[siteId]/page.tsx`: site intake, constraints, resources, and scenario option entry.
- `apps/web/src/app/feasibility/page.tsx`: cross-site and cross-scenario comparison board.
- `apps/web/src/app/scenarios/page.tsx` and `apps/web/src/app/scenarios/[scenarioId]/page.tsx`: site option / scenario workspace for feasibility evidence, operational state, schedules, and review links.
- `apps/web/src/app/project-network/page.tsx`: active human and agentic scenario review layer.
- `apps/web/src/app/objects/page.tsx`: Archicad Connect inventory for synced model-linked objects, zones, packages, and metadata.
- `apps/web/src/app/change-sets/page.tsx`: model change approvals for governed Archicad write-back.
- `apps/web/src/app/integrations/archicad/page.tsx`: Archicad Sync for connector/companion execution and sync evidence.

Supporting:

- `apps/web/src/app/base-costs/page.tsx`: Base Data for reusable cost libraries and assumptions; should serve scenario feasibility rather than become a standalone estimating product yet.
- `apps/web/src/app/linear-schedule/page.tsx`: supports timing and sequencing decisions; currently read-only and should remain focused on scenario clarity.

Park For Later:

- Broad Project Network automation beyond inquiry/work-product capture and guided scenario review.
- Native BuildSync add-on packaging and rich SDK-backed UX beyond the current assembly/event foundation.
- Editable geometry-derived stationing or full scheduling authoring.
- Multi-tenant login and account administration unless live deployment is the next milestone.

## Docs Drift To Reconcile

- `README.md` and `docs/architecture_overview.md` previously under-described feasibility, base costs, project network, companion/bridge, and BuildSync/native work.
- `specs/supabase_schema_api_contract_spec.md` appears behind later migrations for sites, feasibility, master costs, and project network.
- `specs/python_connector_technical_spec.md` does not fully describe the current desktop companion / bridge topology.
- `specs/buildsync_assembly_wrapper_spec_v0_3.md` is a significant subsystem spec and should be referenced from top-level docs when native work is in scope.

## Product Rule

Every core screen should answer one of these questions:

- What decision can I make here?
- What changed?
- Who or what is blocked?
- What should Archicad know after approval?
- Where is the evidence?
