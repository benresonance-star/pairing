import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import seedState from "../../../../shared/examples/demo_state.seed.json";
import { vocab } from "../../../../shared/contracts/api/index";
import { buildAssumptionGraphData, type AssumptionGraphData } from "./assumption-graph";
import { isSupabaseMode } from "./data-source";
import {
  buildFeasibilityPortfolio,
  buildFeasibilityMethodRuns,
  pinnedScenarioOptionsFromPortfolio,
  type FeasibilityMethodRun,
  type FeasibilityPortfolio,
  type PinnedScenarioOption,
  type SiteFeasibility
} from "./feasibility";
import { buildLinearScheduleData, type LinearScheduleData, type LinearScheduleFilters } from "./linear-schedule";
import { buildProjectNetworkData, type ProjectNetworkData } from "./project-network";
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
  ASSUMPTION_PARTICIPANT_ROLES,
  type AssumptionParticipantRole,
  type ChangeSetAction,
  type GovernedOperationalPatch,
  type MasterCodeItemRecord,
  type MasterCostItemRecord,
  type MasterCostTemplateItemRecord,
  type RuntimeState,
  type SitePatch
} from "./runtime-state";
import type {
  CreateOverviewActionTaskInput,
  OverviewActionTask,
  UpdateOverviewActionTaskInput
} from "./overview-action-tasks-types";

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

export type UpdateSalesAssumptionInput = {
  scenarioOptionId: string;
  grossRealisation: number;
  averageSalePrice?: number | null;
  saleRatePerMonth?: number | null;
  settlementMonths?: number | null;
  notes?: string | null;
};

export type UpdateScenarioCostRangeInput = {
  rangeId: string;
  scenarioOptionId: string;
  constructionCost: number;
  professionalFees?: number | null;
  contingency?: number | null;
  statutoryFees?: number | null;
  financeCost?: number | null;
  otherCosts?: number | null;
  notes?: string | null;
};

export type UpsertFeasibilityBranchTargetsInput = {
  branchId?: string | null;
  siteId: string;
  scenarioOptionId: string;
  scenarioId?: string | null;
  feasibilityTemplateId?: string | null;
  targetMarginPercent?: number | null;
  targetNetPositionRatio?: number | null;
};

export type CreateSiteInput = Omit<SitePatch, "status"> & {
  status?: string;
};

export type UpdateSiteInput = SitePatch & {
  siteId: string;
};

export type CreateSiteResourceInput = {
  siteId: string;
  resourceType: string;
  title: string;
  url?: string | null;
  storagePath?: string | null;
  sourceLabel?: string | null;
  notes?: string | null;
  status?: string | null;
};

export type UploadedSiteResourceFile = {
  storagePath: string;
  publicUrl: string;
  fileName: string;
};

export type UpdateSiteResourceInput = CreateSiteResourceInput & {
  resourceId: string;
};

