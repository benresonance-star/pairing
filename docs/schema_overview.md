# Schema Overview

## Purpose

The database layer mirrors the Supabase schema and API contract specification and provides the stable operational backbone for the MVP.

## Core identity tables

- `projects`
- `model_objects`
- `zones`
- `hotlink_instances`

These tables map Archicad-linked identities and should not be duplicated per scenario.

## Operational workflow tables

- `work_packages`
- `scenarios`
- `operational_state`
- `change_sets`
- `change_set_items`
- `approvals`
- `sync_runs`
- `audit_events`
- `location_axes`
- `linear_schedule_views`
- `linear_schedule_activities`
- `linear_progress_points`

## Migrations

- `database/migrations/001_initial_schema.sql`
  - tables
  - constraints
  - indexes
  - `updated_at` trigger support
- `database/migrations/002_helper_functions.sql`
  - `clone_scenario`
  - `project_summary`
  - `pending_approved_change_sets`
  - `scenario_diff`
  - `bulk_validate_change_set`
- `database/migrations/003_rls_scaffolding.sql`
  - JWT-claim-based project access helpers
  - baseline row-level security policies
- `database/migrations/004_linear_scheduling_schema.sql`
  - location axes
  - linear schedule views
  - plotted schedule activities
  - progress points
  - RLS policies for schedule tables

## RLS assumption

The baseline RLS scaffolding assumes Supabase JWTs include an `app_metadata.project_ids` array of UUID strings. Service-role access bypasses those checks for backend sync tasks.
