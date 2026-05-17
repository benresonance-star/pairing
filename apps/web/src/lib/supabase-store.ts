import { randomUUID } from "node:crypto";

import { vocab } from "../../../../shared/contracts/api/index";
import { buildAssumptionGraphData, type AssumptionGraphData } from "./assumption-graph";
import { projectIdFromEnv } from "./data-source";
import { buildFeasibilityMethodRuns, buildFeasibilityPortfolio, type FeasibilityMethodRun, type FeasibilityPortfolio } from "./feasibility";
import { buildLinearScheduleData, type LinearScheduleData, type LinearScheduleFilters } from "./linear-schedule";
import { buildProjectNetworkData, type ProjectNetworkData } from "./project-network";
import {
  actionsForStatus,
  archiveDevelopmentSite,
  assertValidPackageAssignment,
  createDevelopmentSite,
  createGovernedOperationalChangeSet,
  findObjectRef,
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
  type RuntimeState,
  type SitePatch
} from "./runtime-state";
import { createServerSupabaseClient } from "./supabase-server";
import type {
  CreateOverviewActionTaskInput,
  OverviewActionTask,
  OverviewActionTaskPriority,
  UpdateOverviewActionTaskInput
} from "./overview-action-tasks-types";
import { parseOverviewTaskLinkPath } from "./overview-task-link";

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
  baseline: 0,
  active: 1,
  draft: 2,
  archived: 3
};

const OPTIONAL_FEASIBILITY_TABLES = new Set([
  "sites",
  "site_constraints",
  "scenario_options",
  "scenario_cost_ranges",
  "sales_assumptions",
  "archicad_links",
  "site_resources",
  "site_planning_highlights",
  "site_templates",
  "scenario_templates",
  "feasibility_templates",
  "feasibility_branches",
  "assumption_templates",
  "assumption_applications",
  "assumption_validations",
  "assumption_evidence",
  "assumption_actions",
  "simulation_templates",
  "simulation_runs",
  "simulation_samples",
  "network_organisations",
  "network_profiles",
  "network_profile_capabilities",
  "network_knowledge_packs",
  "network_profile_knowledge_packs",
  "network_inquiries",
  "network_inquiry_messages",
  "network_work_products",
  "network_work_product_links",
  "network_agent_cards",
  "network_agent_sessions",
  "network_agent_session_participants",
  "network_agent_messages",
  "network_agent_tool_calls",
  "network_agent_outputs",
  "master_cost_templates",
  "master_code_catalogs",
  "master_code_items",
  "master_cost_items",
  "master_cost_item_sources",
  "master_cost_item_target_links",
  "master_cost_template_items",
  "master_cost_item_links",
  "scenario_cost_plan_items"
]);

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
      scenarioKind: String(scenario.scenario_kind ?? (scenario.status === "template" ? "template" : "legacy")),
      parentScenarioId: scenario.parent_scenario_id ? String(scenario.parent_scenario_id) : null,
      templateScenarioId: scenario.template_scenario_id ? String(scenario.template_scenario_id) : null,
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

function nextMetadataJson(next: {
  metadata: Record<string, unknown>;
  hierarchy: Record<string, unknown>;
  nodes: Record<string, unknown>[];
  activityLinks: Record<string, unknown>[];
  dependencies: Record<string, unknown>[];
}) {
  return {
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

async function updateScheduleViewMetadata(viewId: string, projectId: string, metadataJson: Record<string, unknown>) {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("linear_schedule_views")
    .update({ metadata_json: metadataJson })
    .eq("id", viewId)
    .eq("project_id", projectId);
  if (error) {
    throw new Error(`Unable to update schedule hierarchy in Supabase: ${error.message}`);
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
    if (
      OPTIONAL_FEASIBILITY_TABLES.has(table) &&
      (error.message.includes("Could not find the table") || error.message.includes("does not exist"))
    ) {
      return [];
    }
    throw new Error(`Unable to load '${table}' from Supabase: ${error.message}`);
  }
  return toRuntimeRecordArray(data);
}

async function readGlobalTable(table: string): Promise<RuntimeRecord[]> {
  const client = createServerSupabaseClient();
  const { data, error } = await client.from(table).select("*");
  if (error) {
    if (
      OPTIONAL_FEASIBILITY_TABLES.has(table) &&
      (error.message.includes("Could not find the table") || error.message.includes("does not exist"))
    ) {
      return [];
    }
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
    sites,
    site_constraints,
    scenario_options,
    scenario_cost_ranges,
    sales_assumptions,
    archicad_links,
    site_resources,
    site_planning_highlights,
    site_templates,
    scenario_templates,
    feasibility_templates,
    feasibility_branches,
    assumption_templates,
    assumption_applications,
    assumption_validations,
    assumption_evidence,
    assumption_actions,
    simulation_templates,
    simulation_runs,
    simulation_samples,
    network_organisations,
    network_profiles,
    network_profile_capabilities,
    network_knowledge_packs,
    network_profile_knowledge_packs,
    network_inquiries,
    network_inquiry_messages,
    network_work_products,
    network_work_product_links,
    network_agent_cards,
    network_agent_sessions,
    network_agent_session_participants,
    network_agent_messages,
    network_agent_tool_calls,
    network_agent_outputs,
    master_code_catalogs,
    master_code_items,
    master_cost_templates,
    master_cost_items,
    master_cost_item_sources,
    master_cost_item_target_links,
    master_cost_template_items,
    master_cost_item_links,
    scenario_cost_plan_items,
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
    readProjectTable("sites"),
    readProjectTable("site_constraints"),
    readProjectTable("scenario_options"),
    readProjectTable("scenario_cost_ranges"),
    readProjectTable("sales_assumptions"),
    readProjectTable("archicad_links"),
    readProjectTable("site_resources"),
    readProjectTable("site_planning_highlights"),
    readProjectTable("site_templates"),
    readProjectTable("scenario_templates"),
    readProjectTable("feasibility_templates"),
    readProjectTable("feasibility_branches"),
    readProjectTable("assumption_templates"),
    readProjectTable("assumption_applications"),
    readProjectTable("assumption_validations"),
    readProjectTable("assumption_evidence"),
    readProjectTable("assumption_actions"),
    readProjectTable("simulation_templates"),
    readProjectTable("simulation_runs"),
    readProjectTable("simulation_samples"),
    readProjectTable("network_organisations"),
    readProjectTable("network_profiles"),
    readProjectTable("network_profile_capabilities"),
    readProjectTable("network_knowledge_packs"),
    readProjectTable("network_profile_knowledge_packs"),
    readProjectTable("network_inquiries"),
    readProjectTable("network_inquiry_messages"),
    readProjectTable("network_work_products"),
    readProjectTable("network_work_product_links"),
    readProjectTable("network_agent_cards"),
    readProjectTable("network_agent_sessions"),
    readProjectTable("network_agent_session_participants"),
    readProjectTable("network_agent_messages"),
    readProjectTable("network_agent_tool_calls"),
    readProjectTable("network_agent_outputs"),
    readGlobalTable("master_code_catalogs"),
    readGlobalTable("master_code_items"),
    readProjectTable("master_cost_templates"),
    readProjectTable("master_cost_items"),
    readProjectTable("master_cost_item_sources"),
    readProjectTable("master_cost_item_target_links"),
    readProjectTable("master_cost_template_items"),
    readProjectTable("master_cost_item_links"),
    readProjectTable("scenario_cost_plan_items"),
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
    sites,
    site_constraints,
    scenario_options,
    scenario_cost_ranges,
    sales_assumptions,
    archicad_links,
    site_resources,
    site_planning_highlights,
    site_templates,
    scenario_templates,
    feasibility_templates,
    feasibility_branches,
    assumption_templates,
    assumption_applications,
    assumption_validations,
    assumption_evidence,
    assumption_actions,
    simulation_templates,
    simulation_runs,
    simulation_samples,
    network_organisations,
    network_profiles,
    network_profile_capabilities,
    network_knowledge_packs,
    network_profile_knowledge_packs,
    network_inquiries,
    network_inquiry_messages,
    network_work_products,
    network_work_product_links,
    network_agent_cards,
    network_agent_sessions,
    network_agent_session_participants,
    network_agent_messages,
    network_agent_tool_calls,
    network_agent_outputs,
    master_code_catalogs,
    master_code_items,
    master_cost_templates,
    master_cost_items,
    master_cost_item_sources,
    master_cost_item_target_links,
    master_cost_template_items,
    master_cost_item_links,
    scenario_cost_plan_items,
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
      scenarioKind: String(scenario.scenario_kind ?? (scenario.status === "template" ? "template" : "legacy")),
      parentScenarioId: scenario.parent_scenario_id ? String(scenario.parent_scenario_id) : null,
      templateScenarioId: scenario.template_scenario_id ? String(scenario.template_scenario_id) : null,
      operationalStateCount: operational_state.filter((item) => item.scenario_id === scenario.id).length,
      changeSetCount: change_sets.filter((item) => item.scenario_id === scenario.id).length
    }))
  );
}

