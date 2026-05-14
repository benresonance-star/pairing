# BuildSync Assembly Wrapper — Archicad C++ Add-on + Python Sync Listener

**Document type:** `spec.md`  
**Version:** `0.3`  
**Status:** First-build implementation specification with staged MCP developer/AI tooling guidance and coding-agent operating instructions  
**Primary goal:** Create a native Archicad add-on that binds ordinary Archicad elements into persistent, schedulable, editable semantic assemblies.  
**Secondary goal:** Provide a narrow sync interface to a Python listener for backend/web app scheduling integration.  
**Tertiary goal:** Prepare a future MCP-based agent interface for developer tooling and safe AI-assisted assembly operations, without making MCP the core runtime transport in v0.1.  
**Agent goal:** Give Codex/Cursor-style coding agents clear implementation boundaries, sequencing, and constraints.

---

## 1. Executive Summary

The BuildSync Assembly Wrapper is a native Archicad C++ add-on that allows a user to select normal Archicad elements — walls, slabs, objects, morphs, beams, columns, columns, roofs, meshes, etc. — and bind them into a higher-level **Assembly**.

Example:

```text
Assembly: JN-014 Kitchen Island
Members:
- Wall element: carcass side panel
- Slab element: benchtop
- Slab element: plinth
- Object element: sink
- Object element: tap
```

The assembly should behave like a meaningful construction object while preserving the editability of the underlying Archicad elements.

The assembly is **not** intended to replace Archicad’s element system.

Instead:

```text
Archicad Elements
    ↓
BuildSync Assembly Wrapper
    ↓
Scheduler / Cost / Procurement / QA / 4D Viewer
```

The wrapper is the semantic layer between BIM geometry and construction operations.

---

## 2. Why This Matters

Most BIM models are geometry-rich but meaning-poor.

A project may contain:

```text
Wall_19383
Slab_49210
Object_02831
Morph_91203
```

But the construction team thinks in terms of:

```text
Kitchen Island
Bathroom Pod
Façade Bay
Riser Module
Apartment Fitout Package
Roof Plant Zone
```

The assembly wrapper turns loose model elements into durable construction entities.

This enables:

- scheduling by meaningful assemblies,
- sequencing by installable units,
- cost allocation,
- procurement grouping,
- QA tracking,
- defect tracking,
- progress reporting,
- future 4D visualisation,
- AI reasoning over construction entities.

The sequencer should not merely link schedule tasks to random GUIDs. It should link schedule tasks to meaningful assemblies.

---

## 3. First-Build Scope

This specification describes a **focused v0.1 build**.

The first version should prove the assembly wrapper concept. It should not attempt to become a full SketchUp component system, full Revit-style family system, full construction scheduler, or full BIM-authoring platform.

### 3.1 Included in v0.1

| Feature | Included |
|---|---:|
| Create assembly from selected Archicad elements | Yes |
| Auto-generate assembly ID | Yes |
| Allow user to enter assembly name/type | Yes |
| Stamp assembly properties onto member elements | Yes |
| Store assembly membership locally | Yes |
| Select/highlight all members of an assembly | Yes |
| Manage wrappers in a native Archicad palette | Yes |
| Inspect wrapper members in a native list | Yes |
| Sort wrapper member list by type, element ID, and layer | Yes |
| Select one wrapper member from the palette | Yes |
| Add selected elements to an existing assembly | Yes |
| Remove selected elements from an assembly | Yes |
| Validate missing/deleted members | Yes |
| Detect orphaned elements with assembly properties but no registry record | Yes |
| Send sync events to local Python listener | Yes |
| Queue sync events if Python listener is offline | Yes |
| Provide basic BuildSync menu commands | Yes |
| Provide a minimal Python FastAPI listener | Yes |
| Reserve architecture for MCP developer/agent tooling | Yes, design only |
| Provide coding-agent implementation instructions | Yes |

### 3.2 Explicitly Excluded from v0.1

| Feature | Reason |
|---|---|
| Full SketchUp-style component definitions | Too much for first build |
| Automatic mirror recognition | Requires geometric lineage detection |
| Auto-update all copied instances | Requires definition/instance architecture |
| Native scheduler UI inside Archicad | Web app owns scheduling |
| Smooth 4D timeline playback | External viewer/web layer later |
| Complex geometric drift detection | Later validation phase |
| Locking or ghosting unrelated elements | Optional later UX improvement |
| Full nested assembly editing | Data model only in v0.1 |
| Procurement, costing, and QA modules | Downstream consumers, not core v0.1 |
| MCP as primary runtime transport | Local HTTP/FastAPI is simpler and better scoped first |
| AI agent directly modifying model without constrained tools | Too risky; use explicit tool contracts later |

---

## 4. Key Product Principles

### 4.1 Preserve Archicad Editability

The assembly wrapper must not flatten editable walls/slabs/objects into a dead object unless the user explicitly chooses an export/freeze operation later.

The underlying Archicad elements remain editable.

Correct behaviour:

```text
User creates Kitchen Island Assembly from walls/slabs.
User later edits the slab benchtop thickness.
Assembly still exists.
Assembly version increments after Save Assembly.
Scheduler still sees the Kitchen Island as one entity.
```

Incorrect behaviour:

```text
User creates Kitchen Island Assembly.
Elements are converted into an opaque static object.
User can no longer edit walls/slabs normally.
```

### 4.2 Assembly Is a Semantic Wrapper

The assembly should function as a higher-level object, but technically it is a wrapper over normal elements.

```text
Assembly = metadata + membership + validation + sync
```

Not:

```text
Assembly = new geometric modelling engine
```

### 4.3 Local-First Behaviour

The add-on must remain useful without a backend connection.

If the Python listener is offline:

- user can still create assemblies,
- properties are still written,
- local registry is still updated,
- sync events are queued,
- user receives a non-blocking warning.

The add-on must not crash or block core workflows because sync is unavailable.

### 4.4 MCP Is an Agent Interface, Not the v0.1 Runtime Backbone

Model Context Protocol, or MCP, may be valuable for two later purposes:

1. **developer tooling** — allowing Codex/Cursor or another coding agent to call project-specific tools such as build, test, inspect compiler errors, search local SDK examples, and compare code against this specification;
2. **safe AI-assisted BIM operations** — allowing an AI agent to call constrained BuildSync tools such as list assemblies, validate assemblies, select an assembly, or generate a repair report.

However, MCP should **not** replace the first-build runtime bridge.

For v0.1, keep the runtime simple:

```text
Archicad C++ Add-on
    ↓ local HTTP JSON
Python FastAPI Listener
    ↓
Backend / Web Scheduler
```

MCP should be added as a controlled agent-facing interface after the assembly wrapper and Python sync path are stable.

### 4.5 Explicit Behaviour Beats Hidden Magic

For v0.1, prefer visible commands such as:

```text
Validate Assembly
Sync with Python Listener
Add Selection to Assembly
Remove Selection from Assembly
```

Do not over-automate copy/mirror repair, lineage detection, or bulk edits in the first build.

This keeps the system predictable and easier to debug.

---

## 5. Terminology

### Assembly

A semantic construction entity made from one or more Archicad elements.

Example:

```text
JN-014 Kitchen Island
```

### Assembly Member

An Archicad element that belongs to an assembly.

Example:

```text
Slab GUID 7C92... belongs to JN-014 as role "Benchtop"
```

### Assembly Registry

The local authoritative record of assemblies and their members inside the Archicad project/add-on storage.

### AssemblyID

Human-readable ID.

Example:

```text
JN-014
KIT-002
FCD-103
```

### AssemblyUUID

Stable internal ID that should never change.

Example:

```text
9fa58df4-2ad7-40fd-88c2-c739399f21cc
```

### Python Listener

A local service, probably FastAPI, running on `localhost`, responsible for receiving assembly events and syncing them to the backend/web app.

### MCP Server

A local or project-specific tool server exposing safe commands and context to AI agents.

In this project, MCP is a later-layer interface that may expose:

```text
build_addon
run_tests
read_spec
search_sdk_examples
list_assemblies
validate_assemblies
select_assembly
generate_validation_report
```

MCP should not be used as the first-build replacement for the Python listener.

---

## 6. Target User Experience

### 6.1 Create Assembly

User selects elements in Archicad:

```text
- 2 walls
- 3 slabs
- 1 object
```

User chooses:

```text
BuildSync → Create Assembly from Selection
```

