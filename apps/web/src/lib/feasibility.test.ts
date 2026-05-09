import test from "node:test";
import assert from "node:assert/strict";

import { buildFeasibilityPortfolio, calculateCostRangeTotal } from "./feasibility";
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
