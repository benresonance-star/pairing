import test from "node:test";
import assert from "node:assert/strict";

import { buildAssumptionGraphData, applicationsForRef } from "./assumption-graph";
import { normalizeRuntimeState } from "./runtime-state";

test("buildAssumptionGraphData links templates, applications, validations, evidence, actions, and simulation readiness", () => {
  const state = normalizeRuntimeState({
    project: { id: "project-1", name: "Demo", archicad_project_id: "AC-1" },
    sites: [{ id: "site-1", project_id: "project-1", name: "Main Street", address: "1 Main", status: "testing" }],
    site_constraints: [],
    scenario_options: [
      {
        id: "option-1",
        site_id: "site-1",
        scenario_id: "scenario-1",
        name: "4 TH retain one",
        configuration: "4 townhouse",
        status: "testing"
      }
    ],
    scenario_cost_ranges: [],
    sales_assumptions: [],
    archicad_links: [],
    site_resources: [],
    site_planning_highlights: [],
    site_templates: [
      {
        id: "site-template-1",
        project_id: "project-1",
        name: "Townhouse Site",
        status: "active"
      }
    ],
    scenario_templates: [
      {
        id: "scenario-template-1",
        project_id: "project-1",
        name: "4 TH",
        status: "active"
      }
    ],
    feasibility_templates: [
      {
        id: "feasibility-template-1",
        project_id: "project-1",
        name: "Optimised",
        calculation_mode: "optimised",
        status: "active"
      }
    ],
    feasibility_branches: [
      {
        id: "feasibility-branch-1",
        project_id: "project-1",
        site_id: "site-1",
        scenario_option_id: "option-1",
        scenario_id: "scenario-1",
        feasibility_template_id: "feasibility-template-1",
        name: "Optimised branch",
        status: "testing"
      }
    ],
    assumption_templates: [
      {
        id: "assumption-template-1",
        project_id: "project-1",
        name: "Spring timing",
        category: "Revenue Assumptions",
        assumption_kind: "timing_lever",
        impact_area: "revenue",
        value_type: "range",
        default_value: 4.1,
        min_value: 0,
        max_value: 4.1,
        enabled_for_simulation: true,
        status: "active"
      }
    ],
    assumption_applications: [
      {
        id: "assumption-application-1",
        project_id: "project-1",
        assumption_template_id: "assumption-template-1",
        applied_ref_type: "scenario_option",
        applied_ref_id: "option-1",
        feasibility_branch_id: "feasibility-branch-1",
        local_value: 2.5,
        enabled_for_simulation: true,
        confidence: "medium",
        status: "pending_validation"
      }
    ],
    assumption_validations: [
      {
        id: "validation-1",
        project_id: "project-1",
        assumption_application_id: "assumption-application-1",
        profile_id: "profile-1",
        relationship_type: "accountable_owner",
        status: "pending"
      },
      {
        id: "validation-2",
        project_id: "project-1",
        assumption_application_id: "assumption-application-1",
        profile_id: "profile-2",
        relationship_type: "validates_assumption",
        status: "validated"
      }
    ],
    assumption_evidence: [
      {
        id: "evidence-1",
        project_id: "project-1",
        assumption_application_id: "assumption-application-1",
        evidence_type: "market_comparable",
        title: "Comparable sales",
        status: "pending"
      }
    ],
    assumption_actions: [
      {
        id: "action-1",
        project_id: "project-1",
        assumption_application_id: "assumption-application-1",
        title: "Validate sales timing",
        priority: "HIGH",
        responsible_profile_id: "profile-1",
        status: "open"
      }
    ],
    simulation_templates: [
      {
        id: "simulation-template-1",
        project_id: "project-1",
        name: "Monte Carlo",
        sample_count: 1000,
        status: "planned"
      }
    ],
    simulation_runs: [],
    simulation_samples: [],
    network_organisations: [],
    network_profiles: [
      {
        id: "profile-1",
        project_id: "project-1",
        display_name: "Sales Agent",
        profile_type: "human",
        category: "Market",
        domain: "Sales",
        status: "active"
      },
      {
        id: "profile-2",
        project_id: "project-1",
        display_name: "Feasibility Lead",
        profile_type: "human",
        category: "Developer Team",
        domain: "Feasibility",
        status: "active"
      }
    ],
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
    master_cost_templates: [],
    master_cost_items: [],
    master_cost_item_sources: [],
    master_cost_item_target_links: [],
    master_cost_template_items: [],
    master_cost_item_links: [],
    scenario_cost_plan_items: [],
    work_packages: [],
    scenarios: [{ id: "scenario-1", name: "Scenario", status: "active" }],
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

  const graph = buildAssumptionGraphData(state);

  assert.equal(graph.totals.siteTemplateCount, 1);
  assert.equal(graph.totals.scenarioTemplateCount, 1);
  assert.equal(graph.totals.feasibilityTemplateCount, 1);
  assert.equal(graph.totals.assumptionTemplateCount, 1);
  assert.equal(graph.totals.applicationCount, 1);
  assert.equal(graph.totals.pendingValidationCount, 1);
  assert.equal(graph.totals.openActionCount, 1);
  assert.equal(graph.totals.simulationReadyCount, 1);
  assert.equal(graph.applications[0].template?.name, "Spring timing");
  assert.equal(graph.applications[0].validations[0].profileName, "Sales Agent");
  assert.equal(graph.applications[0].accountableOwner?.profileName, "Sales Agent");
  assert.equal(graph.applications[0].validations[1].profileName, "Feasibility Lead");
  assert.equal(graph.applications[0].actions[0].responsibleProfileName, "Sales Agent");
  assert.equal(applicationsForRef(graph, "scenario_option", "option-1").length, 1);
});
