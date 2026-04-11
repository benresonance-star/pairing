# Local Development

## Prerequisites

- Node.js 20+
- Python 3.11+
- optional Supabase project credentials
- optional Archicad instance for live connector validation

## Initial setup

1. Run `npm install` from `apps/web/`.
2. Create a Python virtual environment if desired, then install connector dev dependencies with `python -m pip install -e ".\\services\\connector[dev]"`.
3. Copy `.env.example` values into local environment variables if live services are being used.
4. Use the demo adapters and fixture data under `shared/examples/` when live services are not available.

## Common workflows

### Web app

Run `npm run demo:web` from the repo root.

### Connector demo mode

Use the root scripts:

- `npm run demo:reset`
- `npm run demo:inbound`
- `npm run demo:outbound`

### Connector dry-run mode

Use `python scripts/dev/connector_cli.py outbound --dry-run` before enabling any outbound write behavior.

## Runtime files

Demo runtime state lives under `shared/examples/runtime/`:

- `demo_state.json`: mutable local runtime store
- `connector_state.json`: last recorded connector runs

The seed file is `shared/examples/demo_state.seed.json`.

When the web app starts, it refreshes `demo_state.json` automatically if the seed file is newer. This keeps demo-data spec changes and seed updates visible without requiring manual file replacement. Use `npm run demo:reset` when you want to discard local runtime mutations explicitly.

## Recommended local sequence

1. `npm run demo:reset`
2. `npm run demo:inbound`
3. `npm run demo:web`
4. draft and queue a change set in the UI
5. `npm run demo:outbound`
6. inspect recent writes on the overview page or in `shared/examples/runtime/demo_state.json`

## Expected outcomes

- the web app can load objects and change sets from the runtime demo store
- the connector can perform inbound and outbound demo loops
- runtime files remain isolated under `shared/examples/runtime/`
