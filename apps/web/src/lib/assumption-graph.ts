import type {
  AssumptionActionRecord,
  AssumptionApplicationRecord,
  AssumptionEvidenceRecord,
  AssumptionTemplateRecord,
  AssumptionValidationRecord,
  AssumptionParticipantRole,
  FeasibilityBranchRecord,
  FeasibilityTemplateRecord,
  NetworkProfileRecord,
  RuntimeState,
  ScenarioTemplateRecord,
  SimulationTemplateRecord,
  SiteTemplateRecord
} from "./runtime-state";

export const ASSUMPTION_PARTICIPANT_ROLE_ORDER: string[] = [
  "accountable_owner",
  "validates_assumption",
  "provides_evidence",
  "approves_strategy",
  "challenges",
  "watcher"
];

export const ASSUMPTION_PARTICIPANT_ROLE_LABELS: Record<AssumptionParticipantRole, string> = {
  accountable_owner: "Owner",
  validates_assumption: "Validator",
  provides_evidence: "Evidence",
  approves_strategy: "Approver",
  challenges: "Challenge",
  watcher: "Watcher"
};

export function assumptionParticipantRoleLabel(role: string): string {
  return ASSUMPTION_PARTICIPANT_ROLE_LABELS[role as AssumptionParticipantRole] ?? role.replaceAll("_", " ");
}

export function isOpenAssumptionAction(action: Pick<AssumptionActionRecord, "status">): boolean {
  return !["done", "completed", "cancelled", "archived"].includes(action.status);
}

export type AssumptionValidationNode = AssumptionValidationRecord & {
  profile: NetworkProfileRecord | null;
  profileName: string | null;
};

export type AssumptionActionNode = AssumptionActionRecord & {
  responsibleProfile: NetworkProfileRecord | null;
  responsibleProfileName: string | null;
};

export type AssumptionApplicationNode = AssumptionApplicationRecord & {
  template: AssumptionTemplateRecord | null;
  feasibilityBranch: FeasibilityBranchRecord | null;
  validations: AssumptionValidationNode[];
  evidence: AssumptionEvidenceRecord[];
  actions: AssumptionActionNode[];
  accountableOwner: AssumptionValidationNode | null;
  appliedLabel: string;
};

export type AssumptionGraphData = {
  templates: {
    site: SiteTemplateRecord[];
    scenario: ScenarioTemplateRecord[];
    feasibility: FeasibilityTemplateRecord[];
    assumption: AssumptionTemplateRecord[];
    simulation: SimulationTemplateRecord[];
  };
  feasibilityBranches: FeasibilityBranchRecord[];
  applications: AssumptionApplicationNode[];
  groupedApplications: Array<{ refType: string; refId: string; label: string; applications: AssumptionApplicationNode[] }>;
  validationQueue: AssumptionApplicationNode[];
  actionQueue: AssumptionActionRecord[];
  simulationReadyAssumptions: AssumptionTemplateRecord[];
  totals: {
    siteTemplateCount: number;
    scenarioTemplateCount: number;
    feasibilityTemplateCount: number;
    assumptionTemplateCount: number;
    applicationCount: number;
    pendingValidationCount: number;
    openActionCount: number;
    simulationReadyCount: number;
  };
};

function labelForRef(state: RuntimeState, refType: string, refId: string): string {
  if (refType === "site") {
    return state.sites.find((site) => site.id === refId)?.name ?? refId;
  }
  if (refType === "scenario_option") {
    return state.scenario_options.find((option) => option.id === refId)?.name ?? refId;
  }
  if (refType === "scenario") {
    return state.scenarios.find((scenario) => String(scenario.id) === refId)?.name ?? refId;
  }
  if (refType === "feasibility_branch") {
    return state.feasibility_branches.find((branch) => branch.id === refId)?.name ?? refId;
  }
  if (refType === "master_cost_template") {
    return state.master_cost_templates.find((template) => template.id === refId)?.name ?? refId;
  }
  return refId;
}

