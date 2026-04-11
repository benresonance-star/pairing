# Python Connector Technical Specification

## 1. Purpose

Define the Python connector responsible for synchronizing operational data between Archicad and Supabase for the Construction Control Plane MVP.

The connector is responsible for:

- reading target data from a running Archicad instance
- normalizing that data
- writing it to Supabase
- retrieving approved outbound changes
- applying write-back updates to Archicad properties
- logging sync results

This connector does not manage browser geometry rendering.

---

## 2. Design Principles

1. Reliability over sophistication.
2. Explicit mappings over inference.
3. Batch operations where possible.
4. Safe write-back only after approval.
5. Clear observability and retry behavior.
6. Keep Archicad as geometry authority.
7. Treat secrets, elevated credentials, and write privileges as security-critical concerns from day one.
8. Default to least privilege, explicit allowlists, and dry-run validation where possible.

---

## 3. High-Level Responsibilities

The connector must:

1. connect to a running Archicad session
2. read configured object classes and properties
3. map Archicad data into external records
4. upsert records into Supabase
5. poll for approved outbound changes
6. validate proposed writes
7. apply writeable property changes to Archicad
8. record sync logs and audit metadata

---

## 4. MVP Boundaries

## In scope
- read elements
- read zones
- read selected hotlink instance metadata where accessible
- read CCP property values
- write approved CCP property values
- log results

## Out of scope
- geometry manipulation
- model creation/deletion
- advanced event-driven deep integration
- complex hotlink mutation workflows
- local GUI beyond basic execution/logging

---

## 5. Suggested Module Structure

```text
connector/
  config.py
  main.py
  archicad_client.py
  archicad_reader.py
  archicad_writer.py
  schema_mapper.py
  supabase_client.py
  sync_engine.py
  validators.py
  models.py
  logger.py
  state_store.py
  retry.py
  tests/
```

---

## 6. Module Responsibilities

## 6.1 config.py
Loads:
- Archicad connection settings
- Supabase URL/key
- project mapping
- data source mode
- optional scenario targeting
- enabled object classes
- writable field allowlist
- polling interval
- log level
- runtime mode and secret-source configuration

Security expectations:
- secrets must be loaded from environment variables or secret stores, not committed files
- startup should fail clearly when required live-mode credentials are missing
- dry-run behavior should be easy to enable for validation and incident response

## 6.2 archicad_client.py
Wraps low-level Archicad Python API calls.

Responsibilities:
- connect to running Archicad
- fetch product info / connection status
- execute read commands
- execute write commands

## 6.3 archicad_reader.py
Reads:
- model objects
- zones
- hotlink metadata where accessible
- CCP property values
- selected quantities/classifications

## 6.4 archicad_writer.py
Writes:
- approved CCP properties only
- batch or iterative updates depending on API surface

## 6.5 schema_mapper.py
Maps Archicad payloads into normalized external records.

## 6.6 supabase_client.py
Handles:
- authenticated Supabase requests
- demo file-backed runtime access for local development
- bulk upserts
- queries for pending approved changes
- sync run updates
- audit event creation
- Archicad write history recording
- failed outbound sync error recording on change sets

Security expectations:
- service-role credentials must only be used in trusted backend or connector execution contexts
- browser clients must never receive connector-grade credentials
- requests should remain project-scoped and should not mix data between projects

## 6.7 sync_engine.py
Coordinates inbound and outbound sync workflows.

## 6.8 validators.py
Validates:
- field names
- data types
- allowed enum values
- package existence
- writeability
- stale/missing object conditions
- approval/state preconditions
- project scoping assumptions

## 6.9 models.py
Typed models for internal use, e.g. dataclasses or Pydantic models.

## 6.10 logger.py
Structured logging to stdout/file and optional Supabase sync summaries.

## 6.11 state_store.py
Stores local connector state such as:
- last successful inbound sync time
- last processed change set
- retry markers

## 6.12 retry.py
Shared retry/backoff helpers for transient failures.

---

## 7. Runtime Modes

The connector should support at least these modes:

### 7.0 Data source modes
- `demo`: use the local runtime JSON store for development and validation
- `supabase`: use a real Supabase project through backend credentials

### 7.1 Inbound sync mode
- read Archicad
- push records to Supabase

### 7.2 Outbound sync mode
- fetch approved queued changes
- write them to Archicad
- update sync status

### 7.3 Combined loop mode
- run inbound then outbound on an interval

### 7.4 Dry-run mode
- validate and log what would happen
- do not write to Archicad

### 7.5 Scenario-targeted execution
- when `CCP_SCENARIO_ID` is unset, use the baseline scenario
- when `CCP_SCENARIO_ID` is set, inbound and outbound runs should resolve writes against that scenario scope

---

## 8. Configuration Specification

Suggested environment variables:

