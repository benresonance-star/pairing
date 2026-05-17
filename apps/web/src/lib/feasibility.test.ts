import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFeasibilityMethodRuns,
  buildFeasibilityPortfolio,
  calculateCostRangeTotal,
  calculateFeasibilityMethodMetrics
} from "./feasibility";
import {
  archiveDevelopmentSite,
  createDevelopmentSite,
  normalizeRuntimeState,
  updateDevelopmentSite
} from "./runtime-state";

test("calculateCostRangeTotal combines construction and feasibility allowances", () => {
  assert.equal(
    calculateCostRangeTotal({
      id: "range-1",
      scenario_option_id: "option-1",
      range_key: "mid",
      label: "Mid",
      construction_cost: 1_000_000,
      professional_fees: 80_000,
      contingency: 50_000,
      statutory_fees: 25_000,
      finance_cost: 40_000,
      other_costs: 5_000
    }),
    1_200_000
  );
});

test("calculateFeasibilityMethodMetrics separates developer margin and retained position", () => {
  const metrics = calculateFeasibilityMethodMetrics({
    allInCost: 6_500_000,
    grossRealisation: 8_400_000,
    soldRevenue: 6_300_000,
    retainedDwellingValue: 2_100_000,
    retainedDebt: 600_000
  });

  assert.equal(metrics.cashProfit, -200_000);
  assert.equal(metrics.requiredResidualDebt, 200_000);
  assert.equal(metrics.netRetainedEquity, 1_500_000);
  assert.equal(Math.round(metrics.standardDeveloperMarginPercent ?? 0), -3);
  assert.equal(Math.round(metrics.marginOnCostPercent ?? 0), 62);
  assert.equal(Math.round(metrics.netRetainedPositionRatio ?? 0), 23);
});

