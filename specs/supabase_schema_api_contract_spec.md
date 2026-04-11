# Supabase Schema and API Contract Specification

## 1. Purpose

Define the Supabase data model, API shape, validation rules, and sync contracts for the Archicad Construction Control Plane MVP.

Supabase acts as:

- operational state store
- scenario store
- approval workflow layer
- audit and sync log
- two-way integration bus between UI and Archicad connector

---

## 2. Design Principles

1. Geometry is not stored as a visualization payload for this MVP.
2. Supabase stores operational metadata, not BIM authoring truth.
3. Every model-linked record must map to a stable Archicad identity.
4. Scenario state must be versionable without duplicating geometry.
5. Changes must be auditable and approval-based before write-back.
6. API contracts must be explicit and stable.
7. Security must be implemented incrementally from the first milestone, not deferred to a final hardening pass.
8. Access control should follow least-privilege principles for users, services, and automated sync jobs.

---

## 3. Core Entities

The MVP must support these primary entities:

- projects
- model_objects
- zones
- hotlink_instances
- work_packages
- operational_state
- scenarios
- change_sets
- change_set_items
- approvals
- sync_runs
- audit_events
- archicad_writes
- location_axes
- linear_schedule_views
- linear_schedule_activities
- linear_progress_points

---

## 4. Table Specifications

## 4.1 projects

Purpose:
- top-level project container

Fields:
- `id` uuid primary key
- `name` text not null
- `archicad_project_id` text nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Constraints:
- project name required

---

## 4.2 model_objects

Purpose:
- normalized records for Archicad-linked objects

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `archicad_guid` text not null
- `object_type` text not null
- `classification` text nullable
- `storey` text nullable
- `zone_key` text nullable
- `hotlink_key` text nullable
- `name` text nullable
- `quantity_json` jsonb nullable
- `archicad_snapshot_json` jsonb nullable
- `last_seen_at` timestamptz nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Constraints:
- unique (`project_id`, `archicad_guid`)

Indexes:
- (`project_id`)
- (`project_id`, `object_type`)
- (`project_id`, `zone_key`)
- (`project_id`, `hotlink_key`)

---

## 4.3 zones

Purpose:
- explicit zone register for reporting and mapping

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `zone_key` text not null
- `zone_name` text nullable
- `storey` text nullable
- `archicad_guid` text nullable
- `area` numeric nullable
- `metadata_json` jsonb nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Constraints:
- unique (`project_id`, `zone_key`)

Indexes:
- (`project_id`, `storey`)

---

## 4.4 hotlink_instances

Purpose:
- hotlink/module instance tracking for MVP reporting and package attachment

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `hotlink_key` text not null
- `archicad_guid` text nullable
- `module_name` text nullable
- `instance_name` text nullable
- `storey` text nullable
- `metadata_json` jsonb nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Constraints:
- unique (`project_id`, `hotlink_key`)

---

## 4.5 work_packages

Purpose:
- central package register

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `package_id` text not null
- `package_name` text not null
- `trade_code` text nullable
- `workfront` text nullable
- `description` text nullable
- `color_key` text nullable
- `active` boolean default true
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Constraints:
- unique (`project_id`, `package_id`)

Indexes:
- (`project_id`, `trade_code`)

---

## 4.6 scenarios

Purpose:
- versioned operational datasets

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `name` text not null
- `parent_scenario_id` uuid nullable references scenarios(id)
- `status` text not null default 'draft'
- `created_by` text nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Suggested statuses:
- `baseline`
- `draft`
- `active`
- `archived`

Indexes:
- (`project_id`)
- (`project_id`, `status`)

---

## 4.7 operational_state

Purpose:
- scenario-specific operational values linked to model objects, zones, or hotlink instances

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `scenario_id` uuid references scenarios(id)
- `object_ref_type` text not null
- `object_ref_id` uuid not null
- `package_id` text nullable
- `sequence_group` text nullable
- `sequence_order` integer nullable
- `planned_start` date nullable
- `planned_finish` date nullable
- `actual_start` date nullable
- `actual_finish` date nullable
- `construction_state` text nullable
- `cost_code` text nullable
- `unit` text nullable
- `unit_rate` numeric nullable
- `quantity_basis` numeric nullable
- `budget_amount` numeric nullable
- `updated_by` text nullable
- `updated_at` timestamptz default now()
- `created_at` timestamptz default now()

