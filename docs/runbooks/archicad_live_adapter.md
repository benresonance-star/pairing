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
ARCHICAD_PORT=19723
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
  "connection": "127.0.0.1:19723"
}
```

Validation rules:

- response must be a JSON object
- `product_name` must be a string
- `connection` must be a string if present
- when `connection` is omitted, the connector uses `{ARCHICAD_HOST}:{ARCHICAD_PORT}`

### `GET /api/v1/snapshot`

Use this for inbound sync. The response shape must match the normalized sample snapshot contract used by `shared/examples/sample_archicad_snapshot.json`.

Expected response:

```json
{
  "zones": [
    {
      "archicad_guid": "ZONE-TH-01",
      "zone_key": "TH-01",
      "zone_name": "Townhouse 01",
      "storey": "GF-FF",
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

For manual live validation:

1. Start the Archicad-side bridge on `ARCHICAD_HOST:ARCHICAD_PORT`.
2. Set `CCP_ARCHICAD_ADAPTER=live`.
3. Run inbound sync and confirm `GET /api/v1/snapshot` is called.
4. Queue an approved change set.
5. Run outbound without `--dry-run` only when the target model is disposable or backed up.
6. Confirm the Archicad property changed and the change set moved to `synced`.