test("buildFeasibilityPortfolio links sites, scenario options, cost bands, sales, Archicad, and schedule", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Demo Portfolio",
      archicad_project_id: "ARCHICAD-DEMO"
    },
    sites: [
      {
        id: "site-1",
        project_id: "project-1",
        name: "Main Street",
        address: "1 Main Street",
        status: "shortlisted"
      }
    ],
    site_constraints: [
      {
        id: "constraint-1",
        site_id: "site-1",
        category: "planning",
        title: "Height control",
        description: "Two storey preferred.",
        severity: "medium"
      }
    ],
    scenario_options: [
      {
        id: "option-1",
        site_id: "site-1",
        scenario_id: "scenario-1",
        scenario_template_id: "template-1",
        master_cost_template_id: "cost-template-1",
        name: "3 Townhouse",
        configuration: "3 townhouse",
        status: "testing"
      }
    ],
    scenario_cost_ranges: [
      {
        id: "range-1",
        scenario_option_id: "option-1",
        range_key: "mid",
        label: "Mid",
        construction_cost: 1_000_000,
        professional_fees: 50_000,
        contingency: 50_000
      }
    ],
    sales_assumptions: [
      {
        id: "sales-1",
        scenario_option_id: "option-1",
        gross_realisation: 1_500_000
      }
    ],
    archicad_links: [
      {
        id: "link-1",
        site_id: "site-1",
        scenario_option_id: "option-1",
        archicad_project_id: "ARCHICAD-DEMO",
        file_label: "Main Street.pln",
        linked_guid_count: 4,
        assembly_task_ids: ["task-frame"]
      }
    ],
    master_cost_templates: [
      {
        id: "cost-template-1",
        project_id: "project-1",
        name: "Townhouse Standard",
        status: "active"
      }
    ],
    master_cost_template_items: [
      {
        id: "template-item-1",
        project_id: "project-1",
        master_cost_template_id: "cost-template-1",
        cost_code: "TH-ALLOW-GFA",
        title: "Townhouse building allowance",
        estimate_granularity: "allowance",
        costing_method: "rate_per_sqm",
        unit: "sqm",
        base_rate: 2400,
        default_quantity: 450,
        quantity_basis: "gross_floor_area_sqm"
      },
      {
        id: "template-item-2",
        project_id: "project-1",
        master_cost_template_id: "cost-template-1",
        parent_item_id: "template-item-1",
        cost_code: "TH-MAT-SCREWS",
        title: "Screws and fixings",
        estimate_granularity: "material",
        costing_method: "rate_per_item",
        unit: "each",
        base_rate: 0.4,
        default_quantity: 1000,
        quantity_basis: "manual_count"
      }
    ],
    master_cost_item_links: [
      {
        id: "cost-link-1",
        project_id: "project-1",
        master_cost_template_item_id: "template-item-1",
        target_type: "archicad_zone",
        target_ref: "ZONE-1"
      }
    ],
    scenario_cost_plan_items: [
      {
        id: "plan-item-1",
        project_id: "project-1",
        scenario_option_id: "option-1",
        master_cost_template_item_id: "template-item-1",
        cost_code: "TH-ALLOW-GFA",
        title: "Townhouse building allowance",
        estimate_granularity: "allowance",
        costing_method: "rate_per_sqm",
        unit: "sqm",
        quantity: 460,
        rate: 2400,
        linked_target_type: "archicad_zone",
        linked_target_ref: "ZONE-1"
      }
    ],
    work_packages: [],
    scenarios: [
      { id: "baseline-1", name: "Baseline", status: "baseline", scenario_kind: "legacy" },
      { id: "template-1", name: "Template - 3 Townhouse", status: "template", scenario_kind: "template" },
      {
        id: "scenario-1",
        name: "Main Street - 3 Townhouse",
        status: "active",
        scenario_kind: "site_active",
        template_scenario_id: "template-1"
      }
    ],
    zones: [],
    model_objects: [
      {
        id: "object-1",
        archicad_snapshot_json: {
          buildsync_assembly: {
            assembly_task_id: "task-facade"
          }
        }
      }
    ],
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
    linear_schedule_activities: [
      {
        id: "activity-1",
        scenario_id: "scenario-1",
        package_id: "PKG-SITEWORKS",
        workfront: "Civil Crew",
        start_date: "2026-01-01",
        finish_date: "2026-01-10"
      }
    ],
    linear_progress_points: []
  });

  const portfolio = buildFeasibilityPortfolio(state);
  const option = portfolio.sites[0].scenarioOptions[0];

  assert.equal(portfolio.totals.siteCount, 1);
  assert.equal(portfolio.totals.archicadLinkedOptionCount, 1);
  assert.equal(portfolio.scenarioTemplates[0].id, "template-1");
  assert.equal(portfolio.masterCostTemplates[0].items.length, 2);
  assert.equal(portfolio.masterCostTemplates[0].items[0].links[0].target_ref, "ZONE-1");
  assert.equal(option.linkedScenarioName, "Main Street - 3 Townhouse");
  assert.equal(option.templateScenarioName, "Template - 3 Townhouse");
  assert.equal(option.masterCostTemplate?.name, "Townhouse Standard");
  assert.equal(option.costPlanItems[0].linked_target_ref, "ZONE-1");
  assert.equal(option.costBands[0].totalCost, 1_100_000);
  assert.equal(Math.round(option.costBands[0].marginPercent), 27);
  assert.equal(option.scheduleSummary.durationDays, 10);
  assert.deepEqual(option.assemblyTaskIds, ["task-facade", "task-frame"]);
});

