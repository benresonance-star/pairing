import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { vocab } from "../../../../shared/contracts/api/index";
import { isSupabaseMode } from "./data-source";
import { buildLinearScheduleData, type LinearScheduleData, type LinearScheduleFilters } from "./linear-schedule";
import {
  actionsForStatus,
  assertValidPackageAssignment,
  createGovernedOperationalChangeSet,
  findObjectRef,
  getBaselineScenario,
  getScenarioById,
  normalizeRuntimeState,
  operationalFor,
  requireActiveScenario,
  transitionChangeSet as applyChangeSetTransition,
  type ChangeSetAction,
  type GovernedOperationalPatch,
  type RuntimeState
} from "./runtime-state";

async function getSupabaseStore() {
  return import("./supabase-store");
}

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

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const directRoot = path.join(cwd, "shared");
  return existsSync(directRoot) ? cwd : path.resolve(cwd, "../..");
}

function paths() {
  const repoRoot = resolveRepoRoot();
  return {
    seed: path.join(repoRoot, "shared", "examples", "demo_state.seed.json"),
    runtimeDir: path.join(repoRoot, "shared", "examples", "runtime"),
    runtime: path.join(repoRoot, "shared", "examples", "runtime", "demo_state.json")
  };
}

async function ensureRuntimeState(): Promise<void> {
  const runtimePaths = paths();
  const hasRuntime = existsSync(runtimePaths.runtime);
  await mkdir(runtimePaths.runtimeDir, { recursive: true });

  if (!hasRuntime) {
    const seed = await readFile(runtimePaths.seed, "utf8");
    await writeFile(runtimePaths.runtime, seed, "utf8");
    return;
  }

  const [seedStat, runtimeStat] = await Promise.all([
    stat(runtimePaths.seed),
    stat(runtimePaths.runtime)
  ]);

  if (seedStat.mtimeMs > runtimeStat.mtimeMs) {
    const seed = await readFile(runtimePaths.seed, "utf8");
    await writeFile(runtimePaths.runtime, seed, "utf8");
  }
}

async function readState(): Promise<RuntimeState> {
  await ensureRuntimeState();
  const raw = await readFile(paths().runtime, "utf8");
  return normalizeRuntimeState(JSON.parse(raw) as unknown);
}

async function writeState(state: RuntimeState): Promise<void> {
  await mkdir(paths().runtimeDir, { recursive: true });
  const normalized = normalizeRuntimeState(state);
  await writeFile(paths().runtime, JSON.stringify(normalized, null, 2), "utf8");
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

function cloneScenarioState(state: RuntimeState, sourceScenarioId: string, nextScenarioId: string) {
  const viewIdMap = new Map<string, string>();
  const activityIdMap = new Map<string, string>();

  for (const view of state.linear_schedule_views) {
    if (String(view.scenario_id ?? "") !== sourceScenarioId) {
      continue;
    }
    const nextViewId = randomUUID();
    viewIdMap.set(String(view.id), nextViewId);
    state.linear_schedule_views.push({
      ...view,
      id: nextViewId,
      scenario_id: nextScenarioId
    });
  }

  for (const activity of state.linear_schedule_activities) {
    if (String(activity.scenario_id ?? "") !== sourceScenarioId) {
      continue;
    }
    const nextActivityId = randomUUID();
    activityIdMap.set(String(activity.id), nextActivityId);
    state.linear_schedule_activities.push({
      ...activity,
      id: nextActivityId,
      scenario_id: nextScenarioId,
      linear_schedule_view_id:
        viewIdMap.get(String(activity.linear_schedule_view_id ?? "")) ?? activity.linear_schedule_view_id
    });
  }

  for (const point of state.linear_progress_points) {
    const nextActivityId = activityIdMap.get(String(point.linear_schedule_activity_id ?? ""));
    if (!nextActivityId) {
      continue;
    }
    state.linear_progress_points.push({
      ...point,
      id: randomUUID(),
      linear_schedule_activity_id: nextActivityId
    });
  }

  for (const record of state.operational_state) {
    if (String(record.scenario_id ?? "") !== sourceScenarioId) {
      continue;
    }
    state.operational_state.push({
      ...record,
      id: randomUUID(),
      scenario_id: nextScenarioId,
      updated_by: "scenario-clone"
    });
  }
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

export async function getDashboardSummary() {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getDashboardSummary();
  }
  const state = await readState();
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
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getPackages();
  }
  const state = await readState();
  return packagesForState(state);
}

