import { randomUUID } from "node:crypto";

import { vocab } from "../../../../shared/contracts/api/index";

export type ObjectRefType = "zone" | "model_object";
export type ChangeSetAction = "submit" | "approve" | "queue";
export type ChangeSetStatus = (typeof vocab.changeSetStatuses)[number];
export type CostRangeKey = "low" | "mid" | "high" | "other";
export type SiteConstraintCategory = "planning" | "site" | "services" | "risk";
export type ScenarioKind = "template" | "site_active" | "site_archived" | "legacy";
export type EstimateGranularity = "allowance" | "provisional_sum" | "system" | "element" | "assembly" | "material";
export type CostingMethod =
  | "rate_per_sqm"
  | "rate_per_lm"
  | "rate_per_m3"
  | "rate_per_item"
  | "rate_per_dwelling"
  | "rate_per_zone"
  | "fixed_sum";

export type DevelopmentSiteRecord = {
  id: string;
  project_id: string;
  site_code?: string | null;
  site_date?: string | null;
  name: string;
  address: string;
  locality?: string | null;
  status: string;
  current_stage?: string | null;
  acquisition_status?: string | null;
  priority?: string | null;
  site_area_sqm?: number | null;
  summary?: string | null;
};

export type SitePatch = {
  siteCode?: string | null;
  siteDate?: string | null;
  name?: string;
  address?: string;
  locality?: string | null;
  status?: string;
  currentStage?: string | null;
  acquisitionStatus?: string | null;
  priority?: string | null;
  siteAreaSqm?: number | null;
  summary?: string | null;
};

export type SiteConstraintRecord = {
  id: string;
  site_id: string;
  category: SiteConstraintCategory | string;
  title: string;
  description: string;
  severity: string;
  status?: string | null;
  authority?: string | null;
  source?: string | null;
};

export type ScenarioOptionRecord = {
  id: string;
  site_id: string;
  scenario_id?: string | null;
  scenario_template_id?: string | null;
  master_cost_template_id?: string | null;
  name: string;
  configuration: string;
  dwellings?: number | null;
  gross_floor_area_sqm?: number | null;
  planning_fit?: string | null;
  status: string;
  summary?: string | null;
  target_margin_percent?: number | null;
  pinned_at?: string | null;
  pinned_reason?: string | null;
};

export type MasterCostTemplateRecord = {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  status: string;
  template_type?: string | null;
};

export type MasterCodeCatalogRecord = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  version_label?: string | null;
};

export type MasterCodeItemRecord = {
  id: string;
  catalog_id: string;
  parent_item_id?: string | null;
  code: string;
  title: string;
  code_type: string;
  trade_code?: string | null;
  package_id?: string | null;
  default_unit?: string | null;
  default_estimate_granularity?: EstimateGranularity | string | null;
  default_costing_method?: CostingMethod | string | null;
  notes?: string | null;
  status: string;
  sort_order?: number | null;
};

export type MasterCostItemRecord = {
  id: string;
  project_id: string;
  master_code_item_id?: string | null;
  cost_code: string;
  title: string;
  trade_code?: string | null;
  package_id?: string | null;
  estimate_granularity: EstimateGranularity | string;
  costing_method: CostingMethod | string;
  unit: string;
  base_rate: number;
  source_label?: string | null;
  source_url?: string | null;
  source_notes?: string | null;
  notes?: string | null;
  status?: string | null;
};

export type MasterCostItemSourceRecord = {
  id: string;
  project_id: string;
  master_cost_item_id: string;
  source_type: string;
  source_label: string;
  source_url?: string | null;
  source_date?: string | null;
  confidence?: string | null;
  notes?: string | null;
};

export type MasterCostItemTargetLinkRecord = {
  id: string;
  project_id: string;
  master_cost_item_id: string;
  target_type: string;
  target_ref: string;
  link_basis?: string | null;
  notes?: string | null;
};

