import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createScenario, createScenarioTemplate, getFeasibilityPortfolio, getScenarios } from "../../lib/demo-store";

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

async function submitScenarioTemplate(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "");
  const sourceScenarioId = String(formData.get("sourceScenarioId") ?? "");

  try {
    const result = await createScenarioTemplate({
      name,
      sourceScenarioId: sourceScenarioId.length > 0 ? sourceScenarioId : null
    });
    revalidatePath("/");
    revalidatePath("/scenarios");
    revalidatePath("/sites");
    revalidatePath("/feasibility");
    redirect(`/scenarios?status=${encodeURIComponent(`Template created: ${result.scenarioId}`)}`);
  } catch (error) {
    redirect(`/scenarios?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create template")}`);
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ScenariosPage({ searchParams }: PageProps) {
  const [scenarios, portfolio] = await Promise.all([getScenarios(), getFeasibilityPortfolio()]);
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : null;
  const error = typeof params.error === "string" ? params.error : null;
  const baselineScenario = scenarios.find((scenario) => scenario.status === "baseline") ?? scenarios[0] ?? null;
  const scenarioOptionByScenarioId = new Map(
    portfolio.sites.flatMap((site) =>
      site.scenarioOptions
        .filter((option) => option.scenario_id)
        .map((option) => [option.scenario_id!, { site, option }] as const)
    )
  );
  const templates = scenarios.filter((scenario) => scenario.scenarioKind === "template" || scenario.status === "template");
  const activeSiteScenarios = scenarios.filter((scenario) => scenarioOptionByScenarioId.has(scenario.id));
  const unlinkedScenarios = scenarios.filter(
    (scenario) => !scenarioOptionByScenarioId.has(scenario.id) && scenario.scenarioKind !== "template" && scenario.status !== "template"
  );

  return (
    <>
      <section className="panel">
        <h2>Scenario Templates</h2>
        <p className="muted">
          Reusable scenario templates are not tied to one site. Use them as starting points when creating
          site scenario options from the Sites tab.
        </p>
        {status ? <div className="notice notice-success">{status}</div> : null}
        {error ? <div className="notice notice-error">{error}</div> : null}

        <form action={submitScenarioTemplate} className="filter-row">
          <label className="filter-field">
            <span>Template name</span>
            <input name="name" type="text" placeholder="Template - 3 Townhouse Standard" />
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
          <button type="submit">Create Template</button>
        </form>
      </section>

      <section className="panel">
        <h2>Templates</h2>
        {templates.length === 0 ? (
          <p className="muted">No scenario templates exist yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Parent</th>
                <th>Operational Rows</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((scenario) => (
                <tr key={scenario.id}>
                  <td>
                    <Link href={`/scenarios/${scenario.id}`}>{scenario.name}</Link>
                  </td>
                  <td>
                    <span className="tag">{scenario.status}</span>
                  </td>
                  <td>{scenario.parentScenarioId ?? "none"}</td>
                  <td>{scenario.operationalStateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Active Site Scenarios</h2>
        {activeSiteScenarios.length === 0 ? (
          <p className="muted">No active site-linked scenarios exist yet. Create them from a site detail page.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Site Option</th>
                <th>Template</th>
                <th>Status</th>
                <th>Operational Rows</th>
                <th>Change Sets</th>
              </tr>
            </thead>
            <tbody>
              {activeSiteScenarios.map((scenario) => {
                const link = scenarioOptionByScenarioId.get(scenario.id)!;
                return (
                  <tr key={scenario.id}>
                    <td>
                      <Link href={`/scenarios/${scenario.id}`}>{scenario.name}</Link>
                    </td>
                    <td>
                      <Link href={`/sites/${link.site.id}`}>{link.option.name}</Link>
                      <div className="muted">{link.site.name}</div>
                    </td>
                    <td>{link.option.templateScenarioName ?? scenario.templateScenarioId ?? "not set"}</td>
                    <td>
                      <span className="tag">{scenario.status}</span>
                    </td>
                    <td>{scenario.operationalStateCount}</td>
                    <td>{scenario.changeSetCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Operational / Legacy Scenarios</h2>
        <p className="muted">
          These scenarios are not linked to a site option. Keep them only as old operational baselines or clone sources.
        </p>
        {unlinkedScenarios.length === 0 ? (
          <p className="muted">No unlinked scenarios.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {unlinkedScenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <td>
                    <Link href={`/scenarios/${scenario.id}`}>{scenario.name}</Link>
                  </td>
                  <td>{scenario.scenarioKind}</td>
                  <td>
                    <span className="tag">{scenario.status}</span>
                  </td>
                  <td>
                    <form action={submitScenario} className="inline-form">
                      <input type="hidden" name="sourceScenarioId" value={scenario.id} />
                      <input name="name" placeholder={`${scenario.name} copy`} />
                      <button type="submit">Create Legacy Clone</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
