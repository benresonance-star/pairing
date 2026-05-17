"use client";

import Link from "next/link";

import {
  ASSUMPTION_PARTICIPANT_ROLE_ORDER,
  assumptionParticipantRoleLabel,
  isOpenAssumptionAction,
  type AssumptionApplicationNode,
  type AssumptionGraphData,
  type AssumptionValidationNode
} from "../lib/assumption-graph";

type Props = {
  graph: AssumptionGraphData;
  title?: string;
  eyebrow?: string;
  description?: string;
  refType?: string;
  refId?: string;
  compact?: boolean;
  limit?: number;
  actionHref?: string | null;
  actionLabel?: string;
  profiles?: Array<{ id: string; display_name: string; status: string }>;
  selectedProfileId?: string | null;
  focusedApplicationId?: string | null;
  enableAssignment?: boolean;
  assignmentActions?: {
    assignAssumptionParticipantAction: (formData: FormData) => Promise<void>;
    unassignAssumptionParticipantAction: (formData: FormData) => Promise<void>;
    createAssumptionActionAction: (formData: FormData) => Promise<void>;
  };
  onSelectProfile?: (profileId: string) => void;
};

function applicationStatus(application: AssumptionApplicationNode): string {
  const pending = application.validations.filter((validation) => validation.status === "pending").length;
  if (pending > 0) return `${pending} validation${pending === 1 ? "" : "s"} pending`;
  if (application.status) return application.status;
  return "applied";
}

function visibleApplications(graph: AssumptionGraphData, refType?: string, refId?: string) {
  if (!refType || !refId) return graph.applications;
  return graph.applications.filter(
    (application) =>
      (application.applied_ref_type === refType && application.applied_ref_id === refId) ||
      application.feasibilityBranch?.id === refId ||
      application.feasibilityBranch?.scenario_option_id === refId ||
      application.feasibilityBranch?.scenario_id === refId ||
      application.feasibilityBranch?.site_id === refId
  );
}

function validationsByRole(validations: AssumptionValidationNode[]) {
  const groups = new Map<string, AssumptionValidationNode[]>();
  for (const validation of validations) {
    groups.set(validation.relationship_type, [...(groups.get(validation.relationship_type) ?? []), validation]);
  }
  return [...groups.entries()].sort((left, right) => {
    const leftIndex = ASSUMPTION_PARTICIPANT_ROLE_ORDER.indexOf(left[0]);
    const rightIndex = ASSUMPTION_PARTICIPANT_ROLE_ORDER.indexOf(right[0]);
    return (leftIndex >= 0 ? leftIndex : 99) - (rightIndex >= 0 ? rightIndex : 99);
  });
}