export type UpsertSitePlanningHighlightInput = {
  siteId: string;
  highlightId?: string | null;
  sourceResourceId?: string | null;
  council?: string | null;
  planningScheme?: string | null;
  zoning?: string | null;
  overlays: string[];
  siteAreaSqm?: number | null;
  lotPlan?: string | null;
  heritageStatus?: string | null;
  floodStatus?: string | null;
  bushfireStatus?: string | null;
  vegetationStatus?: string | null;
  utilitiesStatus?: string | null;
  easements?: string | null;
  planningSummary?: string | null;
  sourceDate?: string | null;
  status?: string | null;
  matrixCellFlags?: Record<string, boolean> | null;
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

export type CreateNetworkInquiryInput = {
  title: string;
  question: string;
  linkedRefType?: string | null;
  linkedRefId?: string | null;
  createdBy?: string | null;
};

export type CreateNetworkInquiryMessageInput = {
  inquiryId: string;
  profileId?: string | null;
  authorLabel: string;
  authorType: string;
  message: string;
};

export type CreateNetworkWorkProductInput = {
  inquiryId?: string | null;
  profileId?: string | null;
  title: string;
  productType: string;
  summary?: string | null;
  linkedRefType?: string | null;
  linkedRefId?: string | null;
  linkNotes?: string | null;
};

export type CreateNetworkOrganisationInput = {
  name: string;
  organisationType: string;
  description?: string | null;
  status?: string | null;
};

export type UpdateNetworkOrganisationInput = CreateNetworkOrganisationInput & {
  organisationId: string;
};

export type CreateNetworkProfileInput = {
  organisationId?: string | null;
  displayName: string;
  profileType: string;
  category: string;
  domain: string;
  summary?: string | null;
  contactDetails?: string | null;
  preferredLlm?: string | null;
  status?: string | null;
};

export type UpdateNetworkProfileInput = CreateNetworkProfileInput & {
  profileId: string;
};

export type UpsertNetworkProfileCapabilityInput = {
  profileId: string;
  skills: string[];
  baseKnowledge?: string | null;
  scope?: string | null;
  constraints: string[];
  questionTypes: string[];
  outputTypes: string[];
  operatingInstructionsMd?: string | null;
  constraintsMd?: string | null;
  reviewPolicyMd?: string | null;
};

export type CreateNetworkKnowledgePackInput = {
  title: string;
  domain: string;
  instructions?: string | null;
  constraints: string[];
  sources: string[];
  tools: string[];
  outputPolicy?: string | null;
  status?: string | null;
};

export type UpdateNetworkKnowledgePackInput = CreateNetworkKnowledgePackInput & {
  knowledgePackId: string;
};

export type UpsertNetworkAgentCardInput = {
  profileId: string;
  modelLabel?: string | null;
  systemInstructions?: string | null;
  contextPolicy?: string | null;
  personaMd?: string | null;
  memoryMd?: string | null;
  toolPolicy: unknown;
  skillPolicy: unknown[];
  outputSchema: Record<string, unknown>;
  reviewPolicyMd?: string | null;
  escalationPolicyMd?: string | null;
  status?: string | null;
};

export type AssignAssumptionParticipantInput = {
  assumptionApplicationId: string;
  profileId: string;
  relationshipType: string;
  status?: string | null;
  confidence?: string | null;
  notes?: string | null;
  actionTitle?: string | null;
  actionPriority?: string | null;
  actionStage?: string | null;
  actionRiskIfDelayed?: string | null;
};

export type CreateAssumptionActionInput = {
  assumptionApplicationId: string;
  responsibleProfileId?: string | null;
  title: string;
  priority?: string | null;
  stage?: string | null;
  riskIfDelayed?: string | null;
  notes?: string | null;
  status?: string | null;
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

  const refreshFromSeed =
    process.env.CCP_REFRESH_RUNTIME_FROM_SEED === "1" || process.env.CCP_REFRESH_RUNTIME_FROM_SEED === "true";
  if (!refreshFromSeed) {
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

function isLikelySupabaseMissingRelationError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Could not find the table") || msg.includes("schema cache");
}

async function shouldUseSupabaseFeasibility(_siteId?: string | null): Promise<boolean> {
  if (!isSupabaseMode()) {
    return false;
  }
  try {
    await (await getSupabaseStore()).getFeasibilityPortfolio();
    return true;
  } catch (error) {
    if (isLikelySupabaseTransportError(error)) {
      return false;
    }
    throw error;
  }
}

async function shouldUseSupabaseScenarioOption(_optionId: string): Promise<boolean> {
  if (!isSupabaseMode()) {
    return false;
  }
  try {
    await (await getSupabaseStore()).getFeasibilityPortfolio();
    return true;
  } catch (error) {
    if (isLikelySupabaseTransportError(error)) {
      return false;
    }
    throw error;
  }
}

async function shouldUseSupabaseBaseCosts(_templateOrItemId?: string | null): Promise<boolean> {
  if (!isSupabaseMode()) {
    return false;
  }
  try {
    await (await getSupabaseStore()).getFeasibilityPortfolio();
    return true;
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

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function hierarchyForView(view: Record<string, unknown>) {
  const metadata = objectValue(view.metadata_json);
  const hierarchy = objectValue(metadata.gantt_hierarchy);
  const nodes = Array.isArray(hierarchy.nodes)
    ? hierarchy.nodes
        .map((entry) => objectValue(entry))
        .filter((entry) => typeof entry.id === "string")
    : [];
  const activityLinks = Array.isArray(hierarchy.activity_links)
    ? hierarchy.activity_links.map((entry) => objectValue(entry))
    : [];
  const dependencies = Array.isArray(hierarchy.dependencies)
    ? hierarchy.dependencies.map((entry) => objectValue(entry))
    : [];

  return { metadata, hierarchy, nodes, activityLinks, dependencies };
}

function saveHierarchyForView(
  view: Record<string, unknown>,
  next: {
    metadata: Record<string, unknown>;
    hierarchy: Record<string, unknown>;
    nodes: Record<string, unknown>[];
    activityLinks: Record<string, unknown>[];
    dependencies: Record<string, unknown>[];
  }
) {
  view.metadata_json = {
    ...next.metadata,
    gantt_hierarchy: {
      ...next.hierarchy,
      nodes: next.nodes,
      activity_links: next.activityLinks,
      dependencies: next.dependencies
    }
  };
}

function scheduleViewForScenario(state: RuntimeState, scenarioId: string) {
  getScenarioById(state, scenarioId);
  const view = state.linear_schedule_views.find((item) => String(item.scenario_id ?? "") === scenarioId);
  if (!view) {
    throw new Error("No scenario schedule view exists for this scenario");
  }
  return view;
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
      return await (await getSupabaseStore()).getFeasibilityPortfolio();
    } catch (error) {
      if (isLikelySupabaseTransportError(error)) {
        const state = await readState();
        return buildFeasibilityPortfolio(state);
      }
      throw error;
    }
  }
  const state = await readState();
  return buildFeasibilityPortfolio(state);
}

export async function getFeasibilityMethodRuns(): Promise<FeasibilityMethodRun[]> {
  if (isSupabaseMode()) {
    try {
      return await (await getSupabaseStore()).getFeasibilityMethodRuns();
    } catch (error) {
      if (isLikelySupabaseTransportError(error)) {
        const state = await readState();
        return buildFeasibilityMethodRuns(state);
      }
      throw error;
    }
  }
  const state = await readState();
  return buildFeasibilityMethodRuns(state);
}

export async function getAssumptionGraphData(): Promise<AssumptionGraphData> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).getAssumptionGraphData();
  }
  const state = await readState();
  return buildAssumptionGraphData(state);
}

export async function getPinnedScenarioOptions(): Promise<PinnedScenarioOption[]> {
  return pinnedScenarioOptionsFromPortfolio(await getFeasibilityPortfolio());
}

export type {
  CreateOverviewActionTaskInput,
  OverviewActionTask,
  OverviewActionTaskPriority,
  UpdateOverviewActionTaskInput
} from "./overview-action-tasks-types";

type OverviewActionTaskSummaryInput = {
  siteCount: number;
  queuedCount: number;
  syncFailureCount: number;
};

function demoOverviewActionTasksFromSummary(summary: OverviewActionTaskSummaryInput): OverviewActionTask[] {
  return [
    {
      id: "demo-overview-task-1",
      title: "Review site pipeline",
      notes: `${summary.siteCount} active sites need option triage`,
      priority: "HIGH",
      linkPath: "/sites",
      sortOrder: 0
    },
    {
      id: "demo-overview-task-2",
      title: "Validate scenario evidence",
      notes: "Check cost, planning fit, programme, and margin",
      priority: "MEDIUM",
      linkPath: "/feasibility",
      sortOrder: 1
    },
    {
      id: "demo-overview-task-3",
      title: "Clear queued approvals",
      notes: `${summary.queuedCount} changes waiting for model sync`,
      priority: summary.queuedCount > 0 ? "MEDIUM" : "LOW",
      linkPath: "/change-sets",
      sortOrder: 2
    },
    {
      id: "demo-overview-task-4",
      title: "Investigate sync failures",
      notes:
        summary.syncFailureCount > 0
          ? `${summary.syncFailureCount} failures need attention`
          : "No failures recorded",
      priority: summary.syncFailureCount > 0 ? "HIGH" : "LOW",
      linkPath: "/integrations/archicad",
      sortOrder: 3
    }
  ];
}

export async function getOverviewActionTasks(summary: OverviewActionTaskSummaryInput): Promise<OverviewActionTask[]> {
  if (isSupabaseMode()) {
    try {
      return await (await getSupabaseStore()).listOverviewActionTasks();
    } catch (error) {
      if (isLikelySupabaseTransportError(error) || isLikelySupabaseMissingRelationError(error)) {
        return demoOverviewActionTasksFromSummary(summary);
      }
      throw error;
    }
  }
  return demoOverviewActionTasksFromSummary(summary);
}

