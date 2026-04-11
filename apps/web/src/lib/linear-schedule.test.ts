import test from "node:test";
import assert from "node:assert/strict";

import { buildLinearScheduleData } from "./linear-schedule";
import { normalizeRuntimeState } from "./runtime-state";


function buildState() {
  return normalizeRuntimeState({
    project: {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Mews Lane Townhouses",
      archicad_project_id: "ARCHICAD-MEWS-LANE-TOWNHOUSES"
    },
    work_packages: [
      {
        id: "pkg-1",
        package_id: "PKG-STRUCTURE",
        package_name: "Townhouse structure package",
        workfront: "Structure Crew",
        active: true
      },
      {
        id: "pkg-2",
        package_id: "PKG-COMMISSIONING",
        package_name: "Commissioning package",
        workfront: "Commissioning Team",
        active: true
      }
    ],
    scenarios: [
      { id: "scenario-1", name: "Baseline", status: "baseline" },
      { id: "scenario-2", name: "Recovery", status: "draft" }
    ],
    zones: [],
    model_objects: [],
    hotlink_instances: [],
    operational_state: [],
    change_sets: [],
    change_set_items: [],
    approvals: [],
    sync_runs: [],
    audit_events: [],
    archicad_writes: [],
    location_axes: [
      {
        id: "axis-1",
        project_id: "11111111-1111-1111-1111-111111111111",
        name: "Townhouse Lot Progression",
        location_reference_model: "named_segments",
        units_label: "Townhouse",
        orientation_default: "time_horizontal",
        locations_json: [
          { id: "b", label: "TH-02", order: 2 },
          { id: "a", label: "TH-01", order: 1 }
        ]
      }
    ],
    linear_schedule_views: [
      {
        id: "view-1",
        project_id: "11111111-1111-1111-1111-111111111111",
        scenario_id: "scenario-1",
        location_axis_id: "axis-1",
        name: "Townhouse Delivery Sequence",
        time_axis_start: "2026-05-01",
        time_axis_finish: "2026-06-01",
        orientation: "time_horizontal",
        metadata_json: {
          flow_diagram: {
            nodes: [
              {
                id: "frame-flow",
                label: "Frame Flow",
                stage_keys: ["frame"],
                sub_items: ["Townhouse frame sequence"],
                x: 20,
                y: 24,
                width: 150
              },
              {
                id: "fitoff",
                label: "Fit-Off",
                stage_keys: ["fitoff"],
                sub_items: ["Final commissioning"],
                x: 220,
                y: 24,
                width: 150
              }
            ],
            edges: [{ from: "frame-flow", to: "fitoff" }]
          },
          gantt_hierarchy: {
            nodes: [
              {
                id: "structure-subtask",
                label: "Structural frame",
                package_id: "PKG-STRUCTURE",
                parent_id: "package:PKG-STRUCTURE",
                hierarchy_level: "subtask"
              },
              {
                id: "structure-task",
                label: "Ground floor framing",
                package_id: "PKG-STRUCTURE",
                parent_id: "structure-subtask",
                hierarchy_level: "task"
              },
              {
                id: "commissioning-subtask",
                label: "Completion",
                package_id: "PKG-COMMISSIONING",
                parent_id: "package:PKG-COMMISSIONING",
                hierarchy_level: "subtask"
              },
              {
                id: "commissioning-task",
                label: "Practical completion",
                package_id: "PKG-COMMISSIONING",
                parent_id: "commissioning-subtask",
                hierarchy_level: "task"
              }
            ],
            activity_links: [
              { node_id: "structure-task", stage_keys: ["frame"] },
              { node_id: "commissioning-task", stage_keys: ["fitoff"] }
            ]
          }
        }
      }
    ],
    linear_schedule_activities: [
      {
        id: "act-1",
        linear_schedule_view_id: "view-1",
        scenario_id: "scenario-1",
        package_id: "PKG-STRUCTURE",
        workfront: "Structure Crew",
        activity_name: "Frame TH-01 to TH-02",
        activity_type: "linear",
        display_layer: "planned",
        start_date: "2026-05-01",
        finish_date: "2026-05-20",
        start_location_ref: "a",
        finish_location_ref: "b",
        metadata_json: {
          label: "Frame flow",
          stage_key: "frame"
        }
      },
      {
        id: "act-2",
        linear_schedule_view_id: "view-1",
        scenario_id: "scenario-1",
        package_id: "PKG-COMMISSIONING",
        workfront: "Commissioning Team",
        activity_name: "Practical completion",
        activity_type: "milestone",
        display_layer: "remaining",
        start_date: "2026-05-25",
        finish_date: "2026-05-25",
        location_ref: "b",
        metadata_json: {
          label: "Completion",
          stage_key: "fitoff"
        }
      },
      {
        id: "act-3",
        linear_schedule_view_id: "view-1",
        scenario_id: "scenario-2",
        package_id: "PKG-STRUCTURE",
        workfront: "Structure Crew",
        activity_name: "Recovery frame flow",
        activity_type: "block",
        display_layer: "planned",
        start_date: "2026-05-12",
        finish_date: "2026-05-18",
        start_location_ref: "a",
        finish_location_ref: "b",
        metadata_json: {
          label: "Recovery frame",
          stage_key: "frame"
        }
      }
    ],
    linear_progress_points: [
      {
        id: "point-1",
        linear_schedule_activity_id: "act-1",
        progress_date: "2026-05-10",
        location_ref: "a"
      },
      {
        id: "point-2",
        linear_schedule_activity_id: "act-3",
        progress_date: "2026-05-14",
        location_ref: "b"
      }
    ]
  });
}


