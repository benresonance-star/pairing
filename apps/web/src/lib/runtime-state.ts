import { randomUUID } from "node:crypto";

import { vocab } from "../../../../shared/contracts/api/index";

export type ObjectRefType = "zone" | "model_object";
export type ChangeSetAction = "submit" | "approve" | "queue";
export type ChangeSetStatus = (typeof vocab.changeSetStatuses)[number];
export type GovernedOperationalPatch = {
  packageId?: string | null;
  constructionState?: string | null;
  sequenceGroup?: string | null;
  sequenceOrder?: number | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  actualStart?: string | null;
  actualFinish?: string | null;
};

export type GovernedOperationalChangeSetResult = {
  changeSetId: string;
  targetLabel: string;
  itemCount: number;
};

type RuntimeRecord = Record<string, unknown>;

export type RuntimeState = {
  project: { id: string; name: string; archicad_project_id: string };
  work_packages: Array<RuntimeRecord>;
  scenarios: Array<{ id: string; name: string; status: string; parent_scenario_id?: string | null }>;
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

const GOVERNED_OPERATIONAL_FIELDS = [
  ["packageId", "package_id"],
  ["constructionState", "construction_state"],
  ["sequenceGroup", "sequence_group"],
  ["sequenceOrder", "sequence_order"],
  ["plannedStart", "planned_start"],
  ["plannedFinish", "planned_finish"],
  ["actualStart", "actual_start"],
  ["actualFinish", "actual_finish"]
] as const;

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
  return getBaselineScenario(state).id;
}

export function getScenarioById(state: RuntimeState, scenarioId: string) {
  const scenario = state.scenarios.find((item) => String(item.id) === scenarioId);
  if (!scenario) {
    throw new Error(`Scenario '${scenarioId}' was not found in runtime state`);
  }
  return scenario;
}

export function getBaselineScenario(state: RuntimeState) {
  const scenario = state.scenarios.find((item) => item.status === "baseline");
  if (!scenario) {
    throw new Error("Runtime state does not contain a baseline scenario");
  }
  return scenario;
}

export function requireActiveScenario(state: RuntimeState, scenarioId?: string | null) {
  if (!scenarioId) {
    return getBaselineScenario(state);
  }
  return getScenarioById(state, scenarioId);
}

export function operationalFor(
  state: RuntimeState,
  objectRefType: ObjectRefType,
  objectRefId: string,
  scenarioId?: string | null
) {
  const activeScenarioId = requireActiveScenario(state, scenarioId).id;
  return state.operational_state.find(
    (item) =>
      item.scenario_id === activeScenarioId &&
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
  packageId: string,
  scenarioId?: string | null
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

  const operational = operationalFor(state, objectRefType, objectRefId, scenarioId);
  if (operational?.package_id === packageId) {
    throw new Error(`Target ${objectRefType} already has package '${packageId}' assigned`);
  }
}

function validateOperationalDates(record: {
  planned_start?: unknown;
  planned_finish?: unknown;
  actual_start?: unknown;
  actual_finish?: unknown;
}) {
  const plannedStart = record.planned_start ? String(record.planned_start) : null;
  const plannedFinish = record.planned_finish ? String(record.planned_finish) : null;
  const actualStart = record.actual_start ? String(record.actual_start) : null;
  const actualFinish = record.actual_finish ? String(record.actual_finish) : null;

  if (plannedStart && plannedFinish && plannedFinish < plannedStart) {
    throw new Error("Planned finish must be on or after planned start");
  }
  if (actualStart && actualFinish && actualFinish < actualStart) {
    throw new Error("Actual finish must be on or after actual start");
  }
}

function objectLabelForChangeSet(state: RuntimeState, objectRefType: ObjectRefType, objectRefId: string) {
  const objectRef = findObjectRef(state, objectRefType, objectRefId);
  if (objectRefType === "zone") {
    return String(objectRef?.zone_key ?? objectRef?.zone_name ?? objectRefId);
  }
  return String(objectRef?.name ?? objectRef?.archicad_guid ?? objectRefId);
}

export function createGovernedOperationalChangeSet(
  state: RuntimeState,
  input: {
    scenarioId: string;
    operationalRowId: string;
    patch: GovernedOperationalPatch;
  }
): GovernedOperationalChangeSetResult {
  const scenario = getScenarioById(state, input.scenarioId);
  const row = state.operational_state.find(
    (item) => String(item.id) === input.operationalRowId && String(item.scenario_id ?? "") === scenario.id
  );
  if (!row) {
    throw new Error(`Operational state row '${input.operationalRowId}' was not found`);
  }

  const objectRefType = String(row.object_ref_type ?? "") as ObjectRefType;
  const objectRefId = String(row.object_ref_id ?? "");
  if (objectRefType !== "zone" && objectRefType !== "model_object") {
    throw new Error(`Operational row '${input.operationalRowId}' has unsupported object reference type`);
  }

  const proposedRow: RuntimeRecord = { ...row };
  const changedItems = GOVERNED_OPERATIONAL_FIELDS.flatMap(([patchKey, fieldName]) => {
    if (!(patchKey in input.patch)) {
      return [];
    }
    const newValue = input.patch[patchKey];
    const oldValue = row[fieldName] ?? null;
    proposedRow[fieldName] = newValue ?? null;
    return oldValue === (newValue ?? null)
      ? []
      : [{ fieldName, oldValue, newValue: newValue ?? null }];
  });

  if (input.patch.packageId) {
    const packageExists = state.work_packages.some(
      (item) => item.active !== false && item.package_id === input.patch.packageId
    );
    if (!packageExists) {
      throw new Error(`Package '${input.patch.packageId}' does not exist`);
    }
  }
  if (
    input.patch.constructionState &&
    !vocab.constructionStates.includes(input.patch.constructionState as (typeof vocab.constructionStates)[number])
  ) {
    throw new Error(`Construction state '${input.patch.constructionState}' is not available`);
  }

  validateOperationalDates(proposedRow);

  if (changedItems.length === 0) {
    throw new Error("No operational changes were made");
  }

  const changeSetId = randomUUID();
  const now = new Date().toISOString();
  const targetLabel = objectLabelForChangeSet(state, objectRefType, objectRefId);

  state.change_sets.push({
    id: changeSetId,
    project_id: state.project.id,
    scenario_id: scenario.id,
    title: `Update ${targetLabel} in ${scenario.name}`,
    description: "Created from governed scenario operational edits",
    status: "draft",
    sync_errors: [],
    created_at: now
  });

  for (const item of changedItems) {
    state.change_set_items.push({
      id: randomUUID(),
      change_set_id: changeSetId,
      object_ref_type: objectRefType,
      object_ref_id: objectRefId,
      field_name: item.fieldName,
      old_value_json: item.oldValue,
      new_value_json: item.newValue,
      created_at: now
    });
  }

  return { changeSetId, targetLabel, itemCount: changedItems.length };
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
