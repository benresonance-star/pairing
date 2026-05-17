import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSite, getFeasibilityPortfolio } from "../../lib/demo-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    throw new Error("Expected a numeric value");
  }
  return parsed;
}

async function createSiteAction(formData: FormData) {
  "use server";

  try {
    const result = await createSite({
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
    revalidatePath("/");
    revalidatePath("/sites");
    revalidatePath("/feasibility");
    redirect(`/sites/${result.siteId}?status=${encodeURIComponent("Site created")}`);
  } catch (error) {
    redirect(`/sites?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create site")}`);
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

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}

function readTextParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function readShowArchivedFlag(value: string | string[] | undefined): boolean {
  const text = readTextParam(value);
  return text === "1" || text === "true" || text === "yes";
}

export default async function SitesPage({ searchParams }: PageProps) {
  const portfolio = await getFeasibilityPortfolio();
  const params = (await searchParams) ?? {};
  const error = readTextParam(params.error);
  const showCreateSite = readTextParam(params.create) === "site";
  const showArchivedSites = readShowArchivedFlag(params.showArchived);
  const activeSites = portfolio.sites.filter((site) => site.status !== "archived");
  const archivedSites = portfolio.sites.filter((site) => site.status === "archived");
  const activeOptionCount = activeSites.reduce((total, site) => total + site.scenarioOptions.length, 0);

  return (
    <div className="sites-dashboard">
      <section className="sites-page-head app-title-panel">
        <div className="app-title-panel__content">
          <p className="eyebrow">Site Pipeline</p>
          <h2 className="sites-page-title">Sites</h2>
          <p>Track active sites, scenario options, acquisition stage, and feasibility signals in one place.</p>
        </div>
        <div className="sites-page-head-actions">
          {showCreateSite ? (
            <Link className="outline-link" href="/sites">
              Hide create form
            </Link>
          ) : (
            <Link className="outline-link" href="/sites?create=site">
              Add new site
            </Link>
          )}
        </div>
      </section>

      <section className="sites-metric-grid" aria-label="Site pipeline metrics">
        <div className="sites-metric-card">
          <strong>Active sites</strong>
          <div>{activeSites.length}</div>
          <span>
            {archivedSites.length > 0 ? (
              <Link href="/sites?showArchived=1">{archivedSites.length} archived</Link>
            ) : (
              <>0 archived</>
            )}
          </span>
        </div>
        <div className="sites-metric-card">
          <strong>Scenario options</strong>
          <div>{activeOptionCount}</div>
          <span>{portfolio.totals.scenarioOptionCount} total</span>
        </div>
        <div className="sites-metric-card sites-metric-card--risk">
          <strong>Constrained</strong>
          <div>{portfolio.totals.constrainedSiteCount}</div>
          <span>Need planning attention</span>
        </div>
        <div className="sites-metric-card sites-metric-card--ok">
          <strong>Archicad-linked</strong>
          <div>{portfolio.totals.archicadLinkedOptionCount}</div>
          <span>Options with model evidence</span>
        </div>
      </section>

      {error ? <div className="notice notice-error">{error}</div> : null}

      {showCreateSite ? (
        <section className="sites-create-panel">
          <div className="sites-panel-heading sites-panel-heading--split app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">New Opportunity</p>
              <h2>Add New Site</h2>
            </div>
            <Link className="secondary-link" href="/sites">
              Cancel
            </Link>
          </div>

          <form action={createSiteAction} className="stack-form">
            <div className="form-grid">
              <label>
                <span>Site name</span>
                <input name="name" placeholder="44 River Road Infill" />
              </label>
              <label>
                <span>Address</span>
                <input name="address" placeholder="44 River Road" />
              </label>
              <label>
                <span>Locality</span>
                <input name="locality" placeholder="Preston" />
              </label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue="to_explore">
                  <option value="to_explore">to explore</option>
                  <option value="exploring">exploring</option>
                  <option value="shortlisted">shortlisted</option>
                  <option value="under_option">under option</option>
                  <option value="active">active</option>
                  <option value="screening">screening</option>
                </select>
              </label>
              <label>
                <span>Stage</span>
                <input name="currentStage" placeholder="site identification" />
              </label>
              <label>
                <span>Acquisition</span>
                <input name="acquisitionStatus" placeholder="watchlist / under option" />
              </label>
              <label>
                <span>Priority</span>
                <input name="priority" placeholder="high / medium / low" />
              </label>
              <label>
                <span>Site area sqm</span>
                <input name="siteAreaSqm" type="number" min="0" step="0.1" />
              </label>
              <label>
                <span>Summary</span>
                <input name="summary" placeholder="Why this site is worth testing" />
              </label>
            </div>
            <button type="submit">Create Site</button>
          </form>
        </section>
      ) : null}

      <section className="sites-panel">
        <div className="sites-panel-heading app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Current Pipeline</p>
            <h2>Active Sites</h2>
          </div>
        </div>
        {activeSites.length === 0 ? (
          <div className="sites-empty-state">
            <p className="muted">No sites are currently being explored in the runtime state.</p>
            <Link className="outline-link" href="/sites?create=site">
              Add your first site
            </Link>
          </div>
        ) : (
          <div className="sites-card-grid">
            {activeSites.map((site) => {
              const midBands = site.scenarioOptions
                .map((option) => option.costBands.find((band) => band.range_key === "mid"))
                .filter((band): band is NonNullable<typeof band> => Boolean(band));
              const minMid = Math.min(...midBands.map((band) => band.totalCost));
              const maxMid = Math.max(...midBands.map((band) => band.totalCost));
              const midCost =
                midBands.length > 0
                  ? minMid === maxMid
                    ? formatCurrency(minMid)
                    : `${formatCurrency(minMid)} - ${formatCurrency(maxMid)}`
                  : "n/a";

              return (
                <article className="sites-card" key={site.id}>
                  <div className="sites-card-head">
                    <div>
                      <h3>{site.name}</h3>
                      <p className="muted">{[site.address, site.locality].filter(Boolean).join(", ")}</p>
                    </div>
                    <div className="sites-tag-stack">
                      <span className="tag">{site.status}</span>
                      {site.priority ? <span className="tag sites-priority-tag">{site.priority}</span> : null}
                    </div>
                  </div>
                  {site.summary ? <p className="sites-card-summary">{site.summary}</p> : null}
                  <div className="sites-card-meta">
                    <span>
                      <strong>Stage</strong>
                      {site.currentStage ?? "n/a"}
                    </span>
                    <span>
                      <strong>Acquisition</strong>
                      {site.acquisitionStatus ?? "n/a"}
                    </span>
                    <span>
                      <strong>Scenario options</strong>
                      {site.scenarioOptions.length}
                    </span>
                  </div>
                  <div className="sites-card-footer">
                    <span>
                      <strong>Mid feasibility</strong>
                      {midCost}
                    </span>
                    <span>
                      <strong>Archicad links</strong>
                      {site.archicadLinks.length > 0 ? site.archicadLinks.length : "not linked"}
                    </span>
                    <Link className="site-card-link" href={`/sites/${site.id}`}>
                      Open site
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="sites-panel sites-panel--secondary">
        <div className="sites-panel-heading sites-panel-heading--split app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Option Review</p>
            <h2>Scenario Option Snapshot</h2>
          </div>
          <Link className="secondary-link" href="/feasibility">
            View all options
          </Link>
        </div>
        <div className="sites-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Option</th>
                <th>Configuration</th>
                <th>Mid Cost</th>
                <th>Revenue</th>
                <th>Mid Margin</th>
                <th>Schedule</th>
              </tr>
            </thead>
            <tbody>
              {activeSites.flatMap((site) =>
                site.scenarioOptions.map((option) => {
                  const midBand = option.costBands.find((band) => band.range_key === "mid");
                  return (
                    <tr key={option.id}>
                      <td>{site.name}</td>
                      <td>
                        <Link href={`/sites/${site.id}`}>{option.name}</Link>
                      </td>
                      <td>{option.configuration}</td>
                      <td>{formatCurrency(midBand?.totalCost)}</td>
                      <td>{formatCurrency(option.salesAssumption?.gross_realisation)}</td>
                      <td>{formatPercent(midBand?.marginPercent)}</td>
                      <td>
                        {option.scheduleSummary.activityCount > 0
                          ? `${option.scheduleSummary.activityCount} activities`
                          : "not scheduled"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showArchivedSites ? (
        <section className="sites-panel sites-panel--archived">
          <div className="sites-panel-heading sites-panel-heading--split app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">Closed Pipeline</p>
              <h2>Archived Sites</h2>
            </div>
            <Link className="secondary-link" href="/sites">
              Hide archived
            </Link>
          </div>
          {archivedSites.length === 0 ? (
            <p className="muted">No archived sites.</p>
          ) : (
            <div className="sites-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Options Preserved</th>
                    <th>Archicad Links Preserved</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedSites.map((site) => (
                    <tr key={site.id}>
                      <td>
                        <Link href={`/sites/${site.id}`}>{site.name}</Link>
                        <div className="muted">{site.address}</div>
                      </td>
                      <td>{site.scenarioOptions.length}</td>
                      <td>{site.archicadLinks.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}