- `CCP_DATA_SOURCE`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PROJECT_ID`
- `CCP_SCENARIO_ID`
- `ARCHICAD_HOST`
- `ARCHICAD_PORT`
- `SYNC_INTERVAL_SECONDS`
- `LOG_LEVEL`
- `ENABLE_INBOUND_SYNC`
- `ENABLE_OUTBOUND_SYNC`
- `DRY_RUN`

Optional config file:
- object type allowlist
- property group names
- writable property allowlist
- controlled vocabulary rules

Expected values and notes:
- `CCP_DATA_SOURCE` should accept at least `demo` and `supabase`
- live Supabase mode should require the Supabase URL and service-role key at startup
- demo seed/reset commands are valid only for demo mode; live mode should rely on the bootstrap process outside the connector

Security rules for configuration:
- do not log raw secret values
- keep service-role keys out of source control
- separate demo/local configuration from live credentials
- prefer explicit enable flags for outbound writes

---

## 9. Internal Data Models

## 9.1 ModelObjectRecord

```python
{
  "project_id": "uuid",
  "archicad_guid": "text",
  "object_type": "text",
  "classification": "text | None",
  "storey": "text | None",
  "zone_key": "text | None",
  "hotlink_key": "text | None",
  "name": "text | None",
  "quantity_json": {},
  "archicad_snapshot_json": {}
}
```

## 9.2 OperationalWriteRecord

```python
{
  "object_ref_type": "model_object | zone | hotlink_instance",
  "object_ref_id": "uuid",
  "archicad_guid": "text | None",
  "field_name": "text",
  "new_value": "any",
  "change_set_id": "uuid"
}
```

## 9.3 SyncRunSummary

```python
{
  "direction": "archicad_to_supabase | supabase_to_archicad",
  "status": "running | completed | completed_with_errors | failed",
  "objects_read": 0,
  "objects_written": 0,
  "warnings": [],
  "errors": []
}
```

---

## 10. Inbound Sync Flow

## Step 1
Connect to running Archicad.

## Step 2
Start a `sync_runs` record with:
- direction = `archicad_to_supabase`
- status = `running`

## Step 3
Read:
- target elements
- zones
- hotlink instances where accessible
- selected CCP properties
- selected quantity/classification fields

## Step 4
Map records via `schema_mapper.py`

## Step 5
Bulk upsert:
- model_objects
- zones
- hotlink_instances

## Step 6
Ensure operational state rows exist for the active scenario so the UI and outbound sync can operate on scenario-scoped records even when values originate from the inbound Archicad snapshot.

## Step 7
Complete sync run and write summary

---

## 11. Outbound Sync Flow

## Step 1
Fetch approved change sets that are:
- approved
- queued for sync
- not already synced

## Step 2
For each change set:
- load items
- validate field names and values
- map each item to Archicad target object/property

## Step 3
Start `sync_runs` record with:
- direction = `supabase_to_archicad`
- status = `running`

## Step 4
Attempt property writes to Archicad

## Step 5
For each successful write:
- log success
- record an `archicad_writes` entry, including dry-run metadata when applicable
- record audit event if needed

## Step 6
For each failed write:
- log item error
- accumulate summary
- persist item-level errors back onto the parent change set

## Step 7
Set change set status:
- `synced` if all critical writes succeed
- `sync_failed` if not

## Step 8
Complete sync run summary

---

## 12. Write Safety Rules

The connector must only write allowlisted fields.

Recommended allowlist:
- `CCP_PackageID`
- `CCP_PackageName`
- `CCP_TradeCode`
- `CCP_Workfront`
- `CCP_SequenceGroup`
- `CCP_SequenceOrder`
- `CCP_PlannedStart`
- `CCP_PlannedFinish`
- `CCP_ActualStart`
- `CCP_ActualFinish`
- `CCP_ConstructionState`
- `CCP_CostCode`
- `CCP_Unit`
- `CCP_UnitRate`
- `CCP_QuantityBasis`
- `CCP_BudgetAmount`
- `CCP_SyncStatus`
- `CCP_LastSyncAt`
- `CCP_LastScenarioID`
- `CCP_LastApprovedChangeSet`

The connector must not write anything outside the allowlist.

Additional security requirements:
- the connector must not write any field unless the source change set is approved and eligible for sync
- the connector must fail closed on unknown fields rather than attempting best-effort writes
- live outbound modes should support dry-run validation before enabling actual writes
- connector logs must include enough context for audit, but must not leak secrets or raw credentials
- live writes and dry-run attempts should remain project-scoped and attributable to a specific change set where applicable

---

## 13. Validation Rules

Before any outbound write:

1. target object exists
2. target property exists
3. target property is writable
4. value type is compatible
5. enum values are in allowed list
6. dates are parseable
7. package ID exists in package register where required

If validation fails:
- skip write
- log item-level failure
- mark change set accordingly

---

## 14. Error Handling Strategy

## 14.1 Categories
- connection errors
- authentication errors
- Archicad API command errors
- Supabase request errors
- validation errors
- partial write failures
- stale target object errors

## 14.2 Behavior
- transient errors: retry with backoff
- validation errors: no retry unless source data changes
- partial failures: continue batch, record per-item results
- fatal startup errors: fail fast with clear logs
- authentication or authorization errors: fail fast, alert clearly, and do not continue best-effort writes

---

## 15. Logging Requirements

Use structured logs.

Each log entry should include:
- timestamp
- level
- run_id if applicable
- project_id
- direction
- object_ref if applicable
- message
- error details if applicable

Logs must not include:
- raw secret values
- full authorization headers
- unnecessary sensitive payloads that are not needed for diagnosis

Log categories:
- connector startup
- connection success/failure
- sync run start/end
- object read count
- object write count
- validation failures
- API failures
- retry attempts

---

## 16. State Management

The connector should maintain minimal local state:
- last inbound sync timestamp
- last processed sync run ID
- last processed change set ID
- retry markers if useful

State may be stored in:
- local JSON file
- sqlite
- or entirely in Supabase if preferred

For MVP, a small local state file is acceptable.

Operational note:
- demo mode may seed and reset this runtime state locally
- live Supabase mode should not mutate seed/runtime fixture files and should use a separate bootstrap workflow for database setup

---

## 17. Supabase Integration Notes

Recommended operations:

### Inbound
- bulk upsert project-linked model objects
- bulk upsert zones
- bulk upsert hotlink instances
- create/update sync_runs
- create audit_events as needed

### Outbound
- query approved queued change sets
- query change_set_items
- update change_set status
- write `sync_errors` back onto failed change sets
- insert `archicad_writes` records for successful or dry-run property applications
- create sync_runs
- store run summaries

Use batching where possible.

---

## 18. Pseudocode

## 18.1 Inbound sync

```python
def run_inbound_sync():
    run = create_sync_run(direction="archicad_to_supabase")
    try:
        ac = connect_archicad()
        elements = read_elements(ac)
        zones = read_zones(ac)
        hotlinks = read_hotlinks(ac)

        model_records = map_elements(elements)
        zone_records = map_zones(zones)
        hotlink_records = map_hotlinks(hotlinks)

        upsert_model_objects(model_records)
        upsert_zones(zone_records)
        upsert_hotlinks(hotlink_records)

        complete_sync_run(run, status="completed", summary=...)
    except Exception as e:
        complete_sync_run(run, status="failed", summary={"error": str(e)})
        raise