Allowed `object_ref_type`:
- `model_object`
- `zone`
- `hotlink_instance`

Recommended unique rule:
- unique (`scenario_id`, `object_ref_type`, `object_ref_id`)

Indexes:
- (`project_id`, `scenario_id`)
- (`scenario_id`, `package_id`)
- (`scenario_id`, `construction_state`)

---

## 4.8 change_sets

Purpose:
- batch of proposed edits

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `scenario_id` uuid references scenarios(id)
- `title` text not null
- `description` text nullable
- `status` text not null default 'draft'
- `sync_errors` text[] not null default empty array
- `submitted_by` text nullable
- `submitted_at` timestamptz nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Suggested statuses:
- `draft`
- `submitted`
- `approved`
- `rejected`
- `queued_for_sync`
- `synced`
- `sync_failed`

Indexes:
- (`project_id`, `status`)
- (`scenario_id`, `status`)

---

## 4.9 change_set_items

Purpose:
- field-level changes within a change set

Fields:
- `id` uuid primary key
- `change_set_id` uuid references change_sets(id)
- `object_ref_type` text not null
- `object_ref_id` uuid not null
- `field_name` text not null
- `old_value_json` jsonb nullable
- `new_value_json` jsonb nullable
- `created_at` timestamptz default now()

Indexes:
- (`change_set_id`)
- (`object_ref_type`, `object_ref_id`)

---

## 4.10 approvals

Purpose:
- reviewer decisions

Fields:
- `id` uuid primary key
- `change_set_id` uuid references change_sets(id)
- `reviewer` text not null
- `decision` text not null
- `comment` text nullable
- `decided_at` timestamptz default now()

Allowed decisions:
- `approved`
- `rejected`

---

## 4.11 sync_runs

Purpose:
- top-level sync execution log

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `scenario_id` uuid nullable references scenarios(id)
- `direction` text not null
- `status` text not null
- `started_at` timestamptz not null
- `completed_at` timestamptz nullable
- `summary_json` jsonb nullable
- `created_at` timestamptz default now()

Allowed directions:
- `archicad_to_supabase`
- `supabase_to_archicad`

Allowed statuses:
- `running`
- `completed`
- `completed_with_errors`
- `failed`

---

## 4.12 audit_events

Purpose:
- append-only trace log

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `event_type` text not null
- `object_ref_type` text nullable
- `object_ref_id` uuid nullable
- `actor` text nullable
- `event_time` timestamptz not null default now()
- `payload_json` jsonb nullable

Indexes:
- (`project_id`, `event_time`)
- (`event_type`)

---

## 4.13 archicad_writes

Purpose:
- append-only record of connector write attempts against Archicad properties

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `change_set_id` uuid nullable references change_sets(id)
- `archicad_guid` text nullable
- `field_name` text not null
- `field_value` jsonb nullable
- `applied_at` timestamptz not null default now()
- `dry_run` boolean not null default false
- `created_at` timestamptz default now()

Indexes:
- (`project_id`, `applied_at`)
- (`change_set_id`)

Notes:
- `archicad_writes` complements `audit_events` with a queryable write ledger suited to recent-write UI views and connector validation
- dry-run entries may be recorded for validation-only outbound passes when the connector is configured not to mutate Archicad

---

## 4.14 location_axes

Purpose:
- define the ordered location axis used by linear scheduling views

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `name` text not null
- `description` text nullable
- `units_label` text nullable
- `location_reference_model` text not null
- `orientation_default` text not null default 'time_horizontal'
- `locations_json` jsonb not null
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Allowed `location_reference_model`:
- `stationing`
- `storey_sequence`
- `named_segments`

Allowed `orientation_default`:
- `time_horizontal`
- `time_vertical`

Indexes:
- (`project_id`)

Notes:
- `locations_json` should preserve ordered location entries used for display
- the MVP may keep location-axis entries in JSON for read-only visualization before introducing fully normalized child tables

