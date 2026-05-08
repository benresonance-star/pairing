import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCompanionStatus } from "../../lib/companion-client";
import { actionsForStatus, getChangeSets, getScenarios, transitionChangeSet } from "../../lib/demo-store";

async function moveChangeSet(formData: FormData) {
  "use server";

  try {
    const nextStatus = await transitionChangeSet(
      String(formData.get("changeSetId")),
      String(formData.get("action")) as "submit" | "approve" | "queue"
    );
    revalidatePath("/change-sets");
    revalidatePath("/");
    const scenarioId = String(formData.get("scenarioId") ?? "");
    redirect(
      `/change-sets?scenarioId=${encodeURIComponent(scenarioId)}&status=${encodeURIComponent(`Change set moved to ${nextStatus}`)}`
    );
  } catch (error) {
    const scenarioId = String(formData.get("scenarioId") ?? "");
    redirect(
      `/change-sets?scenarioId=${encodeURIComponent(scenarioId)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to move change set")}`
    );
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ChangeSetsPage({ searchParams }: PageProps) {
  const scenarios = await getScenarios();
  const params = (await searchParams) ?? {};
  const selectedScenarioId =
    (typeof params.scenarioId === "string" ? params.scenarioId : null) ??
    scenarios.find((scenario) => scenario.status === "baseline")?.id ??
    scenarios[0]?.id ??
    null;
  const selectedScenario = selectedScenarioId
    ? scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null
    : null;
  const changeSets = await getChangeSets(selectedScenarioId);
  let bridgeReachable = false;
  try {
    const companionStatus = await getCompanionStatus();
    bridgeReachable = companionStatus.bridge.reachable;
  } catch {
    bridgeReachable = false;
  }
  const status = typeof params.status === "string" ? params.status : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <section className="panel">
      <h2>Change Sets</h2>
      <p className="muted">
        Move package assignment changes through draft, submit, approve, and queue. Once queued,
        run the connector outbound command to record the `CCP_PackageID` write-back payload.
      </p>
      <p className="muted">
        Archicad bridge: <strong>{bridgeReachable ? "reachable" : "not reachable"}</strong>. Manage
        connection and run sync controls on the <Link href="/integrations/archicad">Integrations</Link>{" "}
        tab.
      </p>
      {selectedScenario ? (
        <div className="notice">
          Active scenario: <strong>{selectedScenario.name}</strong> ({selectedScenario.status})
        </div>
      ) : null}
      {status ? <div className="notice notice-success">{status}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}
      <form className="filter-row" method="get">
        <label className="filter-field">
          <span>Scenario</span>
          <select name="scenarioId" defaultValue={selectedScenarioId ?? ""}>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name} ({scenario.status})
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Switch scenario</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Items</th>
            <th>First Item</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {changeSets.map((changeSet) => (
            <tr key={changeSet.id}>
              <td>
                <div>{changeSet.title}</div>
                {changeSet.syncErrors.length > 0 ? (
                  <div className="muted">Errors: {changeSet.syncErrors.join(", ")}</div>
                ) : null}
              </td>
              <td>
                <span className="tag">{changeSet.status}</span>
              </td>
              <td>{changeSet.itemCount}</td>
              <td>
                {changeSet.firstField ? `${changeSet.firstField} -> ${changeSet.firstValue}` : "n/a"}
              </td>
              <td>{changeSet.submittedAt ?? "not submitted"}</td>
              <td>
                <div className="actions">
                  {actionsForStatus(changeSet.status).map((action) => (
                    <form key={action} action={moveChangeSet}>
                      <input type="hidden" name="changeSetId" value={changeSet.id} />
                      <input type="hidden" name="action" value={action} />
                      <input type="hidden" name="scenarioId" value={selectedScenarioId ?? ""} />
                      <button type="submit">{action}</button>
                    </form>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