```

## 18.2 Outbound sync

```python
def run_outbound_sync():
    change_sets = get_approved_queued_change_sets()
    for cs in change_sets:
        run = create_sync_run(direction="supabase_to_archicad")
        errors = []
        writes = []
        try:
            ac = connect_archicad()
            items = get_change_set_items(cs["id"])
            for item in items:
                result = validate_and_prepare_write(item)
                if result.ok:
                    writes.append(result)
                else:
                    errors.append(result.error)

            for write in writes:
                try:
                    apply_property_write(ac, write)
                except Exception as e:
                    errors.append(str(e))

            if errors:
                mark_change_set_failed(cs["id"], errors)
                complete_sync_run(run, status="completed_with_errors", summary={"errors": errors})
            else:
                mark_change_set_synced(cs["id"])
                complete_sync_run(run, status="completed", summary={"writes": len(writes)})
        except Exception as e:
            mark_change_set_failed(cs["id"], [str(e)])
            complete_sync_run(run, status="failed", summary={"error": str(e)})
```

---

## 19. Testing Strategy

## 19.1 Unit tests
- mapping logic
- validators
- payload builders
- status transitions

## 19.2 Integration tests
- Supabase client operations
- change set retrieval
- sync run lifecycle
- authentication and authorization failure handling
- allowlist enforcement and unknown-field rejection
- demo vs live data-source configuration boundaries
- change-set `sync_errors` persistence
- `archicad_writes` recording for dry-run and live outbound flows

## 19.3 Manual Archicad tests
- connect to running Archicad
- read target elements/zones
- write safe CCP properties
- verify properties visible in Archicad
- verify schedules/graphic overrides respond correctly

---

## 20. MVP Acceptance Criteria

The connector is successful if it can:

1. connect to a running Archicad session
2. read a defined set of elements and zones
3. map those records into the Supabase schema
4. bulk upsert records without duplicate identity drift
5. fetch approved queued change sets
6. validate and write approved CCP fields back to Archicad
7. update sync and change-set status correctly
8. produce useful logs for failures and successes
9. reject non-allowlisted or unauthorized write attempts safely
10. record Archicad write attempts and failed-item sync errors in the backing store
11. keep live credentials and secret material out of logs and source-controlled config

---

## 21. Security-by-Stage Requirements

### Early stages
- connector scaffolding must include explicit config boundaries for live vs demo modes
- validators must be added before outbound write scope expands

### Inbound stages
- inbound sync must remain project-scoped
- imported payloads should be normalized and filtered before persistence

### Outbound stages
- every outbound field expansion must update allowlists, validators, and tests together
- approval-state validation must be treated as mandatory, not optional business logic

### Hardening stages
- add stronger credential loading, rotation guidance, and failure-mode tests before production rollout

---

## 21. Future Extension Notes

Future versions may add:
- event-driven sync instead of polling
- custom Archicad palette integration through C++ Add-On
- richer hotlink support
- saved-view automation triggers
- batch publisher actions
- stronger local state store
- health endpoints / service wrapper
