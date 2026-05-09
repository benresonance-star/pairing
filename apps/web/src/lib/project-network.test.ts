import test from "node:test";
import assert from "node:assert/strict";

import { assertAgentCanReadContext, buildScenarioOptionContext, buildSiteContext } from "./project-context";
import { buildProjectNetworkData } from "./project-network";
import { normalizeRuntimeState } from "./runtime-state";

function emptyOperationalState() {
  return {
    sites: [],
    site_constraints: [],
    scenario_options: [],
    scenario_cost_ranges: [],
    sales_assumptions: [],
    archicad_links: [],
    site_resources: [],
    site_planning_highlights: [],
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
  };
}

test("buildProjectNetworkData groups identities and attaches capabilities, knowledge, and agent runtime outputs", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Network Demo",
      archicad_project_id: "ARCHICAD-NETWORK"
    },
    ...emptyOperationalState(),
    scenarios: [{ id: "baseline", name: "Baseline", status: "baseline" }],
    network_organisations: [
      {
        id: "org-agentic",
        project_id: "project-1",
        name: "Agent Bench",
        organisation_type: "agentic",
        status: "active"
      }
    ],
    network_profiles: [
      {
        id: "profile-cost-agent",
        project_id: "project-1",
        organisation_id: "org-agentic",
        display_name: "Cost Agent",
        profile_type: "agentic",
        category: "Agentic Assistants",
        domain: "Cost intelligence",
        status: "active"
      }
    ],
    network_profile_capabilities: [
      {
        id: "cap-cost-agent",
        project_id: "project-1",
        profile_id: "profile-cost-agent",
        skills_json: ["rate review"],
        constraints_json: ["cite sources"],
        question_types_json: ["What changed?"],
        output_types_json: ["cost review"],
        operating_instructions_md: "## Method\nCheck sources first.",
        constraints_md: "- Cite sources",
        review_policy_md: "Human review required."
      }
    ],
    network_knowledge_packs: [
      {
        id: "kp-cost",
        project_id: "project-1",
        title: "Cost Pack",
        domain: "Cost",
        status: "active"
      }
    ],
    network_profile_knowledge_packs: [
      {
        id: "link-cost-pack",
        project_id: "project-1",
        profile_id: "profile-cost-agent",
        knowledge_pack_id: "kp-cost"
      }
    ],
    network_inquiries: [
      {
        id: "inquiry-1",
        project_id: "project-1",
        title: "Review costs",
        question: "Which rates are weak?",
        status: "open"
      }
    ],
    network_inquiry_messages: [
      {
        id: "message-1",
        project_id: "project-1",
        inquiry_id: "inquiry-1",
        profile_id: "profile-cost-agent",
        author_label: "Cost Agent",
        author_type: "agentic",
        message: "Facade rate needs a source check."
      }
    ],
    network_work_products: [
      {
        id: "product-1",
        project_id: "project-1",
        inquiry_id: "inquiry-1",
        profile_id: "profile-cost-agent",
        title: "Cost Source Gap",
        product_type: "cost review",
        status: "draft"
      }
    ],
    network_work_product_links: [
      {
        id: "product-link-1",
        project_id: "project-1",
        work_product_id: "product-1",
        linked_ref_type: "master_cost_template",
        linked_ref_id: "template-1"
      }
    ],
    network_agent_cards: [
      {
        id: "agent-card-1",
        project_id: "project-1",
        profile_id: "profile-cost-agent",
        model_label: "Configurable LLM",
        persona_md: "Skeptical cost reviewer.",
        memory_md: "Scenario cost plans are snapshots.",
        tool_policy_json: {
          can_read: ["cost_context", "scenario_context"],
          can_draft: ["inquiry_message", "work_product"],
          cannot_modify_directly: ["master_cost_items"]
        },
        skill_policy_json: ["rate_review"],
        output_schema_json: { required: ["finding", "evidence_refs"] },
        review_policy_md: "Estimator review required.",
        escalation_policy_md: "Escalate acquisition-critical gaps.",
        status: "active"
      }
    ],
    network_agent_sessions: [
      {
        id: "session-1",
        project_id: "project-1",
        inquiry_id: "inquiry-1",
        title: "Cost review session",
        status: "draft"
      }
    ],
    network_agent_session_participants: [
      {
        id: "participant-1",
        project_id: "project-1",
        session_id: "session-1",
        profile_id: "profile-cost-agent",
        session_role: "critic"
      }
    ],
    network_agent_messages: [
      {
        id: "agent-message-1",
        project_id: "project-1",
        session_id: "session-1",
        profile_id: "profile-cost-agent",
        author_label: "Cost Agent",
        message_role: "assistant",
        content: "Check facade evidence."
      }
    ],
    network_agent_tool_calls: [
      {
        id: "tool-call-1",
        project_id: "project-1",
        session_id: "session-1",
        profile_id: "profile-cost-agent",
        tool_name: "read_cost_database"
      }
    ],
    network_agent_outputs: [
      {
        id: "output-1",
        project_id: "project-1",
        session_id: "session-1",
        profile_id: "profile-cost-agent",
        output_type: "cost review",
        title: "Initial output",
        status: "draft"
      }
    ]
  });

  const network = buildProjectNetworkData(state);

  assert.equal(network.totals.profileCount, 1);
  assert.equal(network.profilesByCategory[0].category, "Agentic Assistants");
  assert.equal(network.profiles[0].organisation?.name, "Agent Bench");
  assert.equal(network.profiles[0].capability?.skills_json?.[0], "rate review");
  assert.equal(network.profiles[0].capability?.operating_instructions_md, "## Method\nCheck sources first.");
  assert.equal(network.profiles[0].knowledgePacks[0].title, "Cost Pack");
  assert.equal(network.profiles[0].agentCard?.model_label, "Configurable LLM");
  assert.equal(network.profiles[0].agentCard?.persona_md, "Skeptical cost reviewer.");
  assert.deepEqual(network.profiles[0].agentCard?.skill_policy_json, ["rate_review"]);
  assert.equal(network.inquiries[0].assignedProfiles[0].display_name, "Cost Agent");
  assert.equal(network.workProducts[0].links[0].linked_ref_id, "template-1");
  assert.equal(network.agentSessions[0].participants[0].profile?.display_name, "Cost Agent");
  assert.equal(network.agentSessions[0].toolCalls[0].tool_name, "read_cost_database");
  assert.equal(network.agentSessions[0].outputs[0].title, "Initial output");
});

