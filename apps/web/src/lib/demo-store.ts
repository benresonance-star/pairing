import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import seedState from "../../../../shared/examples/demo_state.seed.json";
import { vocab } from "../../../../shared/contracts/api/index";
import { isSupabaseMode } from "./data-source";
import { buildFeasibilityPortfolio, type FeasibilityPortfolio, type SiteFeasibility } from "./feasibility";
import { buildLinearScheduleData, type LinearScheduleData, type LinearScheduleFilters } from "./linear-schedule";
import {
  actionsForStatus,
  archiveDevelopmentSite,
  assertValidPackageAssignment,
  createDevelopmentSite,
  createGovernedOperationalChangeSet,
  findObjectRef,
  getBaselineScenario,
  getScenarioById,
  normalizeRuntimeState,
  operationalFor,
  requireActiveScenario,
  transitionChangeSet as applyChangeSetTransition,
  updateDevelopmentSite,
  type ChangeSetAction,
  type GovernedOperationalPatch,
  type MasterCodeItemRecord,
  type MasterCostItemRecord,
  type MasterCostTemplateItemRecord,
  type RuntimeState,
  type SitePatch
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
  scenarioKind: string;
  parentScenarioId: string | null;
  templateScenarioId: string | null;
  operationalStateCount: number;
  changeSetCount: number;
};

export type CreateSiteScenarioOptionInput = {
  siteId: string;
  name: string;
  configuration: string;
  templateScenarioId?: string | null;
  masterCostTemplateId?: string | null;
  createDetailedScenario?: boolean;
  dwellings?: number | null;
  grossFloorAreaSqm?: number | null;
  planningFit?: string | null;
  summary?: string | null;
  targetMarginPercent?: number | null;
  grossRealisation?: number | null;
};

export type UpdateScenarioOptionInput = {
  optionId: string;
  name: string;
  configuration: string;
  status: string;
  dwellings?: number | null;
  grossFloorAreaSqm?: number | null;
  planningFit?: string | null;
  summary?: string | null;
  targetMarginPercent?: number | null;
};

export type CreateSiteInput = Omit<SitePatch, "status"> & {
  status?: string;
};

export type UpdateSiteInput = SitePatch & {
  siteId: string;
};

export type CreateMasterCostTemplateInput = {
  name: string;
  description?: string | null;
  status?: string;
  templateType?: string | null;
};

export type UpdateMasterCostTemplateInput = CreateMasterCostTemplateInput & {
  templateId: string;
};

export type CreateMasterCostItemInput = {
  masterCostTemplateId: string;
  masterCostItemId?: string | null;
  masterCodeItemId?: string | null;
  parentItemId?: string | null;
  costCode: string;
  title: string;
  tradeCode?: string | null;
  packageId?: string | null;
  estimateGranularity: string;
  costingMethod: string;
  unit: string;
  baseRate: number;
  defaultQuantity?: number | null;
  quantityBasis?: string | null;
  lowFactor?: number | null;
  midFactor?: number | null;
  highFactor?: number | null;
  contingencyPercent?: number | null;
  notes?: string | null;
  sortOrder?: number | null;
};

export type UpdateMasterCostItemInput = CreateMasterCostItemInput & {
  itemId: string;
};

export type CreateMasterCostItemLinkInput = {
  masterCostTemplateItemId: string;
  targetType: string;
  targetRef: string;
  linkBasis?: string | null;
  notes?: string | null;
};

export type UpdateMasterCostItemLinkInput = CreateMasterCostItemLinkInput & {
  linkId: string;
};

export type CreateMasterDatabaseItemInput = {
  masterCodeItemId?: string | null;
  costCode: string;
  title: string;
  tradeCode?: string | null;
  packageId?: string | null;
  estimateGranularity: string;
  costingMethod: string;
  unit: string;
  baseRate: number;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  sourceNotes?: string | null;
  notes?: string | null;
  status?: string | null;
};

export type UpdateMasterDatabaseItemInput = CreateMasterDatabaseItemInput & {
  itemId: string;
};

export type CreateMasterDatabaseItemSourceInput = {
  masterCostItemId: string;
  sourceType?: string | null;
  sourceLabel: string;
  sourceUrl?: string | null;
  sourceDate?: string | null;
  confidence?: string | null;
  notes?: string | null;
};

export type UpdateMasterDatabaseItemSourceInput = CreateMasterDatabaseItemSourceInput & {
  sourceId: string;
};

export type CreateMasterDatabaseTargetLinkInput = {
  masterCostItemId: string;
  targetType: string;
  targetRef: string;
  linkBasis?: string | null;
  notes?: string | null;
};

export type UpdateMasterDatabaseTargetLinkInput = CreateMasterDatabaseTargetLinkInput & {
  linkId: string;
};

export type AddMasterDatabaseItemToTemplateInput = {
  masterCostItemId: string;
  masterCostTemplateId: string;
  parentItemId?: string | null;
  defaultQuantity?: number | null;
  quantityBasis?: string | null;
  lowFactor?: number | null;
  midFactor?: number | null;
  highFactor?: number | null;
  contingencyPercent?: number | null;
  sortOrder?: number | null;
  notes?: string | null;
};

export type CreateMasterCodeItemInput = {
  catalogId: string;
  parentItemId?: string | null;
  code: string;
  title: string;
  codeType: string;
  tradeCode?: string | null;
  packageId?: string | null;
  defaultUnit?: string | null;
  defaultEstimateGranularity?: string | null;
  defaultCostingMethod?: string | null;
  notes?: string | null;
  status?: string | null;
  sortOrder?: number | null;
};

