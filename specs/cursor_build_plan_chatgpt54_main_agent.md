# Cursor Build Plan — Archicad Construction Control Plane MVP

## 1. Purpose

This plan defines how to build the **Archicad Construction Control Plane MVP** in Cursor, with **ChatGPT 5.4 as the main agent** responsible for architecture, implementation guidance, code generation, review, and validation support.

This build plan assumes the three existing specifications are the source documents:

- `archicad_property_mapping_spec.md`
- `supabase_schema_api_contract_spec.md`
- `python_connector_technical_spec.md`

This plan is intended to reduce drift, keep the repo modular, and ensure the system is built in a staged, testable way.

---

## 2. Build Objective

Build an MVP where:

- Archicad remains the only geometry environment
- an external web UI acts as an operational control plane
- Supabase stores state, scenarios, approvals, and logs
- a Python connector reads from and writes back to Archicad
- approved metadata changes can drive Archicad schedules and Graphic Overrides

---

## 3. Delivery Strategy

Use a **vertical-slice-first** approach.

Do not begin by trying to build every feature in parallel.

Instead, deliver the smallest usable end-to-end slice first:

1. read a limited set of Archicad objects
2. sync them into Supabase
3. show them in a simple UI table
4. edit one or two operational fields
5. approve changes
6. write approved values back into Archicad
7. confirm Archicad visual/schedule response

This first closed loop is the foundation for the rest of the system.

Security must be developed the same way:
- add only the minimum security controls needed for the current slice
- do not defer authorization, allowlists, auditability, and secret-handling to the end
- every new write path must ship with matching validation and security checks

---

## 4. Main Agent Role: ChatGPT 5.4

ChatGPT 5.4 should act as the **primary build agent** in Cursor with the following responsibilities:

### 4.1 Architecture steward
- protect the system boundaries
- keep Archicad, Supabase, UI, and connector responsibilities clean
- prevent premature complexity
- ensure security responsibilities are assigned to the correct layer

### 4.2 Implementation planner
- convert specs into tasks
- generate file structures
- scaffold code
- sequence work in dependency order

### 4.3 Code author and reviewer
- write modules
- review module interfaces
- flag coupling or schema drift
- propose refactors only when justified

### 4.4 Validation partner
- generate tests
- create validation checklists
- verify that outputs align with the specs
- verify that each milestone includes security checks appropriate to its scope

### 4.5 Documentation maintainer
- keep `/docs` and `/specs` aligned with the implementation
- update assumptions and known constraints as the build progresses

---

## 5. Working Style for ChatGPT 5.4 in Cursor

To get the best results, use ChatGPT 5.4 in a disciplined way.

### 5.1 Give it source authority
Always anchor it to the specs first.

Recommended opening instruction pattern:

> Use the spec files in `/specs` as source of truth. Do not redesign the system unless a contradiction or implementation blocker is found. If a blocker is found, state it explicitly and propose the smallest safe adjustment.

### 5.2 Keep tasks narrow
Avoid prompts like:
- “build the whole system”
- “finish the app”
- “make this production ready”

Prefer prompts like:
- “implement the Supabase table types and repository layer for projects, scenarios, and change sets”
- “create the inbound sync service skeleton in Python based on the connector spec”
- “build a read-only object table page using the existing schema contracts”

### 5.3 Require explicit assumptions
Prompt pattern:

> State assumptions before coding. If any assumption conflicts with the spec, stop and list the conflict.

### 5.4 Require completion notes
Prompt pattern:

> At the end, list files changed, interfaces introduced, unresolved risks, and recommended next task.

---

## 6. Recommended Repo Structure

