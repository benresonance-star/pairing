# Inbound Sync Test

## Goal

Validate that zones plus a small element subset can be read, mapped, and stored without identity drift.

## Setup

- ensure `shared/examples/sample_archicad_snapshot.json` exists
- ensure `shared/examples/runtime/demo_state.json` is writable

## Steps

1. Reset runtime state with `npm run demo:reset`.
2. Run the connector inbound command with `npm run demo:inbound`.
3. Confirm a new inbound `sync_run` is recorded.
4. Confirm `zones` are present in runtime state.
5. Confirm selected `model_objects` are present in runtime state.
6. Re-run the inbound command.

## Expected outcomes

- records are upserted rather than duplicated
- `project_id` and stable identities are preserved
- the sync summary reports object counts and no fatal errors
