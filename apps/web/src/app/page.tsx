import Link from "next/link";

import { getCompanionStatus } from "../lib/companion-client";
import { getDashboardSummary, getRecentWrites } from "../lib/demo-store";

export default async function HomePage() {
  const [summary, writes] = await Promise.all([getDashboardSummary(), getRecentWrites()]);
  let companionReachable = false;
  let bridgeReachable = false;

  try {
    const companionStatus = await getCompanionStatus();
    companionReachable = true;
    bridgeReachable = companionStatus.bridge.reachable;
  } catch {
    companionReachable = false;
  }

  return (
    <>
      <section className="card-grid">
        <div className="card">
          <strong>Project</strong>
          <div>{summary.projectName}</div>
        </div>
        <div className="card">
          <strong>Selected Sites</strong>
          <div>{summary.siteCount}</div>
        </div>
        <div className="card">
          <strong>Scenario Options</strong>
          <div>{summary.scenarioOptionCount}</div>
        </div>
        <div className="card">
          <strong>Zones</strong>
          <div>{summary.zoneCount}</div>
        </div>
        <div className="card">
          <strong>Model Objects</strong>
          <div>{summary.modelObjectCount}</div>
        </div>
        <div className="card">
          <strong>Scenarios</strong>
          <div>{summary.scenarioCount}</div>
        </div>
        <div className="card">
          <strong>Draft Change Sets</strong>
          <div>{summary.draftCount}</div>
        </div>
        <div className="card">
          <strong>Queued Change Sets</strong>
          <div>{summary.queuedCount}</div>
        </div>
        <div className="card">
          <strong>Sync Failures</strong>
          <div>{summary.syncFailureCount}</div>
        </div>
        <div className="card">
          <strong>Recorded Write Field</strong>
          <div>{summary.writableArchicadField}</div>
        </div>
      </section>

      <section className="panel">
        <h2>Feasibility Workflow</h2>
        <p className="muted">
          Review selected sites, compare planning constraints and scenario options, then connect
          feasible options to detailed schedules, package state, and Archicad model data.
        </p>
        <p>
          Start at <Link href="/sites">Sites</Link> for the site list or open{" "}
          <Link href="/feasibility">Feasibility</Link> to compare low, mid, high, and other cost bands.{" "}
          Use <Link href="/project-network">Project Network</Link> to route planning, cost, sales,
          authority, and agentic questions into reviewable inquiries and work products.
        </p>
      </section>

      <section className="panel">
        <h2>Live Integration</h2>
        <p>
          Companion: <strong>{companionReachable ? "online" : "offline"}</strong> | Bridge:{" "}
          <strong>{bridgeReachable ? "reachable" : "not reachable"}</strong>. Open{" "}
          <Link href="/integrations/archicad">Integrations</Link> to connect/disconnect and run
          inbound/outbound controls from the UI.
        </p>
      </section>

      <section className="panel">
        <h2>Construction Control Workflow</h2>
        <ol>
          <li>Select a site and compare its scenario options.</li>
          <li>Open the linked scenario editor or <Link href="/linear-schedule">Linear Schedule</Link> for Gantt timing.</li>
          <li>Use <Link href="/objects">Objects</Link> and <Link href="/change-sets">Change Sets</Link> for governed construction updates.</li>
          <li>Use <Link href="/integrations/archicad">Integrations</Link> to refresh Archicad GUID, element, and assembly context.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>Recent Recorded Archicad Writes</h2>
        {writes.length === 0 ? (
          <p className="muted">No outbound writes recorded yet.</p>
        ) : (
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
        )}
      </section>
    </>
  );
}