test("buildFeasibilityMethodRuns creates Hampton-style editable target fixture with challenges and levers", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Hampton East Fixture",
      archicad_project_id: "ARCHICAD-HAMPTON"
    },
    sites: [
      {
        id: "site-hampton",
        project_id: "project-1",
        name: "Hampton East",
        address: "24 View Street, Hampton East VIC 3188",
        locality: "Hampton East",
        status: "screening",
        site_area_sqm: 820
      }
    ],
    site_constraints: [
      {
        id: "constraint-tree",
        site_id: "site-hampton",
        category: "planning",
        title: "Tree protection check",
        description: "Confirm whether tree protection reduces developable area.",
        severity: "medium"
      }
    ],
    scenario_templates: [
      {
        id: "scenario-template-4th-retain-one",
        project_id: "project-1",
        name: "4 TH retain one",
        development_type: "townhouse",
        dwellings: 4,
        sell_count: 3,
        retain_count: 1,
        gross_floor_area_sqm: 820,
        status: "active"
      }
    ],
    feasibility_templates: [
      {
        id: "feasibility-template-retain-one",
        project_id: "project-1",
        name: "Retain one feasibility",
        calculation_mode: "retain_one",
        target_margin_percent: 30,
        target_net_position_ratio: 40,
        status: "active"
      }
    ],
    scenario_options: [
      {
        id: "option-hampton-4th",
        site_id: "site-hampton",
        scenario_template_id: "scenario-template-4th-retain-one",
        master_cost_template_id: "cost-template-townhouse",
        name: "4 Townhouse Premium",
        configuration: "4 townhouses, retain 1 / sell 3",
        dwellings: 4,
        gross_floor_area_sqm: 820,
        planning_fit: "moderate",
        status: "testing",
        target_margin_percent: 30
      }
    ],
    feasibility_branches: [
      {
        id: "branch-hampton-base",
        project_id: "project-1",
        site_id: "site-hampton",
        scenario_option_id: "option-hampton-4th",
        feasibility_template_id: "feasibility-template-retain-one",
        name: "Hampton 4TH base retain-one",
        status: "testing",
        target_margin_percent: 30,
        target_net_position_ratio: 40
      }
    ],
    scenario_cost_ranges: [
      {
        id: "range-hampton-mid",
        scenario_option_id: "option-hampton-4th",
        range_key: "mid",
        label: "Mid",
        construction_cost: 3_440_000,
        professional_fees: 280_000,
        contingency: 250_000,
        statutory_fees: 120_000,
        finance_cost: 350_000,
        other_costs: 2_060_000
      }
    ],
    sales_assumptions: [
      {
        id: "sales-hampton",
        scenario_option_id: "option-hampton-4th",
        gross_realisation: 6_350_000,
        average_sale_price: 2_100_000,
        settlement_months: 5
      }
    ],
    master_cost_templates: [
      {
        id: "cost-template-townhouse",
        project_id: "project-1",
        name: "Townhouse Standard",
        status: "active"
      }
    ],
    assumption_templates: [
      {
        id: "assumption-sale-risk",
        project_id: "project-1",
        name: "Sale price optimism",
        category: "Risk Challenge",
        assumption_kind: "market_risk",
        impact_area: "revenue",
        value_type: "fixed",
        default_value: 2_100_000,
        formula_key: "sale_price_per_dwelling",
        status: "active"
      },
      {
        id: "assumption-size-lever",
        project_id: "project-1",
        name: "Reduce average unit size",
        category: "Feasibility Lever Library",
        assumption_kind: "design_lever",
        impact_area: "cost",
        value_type: "fixed",
        default_value: 250_000,
        formula_key: "reduce_average_unit_size",
        status: "active"
      }
    ],
    assumption_applications: [
      {
        id: "app-sale-risk",
        project_id: "project-1",
        assumption_template_id: "assumption-sale-risk",
        applied_ref_type: "scenario_option",
        applied_ref_id: "option-hampton-4th",
        feasibility_branch_id: "branch-hampton-base",
        local_value: 2_100_000,
        confidence: "medium",
        status: "pending_validation"
      },
      {
        id: "app-size-lever",
        project_id: "project-1",
        assumption_template_id: "assumption-size-lever",
        applied_ref_type: "scenario_option",
        applied_ref_id: "option-hampton-4th",
        feasibility_branch_id: "branch-hampton-base",
        local_value: 250_000,
        confidence: "medium",
        status: "testing",
        calculation_impact_json: { direction: "decrease", metric: "all_in_cost" }
      }
    ],
    assumption_validations: [
      {
        id: "validation-challenge",
        project_id: "project-1",
        assumption_application_id: "app-sale-risk",
        profile_id: "profile-sales",
        relationship_type: "challenges",
        status: "open"
      }
    ],
    assumption_evidence: [],
    assumption_actions: [],
    master_cost_template_items: [],
    master_cost_item_links: [],
    scenario_cost_plan_items: [],
    archicad_links: [],
    work_packages: [],
    scenarios: [{ id: "baseline-1", name: "Baseline", status: "baseline", scenario_kind: "legacy" }],
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

  const run = buildFeasibilityMethodRuns(state)[0];

  assert.equal(run.site.locality, "Hampton East");
  assert.equal(run.targets.standardDeveloperMarginPercent, 30);
  assert.equal(run.targets.netRetainedPositionRatio, 40);
  assert.equal(run.metrics.allInCost, 6_500_000);
  assert.equal(run.metrics.soldRevenue, 6_350_000);
  assert.equal(run.challenges[0].title, "Sale price optimism");
  assert.equal(run.levers[0].title, "Reduce average unit size");
  assert.equal(run.templateStack.feasibilityTemplate?.id, "feasibility-template-retain-one");
});