```text
project-root/
  specs/
    archicad_property_mapping_spec.md
    supabase_schema_api_contract_spec.md
    python_connector_technical_spec.md
    cursor_build_plan_chatgpt54_main_agent.md

  docs/
    architecture_overview.md
    decisions/
      ADR-001-system-boundaries.md
      ADR-002-scenario-model.md
      ADR-003-sync-transaction-model.md
    runbooks/
      local_dev.md
      inbound_sync_test.md
      outbound_sync_test.md
      archicad_validation.md

  apps/
    web/
      src/
        app/
        components/
        features/
        lib/
        types/
      package.json
      tsconfig.json

  services/
    connector/
      src/
        config.py
        main.py
        archicad_client.py
        archicad_reader.py
        archicad_writer.py
        schema_mapper.py
        supabase_client.py
        sync_engine.py
        validators.py
        models.py
        logger.py
        state_store.py
        retry.py
      tests/
      pyproject.toml

  database/
    migrations/
    seeds/
    policies/
    functions/

  shared/
    contracts/
      api/
      enums/
      schemas/
    examples/

  scripts/
    dev/
    ci/

  .cursor/
    rules/
      architecture.mdc
      coding_standards.mdc
      change_control.mdc
      testing.mdc

  .github/
    workflows/

  README.md

---

## 7. Repo Layer Responsibilities

## 7.1 `specs/`
Immutable build intent.

Contains the source-of-truth specifications.

Rule:
- implementation must not silently diverge from these files

## 7.2 `docs/`
Operational and explanatory documentation.

Contains:
- architecture summaries
- ADRs
- test runbooks
- setup instructions

## 7.3 `apps/web/`
External control-plane UI.

Contains:
- dashboard
- object table
- package/sequence editor
- linear scheduling view
- cost editor
- scenario manager
- approval queue
- sync log

## 7.4 `services/connector/`
Python Archicad connector.

Contains:
- Archicad read/write logic
- Supabase integration
- sync orchestration
- validation
- logging

## 7.5 `database/`
Supabase-facing SQL assets.

Contains:
- migrations
- RLS policies
- helper functions
- seeds for package/status vocabularies if desired

## 7.6 `shared/`
Shared contracts between UI and connector.

Contains:
- enums
- JSON schema examples
- TypeScript/Python-aligned API shapes where practical

---

## 8. Recommended Tech Stack

## 8.1 Web app
- Next.js
- TypeScript
- React
- Tailwind
- Supabase JS client
- TanStack Query
- Zod for schema validation

## 8.2 Connector
- Python 3.11+
- Archicad Python connection
- requests/httpx for Supabase access if needed
- Pydantic for typed models
- pytest for tests

## 8.3 Database
- Supabase Postgres
- SQL migrations
- optional RPC functions
- RLS policies

---

## 9. Cursor Rules Files

Create `.cursor/rules/` files to keep the main agent disciplined.

## 9.1 `architecture.mdc`
Purpose:
- protect system boundaries

Contents should include rules such as:
- Archicad owns geometry
- UI does not render model geometry
- connector writes only allowlisted CCP fields
- scenarios live in Supabase and do not duplicate model identity tables
- approval is required before outbound sync

## 9.2 `coding_standards.mdc`
Purpose:
- enforce code quality

Rules:
- typed interfaces required
- clear module boundaries
- no silent fallback logic
- explicit error handling
- comments on public modules only where useful

## 9.3 `change_control.mdc`
Purpose:
- reduce drift

Rules:
- any schema change must update spec or ADR
- any new enum must be documented
- do not rename fields casually

## 9.5 `security.mdc`
Purpose:
- keep security requirements active during normal development

Rules:
- no new write path without authorization and audit checks
- no secrets in source control or logs
- no browser exposure of elevated backend credentials
- no outbound Archicad write outside the explicit allowlist and approval flow

## 9.4 `testing.mdc`
Purpose:
- keep test coverage aligned with milestones

Rules:
- unit tests for mapping and validation
- integration tests for Supabase operations
- manual validation checklist for Archicad write-back

---

## 10. Milestone Plan

Build in the order below.

Do not skip milestone validation.

## Milestone 0 — Repo and guardrails

### Goal
Create the repo structure, rules, shared conventions, and base documentation.

### Deliverables
- repo folders created
- spec files placed in `/specs`
- Cursor rules created
- README with architecture summary
- initial ADRs created
- initial security rule and trust-boundary documentation created

### Validation gate
- repo is understandable without verbal explanation
- all team members/agents can see system boundaries clearly
- security ownership is clear across UI, database, and connector layers

---

## Milestone 1 — Database foundation

### Goal
Implement the Supabase schema and migration layer.

### Deliverables
- migrations for all MVP tables
- indexes
- basic RLS scaffolding
- seed data if needed for enums or package examples
- helper SQL or RPC functions if used
- documented auth and project-scoping assumptions

### Build tasks
1. generate SQL migrations from spec
2. create local/dev migration workflow
3. add schema README
4. add ERD or schema summary doc

### Validation gate
- database provisions cleanly from zero
- tables match spec names and fields
- unique constraints and indexes exist
- baseline CRUD works
- project-scoped authorization and RLS assumptions are explicit

---

## Milestone 2 — Shared contracts

### Goal
Create stable shared enums, validation schemas, and API contract definitions.

### Deliverables
- shared enums for statuses and units
- request/response types for core UI and connector operations
- Zod schemas in web app
- Pydantic or dataclasses in connector
- explicit contract coverage for sensitive state transitions and writable-field allowlists

### Validation gate
- web and connector use the same logical vocabulary
- no duplicate enum drift
- invalid states and non-allowlisted fields are rejected consistently

---

## Milestone 3 — Connector inbound sync skeleton

### Goal
Build the first working Archicad -> Supabase flow.

### Deliverables
- connector config loading
- Archicad connection wrapper
- reader stubs and mappings
- sync run creation and completion
- bulk upsert to Supabase
- safe credential-loading and logging boundaries for connector runtime modes

### Narrow first slice
Read a very limited object scope first, for example:
- zones only
or
- a small set of selected elements plus zones

### Validation gate
- connector connects to running Archicad
- records appear in Supabase
- no duplicate identity rows for repeated syncs
- sync logs are created
- secrets are not written to logs or source-controlled config

---

## Milestone 4 — Read-only web UI

### Goal
Show synced data in a clean control-plane interface.

### Deliverables
- project dashboard shell
- object table page
- zones page or filtered table view
- sync status view

### Validation gate
- user can inspect imported objects without raw SQL
- filters by project/storey/zone/package work
- the UI does not require elevated backend credentials for read-only use

---

## Milestone 5 — Package and sequence editing

### Goal
Allow edits in the external UI, but keep them in Supabase only at first.

### Deliverables
- editable operational state table
- package assignment UI
- sequence fields UI
- draft change set creation
- field-level diff generation

### Validation gate
- edits are stored as change sets, not written directly into Archicad
- diffs are visible and inspectable
- invalid transitions or unauthorized edit paths are blocked cleanly

---

## Milestone 6 — Approval workflow

### Goal
Require review before any outbound sync.

### Deliverables
- approval queue page
- approve/reject actions
- status transitions
- audit events

### Validation gate
- only approved change sets become eligible for outbound sync
- rejected items remain traceable
- reviewer-sensitive actions are explicit and auditable

---

## Milestone 7 — Connector outbound sync

### Goal
Write approved operational properties back into Archicad.

### Deliverables
- approved queued change-set fetch
- validation layer for outbound fields
- Archicad property writer
- status updates for sync success/failure
- item-level logging

### Start narrow
Write back only these fields first:
- `CCP_PackageID`
- `CCP_SequenceGroup`
- `CCP_SequenceOrder`
- `CCP_ConstructionState`

Only expand once the loop is stable.

### Validation gate
- approved field values appear in Archicad
- failed writes are logged clearly
- repeat sync does not corrupt state
- unknown, unauthorized, or non-allowlisted writes fail closed

---

## Milestone 8 — Archicad-side validation

### Goal
Confirm that synced properties create visible value inside Archicad.

### Deliverables
- sample Graphic Override rules
- sample schedules using CCP fields
- sample saved views or filters
- validation runbook

### Validation gate
- package or state changes are visible in Archicad through Graphic Overrides
- schedules display synchronized fields correctly
- only approved operational metadata appears in the dedicated Archicad property group

---

## Milestone 9 — Cost data slice

### Goal
Add cost-related fields and reporting.

### Deliverables
- cost editor UI
- unit/rate/budget validation
- totals by package / zone / level
- cost-oriented schedule output support

### Validation gate
- object/zone costs aggregate correctly
- invalid rate/unit data is blocked before sync
- numeric and enum validation still blocks unsafe outbound writes as fields expand

---

## Milestone 10 — Scenario management

### Goal
Enable scenario cloning and comparison.

### Deliverables
- baseline scenario creation
- clone scenario action
- compare scenario table/view
- scenario-aware operational edits

### Validation gate
- scenarios can diverge without breaking identity mapping
- baseline remains intact
- scenario access and compare actions remain project-scoped and auditable

---

## Milestone 11 — Read-only linear scheduling

### Goal
Add a readable time-location scheduling view that communicates construction sequencing using project metadata and scenario overlays.

### Deliverables
- location-axis model
- plotted schedule activity schema
- shared contracts for activity types and display layers
- read-only React/SVG schedule page with linked linear, stage-flow, and Gantt views
- demo data showing baseline, planned, actual, remaining, and milestone examples
- package/workfront/activity-type filtering, including multi-package schedule interrogation

### Validation gate
- the chart is understandable on one screen or page
- time and location axes are explicit
- linear, bar, block, and milestone activity types render clearly
- the schedule remains linked to project/scenario metadata rather than a disconnected planning model
- stage-flow highlighting stays linked to the plotted activities rather than becoming a separate planning model

---

## 11. Agent Operating Model in Cursor

Even with ChatGPT 5.4 as the main agent, use explicit sub-roles in prompts.

## 11.1 Primary operating roles

### Architect role
Use for:
- module boundaries
- schema review
- ADR drafting

### Builder role
Use for:
- file creation
- implementation
- migrations
- component scaffolding

### Reviewer role
Use for:
- code review
- edge-case analysis
- refactor assessment

### Tester role
Use for:
- unit test generation
- integration test planning
- manual validation checklists

---

## 12. Recommended Prompt Patterns for ChatGPT 5.4

## 12.1 Task prompt pattern

> Use the files in `/specs` as source of truth. Implement only Milestone X scope. State assumptions first. Do not redesign unrelated modules. At the end, list files changed, tests added, unresolved risks, and the next recommended task.

## 12.2 Review prompt pattern

> Review this implementation against the relevant spec file. Identify spec drift, schema mismatches, hidden coupling, missing validation, and weak error handling. Rank issues by severity.

## 12.3 Refactor prompt pattern

> Refactor this module only if it reduces complexity or aligns it more closely with the spec. Preserve behavior. Explain the reason for each structural change.

## 12.4 Test prompt pattern

> Generate tests for this module based on the spec-derived behavior, not guessed behavior. Cover valid, invalid, and edge-case inputs.

---

## 13. Build Order Within Each Milestone

Within each milestone, use the same sequence:

1. restate milestone scope
2. inspect relevant spec sections
3. define interfaces/types
4. scaffold implementation
5. add validation/error handling
6. add tests
7. write short completion note
8. update docs if interface changed

This keeps Cursor sessions coherent.

---

## 14. Validation Contracts

For this project, every milestone should have explicit validation contracts.

## 14.1 Example contract shape

```text
Input:
- known seed data
- known Archicad target objects
- known package/state values

