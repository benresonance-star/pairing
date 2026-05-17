# Local Development

## Prerequisites

- Node.js 20+
- Python 3.11+
- optional Supabase project credentials
- optional Archicad instance for live connector validation

## Initial setup

1. Run `npm install` from the repo root.
2. Create a Python virtual environment if desired, then install connector dev dependencies with `python -m pip install -e ".\\services\\connector[dev]"`.
3. Copy `.env.example` values into local environment variables if live services are being used.
4. Use the demo adapters and fixture data under `shared/examples/` when live services are not available.

## Common workflows

### Web app

Run `npm run demo:web` from the repo root.

For a live Supabase-backed run, set `CCP_DATA_SOURCE=supabase`, configure the Supabase env vars from `/.env.example`, then follow `docs/runbooks/supabase_live.md`.

Optional scenario targeting:

- leave `CCP_SCENARIO_ID` unset to use the baseline scenario
- set `CCP_SCENARIO_ID=<scenario-uuid>` when you need the connector inbound loop to seed or refresh a non-baseline scenario

### Connector demo mode

Use the root scripts:

- `npm run demo:reset`
- `npm run demo:inbound`
- `npm run demo:outbound`

### Primary workflow acceptance

Use `docs/runbooks/primary_workflow_acceptance.md` when checking whether the app is still focused on the site-to-scenario-to-change-set-to-Archicad loop.

### Connector dry-run mode

Use `python scripts/dev/connector_cli.py outbound --dry-run` before enabling any outbound write behavior.

## Runtime files

Demo runtime state lives under `shared/examples/runtime/`:

- `demo_state.json`: mutable local runtime store
- `connector_state.json`: last recorded connector runs

The seed file is `shared/examples/demo_state.seed.json`.

On first run, if `demo_state.json` is missing, it is copied from the seed file. After that, **`demo_state.json` is not overwritten when the seed file is updated** (so local edits and new sites are not lost when you pull repo changes).

To **refresh runtime from seed** when you intentionally want the bundled demo data again:

- run `npm run demo:reset` or `npm run demo:seed` (see package.json / connector CLI), or  
- set **`CCP_REFRESH_RUNTIME_FROM_SEED=1`** (or `true`) in the environment before starting the web app; then, if the seed file is newer than `demo_state.json`, the app will copy seed over runtime on the next read.

## Recommended local sequence

1. `npm run demo:reset`
2. `npm run demo:inbound`
3. `npm run demo:web`
4. draft and queue a change set in the UI
   - use the `Scenarios` page to create a draft scenario clone when validating multi-scenario behavior
   - switch the `Objects` and `Change Sets` pages to the intended scenario before drafting edits
5. `npm run demo:outbound`
6. inspect recent writes on the overview page or in `shared/examples/runtime/demo_state.json`

## Expected outcomes

- the web app can load objects and change sets from the runtime demo store
- the connector can perform inbound and outbound demo loops
- runtime files remain isolated under `shared/examples/runtime/`
- the same web and connector entry points can switch to Supabase by env configuration without changing the UI routes