export async function getFeasibilityPortfolio(): Promise<FeasibilityPortfolio> {
  const state = await readSupabaseState();
  return buildFeasibilityPortfolio(state);
}

export async function getFeasibilityMethodRuns(): Promise<FeasibilityMethodRun[]> {
  const state = await readSupabaseState();
  return buildFeasibilityMethodRuns(state);
}

export async function getAssumptionGraphData(): Promise<AssumptionGraphData> {
  const state = await readSupabaseState();
  return buildAssumptionGraphData(state);
}

export async function getProjectNetworkData(): Promise<ProjectNetworkData> {
  const state = await readSupabaseState();
  return buildProjectNetworkData(state);
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

function requireAssumptionApplication(state: RuntimeState, assumptionApplicationId: string) {
  const application = state.assumption_applications.find((item) => item.id === assumptionApplicationId);
  if (!application) {
    throw new Error(`Assumption application '${assumptionApplicationId}' was not found`);
  }
  return application;
}

function requireNetworkProfile(state: RuntimeState, profileId: string) {
  const profile = state.network_profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Network profile '${profileId}' was not found`);
  }
  return profile;
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

export async function createNetworkOrganisation(input: CreateNetworkOrganisationInput): Promise<{ organisationId: string }> {
  const name = input.name.trim();
  const organisationType = input.organisationType.trim();
  if (!name) throw new Error("Organisation name is required");
  if (!organisationType) throw new Error("Organisation type is required");
  const client = createServerSupabaseClient();
  const organisationId = randomUUID();
  const { error } = await client.from("network_organisations").insert({
    id: organisationId,
    project_id: projectIdFromEnv(),
    name,
    organisation_type: organisationType,
    description: input.description?.trim() || null,
    status: input.status?.trim() || "active"
  });
  if (error) throw new Error(`Unable to create network organisation: ${error.message}`);
  return { organisationId };
}

export async function updateNetworkOrganisation(input: UpdateNetworkOrganisationInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_organisations")
    .update({
      name: input.name.trim(),
      organisation_type: input.organisationType.trim(),
      description: input.description?.trim() || null,
      status: input.status?.trim() || "active"
    })
    .eq("id", input.organisationId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to update network organisation: ${error.message}`);
}

export async function archiveNetworkOrganisation(organisationId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_organisations")
    .update({ status: "archived" })
    .eq("id", organisationId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to archive network organisation: ${error.message}`);
}

export async function deleteNetworkOrganisation(organisationId: string): Promise<void> {
  const state = await readSupabaseState();
  assertUnusedNetworkOrganisation(state, organisationId);
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_organisations")
    .delete()
    .eq("id", organisationId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to delete network organisation: ${error.message}`);
}

