# Archicad Validation

## Goal

Confirm that approved CCP values are visible and usable inside Archicad after connector write-back.

Use `archicad_live_adapter.md` as the HTTP contract for the Archicad-side bridge before running live adapter validation.

## Steps

1. Open a model with the `CCP_Operational` property group configured.
2. Run `npm run archicad:smoke:mock` to confirm the connector can use the live HTTP adapter contract locally.
3. Run `npm run archicad:probe` to confirm Python can connect to the local Archicad instance.
4. Start the Python bridge with `npm run archicad:bridge`, or start another Archicad-side bridge that implements the live adapter contract.
5. Run `npm run archicad:smoke:live` to verify endpoint contract + inbound integration against the live bridge.
6. Set `CCP_ARCHICAD_ADAPTER=live`, `ARCHICAD_HOST=127.0.0.1`, and `ARCHICAD_PORT=19724` (or another free adapter port).
7. Apply an approved CCP property update through the outbound connector flow, or run `npm run archicad:smoke:live -- --validate-write --target-guid YOUR_ZONE_GUID` for a scripted write check.
   - Add `--expect-write-status synced` to fail fast when outbound does not end in `synced`.
8. Inspect the target object properties in Archicad.
9. Verify schedules can display the updated value.
10. Verify a Graphic Override rule can react to the updated value.

## Expected outcomes

- the written `CCP_*` property matches the approved change
- the property remains schedule-friendly
- Archicad display behavior reacts to the synced value without geometry changes
- failed adapter calls mark the change set as `sync_failed` rather than silently applying partial state
- if the model does not define the target `CCP_Operational` field, outbound sync should fail with a clear adapter error and the change set should remain `sync_failed`