Dialog appears:

```text
Assembly Type: Joinery
Assembly Name: Kitchen Island
Zone: Apartment 204
Level: L02
Trade: Joinery
Task ID: optional
```

Add-on generates:

```text
AssemblyID: JN-014
AssemblyUUID: 9fa58df4-...
Version: 1
```

Member elements receive properties:

```text
BS_AssemblyID = JN-014
BS_AssemblyUUID = 9fa58df4-...
BS_AssemblyName = Kitchen Island
BS_AssemblyType = Joinery
BS_AssemblyVersion = 1
BS_Trade = Joinery
```

Add-on sends event to Python listener:

```json
{
  "event_type": "assembly_created",
  "assembly": {
    "assembly_id": "JN-014",
    "name": "Kitchen Island",
    "type": "Joinery"
  },
  "members": [
    { "element_guid": "GUID-001", "element_type": "Wall" },
    { "element_guid": "GUID-002", "element_type": "Slab" }
  ]
}
```

---

### 6.2 Select Assembly Members

User selects one element that belongs to `JN-014`.

User chooses:

```text
BuildSync → Select Assembly Members
```

Add-on:

1. reads `BS_AssemblyUUID` from selected element,
2. looks up the assembly registry,
3. selects all live member elements,
4. warns if any registered members are missing.

Expected behaviour:

```text
Selecting the benchtop slab can select the entire Kitchen Island assembly.
```

---

### 6.3 Edit Assembly

User selects a member of `JN-014`.

User chooses:

```text
BuildSync → Edit Assembly
```

Add-on:

- selects all members,
- highlights them if possible,
- opens a small assembly panel or status dialog,
- allows user to edit underlying elements normally.

User modifies:

```text
Benchtop slab depth: 900mm → 950mm
```

User chooses:

```text
BuildSync → Save Assembly
```

Add-on:

- refreshes live member list,
- increments version,
- updates member properties,
- sends `assembly_updated` event.

Expected behaviour:

```text
Assembly stays intact even though member geometry changed.
```

---

### 6.4 Add Elements to Assembly

User selects:

```text
- one existing member of JN-014
- two new elements to add
```

User chooses:

```text
BuildSync → Add Selection to Assembly
```

Add-on:

1. resolves target assembly from existing member,
2. adds new selected elements to assembly,
3. writes properties to new members,
4. increments assembly version,
5. syncs event.

Example result:

```text
JN-014 now has 8 members instead of 6.
```

---

### 6.5 Remove Elements from Assembly

User selects one or more members.

User chooses:

```text
BuildSync → Remove Selection from Assembly
```

Add-on:

- removes membership link,
- clears or updates BuildSync assembly properties on those elements,
- increments version,
- syncs event.

Important:

```text
Remove from Assembly must not delete the Archicad geometry.
```

Geometry deletion must require normal Archicad delete behaviour or a separate explicit destructive command.

---

### 6.6 Validate Selected Assembly

User selects one member and chooses:

```text
BuildSync → Validate Selected Assembly
```

Add-on checks:

- stored member GUIDs still exist,
- member properties match registry,
- no duplicate UUIDs exist,
- no orphaned assembly properties exist,
- assembly has at least one live member.

Example warning:

```text
JN-014 Kitchen Island
Status: Warning

Missing members:
- GUID-003 Slab element no longer exists

Suggested actions:
- Remove missing member from registry
- Rebuild assembly membership from selected elements
```

---

### 6.7 Manage Wrappers Palette

User chooses:

```text
BuildSync → Manage Wrappers...
```

Add-on opens a native modeless palette that:

- lists known wrappers,
- shows editable wrapper details,
- supports create, delete, refresh, repair, add selection, remove selection, and select members actions,
- keeps the palette open while selecting members in the Archicad UI.

The palette includes a collapsed-by-default `Members` section. When expanded, this section shows a scrollable member list with:

| Column | Source |
|---|---|
| Type | Archicad element header/type, with registry fallback |
| Element ID | `ACAPI_Element_GetElementInfoString` |
| Layer | `ACAPI_Element_GetHeader` plus `ACAPI_Attribute_Get` |

Display rules:

- show `Missing` when Element ID or Layer cannot be read,
- display Archicad's square/default layer glyph as `Archicad Layer`,
- keep the member list scrollable and resize it with the palette,
- support sorting by Type, Element ID, and Layer,
- keep missing sort values at the bottom in ascending order,
- double-clicking a member row selects only that member element in Archicad.

---

## 7. Required Archicad Menu Commands

Create a top-level menu:

```text
BuildSync
├─ Create Assembly from Selection
├─ Select Assembly Members
├─ Edit Assembly
├─ Save Assembly
├─ Add Selection to Assembly
├─ Remove Selection from Assembly
├─ Validate Selected Assembly
├─ Validate All Assemblies
├─ Sync with Python Listener
└─ Settings
```

### 7.1 v0.1 Minimum Menu Commands

Only these are required for first acceptance:

```text
BuildSync
├─ Create Assembly from Selection
├─ Select Assembly Members
├─ Add Selection to Assembly
├─ Remove Selection from Assembly
├─ Validate Selected Assembly
├─ Sync with Python Listener
└─ Manage Wrappers...
```

`Edit Assembly` and `Save Assembly` may initially be implemented as select/highlight + validation/version refresh commands.

---

## 8. Assembly Data Model

### 8.1 Assembly Object

```json
{
  "assembly_uuid": "9fa58df4-2ad7-40fd-88c2-c739399f21cc",
  "assembly_id": "JN-014",
  "name": "Kitchen Island",
  "type": "Joinery",
  "zone": "Apartment 204",
  "level": "L02",
  "trade": "Joinery",
  "task_id": "TASK-240",
  "version": 1,
  "status": "active",
  "created_at": "2026-05-09T10:00:00+10:00",
  "updated_at": "2026-05-09T10:00:00+10:00"
}
```

### 8.2 Assembly Member Object

```json
{
  "assembly_uuid": "9fa58df4-2ad7-40fd-88c2-c739399f21cc",
  "element_guid": "ARCHICAD-GUID-001",
  "element_type": "Slab",
  "role": "Benchtop",
  "member_status": "active",
  "added_at": "2026-05-09T10:00:00+10:00"
}
```

### 8.3 Assembly Relationship Object

Used later for nested assemblies.

```json
{
  "parent_assembly_uuid": "uuid-parent",
  "child_assembly_uuid": "uuid-child",
  "relationship_type": "contains"
}
```

Example:

```text
Kitchen Assembly KIT-002
contains
Joinery Assembly JN-014
```

### 8.4 Do Not Overload Member Properties

Avoid placing all complex assembly logic only inside element properties.

Element properties are for discoverability and interoperability.

The registry is for authoritative relationship state.

Correct:

```text
Element property:
BS_AssemblyID = JN-014

Registry:
JN-014 contains GUID-001, GUID-002, GUID-003
```

Incorrect:

```text
All membership, nesting, lineage, validation, and version history stored only as string properties on elements.
```

---

## 9. Archicad Properties

The add-on should create or expect an Archicad property group:

```text
BuildSync
```

Required properties:

| Property | Type | Purpose |
|---|---|---|
| `BS_AssemblyID` | string | Human-readable assembly ID |
| `BS_AssemblyUUID` | string | Stable internal ID |
| `BS_AssemblyName` | string | Assembly display name |
| `BS_AssemblyType` | string | Joinery, façade, structure, etc. |
| `BS_AssemblyRole` | string | Benchtop, carcass, panel, etc. |
| `BS_AssemblyVersion` | integer/string | Current assembly version |
| `BS_TaskID` | string | Scheduler task link |
| `BS_Trade` | string | Trade package |
| `BS_Status` | string | active, warning, orphaned, etc. |

### 9.1 Property Naming Guideline

Use a consistent prefix:

```text
BS_
```

Do not use generic names like:

```text
Stage
Task
Type
Status
```

These are too likely to conflict with existing office standards.

### 9.2 Property Write Behaviour

When creating or updating an assembly, the add-on should write the relevant properties to every live member element.

When removing an element from an assembly, the add-on should either:

1. clear `BS_AssemblyUUID` and related fields, or
2. set `BS_Status = removed`.

For v0.1, prefer clearing assembly fields unless history tracking is explicitly required.

---

## 10. Naming Rules

### 10.1 Default Naming

