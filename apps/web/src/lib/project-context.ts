import type { NetworkAgentCardRecord, RuntimeState } from "./runtime-state";

export type ProjectContextTool =
  | "site_context"
  | "scenario_context"
  | "feasibility_context"
  | "cost_context"
  | "schedule_context"
  | "archicad_context"
  | "inquiry_context";

export type ContextFact = {
  label: string;
  value: string | number | boolean | null;
  source_ref: string;
};

export type ContextRisk = {
  label: string;
  severity?: string | null;
  source_ref: string;
};

export type ProjectContextPacket = {
  tool: ProjectContextTool;
  target: string;
  summary_md: string;
  facts: ContextFact[];
  risks: ContextRisk[];
  related_refs: string[];
  warnings: string[];
};

function sourceRef(table: string, id: string): string {
  return `${table}.${id}`;
}

function allowedReadTools(agentCard: NetworkAgentCardRecord | null | undefined): Set<string> {
  const policy = agentCard?.tool_policy_json;
  if (!policy) return new Set();
  if (Array.isArray(policy)) {
    return new Set(policy.map((item) => String(item)));
  }
  if (typeof policy === "object" && policy !== null && "can_read" in policy) {
    const canRead = (policy as { can_read?: unknown }).can_read;
    if (Array.isArray(canRead)) {
      return new Set(canRead.map((item) => String(item)));
    }
  }
  return new Set();
}

export function assertAgentCanReadContext(
  agentCard: NetworkAgentCardRecord | null | undefined,
  tool: ProjectContextTool
): void {
  const allowed = allowedReadTools(agentCard);
  if (allowed.size > 0 && !allowed.has(tool)) {
    throw new Error(`Agent card is not allowed to read '${tool}'`);
  }
}

export function buildSiteContext(state: RuntimeState, siteId: string): ProjectContextPacket {
  const site = state.sites.find((item) => item.id === siteId);
  if (!site) throw new Error(`Site '${siteId}' was not found`);
  const constraints = state.site_constraints.filter((item) => item.site_id === siteId);
  const options = state.scenario_options.filter((item) => item.site_id === siteId);
  const resources = state.site_resources.filter((item) => item.site_id === siteId && item.status !== "archived");
  const planning = state.site_planning_highlights.find((item) => item.site_id === siteId && item.status !== "archived");
  const overlays = planning?.overlays_json?.filter((item): item is string => typeof item === "string") ?? [];
  return {
    tool: "site_context",
    target: siteId,
    summary_md: `${site.name} is a ${site.status} site at ${site.address}. ${site.summary ?? ""} ${planning?.planning_summary ?? ""}`.trim(),
    facts: [
      { label: "Site name", value: site.name, source_ref: sourceRef("sites", site.id) },
      { label: "Address", value: site.address, source_ref: sourceRef("sites", site.id) },
      { label: "Status", value: site.status, source_ref: sourceRef("sites", site.id) },
      { label: "Scenario options", value: options.length, source_ref: sourceRef("sites", site.id) },
      { label: "Resource count", value: resources.length, source_ref: sourceRef("sites", site.id) },
      ...(planning
        ? [
            { label: "Council", value: planning.council ?? null, source_ref: sourceRef("site_planning_highlights", planning.id) },
            { label: "Zoning", value: planning.zoning ?? null, source_ref: sourceRef("site_planning_highlights", planning.id) },
            { label: "Planning overlays", value: overlays.join(", ") || null, source_ref: sourceRef("site_planning_highlights", planning.id) },
            { label: "Planning site area sqm", value: planning.site_area_sqm ?? null, source_ref: sourceRef("site_planning_highlights", planning.id) }
          ]
        : [])
    ],
    risks: [
      ...constraints.map((constraint) => ({
        label: constraint.title,
        severity: constraint.severity,
        source_ref: sourceRef("site_constraints", constraint.id)
      })),
      ...(planning?.flood_status ? [{ label: `Flood: ${planning.flood_status}`, severity: "planning", source_ref: sourceRef("site_planning_highlights", planning.id) }] : []),
      ...(planning?.heritage_status ? [{ label: `Heritage: ${planning.heritage_status}`, severity: "planning", source_ref: sourceRef("site_planning_highlights", planning.id) }] : []),
      ...(planning?.utilities_status?.trim()
        ? [{ label: `Utilities: ${planning.utilities_status}`, severity: "planning", source_ref: sourceRef("site_planning_highlights", planning.id) }]
        : [])
    ],
    related_refs: [
      ...constraints.map((item) => sourceRef("site_constraints", item.id)),
      ...options.map((item) => sourceRef("scenario_options", item.id)),
      ...resources.map((item) => sourceRef("site_resources", item.id)),
      ...(planning ? [sourceRef("site_planning_highlights", planning.id)] : [])
    ],
    warnings: [
      ...(constraints.length === 0 ? ["No site constraints are recorded for this site."] : []),
      ...(resources.length === 0 ? ["No site resources are recorded for this site."] : []),
      ...(!planning ? ["No planning highlights are recorded for this site."] : [])
    ]
  };
}

