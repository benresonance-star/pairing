# Archicad Driven Instance System
## Core Architecture Specification
Version: 0.3
Status: Foundation Architecture with SDK-observed slab propagation rules
Target: Archicad C++ Add-On
Primary Goal: Robust definition-driven instancing for native Archicad elements

---

# 1. Purpose

This specification defines a robust instance/component architecture for an Archicad C++ add-on.

The system enables:

- Multiple linked assembly instances
- Stable propagation of edits
- Canonical local coordinate-space geometry
- Persistent identity independent of Archicad GUIDs
- Deterministic regeneration
- Drift detection and reconciliation
- Instance deletion without destroying definitions
- Regeneration of missing geometry
- Future nested assemblies and semantic constraints

The architecture behaves conceptually similarly to:

- SketchUp Components
- Fusion Components / Occurrences
- Unreal Engine Prefabs
- Revit Families

However, this system is implemented as a governed semantic wrapper around native Archicad elements.

---

# 2. Core Philosophy

## 2.1 Archicad Geometry Is Not the Source of Truth

Native Archicad elements are considered:

```text
realized/generated state
```

They are NOT canonical truth.

The true source of truth is:

```text
AssemblyDefinition
```

stored independently from the Archicad model geometry.

---

# 3. Fundamental Principles

## 3.1 There Is No Master Instance

The first placed assembly is NOT special.

This is invalid:

```text
Original Object
    └── Child Copies
```

Correct structure:

```text
AssemblyDefinition
    ├── Instance A
    ├── Instance B
    ├── Instance C
    └── Instance D
```

All instances are peers.

Deleting any instance must not affect the definition or remaining instances.

---

## 3.2 Local Space Is Canonical

All definition geometry exists in canonical local space.

World coordinates are never canonical truth.

Current implementation note:

- slab `API_ElementMemo.coords` are treated as Archicad plan/world XY coordinates based on Graphisoft SDK polygon-edit examples,
- `ACAPI_Element_ChangeMemo` applies the replacement polygon to the target slab/roof,
- BuildSync must therefore convert edited world polygon coordinates into definition-local coordinates before regenerating each source/instance placement,
- any path that copies a source slab's current world memo directly into another placement violates this invariant and can create overlapping slabs at the source location,
- observed Archicad behavior can still snap a slab `ChangeMemo` result toward the edited/source placement even when the target GUID is preserved, so slab propagation must re-read bounds after the SDK call and perform a measured correction through another memo write rather than relying on an Archicad drag command.

---

## 3.3 Realized Geometry Must Be Disposable

Any Archicad geometry must be regeneratable from:

```text
Definition
+
Instance Transform
+
Overrides
```

---

## 3.4 Stable Identity Is Mandatory

Archicad GUIDs are NOT stable identity.

Every logical child element requires:

```cpp
UUID localElementId;
```

that survives:

- copy
- mirror
- regeneration
- rebinding
- undo/redo
- deletion/recreation

---

# 4. System Architecture

```text
Assembly Definition Registry
│
├── Definitions
│   ├── Local Coordinate Space
│   ├── Semantic Geometry
│   ├── Stable Child IDs
│   ├── Constraints
│   └── Relationships
│
├── Instances
│   ├── Instance Transform
│   ├── Overrides
│   ├── Status
│   └── Bindings
│
├── Realization Engine
│   ├── Create
│   ├── Update
│   ├── Delete
│   ├── Rebind
│   └── Regenerate
│
├── Synchronization Engine
│   ├── Local ↔ World conversion
│   ├── Drift detection
│   ├── Conflict handling
│   └── Propagation
│
└── Persistence Layer
    ├── Definition Storage
    ├── Instance Storage
    └── Metadata Registry
```

---

# 5. Mathematical Foundation

## 5.1 Core Invariant

```text
WorldGeometry = InstanceTransform × LocalDefinitionGeometry
```

This must always be true.

---

## 5.2 Reverse Mapping

When an instance is edited:

```text
LocalDefinitionGeometry
=
Inverse(InstanceTransform)
×
EditedWorldGeometry
```

The edited geometry must first be transformed back into definition space before propagation.

---

# 6. Coordinate Systems

## 6.1 Definition Coordinate Space

Each definition owns a canonical coordinate frame.

Example:

```cpp
struct CoordinateFrame
{
    Vec3 origin;

    Vec3 xAxis;

    Vec3 yAxis;

    Vec3 zAxis;
};
```

All local geometry is authored relative to this frame.

---

## 6.2 World Coordinate Space

Archicad operates in world space.

Instances map local geometry into world space through transforms.

---

# 7. Definition Layer

## 7.1 Purpose

The definition is the canonical abstract assembly.

It exists independently from:

- Archicad geometry
- instance placement
- user copies
- realization state

Deleting all instances must NOT destroy the definition.

---

## 7.2 Definition Structure

```cpp
struct AssemblyDefinition
{
    UUID definitionId;

    CoordinateFrame localFrame;

    std::vector<LocalElement> elements;

    ConstraintGraph constraints;

    Version version;

    Metadata metadata;
};
```

---

# 8. Local Elements

## 8.1 Purpose

Represents semantic geometry in canonical local space.

---

## 8.2 Structure

```cpp
struct LocalElement
{
    UUID localElementId;

    ElementType type;

    LocalTransform transform;

    ParametricData params;

    RelationshipData relationships;
};
```

---

## 8.3 Semantic Geometry Requirement

Store semantic geometry.

Correct:

```text
Wall:
start = (0,0,0)
end   = (4000,0,0)
```

Incorrect:

```text
Mesh vertices only
```

Preferred semantic types:

- walls
- slabs
- beams
- columns
- openings
- hosted objects

---

# 9. Host Relationships

Hosted elements must use semantic relationships.

Incorrect:

```text
Window = absolute XYZ
```

Correct:

```text
Host Wall = localWall_001
Offset Along Wall = 1200
Offset Height = 900
```

---

# 10. Instance Layer

## 10.1 Purpose

Instances represent placements of a definition.

---

## 10.2 Structure

```cpp
struct AssemblyInstance
{
    UUID instanceId;

    UUID definitionId;

    Matrix4x4 transform;

    OverrideSet overrides;

    std::vector<ElementBinding> bindings;

    InstanceStatus status;
};
```

---

# 11. Instance Transform Rules

## 11.1 Allowed Initially

- translation
- rotation
- mirror
- elevation offset

---

## 11.2 Excluded Initially

- non-uniform scaling
- skew
- deformation transforms

---

# 12. Transform Engine

## 12.1 Purpose

Handles all local ↔ world mapping.

---

## 12.2 Required Functions

```cpp
Matrix4x4 ComposeTransforms();

Matrix4x4 InvertTransform();

Vec3 LocalToWorld();

Vec3 WorldToLocal();

Plane TransformPlane();

Vector TransformVector();
```

---

# 13. Realization Layer

## 13.1 Purpose

Responsible for creating and updating Archicad geometry.

Realized geometry is disposable and regeneratable.

---

## 13.2 Binding Structure

```cpp
struct ElementBinding
{
    UUID localElementId;

    API_Guid archicadGuid;

    Hash geometryHash;
};
```

---

## 13.3 Responsibilities

| Responsibility | Description |
|---|---|
| Create | Generate missing Archicad elements |
| Update | Push definition changes |
| Delete | Remove orphaned geometry |
| Rebind | Restore broken mappings |
| Validate | Ensure integrity |

---

# 14. Synchronization Engine

## 14.1 Purpose

Maintains consistency between:

- definitions
- instances
- Archicad geometry

---

## 14.2 Propagation Workflow

```text
User edits instance
    ↓
Detect modified Archicad elements
    ↓
Resolve owning instance
    ↓
Convert world geometry → local geometry
    ↓
Update canonical definition
    ↓
Increment definition version
    ↓
Regenerate all instances
```

## 14.3 SDK-Observed Slab Propagation Rule

For slabs, propagation must not assume that `ACAPI_Element_ChangeMemo` leaves the polygon at the coordinates supplied in the memo. Current testing has shown this sequence can preserve the target GUID while landing the polygon at the edited/source placement bounds.

Required slab update sequence:

```text
Read target placement binding and live bounds
    ↓
Build replacement memo from definition-local polygon in the target placement frame
    ↓
Apply ACAPI_Element_ChangeMemo to the target slab GUID
    ↓
Re-read target bounds
    ↓
If bounds differ from expected placement bounds:
    translate the same memo by the measured error
    apply ACAPI_Element_ChangeMemo again
    re-read and verify final bounds
```

The correction path must be memo-based for slabs. Do not use an `APIEdit_Drag` correction as the authoritative fix for slab polygon propagation; observed failures left the slab at the snapped bounds even after the drag operation returned through the adapter path.

The survivor is the registry-bound target GUID when it still exists and has the expected BuildSync identity. Replacement-with-delete paths are fallback only and must clean stale originals by identity and bounds validation.

---

# 15. Drift Detection

## 15.1 Purpose

Detects divergence between:

- expected realized geometry
- actual Archicad geometry

---

## 15.2 Drift Categories

| Category | Meaning |
|---|---|
| Clean | Matches definition |
| Override | Allowed local variation |
| Drifted | Unauthorized change |
| Broken | Missing or invalid binding |
| Detached | No longer linked |

---

# 16. Overrides

## 16.1 Purpose