export type UpdateMasterCodeItemInput = CreateMasterCodeItemInput & {
  itemId: string;
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
  template: -1,
  baseline: 0,
  active: 1,
  draft: 2,
  archived: 3
};

const DEFAULT_COST_RANGE_FACTORS = {
  low: 0.92,
  mid: 1,
  high: 1.12
} as const;

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

function isReadOnlyRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}

async function ensureRuntimeState(): Promise<void> {
  if (isReadOnlyRuntime()) {
    return;
  }
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
  if (isReadOnlyRuntime()) {
    return normalizeRuntimeState(seedState as unknown);
  }
  await ensureRuntimeState();
  const raw = await readFile(paths().runtime, "utf8");
  return normalizeRuntimeState(JSON.parse(raw) as unknown);
}

function isLikelySupabaseTransportError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("ENOTFOUND")) return true;
  if (msg.includes("ECONNREFUSED")) return true;
  if (msg.includes("ECONNRESET")) return true;
  if (msg.includes("ETIMEDOUT")) return true;
  if (msg.includes("getaddrinfo")) return true;
  if (msg.includes("certificate")) return true;
  if (msg.includes("network")) return true;
  return false;
}

async function shouldUseSupabaseFeasibility(siteId?: string | null): Promise<boolean> {
  if (!isSupabaseMode()) {
    return false;
  }
  try {
    const portfolio = await (await getSupabaseStore()).getFeasibilityPortfolio();
    if (siteId) {
      return portfolio.sites.some((site) => site.id === siteId);
    }
    return portfolio.sites.length > 0;
  } catch (error) {
    if (isLikelySupabaseTransportError(error)) {
      return false;
    }
    throw error;
  }
}

async function shouldUseSupabaseScenarioOption(optionId: string): Promise<boolean> {
  if (!isSupabaseMode()) {
    return false;
  }
  try {
    const portfolio = await (await getSupabaseStore()).getFeasibilityPortfolio();
    return portfolio.sites.some((site) => site.scenarioOptions.some((option) => option.id === optionId));
  } catch (error) {
    if (isLikelySupabaseTransportError(error)) {
      return false;
    }
    throw error;
  }
}

async function shouldUseSupabaseBaseCosts(templateOrItemId?: string | null): Promise<boolean> {
  if (!isSupabaseMode()) {
    return false;
  }
  try {
    const portfolio = await (await getSupabaseStore()).getFeasibilityPortfolio();
    if (!templateOrItemId) {
      return portfolio.masterCostTemplates.length > 0 || portfolio.masterCostItems.length > 0;
    }
    return portfolio.masterCostItems.some((item) => item.id === templateOrItemId) || portfolio.masterCostTemplates.some(
      (template) =>
        template.id === templateOrItemId ||
        template.items.some((item) => item.id === templateOrItemId || item.master_cost_item_id === templateOrItemId)
    );
  } catch (error) {
    if (isLikelySupabaseTransportError(error)) {
      return false;
    }
    throw error;
  }
}

function validateMasterCostTemplateName(state: RuntimeState, templateId: string | null, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Master cost template name is required");
  }
  if (state.master_cost_templates.some((template) => template.name === trimmed && template.id !== (templateId ?? ""))) {
    throw new Error(`Master cost template '${trimmed}' already exists`);
  }
  return trimmed;
}

function validateMasterCostItemInput(input: CreateMasterCostItemInput): void {
  if (!input.costCode.trim()) throw new Error("Cost code is required");
  if (!input.title.trim()) throw new Error("Cost item title is required");
  if (!input.estimateGranularity.trim()) throw new Error("Estimate granularity is required");
  if (!input.costingMethod.trim()) throw new Error("Costing method is required");
  if (!input.unit.trim()) throw new Error("Unit is required");
  if (!Number.isFinite(input.baseRate)) throw new Error("Base rate must be numeric");
}

function validateMasterDatabaseItemInput(input: CreateMasterDatabaseItemInput): void {
  if (!input.costCode.trim()) throw new Error("Cost code is required");
  if (!input.title.trim()) throw new Error("Cost item title is required");
  if (!input.estimateGranularity.trim()) throw new Error("Estimate granularity is required");
  if (!input.costingMethod.trim()) throw new Error("Costing method is required");
  if (!input.unit.trim()) throw new Error("Unit is required");
  if (!Number.isFinite(input.baseRate)) throw new Error("Base rate must be numeric");
}

function masterCodeItemPayload(input: CreateMasterCodeItemInput, id: string): MasterCodeItemRecord {
  if (!input.catalogId.trim()) throw new Error("Catalog is required");
  if (!input.code.trim()) throw new Error("Code is required");
  if (!input.title.trim()) throw new Error("Title is required");
  if (!input.codeType.trim()) throw new Error("Code type is required");
  return {
    id,
    catalog_id: input.catalogId,
    parent_item_id: input.parentItemId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    code_type: input.codeType.trim(),
    trade_code: input.tradeCode ?? null,
    package_id: input.packageId ?? null,
    default_unit: input.defaultUnit ?? null,
    default_estimate_granularity: input.defaultEstimateGranularity ?? null,
    default_costing_method: input.defaultCostingMethod ?? null,
    notes: input.notes ?? null,
    status: input.status ?? "active",
    sort_order: input.sortOrder ?? null
  };
}