```text
[TYPE_PREFIX]-[SEQUENCE]
```

Examples:

| Assembly Type | Prefix | Example |
|---|---|---|
| Joinery | JN | JN-001 |
| Kitchen | KIT | KIT-001 |
| Bathroom | BTH | BTH-001 |
| Façade | FCD | FCD-001 |
| Structure | STR | STR-001 |
| Services | SVC | SVC-001 |

### 10.2 Optional Rich Naming

```text
[LEVEL]-[ZONE]-[TYPE_PREFIX]-[SEQUENCE]
```

Example:

```text
L02-A204-JN-001
```

### 10.3 Naming Rules

- Internal UUID must never change.
- Human-readable `AssemblyID` may be renamed, but this should be audited later.
- Deleted sequence numbers should not be reused by default.
- Prefix mappings should be configurable.
- Auto-naming should never block the user if metadata is missing.
- If type is unknown, use:

```text
ASM-001
```

### 10.4 Example

User creates a Joinery assembly on Level 2 in Apartment 204.

With simple rule:

```text
JN-014
```

With rich rule:

```text
L02-A204-JN-014
```

---

## 11. Validation Rules

### 11.1 v0.1 Validation Checks

| Check | Description | Severity |
|---|---|---|
| Missing member | Registry contains GUID that no longer exists | Warning |
| Empty assembly | Assembly has zero live members | Error |
| Orphaned element | Element has `BS_AssemblyUUID` but no registry record | Warning |
| Property mismatch | Element property does not match registry | Warning |
| Duplicate AssemblyUUID | Multiple unrelated element sets carry same UUID unexpectedly | Error |
| Missing required properties | BuildSync property group missing/incomplete | Error |
| Listener offline | Python listener unavailable | Info/Warning |

### 11.2 v0.2 Validation Checks

| Check | Description |
|---|---|
| Bounding box drift | Assembly geometry changed beyond tolerance |
| Centroid drift | Assembly moved unexpectedly |
| Role missing | Member has no assembly role |
| Circular nesting | Parent/child assembly graph contains cycle |
| Copy/paste duplicate | New elements retain old assembly ID |
| Mirror lineage | New assembly detected as mirrored derivative |
| Classification mismatch | Element type no longer fits expected assembly type |

### 11.3 Example Validation Output

```json
{
  "assembly_uuid": "9fa58df4-2ad7-40fd-88c2-c739399f21cc",
  "assembly_id": "JN-014",
  "status": "warning",
  "issues": [
    {
      "code": "MISSING_MEMBER",
      "severity": "warning",
      "message": "Stored member GUID-003 no longer exists."
    },
    {
      "code": "PROPERTY_MISMATCH",
      "severity": "warning",
      "message": "Element GUID-004 has BS_AssemblyID JN-013 but registry expects JN-014."
    }
  ]
}
```

---

## 12. Sync Architecture

### 12.1 Recommended Architecture

```text
Archicad C++ Add-on
    ↓ local HTTP
Python FastAPI Listener
    ↓
Backend Database / Web App / Scheduler
```

Do not connect the C++ add-on directly to Supabase/Postgres in v0.1.

Reasons:

- easier credential handling,
- easier debugging,
- easier schema changes,
- less native add-on complexity,
- Python is better for network/data work.

### 12.2 Local Listener URL

Default:

```text
http://127.0.0.1:8765
```

Make this configurable in:

```text
BuildSync → Settings
```

### 12.3 Required Listener Endpoints

#### `GET /health`

Returns:

```json
{
  "status": "ok",
  "service": "buildsync-python-listener",
  "version": "0.1"
}
```

#### `POST /events/assembly-created`

Payload:

```json
{
  "event_type": "assembly_created",
  "project_id": "local-project-id",
  "assembly": {
    "assembly_uuid": "uuid",
    "assembly_id": "JN-014",
    "name": "Kitchen Island",
    "type": "Joinery",
    "version": 1
  },
  "members": [
    {
      "element_guid": "GUID-001",
      "element_type": "Wall",
      "role": "carcass"
    }
  ]
}
```

#### `POST /events/assembly-updated`

Payload:

```json
{
  "event_type": "assembly_updated",
  "project_id": "local-project-id",
  "assembly_uuid": "uuid",
  "version": 2,
  "members_added": [],
  "members_removed": [],
  "members_current": []
}
```

#### `POST /events/assembly-validated`

Payload:

```json
{
  "event_type": "assembly_validated",
  "project_id": "local-project-id",
  "assembly_uuid": "uuid",
  "result": {
    "status": "warning",
    "missing_members": [],
    "orphaned_members": [],
    "duplicate_ids": []
  }
}
```

#### `GET /tasks`

Returns assignable scheduler tasks:

```json
{
  "tasks": [
    {
      "task_id": "TASK-240",
      "name": "Install kitchen joinery",
      "stage": "Fitout",
      "trade": "Joinery"
    }
  ]
}
```

#### `GET /commands/pending`

Optional v0.1 endpoint for reverse commands.

Example:

```json
{
  "commands": [
    {
      "command_id": "cmd-001",
      "type": "select_assembly",
      "assembly_uuid": "uuid"
    }
  ]
}
```

#### `POST /commands/ack`

Payload:

```json
{
  "command_id": "cmd-001",
  "status": "completed"
}
```

---

## 13. MCP Strategy

MCP support should be treated as a staged enhancement.

The core product runtime remains:

```text
Archicad C++ Add-on
→ Python FastAPI Listener
→ Backend / Scheduler
```

MCP is for AI-agent access to tools and context.

---

### 13.1 Why MCP Is Useful

C++ Archicad add-on development has several brittle areas:

- Archicad SDK configuration,
- compiler/linker errors,
- CMake setup,
- platform-specific build issues,
- add-on loading/signing issues,
- local test execution,
- API examples and documentation lookup.

An MCP tool server can expose controlled commands to Codex/Cursor so the agent can work against the real project instead of guessing.

Example developer tools:

```text
build_addon()
run_unit_tests()
run_python_listener_tests()
show_last_build_error()
search_archicad_sdk_examples(query)
read_spec_section(section_name)
compare_code_to_spec()
```

This is valuable for development speed and reliability.

---

### 13.2 MCP Developer Tooling Scope

A future `buildsync-dev-mcp` server may expose:

| Tool | Purpose |
|---|---|
| `build_addon` | Runs configured CMake/build command |
| `run_cpp_tests` | Runs pure C++ tests |
| `run_python_tests` | Runs Python listener tests |
| `get_last_build_log` | Returns compiler/linker output |
| `search_spec` | Searches this `spec.md` |
| `search_sdk_examples` | Searches local Archicad SDK/example files |
| `validate_repo_structure` | Checks project structure against this spec |
| `check_acceptance_status` | Reports which acceptance criteria have code coverage |

These tools are for development. They should not directly modify Archicad model data.

---

### 13.3 MCP Runtime/AI Operations Scope

A later `buildsync-ops-mcp` server may expose safe BIM/assembly operations to AI agents.

Example safe tools:

```text
list_assemblies()
get_assembly(assembly_uuid)
validate_assembly(assembly_uuid)
validate_all_assemblies()
find_orphaned_members()
find_missing_members()
select_assembly(assembly_uuid)
generate_validation_report()
list_unlinked_assemblies()
list_assemblies_by_type(type)
```

Example agent tasks:

```text
Find all joinery assemblies that have missing members and prepare a repair report.
```

```text
Show me all Level 2 kitchen assemblies that are not linked to a scheduler task.
```

```text
Validate all façade assemblies and list anything that looks orphaned or incomplete.
```

---

### 13.4 MCP Safety Rules

AI-agent tools must be constrained.

For v0.1 and v0.2, MCP tools should be read-only or selection-only by default.

Allowed early tools:

| Tool type | Allowed early? |
|---|---:|
| Read assembly data | Yes |
| Validate assemblies | Yes |
| Generate reports | Yes |
| Select/highlight assemblies | Yes |
| Create assembly | Later, with confirmation |
| Delete assembly | No, not early |
| Modify model geometry | No |
| Bulk repair | Later, explicit confirmation required |

Do not allow a free-form AI agent to directly mutate Archicad data without explicit tool boundaries, transaction logging, and user confirmation.

---

### 13.5 MCP Relationship to Python Listener

The Python listener and MCP server may eventually live in the same Python process, but they have different responsibilities.

