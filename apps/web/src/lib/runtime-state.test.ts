import test from "node:test";
import assert from "node:assert/strict";

import {
  assertValidPackageAssignment,
  baselineScenarioId,
  createGovernedOperationalChangeSet,
  getScenarioById,
  normalizeRuntimeState,
  operationalFor,
  requireActiveScenario,
  transitionChangeSet
} from "./runtime-state";


function buildState() {
  return normalizeRuntimeState({
    project: {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Demo Tower A",
      archicad_project_id: "ARCHICAD-DEMO-TOWER-A"
    },
    work_packages: [
      { id: "pkg-1", package_id: "PKG-ZONE-L08", active: true },
      { id: "pkg-2", package_id: "PKG-WALL-FACADE-02", active: true }
    ],
    scenarios: [{ id: "scenario-1", name: "Baseline", status: "baseline" }],
    zones: [{ id: "zone-1", zone_key: "L08:APT-0803", archicad_guid: "ZONE-1" }],
    model_objects: [{ id: "object-1", archicad_guid: "WALL-1" }],
    hotlink_instances: [],
    operational_state: [
      {
        id: "op-1",
        scenario_id: "scenario-1",
        object_ref_type: "zone",
        object_ref_id: "zone-1",
        package_id: null,
        construction_state: "ready"
      }
    ],
    change_sets: [
      {
        id: "change-set-1",
        project_id: "11111111-1111-1111-1111-111111111111",
        scenario_id: "scenario-1",
        title: "Draft package assignment",
        status: "draft"
      }
    ],
    change_set_items: [
      {
        id: "item-1",
        change_set_id: "change-set-1",
        object_ref_type: "zone",
        object_ref_id: "zone-1",
        field_name: "package_id",
        new_value_json: "PKG-ZONE-L08"
      }
    ],
    approvals: [],
    sync_runs: [],
    audit_events: [],
    archicad_writes: [],
    location_axes: [],
    linear_schedule_views: [],
    linear_schedule_activities: [],
    linear_progress_points: []
  });
}


test("transitionChangeSet rejects invalid transitions", () => {
  const state = buildState();

  assert.throws(
    () => transitionChangeSet(state, "change-set-1", "approve"),
    /Cannot 'approve' a change set while it is 'draft'/
  );
});


test("transitionChangeSet enforces item presence", () => {
  const state = buildState();
  state.change_set_items = [];

  assert.throws(
    () => transitionChangeSet(state, "change-set-1", "submit"),
    /must contain at least one item/
  );
});


test("assertValidPackageAssignment rejects duplicate package selection", () => {
  const state = buildState();
  state.operational_state[0].package_id = "PKG-ZONE-L08";

  assert.throws(
    () => assertValidPackageAssignment(state, "zone", "zone-1", "PKG-ZONE-L08"),
    /already has package/
  );
});


test("assertValidPackageAssignment rejects unknown package IDs", () => {
  const state = buildState();

  assert.throws(
    () => assertValidPackageAssignment(state, "zone", "zone-1", "PKG-UNKNOWN"),
    /is not available/
  );
});


test("baselineScenarioId resolves the scenario with baseline status", () => {
  const state = buildState();
  state.scenarios = [
    { id: "scenario-2", name: "Recovery", status: "draft" },
    { id: "scenario-1", name: "Baseline", status: "baseline" }
  ];

  assert.equal(baselineScenarioId(state), "scenario-1");
  assert.equal(requireActiveScenario(state).id, "scenario-1");
  assert.equal(getScenarioById(state, "scenario-2").name, "Recovery");
});


test("operationalFor can resolve non-baseline scenario state explicitly", () => {
  const state = buildState();
  state.scenarios.push({ id: "scenario-2", name: "Recovery", status: "draft" });
  state.operational_state.push({
    id: "op-2",
    scenario_id: "scenario-2",
    object_ref_type: "zone",
    object_ref_id: "zone-1",
    package_id: "PKG-WALL-FACADE-02",
    construction_state: "blocked"
  });

  assert.equal(operationalFor(state, "zone", "zone-1")?.scenario_id, "scenario-1");
  assert.equal(operationalFor(state, "zone", "zone-1", "scenario-2")?.scenario_id, "scenario-2");
});


test("createGovernedOperationalChangeSet stages operational diffs without mutating the row", () => {
  const state = buildState();

  const result = createGovernedOperationalChangeSet(state, {
    scenarioId: "scenario-1",
    operationalRowId: "op-1",
    patch: {
      packageId: "PKG-WALL-FACADE-02",
      constructionState: "in_progress",
      plannedStart: "2026-05-01",
      plannedFinish: "2026-05-10"
    }
  });

  const changeSet = state.change_sets.find((item) => item.id === result.changeSetId);
  const items = state.change_set_items.filter((item) => item.change_set_id === result.changeSetId);

  assert.equal(result.itemCount, 4);
  assert.equal(changeSet?.scenario_id, "scenario-1");
  assert.equal(changeSet?.status, "draft");
  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((item) => item.field_name).sort(),
    ["construction_state", "package_id", "planned_finish", "planned_start"]
  );
  assert.equal(items.find((item) => item.field_name === "package_id")?.old_value_json, null);
  assert.equal(items.find((item) => item.field_name === "package_id")?.new_value_json, "PKG-WALL-FACADE-02");
  assert.equal(state.operational_state[0].package_id, null);
  assert.equal(state.operational_state[0].construction_state, "ready");
});


test("createGovernedOperationalChangeSet rejects no-op submissions", () => {
  const state = buildState();

  assert.throws(
    () =>
      createGovernedOperationalChangeSet(state, {
        scenarioId: "scenario-1",
        operationalRowId: "op-1",
        patch: {
          constructionState: "ready"
        }
      }),
    /No operational changes were made/
  );
});


test("createGovernedOperationalChangeSet validates package and date changes", () => {
  const state = buildState();

  assert.throws(
    () =>
      createGovernedOperationalChangeSet(state, {
        scenarioId: "scenario-1",
        operationalRowId: "op-1",
        patch: {
          packageId: "PKG-UNKNOWN"
        }
      }),
    /does not exist/
  );

  assert.throws(
    () =>
      createGovernedOperationalChangeSet(state, {
        scenarioId: "scenario-1",
        operationalRowId: "op-1",
        patch: {
          plannedStart: "2026-05-10",
          plannedFinish: "2026-05-01"
        }
      }),
    /Planned finish/
  );
});