export type MasterCostTemplateItemRecord = {
  id: string;
  project_id: string;
  master_cost_template_id: string;
  master_cost_item_id?: string | null;
  master_code_item_id?: string | null;
  parent_item_id?: string | null;
  cost_code: string;
  title: string;
  trade_code?: string | null;
  package_id?: string | null;
  estimate_granularity: EstimateGranularity | string;
  costing_method: CostingMethod | string;
  unit: string;
  base_rate: number;
  default_quantity?: number | null;
  quantity_basis?: string | null;
  low_factor?: number | null;
  mid_factor?: number | null;
  high_factor?: number | null;
  contingency_percent?: number | null;
  notes?: string | null;
  sort_order?: number | null;
};

export type MasterCostItemLinkRecord = {
  id: string;
  project_id: string;
  master_cost_template_item_id: string;
  target_type: string;
  target_ref: string;
  link_basis?: string | null;
  notes?: string | null;
};

export type ScenarioCostPlanItemRecord = {
  id: string;
  project_id: string;
  scenario_option_id: string;
  master_cost_template_item_id?: string | null;
  parent_item_id?: string | null;
  cost_code: string;
  title: string;
  estimate_granularity: EstimateGranularity | string;
  costing_method: CostingMethod | string;
  unit: string;
  quantity: number;
  rate: number;
  range_key?: CostRangeKey | string | null;
  confidence?: string | null;
  inclusion_status?: string | null;
  linked_target_type?: string | null;
  linked_target_ref?: string | null;
  notes?: string | null;
};

export type ScenarioCostRangeRecord = {
  id: string;
  scenario_option_id: string;
  range_key: CostRangeKey | string;
  label: string;
  construction_cost: number;
  professional_fees?: number | null;
  contingency?: number | null;
  statutory_fees?: number | null;
  finance_cost?: number | null;
  other_costs?: number | null;
  notes?: string | null;
};

export type SalesAssumptionRecord = {
  id: string;
  scenario_option_id: string;
  gross_realisation: number;
  average_sale_price?: number | null;
  sale_rate_per_month?: number | null;
  settlement_months?: number | null;
  notes?: string | null;
};

export type AssumptionValueType = "fixed" | "range" | "distribution" | "discrete";
export type AssumptionImpactArea = "revenue" | "cost" | "finance" | "timing" | "tax" | "risk";
export type AssumptionDistributionType = "uniform" | "triangular" | "normal" | "discrete";
export const ASSUMPTION_PARTICIPANT_ROLES = [
  "accountable_owner",
  "validates_assumption",
  "provides_evidence",
  "approves_strategy",
  "challenges",
  "watcher"
] as const;
export type AssumptionParticipantRole = (typeof ASSUMPTION_PARTICIPANT_ROLES)[number];

export type SiteTemplateRecord = {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  locality_profile?: string | null;
  planning_authority?: string | null;
  acquisition_strategy?: string | null;
  default_finance_pack_id?: string | null;
  default_tax_rule_set_id?: string | null;
  target_margin_percent?: number | null;
  required_participant_roles_json?: string[];
  status: string;
};

export type ScenarioTemplateRecord = {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  development_type?: string | null;
  dwellings?: number | null;
  sell_count?: number | null;
  retain_count?: number | null;
  gross_floor_area_sqm?: number | null;
  planning_pathway?: string | null;
  master_cost_template_id?: string | null;
  unit_schedule_json?: Array<Record<string, unknown>>;
  status: string;
};

export type FeasibilityTemplateRecord = {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  calculation_mode: string;
  target_margin_percent?: number | null;
  target_net_position_ratio?: number | null;
  sensitivity_ranges_json?: Record<string, unknown>;
  required_validation_rules_json?: Array<Record<string, unknown>>;
  status: string;
};

export type FeasibilityBranchRecord = {
  id: string;
  project_id: string;
  site_id: string;
  scenario_option_id?: string | null;
  scenario_id?: string | null;
  feasibility_template_id?: string | null;
  name: string;
  status: string;
  summary?: string | null;
  target_margin_percent?: number | null;
  target_net_position_ratio?: number | null;
  created_at?: string | null;
};

