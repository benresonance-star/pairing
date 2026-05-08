# Archicad Validation

## Goal

Confirm that approved CCP values are visible and usable inside Archicad after connector write-back.

Use `archicad_live_adapter.md` as the HTTP contract for the Archicad-side bridge before running live adapter validation.

## Steps

1. Open a model with the `CCP_Operational` property group configured.
2. Run `npm run archicad:smoke:mock` to confirm the connector can use the live HTTP adapter contract locally.
3. Run `npm run archicad:probe` to confirm Python can connect to the local Archicad instance.
4. Start the Archicad-side bridge that implements the live adapter contract.
5. Set `CCP_ARCHICAD_ADAPTER=live`, `ARCHICAD_HOST`, and `ARCHICAD_PORT`.
6. Apply an approved CCP property update through the outbound connector flow.
7. Inspect the target object properties in Archicad.
8. Verify schedules can display the updated value.
9. Verify a Graphic Override rule can react to the updated value.

## Expected outcomes

- the written `CCP_*` property matches the approved change
- the property remains schedule-friendly
- Archicad display behavior reacts to the synced value without geometry changes
- failed adapter calls mark the change set as `sync_failed` rather than silently applying partial state