function assertSupabaseForOverviewTasks(): void {
  if (!isSupabaseMode()) {
    throw new Error("Overview action tasks can only be edited when CCP_DATA_SOURCE=supabase.");
  }
}

export async function createOverviewActionTask(input: CreateOverviewActionTaskInput): Promise<OverviewActionTask> {
  assertSupabaseForOverviewTasks();
  return (await getSupabaseStore()).createOverviewActionTask(input);
}

export async function updateOverviewActionTask(id: string, patch: UpdateOverviewActionTaskInput): Promise<void> {
  assertSupabaseForOverviewTasks();
  return (await getSupabaseStore()).updateOverviewActionTask(id, patch);
}

export async function deleteOverviewActionTask(id: string): Promise<void> {
  assertSupabaseForOverviewTasks();
  return (await getSupabaseStore()).deleteOverviewActionTask(id);
}

export async function reorderOverviewActionTasks(orderedIds: string[]): Promise<void> {
  assertSupabaseForOverviewTasks();
  return (await getSupabaseStore()).reorderOverviewActionTasks(orderedIds);
}

export async function getProjectNetworkData(): Promise<ProjectNetworkData> {
  if (isSupabaseMode()) {
    try {
      const supabaseData = await (await getSupabaseStore()).getProjectNetworkData();
      if (supabaseData.profiles.length > 0) {
        return supabaseData;
      }
    } catch (error) {
      if (!isLikelySupabaseTransportError(error)) {
        throw error;
      }
    }
  }
  const state = await readState();
  return buildProjectNetworkData(state);
}