export async function getScenarios(): Promise<ScenarioRow[]> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getScenarios();
  }
  const state = await readState();
  return scenarioRowsForState(state);
}

export async function createScenario(input: {
  name: string;
  sourceScenarioId?: string | null;
}): Promise<{ scenarioId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createScenario(input);
  }

  const state = await readState();
  const name = validateScenarioName(state, null, input.name);

  const nextScenarioId = randomUUID();
  if (!input.sourceScenarioId) {
    if (state.scenarios.length > 0) {
      throw new Error("A baseline scenario already exists; clone it to create a new scenario");
    }
    state.scenarios.push({
      id: nextScenarioId,
      name,
      status: "baseline",
      parent_scenario_id: null
    });
  } else {
    const sourceScenario = getScenarioById(state, input.sourceScenarioId);
    state.scenarios.push({
      id: nextScenarioId,
      name,
      status: "draft",
      parent_scenario_id: sourceScenario.id
    });
    cloneScenarioState(state, sourceScenario.id, nextScenarioId);
  }

  await writeState(state);
  return { scenarioId: nextScenarioId };
}

export async function getScenarioEditorData(scenarioId: string): Promise<ScenarioEditorData> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getScenarioEditorData(scenarioId);
  }
  const state = await readState();
  const scenario = getScenarioById(state, scenarioId);
  return {
    scenario: scenarioRowsForState(state).find((item) => item.id === scenario.id)!,
    scenarios: scenarioRowsForState(state),
    packages: packagesForState(state),
    operationalRows: operationalRowsForScenario(state, scenario.id),
    linearScheduleData: buildLinearScheduleData(state, { scenarioId: scenario.id })
  };
}

export async function getObjects(scenarioId?: string | null): Promise<ObjectRow[]> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getObjects(scenarioId);
  }
  const state = await readState();
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
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getChangeSets(scenarioId);
  }
  const state = await readState();
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
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createPackageAssignmentChangeSet(input);
  }
  const state = await readState();
  const activeScenario = requireActiveScenario(state, input.scenarioId);
  assertValidPackageAssignment(
    state,
    input.objectRefType,
    input.objectRefId,
    input.packageId,
    activeScenario.id
  );
  const changeSetId = randomUUID();
  const currentOperational = operationalFor(state, input.objectRefType, input.objectRefId, activeScenario.id);
  const itemId = randomUUID();
  const objectRef = findObjectRef(state, input.objectRefType, input.objectRefId);
  const objectLabel =
    input.objectRefType === "zone"
      ? String(objectRef?.zone_key ?? input.objectRefId)
      : String(objectRef?.archicad_guid ?? input.objectRefId);

  state.change_sets.push({
    id: changeSetId,
    project_id: state.project.id,
    scenario_id: activeScenario.id,
    title: `Assign ${input.packageId} to ${objectLabel ?? input.objectRefId}`,
    description: "Created from the first-slice package assignment UI",
    status: "draft",
    created_at: new Date().toISOString()
  });

  state.change_set_items.push({
    id: itemId,
    change_set_id: changeSetId,
    object_ref_type: input.objectRefType,
    object_ref_id: input.objectRefId,
    field_name: "package_id",
    old_value_json: currentOperational?.package_id ?? null,
    new_value_json: input.packageId,
    created_at: new Date().toISOString()
  });

  await writeState(state);
  return { changeSetId, targetLabel: objectLabel };
}

