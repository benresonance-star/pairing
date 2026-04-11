import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { vocab } from "../../../../shared/contracts/api/index";
import { buildLinearScheduleData, type LinearScheduleFilters } from "./linear-schedule";
import {
  actionsForStatus,
  assertValidPackageAssignment,
  baselineScenarioId,
  findObjectRef,
  normalizeRuntimeState,
  operationalFor,
  transitionChangeSet as applyChangeSetTransition,
  type ChangeSetAction,
  type RuntimeState
} from "./runtime-state";

type ObjectRow = {
  id: string;
  objectRefType: "zone" | "model_object";
  label: string;
  storey: string;
  zoneKey: string;
  archicadGuid: string | null;
  currentPackageId: string | null;
  constructionState: string | null;
};

type ChangeSetRow = {
  id: string;
  title: string;
  status: string;
  itemCount: number;
  submittedAt: string | null;
  firstField: string | null;
  firstValue: string | null;
  syncErrors: string[];
};

type PackageRow = {
  id: string;
  package_id: string;
  package_name: string;
  trade_code?: string | null;
  workfront?: string | null;
  active: boolean;
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

export async function getDashboardSummary() {
  const state = await readState();
  return {
    projectName: state.project.name,
    zoneCount: state.zones.length,
    modelObjectCount: state.model_objects.length,
    draftCount: state.change_sets.filter((item) => item.status === "draft").length,
    queuedCount: state.change_sets.filter((item) => item.status === "queued_for_sync").length,
    syncFailureCount: state.change_sets.filter((item) => item.status === "sync_failed").length,
    syncRunCount: state.sync_runs.length,
    writableArchicadField: vocab.archicadWritableFields[0]
  };
}

export async function getPackages(): Promise<PackageRow[]> {
  const state = await readState();
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

export async function getObjects(): Promise<ObjectRow[]> {
  const state = await readState();
  const zones: ObjectRow[] = state.zones.map((zone) => {
    const operational = operationalFor(state, "zone", String(zone.id));
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
    const operational = operationalFor(state, "model_object", String(item.id));
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

export async function getChangeSets(): Promise<ChangeSetRow[]> {
  const state = await readState();
  return [...state.change_sets]
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
}): Promise<{ changeSetId: string; targetLabel: string }> {
  const state = await readState();
  assertValidPackageAssignment(state, input.objectRefType, input.objectRefId, input.packageId);
  const changeSetId = randomUUID();
  const currentOperational = operationalFor(state, input.objectRefType, input.objectRefId);
  const itemId = randomUUID();
  const objectRef = findObjectRef(state, input.objectRefType, input.objectRefId);
  const objectLabel =
    input.objectRefType === "zone"
      ? String(objectRef?.zone_key ?? input.objectRefId)
      : String(objectRef?.archicad_guid ?? input.objectRefId);

  state.change_sets.push({
    id: changeSetId,
    project_id: state.project.id,
    scenario_id: baselineScenarioId(state),
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

export async function transitionChangeSet(
  changeSetId: string,
  action: ChangeSetAction
): Promise<ChangeSetRow["status"]> {
  const state = await readState();
  const nextStatus = applyChangeSetTransition(state, changeSetId, action);
  await writeState(state);
  return nextStatus;
}

export async function getRecentWrites() {
  const state = await readState();
  return [...state.archicad_writes]
    .sort((left, right) => String(right.applied_at ?? "").localeCompare(String(left.applied_at ?? "")))
    .slice(0, 5);
}

export async function getLinearScheduleData(filters: LinearScheduleFilters = {}) {
  const state = await readState();
  return buildLinearScheduleData(state, filters);
}

export async function resetRuntimeState(): Promise<void> {
  await mkdir(paths().runtimeDir, { recursive: true });
  const seed = await readFile(paths().seed, "utf8");
  const normalized = normalizeRuntimeState(JSON.parse(seed) as unknown);
  await writeFile(paths().runtime, JSON.stringify(normalized, null, 2), "utf8");
}

export { actionsForStatus };
