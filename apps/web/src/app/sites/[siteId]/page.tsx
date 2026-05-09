import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  archiveScenarioOption,
  archiveSite,
  createSiteScenarioOption,
  deleteScenarioOption,
  getFeasibilityPortfolio,
  updateSite,
  updateScenarioOption
} from "../../../lib/demo-store";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    throw new Error("Expected a numeric value");
  }
  return parsed;
}

function revalidateSitePaths(siteId: string) {
  revalidatePath("/");
  revalidatePath("/sites");
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/scenarios");
  revalidatePath("/feasibility");
  revalidatePath("/linear-schedule");
  revalidatePath("/integrations/archicad");
}

async function createScenarioOptionAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    const result = await createSiteScenarioOption({
      siteId,
      name: String(formData.get("name") ?? ""),
      configuration: String(formData.get("configuration") ?? ""),
      templateScenarioId: emptyToNull(formData.get("templateScenarioId")),
      masterCostTemplateId: emptyToNull(formData.get("masterCostTemplateId")),
      createDetailedScenario: formData.get("createDetailedScenario") === "on",
      dwellings: optionalNumber(formData.get("dwellings")),
      grossFloorAreaSqm: optionalNumber(formData.get("grossFloorAreaSqm")),
      planningFit: emptyToNull(formData.get("planningFit")),
      summary: emptyToNull(formData.get("summary")),
      targetMarginPercent: optionalNumber(formData.get("targetMarginPercent")),
      grossRealisation: optionalNumber(formData.get("grossRealisation"))
    });
    revalidateSitePaths(siteId);
    redirect(
      `/sites/${siteId}?status=${encodeURIComponent(
        `Scenario option created${result.scenarioId ? " with linked detailed scenario" : ""}`
      )}`
    );
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create option")}`);
  }
}

async function updateSiteAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await updateSite({
      siteId,
      name: String(formData.get("name") ?? ""),
      address: String(formData.get("address") ?? ""),
      locality: emptyToNull(formData.get("locality")),
      status: String(formData.get("status") ?? "screening"),
      currentStage: emptyToNull(formData.get("currentStage")),
      acquisitionStatus: emptyToNull(formData.get("acquisitionStatus")),
      priority: emptyToNull(formData.get("priority")),
      siteAreaSqm: optionalNumber(formData.get("siteAreaSqm")),
      summary: emptyToNull(formData.get("summary"))
    });
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Site updated")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update site")}`);
  }
}

async function archiveSiteAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await archiveSite(siteId);
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Site archived; linked feasibility data preserved")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive site")}`);
  }
}

async function updateScenarioOptionAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await updateScenarioOption({
      optionId: String(formData.get("optionId") ?? ""),
      name: String(formData.get("name") ?? ""),
      configuration: String(formData.get("configuration") ?? ""),
      status: String(formData.get("status") ?? "testing"),
      dwellings: optionalNumber(formData.get("dwellings")),
      grossFloorAreaSqm: optionalNumber(formData.get("grossFloorAreaSqm")),
      planningFit: emptyToNull(formData.get("planningFit")),
      summary: emptyToNull(formData.get("summary")),
      targetMarginPercent: optionalNumber(formData.get("targetMarginPercent"))
    });
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Scenario option updated")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update option")}`);
  }
}

async function archiveScenarioOptionAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await archiveScenarioOption(String(formData.get("optionId") ?? ""));
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Scenario option archived")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive option")}`);
  }
}