---

## 4.15 linear_schedule_views

Purpose:
- named read-only linear scheduling configurations for a project or scenario

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `scenario_id` uuid nullable references scenarios(id)
- `location_axis_id` uuid references location_axes(id)
- `name` text not null
- `description` text nullable
- `time_axis_start` date not null
- `time_axis_finish` date not null
- `data_date` date nullable
- `orientation` text not null default 'time_horizontal'
- `metadata_json` jsonb nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Allowed `orientation`:
- `time_horizontal`
- `time_vertical`

Indexes:
- (`project_id`)
- (`scenario_id`)

Notes:
- `metadata_json` may store read-only UI metadata for the schedule view, such as stage-flow nodes, links, and layout hints
- that metadata should remain project-scoped and must not become a substitute for normalized approval or write-back records

---

## 4.16 linear_schedule_activities

Purpose:
- plotted activities for read-only linear schedule rendering

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `scenario_id` uuid nullable references scenarios(id)
- `linear_schedule_view_id` uuid references linear_schedule_views(id)
- `object_ref_type` text nullable
- `object_ref_id` uuid nullable
- `package_id` text nullable
- `workfront` text nullable
- `activity_name` text not null
- `activity_type` text not null
- `display_layer` text not null default 'planned'
- `color_key` text nullable
- `start_date` date not null
- `finish_date` date not null
- `location_ref` text nullable
- `start_location_ref` text nullable
- `finish_location_ref` text nullable
- `sequence_group` text nullable
- `sequence_order` integer nullable
- `metadata_json` jsonb nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Allowed `activity_type`:
- `linear`
- `bar`
- `block`
- `milestone`

Allowed `display_layer`:
- `baseline`
- `planned`
- `actual`
- `remaining`

Allowed `object_ref_type`:
- `model_object`
- `zone`
- `hotlink_instance`

Indexes:
- (`project_id`, `linear_schedule_view_id`)
- (`project_id`, `package_id`)
- (`project_id`, `workfront`)
- (`scenario_id`, `display_layer`)

Notes:
- `bar` activities should use `location_ref`
- `block` and `linear` activities should use `start_location_ref` and `finish_location_ref`
- `milestone` activities may use a single location reference or remain location-agnostic
- `metadata_json` may include a stage-grouping key used to link plotted activities to higher-level stage-flow nodes in the web UI

---

## 4.17 linear_progress_points

Purpose:
- actual progress samples for plotting updated linear activities over time and location

Fields:
- `id` uuid primary key
- `project_id` uuid references projects(id)
- `linear_schedule_activity_id` uuid references linear_schedule_activities(id)
- `progress_date` date not null
- `location_ref` text not null
- `note` text nullable
- `created_at` timestamptz default now()

Indexes:
- (`project_id`, `linear_schedule_activity_id`)
- (`project_id`, `progress_date`)

---

## 5. Relationship Rules

## 5.1 Model identity
External systems must map to Archicad through:
- `model_objects.archicad_guid`
- `zones.zone_key`
- `hotlink_instances.hotlink_key`

## 5.2 Operational state linkage
Each operational state record belongs to exactly one:
- scenario
- object reference pair (`object_ref_type`, `object_ref_id`)

## 5.3 Change control
Only approved change sets may be queued for outbound sync.

## 5.4 Linear scheduling linkage
Linear schedule views must remain linked to:
- project identity
- optional scenario overlays
- the ordered location axis
- existing object references or operational metadata where applicable

Linear scheduling data should not duplicate model identity tables.

---

## 6. API Contract Overview

The MVP may use:
- Supabase REST
- Supabase client SDK
- PostgreSQL RPC functions where useful

The logical API contract should remain stable regardless of transport.

---

## 7. Required Logical Endpoints / Actions

## 7.1 Project actions
- create project
- list projects
- get project summary

## 7.2 Inbound model sync actions
- upsert model objects
- upsert zones
- upsert hotlink instances
- create sync run
- finalize sync run

## 7.3 Package actions
- list packages
- create package
- update package
- deactivate package

