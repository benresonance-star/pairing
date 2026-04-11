# Archicad Property and Mapping Specification

## 1. Purpose

Define the Archicad-side property model, object mapping rules, and synchronization conventions for the Construction Control Plane MVP.

This specification assumes:

- Archicad remains the sole geometry environment
- an external UI manages operational metadata
- Supabase stores scenario, approval, and audit state
- a Python connector reads from and writes to Archicad

---

## 2. Design Principles

1. Geometry stays in Archicad.
2. Operational data must be attachable to Archicad objects through stable properties.
3. The property schema must be simple, explicit, and stable from day one.
4. Mapping rules must distinguish between:
   - native elements
   - zones
   - hotlink instances
5. Not every field applies to every object type.
6. All write-back fields must be validation-safe.
7. Archicad properties used for this MVP must remain operational and traceable, not a place for secrets or privileged system data.
8. Security and safety checks must be introduced as property write scope expands, not postponed until final rollout.

---

## 3. Supported Archicad Object Classes for MVP

## 3.1 Primary classes
- elements
- zones
- selected hotlink instances

## 3.2 Typical element examples
- walls
- slabs
- roofs
- beams
- columns
- morphs
- objects
- doors
- windows
- curtain wall components where practical
- meshes only if needed

## 3.3 Special handling classes
- zones
- hotlink instances
- grouped objects only via member objects or mapped grouping logic
- classifications and properties as metadata overlays, not object classes

---

## 4. Stable Identity Strategy

Every synced object must have a stable identity.

## 4.1 Primary identity
- `archicad_guid`

## 4.2 Secondary identity helpers
- object type
- element ID if relevant
- zone number / zone name for display only
- hotlink identifier where available

## 4.3 Identity rule
The connector must treat Archicad GUID as the primary immutable identity key for model-linked records.

---

## 5. Property Group Strategy

Create a dedicated property group in Archicad.

Recommended group name:

- `CCP_Operational`

This isolates operational metadata from broader BIM properties and makes schedules/overrides easier to configure.

Security implications:
- only approved operational metadata should be written into this group
- credentials, tokens, user secrets, or backend-only identifiers must never be stored as Archicad properties
- the dedicated group reduces the risk of writing into unrelated BIM property sets

---

## 6. Property Schema

## 6.1 Identity fields

### `CCP_ObjectGUID`
- Type: string
- Purpose: explicit sync identity mirror
- Applies to: elements, zones, hotlink instances
- Notes: usually mirrors Archicad GUID for visibility and schedules

### `CCP_ZoneKey`
- Type: string
- Purpose: normalized location/zone reference
- Applies to: zones, zone-related elements where appropriate

### `CCP_HotlinkKey`
- Type: string
- Purpose: normalized hotlink instance reference
- Applies to: hotlink instances or objects mapped to hotlinks

---

## 6.2 Packaging fields

### `CCP_PackageID`
- Type: string
- Purpose: stable package identifier
- Example: `PKG-FACADE-01`

### `CCP_PackageName`
- Type: string
- Purpose: readable package name
- Example: `Facade East Install`

### `CCP_TradeCode`
- Type: string
- Purpose: trade/category identifier
- Example: `facade`, `structure`, `fitout`

### `CCP_Workfront`
- Type: string
- Purpose: operational workfront grouping
- Example: `Tower A East`, `L08 South`, `Core 01`

---

## 6.3 Sequencing fields

### `CCP_SequenceGroup`
- Type: string
- Purpose: broader sequence bucket
- Example: `structure`, `facade_wave_2`, `fitout_batch_b`

### `CCP_SequenceOrder`
- Type: integer or string if integer unsupported
- Purpose: order within sequence
- Example: `10`, `20`, `30`

### `CCP_PlannedStart`
- Type: date
- Purpose: planned start date

### `CCP_PlannedFinish`
- Type: date
- Purpose: planned finish date

### `CCP_ActualStart`
- Type: date
- Purpose: actual start date

### `CCP_ActualFinish`
- Type: date
- Purpose: actual finish date

### `CCP_ConstructionState`
- Type: enum/string
- Purpose: current state marker
- Suggested values:
  - `not_started`
  - `ready`
  - `in_progress`
  - `blocked`
  - `complete`

---

## 6.4 Cost fields

### `CCP_CostCode`
- Type: string
- Purpose: cost classification identifier

### `CCP_Unit`
- Type: string
- Purpose: cost unit basis
- Suggested values:
  - `m2`
  - `m3`
  - `lm`
  - `count`
  - `item`
  - `manual`

### `CCP_UnitRate`
- Type: number
- Purpose: unit rate

### `CCP_QuantityBasis`
- Type: number or string depending on property limitations
- Purpose: quantity used for cost multiplication

### `CCP_BudgetAmount`
- Type: number
- Purpose: total budget amount for object or zone