| Component | Responsibility |
|---|---|
| Python FastAPI Listener | Runtime sync between add-on and backend |
| MCP Developer Server | Tools for Codex/Cursor during development |
| MCP Ops Server | Safe AI-agent access to assembly operations |

Do not mix these responsibilities too early.

Recommended staging:

```text
Phase 1: C++ Add-on + Python FastAPI listener
Phase 2: MCP developer tooling for build/test/spec search
Phase 3: MCP read-only assembly ops
Phase 4: MCP confirmed write/repair operations
```

---

### 13.6 Example MCP Tool Contract: `validate_all_assemblies`

Request:

```json
{
  "tool": "validate_all_assemblies",
  "arguments": {
    "include_orphans": true,
    "include_missing_members": true
  }
}
```

Response:

```json
{
  "status": "warning",
  "summary": {
    "assemblies_checked": 42,
    "assemblies_with_issues": 3,
    "missing_members": 2,
    "orphaned_members": 5
  },
  "issues": [
    {
      "assembly_id": "JN-014",
      "severity": "warning",
      "code": "MISSING_MEMBER",
      "message": "Stored slab member no longer exists."
    }
  ]
}
```

---

### 13.7 Example MCP Tool Contract: `select_assembly`

Request:

```json
{
  "tool": "select_assembly",
  "arguments": {
    "assembly_id": "JN-014"
  }
}
```

Behaviour:

```text
MCP server passes command to Python listener or command queue.
Archicad C++ add-on polls pending commands.
Add-on selects/highlights JN-014 members.
```

This avoids needing the MCP server to directly control Archicad.

---

## 14. Sync Queue Behaviour

The add-on must use local-first sync.

If Python listener is unavailable:

```text
Create Assembly → local success → event queued → user warning
```

User warning:

```text
Assembly created locally. Python listener is offline; sync event has been queued.
```

### 14.1 Sync Event Object

```json
{
  "event_id": "uuid",
  "event_type": "assembly_updated",
  "created_at": "2026-05-09T10:00:00+10:00",
  "payload": {},
  "sync_status": "pending",
  "attempt_count": 0,
  "last_attempt_at": null
}
```

### 14.2 Retry Rules

- Retry manually when user clicks `Sync with Python Listener`.
- Optional automatic retry every few minutes later.
- Failed events remain queued.
- Event order should be preserved where possible.
- Sync failures should not corrupt local assembly data.

---

## 15. C++ Add-on Responsibilities

The C++ add-on owns Archicad-native behaviour.

### 15.1 Required Responsibilities

| Responsibility | Description |
|---|---|
| Menu registration | Add BuildSync menu |
| Selection reading | Get current selected elements |
| Assembly creation | Create registry records |
| Property writing | Stamp BuildSync properties on members |
| Member selection | Select all elements in assembly |
| Single member selection | Select exactly one wrapper member from the native palette |
| Member metadata reading | Read member type, Element ID, layer name, and status for palette display |
| Wrapper manager palette | Provide native wrapper CRUD, refresh, repair, member inspection, sorting, and selection UX |
| Registry storage | Persist assembly membership locally |
| Validation | Detect missing/orphaned members |
| Sync client | Send JSON events to Python listener |
| Sync queue | Queue events if listener offline |
| Settings | Listener URL, naming options |

### 15.2 Later Responsibilities

| Responsibility | Phase |
|---|---|
| Element event monitoring | v0.2 |
| Copy/paste duplicate detection | v0.2 |
| Mirror lineage detection | v0.3 |
| Drift detection | v0.3 |
| Rich nested assembly editing | v0.3 |
| MCP command polling integration | v0.2/v0.3 |
| AI-safe read-only operation interface | v0.3 |

---

## 16. Python Listener Responsibilities

The Python listener owns integration and backend communication.

### 16.1 Required Responsibilities

| Responsibility | Description |
|---|---|
| Receive assembly events | Accept JSON from C++ add-on |
| Persist to local DB | SQLite/Postgres initially |
| Sync to backend | Optional in v0.1 |
| Provide task list | Return tasks to add-on |
| Log sync events | Useful for debugging |
| Validate schemas | Reject malformed payloads clearly |
| Optional MCP developer server | Later: expose build/test/spec tooling |
| Optional MCP ops server | Later: expose safe assembly read/validate/select tools |

### 16.2 Python Should Not Own

Python should not own:

- native Archicad menu commands,
- native Archicad element selection UX,
- native assembly editing state,
- direct replacement of the C++ registry.

Python can inspect/update properties later, but the native wrapper belongs in C++.

---

## 17. Storage Strategy

### 17.1 Three Storage Layers

| Layer | Purpose |
|---|---|
| Archicad properties | Human-visible metadata on elements |
| Add-on local registry | Authoritative local assembly graph |
| Python/backend database | External scheduler and reporting sync |

### 17.2 Guideline

The add-on local registry is the source of truth inside Archicad.

The backend may become the broader source of truth later, but v0.1 should not require live backend availability.

### 17.3 Minimum Local Registry Fields

```text
assemblies
- assembly_uuid
- assembly_id
- name
- type
- zone
- level
- trade
- task_id
- version
- status
- created_at
- updated_at

assembly_members
- assembly_uuid
- element_guid
- element_type
- role
- member_status
- added_at

assembly_relationships
- parent_assembly_uuid
- child_assembly_uuid
- relationship_type

sync_events
- event_id
- event_type
- payload_json
- sync_status
- attempt_count
- created_at
- last_attempt_at
```

---

## 18. Copy/Paste and Mirror Behaviour

### 18.1 v0.1 Behaviour

Do not attempt intelligent automatic copy/mirror handling.

Instead, detect problematic duplicates during validation.

Example issue:

```text
User copies JN-014.
Copied elements retain BS_AssemblyUUID = old UUID.
Now two physical sets claim the same assembly identity.
```

v0.1 response:

```text
Validation detects duplicate AssemblyUUID usage.
User is offered "Repair Duplicate Assembly IDs" later.
```

This repair command is optional for v0.1 but should be planned.

### 18.2 v0.2 Behaviour

When duplicate assembly UUIDs are detected:

```text
Original: JN-014
Copy: JN-015
DerivedFrom: JN-014
```

### 18.3 Mirror Behaviour

A mirrored assembly should not be considered the same assembly.

It should be treated as:

```text
New assembly instance
Derived from original
Transform = mirrored
```

This matters because mirrored joinery may need different handedness, hardware, procurement data, or installation instructions.

---

## 19. Nested Assemblies

### 19.1 v0.1 Support

Store parent-child relationships only.

Example:

```text
Kitchen Assembly KIT-002
contains
Joinery Assembly JN-014
```

### 19.2 Rule

Prefer nesting assemblies rather than assigning the same element directly to many high-level assemblies.

Preferred:

```text
KIT-002 Kitchen
└── JN-014 Kitchen Island
    ├── Wall GUID-001
    └── Slab GUID-002
```

Avoid unless necessary:

```text
Wall GUID-001 belongs directly to both KIT-002 and JN-014
```

### 19.3 Circular Nesting Must Be Prevented

Invalid:

```text
A contains B
B contains C
C contains A
```

The `AssemblyGraph` module must test for cycles.

---

## 20. Highlighting and Visual Feedback

### 20.1 v0.1

At minimum:

- select all assembly members,
- optionally set temporary status property,
- optionally rely on user-created Graphic Overrides.

### 20.2 Later Visual States

| State | Suggested display |
|---|---|
| Active assembly | highlighted |
| Valid assembly | normal |
| Missing member | red warning in report |
| Orphaned element | orange/yellow |
| Future task | transparent |
| Complete task | normal material |
| Delayed task | red |

### 20.3 Do Not Overbuild Visuals First

The first value is semantic binding and validation.

Advanced visual polish should come after the wrapper is stable.

---

## 21. Repository Structure

Suggested structure:

