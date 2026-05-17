import type {
  ArchicadLinkRecord,
  MasterCodeCatalogRecord,
  MasterCodeItemRecord,
  MasterCostItemRecord,
  MasterCostTemplateItemRecord,
  MasterCostTemplateRecord,
  RuntimeState,
  SalesAssumptionRecord,
  ScenarioTemplateRecord,
  ScenarioCostPlanItemRecord,
  ScenarioCostRangeRecord,
  ScenarioOptionRecord,
  FeasibilityBranchRecord,
  FeasibilityTemplateRecord,
  AssumptionActionRecord,
  AssumptionApplicationRecord,
  AssumptionEvidenceRecord,
  AssumptionTemplateRecord,
  AssumptionValidationRecord,
  SiteTemplateRecord,
  SiteConstraintRecord,
  SitePlanningHighlightRecord,
  SiteResourceRecord
} from "./runtime-state";

export type FeasibilityMetrics = {
  totalCost: number;
  revenue: number;
  marginAmount: number;
  marginPercent: number;
};

export type FeasibilityCostBand = ScenarioCostRangeRecord & {
  totalCost: number;
  marginAmount: number;
  marginPercent: number;
};

export const FEASIBILITY_METHOD_STAGES = [
  "goal",
  "site_basis",
  "planning_envelope",
  "yield_scheme",
  "cost_plan",
  "revenue_model",
  "funding_retain",
  "verdict",
  "evaluator_challenge",
  "improvement_levers"
] as const;

export type FeasibilityMethodStage = (typeof FEASIBILITY_METHOD_STAGES)[number];

export type FeasibilityMethodMetricTargets = {
  standardDeveloperMarginPercent: number | null;
  netRetainedPositionRatio: number | null;
};

export type FeasibilityMethodMetrics = {
  allInCost: number;
  soldRevenue: number;
  grossRealisation: number;
  grossProfit: number;
  cashProfit: number;
  cashSurplusAfterSales: number;
  requiredResidualDebt: number;
  retainedDwellingValue: number;
  retainedDebt: number;
  netRetainedEquity: number;
  standardDeveloperMarginPercent: number | null;
  marginOnCostPercent: number | null;
  netRetainedPositionRatio: number | null;
};

export type FeasibilityMethodVerdict = "pass" | "near_miss" | "risk" | "incomplete";

export type FeasibilityMethodTemplateStack = {
  siteTemplate: SiteTemplateRecord | null;
  scenarioTemplate: ScenarioTemplateRecord | null;
  costTemplate: MasterCostTemplateRecord | null;
  feasibilityTemplate: FeasibilityTemplateRecord | null;
};

export type FeasibilityKnowledgeKind = "source" | "fact" | "assumption" | "rule" | "challenge" | "decision";

export type FeasibilityKnowledgeItem = {
  id: string;
  kind: FeasibilityKnowledgeKind;
  title: string;
  sourceRef: string;
  confidence: string | null;
  status: string | null;
};

export type FeasibilityMethodChallenge = {
  id: string;
  title: string;
  area: string;
  confidence: string | null;
  status: string;
  notes: string | null;
  validationCount: number;
};

export type FeasibilityMethodLever = {
  id: string;
  title: string;
  area: string;
  value: number | string | boolean | null;
  confidence: string | null;
  status: string;
  notes: string | null;
  actionCount: number;
};

export type FeasibilityMethodRun = {
  id: string;
  projectName: string;
  site: SiteFeasibility;
  option: ScenarioOptionFeasibility;
  branch: FeasibilityBranchRecord | null;
  costBand: FeasibilityCostBand | null;
  targets: FeasibilityMethodMetricTargets;
  metrics: FeasibilityMethodMetrics;
  verdict: FeasibilityMethodVerdict;
  templateStack: FeasibilityMethodTemplateStack;
  methodStages: FeasibilityMethodStage[];
  knowledgeItems: FeasibilityKnowledgeItem[];
  challenges: FeasibilityMethodChallenge[];
  levers: FeasibilityMethodLever[];
};

