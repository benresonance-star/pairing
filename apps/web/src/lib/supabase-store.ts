import { randomUUID } from "node:crypto";

import { vocab } from "../../../../shared/contracts/api/index";
import { projectIdFromEnv } from "./data-source";
import { buildLinearScheduleData, type LinearScheduleData, type LinearScheduleFilters } from "./linear-schedule";
import {
  actionsForStatus,
  assertValidPackageAssignment,
  createGovernedOperationalChangeSet,
  findObjectRef,
  getScenarioById,
  normalizeRuntimeState,
  operationalFor,
  requireActiveScenario,
  transitionChangeSet as applyChangeSetTransition,
  type ChangeSetAction,
  type GovernedOperationalPatch,
  type RuntimeState
} from "./runtime-state";
import { createServerSupabaseClient } from "./supabase-server";

type RuntimeRecord = Record<string, unknown>;

export type ObjectRow = {
  id: string;
  objectRefType: "zone" | "model_object";
  label: string;
  storey: string;
  zoneKey: string;
  archicadGuid: string | null;
  currentPackageId: string | null;
  constructionState: string | null;
};

export type ChangeSetRow = {
  id: string;
  title: string;
  status: string;
  itemCount: number;
  submittedAt: string | null;
  firstField: string | null;
  firstValue: string | null;
  syncErrors: string[];
};

export type PackageRow = {
  id: string;
  package_id: string;
  package_name: string;
  trade_code?: string | null;
  workfront?: string | null;
  active: boolean;
};

export type ScenarioRow = {
  id: string;
  name: string;
  status: string;
  parentScenarioId: string | null;
  operationalStateCount: number;
  changeSetCount: number;
};

export type ScenarioEditorOperationalRow = {
  id: string;
  objectRefType: "zone" | "model_object";
  objectRefId: string;
  label: string;
  storey: string;
  zoneKey: string;
  archicadGuid: string | null;
  packageId: string | null;
  constructionState: string | null;
  sequenceGroup: string | null;
  sequenceOrder: number | null;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
};

export type ScenarioEditorData = {
  scenario: ScenarioRow;
  scenarios: ScenarioRow[];
  packages: PackageRow[];
  operationalRows: ScenarioEditorOperationalRow[];
  linearScheduleData: LinearScheduleData;
};

const SCENARIO_STATUS_ORDER: Record<string, number> = {
  baseline: 0,
  active: 1,
  draft: 2,
  archived: 3
};

function toRuntimeRecordArray(data: unknown): RuntimeRecord[] {
  return Array.isArray(data)
    ? data.filter((item): item is RuntimeRecord => typeof item === "object" && item !== null)
    : [];
}

function scenarioRowsForState(state: RuntimeState): ScenarioRow[] {
  return sortScenarios(
    state.scenarios.map((scenario) => ({
      id: String(scenario.id),
      name: String(scenario.name),
      status: String(scenario.status),
      parentScenarioId: scenario.parent_scenario_id ? String(scenario.parent_scenario_id) : null,
      operationalStateCount: state.operational_state.filter((item) => item.scenario_id === scenario.id).length,
      changeSetCount: state.change_sets.filter((item) => item.scenario_id === scenario.id).length
    }))
  );
}

function packagesForState(state: RuntimeState): PackageRow[] {
  return state.work_packages
    .filter((item) => item.active !== false)
    .map((item) => ({
      id: String(item.id),
      package_id: String(item.package_id),
      package_name: String(item.package_name ?? item.package_id),
      trade_code: item.trade_code ? String(item.trade_code) : null,
      workfront: item.workfront ? String(item.workfront) : null,
      active: item.active !== false
    }));
}