function masterDatabaseItemPayload(state: RuntimeState, input: CreateMasterDatabaseItemInput, id: string): MasterCostItemRecord {
  validateMasterDatabaseItemInput(input);
  return {
    id,
    project_id: state.project.id,
    master_code_item_id: input.masterCodeItemId ?? null,
    cost_code: input.costCode.trim(),
    title: input.title.trim(),
    trade_code: input.tradeCode ?? null,
    package_id: input.packageId ?? null,
    estimate_granularity: input.estimateGranularity,
    costing_method: input.costingMethod,
    unit: input.unit.trim(),
    base_rate: input.baseRate,
    source_label: input.sourceLabel ?? null,
    source_url: input.sourceUrl ?? null,
    source_notes: input.sourceNotes ?? null,
    notes: input.notes ?? null,
    status: input.status ?? "active"
  };
}

function assertUnusedMasterCodeItem(state: RuntimeState, itemId: string): void {
  const usageCount =
    state.master_cost_items.filter((item) => item.master_code_item_id === itemId).length +
    state.master_cost_template_items.filter((item) => item.master_code_item_id === itemId).length;
  if (usageCount > 0) {
    throw new Error("Master code items used by project costs must be archived instead of deleted");
  }
}

function assertUnusedOrDraftMasterItem(state: RuntimeState, itemId: string): void {
  const item = state.master_cost_items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Master database item '${itemId}' was not found`);
  }
  const usageCount = state.master_cost_template_items.filter((templateItem) => templateItem.master_cost_item_id === itemId).length;
  if (usageCount > 0) {
    throw new Error("Master database items used by templates must be archived instead of deleted");
  }
  if ((item.status ?? "active") !== "draft") {
    throw new Error("Only unused draft master database items can be deleted");
  }
}

function masterCostItemPayload(state: RuntimeState, input: CreateMasterCostItemInput, id: string) {
  const template = state.master_cost_templates.find((item) => item.id === input.masterCostTemplateId);
  if (!template) {
    throw new Error(`Master cost template '${input.masterCostTemplateId}' was not found`);
  }
  validateMasterCostItemInput(input);
  return {
    id,
    project_id: state.project.id,
    master_cost_template_id: input.masterCostTemplateId,
    master_cost_item_id: input.masterCostItemId ?? null,
    master_code_item_id: input.masterCodeItemId ?? null,
    parent_item_id: input.parentItemId ?? null,
    cost_code: input.costCode.trim(),
    title: input.title.trim(),
    trade_code: input.tradeCode ?? null,
    package_id: input.packageId ?? null,
    estimate_granularity: input.estimateGranularity,
    costing_method: input.costingMethod,
    unit: input.unit.trim(),
    base_rate: input.baseRate,
    default_quantity: input.defaultQuantity ?? null,
    quantity_basis: input.quantityBasis ?? null,
    low_factor: input.lowFactor ?? null,
    mid_factor: input.midFactor ?? null,
    high_factor: input.highFactor ?? null,
    contingency_percent: input.contingencyPercent ?? null,
    notes: input.notes ?? null,
    sort_order: input.sortOrder ?? null
  };
}

function dashboardSummaryFromState(state: RuntimeState) {
  return {
    projectName: state.project.name,
    siteCount: state.sites.length,
    scenarioOptionCount: state.scenario_options.length,
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

function recentWritesFromState(state: RuntimeState) {
  return [...state.archicad_writes]
    .sort((left, right) => String(right.applied_at ?? "").localeCompare(String(left.applied_at ?? "")))
    .slice(0, 5);
}

async function writeState(state: RuntimeState): Promise<void> {
  if (isReadOnlyRuntime()) {
    throw new Error("Demo data is read-only in deployed serverless environments. Configure Supabase mode for writes.");
  }
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

function scenarioKindFor(scenario: RuntimeState["scenarios"][number]): string {
  if (scenario.scenario_kind) {
    return String(scenario.scenario_kind);
  }
  if (scenario.status === "template") {
    return "template";
  }
  if (statefulScenarioOptionExistsCache?.has(String(scenario.id))) {
    return scenario.status === "archived" ? "site_archived" : "site_active";
  }
  return "legacy";
}

let statefulScenarioOptionExistsCache: Set<string> | null = null;

function scenarioRowsForState(state: RuntimeState): ScenarioRow[] {
  statefulScenarioOptionExistsCache = new Set(
    state.scenario_options.map((option) => option.scenario_id).filter((id): id is string => Boolean(id))
  );
  try {
  return sortScenarios(
    state.scenarios.map((scenario) => ({
      id: String(scenario.id),
      name: String(scenario.name),
      status: String(scenario.status),
      scenarioKind: scenarioKindFor(scenario),
      parentScenarioId: scenario.parent_scenario_id ? String(scenario.parent_scenario_id) : null,
      templateScenarioId: scenario.template_scenario_id ? String(scenario.template_scenario_id) : null,
      operationalStateCount: state.operational_state.filter((item) => item.scenario_id === scenario.id).length,
      changeSetCount: state.change_sets.filter((item) => item.scenario_id === scenario.id).length
    }))
  );
  } finally {
    statefulScenarioOptionExistsCache = null;
  }
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

function validateScenarioOptionName(state: RuntimeState, optionId: string | null, siteId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Scenario option name is required");
  }
  if (
    state.scenario_options.some(
      (option) => option.site_id === siteId && option.name === trimmed && option.id !== (optionId ?? "")
    )
  ) {
    throw new Error(`Scenario option '${trimmed}' already exists for this site`);
  }
  return trimmed;
}

function defaultSourceScenarioId(state: RuntimeState, requested?: string | null) {
  if (requested) {
    getScenarioById(state, requested);
    return requested;
  }
  return (
    state.scenarios.find((scenario) => scenario.scenario_kind === "template" || scenario.status === "template")?.id ??
    getBaselineScenario(state).id
  );
}

function calculateTemplateItemBase(item: MasterCostTemplateItemRecord): number {
  return (item.default_quantity ?? 1) * item.base_rate;
}

function instantiateCostPlanFromTemplate(
  state: RuntimeState,
  scenarioOptionId: string,
  masterCostTemplateId?: string | null
) {
  if (!masterCostTemplateId) {
    return;
  }
  const template = state.master_cost_templates.find((item) => item.id === masterCostTemplateId);
  if (!template) {
    throw new Error(`Master cost template '${masterCostTemplateId}' was not found`);
  }
  const sourceItems = state.master_cost_template_items.filter(
    (item) => item.master_cost_template_id === masterCostTemplateId
  );
  const itemIdMap = new Map<string, string>();

  for (const item of sourceItems) {
    const nextId = randomUUID();
    itemIdMap.set(item.id, nextId);
    state.scenario_cost_plan_items.push({
      id: nextId,
      project_id: state.project.id,
      scenario_option_id: scenarioOptionId,
      master_cost_template_item_id: item.id,
      parent_item_id: item.parent_item_id ? itemIdMap.get(item.parent_item_id) ?? null : null,
      cost_code: item.cost_code,
      title: item.title,
      estimate_granularity: item.estimate_granularity,
      costing_method: item.costing_method,
      unit: item.unit,
      quantity: item.default_quantity ?? 1,
      rate: item.base_rate,
      range_key: "mid",
      confidence: item.estimate_granularity === "allowance" ? "early" : "normal",
      inclusion_status: "included",
      notes: item.notes ?? null
    });
  }

  const subtotal = sourceItems.reduce((total, item) => total + calculateTemplateItemBase(item), 0);
  for (const [rangeKey, fallbackFactor] of Object.entries(DEFAULT_COST_RANGE_FACTORS)) {
    const factor = sourceItems.length === 0 ? fallbackFactor : fallbackFactor;
    state.scenario_cost_ranges.push({
      id: randomUUID(),
      scenario_option_id: scenarioOptionId,
      range_key: rangeKey,
      label: `${rangeKey[0].toUpperCase()}${rangeKey.slice(1)}`,
      construction_cost: Math.round(subtotal * factor),
      professional_fees: Math.round(subtotal * factor * 0.08),
      contingency: Math.round(subtotal * factor * (rangeKey === "high" ? 0.12 : rangeKey === "low" ? 0.04 : 0.08)),
      statutory_fees: Math.round(subtotal * factor * 0.035),
      finance_cost: Math.round(subtotal * factor * 0.07),
      other_costs: Math.round(subtotal * factor * 0.025),
      notes: `Instantiated from ${template.name} master cost template`
    });
  }
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
    try {
      return await (await getSupabaseStore()).getDashboardSummary();
    } catch (error) {
      if (isLikelySupabaseTransportError(error)) {
        const state = await readState();
        return dashboardSummaryFromState(state);
      }
      throw error;
    }
  }
  const state = await readState();
  return dashboardSummaryFromState(state);
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

export async function getFeasibilityPortfolio(): Promise<FeasibilityPortfolio> {
  if (isSupabaseMode()) {
    try {
      const supabasePortfolio = await (await getSupabaseStore()).getFeasibilityPortfolio();
      if (supabasePortfolio.sites.length > 0) {
        return supabasePortfolio;
      }
    } catch (error) {
      if (!isLikelySupabaseTransportError(error)) {
        throw error;
      }
    }
  }
  const state = await readState();
  return buildFeasibilityPortfolio(state);
}

export async function getSiteFeasibility(siteId: string): Promise<SiteFeasibility | null> {
  const portfolio = await getFeasibilityPortfolio();
  return portfolio.sites.find((site) => site.id === siteId) ?? null;
}

export async function createSite(input: CreateSiteInput): Promise<{ siteId: string }> {
  if (await shouldUseSupabaseFeasibility()) {
    return (await getSupabaseStore()).createSite(input);
  }
  const state = await readState();
  const siteId = randomUUID();
  createDevelopmentSite(state, {
    ...input,
    id: siteId
  });
  await writeState(state);
  return { siteId };
}

export async function updateSite(input: UpdateSiteInput): Promise<void> {
  if (await shouldUseSupabaseFeasibility(input.siteId)) {
    return (await getSupabaseStore()).updateSite(input);
  }
  const state = await readState();
  updateDevelopmentSite(state, input.siteId, input);
  await writeState(state);
}

export async function archiveSite(siteId: string): Promise<void> {
  if (await shouldUseSupabaseFeasibility(siteId)) {
    return (await getSupabaseStore()).archiveSite(siteId);
  }
  const state = await readState();
  archiveDevelopmentSite(state, siteId);
  await writeState(state);
}

export async function createMasterCostTemplate(
  input: CreateMasterCostTemplateInput
): Promise<{ templateId: string }> {
  if (await shouldUseSupabaseBaseCosts()) {
    return (await getSupabaseStore()).createMasterCostTemplate(input);
  }
  const state = await readState();
  const templateId = randomUUID();
  state.master_cost_templates.push({
    id: templateId,
    project_id: state.project.id,
    name: validateMasterCostTemplateName(state, null, input.name),
    description: input.description ?? null,
    status: input.status ?? "active",
    template_type: input.templateType ?? null
  });
  await writeState(state);
  return { templateId };
}

export async function updateMasterCostTemplate(input: UpdateMasterCostTemplateInput): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(input.templateId)) {
    return (await getSupabaseStore()).updateMasterCostTemplate(input);
  }
  const state = await readState();
  const template = state.master_cost_templates.find((item) => item.id === input.templateId);
  if (!template) {
    throw new Error(`Master cost template '${input.templateId}' was not found`);
  }
  template.name = validateMasterCostTemplateName(state, input.templateId, input.name);
  template.description = input.description ?? null;
  template.status = input.status ?? template.status;
  template.template_type = input.templateType ?? null;
  await writeState(state);
}

export async function archiveMasterCostTemplate(templateId: string): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(templateId)) {
    return (await getSupabaseStore()).archiveMasterCostTemplate(templateId);
  }
  const state = await readState();
  const template = state.master_cost_templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error(`Master cost template '${templateId}' was not found`);
  }
  template.status = "archived";
  await writeState(state);
}

export async function createMasterCodeItem(input: CreateMasterCodeItemInput): Promise<{ itemId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createMasterCodeItem(input);
  }
  const state = await readState();
  if (!state.master_code_catalogs.some((catalog) => catalog.id === input.catalogId)) {
    throw new Error(`Master code catalog '${input.catalogId}' was not found`);
  }
  const itemId = randomUUID();
  state.master_code_items.push(masterCodeItemPayload(input, itemId));
  await writeState(state);
  return { itemId };
}

export async function updateMasterCodeItem(input: UpdateMasterCodeItemInput): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateMasterCodeItem(input);
  }
  const state = await readState();
  const index = state.master_code_items.findIndex((item) => item.id === input.itemId);
  if (index < 0) {
    throw new Error(`Master code item '${input.itemId}' was not found`);
  }
  state.master_code_items[index] = masterCodeItemPayload(input, input.itemId);
  await writeState(state);
}

export async function archiveMasterCodeItem(itemId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).archiveMasterCodeItem(itemId);
  }
  const state = await readState();
  const item = state.master_code_items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Master code item '${itemId}' was not found`);
  }
  item.status = "archived";
  await writeState(state);
}

