# Archicad Live Adapter Contract

## Purpose

This runbook defines the HTTP contract expected by the connector when `CCP_ARCHICAD_ADAPTER=live`.

The live adapter is intentionally narrow. It lets an Archicad-side bridge expose a small, testable API while preserving the CCP boundary:

- Archicad remains the geometry and BIM authoring authority.
- Supabase remains the operational state and approval authority.
- The connector is the only component that can call the live Archicad adapter.
- Dry-run outbound sync must not call the write endpoint.

## Environment

Set these variables for live adapter mode:

```powershell
CCP_ARCHICAD_ADAPTER=live
ARCHICAD_HOST=127.0.0.1
ARCHICAD_PORT=19724
```

The connector builds the base URL as:

```text
http://{ARCHICAD_HOST}:{ARCHICAD_PORT}/api/v1/
```

Live Supabase mode is configured separately with `CCP_DATA_SOURCE=supabase`, `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PROJECT_ID`.

## Endpoints

### `GET /api/v1/product-info`

Use this as a health and identity check for the Archicad-side bridge.

Expected response:

```json
{
  "product_name": "Archicad 28",
  "connection": "build 6100 AUS"
}
```

Validation rules:

- response must be a JSON object
- `product_name` must be a string
- `connection` must be a string if present
- when `connection` is omitted, the connector uses `{ARCHICAD_HOST}:{ARCHICAD_PORT}`

### `GET /api/v1/snapshot`

Backward-compatible snapshot with **default filter** (all layers, all element types in the bridge build, zones included). Prefer `POST /api/v1/snapshot` for inbound so the connector can send the same filter as the Live Link UI. The connector no longer uses `GET` for live reads.

### `POST /api/v1/snapshot`

Primary path for inbound sync. Request body is the **snapshot filter** object (may be `{}` for defaults).

Filter fields:

- `layers` (array of strings): when **empty**, all layers match; when non-empty, only elements/zones whose `layer` field is in this list are returned.
- `element_types` (array of strings): subset of `firstSliceElementTypes` in [`shared/contracts/enums/vocabularies.json`](../../shared/contracts/enums/vocabularies.json) (e.g. `wall`, `slab`, `roof`, …). When **empty** or omitted, all configured types are queried.
- `include_zones` (boolean, default `true`): when `false`, the `zones` array is empty.

Response extends the sample snapshot contract with optional diagnostics:

- `snapshot_rows` — capped list of `{ kind, type, element_id, archicad_guid, layer, storey, ifc_type }` for UI tables
- `counts_by_type` — counts including `zone` plus each `object_type`
- `snapshot_rows_truncated` — boolean when row cap is hit

`zones` and `elements` remain the canonical arrays the connector ingests.

### `GET /api/v1/snapshot/layers`

Returns `{ "layers": ["Layer A", ...] }` for filter UI. Prefer the attribute API; the bridge may fall back to scanning element layer properties when needed.

### Connector environment: `ARCHICAD_SNAPSHOT_FILTER`

When set to a JSON string of the filter object, the connector’s live client issues `POST /api/v1/snapshot` with that body so **inbound matches the desktop companion filter**. The desktop companion sets this variable when launching `connector_cli.py`.

### Snapshot payload (zones and elements)

Use this for inbound sync. The response shape must match the normalized sample snapshot contract used by `shared/examples/sample_archicad_snapshot.json`, with optional `layer`, `storey`, and `ifc_type` fields on items when the bridge can resolve Graphisoft built-in properties.

Expected response (conceptual):

```json
{
  "zones": [
    {
      "archicad_guid": "ZONE-TH-01",
      "zone_key": "TH-01",
      "zone_name": "Townhouse 01",
      "storey": "GF-FF",
      "layer": "A-Zone",
      "ccp_operational": {
        "package_id": "PKG-INTERIORS",
        "construction_state": "in_progress"
      }
    }
  ],
  "elements": [
    {
      "archicad_guid": "WALL-001",
      "object_type": "wall",
      "name": "Party wall",
      "zone_key": "TH-01",
      "layer": "A-Wall",
      "ccp_operational": {
        "package_id": "PKG-STRUCTURE",
        "construction_state": "ready"
      }
    }
  ]
}
```

Validation rules:

- response must be a JSON object
- `zones` must be an array
- `elements` must be an array
- connector-side filtering still applies to `elements` through the shared first-slice element type allowlist

### `POST /api/v1/properties`

Use this for approved outbound property write-back. The connector calls this endpoint only when outbound sync is not running in dry-run mode.

Request body:

```json
{
  "archicad_guid": "ZONE-TH-01",
  "field_name": "CCP_ConstructionState",
  "field_value": "blocked"
}
```

Expected response:

```json
{
  "status": "ok"
}
```

The connector currently treats any non-error JSON response as success.

## Failure Behavior

The connector fails closed for live adapter errors:

