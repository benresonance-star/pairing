# Supabase Live Bootstrap

## Purpose

Use this runbook to move the CCP MVP from file-backed demo state to a real Supabase-backed dev environment.

## Prerequisites

- Docker Desktop running if you want to use local Supabase
- or a hosted Supabase project plus its project URL, service role key, and database connection string
- Python 3.11+
- Node.js 20+

## Environment

Start from the templates:

- `/.env.example`
- `apps/web/.env.example`

Set at least:

- `CCP_DATA_SOURCE=supabase`
- `PROJECT_ID=11111111-1111-1111-1111-111111111111`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_DB_URL=...`

## Local Supabase

1. Run `npx supabase init` once from the repo root if the `supabase/` folder does not exist yet.
2. Start Docker Desktop.
3. Run `npx supabase start`.
4. Use the local values printed by the CLI for:
   - API URL
   - service role key
   - database URL

## Apply schema and seed data

Run:

```powershell
npm run supabase:bootstrap
```

This script:

- applies all SQL files in `database/migrations/`
- removes the current `PROJECT_ID` from the database if it already exists
- reseeds the project using `shared/examples/demo_state.seed.json`

## Web app

Run the web app with Supabase mode enabled:

```powershell
npm run dev --workspace web
```

Expected checks:

- `/` loads dashboard counts from Supabase
- `/objects` loads objects and packages from Supabase
- `/change-sets` loads change sets from Supabase
- `/linear-schedule` loads the townhouse schedule from Supabase

## Connector

Run inbound and outbound against the same project:

```powershell
python scripts/dev/connector_cli.py inbound
python scripts/dev/connector_cli.py outbound --dry-run
```

Expected checks:

- inbound writes `zones`, `model_objects`, `operational_state`, `sync_runs`, and `audit_events`
- outbound consumes `queued_for_sync` change sets
- outbound writes `archicad_writes`
- failed items write `sync_errors` back to `change_sets`

## Governed scenario smoke check

After changing scenario editing, change-set approval, connector outbound validation, or the Supabase store, run:

```powershell
npm run supabase:smoke:governed
```

This script loads `/.env`, applies the Supabase bootstrap unless `-- --skip-bootstrap` is passed, then validates the governed scenario path end to end:

- creates a scenario operational edit through the same store API used by the scenario editor
- confirms the operational row is unchanged while the change set is still draft
- submits, approves, and queues the change set
- runs connector outbound in `--dry-run` mode
- verifies the change set is `synced`, the operational row is updated, and an `archicad_writes` record exists for `CCP_ConstructionState`

To reuse an already bootstrapped project without reseeding:

```powershell
npm run supabase:smoke:governed -- --skip-bootstrap
```

## Notes

- Demo mode still works with `CCP_DATA_SOURCE=demo`.
- The web app uses server-side Supabase access and never exposes the service role key to the browser.
- All live queries must stay project-scoped through `PROJECT_ID`.