function isPendingValidation(validation: AssumptionValidationRecord): boolean {
  return !["validated", "approved", "rejected"].includes(validation.status);
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export function buildAssumptionGraphData(state: RuntimeState): AssumptionGraphData {
  const templatesById = new Map(state.assumption_templates.map((template) => [template.id, template]));
  const profilesById = new Map(state.network_profiles.map((profile) => [profile.id, profile]));
  const branchesById = new Map(state.feasibility_branches.map((branch) => [branch.id, branch]));
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

  const applications = state.assumption_applications
    .map((application): AssumptionApplicationNode => {
      const validations = (validationsByApplication.get(application.id) ?? []).map((validation) => ({
        ...validation,
        profile: profilesById.get(validation.profile_id) ?? null,
        profileName: profilesById.get(validation.profile_id)?.display_name ?? null
      })).sort((left, right) => {
        const leftIndex = ASSUMPTION_PARTICIPANT_ROLE_ORDER.indexOf(left.relationship_type);
        const rightIndex = ASSUMPTION_PARTICIPANT_ROLE_ORDER.indexOf(right.relationship_type);
        return (leftIndex >= 0 ? leftIndex : 99) - (rightIndex >= 0 ? rightIndex : 99) || (left.profileName ?? left.profile_id).localeCompare(right.profileName ?? right.profile_id);
      });
      const actions = (actionsByApplication.get(application.id) ?? []).map((action) => ({
        ...action,
        responsibleProfile: action.responsible_profile_id ? profilesById.get(action.responsible_profile_id) ?? null : null,
        responsibleProfileName: action.responsible_profile_id ? profilesById.get(action.responsible_profile_id)?.display_name ?? null : null
      }));
      return {
        ...application,
        template: templatesById.get(application.assumption_template_id) ?? null,
        feasibilityBranch: application.feasibility_branch_id
          ? branchesById.get(application.feasibility_branch_id) ?? null
          : null,
        validations,
        evidence: evidenceByApplication.get(application.id) ?? [],
        actions,
        accountableOwner: validations.find((validation) => validation.relationship_type === "accountable_owner") ?? null,
        appliedLabel: labelForRef(state, application.applied_ref_type, application.applied_ref_id)
      };
    })
    .sort((left, right) => {
      const labelCompare = left.appliedLabel.localeCompare(right.appliedLabel);
      return labelCompare || String(left.template?.name ?? left.assumption_template_id).localeCompare(String(right.template?.name ?? right.assumption_template_id));
    });

  const groups = new Map<string, AssumptionApplicationNode[]>();
  for (const application of applications) {
    const key = `${application.applied_ref_type}:${application.applied_ref_id}`;
    groups.set(key, [...(groups.get(key) ?? []), application]);
  }

  const groupedApplications = [...groups.entries()]
    .map(([key, group]) => {
      const [refType, refId] = key.split(":");
      return {
        refType,
        refId,
        label: labelForRef(state, refType, refId),
        applications: group
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  const validationQueue = applications.filter((application) =>
    application.validations.some(isPendingValidation)
  );
  const actionQueue = state.assumption_actions.filter(isOpenAssumptionAction);
  const simulationReadyAssumptions = state.assumption_templates.filter(
    (template) => template.enabled_for_simulation || template.value_type !== "fixed"
  );

  return {
    templates: {
      site: sortByName(state.site_templates),
      scenario: sortByName(state.scenario_templates),
      feasibility: sortByName(state.feasibility_templates),
      assumption: sortByName(state.assumption_templates),
      simulation: sortByName(state.simulation_templates)
    },
    feasibilityBranches: sortByName(state.feasibility_branches),
    applications,
    groupedApplications,
    validationQueue,
    actionQueue,
    simulationReadyAssumptions,
    totals: {
      siteTemplateCount: state.site_templates.length,
      scenarioTemplateCount: state.scenario_templates.length,
      feasibilityTemplateCount: state.feasibility_templates.length,
      assumptionTemplateCount: state.assumption_templates.length,
      applicationCount: state.assumption_applications.length,
      pendingValidationCount: state.assumption_validations.filter(isPendingValidation).length,
      openActionCount: actionQueue.length,
      simulationReadyCount: simulationReadyAssumptions.length
    }
  };
}

export function applicationsForRef(
  graph: AssumptionGraphData,
  refType: string,
  refId: string
): AssumptionApplicationNode[] {
  return graph.applications.filter(
    (application) => application.applied_ref_type === refType && application.applied_ref_id === refId
  );
}