## 7.4 Scenario actions
- create baseline scenario
- clone scenario
- list scenarios
- update scenario name
- update scenario status
- archive scenario
- delete scenario when no change sets depend on it
- compare scenarios

## 7.5 Operational state actions
- get operational state for scenario
- bulk upsert operational records
- bulk edit filtered operational records
- update a single operational state row for scenario editing

## 7.6 Change set actions
- create draft change set
- add item(s) to change set
- submit change set
- approve change set
- reject change set
- mark change set queued
- mark sync result

## 7.7 Sync actions
- list approved pending changes
- write sync result
- record Archicad write history
- record per-item sync errors on failed outbound change sets
- list sync logs

## 7.8 Linear scheduling actions
- list location axes
- create or update a linear schedule view
- list plotted schedule activities for a view
- create schedule activity
- update schedule activity
- delete schedule activity
- list actual progress points for a view
- compare baseline and actual schedule layers

---

## 8. Example Payload Shapes

## 8.1 Upsert model object

```json
{
  "project_id": "uuid",
  "archicad_guid": "WALL-456",
  "object_type": "wall",
  "classification": "external_wall",
  "storey": "L08",
  "zone_key": "L08:APT-0803",
  "hotlink_key": null,
  "name": "Ext Wall Type A",
  "quantity_json": {
    "area": 22.5,
    "length": 7.2
  }
}
```

## 8.2 Upsert operational state

```json
{
  "project_id": "uuid",
  "scenario_id": "uuid",
  "object_ref_type": "model_object",
  "object_ref_id": "uuid",
  "package_id": "PKG-FACADE-02",
  "sequence_group": "facade_wave_2",
  "sequence_order": 120,
  "planned_start": "2026-05-01",
  "planned_finish": "2026-05-15",
  "construction_state": "ready",
  "cost_code": "FCD-01",
  "unit": "m2",
  "unit_rate": 640.0,
  "quantity_basis": 22.5,
  "budget_amount": 14400.0
}
```

## 8.3 Submit change set

```json
{
  "change_set_id": "uuid",
  "status": "submitted",
  "submitted_by": "ben@example.com",
  "submitted_at": "2026-04-11T09:30:00Z"
}
```

## 8.4 Approval decision

```json
{
  "change_set_id": "uuid",
  "reviewer": "reviewer@example.com",
  "decision": "approved",
  "comment": "OK to sync"
}
```

---

## 9. Validation Rules

## 9.1 Package validation
`package_id` must exist in `work_packages` before outbound sync.

## 9.2 Construction state validation
Allowed values:
- `not_started`
- `ready`
- `in_progress`
- `blocked`
- `complete`

## 9.3 Unit validation
Allowed values:
- `m2`
- `m3`
- `lm`
- `count`
- `item`
- `manual`

## 9.4 Change set validation
A submitted change set must:
- belong to an existing scenario
- contain at least one item
- not already be synced
- have field names that exist in the writeable operational model

Queued change sets should clear stale `sync_errors` before the next outbound attempt.

## 9.5 Scenario validation
Scenario clone must copy operational state, not duplicate model identity tables.

Additional scenario rules:
- baseline scenarios cannot be archived or deleted
- deleting a scenario must also remove scenario-scoped schedule rows and progress points
- scenarios with existing change sets should be archived instead of deleted
- cloning should copy scenario-scoped linear schedule views, activities, and progress points together with operational state

## 9.6 Linear scheduling validation
- every linear schedule view must point to a valid location axis
- plotted activities must use an allowed activity type
- display layers must use a controlled vocabulary
- activity dates must fit within a reasonable project timescale
- location references used by schedule activities must exist in the selected axis definition
- schedule activity names must be non-empty
- package-linked schedule activities must reference an active package in `work_packages`

---

## 10. Approval and Sync State Machine

## 10.1 Change set states
- `draft`
- `submitted`
- `approved`
- `rejected`
- `queued_for_sync`
- `synced`
- `sync_failed`

## 10.2 Rules
- only `submitted` change sets can be approved or rejected
- only `approved` change sets can move to `queued_for_sync`
- only queued change sets can be processed by connector
- connector writes final status of `synced` or `sync_failed`

---

## 11. Recommended RPC / Service Helpers

