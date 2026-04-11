# Outbound Sync Test

## Goal

Validate approved package assignments can move from change sets into Archicad-targeted write instructions.

## Setup

- seed runtime state with at least one approved or queued package assignment change set
- confirm the target field is `CCP_PackageID`

## Steps

1. Queue an approved change set in the UI.
2. Run the connector outbound command with `npm run demo:outbound`.
3. Inspect the updated change-set status.
4. Inspect the outbound sync run summary.
5. Inspect the recorded Archicad write payloads in runtime state.

## Expected outcomes

- only queued approved changes are processed
- only allowlisted fields are written
- successful writes mark the change set as `synced`
- failed writes mark the change set as `sync_failed`