export async function deleteMasterCodeItem(itemId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteMasterCodeItem(itemId);
  }
  const state = await readState();
  assertUnusedMasterCodeItem(state, itemId);
  state.master_code_items = state.master_code_items.filter((item) => item.id !== itemId);
  for (const item of state.master_code_items) {
    if (item.parent_item_id === itemId) {
      item.parent_item_id = null;
    }
  }
  await writeState(state);
}

export async function createMasterDatabaseItem(
  input: CreateMasterDatabaseItemInput
): Promise<{ itemId: string }> {
  if (await shouldUseSupabaseBaseCosts()) {
    return (await getSupabaseStore()).createMasterDatabaseItem(input);
  }
  const state = await readState();
  const itemId = randomUUID();
  state.master_cost_items.push(masterDatabaseItemPayload(state, input, itemId));
  if (input.sourceLabel) {
    state.master_cost_item_sources.push({
      id: randomUUID(),
      project_id: state.project.id,
      master_cost_item_id: itemId,
      source_type: "benchmark",
      source_label: input.sourceLabel,
      source_url: input.sourceUrl ?? null,
      confidence: "normal",
      notes: input.sourceNotes ?? null
    });
  }
  await writeState(state);
  return { itemId };
}

export async function updateMasterDatabaseItem(input: UpdateMasterDatabaseItemInput): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(input.itemId)) {
    return (await getSupabaseStore()).updateMasterDatabaseItem(input);
  }
  const state = await readState();
  const index = state.master_cost_items.findIndex((item) => item.id === input.itemId);
  if (index < 0) {
    throw new Error(`Master database item '${input.itemId}' was not found`);
  }
  state.master_cost_items[index] = masterDatabaseItemPayload(state, input, input.itemId);
  await writeState(state);
}