export type ScenarioOptionFeasibility = ScenarioOptionRecord & {
  linkedScenarioName: string | null;
  linkedScenarioKind: string;
  templateScenarioName: string | null;
  masterCostTemplate: MasterCostTemplateRecord | null;
  costPlanItems: ScenarioCostPlanItemRecord[];
  costBands: FeasibilityCostBand[];
  salesAssumption: SalesAssumptionRecord | null;
  archicadLink: ArchicadLinkRecord | null;
  scheduleSummary: {
    activityCount: number;
    startDate: string | null;
    finishDate: string | null;
    durationDays: number | null;
    packageCount: number;
    workfrontCount: number;
  };
  assemblyTaskIds: string[];
};

export type SiteFeasibility = {
  id: string;
  siteCode: string | null;
  siteDate: string | null;
  name: string;
  address: string;
  locality: string | null;
  status: string;
  currentStage: string | null;
  acquisitionStatus: string | null;
  priority: string | null;
  siteAreaSqm: number | null;
  summary: string | null;
  constraints: SiteConstraintRecord[];
  resources: SiteResourceRecord[];
  planningHighlights: SitePlanningHighlightRecord[];
  activePlanningHighlight: SitePlanningHighlightRecord | null;
  googleMapsUrl: string;
  googleMapsEmbedUrl: string;
  manualMapUrl: string | null;
  scenarioOptions: ScenarioOptionFeasibility[];
  archicadLinks: ArchicadLinkRecord[];
};

export type FeasibilityPortfolio = {
  projectName: string;
  masterCodeCatalogs: MasterCodeCatalogRecord[];
  masterCodeItems: MasterCodeItemRecord[];
  sites: SiteFeasibility[];
  scenarioTemplates: Array<RuntimeState["scenarios"][number]>;
  masterCostTemplates: Array<
    MasterCostTemplateRecord & {
      items: Array<
        MasterCostTemplateItemRecord & {
          links: RuntimeState["master_cost_item_links"];
          sourceItem: MasterCostItemRecord | null;
        }
      >;
    }
  >;
  masterCostItems: Array<
    MasterCostItemRecord & {
      sources: RuntimeState["master_cost_item_sources"];
      targetLinks: RuntimeState["master_cost_item_target_links"];
    }
  >;
  totals: {
    siteCount: number;
    scenarioOptionCount: number;
    constrainedSiteCount: number;
    archicadLinkedOptionCount: number;
  };
};

export type PinnedScenarioOption = {
  site: Pick<SiteFeasibility, "id" | "name" | "locality" | "status" | "priority">;
  option: ScenarioOptionFeasibility;
  pinnedAt: string | null;
  pinnedReason: string | null;
};

type MethodApplication = AssumptionApplicationRecord & {
  template: AssumptionTemplateRecord | null;
  validations: AssumptionValidationRecord[];
  evidence: AssumptionEvidenceRecord[];
  actions: AssumptionActionRecord[];
};

const COST_BAND_ORDER: Record<string, number> = {
  low: 0,
  mid: 1,
  high: 2,
  other: 3
};