export async function createNetworkProfile(input: CreateNetworkProfileInput): Promise<{ profileId: string }> {
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("Profile display name is required");
  const client = createServerSupabaseClient();
  const profileId = randomUUID();
  const { error } = await client.from("network_profiles").insert({
    id: profileId,
    project_id: projectIdFromEnv(),
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
  if (error) throw new Error(`Unable to create network profile: ${error.message}`);
  return { profileId };
}

export async function updateNetworkProfile(input: UpdateNetworkProfileInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_profiles")
    .update({
      organisation_id: input.organisationId ?? null,
      display_name: input.displayName.trim(),
      profile_type: input.profileType.trim() || "human",
      category: input.category.trim() || "Developer Team",
      domain: input.domain.trim() || "General",
      summary: input.summary?.trim() || null,
      contact_details: input.contactDetails?.trim() || null,
      preferred_llm: input.preferredLlm?.trim() || null,
      status: input.status?.trim() || "active"
    })
    .eq("id", input.profileId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to update network profile: ${error.message}`);
}

export async function archiveNetworkProfile(profileId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_profiles")
    .update({ status: "archived" })
    .eq("id", profileId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to archive network profile: ${error.message}`);
}

export async function deleteNetworkProfile(profileId: string): Promise<void> {
  const state = await readSupabaseState();
  assertUnusedNetworkProfile(state, profileId);
  const client = createServerSupabaseClient();
  await client.from("network_profile_capabilities").delete().eq("profile_id", profileId).eq("project_id", projectIdFromEnv());
  await client.from("network_profile_knowledge_packs").delete().eq("profile_id", profileId).eq("project_id", projectIdFromEnv());
  const { error } = await client.from("network_profiles").delete().eq("id", profileId).eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to delete network profile: ${error.message}`);
}

export async function upsertNetworkProfileCapability(input: UpsertNetworkProfileCapabilityInput): Promise<{ capabilityId: string }> {
  const state = await readSupabaseState();
  const existing = state.network_profile_capabilities.find((item) => item.profile_id === input.profileId);
  const capabilityId = existing?.id ?? randomUUID();
  const client = createServerSupabaseClient();
  const { error } = await client.from("network_profile_capabilities").upsert({
    id: capabilityId,
    project_id: projectIdFromEnv(),
    profile_id: input.profileId,
    skills_json: input.skills,
    base_knowledge: input.baseKnowledge?.trim() || null,
    scope: input.scope?.trim() || null,
    constraints_json: input.constraints,
    question_types_json: input.questionTypes,
    output_types_json: input.outputTypes,
    operating_instructions_md: input.operatingInstructionsMd?.trim() || null,
    constraints_md: input.constraintsMd?.trim() || null,
    review_policy_md: input.reviewPolicyMd?.trim() || null
  });
  if (error) throw new Error(`Unable to upsert network profile capability: ${error.message}`);
  return { capabilityId };
}

export async function deleteNetworkProfileCapability(profileId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_profile_capabilities")
    .delete()
    .eq("profile_id", profileId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to delete network profile capability: ${error.message}`);
}

export async function createNetworkKnowledgePack(input: CreateNetworkKnowledgePackInput): Promise<{ knowledgePackId: string }> {
  const title = input.title.trim();
  const domain = input.domain.trim();
  if (!title) throw new Error("Knowledge pack title is required");
  if (!domain) throw new Error("Knowledge pack domain is required");
  const client = createServerSupabaseClient();
  const knowledgePackId = randomUUID();
  const { error } = await client.from("network_knowledge_packs").insert({
    id: knowledgePackId,
    project_id: projectIdFromEnv(),
    title,
    domain,
    instructions: input.instructions?.trim() || null,
    constraints_json: input.constraints,
    sources_json: input.sources,
    tools_json: input.tools,
    output_policy: input.outputPolicy?.trim() || null,
    status: input.status?.trim() || "active"
  });
  if (error) throw new Error(`Unable to create network knowledge pack: ${error.message}`);
  return { knowledgePackId };
}

export async function updateNetworkKnowledgePack(input: UpdateNetworkKnowledgePackInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_knowledge_packs")
    .update({
      title: input.title.trim(),
      domain: input.domain.trim(),
      instructions: input.instructions?.trim() || null,
      constraints_json: input.constraints,
      sources_json: input.sources,
      tools_json: input.tools,
      output_policy: input.outputPolicy?.trim() || null,
      status: input.status?.trim() || "active"
    })
    .eq("id", input.knowledgePackId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to update network knowledge pack: ${error.message}`);
}

export async function archiveNetworkKnowledgePack(knowledgePackId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_knowledge_packs")
    .update({ status: "archived" })
    .eq("id", knowledgePackId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to archive network knowledge pack: ${error.message}`);
}

export async function deleteNetworkKnowledgePack(knowledgePackId: string): Promise<void> {
  const state = await readSupabaseState();
  assertUnusedKnowledgePack(state, knowledgePackId);
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_knowledge_packs")
    .delete()
    .eq("id", knowledgePackId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to delete network knowledge pack: ${error.message}`);
}

export async function assignKnowledgePackToProfile(profileId: string, knowledgePackId: string): Promise<void> {
  const state = await readSupabaseState();
  if (state.network_profile_knowledge_packs.some((item) => item.profile_id === profileId && item.knowledge_pack_id === knowledgePackId)) {
    return;
  }
  const client = createServerSupabaseClient();
  const { error } = await client.from("network_profile_knowledge_packs").insert({
    id: randomUUID(),
    project_id: projectIdFromEnv(),
    profile_id: profileId,
    knowledge_pack_id: knowledgePackId
  });
  if (error) {
    throw new Error(`Unable to assign knowledge pack: ${error.message}`);
  }
}

export async function unassignKnowledgePackFromProfile(profileId: string, knowledgePackId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("network_profile_knowledge_packs")
    .delete()
    .eq("profile_id", profileId)
    .eq("knowledge_pack_id", knowledgePackId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to unassign knowledge pack: ${error.message}`);
}

export async function assignAssumptionParticipant(input: AssignAssumptionParticipantInput): Promise<{ validationId: string; actionId?: string }> {
  const role = normalizeAssumptionParticipantRole(input.relationshipType);
  const state = await readSupabaseState();
  requireAssumptionApplication(state, input.assumptionApplicationId);
  requireNetworkProfile(state, input.profileId);

  const existingOwner = state.assumption_validations.find(
    (item) => item.assumption_application_id === input.assumptionApplicationId && item.relationship_type === "accountable_owner"
  );

  const existing =
    role === "accountable_owner" && existingOwner
      ? existingOwner
      : state.assumption_validations.find(
          (item) =>
            item.assumption_application_id === input.assumptionApplicationId &&
            item.profile_id === input.profileId &&
            item.relationship_type === role
        );
  const validationId = existing?.id ?? randomUUID();
  const client = createServerSupabaseClient();
  const payload = {
    id: validationId,
    project_id: projectIdFromEnv(),
    assumption_application_id: input.assumptionApplicationId,
    profile_id: input.profileId,
    relationship_type: role,
    status: input.status?.trim() || "pending",
    confidence: input.confidence?.trim() || null,
    notes: input.notes?.trim() || null
  };
  const validationResult = existing
    ? await client
        .from("assumption_validations")
        .update(payload)
        .eq("id", validationId)
        .eq("project_id", projectIdFromEnv())
    : await client.from("assumption_validations").insert(payload);
  if (validationResult.error) {
    throw new Error(`Unable to assign assumption participant: ${validationResult.error.message}`);
  }

  const actionTitle = input.actionTitle?.trim();
  const action = actionTitle
    ? await createAssumptionAction({
        assumptionApplicationId: input.assumptionApplicationId,
        responsibleProfileId: input.profileId,
        title: actionTitle,
        priority: input.actionPriority,
        stage: input.actionStage,
        riskIfDelayed: input.actionRiskIfDelayed,
        status: "open"
      })
    : undefined;

  return { validationId, actionId: action?.actionId };
}

export async function createAssumptionAction(input: CreateAssumptionActionInput): Promise<{ actionId: string }> {
  const state = await readSupabaseState();
  requireAssumptionApplication(state, input.assumptionApplicationId);
  if (input.responsibleProfileId) {
    requireNetworkProfile(state, input.responsibleProfileId);
  }
  const title = input.title.trim();
  if (!title) throw new Error("Assumption action title is required");
  const actionId = randomUUID();
  const client = createServerSupabaseClient();
  const { error } = await client.from("assumption_actions").insert({
    id: actionId,
    project_id: projectIdFromEnv(),
    assumption_application_id: input.assumptionApplicationId,
    title,
    priority: input.priority?.trim() || "MEDIUM",
    responsible_profile_id: input.responsibleProfileId || null,
    stage: input.stage?.trim() || null,
    risk_if_delayed: input.riskIfDelayed?.trim() || null,
    status: input.status?.trim() || "open",
    notes: input.notes?.trim() || null
  });
  if (error) throw new Error(`Unable to create assumption action: ${error.message}`);
  return { actionId };
}

export async function unassignAssumptionParticipant(validationId: string): Promise<void> {
  const state = await readSupabaseState();
  const validation = state.assumption_validations.find((item) => item.id === validationId);
  if (!validation) {
    throw new Error(`Assumption participant assignment '${validationId}' was not found`);
  }
  if (
    validation.relationship_type === "accountable_owner" &&
    hasOpenAssumptionActionForProfile(state, validation.assumption_application_id, validation.profile_id)
  ) {
    throw new Error("Resolve or reassign open actions before removing the accountable owner");
  }
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("assumption_validations")
    .delete()
    .eq("id", validationId)
    .eq("project_id", projectIdFromEnv());
  if (error) throw new Error(`Unable to unassign assumption participant: ${error.message}`);
}

export async function upsertNetworkAgentCard(input: UpsertNetworkAgentCardInput): Promise<{ agentCardId: string }> {
  const state = await readSupabaseState();
  const existing = state.network_agent_cards.find((item) => item.profile_id === input.profileId);
  const agentCardId = existing?.id ?? randomUUID();
  const client = createServerSupabaseClient();
  const { error } = await client.from("network_agent_cards").upsert({
    id: agentCardId,
    project_id: projectIdFromEnv(),
    profile_id: input.profileId,
    model_label: input.modelLabel?.trim() || null,
    system_instructions: input.systemInstructions?.trim() || null,
    context_policy: input.contextPolicy?.trim() || null,
    persona_md: input.personaMd?.trim() || null,
    memory_md: input.memoryMd?.trim() || null,
    tool_policy_json: input.toolPolicy,
    skill_policy_json: input.skillPolicy,
    output_schema_json: input.outputSchema,
    review_policy_md: input.reviewPolicyMd?.trim() || null,
    escalation_policy_md: input.escalationPolicyMd?.trim() || null,
    status: input.status?.trim() || "active"
  });
  if (error) throw new Error(`Unable to upsert network agent card: ${error.message}`);
  return { agentCardId };
}

export async function createNetworkInquiry(input: CreateNetworkInquiryInput): Promise<{ inquiryId: string }> {
  const title = input.title.trim();
  const question = input.question.trim();
  if (!title) throw new Error("Inquiry title is required");
  if (!question) throw new Error("Inquiry question is required");

  const client = createServerSupabaseClient();
  const inquiryId = randomUUID();
  const { error } = await client.from("network_inquiries").insert({
    id: inquiryId,
    project_id: projectIdFromEnv(),
    title,
    question,
    status: "open",
    linked_ref_type: input.linkedRefType ?? null,
    linked_ref_id: input.linkedRefId ?? null,
    created_by: input.createdBy ?? "Project team",
    created_at: new Date().toISOString()
  });
  if (error) {
    throw new Error(`Unable to create network inquiry: ${error.message}`);
  }
  return { inquiryId };
}

export async function createNetworkInquiryMessage(input: CreateNetworkInquiryMessageInput): Promise<{ messageId: string }> {
  const message = input.message.trim();
  if (!message) throw new Error("Message is required");

  const client = createServerSupabaseClient();
  const messageId = randomUUID();
  const { error } = await client.from("network_inquiry_messages").insert({
    id: messageId,
    project_id: projectIdFromEnv(),
    inquiry_id: input.inquiryId,
    profile_id: input.profileId ?? null,
    author_label: input.authorLabel.trim() || "Project team",
    author_type: input.authorType.trim() || "human",
    message,
    citations_json: [],
    created_at: new Date().toISOString()
  });
  if (error) {
    throw new Error(`Unable to create network message: ${error.message}`);
  }
  return { messageId };
}

export async function createNetworkWorkProduct(input: CreateNetworkWorkProductInput): Promise<{ workProductId: string }> {
  const title = input.title.trim();
  if (!title) throw new Error("Work product title is required");

  const client = createServerSupabaseClient();
  const project_id = projectIdFromEnv();
  const workProductId = randomUUID();
  const { error } = await client.from("network_work_products").insert({
    id: workProductId,
    project_id,
    inquiry_id: input.inquiryId ?? null,
    profile_id: input.profileId ?? null,
    title,
    product_type: input.productType.trim() || "brief",
    status: "draft",
    summary: input.summary?.trim() || null,
    created_at: new Date().toISOString()
  });
  if (error) {
    throw new Error(`Unable to create work product: ${error.message}`);
  }

  if (input.linkedRefType && input.linkedRefId) {
    const { error: linkError } = await client.from("network_work_product_links").insert({
      id: randomUUID(),
      project_id,
      work_product_id: workProductId,
      linked_ref_type: input.linkedRefType,
      linked_ref_id: input.linkedRefId,
      notes: input.linkNotes ?? null
    });
    if (linkError) {
      throw new Error(`Unable to link work product: ${linkError.message}`);
    }
  }

  return { workProductId };
}

export async function createSite(input: CreateSiteInput): Promise<{ siteId: string }> {
  const state = await readSupabaseState();
  const siteId = randomUUID();
  const site = createDevelopmentSite(state, {
    ...input,
    id: siteId
  });
  const client = createServerSupabaseClient();
  const { error } = await client.from("sites").insert({
    id: site.id,
    project_id: site.project_id,
    site_code: site.site_code,
    site_date: site.site_date,
    name: site.name,
    address: site.address,
    locality: site.locality,
    status: site.status,
    current_stage: site.current_stage,
    acquisition_status: site.acquisition_status,
    priority: site.priority,
    site_area_sqm: site.site_area_sqm,
    summary: site.summary
  });
  if (error) {
    throw new Error(`Unable to create site: ${error.message}`);
  }
  return { siteId };
}

export async function updateSite(input: UpdateSiteInput): Promise<void> {
  const state = await readSupabaseState();
  const site = updateDevelopmentSite(state, input.siteId, input);
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("sites")
    .update({
      site_code: site.site_code,
      site_date: site.site_date,
      name: site.name,
      address: site.address,
      locality: site.locality,
      status: site.status,
      current_stage: site.current_stage,
      acquisition_status: site.acquisition_status,
      priority: site.priority,
      site_area_sqm: site.site_area_sqm,
      summary: site.summary
    })
    .eq("id", input.siteId);
  if (error) {
    throw new Error(`Unable to update site: ${error.message}`);
  }
}

export async function createSiteResource(input: CreateSiteResourceInput): Promise<{ resourceId: string }> {
  const resourceId = randomUUID();
  const client = createServerSupabaseClient();
  const { error } = await client.from("site_resources").insert({
    id: resourceId,
    project_id: projectIdFromEnv(),
    site_id: input.siteId,
    resource_type: input.resourceType.trim() || "other",
    title: input.title.trim(),
    url: input.url?.trim() || null,
    storage_path: input.storagePath?.trim() || null,
    source_label: input.sourceLabel?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status?.trim() || "active"
  });
  if (error) {
    throw new Error(`Unable to create site resource: ${error.message}`);
  }
  return { resourceId };
}

function siteResourceBucketName(): string {
  return process.env.SUPABASE_SITE_RESOURCES_BUCKET || "site-resources";
}

function safeStorageFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9.\-_]+/g, "-").replace(/-+/g, "-");
  return normalized || "upload.bin";
}