function operationalRowsForScenario(state: RuntimeState, scenarioId: string): ScenarioEditorOperationalRow[] {
  return state.operational_state
    .filter((item) => String(item.scenario_id ?? "") === scenarioId)
    .map((item) => {
      const objectRefType = String(item.object_ref_type) as "zone" | "model_object";
      const objectRefId = String(item.object_ref_id);
      const objectRef = findObjectRef(state, objectRefType, objectRefId);
      return {
        id: String(item.id),
        objectRefType,
        objectRefId,
        label:
          objectRefType === "zone"
            ? String(objectRef?.zone_name ?? objectRef?.zone_key ?? objectRefId)
            : String(objectRef?.name ?? objectRef?.archicad_guid ?? objectRefId),
        storey: String(objectRef?.storey ?? ""),
        zoneKey: String(objectRef?.zone_key ?? ""),
        archicadGuid: objectRef?.archicad_guid ? String(objectRef.archicad_guid) : null,
        packageId: item.package_id ? String(item.package_id) : null,
        constructionState: item.construction_state ? String(item.construction_state) : null,
        sequenceGroup: item.sequence_group ? String(item.sequence_group) : null,
        sequenceOrder: typeof item.sequence_order === "number" ? item.sequence_order : null,
        plannedStart: item.planned_start ? String(item.planned_start) : null,
        plannedFinish: item.planned_finish ? String(item.planned_finish) : null,
        actualStart: item.actual_start ? String(item.actual_start) : null,
        actualFinish: item.actual_finish ? String(item.actual_finish) : null
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function validateScenarioName(state: RuntimeState, scenarioId: string | null, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Scenario name is required");
  }
  if (
    state.scenarios.some(
      (scenario) => String(scenario.name) === trimmed && String(scenario.id) !== (scenarioId ?? "")
    )
  ) {
    throw new Error(`Scenario '${trimmed}' already exists`);
  }
  return trimmed;
}

function validateScheduleDates(startDate: string, finishDate: string) {
  if (finishDate < startDate) {
    throw new Error("Finish date must be on or after the start date");
  }
}

function validateOperationalDates(record: {
  plannedStart?: string | null;
  plannedFinish?: string | null;
  actualStart?: string | null;
  actualFinish?: string | null;
}) {
  if (record.plannedStart && record.plannedFinish && record.plannedFinish < record.plannedStart) {
    throw new Error("Planned finish must be on or after planned start");
  }
  if (record.actualStart && record.actualFinish && record.actualFinish < record.actualStart) {
    throw new Error("Actual finish must be on or after actual start");
  }
}

async function readProjectRow() {
  const client = createServerSupabaseClient();
  const projectId = projectIdFromEnv();
  const { data, error } = await client
    .from("projects")
    .select("id, name, archicad_project_id")
    .eq("id", projectId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to load project '${projectId}' from Supabase: ${error?.message ?? "not found"}`);
  }

  return data as { id: string; name: string; archicad_project_id: string };
}

async function readProjectTable(table: string): Promise<RuntimeRecord[]> {
  const client = createServerSupabaseClient();
  const projectId = projectIdFromEnv();
  const { data, error } = await client.from(table).select("*").eq("project_id", projectId);
  if (error) {
    throw new Error(`Unable to load '${table}' from Supabase: ${error.message}`);
  }
  return toRuntimeRecordArray(data);
}

async function readChangeSetChildren(changeSetIds: string[]) {
  if (changeSetIds.length === 0) {
    return { changeSetItems: [] as RuntimeRecord[], approvals: [] as RuntimeRecord[] };
  }

  const client = createServerSupabaseClient();
  const [itemsResult, approvalsResult] = await Promise.all([
    client.from("change_set_items").select("*").in("change_set_id", changeSetIds),
    client.from("approvals").select("*").in("change_set_id", changeSetIds)
  ]);

  if (itemsResult.error) {
    throw new Error(`Unable to load 'change_set_items' from Supabase: ${itemsResult.error.message}`);
  }
  if (approvalsResult.error) {
    throw new Error(`Unable to load 'approvals' from Supabase: ${approvalsResult.error.message}`);
  }

  return {
    changeSetItems: toRuntimeRecordArray(itemsResult.data),
    approvals: toRuntimeRecordArray(approvalsResult.data)
  };
}

async function readSupabaseState(): Promise<RuntimeState> {
  const [
    project,
    work_packages,
    scenarios,
    zones,
    model_objects,
    hotlink_instances,
    operational_state,
    change_sets,
    sync_runs,
    audit_events,
    archicad_writes,
    location_axes,
    linear_schedule_views,
    linear_schedule_activities,
    linear_progress_points
  ] = await Promise.all([
    readProjectRow(),
    readProjectTable("work_packages"),
    readProjectTable("scenarios"),
    readProjectTable("zones"),
    readProjectTable("model_objects"),
    readProjectTable("hotlink_instances"),
    readProjectTable("operational_state"),
    readProjectTable("change_sets"),
    readProjectTable("sync_runs"),
    readProjectTable("audit_events"),
    readProjectTable("archicad_writes"),
    readProjectTable("location_axes"),
    readProjectTable("linear_schedule_views"),
    readProjectTable("linear_schedule_activities"),
    readProjectTable("linear_progress_points")
  ]);

  const changeSetIds = change_sets.map((item) => String(item.id));
  const { changeSetItems, approvals } = await readChangeSetChildren(changeSetIds);

  return normalizeRuntimeState({
    project,
    work_packages,
    scenarios,
    zones,
    model_objects,
    hotlink_instances,
    operational_state,
    change_sets,
    change_set_items: changeSetItems,
    approvals,
    sync_runs,
    audit_events,
    archicad_writes,
    location_axes,
    linear_schedule_views,
    linear_schedule_activities,
    linear_progress_points
  });
}

function sortScenarios<T extends { status: string; name: string }>(scenarios: T[]): T[] {
  return [...scenarios].sort((left, right) => {
    const statusCompare = (SCENARIO_STATUS_ORDER[left.status] ?? 99) - (SCENARIO_STATUS_ORDER[right.status] ?? 99);
    if (statusCompare !== 0) {
      return statusCompare;
    }
    return left.name.localeCompare(right.name);
  });
}

export async function getDashboardSummary() {
  const state = await readSupabaseState();
  return {
    projectName: state.project.name,
    zoneCount: state.zones.length,
    modelObjectCount: state.model_objects.length,
    scenarioCount: state.scenarios.length,
    draftCount: state.change_sets.filter((item) => item.status === "draft").length,
    queuedCount: state.change_sets.filter((item) => item.status === "queued_for_sync").length,
    syncFailureCount: state.change_sets.filter((item) => item.status === "sync_failed").length,
    syncRunCount: state.sync_runs.length,
    writableArchicadField: vocab.archicadWritableFields[0]
  };
}

export async function getPackages(): Promise<PackageRow[]> {
  const state = await readSupabaseState();
  return packagesForState(state);
}

export async function getScenarios(): Promise<ScenarioRow[]> {
  const [scenarios, operational_state, change_sets] = await Promise.all([
    readProjectTable("scenarios"),
    readProjectTable("operational_state"),
    readProjectTable("change_sets")
  ]);
  return sortScenarios(
    scenarios.map((scenario) => ({
      id: String(scenario.id),
      name: String(scenario.name),
      status: String(scenario.status),
      parentScenarioId: scenario.parent_scenario_id ? String(scenario.parent_scenario_id) : null,
      operationalStateCount: operational_state.filter((item) => item.scenario_id === scenario.id).length,
      changeSetCount: change_sets.filter((item) => item.scenario_id === scenario.id).length
    }))
  );
}

export async function createScenario(input: {
  name: string;
  sourceScenarioId?: string | null;
}): Promise<{ scenarioId: string }> {
  const client = createServerSupabaseClient();

  if (!input.sourceScenarioId) {
    const [project, scenarios] = await Promise.all([readProjectRow(), readProjectTable("scenarios")]);
    const state = normalizeRuntimeState({
      project,
      work_packages: [],
      scenarios,
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
      location_axes: [],
      linear_schedule_views: [],
      linear_schedule_activities: [],
      linear_progress_points: []
    });
    const name = validateScenarioName(state, null, input.name);
    if (scenarios.length > 0) {
      throw new Error("A baseline scenario already exists; clone it to create a new scenario");
    }
    const scenarioId = randomUUID();
    const { error } = await client.from("scenarios").insert({
      id: scenarioId,
      project_id: project.id,
      name,
      status: "baseline",
      created_by: "web.user@example.com"
    });
    if (error) {
      throw new Error(`Unable to create baseline scenario in Supabase: ${error.message}`);
    }
    return { scenarioId };
  }

  const state = await readSupabaseState();
  const name = validateScenarioName(state, null, input.name);

  const sourceScenario = getScenarioById(state, input.sourceScenarioId);
  const { data: clonedScenarioId, error: cloneError } = await client.rpc("clone_scenario", {
    source_scenario_id: sourceScenario.id,
    new_name: name,
    user_id: "web.user@example.com"
  });
  if (cloneError || !clonedScenarioId) {
    throw new Error(`Unable to clone scenario in Supabase: ${cloneError?.message ?? "no id returned"}`);
  }

  const sourceViews = state.linear_schedule_views.filter((item) => String(item.scenario_id ?? "") === sourceScenario.id);
  if (sourceViews.length > 0) {
    const viewIdMap = new Map<string, string>();
    const activityIdMap = new Map<string, string>();
    const clonedViews = sourceViews.map((view) => {
      const nextId = randomUUID();
      viewIdMap.set(String(view.id), nextId);
      return {
        ...view,
        id: nextId,
        scenario_id: clonedScenarioId
      };
    });
    const sourceActivities = state.linear_schedule_activities.filter(
      (item) => String(item.scenario_id ?? "") === sourceScenario.id
    );
    const clonedActivities = sourceActivities.map((activity) => {
      const nextId = randomUUID();
      activityIdMap.set(String(activity.id), nextId);
      return {
        ...activity,
        id: nextId,
        scenario_id: clonedScenarioId,
        linear_schedule_view_id:
          viewIdMap.get(String(activity.linear_schedule_view_id ?? "")) ?? activity.linear_schedule_view_id
      };
    });
    const clonedProgressPoints = state.linear_progress_points
      .filter((point) => activityIdMap.has(String(point.linear_schedule_activity_id ?? "")))
      .map((point) => ({
        ...point,
        id: randomUUID(),
        linear_schedule_activity_id:
          activityIdMap.get(String(point.linear_schedule_activity_id ?? "")) ?? point.linear_schedule_activity_id
      }));

    const [viewsResult, activitiesResult, progressResult] = await Promise.all([
      client.from("linear_schedule_views").insert(clonedViews),
      clonedActivities.length > 0 ? client.from("linear_schedule_activities").insert(clonedActivities) : Promise.resolve({ error: null }),
      clonedProgressPoints.length > 0 ? client.from("linear_progress_points").insert(clonedProgressPoints) : Promise.resolve({ error: null })
    ]);

    if (viewsResult.error) {
      throw new Error(`Unable to clone schedule views in Supabase: ${viewsResult.error.message}`);
    }
    if (activitiesResult.error) {
      throw new Error(`Unable to clone schedule activities in Supabase: ${activitiesResult.error.message}`);
    }
    if (progressResult.error) {
      throw new Error(`Unable to clone progress points in Supabase: ${progressResult.error.message}`);
    }
  }

  return { scenarioId: String(clonedScenarioId) };
}

export async function getScenarioEditorData(scenarioId: string): Promise<ScenarioEditorData> {
  const state = await readSupabaseState();
  const scenario = getScenarioById(state, scenarioId);
  const scenarios = scenarioRowsForState(state);
  return {
    scenario: scenarios.find((item) => item.id === scenario.id)!,
    scenarios,
    packages: packagesForState(state),
    operationalRows: operationalRowsForScenario(state, scenario.id),
    linearScheduleData: buildLinearScheduleData(state, { scenarioId: scenario.id })
  };
}

export async function getObjects(scenarioId?: string | null): Promise<ObjectRow[]> {
  const state = await readSupabaseState();
  const activeScenario = requireActiveScenario(state, scenarioId);
  const zones: ObjectRow[] = state.zones.map((zone) => {
    const operational = operationalFor(state, "zone", String(zone.id), activeScenario.id);
    return {
      id: String(zone.id),
      objectRefType: "zone",
      label: String(zone.zone_name ?? zone.zone_key),
      storey: String(zone.storey ?? ""),
      zoneKey: String(zone.zone_key ?? ""),
      archicadGuid: zone.archicad_guid ? String(zone.archicad_guid) : null,
      currentPackageId: operational?.package_id ? String(operational.package_id) : null,
      constructionState: operational?.construction_state ? String(operational.construction_state) : null
    };
  });
  const modelObjects: ObjectRow[] = state.model_objects.map((item) => {
    const operational = operationalFor(state, "model_object", String(item.id), activeScenario.id);
    return {
      id: String(item.id),
      objectRefType: "model_object",
      label: String(item.name ?? item.archicad_guid),
      storey: String(item.storey ?? ""),
      zoneKey: String(item.zone_key ?? ""),
      archicadGuid: item.archicad_guid ? String(item.archicad_guid) : null,
      currentPackageId: operational?.package_id ? String(operational.package_id) : null,
      constructionState: operational?.construction_state ? String(operational.construction_state) : null
    };
  });
  return [...zones, ...modelObjects];
}

export async function getChangeSets(scenarioId?: string | null): Promise<ChangeSetRow[]> {
  const state = await readSupabaseState();
  const activeScenario = requireActiveScenario(state, scenarioId);
  return [...state.change_sets]
    .filter((item) => String(item.scenario_id) === activeScenario.id)
    .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")))
    .map((changeSet) => {
      const items = state.change_set_items.filter((item) => item.change_set_id === changeSet.id);
      const firstItem = items[0];
      return {
        id: String(changeSet.id),
        title: String(changeSet.title),
        status: String(changeSet.status),
        itemCount: items.length,
        submittedAt: changeSet.submitted_at ? String(changeSet.submitted_at) : null,
        firstField: firstItem ? String(firstItem.field_name) : null,
        firstValue: firstItem ? JSON.stringify(firstItem.new_value_json) : null,
        syncErrors: Array.isArray(changeSet.sync_errors) ? (changeSet.sync_errors as string[]) : []
      };
    });
}

export async function createPackageAssignmentChangeSet(input: {
  objectRefType: "zone" | "model_object";
  objectRefId: string;
  packageId: string;
  scenarioId?: string | null;
}): Promise<{ changeSetId: string; targetLabel: string }> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const activeScenario = requireActiveScenario(state, input.scenarioId);

  assertValidPackageAssignment(
    state,
    input.objectRefType,
    input.objectRefId,
    input.packageId,
    activeScenario.id
  );

  const changeSetId = randomUUID();
  const itemId = randomUUID();
  const objectRef = findObjectRef(state, input.objectRefType, input.objectRefId);
  const currentOperational = operationalFor(state, input.objectRefType, input.objectRefId, activeScenario.id);
  const objectLabel =
    input.objectRefType === "zone"
      ? String(objectRef?.zone_key ?? input.objectRefId)
      : String(objectRef?.archicad_guid ?? input.objectRefId);

  const { error: changeSetError } = await client.from("change_sets").insert({
    id: changeSetId,
    project_id: state.project.id,
    scenario_id: activeScenario.id,
    title: `Assign ${input.packageId} to ${objectLabel ?? input.objectRefId}`,
    description: "Created from the first-slice package assignment UI",
    status: "draft",
    sync_errors: []
  });

  if (changeSetError) {
    throw new Error(`Unable to create change set in Supabase: ${changeSetError.message}`);
  }

  const { error: itemError } = await client.from("change_set_items").insert({
    id: itemId,
    change_set_id: changeSetId,
    object_ref_type: input.objectRefType,
    object_ref_id: input.objectRefId,
    field_name: "package_id",
    old_value_json: currentOperational?.package_id ?? null,
    new_value_json: input.packageId
  });

  if (itemError) {
    throw new Error(`Unable to create change set item in Supabase: ${itemError.message}`);
  }

  return { changeSetId, targetLabel: objectLabel };
}

export async function createScenarioOperationalChangeSet(input: {
  scenarioId: string;
  operationalRowId: string;
  patch: GovernedOperationalPatch;
}): Promise<{ changeSetId: string; targetLabel: string; itemCount: number }> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const previousChangeSetCount = state.change_sets.length;
  const previousItemCount = state.change_set_items.length;
  const result = createGovernedOperationalChangeSet(state, input);
  const changeSet = state.change_sets[previousChangeSetCount];
  const items = state.change_set_items.slice(previousItemCount);

  const { error: changeSetError } = await client.from("change_sets").insert({
    id: changeSet.id,
    project_id: changeSet.project_id,
    scenario_id: changeSet.scenario_id,
    title: changeSet.title,
    description: changeSet.description,
    status: changeSet.status,
    sync_errors: changeSet.sync_errors ?? []
  });

  if (changeSetError) {
    throw new Error(`Unable to create scenario change set in Supabase: ${changeSetError.message}`);
  }

  const { error: itemsError } = await client.from("change_set_items").insert(
    items.map((item) => ({
      id: item.id,
      change_set_id: item.change_set_id,
      object_ref_type: item.object_ref_type,
      object_ref_id: item.object_ref_id,
      field_name: item.field_name,
      old_value_json: item.old_value_json,
      new_value_json: item.new_value_json
    }))
  );

  if (itemsError) {
    throw new Error(`Unable to create scenario change set items in Supabase: ${itemsError.message}`);
  }

  return result;
}

export async function transitionChangeSet(
  changeSetId: string,
  action: ChangeSetAction
): Promise<ChangeSetRow["status"]> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const previousApprovalCount = state.approvals.length;
  const nextStatus = applyChangeSetTransition(state, changeSetId, action);
  const changeSet = state.change_sets.find((item) => item.id === changeSetId);

  if (!changeSet) {
    throw new Error(`Change set '${changeSetId}' was not found`);
  }

  const updatePayload: Record<string, unknown> = {
    status: nextStatus
  };
  if (action === "submit") {
    updatePayload.submitted_by = changeSet.submitted_by ?? "demo.user@example.com";
    updatePayload.submitted_at = changeSet.submitted_at;
  }
  if (action === "queue") {
    updatePayload.sync_errors = [];
  }

  const { error: updateError } = await client
    .from("change_sets")
    .update(updatePayload)
    .eq("id", changeSetId)
    .eq("project_id", state.project.id);

  if (updateError) {
    throw new Error(`Unable to transition change set in Supabase: ${updateError.message}`);
  }

  if (action === "approve") {
    const approval = state.approvals[previousApprovalCount];
    const { error: approvalError } = await client.from("approvals").insert(approval);
    if (approvalError) {
      throw new Error(`Unable to record approval in Supabase: ${approvalError.message}`);
    }
  }

  return nextStatus;
}

export async function getRecentWrites() {
  const state = await readSupabaseState();
  return [...state.archicad_writes]
    .sort((left, right) => String(right.applied_at ?? "").localeCompare(String(left.applied_at ?? "")))
    .slice(0, 5);
}

export async function getLinearScheduleData(filters: LinearScheduleFilters = {}) {
  const state = await readSupabaseState();
  return buildLinearScheduleData(state, filters);
}

export async function updateScenario(
  scenarioId: string,
  patch: { name?: string; status?: string }
): Promise<void> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const scenario = getScenarioById(state, scenarioId);
  const updatePayload: Record<string, unknown> = {};

  if (typeof patch.name === "string") {
    updatePayload.name = validateScenarioName(state, scenarioId, patch.name);
  }

  if (typeof patch.status === "string" && patch.status !== scenario.status) {
    if (scenario.status === "baseline" && patch.status !== "baseline") {
      throw new Error("Assign another baseline before changing the baseline scenario status");
    }
    if (patch.status === "baseline") {
      const { error: demoteError } = await client
        .from("scenarios")
        .update({ status: "active" })
        .eq("project_id", state.project.id)
        .eq("status", "baseline")
        .neq("id", scenarioId);
      if (demoteError) {
        throw new Error(`Unable to update baseline scenario in Supabase: ${demoteError.message}`);
      }
    }
    updatePayload.status = patch.status;
  }

  if (Object.keys(updatePayload).length === 0) {
    return;
  }

  const { error } = await client
    .from("scenarios")
    .update(updatePayload)
    .eq("id", scenarioId)
    .eq("project_id", state.project.id);
  if (error) {
    throw new Error(`Unable to update scenario in Supabase: ${error.message}`);
  }
}

export async function archiveScenario(scenarioId: string): Promise<void> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const scenario = getScenarioById(state, scenarioId);
  if (scenario.status === "baseline") {
    throw new Error("Baseline scenarios cannot be archived");
  }
  const { error } = await client
    .from("scenarios")
    .update({ status: "archived" })
    .eq("id", scenarioId)
    .eq("project_id", state.project.id);
  if (error) {
    throw new Error(`Unable to archive scenario in Supabase: ${error.message}`);
  }
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const scenario = getScenarioById(state, scenarioId);
  if (scenario.status === "baseline") {
    throw new Error("Baseline scenarios cannot be deleted");
  }
  if (state.change_sets.some((item) => String(item.scenario_id ?? "") === scenarioId)) {
    throw new Error("Scenarios with change sets must be archived instead of deleted");
  }

  const viewIds = state.linear_schedule_views
    .filter((item) => String(item.scenario_id ?? "") === scenarioId)
    .map((item) => String(item.id));
  const activityIds = state.linear_schedule_activities
    .filter((item) => String(item.scenario_id ?? "") === scenarioId)
    .map((item) => String(item.id));

  if (activityIds.length > 0) {
    const { error: progressError } = await client
      .from("linear_progress_points")
      .delete()
      .eq("project_id", state.project.id)
      .in("linear_schedule_activity_id", activityIds);
    if (progressError) {
      throw new Error(`Unable to delete schedule progress points in Supabase: ${progressError.message}`);
    }
  }
  if (activityIds.length > 0) {
    const { error: activityError } = await client
      .from("linear_schedule_activities")
      .delete()
      .eq("project_id", state.project.id)
      .eq("scenario_id", scenarioId);
    if (activityError) {
      throw new Error(`Unable to delete schedule activities in Supabase: ${activityError.message}`);
    }
  }
  if (viewIds.length > 0) {
    const { error: viewError } = await client
      .from("linear_schedule_views")
      .delete()
      .eq("project_id", state.project.id)
      .eq("scenario_id", scenarioId);
    if (viewError) {
      throw new Error(`Unable to delete schedule views in Supabase: ${viewError.message}`);
    }
  }

  const { error: operationalError } = await client
    .from("operational_state")
    .delete()
    .eq("project_id", state.project.id)
    .eq("scenario_id", scenarioId);
  if (operationalError) {
    throw new Error(`Unable to delete operational state in Supabase: ${operationalError.message}`);
  }

  const { error: scenarioError } = await client
    .from("scenarios")
    .delete()
    .eq("id", scenarioId)
    .eq("project_id", state.project.id);
  if (scenarioError) {
    throw new Error(`Unable to delete scenario in Supabase: ${scenarioError.message}`);
  }
}

export async function updateOperationalStateRow(
  id: string,
  patch: {
    packageId?: string | null;
    constructionState?: string | null;
    sequenceGroup?: string | null;
    sequenceOrder?: number | null;
    plannedStart?: string | null;
    plannedFinish?: string | null;
    actualStart?: string | null;
    actualFinish?: string | null;
  }
): Promise<void> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const row = state.operational_state.find((item) => String(item.id) === id);
  if (!row) {
    throw new Error(`Operational state row '${id}' was not found`);
  }

  if (
    patch.packageId &&
    !state.work_packages.some((item) => String(item.package_id) === patch.packageId && item.active !== false)
  ) {
    throw new Error(`Package '${patch.packageId}' does not exist`);
  }

  validateOperationalDates({
    plannedStart: patch.plannedStart ?? (row.planned_start ? String(row.planned_start) : null),
    plannedFinish: patch.plannedFinish ?? (row.planned_finish ? String(row.planned_finish) : null),
    actualStart: patch.actualStart ?? (row.actual_start ? String(row.actual_start) : null),
    actualFinish: patch.actualFinish ?? (row.actual_finish ? String(row.actual_finish) : null)
  });

  const updatePayload: Record<string, unknown> = {};
  if (patch.packageId !== undefined) updatePayload.package_id = patch.packageId;
  if (patch.constructionState !== undefined) updatePayload.construction_state = patch.constructionState;
  if (patch.sequenceGroup !== undefined) updatePayload.sequence_group = patch.sequenceGroup;
  if (patch.sequenceOrder !== undefined) updatePayload.sequence_order = patch.sequenceOrder;
  if (patch.plannedStart !== undefined) updatePayload.planned_start = patch.plannedStart;
  if (patch.plannedFinish !== undefined) updatePayload.planned_finish = patch.plannedFinish;
  if (patch.actualStart !== undefined) updatePayload.actual_start = patch.actualStart;
  if (patch.actualFinish !== undefined) updatePayload.actual_finish = patch.actualFinish;

  const { error } = await client
    .from("operational_state")
    .update(updatePayload)
    .eq("id", id)
    .eq("project_id", state.project.id);
  if (error) {
    throw new Error(`Unable to update operational state in Supabase: ${error.message}`);
  }
}

export async function createScheduleActivity(input: {
  scenarioId: string;
  activityName: string;
  packageId?: string | null;
  workfront?: string | null;
  colorKey?: string | null;
  activityType: string;
  displayLayer: string;
  startDate: string;
  finishDate: string;
  locationRef?: string | null;
  startLocationRef?: string | null;
  finishLocationRef?: string | null;
  sequenceGroup?: string | null;
  sequenceOrder?: number | null;
  metadataJson?: Record<string, unknown> | null;
}): Promise<{ activityId: string }> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  getScenarioById(state, input.scenarioId);
  validateScheduleDates(input.startDate, input.finishDate);

  if (
    input.packageId &&
    !state.work_packages.some((item) => String(item.package_id) === input.packageId && item.active !== false)
  ) {
    throw new Error(`Package '${input.packageId}' does not exist`);
  }

  const view = state.linear_schedule_views.find((item) => String(item.scenario_id ?? "") === input.scenarioId);
  if (!view) {
    throw new Error("No scenario schedule view exists for this scenario");
  }

  const activityId = randomUUID();
  const { error } = await client.from("linear_schedule_activities").insert({
    id: activityId,
    project_id: state.project.id,
    scenario_id: input.scenarioId,
    linear_schedule_view_id: view.id,
    package_id: input.packageId ?? null,
    workfront: input.workfront ?? null,
    activity_name: input.activityName.trim(),
    activity_type: input.activityType,
    display_layer: input.displayLayer,
    color_key: input.colorKey ?? null,
    start_date: input.startDate,
    finish_date: input.finishDate,
    location_ref: input.locationRef ?? null,
    start_location_ref: input.startLocationRef ?? null,
    finish_location_ref: input.finishLocationRef ?? null,
    sequence_group: input.sequenceGroup ?? null,
    sequence_order: input.sequenceOrder ?? null,
    metadata_json: input.metadataJson ?? null
  });
  if (error) {
    throw new Error(`Unable to create schedule activity in Supabase: ${error.message}`);
  }
  return { activityId };
}

export async function updateScheduleActivity(
  id: string,
  patch: {
    activityName?: string;
    packageId?: string | null;
    workfront?: string | null;
    colorKey?: string | null;
    startDate?: string;
    finishDate?: string;
    locationRef?: string | null;
    startLocationRef?: string | null;
    finishLocationRef?: string | null;
    sequenceGroup?: string | null;
    sequenceOrder?: number | null;
  }
): Promise<void> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const activity = state.linear_schedule_activities.find((item) => String(item.id) === id);
  if (!activity) {
    throw new Error(`Schedule activity '${id}' was not found`);
  }

  if (
    patch.packageId &&
    !state.work_packages.some((item) => String(item.package_id) === patch.packageId && item.active !== false)
  ) {
    throw new Error(`Package '${patch.packageId}' does not exist`);
  }

  validateScheduleDates(
    patch.startDate ?? String(activity.start_date),
    patch.finishDate ?? String(activity.finish_date)
  );

  const updatePayload: Record<string, unknown> = {};
  if (patch.activityName !== undefined) {
    const trimmed = patch.activityName.trim();
    if (!trimmed) {
      throw new Error("Activity name is required");
    }
    updatePayload.activity_name = trimmed;
  }
  if (patch.packageId !== undefined) updatePayload.package_id = patch.packageId;
  if (patch.workfront !== undefined) updatePayload.workfront = patch.workfront;
  if (patch.colorKey !== undefined) updatePayload.color_key = patch.colorKey;
  if (patch.startDate !== undefined) updatePayload.start_date = patch.startDate;
  if (patch.finishDate !== undefined) updatePayload.finish_date = patch.finishDate;
  if (patch.locationRef !== undefined) updatePayload.location_ref = patch.locationRef;
  if (patch.startLocationRef !== undefined) updatePayload.start_location_ref = patch.startLocationRef;
  if (patch.finishLocationRef !== undefined) updatePayload.finish_location_ref = patch.finishLocationRef;
  if (patch.sequenceGroup !== undefined) updatePayload.sequence_group = patch.sequenceGroup;
  if (patch.sequenceOrder !== undefined) updatePayload.sequence_order = patch.sequenceOrder;

  const { error } = await client
    .from("linear_schedule_activities")
    .update(updatePayload)
    .eq("id", id)
    .eq("project_id", state.project.id);
  if (error) {
    throw new Error(`Unable to update schedule activity in Supabase: ${error.message}`);
  }
}

export async function deleteScheduleActivity(id: string): Promise<void> {
  const state = await readSupabaseState();
  const client = createServerSupabaseClient();
  const activity = state.linear_schedule_activities.find((item) => String(item.id) === id);
  if (!activity) {
    throw new Error(`Schedule activity '${id}' was not found`);
  }

  const { error: progressError } = await client
    .from("linear_progress_points")
    .delete()
    .eq("project_id", state.project.id)
    .eq("linear_schedule_activity_id", id);
  if (progressError) {
    throw new Error(`Unable to delete schedule progress points in Supabase: ${progressError.message}`);
  }

  const { error } = await client
    .from("linear_schedule_activities")
    .delete()
    .eq("id", id)
    .eq("project_id", state.project.id);
  if (error) {
    throw new Error(`Unable to delete schedule activity in Supabase: ${error.message}`);
  }
}

export { actionsForStatus };