export type AssumptionTemplateRecord = {
  id: string;
  project_id: string;
  name: string;
  category: string;
  assumption_kind: string;
  impact_area: AssumptionImpactArea | string;
  value_type: AssumptionValueType | string;
  unit?: string | null;
  default_value?: number | string | boolean | null;
  min_value?: number | null;
  max_value?: number | null;
  most_likely_value?: number | null;
  step?: number | null;
  distribution_type?: AssumptionDistributionType | string | null;
  formula_key?: string | null;
  source_type?: string | null;
  source_ref?: string | null;
  default_validator_profile_id?: string | null;
  evidence_requirement?: string | null;
  task_trigger_json?: Record<string, unknown> | null;
  enabled_for_simulation?: boolean | null;
  correlation_group?: string | null;
  notes?: string | null;
  status: string;
};

export type AssumptionApplicationRecord = {
  id: string;
  project_id: string;
  assumption_template_id: string;
  applied_ref_type: string;
  applied_ref_id: string;
  feasibility_branch_id?: string | null;
  local_value?: number | string | boolean | null;
  local_min_value?: number | null;
  local_max_value?: number | null;
  local_most_likely_value?: number | null;
  enabled_for_simulation?: boolean | null;
  confidence?: string | null;
  status: string;
  calculation_impact_json?: Record<string, unknown> | null;
  notes?: string | null;
};

export type AssumptionValidationRecord = {
  id: string;
  project_id: string;
  assumption_application_id: string;
  profile_id: string;
  relationship_type: AssumptionParticipantRole | string;
  status: string;
  confidence?: string | null;
  notes?: string | null;
};

export type AssumptionEvidenceRecord = {
  id: string;
  project_id: string;
  assumption_application_id: string;
  evidence_type: string;
  title: string;
  linked_ref_type?: string | null;
  linked_ref_id?: string | null;
  url?: string | null;
  notes?: string | null;
  status: string;
};

export type AssumptionActionRecord = {
  id: string;
  project_id: string;
  assumption_application_id: string;
  action_template_id?: string | null;
  title: string;
  stage?: string | null;
  timing_offset_days?: number | null;
  priority: string;
  responsible_profile_id?: string | null;
  linked_task_id?: string | null;
  risk_if_delayed?: string | null;
  status: string;
  notes?: string | null;
};

export type SimulationTemplateRecord = {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  sample_count: number;
  target_metrics_json?: string[];
  enabled_assumption_categories_json?: string[];
  optimisation_constraints_json?: Record<string, unknown>;
  status: string;
};

export type SimulationRunRecord = {
  id: string;
  project_id: string;
  feasibility_branch_id: string;
  simulation_template_id?: string | null;
  name: string;
  status: string;
  sample_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  summary_json?: Record<string, unknown> | null;
};

export type SimulationSampleRecord = {
  id: string;
  project_id: string;
  simulation_run_id: string;
  sample_index: number;
  sampled_values_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  verdict?: string | null;
};

export type ArchicadLinkRecord = {
  id: string;
  site_id: string;
  scenario_option_id?: string | null;
  archicad_project_id: string;
  file_label: string;
  file_url?: string | null;
  model_scope?: string | null;
  linked_guid_count?: number | null;
  assembly_task_ids?: string[];
  last_snapshot_at?: string | null;
};

export type SiteResourceRecord = {
  id: string;
  project_id: string;
  site_id: string;
  resource_type: string;
  title: string;
  url?: string | null;
  storage_path?: string | null;
  source_label?: string | null;
  notes?: string | null;
  status: string;
  created_at?: string | null;
};