export async function uploadSiteResourceFile(siteId: string, file: File): Promise<UploadedSiteResourceFile> {
  if (!file || file.size === 0) {
    throw new Error("No file was selected for upload");
  }

  const client = createServerSupabaseClient();
  const bucket = siteResourceBucketName();
  const bucketResult = await client.storage.getBucket(bucket);
  if (bucketResult.error) {
    const createResult = await client.storage.createBucket(bucket, { public: true });
    if (createResult.error) {
      throw new Error(`Unable to create site resource bucket: ${createResult.error.message}`);
    }
  }

  const fileName = safeStorageFileName(file.name);
  const storagePath = `${projectIdFromEnv()}/sites/${siteId}/${randomUUID()}-${fileName}`;
  const uploadResult = await client.storage.from(bucket).upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (uploadResult.error) {
    throw new Error(`Unable to upload site resource file: ${uploadResult.error.message}`);
  }

  const publicUrl = client.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
  return { storagePath, publicUrl, fileName };
}

export async function updateSiteResource(input: UpdateSiteResourceInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("site_resources")
    .update({
      resource_type: input.resourceType.trim() || "other",
      title: input.title.trim(),
      url: input.url?.trim() || null,
      storage_path: input.storagePath?.trim() || null,
      source_label: input.sourceLabel?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status?.trim() || "active"
    })
    .eq("id", input.resourceId)
    .eq("site_id", input.siteId);
  if (error) {
    throw new Error(`Unable to update site resource: ${error.message}`);
  }
}

export async function archiveSiteResource(siteId: string, resourceId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("site_resources")
    .update({ status: "archived" })
    .eq("id", resourceId)
    .eq("site_id", siteId);
  if (error) {
    throw new Error(`Unable to archive site resource: ${error.message}`);
  }
}

export async function deleteSiteResource(siteId: string, resourceId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client.from("site_resources").delete().eq("id", resourceId).eq("site_id", siteId);
  if (error) {
    throw new Error(`Unable to delete site resource: ${error.message}`);
  }
}

export async function upsertSitePlanningHighlight(input: UpsertSitePlanningHighlightInput): Promise<{ highlightId: string }> {
  const highlightId = input.highlightId ?? randomUUID();
  const client = createServerSupabaseClient();
  const row = {
    id: highlightId,
    project_id: projectIdFromEnv(),
    site_id: input.siteId,
    source_resource_id: input.sourceResourceId ?? null,
    council: input.council?.trim() || null,
    planning_scheme: input.planningScheme?.trim() || null,
    zoning: input.zoning?.trim() || null,
    overlays_json: input.overlays,
    site_area_sqm: input.siteAreaSqm ?? null,
    lot_plan: input.lotPlan?.trim() || null,
    heritage_status: input.heritageStatus?.trim() || null,
    flood_status: input.floodStatus?.trim() || null,
    bushfire_status: input.bushfireStatus?.trim() || null,
    vegetation_status: input.vegetationStatus?.trim() || null,
    utilities_status: input.utilitiesStatus?.trim() || null,
    easements: input.easements?.trim() || null,
    planning_summary: input.planningSummary?.trim() || null,
    source_date: input.sourceDate?.trim() || null,
    status: input.status?.trim() || "active",
    matrix_cell_flags_json: input.matrixCellFlags ?? {}
  };
  const { error } = await client.from("site_planning_highlights").upsert(row);
  if (error) {
    throw new Error(`Unable to save planning highlights: ${error.message}`);
  }
  return { highlightId };
}