export async function archiveMasterDatabaseItem(itemId: string): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(itemId)) {
    return (await getSupabaseStore()).archiveMasterDatabaseItem(itemId);
  }
  const state = await readState();
  const item = state.master_cost_items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Master database item '${itemId}' was not found`);
  }
  item.status = "archived";
  await writeState(state);
}

export async function deleteMasterDatabaseItem(itemId: string): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(itemId)) {
    return (await getSupabaseStore()).deleteMasterDatabaseItem(itemId);
  }
  const state = await readState();
  assertUnusedOrDraftMasterItem(state, itemId);
  state.master_cost_items = state.master_cost_items.filter((item) => item.id !== itemId);
  state.master_cost_item_sources = state.master_cost_item_sources.filter((source) => source.master_cost_item_id !== itemId);
  state.master_cost_item_target_links = state.master_cost_item_target_links.filter((link) => link.master_cost_item_id !== itemId);
  await writeState(state);
}

export async function createMasterDatabaseItemSource(
  input: CreateMasterDatabaseItemSourceInput
): Promise<{ sourceId: string }> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostItemId)) {
    return (await getSupabaseStore()).createMasterDatabaseItemSource(input);
  }
  const state = await readState();
  if (!state.master_cost_items.some((item) => item.id === input.masterCostItemId)) {
    throw new Error(`Master database item '${input.masterCostItemId}' was not found`);
  }
  if (!input.sourceLabel.trim()) {
    throw new Error("Source label is required");
  }
  const sourceId = randomUUID();
  state.master_cost_item_sources.push({
    id: sourceId,
    project_id: state.project.id,
    master_cost_item_id: input.masterCostItemId,
    source_type: input.sourceType ?? "benchmark",
    source_label: input.sourceLabel.trim(),
    source_url: input.sourceUrl ?? null,
    source_date: input.sourceDate ?? null,
    confidence: input.confidence ?? null,
    notes: input.notes ?? null
  });
  await writeState(state);
  return { sourceId };
}

export async function updateMasterDatabaseItemSource(input: UpdateMasterDatabaseItemSourceInput): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostItemId)) {
    return (await getSupabaseStore()).updateMasterDatabaseItemSource(input);
  }
  const state = await readState();
  const source = state.master_cost_item_sources.find((item) => item.id === input.sourceId);
  if (!source) {
    throw new Error(`Master database source '${input.sourceId}' was not found`);
  }
  source.master_cost_item_id = input.masterCostItemId;
  source.source_type = input.sourceType ?? source.source_type;
  source.source_label = input.sourceLabel.trim();
  source.source_url = input.sourceUrl ?? null;
  source.source_date = input.sourceDate ?? null;
  source.confidence = input.confidence ?? null;
  source.notes = input.notes ?? null;
  await writeState(state);
}

export async function deleteMasterDatabaseItemSource(sourceId: string): Promise<void> {
  const state = await readState();
  const source = state.master_cost_item_sources.find((item) => item.id === sourceId);
  if (source && (await shouldUseSupabaseBaseCosts(source.master_cost_item_id))) {
    return (await getSupabaseStore()).deleteMasterDatabaseItemSource(sourceId);
  }
  state.master_cost_item_sources = state.master_cost_item_sources.filter((item) => item.id !== sourceId);
  await writeState(state);
}

export async function createMasterDatabaseTargetLink(
  input: CreateMasterDatabaseTargetLinkInput
): Promise<{ linkId: string }> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostItemId)) {
    return (await getSupabaseStore()).createMasterDatabaseTargetLink(input);
  }
  const state = await readState();
  if (!state.master_cost_items.some((item) => item.id === input.masterCostItemId)) {
    throw new Error(`Master database item '${input.masterCostItemId}' was not found`);
  }
  const linkId = randomUUID();
  state.master_cost_item_target_links.push({
    id: linkId,
    project_id: state.project.id,
    master_cost_item_id: input.masterCostItemId,
    target_type: input.targetType.trim(),
    target_ref: input.targetRef.trim(),
    link_basis: input.linkBasis ?? null,
    notes: input.notes ?? null
  });
  await writeState(state);
  return { linkId };
}

export async function updateMasterDatabaseTargetLink(input: UpdateMasterDatabaseTargetLinkInput): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostItemId)) {
    return (await getSupabaseStore()).updateMasterDatabaseTargetLink(input);
  }
  const state = await readState();
  const link = state.master_cost_item_target_links.find((item) => item.id === input.linkId);
  if (!link) {
    throw new Error(`Master database target link '${input.linkId}' was not found`);
  }
  link.master_cost_item_id = input.masterCostItemId;
  link.target_type = input.targetType.trim();
  link.target_ref = input.targetRef.trim();
  link.link_basis = input.linkBasis ?? null;
  link.notes = input.notes ?? null;
  await writeState(state);
}

export async function deleteMasterDatabaseTargetLink(linkId: string): Promise<void> {
  const state = await readState();
  const link = state.master_cost_item_target_links.find((item) => item.id === linkId);
  if (link && (await shouldUseSupabaseBaseCosts(link.master_cost_item_id))) {
    return (await getSupabaseStore()).deleteMasterDatabaseTargetLink(linkId);
  }
  state.master_cost_item_target_links = state.master_cost_item_target_links.filter((item) => item.id !== linkId);
  await writeState(state);
}

export async function addMasterDatabaseItemToTemplate(
  input: AddMasterDatabaseItemToTemplateInput
): Promise<{ itemId: string }> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostTemplateId)) {
    return (await getSupabaseStore()).addMasterDatabaseItemToTemplate(input);
  }
  const state = await readState();
  const sourceItem = state.master_cost_items.find((item) => item.id === input.masterCostItemId);
  if (!sourceItem) {
    throw new Error(`Master database item '${input.masterCostItemId}' was not found`);
  }
  if (!state.master_cost_templates.some((template) => template.id === input.masterCostTemplateId)) {
    throw new Error(`Master cost template '${input.masterCostTemplateId}' was not found`);
  }
  const itemId = randomUUID();
  state.master_cost_template_items.push({
    id: itemId,
    project_id: state.project.id,
    master_cost_template_id: input.masterCostTemplateId,
    master_cost_item_id: sourceItem.id,
    master_code_item_id: sourceItem.master_code_item_id ?? null,
    parent_item_id: input.parentItemId ?? null,
    cost_code: sourceItem.cost_code,
    title: sourceItem.title,
    trade_code: sourceItem.trade_code ?? null,
    package_id: sourceItem.package_id ?? null,
    estimate_granularity: sourceItem.estimate_granularity,
    costing_method: sourceItem.costing_method,
    unit: sourceItem.unit,
    base_rate: sourceItem.base_rate,
    default_quantity: input.defaultQuantity ?? 1,
    quantity_basis: input.quantityBasis ?? null,
    low_factor: input.lowFactor ?? null,
    mid_factor: input.midFactor ?? null,
    high_factor: input.highFactor ?? null,
    contingency_percent: input.contingencyPercent ?? null,
    notes: input.notes ?? sourceItem.notes ?? null,
    sort_order: input.sortOrder ?? null
  });
  await writeState(state);
  return { itemId };
}

export async function createMasterCostItem(input: CreateMasterCostItemInput): Promise<{ itemId: string }> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostTemplateId)) {
    return (await getSupabaseStore()).createMasterCostItem(input);
  }
  const state = await readState();
  const itemId = randomUUID();
  state.master_cost_template_items.push(masterCostItemPayload(state, input, itemId));
  await writeState(state);
  return { itemId };
}

export async function updateMasterCostItem(input: UpdateMasterCostItemInput): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(input.itemId)) {
    return (await getSupabaseStore()).updateMasterCostItem(input);
  }
  const state = await readState();
  const index = state.master_cost_template_items.findIndex((item) => item.id === input.itemId);
  if (index < 0) {
    throw new Error(`Master cost item '${input.itemId}' was not found`);
  }
  state.master_cost_template_items[index] = masterCostItemPayload(state, input, input.itemId);
  await writeState(state);
}

export async function deleteMasterCostItem(itemId: string): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(itemId)) {
    return (await getSupabaseStore()).deleteMasterCostItem(itemId);
  }
  const state = await readState();
  state.master_cost_template_items = state.master_cost_template_items.filter((item) => item.id !== itemId);
  state.master_cost_item_links = state.master_cost_item_links.filter((link) => link.master_cost_template_item_id !== itemId);
  await writeState(state);
}

export async function createMasterCostItemLink(input: CreateMasterCostItemLinkInput): Promise<{ linkId: string }> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostTemplateItemId)) {
    return (await getSupabaseStore()).createMasterCostItemLink(input);
  }
  const state = await readState();
  if (!state.master_cost_template_items.some((item) => item.id === input.masterCostTemplateItemId)) {
    throw new Error(`Master cost item '${input.masterCostTemplateItemId}' was not found`);
  }
  if (!input.targetType.trim()) throw new Error("Target type is required");
  if (!input.targetRef.trim()) throw new Error("Target reference is required");
  const linkId = randomUUID();
  state.master_cost_item_links.push({
    id: linkId,
    project_id: state.project.id,
    master_cost_template_item_id: input.masterCostTemplateItemId,
    target_type: input.targetType.trim(),
    target_ref: input.targetRef.trim(),
    link_basis: input.linkBasis ?? null,
    notes: input.notes ?? null
  });
  await writeState(state);
  return { linkId };
}

export async function updateMasterCostItemLink(input: UpdateMasterCostItemLinkInput): Promise<void> {
  if (await shouldUseSupabaseBaseCosts(input.masterCostTemplateItemId)) {
    return (await getSupabaseStore()).updateMasterCostItemLink(input);
  }
  const state = await readState();
  const link = state.master_cost_item_links.find((item) => item.id === input.linkId);
  if (!link) {
    throw new Error(`Master cost item link '${input.linkId}' was not found`);
  }
  link.master_cost_template_item_id = input.masterCostTemplateItemId;
  link.target_type = input.targetType.trim();
  link.target_ref = input.targetRef.trim();
  link.link_basis = input.linkBasis ?? null;
  link.notes = input.notes ?? null;
  await writeState(state);
}

export async function deleteMasterCostItemLink(linkId: string): Promise<void> {
  const state = await readState();
  const link = state.master_cost_item_links.find((item) => item.id === linkId);
  if (link && (await shouldUseSupabaseBaseCosts(link.master_cost_template_item_id))) {
    return (await getSupabaseStore()).deleteMasterCostItemLink(linkId);
  }
  state.master_cost_item_links = state.master_cost_item_links.filter((item) => item.id !== linkId);
  await writeState(state);
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
      scenario_kind: "legacy",
      parent_scenario_id: null
    });
  } else {
    const sourceScenario = getScenarioById(state, input.sourceScenarioId);
    state.scenarios.push({
      id: nextScenarioId,
      name,
      status: "draft",
      scenario_kind: "legacy",
      parent_scenario_id: sourceScenario.id
    });
    cloneScenarioState(state, sourceScenario.id, nextScenarioId);
  }

  await writeState(state);
  return { scenarioId: nextScenarioId };
}

export async function createScenarioTemplate(input: {
  name: string;
  sourceScenarioId?: string | null;
}): Promise<{ scenarioId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createScenarioTemplate(input);
  }
  const state = await readState();
  const name = validateScenarioName(state, null, input.name);
  const sourceScenarioId = defaultSourceScenarioId(state, input.sourceScenarioId);
  const scenarioId = randomUUID();
  const sourceScenario = getScenarioById(state, sourceScenarioId);
  state.scenarios.push({
    id: scenarioId,
    name,
    status: "template",
    scenario_kind: "template",
    parent_scenario_id: sourceScenario.id,
    template_scenario_id: null
  });
  cloneScenarioState(state, sourceScenario.id, scenarioId);
  await writeState(state);
  return { scenarioId };
}

export async function createSiteScenarioOption(
  input: CreateSiteScenarioOptionInput
): Promise<{ optionId: string; scenarioId: string | null }> {
  if (await shouldUseSupabaseFeasibility(input.siteId)) {
    return (await getSupabaseStore()).createSiteScenarioOption(input);
  }
  const state = await readState();
  const site = state.sites.find((item) => item.id === input.siteId);
  if (!site) {
    throw new Error(`Site '${input.siteId}' was not found`);
  }
  const name = validateScenarioOptionName(state, null, input.siteId, input.name);
  const optionId = randomUUID();
  const sourceScenarioId = defaultSourceScenarioId(state, input.templateScenarioId);
  const sourceScenario = getScenarioById(state, sourceScenarioId);
  let scenarioId: string | null = null;

  if (input.createDetailedScenario !== false) {
    scenarioId = randomUUID();
    const scenarioName = validateScenarioName(state, null, `${site.name} - ${name}`);
    state.scenarios.push({
      id: scenarioId,
      name: scenarioName,
      status: "active",
      scenario_kind: "site_active",
      parent_scenario_id: sourceScenario.id,
      template_scenario_id: sourceScenario.id
    });
    cloneScenarioState(state, sourceScenario.id, scenarioId);
  }

  state.scenario_options.push({
    id: optionId,
    site_id: input.siteId,
    scenario_id: scenarioId,
    scenario_template_id: sourceScenario.id,
    master_cost_template_id: input.masterCostTemplateId ?? null,
    name,
    configuration: input.configuration.trim() || name,
    dwellings: input.dwellings ?? null,
    gross_floor_area_sqm: input.grossFloorAreaSqm ?? null,
    planning_fit: input.planningFit ?? null,
    status: "testing",
    summary: input.summary ?? null,
    target_margin_percent: input.targetMarginPercent ?? null
  });

  state.sales_assumptions.push({
    id: randomUUID(),
    scenario_option_id: optionId,
    gross_realisation: input.grossRealisation ?? 0,
    average_sale_price: input.dwellings && input.grossRealisation ? Math.round(input.grossRealisation / input.dwellings) : null,
    sale_rate_per_month: null,
    settlement_months: null,
    notes: "Created from site scenario option form"
  });

  instantiateCostPlanFromTemplate(state, optionId, input.masterCostTemplateId);
  await writeState(state);
  return { optionId, scenarioId };
}

export async function updateScenarioOption(input: UpdateScenarioOptionInput): Promise<void> {
  if (await shouldUseSupabaseScenarioOption(input.optionId)) {
    return (await getSupabaseStore()).updateScenarioOption(input);
  }
  const state = await readState();
  const option = state.scenario_options.find((item) => item.id === input.optionId);
  if (!option) {
    throw new Error(`Scenario option '${input.optionId}' was not found`);
  }
  option.name = validateScenarioOptionName(state, input.optionId, option.site_id, input.name);
  option.configuration = input.configuration.trim() || option.name;
  option.status = input.status;
  option.dwellings = input.dwellings ?? null;
  option.gross_floor_area_sqm = input.grossFloorAreaSqm ?? null;
  option.planning_fit = input.planningFit ?? null;
  option.summary = input.summary ?? null;
  option.target_margin_percent = input.targetMarginPercent ?? null;
  await writeState(state);
}

export async function archiveScenarioOption(optionId: string): Promise<void> {
  if (await shouldUseSupabaseScenarioOption(optionId)) {
    return (await getSupabaseStore()).archiveScenarioOption(optionId);
  }
  const state = await readState();
  const option = state.scenario_options.find((item) => item.id === optionId);
  if (!option) {
    throw new Error(`Scenario option '${optionId}' was not found`);
  }
  option.status = "archived";
  if (option.scenario_id) {
    const scenario = getScenarioById(state, option.scenario_id);
    scenario.status = "archived";
    scenario.scenario_kind = "site_archived";
  }
  await writeState(state);
}

export async function deleteScenarioOption(optionId: string): Promise<void> {
  if (await shouldUseSupabaseScenarioOption(optionId)) {
    return (await getSupabaseStore()).deleteScenarioOption(optionId);
  }
  const state = await readState();
  const option = state.scenario_options.find((item) => item.id === optionId);
  if (!option) {
    throw new Error(`Scenario option '${optionId}' was not found`);
  }
  if (option.scenario_id && state.change_sets.some((item) => String(item.scenario_id ?? "") === option.scenario_id)) {
    throw new Error("Scenario options with change sets must be archived instead of deleted");
  }
  state.scenario_options = state.scenario_options.filter((item) => item.id !== optionId);
  state.scenario_cost_ranges = state.scenario_cost_ranges.filter((item) => item.scenario_option_id !== optionId);
  state.sales_assumptions = state.sales_assumptions.filter((item) => item.scenario_option_id !== optionId);
  state.archicad_links = state.archicad_links.filter((item) => item.scenario_option_id !== optionId);
  state.scenario_cost_plan_items = state.scenario_cost_plan_items.filter((item) => item.scenario_option_id !== optionId);
  if (option.scenario_id) {
    state.scenarios = state.scenarios.filter((item) => item.id !== option.scenario_id);
    state.operational_state = state.operational_state.filter((item) => String(item.scenario_id ?? "") !== option.scenario_id);
    state.linear_schedule_views = state.linear_schedule_views.filter((item) => String(item.scenario_id ?? "") !== option.scenario_id);
    const activityIds = new Set(
      state.linear_schedule_activities
        .filter((item) => String(item.scenario_id ?? "") === option.scenario_id)
        .map((item) => String(item.id))
    );
    state.linear_schedule_activities = state.linear_schedule_activities.filter(
      (item) => String(item.scenario_id ?? "") !== option.scenario_id
    );
    state.linear_progress_points = state.linear_progress_points.filter(
      (item) => !activityIds.has(String(item.linear_schedule_activity_id ?? ""))
    );
  }
  await writeState(state);
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
    try {
      return await (await getSupabaseStore()).getRecentWrites();
    } catch (error) {
      if (isLikelySupabaseTransportError(error)) {
        const state = await readState();
        return recentWritesFromState(state);
      }
      throw error;
    }
  }
  const state = await readState();
  return recentWritesFromState(state);
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
