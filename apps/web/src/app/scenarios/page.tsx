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
        <div className="section-heading app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Scenario Library</p>
            <h2>Options / Scenarios</h2>
            <p className="muted">
              Scenarios are site options with feasibility evidence, schedule planning, operational overlays,
              and review context. Use templates as starting points, but make decisions from site-linked scenarios.
            </p>
          </div>
          <Link className="secondary-link" href="/feasibility">
            Compare feasibility
          </Link>
        </div>
      </section>

      <section className="panel">
        <div className="app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Reusable Starts</p>
            <h2>Scenario Templates</h2>
            <p className="muted">
              Reusable scenario templates are not tied to one site. Use them as starting points when creating
              site scenario options from the Sites tab.
            </p>
          </div>
        </div>
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
        <div className="app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Template Catalogue</p>
            <h2>Templates</h2>
          </div>
        </div>
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
        <div className="app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Active Options</p>
            <h2>Active Site-Linked Scenarios</h2>
          </div>
        </div>
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
                <th>Feasibility</th>
                <th>Operational Rows</th>
                <th>Review / Approvals</th>
              </tr>
            </thead>
            <tbody>
              {activeSiteScenarios.map((scenario) => {
                const link = scenarioOptionByScenarioId.get(scenario.id)!;
                const midBand = link.option.costBands.find((band) => band.range_key === "mid");
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
                    <td>
                      {formatPercent(midBand?.marginPercent)}
                      <div className="muted">{formatCurrency(midBand?.totalCost)} mid cost</div>
                    </td>
                    <td>{scenario.operationalStateCount}</td>
                    <td>
                      <Link href={`/project-network?linkedRefType=scenario&linkedRefId=${scenario.id}`}>network</Link>
                      <div className="muted">{scenario.changeSetCount} model approvals</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Legacy Workspace</p>
            <h2>Operational / Legacy Scenarios</h2>
            <p className="muted">
              These scenarios are not linked to a site option. Keep them only as old operational baselines or clone sources.
            </p>
          </div>
        </div>
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