export async function archiveSitePlanningHighlight(siteId: string, highlightId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("site_planning_highlights")
    .update({ status: "archived" })
    .eq("id", highlightId)
    .eq("site_id", siteId);
  if (error) {
    throw new Error(`Unable to archive planning highlights: ${error.message}`);
  }
}

export async function archiveSite(siteId: string): Promise<void> {
  const state = await readSupabaseState();
  const site = archiveDevelopmentSite(state, siteId);
  const client = createServerSupabaseClient();
  const { error } = await client.from("sites").update({ status: site.status }).eq("id", siteId);
  if (error) {
    throw new Error(`Unable to archive site: ${error.message}`);
  }
}

export async function createMasterCostTemplate(
  input: CreateMasterCostTemplateInput
): Promise<{ templateId: string }> {
  const client = createServerSupabaseClient();
  const templateId = randomUUID();
  const { error } = await client.from("master_cost_templates").insert({
    id: templateId,
    project_id: projectIdFromEnv(),
    name: input.name.trim(),
    description: input.description ?? null,
    status: input.status ?? "active",
    template_type: input.templateType ?? null
  });
  if (error) {
    throw new Error(`Unable to create master cost template: ${error.message}`);
  }
  return { templateId };
}

export async function updateMasterCostTemplate(input: UpdateMasterCostTemplateInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_templates")
    .update({
      name: input.name.trim(),
      description: input.description ?? null,
      status: input.status ?? "active",
      template_type: input.templateType ?? null
    })
    .eq("id", input.templateId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to update master cost template: ${error.message}`);
  }
}

export async function archiveMasterCostTemplate(templateId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_templates")
    .update({ status: "archived" })
    .eq("id", templateId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to archive master cost template: ${error.message}`);
  }
}

function masterDatabaseItemDbPayload(input: CreateMasterDatabaseItemInput, itemId: string) {
  if (!input.costCode.trim()) throw new Error("Cost code is required");
  if (!input.title.trim()) throw new Error("Cost item title is required");
  if (!input.unit.trim()) throw new Error("Unit is required");
  if (!Number.isFinite(input.baseRate)) throw new Error("Base rate must be numeric");
  return {
    id: itemId,
    project_id: projectIdFromEnv(),
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

function masterCodeItemDbPayload(input: CreateMasterCodeItemInput, itemId: string) {
  if (!input.catalogId.trim()) throw new Error("Catalog is required");
  if (!input.code.trim()) throw new Error("Code is required");
  if (!input.title.trim()) throw new Error("Title is required");
  if (!input.codeType.trim()) throw new Error("Code type is required");
  return {
    id: itemId,
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

export async function createMasterCodeItem(input: CreateMasterCodeItemInput): Promise<{ itemId: string }> {
  const client = createServerSupabaseClient();
  const itemId = randomUUID();
  const { error } = await client.from("master_code_items").insert(masterCodeItemDbPayload(input, itemId));
  if (error) {
    throw new Error(`Unable to create master code item: ${error.message}`);
  }
  return { itemId };
}

export async function updateMasterCodeItem(input: UpdateMasterCodeItemInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { id, ...payload } = masterCodeItemDbPayload(input, input.itemId);
  void id;
  const { error } = await client.from("master_code_items").update(payload).eq("id", input.itemId);
  if (error) {
    throw new Error(`Unable to update master code item: ${error.message}`);
  }
}

export async function archiveMasterCodeItem(itemId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client.from("master_code_items").update({ status: "archived" }).eq("id", itemId);
  if (error) {
    throw new Error(`Unable to archive master code item: ${error.message}`);
  }
}

export async function deleteMasterCodeItem(itemId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const [masterItemsResult, templateItemsResult] = await Promise.all([
    client.from("master_cost_items").select("id", { count: "exact", head: true }).eq("master_code_item_id", itemId),
    client.from("master_cost_template_items").select("id", { count: "exact", head: true }).eq("master_code_item_id", itemId)
  ]);
  if (masterItemsResult.error) {
    throw new Error(`Unable to check master code item usage: ${masterItemsResult.error.message}`);
  }
  if (templateItemsResult.error) {
    throw new Error(`Unable to check master code item template usage: ${templateItemsResult.error.message}`);
  }
  const usageCount = (masterItemsResult.count ?? 0) + (templateItemsResult.count ?? 0);
  if (usageCount > 0) {
    throw new Error("Master code items used by project costs must be archived instead of deleted");
  }
  const { error } = await client.from("master_code_items").delete().eq("id", itemId);
  if (error) {
    throw new Error(`Unable to delete master code item: ${error.message}`);
  }
}

export async function createMasterDatabaseItem(
  input: CreateMasterDatabaseItemInput
): Promise<{ itemId: string }> {
  const client = createServerSupabaseClient();
  const itemId = randomUUID();
  const payload = masterDatabaseItemDbPayload(input, itemId);
  const { error } = await client.from("master_cost_items").insert(payload);
  if (error) {
    throw new Error(`Unable to create master database item: ${error.message}`);
  }
  if (input.sourceLabel) {
    const { error: sourceError } = await client.from("master_cost_item_sources").insert({
      id: randomUUID(),
      project_id: projectIdFromEnv(),
      master_cost_item_id: itemId,
      source_type: "benchmark",
      source_label: input.sourceLabel,
      source_url: input.sourceUrl ?? null,
      confidence: "normal",
      notes: input.sourceNotes ?? null
    });
    if (sourceError) {
      throw new Error(`Unable to create master item source: ${sourceError.message}`);
    }
  }
  return { itemId };
}

export async function updateMasterDatabaseItem(input: UpdateMasterDatabaseItemInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { id, project_id, ...payload } = masterDatabaseItemDbPayload(input, input.itemId);
  void id;
  void project_id;
  const { error } = await client
    .from("master_cost_items")
    .update(payload)
    .eq("id", input.itemId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to update master database item: ${error.message}`);
  }
}

export async function archiveMasterDatabaseItem(itemId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_items")
    .update({ status: "archived" })
    .eq("id", itemId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to archive master database item: ${error.message}`);
  }
}

export async function deleteMasterDatabaseItem(itemId: string): Promise<void> {
  const state = await readSupabaseState();
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
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to delete master database item: ${error.message}`);
  }
}

export async function createMasterDatabaseItemSource(
  input: CreateMasterDatabaseItemSourceInput
): Promise<{ sourceId: string }> {
  const client = createServerSupabaseClient();
  const sourceId = randomUUID();
  const { error } = await client.from("master_cost_item_sources").insert({
    id: sourceId,
    project_id: projectIdFromEnv(),
    master_cost_item_id: input.masterCostItemId,
    source_type: input.sourceType ?? "benchmark",
    source_label: input.sourceLabel.trim(),
    source_url: input.sourceUrl ?? null,
    source_date: input.sourceDate ?? null,
    confidence: input.confidence ?? null,
    notes: input.notes ?? null
  });
  if (error) {
    throw new Error(`Unable to create master item source: ${error.message}`);
  }
  return { sourceId };
}

export async function updateMasterDatabaseItemSource(input: UpdateMasterDatabaseItemSourceInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_item_sources")
    .update({
      master_cost_item_id: input.masterCostItemId,
      source_type: input.sourceType ?? "benchmark",
      source_label: input.sourceLabel.trim(),
      source_url: input.sourceUrl ?? null,
      source_date: input.sourceDate ?? null,
      confidence: input.confidence ?? null,
      notes: input.notes ?? null
    })
    .eq("id", input.sourceId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to update master item source: ${error.message}`);
  }
}

export async function deleteMasterDatabaseItemSource(sourceId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_item_sources")
    .delete()
    .eq("id", sourceId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to delete master item source: ${error.message}`);
  }
}

export async function createMasterDatabaseTargetLink(
  input: CreateMasterDatabaseTargetLinkInput
): Promise<{ linkId: string }> {
  const client = createServerSupabaseClient();
  const linkId = randomUUID();
  const { error } = await client.from("master_cost_item_target_links").insert({
    id: linkId,
    project_id: projectIdFromEnv(),
    master_cost_item_id: input.masterCostItemId,
    target_type: input.targetType.trim(),
    target_ref: input.targetRef.trim(),
    link_basis: input.linkBasis ?? null,
    notes: input.notes ?? null
  });
  if (error) {
    throw new Error(`Unable to create master item target link: ${error.message}`);
  }
  return { linkId };
}

export async function updateMasterDatabaseTargetLink(input: UpdateMasterDatabaseTargetLinkInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_item_target_links")
    .update({
      master_cost_item_id: input.masterCostItemId,
      target_type: input.targetType.trim(),
      target_ref: input.targetRef.trim(),
      link_basis: input.linkBasis ?? null,
      notes: input.notes ?? null
    })
    .eq("id", input.linkId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to update master item target link: ${error.message}`);
  }
}

