# Gantt WBS CRUD Future Action Specification

## 1. Status

Future action plan. This spec records a deferred implementation path for CRUD-modifying the work breakdown structure directly from the Gantt scheduling section.

## 2. Purpose

Define how the Gantt scheduling section should support work breakdown structure (WBS) and activity CRUD without introducing a second schedule data model.

The implementation should reuse the existing scenario programme editor actions, store helpers, and `LinearScheduleData` derivation so the Gantt, WBS table, and linear schedule stay consistent.

---

## 3. Current Behavior

Today, work breakdown changes are made in the Scenario Editor, not directly in the SVG Gantt chart.

- The editable UI is `ProgrammeWorkspace` in `apps/web/src/app/scenarios/[scenarioId]/page.tsx`.
- WBS summary rows can be created, renamed, moved up/down, indented/outdented, and deleted through server-action forms.
- Activity rows can be created, renamed, assigned to a package, dated, assigned a workfront, inspected, updated, and deleted.
- Dependencies can be created/deleted as finish-to-start links.
- The visual Gantt in `apps/web/src/app/linear-schedule/schedule-client.tsx` is read-only for schedule data. It supports selection, hover, expand/collapse, pan/zoom, and column resizing only.

The relevant current boundary is:

```tsx
function ProgrammeWorkspace(props: {
  scenarioId: string;
  data: LinearScheduleData;
  selectedActivityId: string | null;
  selectedOperationalId: string | null;
}) {
  const { scenarioId, data, selectedActivityId, selectedOperationalId } = props;
  const summaryRows = data.ganttRows.filter((row) => row.rowKind === "summary");
  const editableSummaryRows = summaryRows.filter((row) => !row.id.startsWith("package:"));
  const activityById = new Map(data.activities.map((activity) => [activity.id, activity]));
```

---

## 4. Data Model

The WBS is split across two sources:

- Summary WBS nodes live in `linear_schedule_views[].metadata_json.gantt_hierarchy.nodes`.
- Leaf task/activity rows live in `linear_schedule_activities`.

`apps/web/src/lib/linear-schedule.ts` merges both sources into `data.ganttRows`, rolling up dates and activity IDs for each summary row. Package roots such as `package:<packageId>` are synthetic and should not be directly edited.

Important derivation entry point:

```ts
const ganttHierarchy = readObject(viewMetadata?.gantt_hierarchy);
const sortedGanttActivities = [...activities].sort(compareGanttActivities);
const activityById = new Map(sortedGanttActivities.map((activity) => [activity.id, activity]));
const activityIdsByStageKey = new Map<string, string[]>();
```

---

## 5. Existing CRUD API To Reuse

Server actions in `apps/web/src/app/scenarios/[scenarioId]/schedule-actions.ts` already wrap the store layer:

- WBS create: `createGanttHierarchyNodeAction`
- WBS rename: `updateGanttHierarchyNodeAction`
- WBS reorder/reparent: `moveGanttHierarchyNodeAction`
- WBS delete: `deleteGanttHierarchyNodeAction`
- Activity create/update/delete: `createScheduleActivityAction`, `saveScheduleActivityAction`, `deleteScheduleActivityAction`
- Dependency create/delete: `createScheduleDependencyAction`, `deleteScheduleDependencyAction`

Persistence is handled in `apps/web/src/lib/demo-store.ts` and mirrored in `apps/web/src/lib/supabase-store.ts`.

Any direct Gantt implementation should call the same actions or store helpers so the programme table and chart remain consistent.

---

## 6. Implementation Plan

1. Keep `ProgrammeWorkspace` as the canonical form-first editor, but expose lightweight Gantt edit controls near the selected row in the scenario scheduling section.
2. Add explicit edit affordances to `LinearScheduleClient` only when embedded in a scenario editor and passed edit context. Standalone `/linear-schedule` should remain read-only.
3. For summary rows, support rename, create child WBS row, move up/down, indent/outdent, and delete by calling the existing WBS server actions.
4. For activity rows, support inline date/name/workfront/package edits or a compact selected-row drawer that submits to the existing activity actions.
5. For drag/resize date editing, translate pointer changes into new ISO dates and submit through `saveScheduleActivityAction`. Do not persist intermediate drag state until pointer-up.
6. After mutations, rely on `revalidateScenarioEditorPaths()` and URL-selected row state so the rebuilt `LinearScheduleData.ganttRows` reflects the persisted hierarchy/activity state.
7. Add focused tests around `buildLinearScheduleData` if new hierarchy link/reparent behavior is introduced. Add UI tests only around non-trivial new interaction logic.

---

## 7. Recommended First Slice

Start with non-drag CRUD in the scenario editor:

- Add selected-row action buttons or an edit drawer beside the embedded Gantt.
- Reuse existing server actions.
- Avoid chart drag/resize until create/update/delete are proven through the same persistence route.

Then add drag/resize as a second slice for activity date changes only.

---

## 8. Open Scope Decision

Before implementation, confirm whether direct Gantt CRUD should be available:

- only on embedded scenario editor Gantt views, or
- also on the standalone `/linear-schedule` page.

The recommended default is scenario editor only, keeping the standalone schedule page read-only.