export function AssumptionGraphPanel({
  graph,
  title = "Assumption Graph",
  eyebrow = "Assumption Links",
  description = "Trace reusable assumptions into branches, validations, evidence, actions, and simulation readiness.",
  refType,
  refId,
  compact = false,
  limit = 6,
  actionHref = "/base-costs",
  actionLabel = "Open Assumptions",
  profiles = [],
  selectedProfileId,
  focusedApplicationId,
  enableAssignment = false,
  assignmentActions,
  onSelectProfile
}: Props) {
  const applications = visibleApplications(graph, refType, refId).slice(0, limit);
  const shownCount = applications.length;

  return (
    <div className={`assumption-graph-panel ${compact ? "assumption-graph-panel--compact" : ""}`}>
      <div className="assumption-graph-panel__header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
        {actionHref ? (
          <Link className="outline-link" href={actionHref}>
            {actionLabel}
          </Link>
        ) : null}
      </div>

      <div className="assumption-graph-metrics">
        <span>
          <strong>{graph.totals.assumptionTemplateCount}</strong>
          Templates
        </span>
        <span>
          <strong>{graph.totals.applicationCount}</strong>
          Applied
        </span>
        <span>
          <strong>{graph.totals.pendingValidationCount}</strong>
          Validations
        </span>
        <span>
          <strong>{graph.totals.simulationReadyCount}</strong>
          Simulation-ready
        </span>
      </div>

      {shownCount === 0 ? (
        <p className="muted">No assumptions are applied to this branch yet.</p>
      ) : (
        <div className="assumption-graph-list">
          {applications.map((application) => (
            <article
              className={`assumption-graph-node ${focusedApplicationId === application.id ? "assumption-graph-node--focused" : ""}`}
              id={`assumption-card-${application.id}`}
              key={application.id}
            >
              <div>
                <span className="tag">{application.template?.category ?? "Assumption"}</span>
                <h4>{application.template?.name ?? application.assumption_template_id}</h4>
                <p>{application.notes ?? application.template?.notes ?? "No notes captured."}</p>
                {application.accountableOwner ? (
                  <button
                    type="button"
                    className={`assumption-owner-link ${selectedProfileId === application.accountableOwner.profile_id ? "assumption-owner-link--selected" : ""}`}
                    onClick={() => onSelectProfile?.(application.accountableOwner?.profile_id ?? "")}
                  >
                    Owner: {application.accountableOwner.profileName ?? application.accountableOwner.profile_id}
                  </button>
                ) : (
                  <span className="assumption-owner-link">No accountable owner</span>
                )}
              </div>
              <dl>
                <div>
                  <dt>Applied To</dt>
                  <dd>{application.appliedLabel}</dd>
                </div>
                <div>
                  <dt>Impact</dt>
                  <dd>{application.template?.impact_area ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{applicationStatus(application)}</dd>
                </div>
                <div>
                  <dt>Actions</dt>
                  <dd>{application.actions.filter(isOpenAssumptionAction).length} open / {application.actions.length}</dd>
                </div>
              </dl>
              {application.validations.length > 0 ? (
                <div className="assumption-graph-validators">
                  {validationsByRole(application.validations).map(([role, validations]) => (
                    <div className="assumption-role-group" key={role}>
                      <strong>{assumptionParticipantRoleLabel(role)}</strong>
                      <span>
                        {validations.map((validation) => (
                          <button
                            key={validation.id}
                            type="button"
                            className={`assumption-participant-chip ${selectedProfileId === validation.profile_id ? "assumption-participant-chip--selected" : ""}`}
                            onClick={() => onSelectProfile?.(validation.profile_id)}
                          >
                            {validation.profileName ?? validation.profile_id}: {validation.status}
                          </button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {application.actions.some((action) => action.responsible_profile_id) ? (
                <div className="assumption-action-owner-list">
                  <strong>Responsible actions</strong>
                  {application.actions
                    .filter((action) => action.responsible_profile_id)
                    .map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={`assumption-participant-chip ${selectedProfileId === action.responsible_profile_id ? "assumption-participant-chip--selected" : ""}`}
                        onClick={() => action.responsible_profile_id ? onSelectProfile?.(action.responsible_profile_id) : undefined}
                      >
                        {action.title}: {action.responsibleProfileName ?? action.responsible_profile_id} / {action.status}
                      </button>
                    ))}
                </div>
              ) : null}
              {enableAssignment && assignmentActions ? (
                <div className="assumption-assignment-controls">
                  <form action={assignmentActions.assignAssumptionParticipantAction} className="assumption-assignment-form">
                    <input type="hidden" name="assumptionApplicationId" value={application.id} />
                    <select name="profileId" defaultValue={selectedProfileId ?? profiles[0]?.id ?? ""} required>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>{profile.display_name}</option>
                      ))}
                    </select>
                    <select name="relationshipType" defaultValue={application.accountableOwner ? "validates_assumption" : "accountable_owner"}>
                      <option value="accountable_owner">{application.accountableOwner ? "Transfer owner" : "Owner"}</option>
                      <option value="validates_assumption">Validator</option>
                      <option value="provides_evidence">Evidence provider</option>
                      <option value="approves_strategy">Approver</option>
                      <option value="challenges">Challenger</option>
                      <option value="watcher">Watcher</option>
                    </select>
                    <select name="status" defaultValue="pending">
                      <option value="pending">pending</option>
                      <option value="validated">validated</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                      <option value="watching">watching</option>
                    </select>
                    <input name="confidence" placeholder="Confidence" />
                    <input name="notes" placeholder="Notes" />
                    <input name="actionTitle" placeholder="Optional follow-up action" />
                    <select name="actionPriority" defaultValue="MEDIUM">
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                    <input name="actionStage" placeholder="Action stage" />
                    <input name="actionRiskIfDelayed" placeholder="Risk if delayed" />
                    <button type="submit">Assign</button>
                  </form>
                  {application.validations.length > 0 ? (
                    <div className="assumption-unassign-row">
                      {application.validations.map((validation) => (
                        <form key={validation.id} action={assignmentActions.unassignAssumptionParticipantAction}>
                          <input type="hidden" name="validationId" value={validation.id} />
                          <button type="submit">{validation.profileName ?? validation.profile_id} x</button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