function requireNetworkProfile(state: RuntimeState, profileId: string) {
  const profile = state.network_profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Network profile '${profileId}' was not found`);
  }
  return profile;
}

function requireNetworkKnowledgePack(state: RuntimeState, knowledgePackId: string) {
  const pack = state.network_knowledge_packs.find((item) => item.id === knowledgePackId);
  if (!pack) {
    throw new Error(`Knowledge pack '${knowledgePackId}' was not found`);
  }
  return pack;
}

function requireAssumptionApplication(state: RuntimeState, assumptionApplicationId: string) {
  const application = state.assumption_applications.find((item) => item.id === assumptionApplicationId);
  if (!application) {
    throw new Error(`Assumption application '${assumptionApplicationId}' was not found`);
  }
  return application;
}

function requireAssumptionValidation(state: RuntimeState, validationId: string) {
  const validation = state.assumption_validations.find((item) => item.id === validationId);
  if (!validation) {
    throw new Error(`Assumption participant assignment '${validationId}' was not found`);
  }
  return validation;
}

function normalizeAssumptionParticipantRole(role: string): AssumptionParticipantRole {
  if ((ASSUMPTION_PARTICIPANT_ROLES as readonly string[]).includes(role)) {
    return role as AssumptionParticipantRole;
  }
  throw new Error(`Unsupported assumption participant role '${role}'`);
}

function hasOpenAssumptionActionForProfile(state: RuntimeState, assumptionApplicationId: string, profileId: string): boolean {
  return state.assumption_actions.some(
    (action) =>
      action.assumption_application_id === assumptionApplicationId &&
      action.responsible_profile_id === profileId &&
      !["done", "completed", "cancelled", "archived"].includes(action.status)
  );
}

function assertUnusedNetworkOrganisation(state: RuntimeState, organisationId: string) {
  if (state.network_profiles.some((item) => item.organisation_id === organisationId)) {
    throw new Error("Organisations assigned to profiles must be archived instead of deleted");
  }
}

function assertUnusedNetworkProfile(state: RuntimeState, profileId: string) {
  const isUsed =
    state.network_inquiry_messages.some((item) => item.profile_id === profileId) ||
    state.network_work_products.some((item) => item.profile_id === profileId) ||
    state.network_agent_cards.some((item) => item.profile_id === profileId) ||
    state.network_agent_session_participants.some((item) => item.profile_id === profileId) ||
    state.network_agent_messages.some((item) => item.profile_id === profileId) ||
    state.network_agent_tool_calls.some((item) => item.profile_id === profileId) ||
    state.network_agent_outputs.some((item) => item.profile_id === profileId);
  if (isUsed) {
    throw new Error("Profiles with inquiries, work products, or agent runtime records must be archived instead of deleted");
  }
}

function assertUnusedKnowledgePack(state: RuntimeState, knowledgePackId: string) {
  if (state.network_profile_knowledge_packs.some((item) => item.knowledge_pack_id === knowledgePackId)) {
    throw new Error("Knowledge packs assigned to profiles must be archived instead of deleted");
  }
}

export async function createNetworkOrganisation(input: CreateNetworkOrganisationInput): Promise<{ organisationId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createNetworkOrganisation(input);
  }
  const name = input.name.trim();
  const organisationType = input.organisationType.trim();
  if (!name) throw new Error("Organisation name is required");
  if (!organisationType) throw new Error("Organisation type is required");

  const state = await readState();
  const organisationId = randomUUID();
  state.network_organisations.push({
    id: organisationId,
    project_id: state.project.id,
    name,
    organisation_type: organisationType,
    description: input.description?.trim() || null,
    status: input.status?.trim() || "active"
  });
  await writeState(state);
  return { organisationId };
}

export async function updateNetworkOrganisation(input: UpdateNetworkOrganisationInput): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateNetworkOrganisation(input);
  }
  const state = await readState();
  const organisation = state.network_organisations.find((item) => item.id === input.organisationId);
  if (!organisation) throw new Error(`Network organisation '${input.organisationId}' was not found`);
  organisation.name = input.name.trim();
  organisation.organisation_type = input.organisationType.trim();
  organisation.description = input.description?.trim() || null;
  organisation.status = input.status?.trim() || "active";
  await writeState(state);
}

export async function archiveNetworkOrganisation(organisationId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).archiveNetworkOrganisation(organisationId);
  }
  const state = await readState();
  const organisation = state.network_organisations.find((item) => item.id === organisationId);
  if (!organisation) throw new Error(`Network organisation '${organisationId}' was not found`);
  organisation.status = "archived";
  await writeState(state);
}

export async function deleteNetworkOrganisation(organisationId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteNetworkOrganisation(organisationId);
  }
  const state = await readState();
  assertUnusedNetworkOrganisation(state, organisationId);
  state.network_organisations = state.network_organisations.filter((item) => item.id !== organisationId);
  await writeState(state);
}

export async function createNetworkProfile(input: CreateNetworkProfileInput): Promise<{ profileId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createNetworkProfile(input);
  }
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("Profile display name is required");
  const state = await readState();
  if (input.organisationId && !state.network_organisations.some((item) => item.id === input.organisationId)) {
    throw new Error(`Network organisation '${input.organisationId}' was not found`);
  }
  const profileId = randomUUID();
  state.network_profiles.push({
    id: profileId,
    project_id: state.project.id,
    organisation_id: input.organisationId ?? null,
    display_name: displayName,
    profile_type: input.profileType.trim() || "human",
    category: input.category.trim() || "Developer Team",
    domain: input.domain.trim() || "General",
    summary: input.summary?.trim() || null,
    contact_details: input.contactDetails?.trim() || null,
    preferred_llm: input.preferredLlm?.trim() || null,
    status: input.status?.trim() || "active"
  });
  await writeState(state);
  return { profileId };
}

export async function updateNetworkProfile(input: UpdateNetworkProfileInput): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateNetworkProfile(input);
  }
  const state = await readState();
  const profile = requireNetworkProfile(state, input.profileId);
  if (input.organisationId && !state.network_organisations.some((item) => item.id === input.organisationId)) {
    throw new Error(`Network organisation '${input.organisationId}' was not found`);
  }
  profile.organisation_id = input.organisationId ?? null;
  profile.display_name = input.displayName.trim();
  profile.profile_type = input.profileType.trim() || "human";
  profile.category = input.category.trim() || "Developer Team";
  profile.domain = input.domain.trim() || "General";
  profile.summary = input.summary?.trim() || null;
  profile.contact_details = input.contactDetails?.trim() || null;
  profile.preferred_llm = input.preferredLlm?.trim() || null;
  profile.status = input.status?.trim() || "active";
  await writeState(state);
}

export async function archiveNetworkProfile(profileId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).archiveNetworkProfile(profileId);
  }
  const state = await readState();
  requireNetworkProfile(state, profileId).status = "archived";
  await writeState(state);
}

export async function deleteNetworkProfile(profileId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteNetworkProfile(profileId);
  }
  const state = await readState();
  assertUnusedNetworkProfile(state, profileId);
  state.network_profiles = state.network_profiles.filter((item) => item.id !== profileId);
  state.network_profile_capabilities = state.network_profile_capabilities.filter((item) => item.profile_id !== profileId);
  state.network_profile_knowledge_packs = state.network_profile_knowledge_packs.filter((item) => item.profile_id !== profileId);
  await writeState(state);
}

export async function upsertNetworkProfileCapability(input: UpsertNetworkProfileCapabilityInput): Promise<{ capabilityId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).upsertNetworkProfileCapability(input);
  }
  const state = await readState();
  requireNetworkProfile(state, input.profileId);
  let capability = state.network_profile_capabilities.find((item) => item.profile_id === input.profileId);
  if (!capability) {
    capability = {
      id: randomUUID(),
      project_id: state.project.id,
      profile_id: input.profileId
    };
    state.network_profile_capabilities.push(capability);
  }
  capability.skills_json = input.skills;
  capability.base_knowledge = input.baseKnowledge?.trim() || null;
  capability.scope = input.scope?.trim() || null;
  capability.constraints_json = input.constraints;
  capability.question_types_json = input.questionTypes;
  capability.output_types_json = input.outputTypes;
  capability.operating_instructions_md = input.operatingInstructionsMd?.trim() || null;
  capability.constraints_md = input.constraintsMd?.trim() || null;
  capability.review_policy_md = input.reviewPolicyMd?.trim() || null;
  await writeState(state);
  return { capabilityId: capability.id };
}

export async function deleteNetworkProfileCapability(profileId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteNetworkProfileCapability(profileId);
  }
  const state = await readState();
  state.network_profile_capabilities = state.network_profile_capabilities.filter((item) => item.profile_id !== profileId);
  await writeState(state);
}

export async function createNetworkKnowledgePack(input: CreateNetworkKnowledgePackInput): Promise<{ knowledgePackId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createNetworkKnowledgePack(input);
  }
  const title = input.title.trim();
  const domain = input.domain.trim();
  if (!title) throw new Error("Knowledge pack title is required");
  if (!domain) throw new Error("Knowledge pack domain is required");
  const state = await readState();
  const knowledgePackId = randomUUID();
  state.network_knowledge_packs.push({
    id: knowledgePackId,
    project_id: state.project.id,
    title,
    domain,
    instructions: input.instructions?.trim() || null,
    constraints_json: input.constraints,
    sources_json: input.sources,
    tools_json: input.tools,
    output_policy: input.outputPolicy?.trim() || null,
    status: input.status?.trim() || "active"
  });
  await writeState(state);
  return { knowledgePackId };
}

export async function updateNetworkKnowledgePack(input: UpdateNetworkKnowledgePackInput): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateNetworkKnowledgePack(input);
  }
  const state = await readState();
  const pack = requireNetworkKnowledgePack(state, input.knowledgePackId);
  pack.title = input.title.trim();
  pack.domain = input.domain.trim();
  pack.instructions = input.instructions?.trim() || null;
  pack.constraints_json = input.constraints;
  pack.sources_json = input.sources;
  pack.tools_json = input.tools;
  pack.output_policy = input.outputPolicy?.trim() || null;
  pack.status = input.status?.trim() || "active";
  await writeState(state);
}

export async function archiveNetworkKnowledgePack(knowledgePackId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).archiveNetworkKnowledgePack(knowledgePackId);
  }
  const state = await readState();
  requireNetworkKnowledgePack(state, knowledgePackId).status = "archived";
  await writeState(state);
}

export async function deleteNetworkKnowledgePack(knowledgePackId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteNetworkKnowledgePack(knowledgePackId);
  }
  const state = await readState();
  assertUnusedKnowledgePack(state, knowledgePackId);
  state.network_knowledge_packs = state.network_knowledge_packs.filter((item) => item.id !== knowledgePackId);
  await writeState(state);
}

export async function assignKnowledgePackToProfile(profileId: string, knowledgePackId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).assignKnowledgePackToProfile(profileId, knowledgePackId);
  }
  const state = await readState();
  requireNetworkProfile(state, profileId);
  requireNetworkKnowledgePack(state, knowledgePackId);
  if (!state.network_profile_knowledge_packs.some((item) => item.profile_id === profileId && item.knowledge_pack_id === knowledgePackId)) {
    state.network_profile_knowledge_packs.push({
      id: randomUUID(),
      project_id: state.project.id,
      profile_id: profileId,
      knowledge_pack_id: knowledgePackId
    });
  }
  await writeState(state);
}

export async function unassignKnowledgePackFromProfile(profileId: string, knowledgePackId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).unassignKnowledgePackFromProfile(profileId, knowledgePackId);
  }
  const state = await readState();
  state.network_profile_knowledge_packs = state.network_profile_knowledge_packs.filter(
    (item) => !(item.profile_id === profileId && item.knowledge_pack_id === knowledgePackId)
  );
  await writeState(state);
}

export async function assignAssumptionParticipant(input: AssignAssumptionParticipantInput): Promise<{ validationId: string; actionId?: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).assignAssumptionParticipant(input);
  }
  const role = normalizeAssumptionParticipantRole(input.relationshipType);
  const state = await readState();
  requireAssumptionApplication(state, input.assumptionApplicationId);
  requireNetworkProfile(state, input.profileId);

  const existingOwner = state.assumption_validations.find(
    (item) => item.assumption_application_id === input.assumptionApplicationId && item.relationship_type === "accountable_owner"
  );

  let validation =
    role === "accountable_owner" && existingOwner
      ? existingOwner
      : state.assumption_validations.find(
          (item) =>
            item.assumption_application_id === input.assumptionApplicationId &&
            item.profile_id === input.profileId &&
            item.relationship_type === role
        );
  if (!validation) {
    validation = {
      id: randomUUID(),
      project_id: state.project.id,
      assumption_application_id: input.assumptionApplicationId,
      profile_id: input.profileId,
      relationship_type: role,
      status: "pending"
    };
    state.assumption_validations.push(validation);
  }
  validation.profile_id = input.profileId;
  validation.relationship_type = role;
  validation.status = input.status?.trim() || "pending";
  validation.confidence = input.confidence?.trim() || null;
  validation.notes = input.notes?.trim() || null;

  const actionTitle = input.actionTitle?.trim();
  const actionId = actionTitle
    ? await createAssumptionActionInState(state, {
        assumptionApplicationId: input.assumptionApplicationId,
        responsibleProfileId: input.profileId,
        title: actionTitle,
        priority: input.actionPriority,
        stage: input.actionStage,
        riskIfDelayed: input.actionRiskIfDelayed,
        status: "open"
      })
    : undefined;

  await writeState(state);
  return { validationId: validation.id, actionId };
}

async function createAssumptionActionInState(state: RuntimeState, input: CreateAssumptionActionInput): Promise<string> {
  requireAssumptionApplication(state, input.assumptionApplicationId);
  if (input.responsibleProfileId) {
    requireNetworkProfile(state, input.responsibleProfileId);
  }
  const title = input.title.trim();
  if (!title) throw new Error("Assumption action title is required");
  const actionId = randomUUID();
  state.assumption_actions.push({
    id: actionId,
    project_id: state.project.id,
    assumption_application_id: input.assumptionApplicationId,
    title,
    priority: input.priority?.trim() || "MEDIUM",
    responsible_profile_id: input.responsibleProfileId || null,
    stage: input.stage?.trim() || null,
    risk_if_delayed: input.riskIfDelayed?.trim() || null,
    status: input.status?.trim() || "open",
    notes: input.notes?.trim() || null
  });
  return actionId;
}

export async function createAssumptionAction(input: CreateAssumptionActionInput): Promise<{ actionId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createAssumptionAction(input);
  }
  const state = await readState();
  const actionId = await createAssumptionActionInState(state, input);
  await writeState(state);
  return { actionId };
}

export async function unassignAssumptionParticipant(validationId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).unassignAssumptionParticipant(validationId);
  }
  const state = await readState();
  const validation = requireAssumptionValidation(state, validationId);
  if (
    validation.relationship_type === "accountable_owner" &&
    hasOpenAssumptionActionForProfile(state, validation.assumption_application_id, validation.profile_id)
  ) {
    throw new Error("Resolve or reassign open actions before removing the accountable owner");
  }
  state.assumption_validations = state.assumption_validations.filter((item) => item.id !== validationId);
  await writeState(state);
}

export async function upsertNetworkAgentCard(input: UpsertNetworkAgentCardInput): Promise<{ agentCardId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).upsertNetworkAgentCard(input);
  }
  const state = await readState();
  requireNetworkProfile(state, input.profileId);
  let card = state.network_agent_cards.find((item) => item.profile_id === input.profileId);
  if (!card) {
    card = {
      id: randomUUID(),
      project_id: state.project.id,
      profile_id: input.profileId,
      status: "active"
    };
    state.network_agent_cards.push(card);
  }
  card.model_label = input.modelLabel?.trim() || null;
  card.system_instructions = input.systemInstructions?.trim() || null;
  card.context_policy = input.contextPolicy?.trim() || null;
  card.persona_md = input.personaMd?.trim() || null;
  card.memory_md = input.memoryMd?.trim() || null;
  card.tool_policy_json = input.toolPolicy;
  card.skill_policy_json = input.skillPolicy;
  card.output_schema_json = input.outputSchema;
  card.review_policy_md = input.reviewPolicyMd?.trim() || null;
  card.escalation_policy_md = input.escalationPolicyMd?.trim() || null;
  card.status = input.status?.trim() || "active";
  await writeState(state);
  return { agentCardId: card.id };
}

export async function createNetworkInquiry(input: CreateNetworkInquiryInput): Promise<{ inquiryId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createNetworkInquiry(input);
  }
  const title = input.title.trim();
  const question = input.question.trim();
  if (!title) {
    throw new Error("Inquiry title is required");
  }
  if (!question) {
    throw new Error("Inquiry question is required");
  }

  const state = await readState();
  const inquiryId = randomUUID();
  state.network_inquiries.push({
    id: inquiryId,
    project_id: state.project.id,
    title,
    question,
    status: "open",
    linked_ref_type: input.linkedRefType ?? null,
    linked_ref_id: input.linkedRefId ?? null,
    created_by: input.createdBy ?? "Project team",
    created_at: new Date().toISOString()
  });
  await writeState(state);
  return { inquiryId };
}

export async function createNetworkInquiryMessage(input: CreateNetworkInquiryMessageInput): Promise<{ messageId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createNetworkInquiryMessage(input);
  }
  const message = input.message.trim();
  if (!message) {
    throw new Error("Message is required");
  }
  const state = await readState();
  const inquiry = state.network_inquiries.find((item) => item.id === input.inquiryId);
  if (!inquiry) {
    throw new Error(`Inquiry '${input.inquiryId}' was not found`);
  }
  if (input.profileId && !state.network_profiles.some((item) => item.id === input.profileId)) {
    throw new Error(`Network profile '${input.profileId}' was not found`);
  }

  const messageId = randomUUID();
  state.network_inquiry_messages.push({
    id: messageId,
    project_id: state.project.id,
    inquiry_id: inquiry.id,
    profile_id: input.profileId ?? null,
    author_label: input.authorLabel.trim() || "Project team",
    author_type: input.authorType.trim() || "human",
    message,
    citations_json: [],
    created_at: new Date().toISOString()
  });
  await writeState(state);
  return { messageId };
}

export async function createNetworkWorkProduct(input: CreateNetworkWorkProductInput): Promise<{ workProductId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createNetworkWorkProduct(input);
  }
  const title = input.title.trim();
  if (!title) {
    throw new Error("Work product title is required");
  }
  const state = await readState();
  if (input.inquiryId && !state.network_inquiries.some((item) => item.id === input.inquiryId)) {
    throw new Error(`Inquiry '${input.inquiryId}' was not found`);
  }
  if (input.profileId && !state.network_profiles.some((item) => item.id === input.profileId)) {
    throw new Error(`Network profile '${input.profileId}' was not found`);
  }

  const workProductId = randomUUID();
  state.network_work_products.push({
    id: workProductId,
    project_id: state.project.id,
    inquiry_id: input.inquiryId ?? null,
    profile_id: input.profileId ?? null,
    title,
    product_type: input.productType.trim() || "brief",
    status: "draft",
    summary: input.summary?.trim() || null,
    created_at: new Date().toISOString()
  });
  if (input.linkedRefType && input.linkedRefId) {
    state.network_work_product_links.push({
      id: randomUUID(),
      project_id: state.project.id,
      work_product_id: workProductId,
      linked_ref_type: input.linkedRefType,
      linked_ref_id: input.linkedRefId,
      notes: input.linkNotes ?? null
    });
  }
  await writeState(state);
  return { workProductId };
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

export async function createSiteResource(input: CreateSiteResourceInput): Promise<{ resourceId: string }> {
  if (await shouldUseSupabaseFeasibility(input.siteId)) {
    return (await getSupabaseStore()).createSiteResource(input);
  }
  const state = await readState();
  if (!state.sites.some((site) => site.id === input.siteId)) {
    throw new Error(`Site '${input.siteId}' was not found`);
  }
  const title = input.title.trim();
  if (!title) throw new Error("Resource title is required");
  const resourceId = randomUUID();
  state.site_resources.push({
    id: resourceId,
    project_id: state.project.id,
    site_id: input.siteId,
    resource_type: input.resourceType.trim() || "other",
    title,
    url: input.url?.trim() || null,
    storage_path: input.storagePath?.trim() || null,
    source_label: input.sourceLabel?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status?.trim() || "active",
    created_at: new Date().toISOString()
  });
  await writeState(state);
  return { resourceId };
}

export async function uploadSiteResourceFile(siteId: string, file: File): Promise<UploadedSiteResourceFile> {
  if (await shouldUseSupabaseFeasibility(siteId)) {
    return (await getSupabaseStore()).uploadSiteResourceFile(siteId, file);
  }
  if (!file || file.size === 0) {
    throw new Error("No file was selected for upload");
  }
  const fileName = file.name.trim() || "upload.bin";
  return {
    storagePath: `demo/site-resources/${siteId}/${randomUUID()}-${fileName}`,
    publicUrl: "",
    fileName
  };
}

export async function updateSiteResource(input: UpdateSiteResourceInput): Promise<void> {
  if (await shouldUseSupabaseFeasibility(input.siteId)) {
    return (await getSupabaseStore()).updateSiteResource(input);
  }
  const state = await readState();
  const resource = state.site_resources.find((item) => item.id === input.resourceId);
  if (!resource) throw new Error(`Site resource '${input.resourceId}' was not found`);
  resource.resource_type = input.resourceType.trim() || "other";
  resource.title = input.title.trim();
  resource.url = input.url?.trim() || null;
  resource.storage_path = input.storagePath?.trim() || null;
  resource.source_label = input.sourceLabel?.trim() || null;
  resource.notes = input.notes?.trim() || null;
  resource.status = input.status?.trim() || "active";
  await writeState(state);
}

export async function archiveSiteResource(siteId: string, resourceId: string): Promise<void> {
  if (await shouldUseSupabaseFeasibility(siteId)) {
    return (await getSupabaseStore()).archiveSiteResource(siteId, resourceId);
  }
  const state = await readState();
  const resource = state.site_resources.find((item) => item.id === resourceId);
  if (!resource) throw new Error(`Site resource '${resourceId}' was not found`);
  resource.status = "archived";
  await writeState(state);
}

export async function deleteSiteResource(siteId: string, resourceId: string): Promise<void> {
  if (await shouldUseSupabaseFeasibility(siteId)) {
    return (await getSupabaseStore()).deleteSiteResource(siteId, resourceId);
  }
  const state = await readState();
  state.site_resources = state.site_resources.filter((item) => item.id !== resourceId);
  await writeState(state);
}

export async function upsertSitePlanningHighlight(input: UpsertSitePlanningHighlightInput): Promise<{ highlightId: string }> {
  if (await shouldUseSupabaseFeasibility(input.siteId)) {
    return (await getSupabaseStore()).upsertSitePlanningHighlight(input);
  }
  const state = await readState();
  if (!state.sites.some((site) => site.id === input.siteId)) {
    throw new Error(`Site '${input.siteId}' was not found`);
  }
  let highlight = input.highlightId
    ? state.site_planning_highlights.find((item) => item.id === input.highlightId)
    : state.site_planning_highlights.find((item) => item.site_id === input.siteId && item.status !== "archived");
  if (!highlight) {
    highlight = {
      id: randomUUID(),
      project_id: state.project.id,
      site_id: input.siteId,
      status: "active",
      created_at: new Date().toISOString()
    };
    state.site_planning_highlights.push(highlight);
  }
  highlight.source_resource_id = input.sourceResourceId ?? null;
  highlight.council = input.council?.trim() || null;
  highlight.planning_scheme = input.planningScheme?.trim() || null;
  highlight.zoning = input.zoning?.trim() || null;
  highlight.overlays_json = input.overlays;
  highlight.site_area_sqm = input.siteAreaSqm ?? null;
  highlight.lot_plan = input.lotPlan?.trim() || null;
  highlight.heritage_status = input.heritageStatus?.trim() || null;
  highlight.flood_status = input.floodStatus?.trim() || null;
  highlight.bushfire_status = input.bushfireStatus?.trim() || null;
  highlight.vegetation_status = input.vegetationStatus?.trim() || null;
  highlight.utilities_status = input.utilitiesStatus?.trim() || null;
  highlight.easements = input.easements?.trim() || null;
  highlight.planning_summary = input.planningSummary?.trim() || null;
  highlight.source_date = input.sourceDate?.trim() || null;
  highlight.status = input.status?.trim() || "active";
  highlight.matrix_cell_flags_json = input.matrixCellFlags ?? {};
  await writeState(state);
  return { highlightId: highlight.id };
}

export async function archiveSitePlanningHighlight(siteId: string, highlightId: string): Promise<void> {
  if (await shouldUseSupabaseFeasibility(siteId)) {
    return (await getSupabaseStore()).archiveSitePlanningHighlight(siteId, highlightId);
  }
  const state = await readState();
  const highlight = state.site_planning_highlights.find((item) => item.id === highlightId);
  if (!highlight) throw new Error(`Planning highlight '${highlightId}' was not found`);
  highlight.status = "archived";
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

export async function updateSalesAssumption(input: UpdateSalesAssumptionInput): Promise<void> {
  if (await shouldUseSupabaseScenarioOption(input.scenarioOptionId)) {
    return (await getSupabaseStore()).updateSalesAssumption(input);
  }
  const state = await readState();
  const option = state.scenario_options.find((item) => item.id === input.scenarioOptionId);
  if (!option) {
    throw new Error(`Scenario option '${input.scenarioOptionId}' was not found`);
  }
  let assumption = state.sales_assumptions.find((item) => item.scenario_option_id === input.scenarioOptionId);
  if (!assumption) {
    assumption = {
      id: randomUUID(),
      scenario_option_id: input.scenarioOptionId,
      gross_realisation: input.grossRealisation,
      average_sale_price: null,
      sale_rate_per_month: null,
      settlement_months: null,
      notes: null
    };
    state.sales_assumptions.push(assumption);
  }
  assumption.gross_realisation = input.grossRealisation;
  assumption.average_sale_price =
    input.averageSalePrice ??
    (option.dwellings && input.grossRealisation ? Math.round(input.grossRealisation / option.dwellings) : null);
  assumption.sale_rate_per_month = input.saleRatePerMonth ?? null;
  assumption.settlement_months = input.settlementMonths ?? null;
  assumption.notes = input.notes ?? null;
  await writeState(state);
}

export async function updateScenarioCostRange(input: UpdateScenarioCostRangeInput): Promise<void> {
  if (await shouldUseSupabaseScenarioOption(input.scenarioOptionId)) {
    return (await getSupabaseStore()).updateScenarioCostRange(input);
  }
  const state = await readState();
  const range = state.scenario_cost_ranges.find((item) => item.id === input.rangeId);
  if (!range) {
    throw new Error(`Scenario cost range '${input.rangeId}' was not found`);
  }
  range.construction_cost = input.constructionCost;
  range.professional_fees = input.professionalFees ?? null;
  range.contingency = input.contingency ?? null;
  range.statutory_fees = input.statutoryFees ?? null;
  range.finance_cost = input.financeCost ?? null;
  range.other_costs = input.otherCosts ?? null;
  range.notes = input.notes ?? null;
  await writeState(state);
}

export async function upsertFeasibilityBranchTargets(
  input: UpsertFeasibilityBranchTargetsInput
): Promise<{ branchId: string }> {
  if (await shouldUseSupabaseScenarioOption(input.scenarioOptionId)) {
    return (await getSupabaseStore()).upsertFeasibilityBranchTargets(input);
  }
  const state = await readState();
  const site = state.sites.find((item) => item.id === input.siteId);
  const option = state.scenario_options.find((item) => item.id === input.scenarioOptionId);
  if (!site || !option) {
    throw new Error("Site or scenario option was not found");
  }
  let branch =
    (input.branchId ? state.feasibility_branches.find((item) => item.id === input.branchId) : null) ??
    state.feasibility_branches.find((item) => item.scenario_option_id === input.scenarioOptionId);
  if (!branch) {
    branch = {
      id: randomUUID(),
      project_id: state.project.id,
      site_id: input.siteId,
      scenario_option_id: input.scenarioOptionId,
      scenario_id: input.scenarioId ?? option.scenario_id ?? null,
      feasibility_template_id: input.feasibilityTemplateId ?? null,
      name: `${site.name} - ${option.name} method branch`,
      status: "testing",
      summary: "Created from the Feasibility Method workspace.",
      target_margin_percent: input.targetMarginPercent ?? option.target_margin_percent ?? null,
      target_net_position_ratio: input.targetNetPositionRatio ?? null,
      created_at: new Date().toISOString()
    };
    state.feasibility_branches.push(branch);
  } else {
    branch.target_margin_percent = input.targetMarginPercent ?? null;
    branch.target_net_position_ratio = input.targetNetPositionRatio ?? null;
  }
  await writeState(state);
  return { branchId: branch.id };
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

export type GanttHierarchyLevelInput = "subtask" | "task";

export type CreateGanttHierarchyNodeInput = {
  scenarioId: string;
  label: string;
  packageId: string;
  parentId?: string | null;
  hierarchyLevel?: GanttHierarchyLevelInput;
};

export type UpdateGanttHierarchyNodeInput = {
  scenarioId: string;
  nodeId: string;
  label: string;
};

export type MoveGanttHierarchyNodeInput = {
  scenarioId: string;
  nodeId: string;
  direction: "up" | "down" | "indent" | "outdent";
};

export type CreateScheduleDependencyInput = {
  scenarioId: string;
  predecessorActivityId: string;
  successorActivityId: string;
};

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

export async function createGanttHierarchyNode(input: CreateGanttHierarchyNodeInput): Promise<{ nodeId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createGanttHierarchyNode(input);
  }
  const state = await readState();
  const view = scheduleViewForScenario(state, input.scenarioId);
  const trimmed = input.label.trim();
  if (!trimmed) {
    throw new Error("Hierarchy row label is required");
  }
  if (!input.packageId) {
    throw new Error("Hierarchy row package is required");
  }

  const current = hierarchyForView(view);
  const nodeId = randomUUID();
  current.nodes.push({
    id: nodeId,
    label: trimmed,
    package_id: input.packageId,
    parent_id: input.parentId || `package:${input.packageId}`,
    hierarchy_level: input.hierarchyLevel ?? "task",
    sort_order: current.nodes.length + 1
  });
  saveHierarchyForView(view, current);
  await writeState(state);
  return { nodeId };
}

export async function updateGanttHierarchyNode(input: UpdateGanttHierarchyNodeInput): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).updateGanttHierarchyNode(input);
  }
  const state = await readState();
  const view = scheduleViewForScenario(state, input.scenarioId);
  const current = hierarchyForView(view);
  const node = current.nodes.find((item) => item.id === input.nodeId);
  if (!node) {
    throw new Error(`Hierarchy row '${input.nodeId}' was not found`);
  }
  const trimmed = input.label.trim();
  if (!trimmed) {
    throw new Error("Hierarchy row label is required");
  }
  node.label = trimmed;
  saveHierarchyForView(view, current);
  await writeState(state);
}

export async function moveGanttHierarchyNode(input: MoveGanttHierarchyNodeInput): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).moveGanttHierarchyNode(input);
  }
  const state = await readState();
  const view = scheduleViewForScenario(state, input.scenarioId);
  const current = hierarchyForView(view);
  const nodeIndex = current.nodes.findIndex((item) => item.id === input.nodeId);
  const node = current.nodes[nodeIndex];
  if (!node) {
    throw new Error(`Hierarchy row '${input.nodeId}' was not found`);
  }

  if (input.direction === "up" || input.direction === "down") {
    const targetIndex = input.direction === "up" ? nodeIndex - 1 : nodeIndex + 1;
    const target = current.nodes[targetIndex];
    if (target) {
      const currentSort = Number(node.sort_order ?? nodeIndex + 1);
      node.sort_order = Number(target.sort_order ?? targetIndex + 1);
      target.sort_order = currentSort;
    }
  } else if (input.direction === "indent") {
    const previous = current.nodes
      .slice(0, nodeIndex)
      .reverse()
      .find((item) => item.package_id === node.package_id && item.id !== node.id);
    if (previous) {
      node.parent_id = previous.id;
      node.hierarchy_level = "task";
    }
  } else {
    const parent = current.nodes.find((item) => item.id === node.parent_id);
    node.parent_id = parent?.parent_id ?? `package:${String(node.package_id)}`;
    node.hierarchy_level = node.parent_id === `package:${String(node.package_id)}` ? "subtask" : "task";
  }

  saveHierarchyForView(view, current);
  await writeState(state);
}

export async function deleteGanttHierarchyNode(scenarioId: string, nodeId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteGanttHierarchyNode(scenarioId, nodeId);
  }
  const state = await readState();
  const view = scheduleViewForScenario(state, scenarioId);
  const current = hierarchyForView(view);
  const node = current.nodes.find((item) => item.id === nodeId);
  if (!node) {
    throw new Error(`Hierarchy row '${nodeId}' was not found`);
  }
  current.nodes = current.nodes
    .filter((item) => item.id !== nodeId)
    .map((item) => (item.parent_id === nodeId ? { ...item, parent_id: node.parent_id ?? null } : item));
  current.activityLinks = current.activityLinks.filter((item) => item.node_id !== nodeId);
  saveHierarchyForView(view, current);
  await writeState(state);
}

export async function createScheduleDependency(input: CreateScheduleDependencyInput): Promise<{ dependencyId: string }> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).createScheduleDependency(input);
  }
  if (input.predecessorActivityId === input.successorActivityId) {
    throw new Error("Dependency requires two different activities");
  }
  const state = await readState();
  const view = scheduleViewForScenario(state, input.scenarioId);
  const activityIds = new Set(
    state.linear_schedule_activities
      .filter((item) => String(item.scenario_id ?? "") === input.scenarioId)
      .map((item) => String(item.id))
  );
  if (!activityIds.has(input.predecessorActivityId) || !activityIds.has(input.successorActivityId)) {
    throw new Error("Dependency activities must belong to the selected scenario");
  }
  const current = hierarchyForView(view);
  const alreadyExists = current.dependencies.some(
    (item) =>
      item.predecessor_activity_id === input.predecessorActivityId &&
      item.successor_activity_id === input.successorActivityId
  );
  if (alreadyExists) {
    throw new Error("Dependency already exists");
  }
  const dependencyId = randomUUID();
  current.dependencies.push({
    id: dependencyId,
    predecessor_activity_id: input.predecessorActivityId,
    successor_activity_id: input.successorActivityId,
    dependency_type: "finish_to_start",
    lag_days: 0
  });
  saveHierarchyForView(view, current);
  await writeState(state);
  return { dependencyId };
}

export async function deleteScheduleDependency(scenarioId: string, dependencyId: string): Promise<void> {
  if (isSupabaseMode()) {
    return (await getSupabaseStore()).deleteScheduleDependency(scenarioId, dependencyId);
  }
  const state = await readState();
  const view = scheduleViewForScenario(state, scenarioId);
  const current = hierarchyForView(view);
  current.dependencies = current.dependencies.filter((item) => item.id !== dependencyId);
  saveHierarchyForView(view, current);
  await writeState(state);
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
