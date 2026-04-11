import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createScenario, getScenarios } from "../../lib/demo-store";

async function submitScenario(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "");
  const sourceScenarioId = String(formData.get("sourceScenarioId") ?? "");

  try {
    const result = await createScenario({
      name,
      sourceScenarioId: sourceScenarioId.length > 0 ? sourceScenarioId : null
    });
    revalidatePath("/");
    revalidatePath("/scenarios");
    revalidatePath("/objects");
    revalidatePath("/change-sets");
    revalidatePath("/linear-schedule");
    redirect(`/scenarios/${result.scenarioId}?status=${encodeURIComponent(`Scenario created: ${result.scenarioId}`)}`);
  } catch (error) {
    redirect(`/scenarios?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create scenario")}`);
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ScenariosPage({ searchParams }: PageProps) {
  const scenarios = await getScenarios();
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : null;
  const error = typeof params.error === "string" ? params.error : null;
  const baselineScenario = scenarios.find((scenario) => scenario.status === "baseline") ?? scenarios[0] ?? null;

  return (
    <>
      <section className="panel">
        <h2>Scenarios</h2>
        <p className="muted">
          Establish a baseline, then create draft scenario clones for alternative sequencing and
          package-assignment decisions without duplicating model identity tables.
        </p>
        {status ? <div className="notice notice-success">{status}</div> : null}
        {error ? <div className="notice notice-error">{error}</div> : null}

        <form action={submitScenario} className="filter-row">
          <label className="filter-field">
            <span>Scenario name</span>
            <input name="name" type="text" placeholder={scenarios.length === 0 ? "Baseline" : "Recovery Plan"} />
          </label>
          {scenarios.length > 0 ? (
            <label className="filter-field">
              <span>Clone from</span>
              <select name="sourceScenarioId" defaultValue={baselineScenario?.id ?? ""}>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name} ({scenario.status})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="submit">{scenarios.length === 0 ? "Create Baseline" : "Create Draft Scenario"}</button>
        </form>
      </section>

      <section className="panel">
        <h2>Existing Scenarios</h2>
        {scenarios.length === 0 ? (
          <p className="muted">No scenarios exist yet. Create a baseline to establish scenario-scoped state.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Parent</th>
                <th>Operational Rows</th>
                <th>Change Sets</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <td>
                    <Link href={`/scenarios/${scenario.id}`}>{scenario.name}</Link>
                  </td>
                  <td>
                    <span className="tag">{scenario.status}</span>
                  </td>
                  <td>{scenario.parentScenarioId ?? "none"}</td>
                  <td>{scenario.operationalStateCount}</td>
                  <td>{scenario.changeSetCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