export function buildScenarioOptionContext(state: RuntimeState, optionId: string): ProjectContextPacket {
  const option = state.scenario_options.find((item) => item.id === optionId);
  if (!option) throw new Error(`Scenario option '${optionId}' was not found`);
  const site = state.sites.find((item) => item.id === option.site_id);
  const ranges = state.scenario_cost_ranges.filter((item) => item.scenario_option_id === optionId);
  const sales = state.sales_assumptions.find((item) => item.scenario_option_id === optionId);
  const archicad = state.archicad_links.find((item) => item.scenario_option_id === optionId);
  return {
    tool: "scenario_context",
    target: optionId,
    summary_md: `${option.name} is a ${option.configuration} scenario${site ? ` for ${site.name}` : ""}. ${option.summary ?? ""}`.trim(),
    facts: [
      { label: "Configuration", value: option.configuration, source_ref: sourceRef("scenario_options", option.id) },
      { label: "Dwellings", value: option.dwellings ?? null, source_ref: sourceRef("scenario_options", option.id) },
      { label: "Gross floor area sqm", value: option.gross_floor_area_sqm ?? null, source_ref: sourceRef("scenario_options", option.id) },
      { label: "Target margin percent", value: option.target_margin_percent ?? null, source_ref: sourceRef("scenario_options", option.id) },
      { label: "Gross realisation", value: sales?.gross_realisation ?? null, source_ref: sales ? sourceRef("sales_assumptions", sales.id) : sourceRef("scenario_options", option.id) },
      { label: "Cost bands", value: ranges.length, source_ref: sourceRef("scenario_options", option.id) }
    ],
    risks: state.site_constraints
      .filter((constraint) => constraint.site_id === option.site_id)
      .map((constraint) => ({
        label: constraint.title,
        severity: constraint.severity,
        source_ref: sourceRef("site_constraints", constraint.id)
      })),
    related_refs: [
      sourceRef("sites", option.site_id),
      ...ranges.map((item) => sourceRef("scenario_cost_ranges", item.id)),
      ...(sales ? [sourceRef("sales_assumptions", sales.id)] : []),
      ...(archicad ? [sourceRef("archicad_links", archicad.id)] : [])
    ],
    warnings: [
      ...(ranges.length === 0 ? ["No cost ranges are recorded for this scenario option."] : []),
      ...(!sales ? ["No sales assumption is recorded for this scenario option."] : []),
      ...(!archicad ? ["No Archicad link is recorded for this scenario option."] : [])
    ]
  };
}

export function buildCostTemplateContext(state: RuntimeState, templateId: string): ProjectContextPacket {
  const template = state.master_cost_templates.find((item) => item.id === templateId);
  if (!template) throw new Error(`Cost template '${templateId}' was not found`);
  const items = state.master_cost_template_items.filter((item) => item.master_cost_template_id === templateId);
  const subtotal = items.reduce((total, item) => total + (item.default_quantity ?? 1) * item.base_rate, 0);
  return {
    tool: "cost_context",
    target: templateId,
    summary_md: `${template.name} contains ${items.length} template items with an indicative subtotal of ${Math.round(subtotal)}.`,
    facts: [
      { label: "Template status", value: template.status, source_ref: sourceRef("master_cost_templates", template.id) },
      { label: "Template items", value: items.length, source_ref: sourceRef("master_cost_templates", template.id) },
      { label: "Indicative subtotal", value: Math.round(subtotal), source_ref: sourceRef("master_cost_templates", template.id) }
    ],
    risks: items
      .filter((item) => item.estimate_granularity === "allowance" || item.estimate_granularity === "provisional_sum")
      .map((item) => ({
        label: `${item.title} is ${item.estimate_granularity}`,
        severity: "cost confidence",
        source_ref: sourceRef("master_cost_template_items", item.id)
      })),
    related_refs: items.map((item) => sourceRef("master_cost_template_items", item.id)),
    warnings: items.length === 0 ? ["This cost template has no line items."] : []
  };
}

