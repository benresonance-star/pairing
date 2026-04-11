import { randomUUID } from "node:crypto";

import { vocab } from "../../../../shared/contracts/api/index";

export type ObjectRefType = "zone" | "model_object";
export type ChangeSetAction = "submit" | "approve" | "queue";
export type ChangeSetStatus = (typeof vocab.changeSetStatuses)[number];

type RuntimeRecord = Record<string, unknown>;

export type RuntimeState = {
  project: { id: string; name: string; archicad_project_id: string };
  work_packages: Array<RuntimeRecord>;
  scenarios: Array<{ id: string; name: string; status: string }>;
  zones: Array<RuntimeRecord>;
  model_objects: Array<RuntimeRecord>;
  hotlink_instances: Array<RuntimeRecord>;
  operational_state: Array<RuntimeRecord>;
  change_sets: Array<RuntimeRecord>;
  change_set_items: Array<RuntimeRecord>;
  approvals: Array<RuntimeRecord>;
  sync_runs: Array<RuntimeRecord>;
  audit_events: Array<RuntimeRecord>;
  archicad_writes: Array<RuntimeRecord>;
  location_axes: Array<RuntimeRecord>;
  linear_schedule_views: Array<RuntimeRecord>;
  linear_schedule_activities: Array<RuntimeRecord>;
  linear_progress_points: Array<RuntimeRecord>;
};

const ARRAY_KEYS = [
  "work_packages",
  "scenarios",
  "zones",
  "model_objects",
  "hotlink_instances",
  "operational_state",
  "change_sets",
  "change_set_items",
  "approvals",
  "sync_runs",
  "audit_events",
  "archicad_writes",
  "location_axes",
  "linear_schedule_views",
  "linear_schedule_activities",
  "linear_progress_points"
] as const;

const ALLOWED_TRANSITIONS: Record<ChangeSetStatus, ChangeSetAction[]> = {
  draft: ["submit"],
  submitted: ["approve"],
  approved: ["queue"],
  rejected: [],
  queued_for_sync: [],
  synced: [],
  sync_failed: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} is missing required string field '${key}'`);
  }
  return value;
}

export function normalizeRuntimeState(raw: unknown): RuntimeState {
  if (!isRecord(raw)) {
    throw new Error("Runtime state must be an object");
  }

  const project = raw.project;
  if (!isRecord(project)) {
    throw new Error("Runtime state is missing a valid project block");
  }

  const arrayValues = Object.fromEntries(
    ARRAY_KEYS.map((key) => {
      const value = raw[key];
      if (!Array.isArray(value)) {
        throw new Error(`Runtime state key '${key}' must be an array`);
      }
      return [key, value];
    })
  ) as Record<(typeof ARRAY_KEYS)[number], RuntimeState[keyof Pick<RuntimeState,
    | "work_packages"
    | "scenarios"
    | "zones"
    | "model_objects"
    | "hotlink_instances"
    | "operational_state"
    | "change_sets"
    | "change_set_items"
    | "approvals"
    | "sync_runs"
    | "audit_events"
    | "archicad_writes"
    | "location_axes"
    | "linear_schedule_views"
    | "linear_schedule_activities"
    | "linear_progress_points"
  >]>;

  const state = {
    project: {
      id: stringField(project, "id", "project"),
      name: stringField(project, "name", "project"),
      archicad_project_id: stringField(project, "archicad_project_id", "project")
    },
    work_packages: arrayValues.work_packages,
    scenarios: arrayValues.scenarios as RuntimeState["scenarios"],
    zones: arrayValues.zones,
    model_objects: arrayValues.model_objects,
    hotlink_instances: arrayValues.hotlink_instances,
    operational_state: arrayValues.operational_state,
    change_sets: arrayValues.change_sets,
    change_set_items: arrayValues.change_set_items,
    approvals: arrayValues.approvals,
    sync_runs: arrayValues.sync_runs,
    audit_events: arrayValues.audit_events,
    archicad_writes: arrayValues.archicad_writes,
    location_axes: arrayValues.location_axes,
    linear_schedule_views: arrayValues.linear_schedule_views,
    linear_schedule_activities: arrayValues.linear_schedule_activities,
    linear_progress_points: arrayValues.linear_progress_points
  } as RuntimeState;

  if (state.scenarios.length === 0) {
    throw new Error("Runtime state must contain at least one scenario");
  }

  return state;
}

export function baselineScenarioId(state: RuntimeState): string {
  return stringField(state.scenarios[0], "id", "baseline scenario");
}

export function operationalFor(state: RuntimeState, objectRefType: ObjectRefType, objectRefId: string) {
  return state.operational_state.find(
    (item) =>
      item.scenario_id === baselineScenarioId(state) &&
      item.object_ref_type === objectRefType &&
      item.object_ref_id === objectRefId
  );
}

export function findObjectRef(state: RuntimeState, objectRefType: ObjectRefType, objectRefId: string) {
  const collection = objectRefType === "zone" ? state.zones : state.model_objects;
  return collection.find((item) => String(item.id) === objectRefId);
}

export function assertValidPackageAssignment(
  state: RuntimeState,
  objectRefType: ObjectRefType,
  objectRefId: string,
  packageId: string
): void {
  if (!packageId) {
    throw new Error("Package assignment requires a selected package");
  }

  const objectRef = findObjectRef(state, objectRefType, objectRefId);
  if (!objectRef) {
    throw new Error(`Target ${objectRefType} '${objectRefId}' was not found in runtime state`);
  }

  const packageExists = state.work_packages.some(
    (item) => item.active !== false && item.package_id === packageId
  );
  if (!packageExists) {
    throw new Error(`Package '${packageId}' is not available in the runtime state`);
  }

  const operational = operationalFor(state, objectRefType, objectRefId);
  if (operational?.package_id === packageId) {
    throw new Error(`Target ${objectRefType} already has package '${packageId}' assigned`);
  }
}

export function actionsForStatus(status: string): ChangeSetAction[] {
  if (!vocab.changeSetStatuses.includes(status as ChangeSetStatus)) {
    return [];
  }
  return ALLOWED_TRANSITIONS[status as ChangeSetStatus];
}

export function transitionChangeSet(
  state: RuntimeState,
  changeSetId: string,
  action: ChangeSetAction
): ChangeSetStatus {
  const changeSet = state.change_sets.find((item) => item.id === changeSetId);
  if (!changeSet) {
    throw new Error(`Change set '${changeSetId}' was not found`);
  }

  const currentStatus = String(changeSet.status) as ChangeSetStatus;
  const allowedActions = actionsForStatus(currentStatus);
  if (!allowedActions.includes(action)) {
    throw new Error(`Cannot '${action}' a change set while it is '${currentStatus}'`);
  }

  const items = state.change_set_items.filter((item) => item.change_set_id === changeSetId);
  if (items.length === 0) {
    throw new Error("Change set must contain at least one item before transition");
  }

  if (action === "submit") {
    changeSet.status = "submitted";
    changeSet.submitted_by = "demo.user@example.com";
    changeSet.submitted_at = new Date().toISOString();
    return "submitted";
  }

  if (action === "approve") {
    changeSet.status = "approved";
    state.approvals.push({
      id: randomUUID(),
      change_set_id: changeSetId,
      reviewer: "reviewer@example.com",
      decision: "approved",
      comment: "Approved for first-slice connector write-back",
      decided_at: new Date().toISOString()
    });
    return "approved";
  }

  changeSet.status = "queued_for_sync";
  changeSet.sync_errors = [];
  return "queued_for_sync";
}
