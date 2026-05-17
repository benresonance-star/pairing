import test from "node:test";
import assert from "node:assert/strict";

import { buildFeasibilityPortfolio } from "./feasibility";
import {
  createGovernedOperationalChangeSet,
  normalizeRuntimeState,
  transitionChangeSet
} from "./runtime-state";

test("primary workflow links feasibility decisions to governed Archicad metadata sync", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Townhouse Feasibility",
      archicad_project_id: "ARCHICAD-TOWNHOUSE"
    },
    sites: [
      {
        id: "site-1",
        project_id: "project-1",
        name: "Mews Lane",
        address: "10 Mews Lane",
        status: "shortlisted",
        current_stage: "concept feasibility"
      }
    ],
    scenario_options: [
      {
        id: "option-1",
        site_id: "site-1",
        scenario_id: "scenario-1",
        master_cost_template_id: "template-1",
        name: "Four Townhouses",
        configuration: "4 townhouse",
        dwellings: 4,
        planning_fit: "moderate",
        status: "testing",
        target_margin_percent: 20
      }
    ],
    scenario_cost_ranges: [
      {
        id: "range-1",
        scenario_option_id: "option-1",
        range_key: "mid",
        label: "Mid",
        construction_cost: 1_800_000,
        professional_fees: 120_000,
        contingency: 90_000
      }
    ],
    sales_assumptions: [
      {
        id: "sales-1",
        scenario_option_id: "option-1",
        gross_realisation: 2_700_000
      }
    ],
    archicad_links: [
      {
        id: "link-1",
        site_id: "site-1",
        scenario_option_id: "option-1",
        archicad_project_id: "ARCHICAD-TOWNHOUSE",
        file_label: "Mews Lane.pln",
        linked_guid_count: 2
      }
    ],
    master_cost_templates: [
      {
        id: "template-1",
        project_id: "project-1",
        name: "Townhouse Standard",
        status: "active"
      }
    ],
    master_cost_template_items: [
      {
        id: "template-item-1",
        project_id: "project-1",
        master_cost_template_id: "template-1",
        cost_code: "TH-SHELL",
        title: "Townhouse shell allowance",
        estimate_granularity: "allowance",
        costing_method: "rate_per_sqm",
        unit: "m2",
        base_rate: 2600,
        default_quantity: 690,
        quantity_basis: "gross_floor_area_sqm"
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
        cost_code: "TH-SHELL",
        title: "Townhouse shell allowance",
        estimate_granularity: "allowance",
        costing_method: "rate_per_sqm",
        unit: "m2",
        quantity: 700,
        rate: 2600,
        linked_target_type: "archicad_zone",
        linked_target_ref: "ZONE-1"
      }
    ],
    work_packages: [{ id: "pkg-1", package_id: "PKG-STRUCTURE", active: true }],
    scenarios: [{ id: "scenario-1", name: "Mews Lane - Four Townhouses", status: "active" }],
    zones: [{ id: "zone-1", zone_key: "TH-01", archicad_guid: "ZONE-1" }],
    model_objects: [{ id: "object-1", archicad_guid: "WALL-1" }],
    operational_state: [
      {
        id: "op-1",
        scenario_id: "scenario-1",
        object_ref_type: "zone",
        object_ref_id: "zone-1",
        package_id: null,
        construction_state: "ready"
      }
    ],
    change_sets: [],
    change_set_items: [],
    site_constraints: [],
    site_resources: [],
    site_planning_highlights: [],
    network_organisations: [],
    network_profiles: [],
    network_profile_capabilities: [],
    network_knowledge_packs: [],
    network_profile_knowledge_packs: [],
    network_inquiries: [],
    network_inquiry_messages: [],
    network_work_products: [],
    network_work_product_links: [],
    network_agent_cards: [],
    network_agent_sessions: [],
    network_agent_session_participants: [],
    network_agent_messages: [],
    network_agent_tool_calls: [],
    network_agent_outputs: [],
    master_code_catalogs: [],
    master_code_items: [],
    master_cost_items: [],
    master_cost_item_sources: [],
    master_cost_item_target_links: [],
    hotlink_instances: [],
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
  const option = portfolio.sites[0].scenarioOptions[0];

  assert.equal(option.linkedScenarioName, "Mews Lane - Four Townhouses");
  assert.equal(option.masterCostTemplate?.name, "Townhouse Standard");
  assert.equal(option.archicadLink?.linked_guid_count, 2);
  assert.equal(option.costPlanItems[0].linked_target_ref, "ZONE-1");
  assert.ok(option.costBands[0].marginPercent > 20);

  const result = createGovernedOperationalChangeSet(state, {
    scenarioId: "scenario-1",
    operationalRowId: "op-1",
    patch: {
      packageId: "PKG-STRUCTURE",
      constructionState: "in_progress",
      plannedStart: "2026-06-01",
      plannedFinish: "2026-06-14"
    }
  });

  assert.equal(result.itemCount, 4);
  assert.equal(state.operational_state[0].package_id, null);

  assert.equal(transitionChangeSet(state, result.changeSetId, "submit"), "submitted");
  assert.equal(transitionChangeSet(state, result.changeSetId, "approve"), "approved");
  assert.equal(transitionChangeSet(state, result.changeSetId, "queue"), "queued_for_sync");

  const changeSet = state.change_sets.find((item) => item.id === result.changeSetId);
  const changedFields = state.change_set_items
    .filter((item) => item.change_set_id === result.changeSetId)
    .map((item) => item.field_name)
    .sort();

  assert.equal(changeSet?.status, "queued_for_sync");
  assert.deepEqual(changedFields, ["construction_state", "package_id", "planned_finish", "planned_start"]);
});
