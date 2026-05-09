import type {
  ArchicadLinkRecord,
  MasterCodeCatalogRecord,
  MasterCodeItemRecord,
  MasterCostItemRecord,
  MasterCostTemplateItemRecord,
  MasterCostTemplateRecord,
  RuntimeState,
  SalesAssumptionRecord,
  ScenarioCostPlanItemRecord,
  ScenarioCostRangeRecord,
  ScenarioOptionRecord,
  SiteConstraintRecord
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

const COST_BAND_ORDER: Record<string, number> = {
  low: 0,
  mid: 1,
  high: 2,
  other: 3
};

function numeric(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