---

## 6.5 Sync and control fields

### `CCP_SyncStatus`
- Type: string
- Purpose: latest sync result marker
- Suggested values:
  - `unsynced`
  - `synced`
  - `sync_failed`
  - `pending`

### `CCP_LastSyncAt`
- Type: string/date-time
- Purpose: last successful sync timestamp

### `CCP_LastScenarioID`
- Type: string
- Purpose: last scenario written into Archicad

### `CCP_LastApprovedChangeSet`
- Type: string
- Purpose: traceability to external approval object

---

## 7. Applicability Matrix

| Field | Elements | Zones | Hotlink Instances |
|---|---:|---:|---:|
| CCP_ObjectGUID | Yes | Yes | Yes |
| CCP_ZoneKey | Optional | Yes | Optional |
| CCP_HotlinkKey | Optional | Optional | Yes |
| CCP_PackageID | Yes | Yes | Yes |
| CCP_PackageName | Yes | Yes | Yes |
| CCP_TradeCode | Yes | Yes | Yes |
| CCP_Workfront | Yes | Yes | Yes |
| CCP_SequenceGroup | Yes | Yes | Yes |
| CCP_SequenceOrder | Yes | Yes | Yes |
| CCP_PlannedStart | Yes | Yes | Yes |
| CCP_PlannedFinish | Yes | Yes | Yes |
| CCP_ActualStart | Yes | Yes | Yes |
| CCP_ActualFinish | Yes | Yes | Yes |
| CCP_ConstructionState | Yes | Yes | Yes |
| CCP_CostCode | Yes | Yes | Yes |
| CCP_Unit | Yes | Yes | Yes |
| CCP_UnitRate | Yes | Yes | Yes |
| CCP_QuantityBasis | Yes | Yes | Optional |
| CCP_BudgetAmount | Yes | Yes | Yes |
| CCP_SyncStatus | Yes | Yes | Yes |
| CCP_LastSyncAt | Yes | Yes | Yes |
| CCP_LastScenarioID | Yes | Yes | Yes |
| CCP_LastApprovedChangeSet | Yes | Yes | Yes |

---

## 8. Mapping Rules

## 8.1 Element mapping
Each synced element record should include:
- Archicad GUID
- object type
- classification
- storey
- zone association if derivable
- hotlink association if derivable
- selected quantity data
- CCP operational properties

## 8.2 Zone mapping
Each zone record should include:
- Archicad GUID
- zone name
- zone number if used
- storey
- area
- CCP properties
- normalized `zone_key`

Recommended normalized key:
- `STOREY:ZONE_NUMBER`
- or another stable convention defined once per project

## 8.3 Hotlink mapping
For MVP:
- read accessible hotlink identity/metadata
- assign normalized `hotlink_key`
- allow package/sequence/cost assignment at instance level where practical

Do not make MVP success depend on advanced hotlink mutation.

---

## 9. Normalized Key Rules

## 9.1 Zone key
A `zone_key` should be:
- human-readable
- stable
- unique within project
- not dependent on UI labels alone

Suggested pattern:
- `L08:APT-0803`
- `PODIUM:RETAIL-01`
- `GF:LOBBY`

## 9.2 Workfront
A `workfront` is a user-facing operational grouping.
Suggested examples:
- `Tower A East`
- `Core North`
- `L12 Fitout Batch B`

## 9.3 Package ID
A package ID must be stable and portable across scenarios.
Suggested pattern:
- `PKG-STR-01`
- `PKG-FIT-L08`
- `PKG-HL-BATHROOM-POD`

---

## 10. Archicad Read Scope

The connector must read:

- GUID
- type
- selected built-in identifiers
- classification(s)
- storey
- selected quantities if available
- CCP properties
- zone data
- hotlink metadata where accessible

The connector should not attempt full geometry extraction for this MVP.

---

## 11. Archicad Write Scope

The connector may write:

- CCP package fields
- CCP sequence fields
- CCP cost fields
- CCP sync fields

The connector should not write:
- geometry changes
- element deletion
- element creation
- non-approved arbitrary BIM property changes

Security and safety rules:
- do not write secrets, credentials, or privileged backend-only identifiers into Archicad
- do not expand write scope without updating the allowlist, validation rules, and tests
- all writes must remain traceable to approved external change-control records

---

## 12. Graphic Override Strategy

The property schema must support Archicad Graphic Overrides such as:

### Example rule groups
- color by package
- color by trade
- color by construction state
- color by scenario marker
- dim objects with missing package assignment

### Required property qualities
- explicit string values
- limited controlled vocabularies where possible
- no overloaded mixed meanings

---

## 13. Schedule Strategy

Archicad schedules should be able to report:

- object GUID
- package ID
- package name
- trade code
- sequence group/order
- planned dates
- actual dates
- construction state
- cost code
- unit
- rate
- budget amount