```text
buildsync-archicad-addon/
├─ README.md
├─ spec.md
├─ CMakeLists.txt
├─ src/
│  ├─ addon/
│  │  ├─ Main.cpp
│  │  ├─ MenuCommands.cpp
│  │  ├─ SettingsDialog.cpp
│  │  ├─ ResourceIds.hpp
│  │  └─ ui/
│  │     ├─ WrapperManagerDialog.cpp
│  │     └─ WrapperManagerDialog.hpp
│  ├─ archicad_adapter/
│  │  ├─ SelectionReader.cpp
│  │  ├─ SelectionReader.hpp
│  │  ├─ ElementPropertyWriter.cpp
│  │  ├─ ElementPropertyWriter.hpp
│  │  ├─ ElementMetadataReader.cpp
│  │  ├─ ElementMetadataReader.hpp
│  │  ├─ ElementExistenceChecker.cpp
│  │  ├─ ElementExistenceChecker.hpp
│  │  ├─ HighlightController.cpp
│  │  ├─ HighlightController.hpp
│  │  ├─ RegistryStorage.cpp
│  │  └─ RegistryStorage.hpp
│  ├─ core/
│  │  ├─ Assembly.hpp
│  │  ├─ AssemblyMember.hpp
│  │  ├─ AssemblyRegistry.cpp
│  │  ├─ AssemblyRegistry.hpp
│  │  ├─ AssemblyValidator.cpp
│  │  ├─ AssemblyValidator.hpp
│  │  ├─ AssemblyGraph.cpp
│  │  ├─ AssemblyGraph.hpp
│  │  ├─ NamingRules.cpp
│  │  └─ NamingRules.hpp
│  ├─ sync/
│  │  ├─ PythonListenerClient.cpp
│  │  ├─ PythonListenerClient.hpp
│  │  ├─ JsonSerializer.cpp
│  │  ├─ JsonSerializer.hpp
│  │  ├─ SyncQueue.cpp
│  │  └─ SyncQueue.hpp
│  └─ util/
│     ├─ GuidUtils.cpp
│     ├─ GuidUtils.hpp
│     ├─ TimeUtils.cpp
│     └─ TimeUtils.hpp
├─ tests/
│  ├─ AssemblyRegistryTests.cpp
│  ├─ AssemblyValidatorTests.cpp
│  ├─ AssemblyGraphTests.cpp
│  ├─ NamingRulesTests.cpp
│  └─ JsonSerializerTests.cpp
├─ python_listener/
│  ├─ README.md
│  ├─ main.py
│  ├─ schemas.py
│  ├─ storage.py
│  ├─ requirements.txt
│  └─ tests/
│     └─ test_events.py
└─ mcp_tools/
   ├─ README.md
   ├─ dev_server.py        # later: build/test/spec tools for coding agents
   └─ ops_server.py        # later: safe assembly validation/selection tools
```

---

## 22. Core C++ Modules

### 22.1 `Assembly`

Represents a semantic assembly.

```cpp
struct Assembly {
    std::string assemblyUuid;
    std::string assemblyId;
    std::string name;
    std::string type;
    std::string zone;
    std::string level;
    std::string trade;
    std::string taskId;
    int version;
    std::string status;
    std::vector<AssemblyMember> members;
};
```

### 22.2 `AssemblyMember`

```cpp
struct AssemblyMember {
    std::string elementGuid;
    std::string elementType;
    std::string role;
    std::string status;
};
```

### 22.3 `AssemblyRegistry`

Owns local assembly records.

Required methods:

```cpp
createAssembly(...)
addMembers(...)
removeMembers(...)
getAssemblyByUuid(...)
getAssemblyByElementGuid(...)
renameAssembly(...)
incrementVersion(...)
listAssemblies(...)
```

### 22.4 `NamingRules`

Generates human-readable IDs.

Required methods:

```cpp
generateAssemblyId(type, level, zone)
getPrefixForType(type)
reserveNextSequence(prefix)
```

### 22.5 `AssemblyValidator`

Checks integrity.

Required methods:

```cpp
validateAssembly(assemblyUuid)
validateAllAssemblies()
checkMissingMembers(...)
checkOrphanedMembers(...)
checkDuplicateAssemblyIds(...)
checkPropertyMismatch(...)
```

### 22.6 `AssemblyGraph`

Prepares for nested assemblies.

Required methods:

```cpp
addRelationship(parentUuid, childUuid)
removeRelationship(parentUuid, childUuid)
detectCycle(parentUuid, childUuid)
getChildren(parentUuid)
getParents(childUuid)
```

### 22.7 `SelectionReader`

Archicad adapter.

Responsibilities:

- read selected element GUIDs,
- read element types,
- read selected element properties.

### 22.8 `ElementPropertyWriter`

Archicad adapter.

Responsibilities:

- ensure BuildSync property group exists or warn clearly,
- write assembly properties to member elements,
- clear assembly properties when removed.

### 22.9 `ElementExistenceChecker`

Archicad adapter.

Responsibilities:

- confirm whether stored GUIDs still exist in current model.

### 22.10 `ElementMetadataReader`

Archicad adapter used by the native wrapper manager palette.

Responsibilities:

- read an element GUID's current Archicad element type,
- read Element ID via `ACAPI_Element_GetElementInfoString`,
- read layer name via `ACAPI_Element_GetHeader` and `ACAPI_Attribute_Get`,
- return empty values for unreadable Element ID or Layer so the UI can display `Missing`,
- expose a status suitable for distinguishing active/missing members.

Expected metadata shape:

```cpp
struct ElementMetadata {
    std::string elementGuid;
    std::string elementType;
    std::string elementId;
    std::string layerName;
    std::string status;
};
```

### 22.11 `HighlightController`

Archicad adapter.

Responsibilities:

- select all live member elements,
- select a single live member element when requested from the wrapper manager palette,
- later support highlight/temporary display states.

### 22.12 `AssemblyCommandService`

Coordinates palette and menu operations against adapters and the local registry.

Member-list responsibilities:

```cpp
listWrapperMemberMetadata(assemblyUuid)
selectWrapperMember(assemblyUuid, elementGuid)
```

Rules:

- `listWrapperMemberMetadata` preserves wrapper member order before any UI sorting,
- metadata should use registry element type/status as fallback when live SDK metadata is unavailable,
- `selectWrapperMember` validates wrapper existence and membership,
- `selectWrapperMember` must call `HighlightController::selectElements({ elementGuid })` with exactly one GUID.

### 22.13 `PythonListenerClient`

Sends HTTP requests to local listener.

Required methods:

```cpp
healthCheck()
postAssemblyCreated(...)
postAssemblyUpdated(...)
postAssemblyValidated(...)
getTasks()
pollCommands()
```

### 22.14 `SyncQueue`

Stores unsent events.

Required methods:

```cpp
enqueue(event)
flush()
markSent(eventId)
markFailed(eventId, error)
listPending()
```

---

## 23. Python Listener Mini-Spec

### 23.1 Stack

Recommended:

```text
FastAPI
Pydantic
SQLite for local dev
Postgres/Supabase adapter later
```

### 23.2 File Structure

```text
python_listener/
├─ main.py
├─ schemas.py
├─ storage.py
├─ requirements.txt
└─ tests/
   └─ test_events.py
```

### 23.3 Required Endpoints

```text
GET  /health
GET  /tasks
POST /events/assembly-created
POST /events/assembly-updated
POST /events/assembly-validated
GET  /commands/pending
POST /commands/ack
```

### 23.4 Minimal `main.py` Behaviour

- validate incoming event payloads,
- store them,
- print/log them for debugging,
- return clear success/error responses.

Example response:

```json
{
  "ok": true,
  "event_id": "evt-001",
  "message": "Assembly event received."
}
```

### 23.5 Listener Database Tables

```sql
CREATE TABLE assemblies (
    assembly_uuid TEXT PRIMARY KEY,
    assembly_id TEXT,
    name TEXT,
    type TEXT,
    zone TEXT,
    level TEXT,
    trade TEXT,
    task_id TEXT,
    version INTEGER,
    status TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE assembly_members (
    assembly_uuid TEXT,
    element_guid TEXT,
    element_type TEXT,
    role TEXT,
    member_status TEXT,
    added_at TEXT,
    PRIMARY KEY (assembly_uuid, element_guid)
);

CREATE TABLE assembly_relationships (
    parent_assembly_uuid TEXT,
    child_assembly_uuid TEXT,
    relationship_type TEXT,
    PRIMARY KEY (parent_assembly_uuid, child_assembly_uuid)
);

CREATE TABLE sync_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT,
    payload_json TEXT,
    received_at TEXT
);

CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    name TEXT,
    stage TEXT,
    trade TEXT
);
```

---

## 24. Error Handling

### 24.1 Required User-Facing Messages