export type SitePlanningHighlightRecord = {
  id: string;
  project_id: string;
  site_id: string;
  source_resource_id?: string | null;
  council?: string | null;
  planning_scheme?: string | null;
  zoning?: string | null;
  overlays_json?: unknown[];
  site_area_sqm?: number | null;
  lot_plan?: string | null;
  heritage_status?: string | null;
  flood_status?: string | null;
  bushfire_status?: string | null;
  vegetation_status?: string | null;
  utilities_status?: string | null;
  easements?: string | null;
  planning_summary?: string | null;
  source_date?: string | null;
  /** Keys like council, zoning, overlays — true marks the matrix cell as flagged in the UI. */
  matrix_cell_flags_json?: Record<string, boolean> | null;
  status: string;
  created_at?: string | null;
};

export type NetworkOrganisationRecord = {
  id: string;
  project_id: string;
  name: string;
  organisation_type: string;
  description?: string | null;
  status: string;
};

export type NetworkProfileRecord = {
  id: string;
  project_id: string;
  organisation_id?: string | null;
  display_name: string;
  profile_type: string;
  category: string;
  domain: string;
  summary?: string | null;
  contact_details?: string | null;
  preferred_llm?: string | null;
  status: string;
};

export type NetworkProfileCapabilityRecord = {
  id: string;
  project_id: string;
  profile_id: string;
  skills_json?: unknown[];
  base_knowledge?: string | null;
  scope?: string | null;
  constraints_json?: unknown[];
  question_types_json?: unknown[];
  output_types_json?: unknown[];
  operating_instructions_md?: string | null;
  constraints_md?: string | null;
  review_policy_md?: string | null;
};

export type NetworkKnowledgePackRecord = {
  id: string;
  project_id: string;
  title: string;
  domain: string;
  instructions?: string | null;
  constraints_json?: unknown[];
  sources_json?: unknown[];
  tools_json?: unknown[];
  output_policy?: string | null;
  status: string;
};

export type NetworkProfileKnowledgePackRecord = {
  id: string;
  project_id: string;
  profile_id: string;
  knowledge_pack_id: string;
};