test("site create, update, and archive preserves linked feasibility records", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Demo Portfolio",
      archicad_project_id: "ARCHICAD-DEMO"
    },
    sites: [],
    site_constraints: [],
    scenario_options: [],
    scenario_cost_ranges: [],
    sales_assumptions: [],
    archicad_links: [],
    master_cost_templates: [],
    master_cost_template_items: [],
    master_cost_item_links: [],
    scenario_cost_plan_items: [],
    work_packages: [],
    scenarios: [{ id: "baseline-1", name: "Baseline", status: "baseline", scenario_kind: "legacy" }],
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

  createDevelopmentSite(state, {
    id: "site-1",
    name: "Main Street",
    address: "1 Main Street",
    status: "screening",
    siteAreaSqm: 700
  });
  updateDevelopmentSite(state, "site-1", {
    name: "Main Street Assemblage",
    currentStage: "concept feasibility"
  });

  state.scenario_options.push({
    id: "option-1",
    site_id: "site-1",
    scenario_id: null,
    name: "Duplex",
    configuration: "duplex",
    status: "testing"
  });
  state.scenario_cost_plan_items.push({
    id: "plan-1",
    project_id: "project-1",
    scenario_option_id: "option-1",
    cost_code: "DX-ALLOW-GFA",
    title: "Duplex allowance",
    estimate_granularity: "allowance",
    costing_method: "rate_per_sqm",
    unit: "sqm",
    quantity: 300,
    rate: 2200
  });
  state.sales_assumptions.push({
    id: "sales-1",
    scenario_option_id: "option-1",
    gross_realisation: 2_000_000
  });
  state.archicad_links.push({
    id: "link-1",
    site_id: "site-1",
    scenario_option_id: "option-1",
    archicad_project_id: "ARCHICAD-DEMO",
    file_label: "Main Street.pln"
  });

  archiveDevelopmentSite(state, "site-1");

  assert.equal(state.sites[0].name, "Main Street Assemblage");
  assert.equal(state.sites[0].status, "archived");
  assert.equal(state.scenario_options.length, 1);
  assert.equal(state.scenario_cost_plan_items.length, 1);
  assert.equal(state.sales_assumptions.length, 1);
  assert.equal(state.archicad_links.length, 1);
});