export async function deleteMasterDatabaseTargetLink(linkId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_item_target_links")
    .delete()
    .eq("id", linkId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to delete master item target link: ${error.message}`);
  }
}

export async function addMasterDatabaseItemToTemplate(
  input: AddMasterDatabaseItemToTemplateInput
): Promise<{ itemId: string }> {
  const state = await readSupabaseState();
  const sourceItem = state.master_cost_items.find((item) => item.id === input.masterCostItemId);
  if (!sourceItem) {
    throw new Error(`Master database item '${input.masterCostItemId}' was not found`);
  }
  const itemId = randomUUID();
  const client = createServerSupabaseClient();
  const { error } = await client.from("master_cost_template_items").insert({
    id: itemId,
    project_id: projectIdFromEnv(),
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
  if (error) {
    throw new Error(`Unable to add master database item to template: ${error.message}`);
  }
  return { itemId };
}

function masterCostItemDbPayload(input: CreateMasterCostItemInput, itemId: string) {
  if (!input.costCode.trim()) throw new Error("Cost code is required");
  if (!input.title.trim()) throw new Error("Cost item title is required");
  if (!input.unit.trim()) throw new Error("Unit is required");
  if (!Number.isFinite(input.baseRate)) throw new Error("Base rate must be numeric");
  return {
    id: itemId,
    project_id: projectIdFromEnv(),
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

export async function createMasterCostItem(input: CreateMasterCostItemInput): Promise<{ itemId: string }> {
  const client = createServerSupabaseClient();
  const itemId = randomUUID();
  const { error } = await client.from("master_cost_template_items").insert(masterCostItemDbPayload(input, itemId));
  if (error) {
    throw new Error(`Unable to create master cost item: ${error.message}`);
  }
  return { itemId };
}

export async function updateMasterCostItem(input: UpdateMasterCostItemInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { id, project_id, ...payload } = masterCostItemDbPayload(input, input.itemId);
  void id;
  void project_id;
  const { error } = await client
    .from("master_cost_template_items")
    .update(payload)
    .eq("id", input.itemId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to update master cost item: ${error.message}`);
  }
}

export async function deleteMasterCostItem(itemId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_template_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to delete master cost item: ${error.message}`);
  }
}

export async function createMasterCostItemLink(input: CreateMasterCostItemLinkInput): Promise<{ linkId: string }> {
  const client = createServerSupabaseClient();
  const linkId = randomUUID();
  const { error } = await client.from("master_cost_item_links").insert({
    id: linkId,
    project_id: projectIdFromEnv(),
    master_cost_template_item_id: input.masterCostTemplateItemId,
    target_type: input.targetType.trim(),
    target_ref: input.targetRef.trim(),
    link_basis: input.linkBasis ?? null,
    notes: input.notes ?? null
  });
  if (error) {
    throw new Error(`Unable to create master cost item link: ${error.message}`);
  }
  return { linkId };
}

export async function updateMasterCostItemLink(input: UpdateMasterCostItemLinkInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_item_links")
    .update({
      master_cost_template_item_id: input.masterCostTemplateItemId,
      target_type: input.targetType.trim(),
      target_ref: input.targetRef.trim(),
      link_basis: input.linkBasis ?? null,
      notes: input.notes ?? null
    })
    .eq("id", input.linkId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to update master cost item link: ${error.message}`);
  }
}

export async function deleteMasterCostItemLink(linkId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("master_cost_item_links")
    .delete()
    .eq("id", linkId)
    .eq("project_id", projectIdFromEnv());
  if (error) {
    throw new Error(`Unable to delete master cost item link: ${error.message}`);
  }
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
      scenario_kind: "legacy",
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

export async function createScenarioTemplate(input: {
  name: string;
  sourceScenarioId?: string | null;
}): Promise<{ scenarioId: string }> {
  const state = await readSupabaseState();
  const sourceScenarioId =
    input.sourceScenarioId ??
    state.scenarios.find((scenario) => scenario.scenario_kind === "template" || scenario.status === "template")?.id ??
    state.scenarios.find((scenario) => scenario.status === "baseline")?.id;
  if (!sourceScenarioId) {
    throw new Error("Create a baseline scenario before creating templates");
  }
  const result = await createScenario({ name: input.name, sourceScenarioId });
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("scenarios")
    .update({ status: "template", scenario_kind: "template", template_scenario_id: null })
    .eq("id", result.scenarioId);
  if (error) {
    throw new Error(`Unable to mark scenario as template: ${error.message}`);
  }
  return result;
}

export async function createSiteScenarioOption(
  input: CreateSiteScenarioOptionInput
): Promise<{ optionId: string; scenarioId: string | null }> {
  const state = await readSupabaseState();
  const site = state.sites.find((item) => item.id === input.siteId);
  if (!site) {
    throw new Error(`Site '${input.siteId}' was not found`);
  }
  const sourceScenarioId =
    input.templateScenarioId ??
    state.scenarios.find((scenario) => scenario.scenario_kind === "template" || scenario.status === "template")?.id ??
    state.scenarios.find((scenario) => scenario.status === "baseline")?.id;
  if (!sourceScenarioId) {
    throw new Error("Create a baseline or template scenario before creating site options");
  }

  let scenarioId: string | null = null;
  if (input.createDetailedScenario !== false) {
    const result = await createScenario({ name: `${site.name} - ${input.name}`, sourceScenarioId });
    scenarioId = result.scenarioId;
    const client = createServerSupabaseClient();
    const { error } = await client
      .from("scenarios")
      .update({ status: "active", scenario_kind: "site_active", template_scenario_id: sourceScenarioId })
      .eq("id", scenarioId);
    if (error) {
      throw new Error(`Unable to mark scenario as site active: ${error.message}`);
    }
  }

  const client = createServerSupabaseClient();
  const optionId = randomUUID();
  const projectId = projectIdFromEnv();
  const { error: optionError } = await client.from("scenario_options").insert({
    id: optionId,
    project_id: projectId,
    site_id: input.siteId,
    scenario_id: scenarioId,
    scenario_template_id: sourceScenarioId,
    master_cost_template_id: input.masterCostTemplateId ?? null,
    name: input.name,
    configuration: input.configuration,
    dwellings: input.dwellings ?? null,
    gross_floor_area_sqm: input.grossFloorAreaSqm ?? null,
    planning_fit: input.planningFit ?? null,
    status: "testing",
    summary: input.summary ?? null,
    target_margin_percent: input.targetMarginPercent ?? null
  });
  if (optionError) {
    throw new Error(`Unable to create scenario option: ${optionError.message}`);
  }

  const { error: salesError } = await client.from("sales_assumptions").insert({
    id: randomUUID(),
    project_id: projectId,
    scenario_option_id: optionId,
    gross_realisation: input.grossRealisation ?? 0,
    average_sale_price: input.dwellings && input.grossRealisation ? Math.round(input.grossRealisation / input.dwellings) : null,
    notes: "Created from site scenario option form"
  });
  if (salesError) {
    throw new Error(`Unable to create sales assumptions: ${salesError.message}`);
  }

  if (input.masterCostTemplateId) {
    const template = state.master_cost_templates.find((item) => item.id === input.masterCostTemplateId);
    const templateItems = state.master_cost_template_items.filter(
      (item) => item.master_cost_template_id === input.masterCostTemplateId
    );
    const itemIdMap = new Map<string, string>();
    const planItems = templateItems.map((item) => {
      const id = randomUUID();
      itemIdMap.set(String(item.id), id);
      return {
        id,
        project_id: projectId,
        scenario_option_id: optionId,
        master_cost_template_item_id: item.id,
        parent_item_id: item.parent_item_id ? itemIdMap.get(String(item.parent_item_id)) ?? null : null,
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
      };
    });
    const subtotal = templateItems.reduce(
      (total, item) => total + (Number(item.default_quantity ?? 1) * Number(item.base_rate ?? 0)),
      0
    );
    const ranges = [
      ["low", 0.92],
      ["mid", 1],
      ["high", 1.12]
    ].map(([rangeKey, factor]) => ({
      id: randomUUID(),
      project_id: projectId,
      scenario_option_id: optionId,
      range_key: rangeKey,
      label: `${String(rangeKey)[0].toUpperCase()}${String(rangeKey).slice(1)}`,
      construction_cost: Math.round(subtotal * Number(factor)),
      professional_fees: Math.round(subtotal * Number(factor) * 0.08),
      contingency: Math.round(subtotal * Number(factor) * (rangeKey === "high" ? 0.12 : rangeKey === "low" ? 0.04 : 0.08)),
      statutory_fees: Math.round(subtotal * Number(factor) * 0.035),
      finance_cost: Math.round(subtotal * Number(factor) * 0.07),
      other_costs: Math.round(subtotal * Number(factor) * 0.025),
      notes: template ? `Instantiated from ${template.name} master cost template` : "Instantiated from master cost template"
    }));
    const [planResult, rangeResult] = await Promise.all([
      planItems.length > 0 ? client.from("scenario_cost_plan_items").insert(planItems) : Promise.resolve({ error: null }),
      ranges.length > 0 ? client.from("scenario_cost_ranges").insert(ranges) : Promise.resolve({ error: null })
    ]);
    if (planResult.error) {
      throw new Error(`Unable to instantiate scenario cost plan items: ${planResult.error.message}`);
    }
    if (rangeResult.error) {
      throw new Error(`Unable to instantiate scenario cost ranges: ${rangeResult.error.message}`);
    }
  }

  return { optionId, scenarioId };
}

export async function updateScenarioOption(input: UpdateScenarioOptionInput): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("scenario_options")
    .update({
      name: input.name,
      configuration: input.configuration,
      status: input.status,
      dwellings: input.dwellings ?? null,
      gross_floor_area_sqm: input.grossFloorAreaSqm ?? null,
      planning_fit: input.planningFit ?? null,
      summary: input.summary ?? null,
      target_margin_percent: input.targetMarginPercent ?? null
    })
    .eq("id", input.optionId);
  if (error) {
    throw new Error(`Unable to update scenario option: ${error.message}`);
  }
}

