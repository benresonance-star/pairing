"use client";

import { useMemo, useState } from "react";

import type { AssumptionGraphData } from "../../lib/assumption-graph";
import type { FeasibilityPortfolio } from "../../lib/feasibility";
import { AssumptionGraphPanel } from "../assumption-graph-panel";
import { BaseCostsWorkspace, type BaseCostsActions } from "./base-costs-workspace";
import { DeveloperDiary } from "./developer-diary";
import { StrategyPlaybook } from "./strategy-playbook";

type AssumptionsTab = "other" | "base-costs" | "strategy-playbook" | "developer-diary";

type Props = {
  portfolio: FeasibilityPortfolio;
  graph: AssumptionGraphData;
  actions: BaseCostsActions;
};

function formatValue(value: number | string | boolean | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || value === "") return "Not set";
  const suffix = unit ? ` ${unit}` : "";
  return `${String(value)}${suffix}`;
}

function rangeLabel(template: AssumptionGraphData["templates"]["assumption"][number]): string {
  if (template.min_value == null && template.max_value == null && template.most_likely_value == null) {
    return formatValue(template.default_value, template.unit);
  }
  const low = template.min_value ?? "n/a";
  const high = template.max_value ?? "n/a";
  const likely = template.most_likely_value === null ? "" : `, likely ${formatValue(template.most_likely_value, template.unit)}`;
  return `${low} to ${high}${template.unit ? ` ${template.unit}` : ""}${likely}`;
}

export function AssumptionsWorkspace({ portfolio, graph, actions }: Props) {
  const [activeTab, setActiveTab] = useState<AssumptionsTab>("other");

  const applicationsByTemplate = useMemo(() => {
    const grouped = new Map<string, AssumptionGraphData["applications"]>();
    for (const application of graph.applications) {
      grouped.set(application.assumption_template_id, [
        ...(grouped.get(application.assumption_template_id) ?? []),
        application
      ]);
    }
    return grouped;
  }, [graph.applications]);

  const categoryGroups = useMemo(() => {
    const grouped = new Map<string, AssumptionGraphData["templates"]["assumption"]>();
    for (const template of graph.templates.assumption) {
      grouped.set(template.category, [...(grouped.get(template.category) ?? []), template]);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [graph.templates.assumption]);

  return (
    <section className="assumptions-workspace">
      <div className="app-title-panel assumptions-title-panel">
        <div className="app-title-panel__content">
          <p className="eyebrow">Assumptions</p>
          <h2>Assumption Library</h2>
          <p className="muted">
            Base costs, feasibility levers, finance defaults, tax rules, playbooks, and validation tasks are managed as
            reusable assumptions that sites and scenarios can pull from.
          </p>
        </div>
      </div>

      <div className="cost-insight-grid">
        <div className="cost-insight-card">
          <strong>Assumption Templates</strong>
          <div>{graph.totals.assumptionTemplateCount}</div>
          <span className="muted">Reusable non-site-specific assumptions</span>
        </div>
        <div className="cost-insight-card">
          <strong>Branch Applications</strong>
          <div>{graph.totals.applicationCount}</div>
          <span className="muted">Linked into branches and scenarios</span>
        </div>
        <div className="cost-insight-card">
          <strong>Pending Validations</strong>
          <div>{graph.totals.pendingValidationCount}</div>
          <span className="muted">Owned through Project Network</span>
        </div>
        <div className="cost-insight-card">
          <strong>Base Cost Items</strong>
          <div>{portfolio.masterCostItems.length}</div>
          <span className="muted">Rate rows in the cost database</span>
        </div>
      </div>

      <div className="base-costs-mode-tabs assumptions-mode-tabs" aria-label="Assumption library sections">
        <button type="button" className={activeTab === "other" ? "is-active" : ""} onClick={() => setActiveTab("other")}>
          Other Assumptions
        </button>
        <button
          type="button"
          className={activeTab === "base-costs" ? "is-active" : ""}
          onClick={() => setActiveTab("base-costs")}
        >
          Base Costs
        </button>
        <button
          type="button"
          className={activeTab === "strategy-playbook" ? "is-active" : ""}
          onClick={() => setActiveTab("strategy-playbook")}
        >
          Strategy Playbook
        </button>
        <button
          type="button"
          className={activeTab === "developer-diary" ? "is-active" : ""}
          onClick={() => setActiveTab("developer-diary")}
        >
          Developer Diary
        </button>
      </div>

      {activeTab === "base-costs" ? (
        <BaseCostsWorkspace portfolio={portfolio} actions={actions} />
      ) : activeTab === "strategy-playbook" ? (
        <StrategyPlaybook />
      ) : activeTab === "developer-diary" ? (
        <DeveloperDiary />
      ) : (
        <div className="assumptions-library">
          <div className="assumption-library-heading app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">Available Assumptions</p>
              <h3>Reusable Assumption Categories</h3>
              <p className="muted">
                These are the assumption templates available in Supabase. Branch applications below show where templates
                have been used.
              </p>
            </div>
          </div>

          {categoryGroups.length === 0 ? (
            <div className="notice">
              No Supabase assumptions found yet. Run the assumption graph migration and seed or import assumptions to
              populate this library.
            </div>
          ) : (
            <div className="assumption-category-stack">
              {categoryGroups.map(([category, templates], index) => (
                <details className="assumption-category-panel" key={category} open={index === 0}>
                  <summary className="assumption-category-summary">
                    <span>
                      <span className="eyebrow">{category}</span>
                      <strong>{templates.length} Templates</strong>
                    </span>
                    <span className="tag">
                      {templates.filter((template) => template.enabled_for_simulation).length} simulation-ready
                    </span>
                  </summary>
                  <div className="assumption-template-list">
                    {templates.map((template) => {
                      const applications = applicationsByTemplate.get(template.id) ?? [];
                      const pendingValidations = applications.flatMap((application) =>
                        application.validations.filter((validation) => validation.status === "pending")
                      );
                      return (
                        <div className="assumption-template-row" key={template.id}>
                          <div>
                            <span className="tag">{template.impact_area}</span>
                            <h4>{template.name}</h4>
                            <p>{template.notes ?? template.evidence_requirement ?? "No notes captured."}</p>
                          </div>
                          <dl>
                            <div>
                              <dt>Value</dt>
                              <dd>{rangeLabel(template)}</dd>
                            </div>
                            <div>
                              <dt>Type</dt>
                              <dd>{template.value_type}</dd>
                            </div>
                            <div>
                              <dt>Applied</dt>
                              <dd>{applications.length}</dd>
                            </div>
                            <div>
                              <dt>Validation</dt>
                              <dd>{pendingValidations.length > 0 ? `${pendingValidations.length} pending` : "Clear"}</dd>
                            </div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}

          <AssumptionGraphPanel
            graph={graph}
            title="Branch Applications"
            eyebrow="Applied to Branches"
            description="Shows where reusable assumptions have been applied to sites, scenarios, feasibility branches, participant validations, evidence, and open actions."
            limit={8}
            actionHref={null}
          />
        </div>
      )}
    </section>
  );
}