async function deleteScenarioOptionAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await deleteScenarioOption(String(formData.get("optionId") ?? ""));
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Scenario option deleted")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete option")}`);
  }
}

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

function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}

export default async function SiteDetailPage({ params, searchParams }: PageProps) {
  const { siteId } = await params;
  const portfolio = await getFeasibilityPortfolio();
  const site = portfolio.sites.find((item) => item.id === siteId) ?? null;
  const query = (await searchParams) ?? {};
  const status = typeof query.status === "string" ? query.status : null;
  const error = typeof query.error === "string" ? query.error : null;

  if (!site) {
    notFound();
  }

  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{site.name}</h2>
            <p className="muted">
              {site.address}
              {site.locality ? `, ${site.locality}` : ""}
            </p>
          </div>
          <Link className="secondary-link" href="/sites">
            Back to sites
          </Link>
        </div>
        <p>{site.summary}</p>
        {status ? <div className="notice notice-success">{status}</div> : null}
        {error ? <div className="notice notice-error">{error}</div> : null}
        <div className="detail-grid">
          <div className="detail-card">
            <strong>Status</strong>
            <div>{site.status}</div>
          </div>
          <div className="detail-card">
            <strong>Stage</strong>
            <div>{site.currentStage ?? "n/a"}</div>
          </div>
          <div className="detail-card">
            <strong>Acquisition</strong>
            <div>{site.acquisitionStatus ?? "n/a"}</div>
          </div>
          <div className="detail-card">
            <strong>Site Area</strong>
            <div>{formatNumber(site.siteAreaSqm, " sqm")}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Edit Site</h2>
        <form action={updateSiteAction} className="stack-form">
          <input type="hidden" name="siteId" value={site.id} />
          <div className="form-grid">
            <label>
              <span>Name</span>
              <input name="name" defaultValue={site.name} />
            </label>
            <label>
              <span>Address</span>
              <input name="address" defaultValue={site.address} />
            </label>
            <label>
              <span>Locality</span>
              <input name="locality" defaultValue={site.locality ?? ""} />
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={site.status}>
                <option value="screening">screening</option>
                <option value="shortlisted">shortlisted</option>
                <option value="under_option">under option</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label>
              <span>Stage</span>
              <input name="currentStage" defaultValue={site.currentStage ?? ""} />
            </label>
            <label>
              <span>Acquisition</span>
              <input name="acquisitionStatus" defaultValue={site.acquisitionStatus ?? ""} />
            </label>
            <label>
              <span>Priority</span>
              <input name="priority" defaultValue={site.priority ?? ""} />
            </label>
            <label>
              <span>Site area sqm</span>
              <input name="siteAreaSqm" type="number" step="0.1" defaultValue={site.siteAreaSqm ?? ""} />
            </label>
            <label>
              <span>Summary</span>
              <input name="summary" defaultValue={site.summary ?? ""} />
            </label>
          </div>
          <div className="inline-actions">
            <button type="submit">Save Site</button>
          </div>
        </form>
        <form action={archiveSiteAction} className="inline-form" style={{ marginTop: 12 }}>
          <input type="hidden" name="siteId" value={site.id} />
          <button type="submit" className="danger-button">Archive Site</button>
          <span className="muted">Preserves scenario options, cost plans, sales assumptions, and Archicad links.</span>
        </form>
      </section>

      <section className="panel">
        <h2>Planning and Site Constraints</h2>
        {site.constraints.length === 0 ? (
          <p className="muted">No constraints have been recorded for this site.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Constraint</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Authority</th>
              </tr>
            </thead>
            <tbody>
              {site.constraints.map((constraint) => (
                <tr key={constraint.id}>
                  <td>
                    <span className="tag">{constraint.category}</span>
                  </td>
                  <td>
                    <strong>{constraint.title}</strong>
                    <div className="muted">{constraint.description}</div>
                  </td>
                  <td>{constraint.severity}</td>
                  <td>{constraint.status ?? "n/a"}</td>
                  <td>{constraint.authority ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Create Scenario Option</h2>
        <p className="muted">
          Start from a reusable scenario template and optional master cost template, then instantiate an active
          site-linked option.
        </p>
        <form action={createScenarioOptionAction} className="stack-form">
          <input type="hidden" name="siteId" value={site.id} />
          <div className="form-grid">
            <label>
              <span>Option name</span>
              <input name="name" placeholder="3 Townhouse Premium" />
            </label>
            <label>
              <span>Configuration</span>
              <input name="configuration" placeholder="3 townhouse" />
            </label>
            <label>
              <span>Scenario template</span>
              <select name="templateScenarioId" defaultValue={portfolio.scenarioTemplates[0]?.id ?? ""}>
                {portfolio.scenarioTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Master cost template</span>
              <select name="masterCostTemplateId" defaultValue={portfolio.masterCostTemplates[0]?.id ?? ""}>
                <option value="">No cost template</option>
                {portfolio.masterCostTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Dwellings</span>
              <input name="dwellings" type="number" min="0" />
            </label>
            <label>
              <span>Gross floor area sqm</span>
              <input name="grossFloorAreaSqm" type="number" min="0" step="0.1" />
            </label>
            <label>
              <span>Gross realisation</span>
              <input name="grossRealisation" type="number" min="0" />
            </label>
            <label>
              <span>Target margin %</span>
              <input name="targetMarginPercent" type="number" min="0" step="0.1" />
            </label>
            <label>
              <span>Planning fit</span>
              <input name="planningFit" placeholder="strong / moderate / risky" />
            </label>
            <label>
              <span>Summary</span>
              <input name="summary" placeholder="Why this option is worth testing" />
            </label>
          </div>
          <label className="inline-check">
            <input name="createDetailedScenario" type="checkbox" defaultChecked /> Create linked detailed scenario
          </label>
          <button type="submit">Create Site Scenario Option</button>
        </form>
      </section>

      <section className="panel">
        <h2>Scenario Options</h2>
        <div className="scenario-option-grid">
          {site.scenarioOptions.map((option) => {
            const midBand = option.costBands.find((band) => band.range_key === "mid");
            return (
              <article className="detail-card" key={option.id}>
                <div className="section-heading">
                  <div>
                    <h3>{option.name}</h3>
                    <p className="muted">{option.summary}</p>
                  </div>
                  <span className="tag">{option.status}</span>
                </div>
                <div className="detail-grid">
                  <div>
                    <strong>Configuration</strong>
                    <div>{option.configuration}</div>
                  </div>
                  <div>
                    <strong>Dwellings</strong>
                    <div>{option.dwellings ?? "n/a"}</div>
                  </div>
                  <div>
                    <strong>GFA</strong>
                    <div>{formatNumber(option.gross_floor_area_sqm, " sqm")}</div>
                  </div>
                  <div>
                    <strong>Planning Fit</strong>
                    <div>{option.planning_fit ?? "n/a"}</div>
                  </div>
                  <div>
                    <strong>Mid Cost</strong>
                    <div>{formatCurrency(midBand?.totalCost)}</div>
                  </div>
                  <div>
                    <strong>Revenue</strong>
                    <div>{formatCurrency(option.salesAssumption?.gross_realisation)}</div>
                  </div>
                  <div>
                    <strong>Mid Margin</strong>
                    <div>{formatPercent(midBand?.marginPercent)}</div>
                  </div>
                  <div>
                    <strong>Target Margin</strong>
                    <div>{formatPercent(option.target_margin_percent)}</div>
                  </div>
                  <div>
                    <strong>Scenario Template</strong>
                    <div>{option.templateScenarioName ?? "not set"}</div>
                  </div>
                  <div>
                    <strong>Master Cost Template</strong>
                    <div>{option.masterCostTemplate?.name ?? "not set"}</div>
                  </div>
                  <div>
                    <strong>Cost Plan Items</strong>
                    <div>{option.costPlanItems.length}</div>
                  </div>
                </div>
                <details className="detail-panel">
                  <summary>Edit option</summary>
                  <form action={updateScenarioOptionAction} className="stack-form">
                    <input type="hidden" name="siteId" value={site.id} />
                    <input type="hidden" name="optionId" value={option.id} />
                    <div className="form-grid">
                      <label>
                        <span>Name</span>
                        <input name="name" defaultValue={option.name} />
                      </label>
                      <label>
                        <span>Configuration</span>
                        <input name="configuration" defaultValue={option.configuration} />
                      </label>
                      <label>
                        <span>Status</span>
                        <select name="status" defaultValue={option.status}>
                          <option value="preferred">preferred</option>
                          <option value="testing">testing</option>
                          <option value="screening">screening</option>
                          <option value="archived">archived</option>
                        </select>
                      </label>
                      <label>
                        <span>Dwellings</span>
                        <input name="dwellings" type="number" defaultValue={option.dwellings ?? ""} />
                      </label>
                      <label>
                        <span>GFA sqm</span>
                        <input name="grossFloorAreaSqm" type="number" step="0.1" defaultValue={option.gross_floor_area_sqm ?? ""} />
                      </label>
                      <label>
                        <span>Planning fit</span>
                        <input name="planningFit" defaultValue={option.planning_fit ?? ""} />
                      </label>
                      <label>
                        <span>Target margin %</span>
                        <input name="targetMarginPercent" type="number" step="0.1" defaultValue={option.target_margin_percent ?? ""} />
                      </label>
                      <label>
                        <span>Summary</span>
                        <input name="summary" defaultValue={option.summary ?? ""} />
                      </label>
                    </div>
                    <button type="submit">Save Option</button>
                  </form>
                </details>
                {option.costPlanItems.length > 0 ? (
                  <details className="detail-panel">
                    <summary>Cost plan links</summary>
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Item</th>
                          <th>Granularity</th>
                          <th>Basis</th>
                          <th>Linked Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {option.costPlanItems.map((item) => (
                          <tr key={item.id}>
                            <td>{item.cost_code}</td>
                            <td>{item.title}</td>
                            <td>{item.estimate_granularity}</td>
                            <td>
                              {item.quantity} {item.unit} @ {formatCurrency(item.rate)}
                            </td>
                            <td>
                              {item.linked_target_type && item.linked_target_ref
                                ? `${item.linked_target_type}: ${item.linked_target_ref}`
                                : "not linked"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : null}
                <div className="inline-actions">
                  {option.linkedScenarioName && option.scenario_id ? (
                    <Link href={`/scenarios/${option.scenario_id}`}>Open scenario editor</Link>
                  ) : (
                    <span className="muted">No detailed scenario linked yet</span>
                  )}
                  {option.scheduleSummary.activityCount > 0 && option.scenario_id ? (
                    <Link href={`/linear-schedule?scenarioId=${option.scenario_id}&siteId=${site.id}`}>Open Gantt</Link>
                  ) : null}
                  {option.archicadLink ? <Link href="/integrations/archicad">Open Archicad link</Link> : null}
                  <form action={archiveScenarioOptionAction}>
                    <input type="hidden" name="siteId" value={site.id} />
                    <input type="hidden" name="optionId" value={option.id} />
                    <button type="submit" className="secondary-button">Archive</button>
                  </form>
                  <form action={deleteScenarioOptionAction}>
                    <input type="hidden" name="siteId" value={site.id} />
                    <input type="hidden" name="optionId" value={option.id} />
                    <button type="submit" className="danger-button">Delete</button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