This means field naming must remain clear and schedule-friendly.

## 13.1 Linear scheduling relationship
The external control-plane UI may also use these properties to build a read-only linear scheduling view.

The first linear scheduling milestone should treat Archicad-derived fields as metadata inputs, especially:
- `CCP_PackageID`
- `CCP_Workfront`
- `CCP_SequenceGroup`
- `CCP_SequenceOrder`
- `CCP_PlannedStart`
- `CCP_PlannedFinish`
- `CCP_ActualStart`
- `CCP_ActualFinish`
- `CCP_ConstructionState`

These fields support sequencing and chart overlays, but they do not define a full time-location axis by themselves.

## 13.2 Location-axis note
The first web-based linear scheduling view should not depend on full geometry extraction.

Instead, the location axis may be defined externally using project-scoped metadata such as:
- stationing
- storey sequences
- named segments
- workfront-aligned location groupings

The Archicad model contributes identity and operational metadata, while the explicit location axis is managed in the external system.

## 13.3 Read-only first milestone
The first milestone should focus on a read-only visualization that communicates:
- time
- ordered location
- activity type
- baseline/planned/actual layers
- key milestones

Editing, drag-and-drop schedule authoring, and production-rate automation are out of scope for the first release.

---

## 14. Validation Rules

Before writing to Archicad, validate:

- package ID exists in external package register
- sequence order is valid
- dates are parseable
- construction state is in allowed value set
- cost fields are numeric where required
- target object still exists
- target property exists and is writable
- source change is approved and eligible for sync
- write target belongs to the expected project/model scope

Fail-closed behavior:
- unknown fields must be rejected
- missing approval context must block write-back
- stale or ambiguous identity matches must block write-back until reviewed

---

## 15. Missing Data Rules

If an object lacks required fields:

- do not silently invent data
- mark as missing in Supabase
- expose in UI as a data-quality issue
- optionally set `CCP_SyncStatus = pending` or equivalent

Missing approval, identity, or authorization context should also be treated as a blocking data-quality issue.

---

## 16. Recommended Controlled Vocabularies

## 16.1 Construction state
- `not_started`
- `ready`
- `in_progress`
- `blocked`
- `complete`

## 16.2 Cost unit
- `m2`
- `m3`
- `lm`
- `count`
- `item`
- `manual`

## 16.3 Sync status
- `unsynced`
- `pending`
- `synced`
- `sync_failed`

---

## 17. Example Object Mapping

## 17.1 Zone example

```json
{
  "archicad_guid": "ZONE-123",
  "object_type": "zone",
  "storey": "L08",
  "zone_key": "L08:APT-0803",
  "ccp_operational": {
    "package_id": "PKG-FIT-L08",
    "package_name": "Level 08 Fitout",
    "trade_code": "fitout",
    "workfront": "Tower A L08",
    "sequence_group": "fitout_batch_b",
    "sequence_order": 80,
    "planned_start": "2026-05-01",
    "planned_finish": "2026-05-14",
    "actual_start": null,
    "actual_finish": null,
    "construction_state": "ready",
    "cost_code": "FIT-APT",
    "unit": "m2",
    "unit_rate": 850.0,
    "quantity_basis": 68.0,
    "budget_amount": 57800.0
  }
}
```

## 17.2 Element example

```json
{
  "archicad_guid": "WALL-456",
  "object_type": "wall",
  "storey": "L08",
  "zone_key": "L08:APT-0803",
  "ccp_operational": {
    "package_id": "PKG-FACADE-02",
    "trade_code": "facade",
    "sequence_group": "facade_wave_2",
    "sequence_order": 120,
    "construction_state": "in_progress"
  }
}
```

---

## 18. Acceptance Criteria

This spec is implemented successfully when:

1. The Archicad property group exists and is consistently named.
2. Target objects can be read with stable identity.
3. Approved values can be written back into Archicad properties.
4. Archicad schedules can display CCP fields.
5. Graphic Overrides can visibly react to CCP fields.
6. Zones, elements, and selected hotlink instances can be mapped into external records without identity ambiguity.
7. No non-operational secret or privileged backend data is written into Archicad properties.
8. Expanded write scopes require matching validation and traceability updates.

---

## 19. Security-by-Stage Requirements

### Early stages
- keep the Archicad property group narrow and operational-only
- prove stable identity and traceability before broadening write scope

### First write-back stages
- start with the smallest safe field subset
- confirm approval and allowlist controls before adding more fields

### Later expansion stages
- every new Archicad-written field must update mapping docs, validation rules, and manual validation runbooks together

---

## 19. Future Extension Notes

Future C++ Add-On work may extend:
- stronger hotlink manipulation
- event-based triggers
- custom Archicad palettes
- richer validation feedback in Archicad UI
- tighter saved-view automation