test("buildLinearScheduleData sorts locations by order", () => {
  const data = buildLinearScheduleData(buildState());

  assert.equal(data.axis.locations[0].id, "a");
  assert.equal(data.axis.locations[1].id, "b");
  assert.equal(data.packages[0].id, "PKG-STRUCTURE");
  assert.equal(data.workfronts[0].id, "Commissioning Team");
  assert.equal(data.activities[0].displayLabel, "Frame flow");
  assert.equal(data.flow.nodes[0].activityIds[0], "act-1");
});


test("buildLinearScheduleData filters by package and activity type", () => {
  const data = buildLinearScheduleData(buildState(), {
    packageIds: ["PKG-STRUCTURE"],
    activityType: "linear"
  });

  assert.equal(data.activities.length, 1);
  assert.equal(data.activities[0].id, "act-1");
  assert.equal(data.progressPoints.length, 1);
});


test("buildLinearScheduleData filters by multiple packages", () => {
  const data = buildLinearScheduleData(buildState(), {
    packageIds: ["PKG-STRUCTURE", "PKG-COMMISSIONING"]
  });

  assert.equal(data.activities.length, 3);
});


test("buildLinearScheduleData filters by scenario and keeps matching progress points", () => {
  const data = buildLinearScheduleData(buildState(), {
    scenarioId: "scenario-2"
  });

  assert.equal(data.activities.length, 1);
  assert.equal(data.activities[0].id, "act-3");
  assert.equal(data.progressPoints.length, 1);
  assert.equal(data.progressPoints[0].linearScheduleActivityId, "act-3");
});


test("buildLinearScheduleData prefers a matching schedule view for the selected scenario", () => {
  const state = buildState();
  state.linear_schedule_views.push({
    id: "view-2",
    project_id: "11111111-1111-1111-1111-111111111111",
    scenario_id: "scenario-2",
    location_axis_id: "axis-1",
    name: "Recovery Delivery Sequence",
    time_axis_start: "2026-05-10",
    time_axis_finish: "2026-06-10",
    orientation: "time_horizontal",
    metadata_json: {}
  });
  state.linear_schedule_activities[2].linear_schedule_view_id = "view-2";

  const data = buildLinearScheduleData(state, {
    scenarioId: "scenario-2"
  });

  assert.equal(data.view.id, "view-2");
  assert.equal(data.activities[0].id, "act-3");
});

test("buildLinearScheduleData expands the visible window to include activity dates outside the saved view range", () => {
  const state = buildState();
  state.linear_schedule_activities.push({
    id: "act-4",
    linear_schedule_view_id: "view-1",
    scenario_id: "scenario-1",
    package_id: "PKG-STRUCTURE",
    workfront: "Structure Crew",
    activity_name: "Fishing",
    activity_type: "bar",
    display_layer: "baseline",
    start_date: "2026-06-20",
    finish_date: "2026-07-12",
    location_ref: "a",
    metadata_json: {
      label: "Fishing"
    }
  });

  const data = buildLinearScheduleData(state, {
    scenarioId: "scenario-1"
  });

  assert.equal(data.view.timeAxisStart, "2026-05-01");
  assert.equal(data.view.timeAxisFinish, "2026-07-12");
  assert.equal(data.activities.some((activity) => activity.activityName === "Fishing"), true);
});


test("buildLinearScheduleData derives gantt rows and progress lookup", () => {
  const data = buildLinearScheduleData(buildState());

  assert.equal(data.ganttRows.length, 9);
  assert.equal(data.ganttRows[0].id, "package:PKG-STRUCTURE");
  assert.equal(data.ganttRows[1].id, "structure-subtask");
  assert.equal(data.ganttRows[2].id, "structure-task");
  assert.equal(data.ganttRows[3].activityId, "act-1");
  assert.equal(data.ganttRows[3].parentId, "structure-task");
  assert.equal(data.ganttRows[4].activityId, "act-3");
  assert.equal(data.ganttRows[5].id, "package:PKG-COMMISSIONING");
  assert.equal(data.ganttRows[5].rowKind, "summary");
  assert.equal(data.ganttRows[8].activityId, "act-2");
  assert.equal(data.progressByActivityId["act-1"].length, 1);
  assert.equal(data.progressByActivityId["act-2"].length, 0);
  assert.equal(data.flow.edges[0].to, "fitoff");
});