| Condition | Message |
|---|---|
| No selection | “Select one or more Archicad elements first.” |
| No assembly found | “Selected element is not part of a BuildSync assembly.” |
| Multiple assemblies selected | “Selection contains multiple assemblies. Choose one target assembly.” |
| Listener offline | “Python listener is offline. Event queued for later sync.” |
| Missing property group | “BuildSync properties are missing. Create them now?” |
| Missing member | “One or more stored members no longer exist.” |
| Duplicate UUID | “Duplicate assembly identity detected. Validation required.” |

### 24.2 Non-Negotiable Behaviour

The add-on must not crash if:

- listener is offline,
- backend is unavailable,
- selected element has missing properties,
- assembly registry is incomplete,
- member GUID no longer exists,
- unsupported element types are selected.

Fail gracefully and explain.

---

## 25. Implementation Constraints and Guidelines

### 25.1 Keep Business Logic Separate from Archicad API

Core logic must be testable without Archicad.

Good:

```text
core/AssemblyRegistry.cpp
core/AssemblyValidator.cpp
core/NamingRules.cpp
```

Bad:

```text
All business logic embedded directly in MenuCommands.cpp
```

### 25.2 Avoid Building the Scheduler Inside the Add-on

The add-on only needs to know enough to link to scheduler tasks.

The web app owns:

- Gantt chart,
- dependency logic,
- date calculations,
- progress dashboards,
- reporting.

### 25.3 Avoid Over-Modelling v0.1

Do not implement:

- full component inheritance,
- automatic mirror geometry recognition,
- all-instance update propagation,
- procurement logic,
- cost rollups,
- detailed construction physics.

The first goal is a stable wrapper.

### 25.4 Prefer Explicit Commands Over Magical Automation

For v0.1, prefer:

```text
Validate Assembly
Repair Assembly
Sync Assembly
```

over hidden automatic behaviour.

This makes debugging easier.

### 25.5 Use Human-Readable IDs but Trust UUIDs

Users see:

```text
JN-014
```

Systems trust:

```text
9fa58df4-2ad7-40fd-88c2-c739399f21cc
```

### 25.6 Treat Copy and Mirror as New Instances

A copied or mirrored assembly should become a new assembly instance, not the same identity.

### 25.7 Keep MCP Optional and Layered

MCP should not be required for normal user operation.

The add-on must work with:

```text
C++ Add-on only
```

and with:

```text
C++ Add-on + Python Listener
```

before MCP is introduced.

MCP is valuable for:

- developer agents,
- controlled diagnostics,
- validation reports,
- AI-assisted selection,
- later confirmed repair workflows.

MCP is not the v0.1 substitute for stable local registry, property stamping, or Python sync.

### 25.8 Prefer Small Vertical Slices

Do not build all modules at once.

Preferred slice:

```text
Core model → test → JSON payload → Python listener → Archicad selection → property write → validation
```

Avoid:

```text
Build complete add-on shell first, then discover core model is wrong.
```

---

## 26. Testing Requirements

### 26.1 Unit Tests Outside Archicad

Required tests:

| Module | Test |
|---|---|
| NamingRules | Generates expected IDs |
| AssemblyRegistry | Creates assembly and adds/removes members |
| AssemblyRegistry | Prevents duplicate UUIDs |
| AssemblyValidator | Detects missing member |
| AssemblyValidator | Detects orphaned element |
| AssemblyGraph | Prevents circular nesting |
| JsonSerializer | Creates valid event payload |
| SyncQueue | Queues and flushes events in order |

### 26.2 Manual Archicad Test Cases

#### Test 1: Create Assembly

```text
Given: 3 selected slabs
When: Create Assembly from Selection
Then: Assembly is created
And: All 3 slabs receive BuildSync properties
And: assembly_created event is queued/sent
```

#### Test 2: Select Members

```text
Given: One member of JN-014 is selected
When: Select Assembly Members
Then: All live members of JN-014 are selected
```

#### Test 3: Add Member

```text
Given: JN-014 exists
And: User selects one existing member and one new wall
When: Add Selection to Assembly
Then: New wall becomes member of JN-014
And: Version increments
```

#### Test 4: Remove Member

```text
Given: JN-014 has 4 members
When: User removes one selected member
Then: Registry has 3 members
And: Removed element no longer has assembly properties
```

#### Test 5: Deleted Member Validation

```text
Given: JN-014 has 4 members
And: One member is deleted in Archicad
When: Validate Selected Assembly
Then: Missing member warning is shown
```

#### Test 6: Listener Offline

```text
Given: Python listener is not running
When: User creates assembly
Then: Assembly is still created locally
And: Sync event is queued
And: User sees listener offline warning
```

#### Test 7: Listener Online Again

```text
Given: Pending sync events exist
And: Python listener is running
When: User clicks Sync with Python Listener
Then: Pending events are posted
And: Events are marked sent
```

---

## 27. Acceptance Criteria for v0.1

The first milestone is complete when:

```text
1. User can select elements in Archicad.
2. User can create a BuildSync assembly.
3. Add-on auto-generates an AssemblyID.
4. Add-on creates a stable AssemblyUUID.
5. Member elements receive BuildSync properties.
6. Add-on stores member GUIDs in a local registry.
7. User can select one member and select/highlight all assembly members.
8. User can add selected elements to an assembly.
9. User can remove selected elements from an assembly.
10. User can validate a selected assembly.
11. Deleted/missing members are detected.
12. Assembly-created and assembly-updated events reach the Python listener.
13. If the listener is offline, events queue without crashing.
14. Core assembly logic has unit tests independent of Archicad.
15. User can open the native Wrapper Manager palette and inspect wrapper details.
16. User can expand a scrollable member list showing Type, Element ID, and Layer.
17. User can sort the member list by Type, Element ID, and Layer.
18. User can double-click a member row to select exactly that Archicad element.
19. Unreadable member values display as `Missing`, and Archicad's square/default layer glyph displays as `Archicad Layer`.
20. Architecture leaves MCP as an optional later agent interface, not a dependency for v0.1 operation.
21. Coding-agent instructions are present and followed by implementation agents.
```

---

## 28. Future Roadmap

### v0.2

- native palette refinements and richer status display,
- element event monitoring,
- duplicate assembly repair,
- better status/highlight display,
- backend task assignment,
- basic web-app command polling,
- optional MCP developer tooling for build/test/spec search.

### v0.3

- copy/paste lineage detection,
- mirror lineage detection,
- bounding box/centroid drift checks,
- nested assembly editing UI,
- role-based member editing,
- MCP read-only assembly operations: list, inspect, validate, report.

### v0.4

- assembly definitions vs instances,
- update related instances,
- procurement/BOM export,
- cost package integration,
- QA/defect workflow,
- MCP confirmed repair operations with transaction logs.

### v1.0

- robust assembly graph,
- scheduler integration,
- web dashboard,
- 4D viewer integration,
- production installer,
- cross-version Archicad support.

---

## 29. Example Scenario: Joinery Unit

### User Goal

The architect has modelled a joinery unit using walls and slabs.

They want the scheduler to treat it as one installable joinery item.

### Workflow

```text
1. Select all walls/slabs/objects making up the joinery unit.
2. BuildSync → Create Assembly from Selection.
3. Type = Joinery.
4. Name = Kitchen Island.
5. Add-on creates JN-014.
6. Scheduler receives JN-014 as one construction object.
7. Later, selecting the benchtop slab can select all JN-014 members.
8. If a member slab is deleted, validation flags the assembly.
```

### Expected Result

The joinery remains editable as walls/slabs but is now schedulable as one meaningful assembly.

---

## 30. Example Scenario: Nested Kitchen Assembly

### User Goal

A kitchen contains multiple subassemblies:

```text
Kitchen KIT-002
├── JN-014 Kitchen Island
├── JN-015 Rear Bench
├── APP-003 Appliance Set
└── SPL-001 Splashback
```

### v0.1 Behaviour

The add-on can store the relationship:

```json
{
  "parent_assembly_uuid": "KIT-002-uuid",
  "child_assembly_uuid": "JN-014-uuid",
  "relationship_type": "contains"
}
```

But v0.1 does not need rich nested editing.

### Later Behaviour

The scheduler can schedule:

```text
Install Kitchen KIT-002
```

or:

```text
Install Kitchen Island JN-014
```

depending on desired level of detail.

---

## 31. Example Scenario: Deleted Member

### Situation

Assembly `JN-014` has 6 members.

A user deletes one slab manually in Archicad.