function numeric(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function googleMapsSearchUrl(address: string, locality?: string | null): string {
  const query = [address, locality].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsEmbedUrl(address: string, locality?: string | null): string {
  const query = [address, locality].filter(Boolean).join(", ");
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

export function calculateCostRangeTotal(range: ScenarioCostRangeRecord): number {
  return (
    numeric(range.construction_cost) +
    numeric(range.professional_fees) +
    numeric(range.contingency) +
    numeric(range.statutory_fees) +
    numeric(range.finance_cost) +
    numeric(range.other_costs)
  );
}

export function calculateFeasibilityMetrics(
  range: ScenarioCostRangeRecord,
  salesAssumption: SalesAssumptionRecord | null
): FeasibilityMetrics {
  const totalCost = calculateCostRangeTotal(range);
  const revenue = numeric(salesAssumption?.gross_realisation);
  const marginAmount = revenue - totalCost;
  const marginPercent = revenue > 0 ? (marginAmount / revenue) * 100 : 0;
  return { totalCost, revenue, marginAmount, marginPercent };
}

export function calculateFeasibilityMethodMetrics(input: {
  allInCost: number;
  grossRealisation: number;
  soldRevenue?: number | null;
  retainedDwellingValue?: number | null;
  retainedDebt?: number | null;
}): FeasibilityMethodMetrics {
  const allInCost = numeric(input.allInCost);
  const grossRealisation = numeric(input.grossRealisation);
  const soldRevenue = numeric(input.soldRevenue ?? grossRealisation);
  const retainedDwellingValue = numeric(input.retainedDwellingValue);
  const retainedDebt = numeric(input.retainedDebt);
  const grossProfit = grossRealisation + retainedDwellingValue - allInCost;
  const cashProfit = soldRevenue - allInCost;
  const cashSurplusAfterSales = Math.max(cashProfit, 0);
  const requiredResidualDebt = Math.max(allInCost - soldRevenue, 0);
  const netRetainedEquity = Math.max(retainedDwellingValue - retainedDebt, 0);

  return {
    allInCost,
    soldRevenue,
    grossRealisation,
    grossProfit,
    cashProfit,
    cashSurplusAfterSales,
    requiredResidualDebt,
    retainedDwellingValue,
    retainedDebt,
    netRetainedEquity,
    standardDeveloperMarginPercent: percent(cashProfit, soldRevenue),
    marginOnCostPercent: percent(grossProfit, allInCost),
    netRetainedPositionRatio: percent(cashSurplusAfterSales + netRetainedEquity, allInCost)
  };
}

export function methodVerdict(
  value: number | null,
  target: number | null,
  fallbackTarget: number
): FeasibilityMethodVerdict {
  if (value === null) return "incomplete";
  const comparisonTarget = target ?? fallbackTarget;
  if (value >= comparisonTarget) return "pass";
  if (value >= comparisonTarget * 0.75) return "near_miss";
  return "risk";
}

function daysBetween(startDate: string, finishDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const finish = Date.parse(`${finishDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) {
    return 0;
  }
  return Math.round((finish - start) / 86_400_000) + 1;
}

function scheduleSummaryForOption(state: RuntimeState, option: ScenarioOptionRecord) {
  const activities = state.linear_schedule_activities.filter(
    (activity) => option.scenario_id && String(activity.scenario_id ?? "") === option.scenario_id
  );
  const startDates = activities.map((activity) => String(activity.start_date ?? "")).filter(Boolean);
  const finishDates = activities.map((activity) => String(activity.finish_date ?? "")).filter(Boolean);
  const startDate = startDates.length > 0 ? startDates.sort()[0] : null;
  const finishDate = finishDates.length > 0 ? finishDates.sort().at(-1)! : null;
  const packageIds = new Set(activities.map((activity) => String(activity.package_id ?? "")).filter(Boolean));
  const workfronts = new Set(activities.map((activity) => String(activity.workfront ?? "")).filter(Boolean));

  return {
    activityCount: activities.length,
    startDate,
    finishDate,
    durationDays: startDate && finishDate ? daysBetween(startDate, finishDate) : null,
    packageCount: packageIds.size,
    workfrontCount: workfronts.size
  };
}

function assemblyIdsFromSnapshot(state: RuntimeState): string[] {
  const ids = new Set<string>();
  for (const object of state.model_objects) {
    const snapshot = object.archicad_snapshot_json;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      continue;
    }
    const assembly = (snapshot as Record<string, unknown>).buildsync_assembly;
    if (!assembly || typeof assembly !== "object" || Array.isArray(assembly)) {
      continue;
    }
    const taskId =
      (assembly as Record<string, unknown>).assembly_task_id ?? (assembly as Record<string, unknown>).task_id;
    if (typeof taskId === "string" && taskId.length > 0) {
      ids.add(taskId);
    }
  }
  return [...ids].sort();
}

function costBandsForOption(
  ranges: ScenarioCostRangeRecord[],
  salesAssumption: SalesAssumptionRecord | null
): FeasibilityCostBand[] {
  return ranges
    .map((range) => {
      const metrics = calculateFeasibilityMetrics(range, salesAssumption);
      return {
        ...range,
        totalCost: metrics.totalCost,
        marginAmount: metrics.marginAmount,
        marginPercent: metrics.marginPercent
      };
    })
    .sort((left, right) => {
      const bandCompare = (COST_BAND_ORDER[left.range_key] ?? 99) - (COST_BAND_ORDER[right.range_key] ?? 99);
      return bandCompare === 0 ? left.label.localeCompare(right.label) : bandCompare;
    });
}

function isScenarioTemplate(scenario: RuntimeState["scenarios"][number]): boolean {
  return scenario.scenario_kind === "template" || scenario.status === "template";
}

function valueFromApplication(applications: MethodApplication[], formulaKey: string): number {
  const application = applications.find((item) => item.template?.formula_key === formulaKey);
  const value = application?.local_value ?? application?.template?.default_value;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function methodApplicationsForRun(
  state: RuntimeState,
  option: ScenarioOptionFeasibility,
  branch: FeasibilityBranchRecord | null
): MethodApplication[] {
  const templatesById = new Map(state.assumption_templates.map((template) => [template.id, template]));
  const validationsByApplication = new Map<string, AssumptionValidationRecord[]>();
  const evidenceByApplication = new Map<string, AssumptionEvidenceRecord[]>();
  const actionsByApplication = new Map<string, AssumptionActionRecord[]>();

  for (const validation of state.assumption_validations) {
    validationsByApplication.set(validation.assumption_application_id, [
      ...(validationsByApplication.get(validation.assumption_application_id) ?? []),
      validation
    ]);
  }
  for (const evidence of state.assumption_evidence) {
    evidenceByApplication.set(evidence.assumption_application_id, [
      ...(evidenceByApplication.get(evidence.assumption_application_id) ?? []),
      evidence
    ]);
  }
  for (const action of state.assumption_actions) {
    actionsByApplication.set(action.assumption_application_id, [
      ...(actionsByApplication.get(action.assumption_application_id) ?? []),
      action
    ]);
  }

  return state.assumption_applications
    .filter(
      (application) =>
        application.feasibility_branch_id === branch?.id ||
        (application.applied_ref_type === "scenario_option" && application.applied_ref_id === option.id) ||
        (application.applied_ref_type === "site" && application.applied_ref_id === option.site_id)
    )
    .map((application) => ({
      ...application,
      template: templatesById.get(application.assumption_template_id) ?? null,
      validations: validationsByApplication.get(application.id) ?? [],
      evidence: evidenceByApplication.get(application.id) ?? [],
      actions: actionsByApplication.get(application.id) ?? []
    }));
}

function knowledgeItemsForRun(
  site: SiteFeasibility,
  option: ScenarioOptionFeasibility,
  applications: MethodApplication[]
): FeasibilityKnowledgeItem[] {
  return [
    ...site.resources.slice(0, 4).map((resource): FeasibilityKnowledgeItem => ({
      id: resource.id,
      kind: "source",
      title: resource.title,
      sourceRef: `site_resources.${resource.id}`,
      confidence: null,
      status: resource.status
    })),
    ...option.costPlanItems.slice(0, 4).map((item): FeasibilityKnowledgeItem => ({
      id: item.id,
      kind: "fact",
      title: item.title,
      sourceRef: `scenario_cost_plan_items.${item.id}`,
      confidence: item.confidence ?? null,
      status: item.inclusion_status ?? null
    })),
    ...applications.flatMap((application): FeasibilityKnowledgeItem[] => [
      {
        id: application.id,
        kind: "assumption",
        title: application.template?.name ?? application.assumption_template_id,
        sourceRef: `assumption_applications.${application.id}`,
        confidence: application.confidence ?? null,
        status: application.status
      },
      ...application.evidence.map((evidence) => ({
        id: evidence.id,
        kind: "source" as const,
        title: evidence.title,
        sourceRef: `assumption_evidence.${evidence.id}`,
        confidence: application.confidence ?? null,
        status: evidence.status
      }))
    ])
  ].slice(0, 16);
}

function challengesForRun(applications: MethodApplication[]): FeasibilityMethodChallenge[] {
  return applications
    .filter(
      (application) =>
        application.validations.some((validation) => validation.relationship_type === "challenges") ||
        application.template?.assumption_kind?.toLowerCase().includes("risk") ||
        application.template?.category?.toLowerCase().includes("risk")
    )
    .map((application) => ({
      id: application.id,
      title: application.template?.name ?? application.assumption_template_id,
      area: String(application.template?.impact_area ?? application.template?.category ?? "risk"),
      confidence: application.confidence ?? null,
      status: application.status,
      notes: application.notes ?? application.template?.evidence_requirement ?? null,
      validationCount: application.validations.length
    }));
}

function leversForRun(applications: MethodApplication[]): FeasibilityMethodLever[] {
  return applications
    .filter(
      (application) =>
        application.template?.category?.toLowerCase().includes("lever") ||
        application.template?.assumption_kind?.toLowerCase().includes("lever") ||
        application.calculation_impact_json?.direction === "increase" ||
        application.calculation_impact_json?.direction === "decrease"
    )
    .map((application) => ({
      id: application.id,
      title: application.template?.name ?? application.assumption_template_id,
      area: String(application.template?.impact_area ?? application.template?.category ?? "lever"),
      value: application.local_value ?? application.template?.default_value ?? null,
      confidence: application.confidence ?? null,
      status: application.status,
      notes: application.notes ?? application.template?.evidence_requirement ?? null,
      actionCount: application.actions.length
    }));
}

export function buildFeasibilityPortfolio(state: RuntimeState): FeasibilityPortfolio {
  const scenariosById = new Map(state.scenarios.map((scenario) => [String(scenario.id), scenario]));
  const masterTemplatesById = new Map(state.master_cost_templates.map((template) => [template.id, template]));
  const snapshotAssemblyIds = assemblyIdsFromSnapshot(state);
  const derivedMasterCostItems =
    state.master_cost_items.length > 0
      ? state.master_cost_items
      : state.master_cost_template_items.map((item) => ({
          id: `derived-${item.id}`,
          project_id: item.project_id,
          cost_code: item.cost_code,
          title: item.title,
          trade_code: item.trade_code ?? null,
          package_id: item.package_id ?? null,
          estimate_granularity: item.estimate_granularity,
          costing_method: item.costing_method,
          unit: item.unit,
          base_rate: item.base_rate,
          source_label: "Derived from existing template item",
          source_notes: "Read-model fallback until the master cost database is populated.",
          notes: item.notes ?? null,
          status: "active"
        }));
  const masterCostItemsById = new Map(derivedMasterCostItems.map((item) => [item.id, item]));
  const masterCostItems = derivedMasterCostItems
    .map((item) => ({
      ...item,
      sources: state.master_cost_item_sources.filter((source) => source.master_cost_item_id === item.id),
      targetLinks: state.master_cost_item_target_links.filter((link) => link.master_cost_item_id === item.id)
    }))
    .sort((left, right) => left.cost_code.localeCompare(right.cost_code) || left.title.localeCompare(right.title));
  const masterCostTemplates = state.master_cost_templates
    .map((template) => ({
      ...template,
      items: state.master_cost_template_items
        .filter((item) => item.master_cost_template_id === template.id)
        .map((item) => ({
          ...item,
          links: state.master_cost_item_links.filter((link) => link.master_cost_template_item_id === item.id),
          sourceItem: item.master_cost_item_id
            ? masterCostItemsById.get(item.master_cost_item_id) ?? null
            : masterCostItemsById.get(`derived-${item.id}`) ?? null
        }))
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0) || left.cost_code.localeCompare(right.cost_code))
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const sites = [...state.sites]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((site): SiteFeasibility => {
      const constraints = state.site_constraints
        .filter((constraint) => constraint.site_id === site.id)
        .sort((left, right) => left.category.localeCompare(right.category) || left.title.localeCompare(right.title));
      const archicadLinks = state.archicad_links.filter((link) => link.site_id === site.id);
      const resources = state.site_resources
        .filter((resource) => resource.site_id === site.id)
        .sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) || left.title.localeCompare(right.title));
      const planningHighlights = state.site_planning_highlights
        .filter((highlight) => highlight.site_id === site.id)
        .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")));
      const activePlanningHighlight = planningHighlights.find((highlight) => highlight.status !== "archived") ?? null;
      const manualMapUrl = resources.find((resource) => resource.status !== "archived" && resource.resource_type === "map" && resource.url)?.url ?? null;
      const scenarioOptions = state.scenario_options
        .filter((option) => option.site_id === site.id)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((option): ScenarioOptionFeasibility => {
          const salesAssumption =
            state.sales_assumptions.find((assumption) => assumption.scenario_option_id === option.id) ?? null;
          const archicadLink =
            archicadLinks.find((link) => link.scenario_option_id === option.id) ??
            archicadLinks.find((link) => !link.scenario_option_id) ??
            null;
          const configuredAssemblies = archicadLink?.assembly_task_ids ?? [];
          const linkedScenario = option.scenario_id ? scenariosById.get(option.scenario_id) ?? null : null;
          const templateScenario =
            option.scenario_template_id
              ? scenariosById.get(option.scenario_template_id) ?? null
              : linkedScenario?.template_scenario_id
                ? scenariosById.get(linkedScenario.template_scenario_id) ?? null
                : null;
          return {
            ...option,
            linkedScenarioName: linkedScenario ? String(linkedScenario.name) : null,
            linkedScenarioKind: String(linkedScenario?.scenario_kind ?? (linkedScenario?.status === "template" ? "template" : "legacy")),
            templateScenarioName: templateScenario ? String(templateScenario.name) : null,
            masterCostTemplate: option.master_cost_template_id ? masterTemplatesById.get(option.master_cost_template_id) ?? null : null,
            costPlanItems: state.scenario_cost_plan_items
              .filter((item) => item.scenario_option_id === option.id)
              .sort((left, right) => left.cost_code.localeCompare(right.cost_code)),
            costBands: costBandsForOption(
              state.scenario_cost_ranges.filter((range) => range.scenario_option_id === option.id),
              salesAssumption
            ),
            salesAssumption,
            archicadLink,
            scheduleSummary: scheduleSummaryForOption(state, option),
            assemblyTaskIds: [...new Set([...configuredAssemblies, ...snapshotAssemblyIds])].sort()
          };
        });

      return {
        id: site.id,
        siteCode: site.site_code ?? site.id,
        siteDate: site.site_date ?? null,
        name: site.name,
        address: site.address,
        locality: site.locality ?? null,
        status: site.status,
        currentStage: site.current_stage ?? null,
        acquisitionStatus: site.acquisition_status ?? null,
        priority: site.priority ?? null,
        siteAreaSqm: site.site_area_sqm ?? null,
        summary: site.summary ?? null,
        constraints,
        resources,
        planningHighlights,
        activePlanningHighlight,
        googleMapsUrl: manualMapUrl ?? googleMapsSearchUrl(site.address, site.locality),
        googleMapsEmbedUrl: googleMapsEmbedUrl(site.address, site.locality),
        manualMapUrl,
        scenarioOptions,
        archicadLinks
      };
    });

  return {
    projectName: state.project.name,
    masterCodeCatalogs: [...state.master_code_catalogs].sort((left, right) => left.name.localeCompare(right.name)),
    masterCodeItems: [...state.master_code_items].sort(
      (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0) || left.code.localeCompare(right.code)
    ),
    sites,
    scenarioTemplates: state.scenarios.filter(isScenarioTemplate).sort((left, right) => left.name.localeCompare(right.name)),
    masterCostTemplates,
    masterCostItems,
    totals: {
      siteCount: sites.length,
      scenarioOptionCount: sites.reduce((total, site) => total + site.scenarioOptions.length, 0),
      constrainedSiteCount: sites.filter((site) => site.constraints.length > 0).length,
      archicadLinkedOptionCount: sites.reduce(
        (total, site) => total + site.scenarioOptions.filter((option) => option.archicadLink).length,
        0
      )
    }
  };
}

export function buildFeasibilityMethodRuns(state: RuntimeState): FeasibilityMethodRun[] {
  const portfolio = buildFeasibilityPortfolio(state);
  const siteTemplates = [...state.site_templates].sort((left, right) => left.name.localeCompare(right.name));
  const scenarioTemplatesById = new Map(state.scenario_templates.map((template) => [template.id, template]));
  const feasibilityTemplatesById = new Map(state.feasibility_templates.map((template) => [template.id, template]));
  const scenarioRecordsById = new Map(state.scenarios.map((scenario) => [String(scenario.id), scenario]));
  const costTemplatesById = new Map(portfolio.masterCostTemplates.map((template) => [template.id, template]));

  return portfolio.sites.flatMap((site) =>
    site.scenarioOptions.map((option): FeasibilityMethodRun => {
      const branch =
        state.feasibility_branches.find((item) => item.scenario_option_id === option.id) ??
        state.feasibility_branches.find((item) => item.site_id === site.id && item.scenario_id === option.scenario_id) ??
        null;
      const costBand = option.costBands.find((band) => band.range_key === "mid") ?? option.costBands[0] ?? null;
      const applications = methodApplicationsForRun(state, option, branch);
      const linkedScenario = option.scenario_id ? scenarioRecordsById.get(option.scenario_id) ?? null : null;
      const scenarioTemplate =
        option.scenario_template_id
          ? scenarioTemplatesById.get(option.scenario_template_id) ?? null
          : linkedScenario?.template_scenario_id
            ? scenarioTemplatesById.get(linkedScenario.template_scenario_id) ?? null
            : null;
      const feasibilityTemplate = branch?.feasibility_template_id
        ? feasibilityTemplatesById.get(branch.feasibility_template_id) ?? null
        : null;
      const retainedDwellingValue =
        valueFromApplication(applications, "retained_townhouse_value") ||
        valueFromApplication(applications, "retained_townhouse_refinance_saving") ||
        (String(option.configuration).toLowerCase().includes("retain") || String(branch?.name ?? "").toLowerCase().includes("retain")
          ? option.salesAssumption?.average_sale_price ?? (option.dwellings ? Math.round((option.salesAssumption?.gross_realisation ?? 0) / option.dwellings) : 0)
          : 0);
      const retainedDebt = valueFromApplication(applications, "retained_townhouse_debt");
      const soldRevenue = option.salesAssumption?.gross_realisation ?? 0;
      const metrics = calculateFeasibilityMethodMetrics({
        allInCost: costBand?.totalCost ?? 0,
        grossRealisation: option.salesAssumption?.gross_realisation ?? 0,
        soldRevenue,
        retainedDwellingValue,
        retainedDebt
      });
      const targets = {
        standardDeveloperMarginPercent:
          branch?.target_margin_percent ?? option.target_margin_percent ?? feasibilityTemplate?.target_margin_percent ?? null,
        netRetainedPositionRatio:
          branch?.target_net_position_ratio ?? feasibilityTemplate?.target_net_position_ratio ?? null
      };
      const standardVerdict = methodVerdict(metrics.standardDeveloperMarginPercent, targets.standardDeveloperMarginPercent, 18);
      const retainedVerdict = retainedDwellingValue > 0
        ? methodVerdict(metrics.netRetainedPositionRatio, targets.netRetainedPositionRatio, 40)
        : "incomplete";

      return {
        id: branch?.id ?? option.id,
        projectName: portfolio.projectName,
        site,
        option,
        branch,
        costBand,
        targets,
        metrics,
        verdict: standardVerdict === "risk" || retainedVerdict === "risk"
          ? "risk"
          : standardVerdict === "near_miss" || retainedVerdict === "near_miss"
            ? "near_miss"
            : standardVerdict === "incomplete" && retainedVerdict === "incomplete"
              ? "incomplete"
              : "pass",
        templateStack: {
          siteTemplate: siteTemplates[0] ?? null,
          scenarioTemplate,
          costTemplate: option.master_cost_template_id ? costTemplatesById.get(option.master_cost_template_id) ?? null : null,
          feasibilityTemplate
        },
        methodStages: [...FEASIBILITY_METHOD_STAGES],
        knowledgeItems: knowledgeItemsForRun(site, option, applications),
        challenges: challengesForRun(applications),
        levers: leversForRun(applications)
      };
    })
  );
}

export function pinnedScenarioOptionsFromPortfolio(portfolio: FeasibilityPortfolio): PinnedScenarioOption[] {
  const options = portfolio.sites.flatMap((site) =>
    site.scenarioOptions.map((option) => ({
      site: {
        id: site.id,
        name: site.name,
        locality: site.locality,
        status: site.status,
        priority: site.priority
      },
      option,
      pinnedAt: option.pinned_at ?? null,
      pinnedReason: option.pinned_reason ?? null
    }))
  );
  const explicitlyPinned = options.filter((item) => item.pinnedAt);
  const source = explicitlyPinned.length > 0 ? explicitlyPinned : options.filter((item) => item.option.status === "preferred");

  return source
    .sort((left, right) => {
      if (left.pinnedAt || right.pinnedAt) {
        return String(right.pinnedAt ?? "").localeCompare(String(left.pinnedAt ?? ""));
      }
      const leftMid = left.option.costBands.find((band) => band.range_key === "mid");
      const rightMid = right.option.costBands.find((band) => band.range_key === "mid");
      return (rightMid?.marginPercent ?? -Infinity) - (leftMid?.marginPercent ?? -Infinity);
    })
    .slice(0, 4);
}
