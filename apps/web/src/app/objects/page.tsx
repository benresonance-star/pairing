import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createPackageAssignmentChangeSet, getObjects, getPackages, getScenarios } from "../../lib/demo-store";

async function draftPackageAssignment(formData: FormData) {
  "use server";

  try {
    const result = await createPackageAssignmentChangeSet({
      objectRefType: formData.get("objectRefType") as "zone" | "model_object",
      objectRefId: String(formData.get("objectRefId")),
      packageId: String(formData.get("packageId")),
      scenarioId: String(formData.get("scenarioId") ?? "")
    });

    revalidatePath("/objects");
    revalidatePath("/change-sets");
    revalidatePath("/");
    const scenarioId = String(formData.get("scenarioId") ?? "");
    redirect(
      `/objects?scenarioId=${encodeURIComponent(scenarioId)}&status=${encodeURIComponent(`Draft created for ${result.targetLabel}`)}`
    );
  } catch (error) {
    const scenarioId = String(formData.get("scenarioId") ?? "");
    redirect(
      `/objects?scenarioId=${encodeURIComponent(scenarioId)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create draft change set")}`
    );
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ObjectsPage({ searchParams }: PageProps) {
  const scenarios = await getScenarios();
  const packages = await getPackages();
  const params = (await searchParams) ?? {};
  const selectedScenarioId =
    (typeof params.scenarioId === "string" ? params.scenarioId : null) ??
    scenarios.find((scenario) => scenario.status === "baseline")?.id ??
    scenarios[0]?.id ??
    null;
  const selectedScenario = selectedScenarioId
    ? scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null
    : null;
  const objects = await getObjects(selectedScenarioId);
  const status = typeof params.status === "string" ? params.status : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <section className="panel">
      <h2>Objects And Zones</h2>
      <p className="muted">
        Draft a package assignment change set for any synced zone or first-slice model object.
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
            <th>Type</th>
            <th>Label</th>
            <th>Storey</th>
            <th>Zone Key</th>
            <th>Current Package</th>
            <th>Construction State</th>
            <th>Draft Package Change</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((object) => (
            (() => {
              const availablePackages = packages.filter(
                (pkg) => pkg.package_id !== object.currentPackageId
              );
              return (
                <tr key={object.id}>
                  <td>
                    <span className="tag">{object.objectRefType}</span>
                  </td>
                  <td>{object.label}</td>
                  <td>{object.storey}</td>
                  <td>{object.zoneKey}</td>
                  <td>{object.currentPackageId ?? "unassigned"}</td>
                  <td>{object.constructionState ?? "unset"}</td>
                  <td>
                    {availablePackages.length === 0 ? (
                      <span className="muted">No alternate package available</span>
                    ) : (
                      <form action={draftPackageAssignment} className="inline-form">
                        <input type="hidden" name="objectRefType" value={object.objectRefType} />
                        <input type="hidden" name="objectRefId" value={object.id} />
                        <input type="hidden" name="scenarioId" value={selectedScenarioId ?? ""} />
                        <select name="packageId" defaultValue="">
                          <option value="" disabled>
                            Select package
                          </option>
                          {availablePackages.map((pkg) => (
                            <option key={pkg.id} value={pkg.package_id}>
                              {pkg.package_id}
                            </option>
                          ))}
                        </select>
                        <button type="submit">Create Draft</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })()
          ))}
        </tbody>
      </table>
    </section>
  );
}