### Expected Validation

```text
BuildSync → Validate Selected Assembly
```

Result:

```text
JN-014 Kitchen Island
Status: Warning
Missing members: 1
Missing GUID: GUID-003
```

Suggested actions:

```text
- Remove missing member from registry
- Rebuild membership from current selected elements
```

Do not silently ignore the issue.

---

## 32. Example Scenario: Copied Assembly

### Situation

User copies all members of `JN-014`.

The copied elements may retain old BuildSync properties.

### v0.1 Expected Behaviour

Validation detects duplicate identity risk:

```text
Duplicate AssemblyUUID detected.
Copied elements may be claiming the same assembly identity as JN-014.
```

No automatic repair required for v0.1.

### Future Behaviour

Offer:

```text
Create New Assembly from Duplicate
```

Result:

```text
Original: JN-014
Copy: JN-015
DerivedFrom: JN-014
```

---

## 33. Coding Agent Skill

The coding agent working on this repository should behave as a careful implementation engineer.

Its role is not to redesign the product. Its role is to implement the current specification in small, testable increments.

### 33.1 Agent Identity

The agent is:

```text
BuildSync Implementation Engineer
```

The agent should optimise for:

- correctness,
- narrow scope,
- testability,
- clear architecture boundaries,
- predictable Archicad behaviour,
- minimal first-build complexity.

The agent should not optimise for:

- flashy UI,
- speculative automation,
- full component-system behaviour,
- premature MCP runtime integration,
- broad scheduler functionality.

---

### 33.2 Operating Rules

1. Read `spec.md` before making changes.
2. Preserve the module boundaries:
   - `src/core`
   - `src/archicad_adapter`
   - `src/sync`
   - `src/addon`
   - `python_listener`
   - optional later `mcp_tools`
3. Keep business logic out of Archicad menu handlers.
4. Keep Archicad API calls out of pure core logic.
5. Prefer explicit commands over hidden automatic behaviour.
6. Do not implement full SketchUp-style components in v0.1.
7. Do not implement automatic mirror recognition in v0.1.
8. Do not make MCP the runtime transport in v0.1.
9. Add or update tests whenever changing:
   - `AssemblyRegistry`
   - `AssemblyValidator`
   - `AssemblyGraph`
   - `NamingRules`
   - `SyncQueue`
10. If a task is too large, split it into smaller milestones.
11. Explain which acceptance criteria each change advances.
12. Do not silently change data model names, property names, or endpoint names.
13. Prefer conservative assumptions if the specification is incomplete.
14. Ask for clarification only when blocked by a genuine product decision.

---

### 33.3 Preferred Implementation Order

1. Create pure C++ core models.
2. Add unit tests for core models.
3. Implement naming rules.
4. Implement assembly registry.
5. Implement assembly graph cycle protection.
6. Implement validation logic using mock element existence/property data.
7. Implement JSON serialization.
8. Implement Python listener.
9. Implement sync queue.
10. Implement Archicad selection adapter.
11. Implement property writer.
12. Implement member selection/highlight adapter.
13. Implement menu commands.
14. Test in Archicad manually.
15. Add validation and reporting.
16. Add optional MCP developer tooling later.

---

### 33.4 Agent Coding Style Guidelines

- Use clear names over clever names.
- Keep domain types small and explicit.
- Avoid global mutable state where possible.
- Wrap Archicad API calls behind adapter interfaces.
- Make errors explicit and user-readable.
- Return structured validation results rather than plain strings.
- Keep JSON payloads stable and versioned.
- Prefer functions that can be unit-tested without Archicad.
- Do not bury important side effects inside constructors.
- Do not assume the Python listener is always running.

---

### 33.5 Definition of Done for Agent Tasks

For any implementation task, the agent should provide:

```text
1. What changed
2. Files changed
3. Tests added/updated
4. Acceptance criteria advanced
5. Known limitations
6. Manual test required, if any
```

Example:

```text
Change:
Added AssemblyRegistry create/add/remove logic.

Files:
src/core/AssemblyRegistry.cpp
src/core/AssemblyRegistry.hpp
tests/AssemblyRegistryTests.cpp

Tests:
- creates assembly
- adds members
- removes members
- prevents duplicate UUID

Acceptance criteria advanced:
2, 4, 6, 8, 9, 14

Limitations:
No Archicad property writing yet.
```

---

### 33.6 Agent Anti-Patterns

Avoid:

```text
- implementing everything inside Main.cpp
- putting Archicad API calls inside AssemblyRegistry
- using AssemblyID as the only identity
- making HTTP sync required for local creation
- adding mirror recognition before basic validation works
- making MCP required for normal add-on use
- writing large untested feature chunks
- changing spec-defined endpoint names without updating spec.md
- silently swallowing validation errors
```

---

## 34. Initial Coding Agent Prompt

Use this prompt to begin implementation in Codex/Cursor:

```text
You are working on the BuildSync Assembly Wrapper, an Archicad C++ add-on with a Python FastAPI sync listener.

Before writing code, read spec.md.

Your goal is to implement the v0.1 milestone only:

- select Archicad elements;
- create an assembly from selection;
- generate stable AssemblyUUID;
- generate human-readable AssemblyID;
- store local assembly membership;
- stamp BS_ properties onto member elements;
- select all members of an assembly;
- add members;
- remove members;
- validate missing/deleted members;
- send JSON events to the Python listener;
- queue events if the listener is offline.

Do not implement:

- full SketchUp-style component instancing;
- automatic mirror recognition;
- all-instance propagation;
- full scheduler UI;
- procurement/cost modules;
- MCP runtime transport.

Architecture constraints:

- src/core contains pure business logic and must not call Archicad APIs.
- src/archicad_adapter contains Archicad API integration.
- src/sync contains HTTP client, JSON serialization, and sync queue.
- src/addon contains Archicad add-on entry points and menu commands.
- python_listener contains the FastAPI listener.
- mcp_tools is reserved for later developer and AI tooling.

Start by implementing the pure core layer and tests:

1. Assembly
2. AssemblyMember
3. AssemblyRegistry
4. NamingRules
5. AssemblyValidator
6. AssemblyGraph

After the core tests pass, implement JSON serialization and the Python listener.

Only then begin Archicad API integration.

Keep changes small and explain which acceptance criteria each change advances.
```

---

## 35. First Implementation Slice Prompt

Use this narrower prompt if the coding agent needs a first task:

```text
Implement the first pure-core slice of BuildSync Assembly Wrapper.

Read spec.md first.

Implement only:

- src/core/Assembly.hpp
- src/core/AssemblyMember.hpp
- src/core/NamingRules.hpp
- src/core/NamingRules.cpp
- src/core/AssemblyRegistry.hpp
- src/core/AssemblyRegistry.cpp
- tests/NamingRulesTests.cpp
- tests/AssemblyRegistryTests.cpp

Do not use Archicad APIs.
Do not create menu commands.
Do not create Python listener yet.
Do not implement MCP.

Requirements:

- Assembly has stable assemblyUuid and human-readable assemblyId.
- Assembly has name, type, zone, level, trade, taskId, version, status.
- AssemblyMember has elementGuid, elementType, role, status.
- NamingRules can generate IDs from type prefix and sequence.
- AssemblyRegistry can create assembly, add members, remove members, get by UUID, get by element GUID, increment version, and list assemblies.
- Tests cover creation, duplicate UUID prevention, add/remove members, version increment, and naming output.

After coding, report:
- files changed
- tests added
- how this advances v0.1 acceptance criteria
- limitations
```

---

## 36. Second Implementation Slice Prompt

Use this after the core registry exists:

```text
Implement the validation and graph slice of BuildSync Assembly Wrapper.

Read spec.md first.

Implement only:

- src/core/AssemblyValidator.hpp
- src/core/AssemblyValidator.cpp
- src/core/AssemblyGraph.hpp
- src/core/AssemblyGraph.cpp
- tests/AssemblyValidatorTests.cpp
- tests/AssemblyGraphTests.cpp

Do not use Archicad APIs.
Use mock inputs for:
- live element existence
- element properties
- registry state

Requirements:

- AssemblyValidator detects:
  - missing members
  - empty assemblies
  - orphaned elements
  - property mismatch
  - duplicate AssemblyUUID risk
- AssemblyGraph supports parent-child relationships.
- AssemblyGraph prevents circular nesting.
- Validation output is structured with code, severity, and message.
- Tests cover all required v0.1 validation checks.

After coding, report:
- files changed
- tests added
- how this advances v0.1 acceptance criteria
- limitations
```

