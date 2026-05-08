# Archicad Property Ingestion First Test

## Goal

Prove that live Archicad property values can be read through the bridge and ingested into app-visible operational state.

This first test is intentionally narrow:

- one known Zone
- inbound only (no write-back required)
- two operational fields: `package_id`, `construction_state`

## Preconditions

1. Archicad is open with a model containing at least one Zone.
2. The Zone has `CCP_Operational` properties configured (`CCP_PackageID`, `CCP_ConstructionState`).
3. Local companion can start and connect.

## Command

Run the first ingestion test:

```powershell
npm run archicad:test:ingestion:first -- --target-guid YOUR_ZONE_GUID
```

If your model is still missing CCP values and you want to validate only mapping/plumbing, allow empty values:

```powershell
npm run archicad:test:ingestion:first -- --target-guid YOUR_ZONE_GUID --allow-empty-values
```

## What the test does

1. Verifies live adapter endpoints (`product-info`, `snapshot`).
2. Runs connector `reset-runtime` then `inbound` in live mode.
3. Reads the target Zone's `ccp_operational` values from live snapshot.
4. Verifies runtime `operational_state` for the corresponding zone row matches:
   - `package_id`
   - `construction_state`

## Success criteria

- command exits with code `0`
- output includes:
  - `"status": "passed"`
  - `"ingestion_validation": { "status": "passed", ... }`
  - matching expected/actual values for `package_id` and `construction_state`

## UI verification

After a passing run:

1. Open `Objects` page in the web app.
2. Locate the target zone.
3. Confirm `Current Package` and `Construction State` reflect ingested values.