test("project context builders return cited packets and enforce agent read policy", () => {
  const state = normalizeRuntimeState({
    project: {
      id: "project-1",
      name: "Context Demo",
      archicad_project_id: "ARCHICAD-CONTEXT"
    },
    ...emptyOperationalState(),
    scenarios: [{ id: "baseline", name: "Baseline", status: "baseline" }],
    sites: [
      {
        id: "site-1",
        project_id: "project-1",
        name: "Main Street",
        address: "1 Main Street",
        status: "shortlisted",
        summary: "Townhouse feasibility site."
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
        name: "4 Townhouse",
        configuration: "4 townhouse",
        dwellings: 4,
        gross_floor_area_sqm: 620,
        status: "testing"
      }
    ],
    scenario_cost_ranges: [
      {
        id: "range-1",
        scenario_option_id: "option-1",
        range_key: "mid",
        label: "Mid",
        construction_cost: 1_000_000
      }
    ],
    sales_assumptions: [],
    archicad_links: [],
    site_resources: [
      {
        id: "resource-1",
        project_id: "project-1",
        site_id: "site-1",
        resource_type: "property_report",
        title: "Planning report",
        url: "https://example.com/report.pdf",
        status: "active"
      }
    ],
    site_planning_highlights: [
      {
        id: "highlight-1",
        project_id: "project-1",
        site_id: "site-1",
        source_resource_id: "resource-1",
        council: "Example Council",
        zoning: "Neighbourhood Residential Zone",
        overlays_json: ["Design and Development Overlay"],
        site_area_sqm: 812,
        flood_status: "No flood overlay identified",
        status: "active"
      }
    ],
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
    network_agent_outputs: []
  });

  const siteContext = buildSiteContext(state, "site-1");
  assert.equal(siteContext.facts[0].source_ref, "sites.site-1");
  assert.equal(siteContext.risks[0].source_ref, "site_constraints.constraint-1");
  assert.equal(siteContext.facts.find((fact) => fact.label === "Council")?.value, "Example Council");
  assert.equal(siteContext.facts.find((fact) => fact.label === "Resource count")?.value, 1);
  assert.ok(siteContext.related_refs.includes("site_resources.resource-1"));
  assert.ok(siteContext.related_refs.includes("site_planning_highlights.highlight-1"));

  const scenarioContext = buildScenarioOptionContext(state, "option-1");
  assert.equal(scenarioContext.tool, "scenario_context");
  assert.equal(scenarioContext.facts.find((fact) => fact.label === "Dwellings")?.value, 4);
  assert.ok(scenarioContext.warnings.includes("No sales assumption is recorded for this scenario option."));

  assertAgentCanReadContext(
    {
      id: "card-1",
      project_id: "project-1",
      profile_id: "profile-1",
      tool_policy_json: { can_read: ["site_context"] },
      status: "active"
    },
    "site_context"
  );
  assert.throws(
    () =>
      assertAgentCanReadContext(
        {
          id: "card-1",
          project_id: "project-1",
          profile_id: "profile-1",
          tool_policy_json: { can_read: ["site_context"] },
          status: "active"
        },
        "cost_context"
      ),
    /not allowed/
  );
});