export async function updateSalesAssumption(input: {
  scenarioOptionId: string;
  grossRealisation: number;
  averageSalePrice?: number | null;
  saleRatePerMonth?: number | null;
  settlementMonths?: number | null;
  notes?: string | null;
}): Promise<void> {
  const state = await readSupabaseState();
  const option = state.scenario_options.find((item) => item.id === input.scenarioOptionId);
  if (!option) {
    throw new Error(`Scenario option '${input.scenarioOptionId}' was not found`);
  }
  const existing = state.sales_assumptions.find((item) => item.scenario_option_id === input.scenarioOptionId);
  const payload = {
    project_id: projectIdFromEnv(),
    scenario_option_id: input.scenarioOptionId,
    gross_realisation: input.grossRealisation,
    average_sale_price:
      input.averageSalePrice ??
      (option.dwellings && input.grossRealisation ? Math.round(input.grossRealisation / option.dwellings) : null),
    sale_rate_per_month: input.saleRatePerMonth ?? null,
    settlement_months: input.settlementMonths ?? null,
    notes: input.notes ?? null
  };
  const client = createServerSupabaseClient();
  const { error } = existing
    ? await client.from("sales_assumptions").update(payload).eq("id", existing.id)
    : await client.from("sales_assumptions").insert({ id: randomUUID(), ...payload });
  if (error) {
    throw new Error(`Unable to update sales assumptions: ${error.message}`);
  }
}

export async function updateScenarioCostRange(input: {
  rangeId: string;
  scenarioOptionId?: string;
  constructionCost: number;
  professionalFees?: number | null;
  contingency?: number | null;
  statutoryFees?: number | null;
  financeCost?: number | null;
  otherCosts?: number | null;
  notes?: string | null;
}): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from("scenario_cost_ranges")
    .update({
      construction_cost: input.constructionCost,
      professional_fees: input.professionalFees ?? null,
      contingency: input.contingency ?? null,
      statutory_fees: input.statutoryFees ?? null,
      finance_cost: input.financeCost ?? null,
      other_costs: input.otherCosts ?? null,
      notes: input.notes ?? null
    })
    .eq("id", input.rangeId);
  if (error) {
    throw new Error(`Unable to update scenario cost range: ${error.message}`);
  }
}

export async function upsertFeasibilityBranchTargets(input: {
  branchId?: string | null;
  siteId: string;
  scenarioOptionId: string;
  scenarioId?: string | null;
  feasibilityTemplateId?: string | null;
  targetMarginPercent?: number | null;
  targetNetPositionRatio?: number | null;
}): Promise<{ branchId: string }> {
  const state = await readSupabaseState();
  const site = state.sites.find((item) => item.id === input.siteId);
  const option = state.scenario_options.find((item) => item.id === input.scenarioOptionId);
  if (!site || !option) {
    throw new Error("Site or scenario option was not found");
  }
  const branch =
    (input.branchId ? state.feasibility_branches.find((item) => item.id === input.branchId) : null) ??
    state.feasibility_branches.find((item) => item.scenario_option_id === input.scenarioOptionId);
  const client = createServerSupabaseClient();
  const payload = {
    project_id: projectIdFromEnv(),
    site_id: input.siteId,
    scenario_option_id: input.scenarioOptionId,
    scenario_id: input.scenarioId ?? option.scenario_id ?? null,
    feasibility_template_id: input.feasibilityTemplateId ?? branch?.feasibility_template_id ?? null,
    name: branch?.name ?? `${site.name} - ${option.name} method branch`,
    status: branch?.status ?? "testing",
    summary: branch?.summary ?? "Created from the Feasibility Method workspace.",
    target_margin_percent: input.targetMarginPercent ?? null,
    target_net_position_ratio: input.targetNetPositionRatio ?? null
  };
  const branchId = branch?.id ?? randomUUID();
  const { error } = branch
    ? await client.from("feasibility_branches").update(payload).eq("id", branch.id)
    : await client.from("feasibility_branches").insert({ id: branchId, ...payload });
  if (error) {
    throw new Error(`Unable to save feasibility branch targets: ${error.message}`);
  }
  return { branchId };
}

export async function archiveScenarioOption(optionId: string): Promise<void> {
  const state = await readSupabaseState();
  const option = state.scenario_options.find((item) => item.id === optionId);
  if (!option) {
    throw new Error(`Scenario option '${optionId}' was not found`);
  }
  const client = createServerSupabaseClient();
  const updates = [client.from("scenario_options").update({ status: "archived" }).eq("id", optionId)];
  if (option.scenario_id) {
    updates.push(
      client
        .from("scenarios")
        .update({ status: "archived", scenario_kind: "site_archived" })
        .eq("id", option.scenario_id)
    );
  }
  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) {
    throw new Error(`Unable to archive scenario option: ${error.message}`);
  }
}

