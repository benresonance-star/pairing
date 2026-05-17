import Link from "next/link";

import { getDataSourceMode } from "../lib/data-source";
import { getCompanionStatus } from "../lib/companion-client";
import {
  getAssumptionGraphData,
  getDashboardSummary,
  getOverviewActionTasks,
  getPinnedScenarioOptions,
  getRecentWrites
} from "../lib/demo-store";
import { AssumptionGraphPanel } from "./assumption-graph-panel";
import { OverviewActionTaskList } from "./overview-action-task-list";
import {
  createOverviewActionTaskAction,
  deleteOverviewActionTaskAction,
  reorderOverviewActionTasksAction,
  updateOverviewActionTaskAction
} from "./overview-action-tasks-actions";

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}

export default async function HomePage() {
  const [summary, writes, pinnedScenarios, assumptionGraph] = await Promise.all([
    getDashboardSummary(),
    getRecentWrites(),
    getPinnedScenarioOptions(),
    getAssumptionGraphData()
  ]);
  let companionReachable = false;
  let bridgeReachable = false;

  try {
    const companionStatus = await getCompanionStatus();
    companionReachable = true;
    bridgeReachable = companionStatus.bridge.reachable;
  } catch {
    companionReachable = false;
  }
  const archicadConnected = companionReachable && bridgeReachable;
  const metricCards = [
    {
      label: "Sites",
      value: summary.siteCount,
      detail: "Opportunity pipeline"
    },
    {
      label: "Scenario Options",
      value: summary.scenarioOptionCount,
      detail: `${summary.scenarioCount} detailed scenarios`
    },
    {
      label: "Model Inventory",
      value: summary.modelObjectCount,
      detail: `${summary.zoneCount} zones linked`
    },
    {
      label: "Draft Approvals",
      value: summary.draftCount,
      detail: "Model metadata changes"
    },
    {
      label: "Queued Approvals",
      value: summary.queuedCount,
      detail: `${summary.syncRunCount} sync runs recorded`
    },
    {
      label: "Sync Failures",
      value: summary.syncFailureCount,
      detail: "Need review before push",
      tone: summary.syncFailureCount > 0 ? "risk" : "ok"
    }
  ];
  const taskMode = getDataSourceMode() === "supabase" ? "supabase" : "demo";
  const actionTasks = await getOverviewActionTasks({
    siteCount: summary.siteCount,
    queuedCount: summary.queuedCount,
    syncFailureCount: summary.syncFailureCount
  });

  return (
    <div className="overview-dashboard">
      <section className="overview-hero app-title-panel app-title-panel--grid">
        <div className="app-title-panel__content">
          <p className="eyebrow">Overview Command Center</p>
          <h2>Project Alpha</h2>
          <p>
            Decide which sites and scenarios are worth advancing, keep feasibility evidence in view,
            and push only approved model metadata through Archicad Connect.
          </p>
          <div className="overview-hero-actions">
            <Link className="outline-link" href="/sites">Open Sites</Link>
            <Link className="outline-link" href="/feasibility">Compare Feasibility</Link>
            <Link className="outline-link" href="/project-network">Project Network</Link>
            <Link className="outline-link" href="/integrations/archicad">Archicad Sync</Link>
          </div>
        </div>
        <aside className={`overview-archicad-alert ${archicadConnected ? "overview-archicad-alert--connected" : "overview-archicad-alert--offline"}`}>
          <span>{archicadConnected ? "Connected" : "Not Connected"}</span>
          <strong>{archicadConnected ? "Archicad instance reachable" : "No Archicad instance reachable"}</strong>
          <p>
            Companion {companionReachable ? "online" : "offline"} · Bridge{" "}
            {bridgeReachable ? "reachable" : "not reachable"}
          </p>
        </aside>
      </section>

      <section className="overview-metric-grid" aria-label="Dashboard metrics">
        {metricCards.map((metric) => (
          <article className={`overview-metric-card ${metric.tone ? `overview-metric-card--${metric.tone}` : ""}`} key={metric.label}>
            <strong>{metric.label}</strong>
            <div>{metric.value}</div>
            <span>{metric.detail}</span>
          </article>
        ))}
      </section>

      <div className="overview-main-grid">
        <section className="overview-panel overview-panel--wide">
          <div className="overview-panel-title app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">Pinned Scenarios</p>
              <h2>Most Promising Options</h2>
            </div>
            <Link className="site-mini-action" href="/feasibility">View Feasibility</Link>
          </div>
          {pinnedScenarios.length === 0 ? (
            <p className="muted">No promising scenarios have been pinned yet. Pin options from scenario review to surface them here.</p>
          ) : (
            <div className="overview-pinned-grid">
              {pinnedScenarios.map(({ site, option, pinnedReason }) => {
                const midBand = option.costBands.find((band) => band.range_key === "mid");
                const scenarioHref = option.scenario_id ? `/scenarios/${option.scenario_id}` : `/sites/${site.id}`;
                return (
                  <article className="overview-pinned-card" key={option.id}>
                    <div className="overview-pinned-card-head">
                      <div className="overview-pinned-card-titles">
                        <h3>{option.name}</h3>
                      </div>
                      <span className="tag overview-pinned-status">{option.status}</span>
                    </div>
                    <p>{pinnedReason ?? option.summary ?? "Pinned as a promising feasibility option."}</p>
                    <div className="overview-scenario-metrics">
                      <span><strong>Config</strong>{option.configuration}</span>
                      <span><strong>Margin</strong>{formatPercent(midBand?.marginPercent)}</span>
                      <span><strong>Mid Cost</strong>{formatCurrency(midBand?.totalCost)}</span>
                      <span><strong>Planning</strong>{option.planning_fit ?? "n/a"}</span>
                    </div>
                    <div className="overview-card-actions">
                      <Link href={scenarioHref}>Open Scenario</Link>
                      <Link href={`/project-network?linkedRefType=scenario_option&linkedRefId=${option.id}`}>Review Network</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="overview-panel">
          <div className="overview-panel-title app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">Next Actions</p>
              <h2>Action Task List</h2>
            </div>
          </div>
          <OverviewActionTaskList
            mode={taskMode}
            initialTasks={actionTasks}
            createTaskAction={createOverviewActionTaskAction}
            updateTaskAction={updateOverviewActionTaskAction}
            deleteTaskAction={deleteOverviewActionTaskAction}
            reorderTasksAction={reorderOverviewActionTasksAction}
          />
        </section>

        <section className="overview-panel">
          <div className="overview-panel-title app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">Workflow</p>
              <h2>Decision To Sync</h2>
            </div>
          </div>
          <div className="overview-workflow-grid">
            {[
              ["Decide", "Choose the site and scenario option worth advancing."],
              ["Evidence", "Attach cost, schedule, planning, and resource context."],
              ["Review", "Use Project Network for assumptions, risks, and sign-off."],
              ["Sync", `Approve ${summary.writableArchicadField} updates and push model metadata.`]
            ].map(([label, detail]) => (
              <div className="overview-workflow-step" key={label}>
                <strong>{label}</strong>
                <span>{detail}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="overview-panel">
          <AssumptionGraphPanel
            graph={assumptionGraph}
            title="Assumption Graph"
            description="Open validations and actions generated from reusable base-data assumptions."
            compact
            limit={4}
          />
        </section>

        <section className="overview-panel overview-panel--wide">
          <div className="overview-panel-title app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">Archicad Audit</p>
              <h2>Recent Recorded Writes</h2>
            </div>
            <Link className="site-mini-action" href="/integrations/archicad">Open Sync</Link>
          </div>
          {writes.length === 0 ? (
            <p className="muted">No outbound writes recorded yet.</p>
          ) : (
            <div className="overview-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>GUID</th>
                    <th>Field</th>
                    <th>Value</th>
                    <th>Change Set</th>
                  </tr>
                </thead>
                <tbody>
                  {writes.map((write) => (
                    <tr key={String(write.applied_at)}>
                      <td>{String(write.archicad_guid ?? "unknown")}</td>
                      <td>{String(write.field_name)}</td>
                      <td>{String(write.field_value)}</td>
                      <td>{String(write.change_set_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