export async function createScenarioOperationalChangeSet(input: {
  scenarioId: string;
  operationalRowId: string;
  patch: GovernedOperationalPatch;
}): Promise<{ changeSetId: string; targetLabel: string; itemCount: number }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createScenarioOperationalChangeSet(input);
  }
  const state = await readState();
  const result = createGovernedOperationalChangeSet(state, input);
  await writeState(state);
  return result;
}

export async function transitionChangeSet(
  changeSetId: string,
  action: ChangeSetAction
): Promise<ChangeSetRow["status"]> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).transitionChangeSet(changeSetId, action);
  }
  const state = await readState();
  const nextStatus = applyChangeSetTransition(state, changeSetId, action);
  await writeState(state);
  return nextStatus;
}

export async function getRecentWrites() {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getRecentWrites();
  }
  const state = await readState();
  return [...state.archicad_writes]
    .sort((left, right) => String(right.applied_at ?? "").localeCompare(String(left.applied_at ?? "")))
    .slice(0, 5);
}

export async function getLinearScheduleData(filters: LinearScheduleFilters = {}) {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getLinearScheduleData(filters);
  }
  const state = await readState();
  return buildLinearScheduleData(state, filters);
}

export async function updateScenario(
  scenarioId: string,
  patch: { name?: string; status?: string }
): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateScenario(scenarioId, patch);
  }
  const state = await readState();
  const scenario = getScenarioById(state, scenarioId);

  if (typeof patch.name === "string") {
    scenario.name = validateScenarioName(state, scenarioId, patch.name);
  }

  if (typeof patch.status === "string" && patch.status !== scenario.status) {
    if (scenario.status === "baseline" && patch.status !== "baseline") {
      throw new Error("Assign another baseline before changing the baseline scenario status");
    }
    if (patch.status === "baseline") {
      for (const item of state.scenarios) {
        if (item.status === "baseline" && item.id !== scenarioId) {
          item.status = "active";
        }
      }
    }
    scenario.status = patch.status;
  }

  await writeState(state);
}

