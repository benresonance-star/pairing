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

export default async function SitesPage({ searchParams }: PageProps) {
  const portfolio = await getFeasibilityPortfolio();
  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error : null;
  const activeSites = portfolio.sites.filter((site) => site.status !== "archived");
  const archivedSites = portfolio.sites.filter((site) => site.status === "archived");

  return (
    <>
      <section className="card-grid">
        <div className="card">
          <strong>Selected Sites</strong>
          <div>{portfolio.totals.siteCount}</div>
        </div>
        <div className="card">
          <strong>Scenario Options</strong>
          <div>{portfolio.totals.scenarioOptionCount}</div>
        </div>
        <div className="card">
          <strong>Constrained Sites</strong>
          <div>{portfolio.totals.constrainedSiteCount}</div>
        </div>
        <div className="card">
          <strong>Archicad-linked Options</strong>
          <div>{portfolio.totals.archicadLinkedOptionCount}</div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Selected Sites</h2>
            <p className="muted">
              Start feasibility from candidate sites, then inspect constraints, scenario options,
              cost ranges, sales assumptions, and linked Archicad schedules.
            </p>
          </div>
          <Link className="secondary-link" href="/feasibility">
            Compare feasibility
          </Link>
        </div>
        {error ? <div className="notice notice-error">{error}</div> : null}

        <form action={createSiteAction} className="stack-form">
          <h3>Create Site</h3>
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
              <select name="status" defaultValue="screening">
                <option value="screening">screening</option>
                <option value="shortlisted">shortlisted</option>
                <option value="under_option">under option</option>
                <option value="active">active</option>
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

      <section className="panel">
        <h2>Active Sites</h2>
        {activeSites.length === 0 ? (
          <p className="muted">No selected sites are available in the runtime state.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Options</th>
                <th>Mid Case Range</th>
                <th>Archicad</th>
              </tr>
            </thead>
            <tbody>
              {activeSites.map((site) => {
                const midBands = site.scenarioOptions
                  .map((option) => option.costBands.find((band) => band.range_key === "mid"))
                  .filter((band): band is NonNullable<typeof band> => Boolean(band));
                const minMid = Math.min(...midBands.map((band) => band.totalCost));
                const maxMid = Math.max(...midBands.map((band) => band.totalCost));

                return (
                  <tr key={site.id}>
                    <td>
                      <Link href={`/sites/${site.id}`}>{site.name}</Link>
                      <div className="muted">{site.address}</div>
                    </td>
                    <td>
                      <span className="tag">{site.status}</span>
                    </td>
                    <td>{site.currentStage ?? "n/a"}</td>
                    <td>{site.scenarioOptions.length}</td>
                    <td>
                      {midBands.length > 0
                        ? minMid === maxMid
                          ? formatCurrency(minMid)
                          : `${formatCurrency(minMid)} - ${formatCurrency(maxMid)}`
                        : "n/a"}
                    </td>
                    <td>
                      {site.archicadLinks.length > 0 ? (
                        <span className="tag">{site.archicadLinks.length} linked</span>
                      ) : (
                        <span className="muted">not linked</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Archived Sites</h2>
        {archivedSites.length === 0 ? (
          <p className="muted">No archived sites.</p>
        ) : (
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
        )}
      </section>

      <section className="panel">
        <h2>Scenario Option Snapshot</h2>
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
      </section>
    </>
  );
}