- non-2xx responses raise an adapter error
- unavailable endpoints raise an adapter error
- malformed `product-info` and `snapshot` payloads raise an adapter error
- outbound write failures leave the change set in `sync_failed` with the error recorded
- dry-run outbound sync records the intended write in Supabase but does not call `POST /api/v1/properties`

The connector must not log secrets. The live Archicad adapter contract currently does not include authentication headers; add authentication as a separate change if the bridge requires it.

## Validation

Run connector tests after changing this contract:

```powershell
npm run connector:test
```

Run the governed Supabase smoke check after changing outbound behavior:

```powershell
npm run supabase:smoke:governed
```

## Mock adapter rehearsal

Before connecting to a real Archicad bridge, run the connector against the local mock adapter:

```powershell
npm run archicad:smoke:mock
```

This command:

- starts `scripts/dev/mock_archicad_adapter.py` on `127.0.0.1:19724`
- serves `shared/examples/sample_archicad_snapshot.json` through `GET /api/v1/snapshot` and `POST /api/v1/snapshot`
- resets the demo runtime state
- runs connector inbound with `CCP_ARCHICAD_ADAPTER=live`
- queues a construction-state change against the inbound target zone
- runs connector outbound without `--dry-run`
- verifies that the mock adapter received `POST /api/v1/properties`
- verifies that the connector recorded the write and marked the change set `synced`

To inspect the mock server manually, run:

```powershell
npm run archicad:mock
```

The mock server records property writes at `shared/examples/runtime/mock_archicad_writes.json`.

## True Archicad bridge handoff

After the mock smoke check passes, replace the mock server internals with calls into the Archicad-side integration while preserving the same HTTP contract.

First confirm that Python can connect to the local Archicad instance:

```powershell
pip install archicad
npm run archicad:probe
```

The probe:

- imports Graphisoft's `archicad` Python package
- calls `ACConnection.connect()`
- attempts basic product info and element count commands
- prints setup guidance when the package is missing or Archicad is not reachable

Then start the first read-only Python bridge:

```powershell
npm run archicad:bridge
```

By default, both `npm run archicad:mock` and `npm run archicad:bridge` use port `19724`. This avoids collisions with local Archicad services that can already occupy `19723`.

The bridge implements the live adapter HTTP contract against the currently open Archicad instance:

- `GET /api/v1/product-info` returns Archicad version/build information
- `GET /api/v1/snapshot` and `POST /api/v1/snapshot` return zones and configured element types (walls, slabs, roofs, openings, columns, beams, library parts) into the connector snapshot shape
- `POST /api/v1/properties` attempts allowlisted `CCP_Operational` property writes

The current bridge can read built-in Archicad identity/name/zone/area properties. CCP operational values are included only when the active model already contains the `CCP_Operational` properties. If those properties are missing, snapshot extraction still works but write-back returns a clear error.

The first true-connection milestone should use a disposable or backed-up model and prove only:

1. `GET /api/v1/product-info` returns the running Archicad bridge identity.
2. `POST /api/v1/snapshot` (or `GET` for a quick check) returns zones and filtered element types in the documented shape.
3. `POST /api/v1/properties` writes one approved `CCP_*` property to one known target.
4. Connector outbound marks the change set `synced` only after the Archicad-side write succeeds.

Do not expand the bridge to geometry editing, dependency management, or broad property writes in this milestone.

For manual live validation:

1. Start the Archicad-side bridge on `ARCHICAD_HOST:ARCHICAD_PORT`.
2. Set `CCP_ARCHICAD_ADAPTER=live`.
3. Run inbound sync and confirm `POST /api/v1/snapshot` is used (with `ARCHICAD_SNAPSHOT_FILTER` when driven from the companion).
4. Queue an approved change set.
5. Run outbound without `--dry-run` only when the target model is disposable or backed up.
6. Confirm the Archicad property changed and the change set moved to `synced`.

## Web app live-link controls

To let users launch and control the local Archicad connection from the web app:

1. Start the local desktop companion:

```powershell
npm run archicad:companion
```

2. Open the web app and use the `Integrations` tab (`/integrations/archicad`) to:
   - connect/disconnect the managed bridge process
   - inspect bridge health and snapshot summary
   - run inbound/outbound connector commands

The companion binds to `127.0.0.1` and can require `ARCHICAD_COMPANION_TOKEN` through the `x-companion-token` header. Configure the web app with `ARCHICAD_COMPANION_URL` and matching token when enabled.

For quick contract and inbound verification without an outbound write:

```powershell
npm run archicad:smoke:live
```

For an optional write validation against a known disposable target zone:

```powershell
npm run archicad:smoke:live -- --validate-write --target-guid YOUR_ZONE_GUID
```

The write validation reports the resulting change set status (`synced` or `sync_failed`) and any adapter error returned by `POST /api/v1/properties`.

To enforce an expected outbound result in CI or scripted checks, add `--expect-write-status`:

```powershell
npm run archicad:smoke:live -- --validate-write --target-guid YOUR_ZONE_GUID --expect-write-status synced
```