test("base cost template, item, and link CRUD preserves instantiated scenario cost plan items", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Demo Portfolio",
      archicad_project_id: "ARCHICAD-DEMO"
    },
    master_cost_templates: [],
    master_cost_template_items: [],
    master_cost_item_links: [],
    scenario_cost_plan_items: [
      {
        id: "plan-item-1",
        project_id: "project-1",
        scenario_option_id: "option-1",
        master_cost_template_item_id: "item-1",
        cost_code: "OLD-CODE",
        title: "Already instantiated allowance",
        estimate_granularity: "allowance",
        costing_method: "rate_per_sqm",
        unit: "sqm",
        quantity: 100,
        rate: 2000
      }
    ],
    sites: [],
    site_constraints: [],
    scenario_options: [],
    scenario_cost_ranges: [],
    sales_assumptions: [],
    archicad_links: [],
    work_packages: [],
    scenarios: [{ id: "baseline-1", name: "Baseline", status: "baseline", scenario_kind: "legacy" }],
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

  state.master_cost_templates.push({
    id: "template-1",
    project_id: "project-1",
    name: "Draft Cost Library",
    description: "Draft",
    status: "draft",
    template_type: "residential"
  });
  state.master_cost_templates[0].name = "Townhouse Cost Library";
  state.master_cost_templates[0].status = "archived";

  state.master_cost_template_items.push({
    id: "item-1",
    project_id: "project-1",
    master_cost_template_id: "template-1",
    cost_code: "TH-ALLOW",
    title: "Townhouse allowance",
    estimate_granularity: "allowance",
    costing_method: "rate_per_sqm",
    unit: "sqm",
    base_rate: 2400,
    default_quantity: 400,
    quantity_basis: "gross_floor_area_sqm"
  });
  state.master_cost_template_items[0].title = "Townhouse shell allowance";
  state.master_cost_template_items[0].base_rate = 2550;

  state.master_cost_item_links.push({
    id: "link-1",
    project_id: "project-1",
    master_cost_template_item_id: "item-1",
    target_type: "archicad_zone",
    target_ref: "ZONE-1",
    link_basis: "quantity"
  });
  state.master_cost_item_links[0].target_ref = "ZONE-2";
  state.master_cost_item_links = state.master_cost_item_links.filter((link) => link.id !== "link-1");
  state.master_cost_template_items = state.master_cost_template_items.filter((item) => item.id !== "item-1");

  assert.equal(state.master_cost_templates[0].name, "Townhouse Cost Library");
  assert.equal(state.master_cost_templates[0].status, "archived");
  assert.equal(state.master_cost_template_items.length, 0);
  assert.equal(state.master_cost_item_links.length, 0);
  assert.equal(state.scenario_cost_plan_items.length, 1);
  assert.equal(state.scenario_cost_plan_items[0].cost_code, "OLD-CODE");
  assert.equal(state.scenario_cost_plan_items[0].rate, 2000);
});

test("global code catalog feeds master cost links without mutating project cost snapshots", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Demo Portfolio",
      archicad_project_id: "ARCHICAD-DEMO"
    },
    master_code_catalogs: [
      {
        id: "catalog-1",
        name: "Global Residential Codes",
        status: "active",
        version_label: "test"
      }
    ],
    master_code_items: [
      {
        id: "code-1",
        catalog_id: "catalog-1",
        code: "TH-ALLOW",
        title: "Townhouse allowance",
        code_type: "cost_item",
        trade_code: "build",
        package_id: "PKG-BUILD",
        default_unit: "sqm",
        default_estimate_granularity: "allowance",
        default_costing_method: "rate_per_sqm",
        status: "active"
      }
    ],
    master_cost_items: [
      {
        id: "master-item-1",
        project_id: "project-1",
        master_code_item_id: "code-1",
        cost_code: "TH-ALLOW",
        title: "Project-specific townhouse allowance",
        trade_code: "build",
        package_id: "PKG-BUILD",
        estimate_granularity: "allowance",
        costing_method: "rate_per_sqm",
        unit: "sqm",
        base_rate: 2400,
        status: "active"
      }
    ],
    master_cost_templates: [],
    master_cost_template_items: [],
    master_cost_item_sources: [],
    master_cost_item_target_links: [],
    master_cost_item_links: [],
    scenario_cost_plan_items: [],
    sites: [],
    site_constraints: [],
    scenario_options: [],
    scenario_cost_ranges: [],
    sales_assumptions: [],
    archicad_links: [],
    work_packages: [],
    scenarios: [{ id: "baseline-1", name: "Baseline", status: "baseline", scenario_kind: "legacy" }],
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

  const portfolio = buildFeasibilityPortfolio(state);
  assert.equal(portfolio.masterCodeItems.length, 1);
  assert.equal(portfolio.masterCostItems[0].master_code_item_id, "code-1");

  state.master_code_items[0].title = "Updated global title";
  const updatedPortfolio = buildFeasibilityPortfolio(state);
  assert.equal(updatedPortfolio.masterCodeItems[0].title, "Updated global title");
  assert.equal(updatedPortfolio.masterCostItems[0].title, "Project-specific townhouse allowance");

  const usageCount = state.master_cost_items.filter((item) => item.master_code_item_id === "code-1").length;
  assert.equal(usageCount, 1);
});