export type NetworkInquiryRecord = {
  id: string;
  project_id: string;
  title: string;
  question: string;
  status: string;
  linked_ref_type?: string | null;
  linked_ref_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

export type NetworkInquiryMessageRecord = {
  id: string;
  project_id: string;
  inquiry_id: string;
  profile_id?: string | null;
  author_label: string;
  author_type: string;
  message: string;
  citations_json?: unknown[];
  created_at?: string | null;
};

export type NetworkWorkProductRecord = {
  id: string;
  project_id: string;
  inquiry_id?: string | null;
  profile_id?: string | null;
  title: string;
  product_type: string;
  status: string;
  summary?: string | null;
  created_at?: string | null;
};

export type NetworkWorkProductLinkRecord = {
  id: string;
  project_id: string;
  work_product_id: string;
  linked_ref_type: string;
  linked_ref_id: string;
  notes?: string | null;
};

export type NetworkAgentCardRecord = {
  id: string;
  project_id: string;
  profile_id: string;
  model_label?: string | null;
  system_instructions?: string | null;
  context_policy?: string | null;
  persona_md?: string | null;
  memory_md?: string | null;
  tool_policy_json?: unknown;
  skill_policy_json?: unknown[];
  output_schema_json?: Record<string, unknown>;
  review_policy_md?: string | null;
  escalation_policy_md?: string | null;
  status: string;
};

export type NetworkAgentSessionRecord = {
  id: string;
  project_id: string;
  inquiry_id?: string | null;
  title: string;
  status: string;
  objective?: string | null;
  linked_ref_type?: string | null;
  linked_ref_id?: string | null;
  created_at?: string | null;
};

export type NetworkAgentSessionParticipantRecord = {
  id: string;
  project_id: string;
  session_id: string;
  profile_id: string;
  session_role: string;
};

export type NetworkAgentMessageRecord = {
  id: string;
  project_id: string;
  session_id: string;
  profile_id?: string | null;
  author_label: string;
  message_role: string;
  content: string;
  created_at?: string | null;
};

export type NetworkAgentToolCallRecord = {
  id: string;
  project_id: string;
  session_id: string;
  profile_id?: string | null;
  tool_name: string;
  input_summary?: string | null;
  output_summary?: string | null;
  evidence_refs_json?: unknown[];
};

export type NetworkAgentOutputRecord = {
  id: string;
  project_id: string;
  session_id: string;
  profile_id?: string | null;
  output_type: string;
  title: string;
  summary?: string | null;
  output_json?: Record<string, unknown>;
  status: string;
};
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
  sites: DevelopmentSiteRecord[];
  site_constraints: SiteConstraintRecord[];
  scenario_options: ScenarioOptionRecord[];
  scenario_cost_ranges: ScenarioCostRangeRecord[];
  sales_assumptions: SalesAssumptionRecord[];
  archicad_links: ArchicadLinkRecord[];
  site_resources: SiteResourceRecord[];
  site_planning_highlights: SitePlanningHighlightRecord[];
  site_templates: SiteTemplateRecord[];
  scenario_templates: ScenarioTemplateRecord[];
  feasibility_templates: FeasibilityTemplateRecord[];
  feasibility_branches: FeasibilityBranchRecord[];
  assumption_templates: AssumptionTemplateRecord[];
  assumption_applications: AssumptionApplicationRecord[];
  assumption_validations: AssumptionValidationRecord[];
  assumption_evidence: AssumptionEvidenceRecord[];
  assumption_actions: AssumptionActionRecord[];
  simulation_templates: SimulationTemplateRecord[];
  simulation_runs: SimulationRunRecord[];
  simulation_samples: SimulationSampleRecord[];
  network_organisations: NetworkOrganisationRecord[];
  network_profiles: NetworkProfileRecord[];
  network_profile_capabilities: NetworkProfileCapabilityRecord[];
  network_knowledge_packs: NetworkKnowledgePackRecord[];
  network_profile_knowledge_packs: NetworkProfileKnowledgePackRecord[];
  network_inquiries: NetworkInquiryRecord[];
  network_inquiry_messages: NetworkInquiryMessageRecord[];
  network_work_products: NetworkWorkProductRecord[];
  network_work_product_links: NetworkWorkProductLinkRecord[];
  network_agent_cards: NetworkAgentCardRecord[];
  network_agent_sessions: NetworkAgentSessionRecord[];
  network_agent_session_participants: NetworkAgentSessionParticipantRecord[];
  network_agent_messages: NetworkAgentMessageRecord[];
  network_agent_tool_calls: NetworkAgentToolCallRecord[];
  network_agent_outputs: NetworkAgentOutputRecord[];
  master_code_catalogs: MasterCodeCatalogRecord[];
  master_code_items: MasterCodeItemRecord[];
  master_cost_templates: MasterCostTemplateRecord[];
  master_cost_items: MasterCostItemRecord[];
  master_cost_item_sources: MasterCostItemSourceRecord[];
  master_cost_item_target_links: MasterCostItemTargetLinkRecord[];
  master_cost_template_items: MasterCostTemplateItemRecord[];
  master_cost_item_links: MasterCostItemLinkRecord[];
  scenario_cost_plan_items: ScenarioCostPlanItemRecord[];
  work_packages: Array<RuntimeRecord>;
  scenarios: Array<{
    id: string;
    name: string;
    status: string;
    parent_scenario_id?: string | null;
    scenario_kind?: ScenarioKind | string | null;
    template_scenario_id?: string | null;
  }>;
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
  "master_code_catalogs",
  "master_code_items",
  "master_cost_templates",
  "master_cost_items",
  "master_cost_item_sources",
  "master_cost_item_target_links",
  "master_cost_template_items",
  "master_cost_item_links",
  "scenario_cost_plan_items",
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

const FEASIBILITY_ARRAY_KEYS = new Set<string>([
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
  "master_code_catalogs",
  "master_code_items",
  "master_cost_templates",
  "master_cost_items",
  "master_cost_item_sources",
  "master_cost_item_target_links",
  "master_cost_template_items",
  "master_cost_item_links",
  "scenario_cost_plan_items"
]);

const ALLOWED_TRANSITIONS: Record<ChangeSetStatus, ChangeSetAction[]> = {
  draft: ["submit"],
  submitted: ["approve"],
  approved: ["queue"],
  rejected: [],
  queued_for_sync: [],
  synced: [],
  sync_failed: []
};

function isFeasibilityArrayKey(key: string): boolean {
  return FEASIBILITY_ARRAY_KEYS.has(key);
}

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
      if (value === undefined && isFeasibilityArrayKey(key)) {
        return [key, []];
      }
      if (!Array.isArray(value)) {
        throw new Error(`Runtime state key '${key}' must be an array`);
      }
      return [key, value];
    })
  ) as { [K in (typeof ARRAY_KEYS)[number]]: RuntimeState[K] };

  const state = {
    project: {
      id: stringField(project, "id", "project"),
      name: stringField(project, "name", "project"),
      archicad_project_id: stringField(project, "archicad_project_id", "project")
    },
    sites: arrayValues.sites as RuntimeState["sites"],
    site_constraints: arrayValues.site_constraints as RuntimeState["site_constraints"],
    scenario_options: arrayValues.scenario_options as RuntimeState["scenario_options"],
    scenario_cost_ranges: arrayValues.scenario_cost_ranges as RuntimeState["scenario_cost_ranges"],
    sales_assumptions: arrayValues.sales_assumptions as RuntimeState["sales_assumptions"],
    archicad_links: arrayValues.archicad_links as RuntimeState["archicad_links"],
    site_resources: arrayValues.site_resources as RuntimeState["site_resources"],
    site_planning_highlights: arrayValues.site_planning_highlights as RuntimeState["site_planning_highlights"],
    site_templates: arrayValues.site_templates as RuntimeState["site_templates"],
    scenario_templates: arrayValues.scenario_templates as RuntimeState["scenario_templates"],
    feasibility_templates: arrayValues.feasibility_templates as RuntimeState["feasibility_templates"],
    feasibility_branches: arrayValues.feasibility_branches as RuntimeState["feasibility_branches"],
    assumption_templates: arrayValues.assumption_templates as RuntimeState["assumption_templates"],
    assumption_applications: arrayValues.assumption_applications as RuntimeState["assumption_applications"],
    assumption_validations: arrayValues.assumption_validations as RuntimeState["assumption_validations"],
    assumption_evidence: arrayValues.assumption_evidence as RuntimeState["assumption_evidence"],
    assumption_actions: arrayValues.assumption_actions as RuntimeState["assumption_actions"],
    simulation_templates: arrayValues.simulation_templates as RuntimeState["simulation_templates"],
    simulation_runs: arrayValues.simulation_runs as RuntimeState["simulation_runs"],
    simulation_samples: arrayValues.simulation_samples as RuntimeState["simulation_samples"],
    network_organisations: arrayValues.network_organisations as RuntimeState["network_organisations"],
    network_profiles: arrayValues.network_profiles as RuntimeState["network_profiles"],
    network_profile_capabilities: arrayValues.network_profile_capabilities as RuntimeState["network_profile_capabilities"],
    network_knowledge_packs: arrayValues.network_knowledge_packs as RuntimeState["network_knowledge_packs"],
    network_profile_knowledge_packs: arrayValues.network_profile_knowledge_packs as RuntimeState["network_profile_knowledge_packs"],
    network_inquiries: arrayValues.network_inquiries as RuntimeState["network_inquiries"],
    network_inquiry_messages: arrayValues.network_inquiry_messages as RuntimeState["network_inquiry_messages"],
    network_work_products: arrayValues.network_work_products as RuntimeState["network_work_products"],
    network_work_product_links: arrayValues.network_work_product_links as RuntimeState["network_work_product_links"],
    network_agent_cards: arrayValues.network_agent_cards as RuntimeState["network_agent_cards"],
    network_agent_sessions: arrayValues.network_agent_sessions as RuntimeState["network_agent_sessions"],
    network_agent_session_participants: arrayValues.network_agent_session_participants as RuntimeState["network_agent_session_participants"],
    network_agent_messages: arrayValues.network_agent_messages as RuntimeState["network_agent_messages"],
    network_agent_tool_calls: arrayValues.network_agent_tool_calls as RuntimeState["network_agent_tool_calls"],
    network_agent_outputs: arrayValues.network_agent_outputs as RuntimeState["network_agent_outputs"],
    master_code_catalogs: arrayValues.master_code_catalogs as RuntimeState["master_code_catalogs"],
    master_code_items: arrayValues.master_code_items as RuntimeState["master_code_items"],
    master_cost_templates: arrayValues.master_cost_templates as RuntimeState["master_cost_templates"],
    master_cost_items: arrayValues.master_cost_items as RuntimeState["master_cost_items"],
    master_cost_item_sources: arrayValues.master_cost_item_sources as RuntimeState["master_cost_item_sources"],
    master_cost_item_target_links: arrayValues.master_cost_item_target_links as RuntimeState["master_cost_item_target_links"],
    master_cost_template_items: arrayValues.master_cost_template_items as RuntimeState["master_cost_template_items"],
    master_cost_item_links: arrayValues.master_cost_item_links as RuntimeState["master_cost_item_links"],
    scenario_cost_plan_items: arrayValues.scenario_cost_plan_items as RuntimeState["scenario_cost_plan_items"],
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

function validateSiteName(state: RuntimeState, siteId: string | null, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Site name is required");
  }
  if (state.sites.some((site) => site.name === trimmed && site.id !== (siteId ?? ""))) {
    throw new Error(`Site '${trimmed}' already exists`);
  }
  return trimmed;
}