export function buildScheduleContext(state: RuntimeState, scenarioId: string): ProjectContextPacket {
  const activities = state.linear_schedule_activities.filter((item) => String(item.scenario_id ?? "") === scenarioId);
  return {
    tool: "schedule_context",
    target: scenarioId,
    summary_md: `Scenario ${scenarioId} has ${activities.length} linked schedule activities.`,
    facts: [
      { label: "Schedule activities", value: activities.length, source_ref: sourceRef("scenarios", scenarioId) }
    ],
    risks: activities
      .filter((item) => !item.start_date || !item.finish_date)
      .map((item) => ({
        label: `${String(item.activity_name ?? item.id)} is missing schedule dates`,
        severity: "program confidence",
        source_ref: sourceRef("linear_schedule_activities", String(item.id))
      })),
    related_refs: activities.map((item) => sourceRef("linear_schedule_activities", String(item.id))),
    warnings: activities.length === 0 ? ["No schedule activities are linked to this scenario."] : []
  };
}

export function buildArchicadContext(state: RuntimeState, scenarioOptionId: string): ProjectContextPacket {
  const links = state.archicad_links.filter((item) => item.scenario_option_id === scenarioOptionId);
  return {
    tool: "archicad_context",
    target: scenarioOptionId,
    summary_md: `${links.length} Archicad link(s) are connected to scenario option ${scenarioOptionId}.`,
    facts: links.flatMap((link) => [
      { label: "Archicad file", value: link.file_label, source_ref: sourceRef("archicad_links", link.id) },
      { label: "Linked GUID count", value: link.linked_guid_count ?? 0, source_ref: sourceRef("archicad_links", link.id) }
    ]),
    risks: [],
    related_refs: links.map((link) => sourceRef("archicad_links", link.id)),
    warnings: links.length === 0 ? ["No Archicad model link is recorded for this scenario option."] : []
  };
}

export function buildInquiryContext(state: RuntimeState, inquiryId: string): ProjectContextPacket {
  const inquiry = state.network_inquiries.find((item) => item.id === inquiryId);
  if (!inquiry) throw new Error(`Inquiry '${inquiryId}' was not found`);
  const messages = state.network_inquiry_messages.filter((item) => item.inquiry_id === inquiryId);
  return {
    tool: "inquiry_context",
    target: inquiryId,
    summary_md: `${inquiry.title}\n\n${inquiry.question}`,
    facts: [
      { label: "Inquiry status", value: inquiry.status, source_ref: sourceRef("network_inquiries", inquiry.id) },
      { label: "Message count", value: messages.length, source_ref: sourceRef("network_inquiries", inquiry.id) }
    ],
    risks: [],
    related_refs: [
      ...(inquiry.linked_ref_type && inquiry.linked_ref_id ? [`${inquiry.linked_ref_type}.${inquiry.linked_ref_id}`] : []),
      ...messages.map((item) => sourceRef("network_inquiry_messages", item.id))
    ],
    warnings: messages.length === 0 ? ["No network messages have been added to this inquiry yet."] : []
  };
}

export function buildFeasibilityContext(state: RuntimeState, targetRef: string): ProjectContextPacket {
  const scenario = state.scenario_options.find((item) => item.id === targetRef);
  if (scenario) return { ...buildScenarioOptionContext(state, targetRef), tool: "feasibility_context" };
  const site = state.sites.find((item) => item.id === targetRef);
  if (site) return { ...buildSiteContext(state, targetRef), tool: "feasibility_context" };
  throw new Error(`Feasibility target '${targetRef}' was not found`);
}