Allow local deviations without severing linkage.

Examples:

- material
- layer
- visibility
- metadata
- selected dimensions

---

## 16.2 Structure

```cpp
struct OverrideSet
{
    std::optional<MaterialOverride> material;

    std::optional<LayerOverride> layer;

    std::map<UUID, ElementOverride> elementOverrides;
};
```

---

# 17. Persistence Layer

## 17.1 Requirements

Definitions and instances must survive:

- save/reopen
- teamwork
- undo/redo
- regeneration
- instance deletion

---

## 17.2 Recommended Storage

Preferred:

```text
Hybrid Approach
├── Add-on project storage
├── JSON serialization
└── Optional SQLite backing store
```

---

# 18. Deletion Rules

## 18.1 Critical Rule

Deleting an instance must NOT delete the definition.

Deleting all instances must NOT delete the definition unless explicitly purged.

---

## 18.2 Geometry Deletion

Deleting realized Archicad elements:

- must not destroy instance data
- must not destroy definition data

The system should allow regeneration.

---

# 19. Regeneration Rules

All realized geometry must be regeneratable from:

```text
Definition
+
Instance Transform
+
Overrides
```

only.

No hidden dependency on prior geometry state is permitted.

## 19.1 Edited Placement Guard

When edits are applied from any linked placement, the edited placement's selected BuildSync-owned member GUIDs are protected for that apply operation. The edited placement is reconciled in place, while other linked placements are regenerated or updated into their own live local frames.

Required behavior:

- the edited placement's matched member GUID is updated in place and must not be duplicated over itself,
- other placements receive the canonical local definition geometry transformed into their own live placement frame,
- placement bindings are refreshed after propagation so a subsequent edit starts from current GUIDs and bounds,
- duplicate cleanup must prefer BuildSync identity and placement/component IDs over geometric guesses.

---

# 20. Numerical Stability

## 20.1 Requirement

Never compare floating point values directly.

---

## 20.2 Use Tolerances

Required tolerance categories:

| Use Case | Tolerance |
|---|---|
| Point comparison | epsilon |
| Rotation comparison | angular epsilon |
| Plane comparison | plane epsilon |
| Mirror detection | determinant epsilon |

---

# 21. Forbidden Architecture

The following are forbidden:

- World coordinates as canonical truth
- GUIDs as logical identity
- Instance-to-instance propagation
- Realized geometry as authoritative state
- Incremental transform accumulation drift
- Geometry-only identity inference

---

# 22. Required Invariants

These invariants must always remain true.

| Invariant | Description |
|---|---|
| Definition independence | Definitions survive deletion |
| Stable local IDs | Identity persists forever |
| Deterministic regeneration | Same inputs produce same outputs |
| Transform reversibility | Local ↔ world conversion valid |
| Instance peer equality | No privileged instance |
| Geometry disposability | Realization may be rebuilt |

---

# 23. MVP Scope

## 23.1 Included

- walls
- slabs
- beams
- rigid transforms
- linked propagation
- deterministic regeneration
- stable local identity
- local coordinate systems

---

## 23.2 Excluded Initially

- nested assemblies
- advanced parametric constraints
- collaborative conflict resolution
- arbitrary topology editing
- non-uniform scaling

---

# 24. Recommended Development Sequence

## Phase 1 — Kernel

Implement:

- definition registry
- stable IDs
- local coordinate system
- transform math library

Do NOT build UI first.

---

## Phase 2 — Realization

Implement:

- instance creation
- geometry realization
- binding system
- deterministic regeneration

---

## Phase 3 — Synchronization

Implement:

- propagation
- world ↔ local conversion
- drift detection
- reconciliation

---

## Phase 4 — UX

Implement:

- editing workflows
- override controls
- repair tools
- visualization

---

## Phase 5 — Advanced Systems

Implement:

- nested assemblies
- semantic constraints
- graph relationships
- partial regeneration
- performance optimization

---

# 25. Long-Term Direction

This system evolves toward:

```text
Assembly Kernel
+
Scene Graph
+
Constraint Engine
+
Semantic BIM Layer
```

inside Archicad.

It is NOT merely a copy/link system.

It is a semantic governed assembly architecture capable of supporting:

- reusable construction systems
- modular assemblies
- prefab workflows
- parametric architectural systems
- semantic relationships
- future AI-assisted assembly generation

---

# 26. Engineering Recommendation

The most important subsystem is:

```text
Definition Registry
+
Transform Engine
+
Stable Identity Layer
```

If these are robust:

- propagation becomes manageable
- regeneration becomes deterministic
- synchronization becomes stable

If these are weak:

- drift accumulates
- bindings fail
- propagation becomes unreliable
- the system eventually collapses under complexity

Build the kernel first.
