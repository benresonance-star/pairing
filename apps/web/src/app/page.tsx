import Link from "next/link";

import { getDashboardSummary, getRecentWrites } from "../lib/demo-store";

export default async function HomePage() {
  const summary = await getDashboardSummary();
  const writes = await getRecentWrites();

  return (
    <>
      <section className="card-grid">
        <div className="card">
          <strong>Project</strong>
          <div>{summary.projectName}</div>
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
        <h2>Scenario Management</h2>
        <p className="muted">
          Manage baseline and draft scenarios, then switch workflow pages to operate against the
          intended scenario rather than always assuming baseline.
        </p>
        <p>
          Open the <Link href="/scenarios">Scenarios</Link> page to create a draft clone and inspect
          scenario-specific change-set and operational counts.
        </p>
      </section>

      <section className="panel">
        <h2>First Slice Workflow</h2>
        <ol>
          <li>Run the connector inbound command to populate zones and selected elements.</li>
          <li>Open the <Link href="/objects">Objects</Link> page and draft package assignments.</li>
          <li>Use the <Link href="/change-sets">Change Sets</Link> page to submit, approve, and queue them.</li>
          <li>Run the connector outbound command to record the Archicad write-back payloads.</li>
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