export async function deleteScenarioOption(optionId: string): Promise<void> {
  const state = await readSupabaseState();
  const option = state.scenario_options.find((item) => item.id === optionId);
  if (!option) {
    throw new Error(`Scenario option '${optionId}' was not found`);
  }
  if (option.scenario_id && state.change_sets.some((item) => String(item.scenario_id ?? "") === option.scenario_id)) {
    throw new Error("Scenario options with change sets must be archived instead of deleted");
  }
  const client = createServerSupabaseClient();
  const { error } = await client.from("scenario_options").delete().eq("id", optionId);
  if (error) {
    throw new Error(`Unable to delete scenario option: ${error.message}`);
  }
  if (option.scenario_id) {
    await deleteScenario(option.scenario_id);
  }
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

export async function createGanttHierarchyNode(input: {
  scenarioId: string;
  label: string;
  packageId: string;
  parentId?: string | null;
  hierarchyLevel?: "subtask" | "task";
}): Promise<{ nodeId: string }> {
  const state = await readSupabaseState();
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
  await updateScheduleViewMetadata(String(view.id), state.project.id, nextMetadataJson(current));
  return { nodeId };
}

export async function updateGanttHierarchyNode(input: {
  scenarioId: string;
  nodeId: string;
  label: string;
}): Promise<void> {
  const state = await readSupabaseState();
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
  await updateScheduleViewMetadata(String(view.id), state.project.id, nextMetadataJson(current));
}

export async function moveGanttHierarchyNode(input: {
  scenarioId: string;
  nodeId: string;
  direction: "up" | "down" | "indent" | "outdent";
}): Promise<void> {
  const state = await readSupabaseState();
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

  await updateScheduleViewMetadata(String(view.id), state.project.id, nextMetadataJson(current));
}

export async function deleteGanttHierarchyNode(scenarioId: string, nodeId: string): Promise<void> {
  const state = await readSupabaseState();
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
  await updateScheduleViewMetadata(String(view.id), state.project.id, nextMetadataJson(current));
}

export async function createScheduleDependency(input: {
  scenarioId: string;
  predecessorActivityId: string;
  successorActivityId: string;
}): Promise<{ dependencyId: string }> {
  if (input.predecessorActivityId === input.successorActivityId) {
    throw new Error("Dependency requires two different activities");
  }
  const state = await readSupabaseState();
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
  await updateScheduleViewMetadata(String(view.id), state.project.id, nextMetadataJson(current));
  return { dependencyId };
}

export async function deleteScheduleDependency(scenarioId: string, dependencyId: string): Promise<void> {
  const state = await readSupabaseState();
  const view = scheduleViewForScenario(state, scenarioId);
  const current = hierarchyForView(view);
  current.dependencies = current.dependencies.filter((item) => item.id !== dependencyId);
  await updateScheduleViewMetadata(String(view.id), state.project.id, nextMetadataJson(current));
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

export type {
  CreateOverviewActionTaskInput,
  OverviewActionTask,
  OverviewActionTaskPriority,
  UpdateOverviewActionTaskInput
} from "./overview-action-tasks-types";

function mapOverviewActionTaskRow(row: Record<string, unknown>): OverviewActionTask {
  return {
    id: String(row.id),
    title: String(row.title),
    notes: row.notes == null ? null : String(row.notes),
    priority: row.priority as OverviewActionTaskPriority,
    linkPath: row.link_path == null ? null : String(row.link_path),
    sortOrder: Number(row.sort_order)
  };
}

export async function listOverviewActionTasks(): Promise<OverviewActionTask[]> {
  const client = createServerSupabaseClient();
  const projectId = projectIdFromEnv();
  const { data, error } = await client
    .from("overview_action_tasks")
    .select("id, title, notes, priority, link_path, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(`Unable to list overview action tasks: ${error.message}`);
  }
  return (data ?? []).map((row) => mapOverviewActionTaskRow(row as Record<string, unknown>));
}

export async function createOverviewActionTask(input: CreateOverviewActionTaskInput): Promise<OverviewActionTask> {
  const client = createServerSupabaseClient();
  const projectId = projectIdFromEnv();
  const title = input.title.trim();
  if (!title) {
    throw new Error("Task title is required");
  }
  const linkPath = parseOverviewTaskLinkPath(input.linkPath ?? null);
  const { data: maxRow, error: maxError } = await client
    .from("overview_action_tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) {
    throw new Error(`Unable to resolve overview task order: ${maxError.message}`);
  }
  const nextOrder =
    maxRow && typeof (maxRow as { sort_order?: unknown }).sort_order === "number"
      ? Number((maxRow as { sort_order: number }).sort_order) + 1
      : 0;
  const notes = input.notes == null || String(input.notes).trim() === "" ? null : String(input.notes).trim();
  const { data, error } = await client
    .from("overview_action_tasks")
    .insert({
      project_id: projectId,
      sort_order: nextOrder,
      title,
      notes,
      priority: input.priority,
      link_path: linkPath
    })
    .select("id, title, notes, priority, link_path, sort_order")
    .single();
  if (error || !data) {
    throw new Error(`Unable to create overview action task: ${error?.message ?? "no row returned"}`);
  }
  return mapOverviewActionTaskRow(data as Record<string, unknown>);
}

export async function updateOverviewActionTask(id: string, patch: UpdateOverviewActionTaskInput): Promise<void> {
  const client = createServerSupabaseClient();
  const projectId = projectIdFromEnv();
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) {
      throw new Error("Task title is required");
    }
    updates.title = title;
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes == null || String(patch.notes).trim() === "" ? null : String(patch.notes).trim();
  }
  if (patch.priority !== undefined) {
    updates.priority = patch.priority;
  }
  if (patch.linkPath !== undefined) {
    updates.link_path = parseOverviewTaskLinkPath(patch.linkPath);
  }
  if (Object.keys(updates).length === 0) {
    return;
  }
  const { error } = await client
    .from("overview_action_tasks")
    .update(updates)
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) {
    throw new Error(`Unable to update overview action task: ${error.message}`);
  }
}

export async function deleteOverviewActionTask(id: string): Promise<void> {
  const client = createServerSupabaseClient();
  const projectId = projectIdFromEnv();
  const { error } = await client.from("overview_action_tasks").delete().eq("id", id).eq("project_id", projectId);
  if (error) {
    throw new Error(`Unable to delete overview action task: ${error.message}`);
  }
  const { data: remainingRows, error: remainingError } = await client
    .from("overview_action_tasks")
    .select("id")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (remainingError) {
    throw new Error(`Unable to reload overview action tasks: ${remainingError.message}`);
  }
  const remainingIds = (remainingRows ?? []).map((r: { id: string }) => String(r.id));
  for (let i = 0; i < remainingIds.length; i++) {
    const { error: reorderError } = await client
      .from("overview_action_tasks")
      .update({ sort_order: i })
      .eq("id", remainingIds[i])
      .eq("project_id", projectId);
    if (reorderError) {
      throw new Error(`Unable to renumber overview action tasks: ${reorderError.message}`);
    }
  }
}

export async function reorderOverviewActionTasks(orderedIds: string[]): Promise<void> {
  const client = createServerSupabaseClient();
  const projectId = projectIdFromEnv();
  const { data: rows, error: listError } = await client.from("overview_action_tasks").select("id").eq("project_id", projectId);
  if (listError) {
    throw new Error(`Unable to verify overview action tasks: ${listError.message}`);
  }
  const existing = new Set((rows ?? []).map((r: { id: string }) => String(r.id)));
  if (orderedIds.length !== existing.size) {
    throw new Error("Reorder payload must include every task exactly once");
  }
  for (const taskId of orderedIds) {
    if (!existing.has(taskId)) {
      throw new Error(`Unknown task id in reorder: ${taskId}`);
    }
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await client
      .from("overview_action_tasks")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`Unable to reorder overview action tasks: ${error.message}`);
    }
  }
}

export { actionsForStatus };