export function createDevelopmentSite(
  state: RuntimeState,
  input: SitePatch & { id: string; projectId?: string }
): DevelopmentSiteRecord {
  const name = validateSiteName(state, null, input.name ?? "");
  const address = (input.address ?? "").trim();
  if (!address) {
    throw new Error("Site address is required");
  }
  const site: DevelopmentSiteRecord = {
    id: input.id,
    project_id: input.projectId ?? state.project.id,
    site_code: input.siteCode?.trim() || input.id,
    site_date: input.siteDate?.trim() || null,
    name,
    address,
    locality: input.locality ?? null,
    status: input.status ?? "screening",
    current_stage: input.currentStage ?? null,
    acquisition_status: input.acquisitionStatus ?? null,
    priority: input.priority ?? null,
    site_area_sqm: input.siteAreaSqm ?? null,
    summary: input.summary ?? null
  };
  state.sites.push(site);
  return site;
}

export function updateDevelopmentSite(
  state: RuntimeState,
  siteId: string,
  patch: SitePatch
): DevelopmentSiteRecord {
  const site = state.sites.find((item) => item.id === siteId);
  if (!site) {
    throw new Error(`Site '${siteId}' was not found`);
  }
  if (patch.name !== undefined) {
    site.name = validateSiteName(state, siteId, patch.name);
  }
  if (patch.siteCode !== undefined) site.site_code = patch.siteCode?.trim() || null;
  if (patch.siteDate !== undefined) site.site_date = patch.siteDate?.trim() || null;
  if (patch.address !== undefined) {
    const address = patch.address.trim();
    if (!address) {
      throw new Error("Site address is required");
    }
    site.address = address;
  }
  if (patch.locality !== undefined) site.locality = patch.locality;
  if (patch.status !== undefined) site.status = patch.status;
  if (patch.currentStage !== undefined) site.current_stage = patch.currentStage;
  if (patch.acquisitionStatus !== undefined) site.acquisition_status = patch.acquisitionStatus;
  if (patch.priority !== undefined) site.priority = patch.priority;
  if (patch.siteAreaSqm !== undefined) site.site_area_sqm = patch.siteAreaSqm;
  if (patch.summary !== undefined) site.summary = patch.summary;
  return site;
}

export function archiveDevelopmentSite(state: RuntimeState, siteId: string): DevelopmentSiteRecord {
  return updateDevelopmentSite(state, siteId, { status: "archived" });
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