Expected:
- rows inserted/updated in specific tables
- specific status transitions
- specific property values written into Archicad
- specific logs emitted
```

## 14.2 Minimum validation categories
- schema validation
- identity mapping validation
- status transition validation
- outbound write safety validation
- Archicad read/write manual confirmation
- authorization and least-privilege validation
- secret-handling and logging-boundary validation

---

## 15. Change Control Rules

Use these rules throughout the build.

1. No field renames without updating the relevant spec and migration strategy.
2. No new enum values without documentation.
3. No direct UI-to-Archicad writes outside the approval/sync mechanism.
4. No connector writes outside the allowlist.
5. No speculative hotlink complexity in the MVP core path.
6. No untracked schema changes.
7. No new milestone deliverable is complete without the matching security checks for that scope.

---

## 16. Suggested ADRs to Create Early

Create these Architectural Decision Records early.

### ADR-001 — System boundaries
Defines ownership split between Archicad, UI, Supabase, connector.

### ADR-002 — Scenario model
Defines scenario isolation and how it overlays the same model identity base.

### ADR-003 — Outbound sync transaction model
Defines change sets, approvals, queued sync, and failure handling.

### ADR-004 — Controlled vocabularies
Defines units, statuses, and required normalized values.

### ADR-005 — Hotlink strategy for MVP
Defines limited hotlink expectations and deferred complexity.

### ADR-006 — Security and trust boundaries
Defines role assumptions, secret ownership, service-role usage, and per-layer authorization boundaries.

---

## 17. Manual Validation Runbooks

Write short runbooks in `/docs/runbooks/`.

Required runbooks:
- local development setup
- inbound sync test
- outbound sync test
- Archicad visual validation
- scenario clone validation

Each runbook should contain:
- prerequisites
- seed/setup data
- exact execution steps
- expected outcomes
- common failure points

---

## 18. First End-to-End Vertical Slice

The first complete slice should be deliberately small.

## Scope
- zones only or zones plus a small subset of elements
- read from Archicad
- store in Supabase
- display in UI table
- edit `package_id`
- approve change set
- write `CCP_PackageID` back to Archicad
- verify in Archicad schedule or Graphic Override

## Why this first
Because it proves:
- identity mapping
- database structure
- UI data flow
- approval workflow
- Archicad write-back
- real user value

without the noise of the full system.

---

## 19. Definition of Done by Milestone

A milestone is only complete when all of the following are true:

1. code compiles/runs
2. tests pass
3. relevant docs are updated
4. spec alignment is checked
5. manual validation steps have been run where applicable
6. next milestone assumptions are clear

---

## 20. Risk Register

## 20.1 Biggest early risks
- Archicad API surface limitations for some metadata paths
- hotlink access being patchier than expected
- property typing mismatches during write-back
- schema drift between UI and connector
- building too much before closing the first sync loop

## 20.2 Mitigation
- keep first vertical slice small
- make write-back field allowlist strict
- use shared enums/contracts early
- defer advanced hotlink behavior
- validate manually in Archicad at each outbound step

---

## 21. Recommended Initial Cursor Tasks

Use these tasks in order.

### Task 1
Create repo structure and add `/specs`, `/docs`, `.cursor/rules`, and README.

### Task 2
Generate Supabase SQL migrations from `supabase_schema_api_contract_spec.md`.

### Task 3
Create shared enums and schema contracts for statuses, units, and change-set states.

### Task 4
Scaffold Python connector modules with config, logging, and sync run lifecycle.

### Task 5
Implement inbound sync for zones only.

### Task 6
Build a read-only web page showing synced zones.

### Task 7
Add draft change-set creation for package assignment.

### Task 8
Add approval workflow.

### Task 9
Implement outbound write-back for `CCP_PackageID` only.

### Task 10
Validate Graphic Override or schedule response in Archicad.

---

## 22. Recommended Prompt to Start the Build

Use this in Cursor with ChatGPT 5.4 as the main agent:

> Use the spec files in `/specs` as the source of truth, especially the build plan and Supabase schema spec. We are working only on Milestone 0 and Milestone 1. First, restate the milestone scope and assumptions. Then create the repo structure, Cursor rule files, initial docs skeleton, and Supabase SQL migrations. Do not implement UI or connector logic yet. At the end, list files created, any assumptions needing confirmation, and the next recommended task.

---

## 23. Final Position

This build should be treated as a **controlled systems project**, not a vague app prototype.

ChatGPT 5.4 should be used as:
- architect
- builder
- reviewer
- validator

but always within:
- explicit scope
- spec-bound prompts
- milestone gates
- validation contracts

That is the most reliable path to a working MVP in Cursor.