Useful helper functions:

- `clone_scenario(source_scenario_id, new_name, user_id)`
- `project_summary(project_id)`
- `pending_approved_change_sets(project_id)`
- `scenario_diff(project_id, scenario_a, scenario_b)`
- `bulk_validate_change_set(change_set_id)`

These may be implemented in SQL, Edge Functions, or application layer services.

---

## 12. Row-Level Security

Enable RLS on all project tables.

Minimum policy principle:
- users can only read/write rows for projects they are assigned to

Typical roles:
- admin
- editor
- reviewer
- viewer

RLS design should be added before multi-user rollout.

## 12.1 Security requirements for staged delivery
- security controls must ship alongside each milestone that introduces new data access
- no milestone should introduce a new write path without matching authorization and audit rules
- service-role operations must stay in backend/connector code only and never be exposed to the browser
- demo or local modes must preserve the same logical authorization boundaries even if they do not use live auth

## 12.2 Minimum auth assumptions
- project access is derived from authenticated user membership
- JWT claims or equivalent session context must carry project-scoped access information
- reviewers must be distinguishable from editors for approval actions
- backend connector jobs may use elevated credentials, but only from non-browser execution contexts

## 12.3 Data protection rules
- secrets must never be stored in project tables
- audit payloads should include enough context for reconstruction, but should avoid leaking credentials or raw secret material
- `archicad_snapshot_json` should stay lean and should not capture unnecessary sensitive data

## 12.4 API security rules
- all mutating actions must validate project access before data changes
- change-set approval and queue transitions must enforce role and state-machine rules
- bulk operations must remain project-scoped and must not cross project boundaries
- schema helpers and RPC functions must be reviewed for privilege escalation risk

---

## 13. Audit Requirements

Record audit events for:
- inbound model sync start/finish
- operational edits
- change set submit
- approval decision
- outbound sync start/finish
- sync failure
- package register changes

Payloads should include enough context for reconstruction.

Security-relevant events should also be recorded, including:
- approval decisions
- queue-for-sync transitions
- sync failures caused by validation or authorization issues
- package-register changes that affect write-back validity

Where implemented, Archicad property write attempts should also be queryable through `archicad_writes` so recent connector activity can be reviewed without reconstructing it from generic audit payloads alone.

---

## 14. Performance Guidelines

- use bulk upserts for inbound sync
- avoid per-row chatty writes where possible
- index foreign keys and filter keys
- keep `archicad_snapshot_json` lean
- keep change sets explicit instead of diffing entire tables repeatedly
- keep location-axis and schedule-activity queries indexable by project, scenario, and view
- keep read-only chart payloads focused on the selected view and filter scope

---

## 15. Acceptance Criteria

This spec is implemented successfully when:

1. A project can be created and initialized.
2. Archicad-linked objects can be upserted without identity duplication.
3. A baseline scenario can be created.
4. Operational data can be edited per scenario.
5. Change sets can be submitted, approved, and queued.
6. Pending approved changes can be retrieved by the connector.
7. Sync runs and audit events can be recorded.
8. Outbound write attempts can be recorded in `archicad_writes`, including dry-run entries where used.
9. Scenario comparisons can be generated from operational data.
10. Row-level security and project-scoped authorization rules exist for all MVP tables.
11. No browser-facing workflow requires direct use of elevated backend credentials.
12. A project-scoped linear scheduling view can be rendered from an explicit location axis and plotted activity records.

---

## 16. Security-by-Stage Requirements

### Stage 0: Repo and contracts
- document roles, trust boundaries, and secret ownership
- define shared status vocabularies so invalid states are not silently accepted

### Stage 1: Database foundation
- apply RLS scaffolding and project-scoped policies with the schema
- document JWT or session assumptions used by policies

### Stage 2: Shared contracts
- codify role-sensitive state transitions and allowed enum values
- keep validation schemas aligned across UI, backend, and connector

### Stage 3+: Feature milestones
- every new write path must include authorization, validation, and audit coverage
- every approval or sync path must be tested for invalid transitions and unauthorized access
- read-only linear scheduling views should preserve project scoping and avoid introducing browser-side elevated access patterns