export async function archiveScenario(scenarioId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).archiveScenario(scenarioId);
  }
  const state = await readState();
  const scenario = getScenarioById(state, scenarioId);
  if (scenario.status === "baseline") {
    throw new Error("Baseline scenarios cannot be archived");
  }
  scenario.status = "archived";
  await writeState(state);
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteScenario(scenarioId);
  }
  const state = await readState();
  const scenario = getScenarioById(state, scenarioId);
  if (scenario.status === "baseline") {
    throw new Error("Baseline scenarios cannot be deleted");
  }
  if (state.change_sets.some((item) => String(item.scenario_id ?? "") === scenarioId)) {
    throw new Error("Scenarios with change sets must be archived instead of deleted");
  }

  const activityIds = new Set(
    state.linear_schedule_activities
      .filter((item) => String(item.scenario_id ?? "") === scenarioId)
      .map((item) => String(item.id))
  );

  state.scenarios = state.scenarios.filter((item) => String(item.id) !== scenarioId);
  state.operational_state = state.operational_state.filter((item) => String(item.scenario_id ?? "") !== scenarioId);
  state.linear_schedule_views = state.linear_schedule_views.filter((item) => String(item.scenario_id ?? "") !== scenarioId);
  state.linear_schedule_activities = state.linear_schedule_activities.filter(
    (item) => String(item.scenario_id ?? "") !== scenarioId
  );
  state.linear_progress_points = state.linear_progress_points.filter(
    (item) => !activityIds.has(String(item.linear_schedule_activity_id ?? ""))
  );

  await writeState(state);
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
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateOperationalStateRow(id, patch);
  }
  const state = await readState();
  const row = state.operational_state.find((item) => String(item.id) === id);
  if (!row) {
    throw new Error(`Operational state row '${id}' was not found`);
  }

  if (patch.packageId !== undefined) {
    if (
      patch.packageId &&
      !state.work_packages.some((item) => String(item.package_id) === patch.packageId && item.active !== false)
    ) {
      throw new Error(`Package '${patch.packageId}' does not exist`);
    }
    row.package_id = patch.packageId;
  }
  if (patch.constructionState !== undefined) {
    row.construction_state = patch.constructionState;
  }
  if (patch.sequenceGroup !== undefined) {
    row.sequence_group = patch.sequenceGroup;
  }
  if (patch.sequenceOrder !== undefined) {
    row.sequence_order = patch.sequenceOrder;
  }
  if (patch.plannedStart !== undefined) {
    row.planned_start = patch.plannedStart;
  }
  if (patch.plannedFinish !== undefined) {
    row.planned_finish = patch.plannedFinish;
  }
  if (patch.actualStart !== undefined) {
    row.actual_start = patch.actualStart;
  }
  if (patch.actualFinish !== undefined) {
    row.actual_finish = patch.actualFinish;
  }

  validateOperationalDates({
    plannedStart: row.planned_start ? String(row.planned_start) : null,
    plannedFinish: row.planned_finish ? String(row.planned_finish) : null,
    actualStart: row.actual_start ? String(row.actual_start) : null,
    actualFinish: row.actual_finish ? String(row.actual_finish) : null
  });

  await writeState(state);
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
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createScheduleActivity(input);
  }
  const state = await readState();
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
  state.linear_schedule_activities.push({
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

  await writeState(state);
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
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateScheduleActivity(id, patch);
  }
  const state = await readState();
  const activity = state.linear_schedule_activities.find((item) => String(item.id) === id);
  if (!activity) {
    throw new Error(`Schedule activity '${id}' was not found`);
  }

  if (patch.activityName !== undefined) {
    const trimmed = patch.activityName.trim();
    if (!trimmed) {
      throw new Error("Activity name is required");
    }
    activity.activity_name = trimmed;
  }
  if (patch.packageId !== undefined) {
    if (
      patch.packageId &&
      !state.work_packages.some((item) => String(item.package_id) === patch.packageId && item.active !== false)
    ) {
      throw new Error(`Package '${patch.packageId}' does not exist`);
    }
    activity.package_id = patch.packageId;
  }
  if (patch.workfront !== undefined) {
    activity.workfront = patch.workfront;
  }
  if (patch.colorKey !== undefined) {
    activity.color_key = patch.colorKey;
  }
  if (patch.startDate !== undefined) {
    activity.start_date = patch.startDate;
  }
  if (patch.finishDate !== undefined) {
    activity.finish_date = patch.finishDate;
  }
  if (patch.locationRef !== undefined) {
    activity.location_ref = patch.locationRef;
  }
  if (patch.startLocationRef !== undefined) {
    activity.start_location_ref = patch.startLocationRef;
  }
  if (patch.finishLocationRef !== undefined) {
    activity.finish_location_ref = patch.finishLocationRef;
  }
  if (patch.sequenceGroup !== undefined) {
    activity.sequence_group = patch.sequenceGroup;
  }
  if (patch.sequenceOrder !== undefined) {
    activity.sequence_order = patch.sequenceOrder;
  }

  validateScheduleDates(String(activity.start_date), String(activity.finish_date));
  await writeState(state);
}

export async function deleteScheduleActivity(id: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteScheduleActivity(id);
  }
  const state = await readState();
  const activityExists = state.linear_schedule_activities.some((item) => String(item.id) === id);
  if (!activityExists) {
    throw new Error(`Schedule activity '${id}' was not found`);
  }
  state.linear_schedule_activities = state.linear_schedule_activities.filter((item) => String(item.id) !== id);
  state.linear_progress_points = state.linear_progress_points.filter(
    (item) => String(item.linear_schedule_activity_id ?? "") !== id
  );
  await writeState(state);
}

export async function resetRuntimeState(): Promise<void> {
  if (isSupabaseMode()) {
    throw new Error("resetRuntimeState is only available in demo mode");
  }
  await mkdir(paths().runtimeDir, { recursive: true });
  const seed = await readFile(paths().seed, "utf8");
  const normalized = normalizeRuntimeState(JSON.parse(seed) as unknown);
  await writeFile(paths().runtime, JSON.stringify(normalized, null, 2), "utf8");
}

export { actionsForStatus };