---

## 37. Third Implementation Slice Prompt

Use this after core and validation tests pass:

```text
Implement JSON serialization, sync queue, and Python listener for BuildSync Assembly Wrapper.

Read spec.md first.

Implement only:

- src/sync/JsonSerializer.hpp
- src/sync/JsonSerializer.cpp
- src/sync/SyncQueue.hpp
- src/sync/SyncQueue.cpp
- tests/JsonSerializerTests.cpp
- tests/SyncQueueTests.cpp
- python_listener/main.py
- python_listener/schemas.py
- python_listener/storage.py
- python_listener/requirements.txt
- python_listener/tests/test_events.py

Do not use Archicad APIs.
Do not implement menu commands.
Do not implement MCP.

Requirements:

- Serialize assembly_created, assembly_updated, and assembly_validated events.
- SyncQueue stores pending events and can mark sent/failed.
- Python listener exposes:
  - GET /health
  - GET /tasks
  - POST /events/assembly-created
  - POST /events/assembly-updated
  - POST /events/assembly-validated
  - GET /commands/pending
  - POST /commands/ack
- Python listener validates payloads with Pydantic.
- Python listener can persist to SQLite or in-memory storage for first slice.
- Tests cover valid and invalid event payloads.

After coding, report:
- files changed
- tests added
- how this advances v0.1 acceptance criteria
- limitations
```

---

## 38. Final Guideline

The first version should feel boring, stable, and useful.

Do not chase advanced component magic too early.

Build this first:

```text
Select elements
→ Create Assembly
→ Auto-name
→ Stamp properties
→ Store membership
→ Select members later
→ Validate
→ Sync event
```

That wrapper is the foundation.

Once it works, the sequencer, scheduler, cost engine, procurement module, QA system, and 4D viewer can all use the same assembly graph.

---

## 39. Current Repository Implementation Status

**Last updated:** 2026-05-09  
**Repository branch:** `master`  
**Latest pushed commit at handoff:** `460ea55 Add BuildSync SDK setup tooling`

This section records the current implementation state so another coding agent can continue without rediscovering context.

### 39.1 Implemented So Far

The repository now contains a native-side BuildSync foundation under:

```text
buildsync-archicad-addon/
```

Implemented native modules:

- `src/core/Assembly.hpp`
- `src/core/AssemblyMember.hpp`
- `src/core/NamingRules.hpp/.cpp`
- `src/core/AssemblyRegistry.hpp/.cpp`
- `src/core/AssemblyGraph.hpp/.cpp`
- `src/core/AssemblyValidator.hpp/.cpp`
- `src/sync/JsonSerializer.hpp/.cpp`
- `src/sync/SyncQueue.hpp/.cpp`
- `src/sync/PythonListenerClient.hpp/.cpp`
- `src/addon/MenuCommands.hpp/.cpp`
- `src/addon/NativeRuntime.hpp/.cpp`
- `src/addon/NativeRuntimeFactory.hpp/.cpp`
- `src/archicad_adapter/FileRegistryStorage.hpp/.cpp`
- `src/archicad_adapter/ArchicadSdkAdapters.hpp/.cpp`

The core logic is SDK-free and has tests for:

- naming rules,
- registry create/add/remove/versioning,
- graph cycle protection,
- validation,
- sync serialization and queueing,
- menu command orchestration,
- file-backed registry persistence,
- native runtime command dispatch.

The optional SDK-facing module is scaffolded:

```text
src/addon/ArchicadAddonMain.cpp
src/addon/ResourceIds.hpp
src/addon/NativeRuntimeFactory.cpp
src/archicad_adapter/ArchicadSdkAdapters.cpp
```

Menu commands route into `NativeRuntime`. The selection adapter has started using the Archicad C++ API pattern:

```text
ACAPI_Selection_Get(...)
ACAPI_Element_GetHeader(...)
```

The remaining SDK adapters are still placeholders:

- `ArchicadElementPropertyWriter`
- `ArchicadElementExistenceChecker`
- `ArchicadHighlightController`
- `LocalPythonListenerClient`

### 39.2 Python Listener Implemented

The local listener exists under:

```text
python_listener/
```

Implemented endpoints:

```text
GET  /health
GET  /tasks
POST /events/assembly-created
POST /events/assembly-updated
POST /events/assembly-validated
GET  /commands/pending
POST /commands/ack
```

The listener uses FastAPI, Pydantic, and SQLite-backed storage. Tests are in:

```text
python_listener/tests/test_events.py
```

### 39.3 Existing Connector/Web Integration

The existing Archicad bridge and web preview now understand optional BuildSync assembly metadata.

Updated paths:

```text
scripts/dev/archicad_bridge.py
services/connector/src/connector/snapshot_filter.py
apps/web/src/lib/companion-client.ts
apps/web/src/app/integrations/archicad/page.tsx
shared/examples/sample_archicad_snapshot.json
```

The bridge can read `BuildSync/BS_*` properties into element snapshot payloads as:

```json
{
  "buildsync_assembly": {
    "assembly_uuid": "uuid",
    "assembly_id": "JN-014",
    "name": "Kitchen Island",
    "type": "Joinery",
    "role": "Benchtop",
    "version": 1,
    "task_id": "TASK-240",
    "trade": "Joinery",
    "status": "active"
  }
}
```

The bridge/client path also supports allowlisted `BS_*` property writes for development validation.

### 39.4 Build and Verification Commands

Use this command for the SDK-free native test suite:

```powershell
npm run buildsync:native:test
```

Expected result at handoff:

```text
4/4 native tests passed
```

Use this command for Python tests:

```powershell
python -m pytest services/connector/tests python_listener/tests
```

Expected result at handoff:

```text
50 passed
```

Once the Archicad C++ API Development Kit is installed and `ARCHICAD_SDK_ROOT` is set:

```powershell
npm run buildsync:native:sdk
```

The SDK build expects:

```text
%ARCHICAD_SDK_ROOT%\Support\Inc\ACAPinc.h
%ARCHICAD_SDK_ROOT%\Support\Inc\APIEnvir.h
```

More details are in:

```text
docs/runbooks/buildsync_archicad_sdk_setup.md
docs/runbooks/buildsync_assembly_manual_validation.md
```

### 39.5 Current Blocker

Archicad 28 is installed locally, but the Archicad C++ API Development Kit headers were not found in the Graphisoft install folders.

Missing at handoff:

```text
ACAPinc.h
APIEnvir.h
```

The optional `.apx` target cannot be compiled until the API Development Kit is downloaded/extracted and `ARCHICAD_SDK_ROOT` points to it.

### 39.6 Next Agent Tasks

After SDK headers are available:

1. Run:

```powershell
npm run buildsync:native:sdk
```

2. Fix any compile errors in:

```text
buildsync-archicad-addon/src/archicad_adapter/ArchicadSdkAdapters.cpp
buildsync-archicad-addon/src/addon/ArchicadAddonMain.cpp
```

3. Add Archicad resource files for:

```text
Add-on name and description
BuildSync menu labels
BuildSync menu prompt strings
```

4. Implement SDK-backed:

```text
ElementPropertyWriter
- ensure BuildSync property group exists or report a clear error
- write BS_AssemblyID, BS_AssemblyUUID, BS_AssemblyName, BS_AssemblyType, BS_AssemblyRole, BS_AssemblyVersion, BS_TaskID, BS_Trade, BS_Status
- clear those fields on remove

ElementExistenceChecker
- check whether stored member GUIDs still exist in the open model

HighlightController
- select all live member GUIDs in Archicad

LocalPythonListenerClient
- GET /health
- POST /events/assembly-created
- POST /events/assembly-updated
- POST /events/assembly-validated
```

5. Replace the temporary `defaultCreateAssemblyRequest()` in:

```text
buildsync-archicad-addon/src/addon/NativeRuntimeFactory.cpp
```

with either:

- a small Archicad dialog for name/type/zone/level/trade/task ID, or
- settings-backed defaults for the next thin vertical slice.

6. Run manual validation:

```text
docs/runbooks/buildsync_assembly_manual_validation.md
```

Do not implement mirror detection, component definition inheritance, scheduler UI, procurement, or MCP runtime operations before the basic Archicad create/select/validate/sync workflow is working.
