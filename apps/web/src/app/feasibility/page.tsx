import Link from "next/link";
import { revalidatePath } from "next/cache";

import {
  getFeasibilityMethodRuns,
  getFeasibilityPortfolio,
  updateSalesAssumption,
  updateScenarioCostRange,
  updateScenarioOption,
  upsertFeasibilityBranchTargets
} from "../../lib/demo-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readShowArchivedFlag(value: string | string[] | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const parts = Array.isArray(value) ? value : [value];
  return parts.some((entry) => entry === "1" || entry === "true" || entry === "yes");
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function optionalNumber(formData: FormData, key: string): number | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number`);
  }
  return parsed;
}

function requiredNumber(formData: FormData, key: string): number {
  const parsed = optionalNumber(formData, key);
  if (parsed === null) {
    throw new Error(`${key} is required`);
  }
  return parsed;
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

function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function metricTone(value: number | null | undefined, target: number | null | undefined): "strong" | "watch" | "risk" {
  if (typeof value !== "number" || !Number.isFinite(value)) return "risk";
  if (typeof target !== "number" || !Number.isFinite(target)) {
    return value >= 15 ? "strong" : value >= 8 ? "watch" : "risk";
  }
  if (value >= target) return "strong";
  if (value >= target * 0.75) return "watch";
  return "risk";
}

function metricVerdict(tone: "strong" | "watch" | "risk"): string {
  if (tone === "strong") return "Pass";
  if (tone === "watch") return "Near miss";
  return "Risk";
}

function compactCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return formatCurrency(value);
}

function fieldValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function sumCostBand(band: { construction_cost: number; professional_fees?: number | null; contingency?: number | null; statutory_fees?: number | null; finance_cost?: number | null; other_costs?: number | null } | null) {
  if (!band) return 0;
  return (
    (band.construction_cost || 0) +
    (band.professional_fees || 0) +
    (band.contingency || 0) +
    (band.statutory_fees || 0) +
    (band.finance_cost || 0) +
    (band.other_costs || 0)
  );
}

function confidenceTone(value: string | null | undefined): "strong" | "watch" | "risk" {
  const normalized = String(value ?? "").toLowerCase();
  if (["high", "validated", "approved", "strong"].includes(normalized)) return "strong";
  if (["medium", "normal", "pending_validation"].includes(normalized)) return "watch";
  return "risk";
}

function revalidateFeasibilityPaths(siteId?: string | null) {
  revalidatePath("/");
  revalidatePath("/feasibility");
  revalidatePath("/sites");
  if (siteId) {
    revalidatePath(`/sites/${siteId}`);
  }
}

async function updateMethodTargetsAction(formData: FormData) {
  "use server";
  const siteId = String(formData.get("siteId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");
  const branchId = String(formData.get("branchId") ?? "") || null;
  const scenarioId = String(formData.get("scenarioId") ?? "") || null;
  const targetMarginPercent = optionalNumber(formData, "targetMarginPercent");
  await updateScenarioOption({
    optionId,
    name: String(formData.get("name") ?? ""),
    configuration: String(formData.get("configuration") ?? ""),
    status: String(formData.get("status") ?? "testing"),
    dwellings: optionalNumber(formData, "dwellings"),
    grossFloorAreaSqm: optionalNumber(formData, "grossFloorAreaSqm"),
    planningFit: String(formData.get("planningFit") ?? "").trim() || null,
    summary: String(formData.get("summary") ?? "").trim() || null,
    targetMarginPercent
  });
  await upsertFeasibilityBranchTargets({
    branchId,
    siteId,
    scenarioOptionId: optionId,
    scenarioId,
    targetMarginPercent,
    targetNetPositionRatio: optionalNumber(formData, "targetNetPositionRatio")
  });
  revalidateFeasibilityPaths(siteId);
}

async function updateSalesAction(formData: FormData) {
  "use server";
  const siteId = String(formData.get("siteId") ?? "");
  await updateSalesAssumption({
    scenarioOptionId: String(formData.get("optionId") ?? ""),
    grossRealisation: requiredNumber(formData, "grossRealisation"),
    averageSalePrice: optionalNumber(formData, "averageSalePrice"),
    saleRatePerMonth: optionalNumber(formData, "saleRatePerMonth"),
    settlementMonths: optionalNumber(formData, "settlementMonths"),
    notes: String(formData.get("salesNotes") ?? "").trim() || null
  });
  revalidateFeasibilityPaths(siteId);
}

async function updateCostRangeAction(formData: FormData) {
  "use server";
  const siteId = String(formData.get("siteId") ?? "");
  await updateScenarioCostRange({
    rangeId: String(formData.get("rangeId") ?? ""),
    scenarioOptionId: String(formData.get("optionId") ?? ""),
    constructionCost: requiredNumber(formData, "constructionCost"),
    professionalFees: optionalNumber(formData, "professionalFees"),
    contingency: optionalNumber(formData, "contingency"),
    statutoryFees: optionalNumber(formData, "statutoryFees"),
    financeCost: optionalNumber(formData, "financeCost"),
    otherCosts: optionalNumber(formData, "otherCosts"),
    notes: String(formData.get("costNotes") ?? "").trim() || null
  });
  revalidateFeasibilityPaths(siteId);
}

export default async function FeasibilityPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const showArchivedSites = readShowArchivedFlag(params.showArchived);
  const selectedOptionId = readParam(params.optionId);

  const [portfolio, methodRuns] = await Promise.all([getFeasibilityPortfolio(), getFeasibilityMethodRuns()]);
  const options = portfolio.sites.flatMap((site) =>
    site.scenarioOptions.map((option) => ({
      site,
      option,
      midBand: option.costBands.find((band) => band.range_key === "mid") ?? null
    }))
  );
  const visibleOptions = showArchivedSites ? options : options.filter(({ site }) => site.status !== "archived");

  const rankedOptions = [...visibleOptions]
    .filter((item) => item.midBand)
    .sort((left, right) => (right.midBand?.marginPercent ?? -Infinity) - (left.midBand?.marginPercent ?? -Infinity));
  const active = visibleOptions.find((item) => item.option.id === selectedOptionId) ?? rankedOptions[0] ?? visibleOptions[0] ?? null;

  if (!active) {
    return (
      <section className="site-dashboard-panel feasibility-method-empty">
        <p className="eyebrow">Feasibility Method Kernel</p>
        <h2>No scenario options yet</h2>
        <p className="muted">Create a site scenario option before running a method-based feasibility test.</p>
        <Link className="outline-link" href="/sites">Open Sites</Link>
      </section>
    );
  }

  const { site, option, midBand } = active;
  const methodRun = methodRuns.find((run) => run.option.id === option.id) ?? methodRuns[0] ?? null;
  const branch = methodRun?.branch ?? null;
  const totalCost = methodRun?.metrics.allInCost ?? sumCostBand(midBand);
  const revenue = methodRun?.metrics.soldRevenue ?? option.salesAssumption?.gross_realisation ?? 0;
  const cashProfit = methodRun?.metrics.cashProfit ?? revenue - totalCost;
  const developerMargin = methodRun?.metrics.standardDeveloperMarginPercent ?? null;
  const targetDeveloperMargin = methodRun?.targets.standardDeveloperMarginPercent ?? null;
  const targetNetPosition = methodRun?.targets.netRetainedPositionRatio ?? null;
  const retainedEquityProxy = methodRun?.metrics.netRetainedEquity ?? 0;
  const netPositionRatio = methodRun?.metrics.netRetainedPositionRatio ?? null;
  const developerTone = metricTone(developerMargin, targetDeveloperMargin);
  const netPositionTone = metricTone(netPositionRatio, targetNetPosition);
  const costPerGfa = option.gross_floor_area_sqm && totalCost ? totalCost / option.gross_floor_area_sqm : null;
  const avgGfa = option.gross_floor_area_sqm && option.dwellings ? option.gross_floor_area_sqm / option.dwellings : null;
  const challenges = methodRun?.challenges ?? [];
  const levers = methodRun?.levers ?? [];
  const knowledgeItems = methodRun?.knowledgeItems ?? [];
  const progressSteps = ["Scout", "Planning", "Yield", "Cost", "Sales", "Funding", "Feasibility", "Evaluate", "Optimize"];
  const methodNavStages = [
    ["Goal", "goal"],
    ["Site", "site-basis"],
    ["Plan", "planning-envelope"],
    ["Yield", "yield-scheme"],
    ["Cost", "cost-plan"],
    ["Sales", "revenue-model"],
    ["Fund", "funding-and-retain"],
    ["Verdict", "verdict"],
    ["Risk", "challenges"],
    ["Levers", "levers"]
  ];
  const methodStats = [
    ["Land / Site", site.siteAreaSqm ? formatNumber(site.siteAreaSqm, " sqm") : "Site basis"],
    ["Est. Units", option.dwellings ?? "n/a"],
    ["Est. GFA", formatNumber(option.gross_floor_area_sqm, " sqm")],
    ["Total Cost", compactCurrency(totalCost)],
    ["Est. GDV", compactCurrency(revenue)],
    ["Cash Profit", compactCurrency(cashProfit)],
    ["Retained Equity", retainedEquityProxy ? compactCurrency(retainedEquityProxy) : "not set"]
  ];

  return (
    <div className="feasibility-method-shell">
      <aside className="feasibility-method-rail" aria-label="Feasibility method stages">
        <p className="eyebrow">Method</p>
        {methodNavStages.map(([stage, href], index) => (
          <a className={index === 0 ? "is-active" : ""} href={`#${href}`} key={stage}>
            <span>{index + 1}</span>
            {stage}
          </a>
        ))}
        <div className="feasibility-method-rail-card">
          <strong>{portfolio.projectName}</strong>
          <span>{portfolio.totals.siteCount} sites · {portfolio.totals.scenarioOptionCount} options</span>
        </div>
      </aside>

      <div className="feasibility-method-main">
        <section className="feasibility-method-hero site-dashboard-panel">
          <div>
            <p className="eyebrow">Feasibility Method Workspace</p>
            <h2>{site.name}: {option.name}</h2>
            <div className="site-info-row">
              <span><strong>Data</strong>Supabase/demo store</span>
              <span><strong>Strategy</strong>{option.configuration}</span>
              <span><strong>Template</strong>{option.masterCostTemplate?.name ?? "No cost template"}</span>
              <span><strong>Planning</strong>{option.planning_fit ?? "Not set"}</span>
            </div>
          </div>
          <div className="feasibility-method-stepper">
            {progressSteps.map((step, index) => (
              <span className={index <= 6 ? "is-complete" : ""} key={step}>
                <i>{index + 1}</i>{step}
              </span>
            ))}
          </div>
        </section>

        <section className="feasibility-method-stat-strip">
          {methodStats.map(([label, value]) => (
            <article className="feasibility-method-stat" key={label}>
              <strong>{label}</strong>
              <div>{value}</div>
            </article>
          ))}
        </section>

        <div className="feasibility-method-grid">
          <section className="site-dashboard-panel feasibility-method-panel" id="goal">
            <div className="site-panel-title">
              <h3>Goal + Scheme Inputs</h3>
              <span className="tag">editable</span>
            </div>
            <form action={updateMethodTargetsAction} className="feasibility-method-form">
              <input type="hidden" name="siteId" value={site.id} />
              <input type="hidden" name="optionId" value={option.id} />
              <input type="hidden" name="branchId" value={branch?.id ?? ""} />
              <input type="hidden" name="scenarioId" value={option.scenario_id ?? ""} />
              <input type="hidden" name="name" value={option.name} />
              <input type="hidden" name="status" value={option.status} />
              <input type="hidden" name="summary" value={option.summary ?? ""} />
              <label>
                <span>Configuration</span>
                <input name="configuration" defaultValue={option.configuration} />
              </label>
              <label>
                <span>Target developer margin %</span>
                <input name="targetMarginPercent" type="number" step="0.1" defaultValue={fieldValue(targetDeveloperMargin)} />
              </label>
              <label>
                <span>Target retained position %</span>
                <input name="targetNetPositionRatio" type="number" step="0.1" defaultValue={fieldValue(targetNetPosition)} />
              </label>
              <label>
                <span>Dwellings</span>
                <input name="dwellings" type="number" defaultValue={fieldValue(option.dwellings)} />
              </label>
              <label>
                <span>Total GFA sqm</span>
                <input name="grossFloorAreaSqm" type="number" step="0.1" defaultValue={fieldValue(option.gross_floor_area_sqm)} />
              </label>
              <label>
                <span>Planning fit</span>
                <input name="planningFit" defaultValue={option.planning_fit ?? ""} />
              </label>
              <button type="submit">Save Method Targets</button>
            </form>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel" id="site-basis">
            <div className="site-panel-title">
              <h3>Site Overview</h3>
              <Link className="site-mini-action" href={`/sites/${site.id}`}>Open Site</Link>
            </div>
            <dl className="feasibility-method-dl">
              <div><dt>Address</dt><dd>{site.address}</dd></div>
              <div><dt>Locality</dt><dd>{site.locality ?? "n/a"}</dd></div>
              <div><dt>Land size</dt><dd>{formatNumber(site.siteAreaSqm, " sqm")}</dd></div>
              <div><dt>Active planning</dt><dd>{site.activePlanningHighlight?.zoning ?? option.planning_fit ?? "Not set"}</dd></div>
              <div><dt>Constraints</dt><dd>{site.constraints.length}</dd></div>
            </dl>
            <iframe className="feasibility-method-map" src={site.googleMapsEmbedUrl} title={`${site.name} map`} loading="lazy" />
          </section>

          <section className="site-dashboard-panel feasibility-method-panel" id="yield-scheme">
            <div className="site-panel-title">
              <h3>Scheme Concept</h3>
              {option.scenario_id ? <Link className="site-mini-action" href={`/scenarios/${option.scenario_id}`}>Scenario</Link> : null}
            </div>
            <div className="feasibility-method-concept">
              <div>
                <span>{option.dwellings ?? "n/a"}</span>
                <small>Townhouses</small>
              </div>
              <div>
                <span>{formatNumber(avgGfa, " sqm")}</span>
                <small>Avg GFA / unit</small>
              </div>
              <div>
                <span>{formatNumber(option.gross_floor_area_sqm, " sqm")}</span>
                <small>Total GFA</small>
              </div>
              <div>
                <span>{option.scheduleSummary.durationDays ? `${option.scheduleSummary.durationDays}d` : "n/a"}</span>
                <small>Programme</small>
              </div>
            </div>
            <p className="muted">{option.summary ?? "No scheme summary recorded yet."}</p>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel" id="cost-plan">
            <div className="site-panel-title">
              <h3>Development Costs</h3>
              <span className="tag">mid range</span>
            </div>
            {midBand ? (
              <form action={updateCostRangeAction} className="feasibility-method-form feasibility-method-form--cost">
                <input type="hidden" name="siteId" value={site.id} />
                <input type="hidden" name="optionId" value={option.id} />
                <input type="hidden" name="rangeId" value={midBand.id} />
                <label><span>Construction</span><input name="constructionCost" type="number" defaultValue={fieldValue(midBand.construction_cost)} /></label>
                <label><span>Consultants / fees</span><input name="professionalFees" type="number" defaultValue={fieldValue(midBand.professional_fees)} /></label>
                <label><span>Authority / statutory</span><input name="statutoryFees" type="number" defaultValue={fieldValue(midBand.statutory_fees)} /></label>
                <label><span>Finance</span><input name="financeCost" type="number" defaultValue={fieldValue(midBand.finance_cost)} /></label>
                <label><span>Contingency</span><input name="contingency" type="number" defaultValue={fieldValue(midBand.contingency)} /></label>
                <label><span>Other costs</span><input name="otherCosts" type="number" defaultValue={fieldValue(midBand.other_costs)} /></label>
                <label className="drawer-field-wide"><span>Notes</span><input name="costNotes" defaultValue={midBand.notes ?? ""} /></label>
                <button type="submit">Save Cost Range</button>
              </form>
            ) : (
              <p className="muted">No mid cost range has been created for this option yet.</p>
            )}
            <div className="feasibility-method-total">
              <span>Total all-in cost</span>
              <strong>{formatCurrency(totalCost)}</strong>
              <small>{costPerGfa ? `${formatCurrency(costPerGfa)} / sqm GFA` : "GFA required for $/sqm"}</small>
            </div>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel" id="revenue-model">
            <div className="site-panel-title">
              <h3>Revenue / Sales Inputs</h3>
              <span className="tag">editable</span>
            </div>
            <form action={updateSalesAction} className="feasibility-method-form">
              <input type="hidden" name="siteId" value={site.id} />
              <input type="hidden" name="optionId" value={option.id} />
              <label><span>Gross realisation</span><input name="grossRealisation" type="number" defaultValue={fieldValue(option.salesAssumption?.gross_realisation)} /></label>
              <label><span>Average sale price</span><input name="averageSalePrice" type="number" defaultValue={fieldValue(option.salesAssumption?.average_sale_price)} /></label>
              <label><span>Sales / month</span><input name="saleRatePerMonth" type="number" step="0.1" defaultValue={fieldValue(option.salesAssumption?.sale_rate_per_month)} /></label>
              <label><span>Settlement months</span><input name="settlementMonths" type="number" step="0.1" defaultValue={fieldValue(option.salesAssumption?.settlement_months)} /></label>
              <label className="drawer-field-wide"><span>Notes</span><input name="salesNotes" defaultValue={option.salesAssumption?.notes ?? ""} /></label>
              <button type="submit">Save Sales Inputs</button>
            </form>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel" id="verdict">
            <div className="site-panel-title">
              <h3>Verdict Summary</h3>
              <span className={`assembly-status assembly-status--${developerTone === "strong" ? "active" : developerTone === "watch" ? "warning" : "error"}`}>
                {metricVerdict(developerTone)}
              </span>
            </div>
            <dl className="feasibility-method-dl">
              <div><dt>Cash profit / shortfall</dt><dd>{formatCurrency(cashProfit)}</dd></div>
              <div><dt>Developer margin</dt><dd>{formatPercent(developerMargin)}</dd></div>
              <div><dt>Retained equity proxy</dt><dd>{retainedEquityProxy ? formatCurrency(retainedEquityProxy) : "not set"}</dd></div>
              <div><dt>Net retained position / cost</dt><dd>{formatPercent(netPositionRatio)}</dd></div>
              <div><dt>Required residual debt</dt><dd>{cashProfit >= 0 ? "$0 required" : formatCurrency(Math.abs(cashProfit))}</dd></div>
            </dl>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel feasibility-method-panel--wide">
            <div className="site-panel-title">
              <h3>Scenario Comparison</h3>
              <Link className="site-mini-action" href={showArchivedSites ? "/feasibility" : "/feasibility?showArchived=1"}>
                {showArchivedSites ? "Hide archived" : "Show archived"}
              </Link>
            </div>
            <div className="overview-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Units</th>
                    <th>Total Cost</th>
                    <th>GDV</th>
                    <th>Cash Profit</th>
                    <th>Dev. Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOptions.slice(0, 8).map(({ site: rowSite, option: rowOption, midBand: rowBand }) => {
                    const rowCost = sumCostBand(rowBand);
                    const rowRevenue = rowOption.salesAssumption?.gross_realisation ?? 0;
                    const rowProfit = rowRevenue - rowCost;
                    const rowMargin = rowRevenue > 0 ? (rowProfit / rowRevenue) * 100 : null;
                    return (
                      <tr className={rowOption.id === option.id ? "feasibility-method-selected-row" : ""} key={rowOption.id}>
                        <td>
                          <Link href={`/feasibility?optionId=${rowOption.id}`}>{rowOption.name}</Link>
                          <div className="muted">{rowSite.name}</div>
                        </td>
                        <td>{rowOption.dwellings ?? "n/a"}</td>
                        <td>{formatCurrency(rowCost)}</td>
                        <td>{formatCurrency(rowRevenue)}</td>
                        <td>{formatCurrency(rowProfit)}</td>
                        <td>{formatPercent(rowMargin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="feasibility-method-right-rail">
          <section className="feasibility-method-lenses">
            <article className={`feasibility-method-lens feasibility-method-lens--${developerTone}`}>
              <div>
                <p className="eyebrow">Standard Dev. Margin</p>
                <span>cash profit / sold revenue</span>
              </div>
              <strong>{formatPercent(developerMargin)}</strong>
              <small>Target {formatPercent(targetDeveloperMargin)}</small>
              <em>{metricVerdict(developerTone)}</em>
            </article>
            <article className={`feasibility-method-lens feasibility-method-lens--${netPositionTone}`}>
              <div>
                <p className="eyebrow">Net Retained Position / Cost</p>
                <span>cash surplus + retained equity / all-in cost</span>
              </div>
              <strong>{formatPercent(netPositionRatio)}</strong>
              <small>Target {formatPercent(targetNetPosition)}</small>
              <em>{retainedEquityProxy ? metricVerdict(netPositionTone) : "Needs retain inputs"}</em>
            </article>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel" id="challenges">
            <div className="site-panel-title">
              <h3>Key Risks</h3>
              <Link className="site-mini-action" href={`/project-network?linkedRefType=scenario_option&linkedRefId=${option.id}`}>Review</Link>
            </div>
            <div className="feasibility-method-risk-list">
              {(challenges.length ? challenges : knowledgeItems.slice(0, 5)).map((item) => {
                const tone = confidenceTone(item.confidence);
                return (
                  <article key={item.id}>
                    <span className={`feasibility-method-dot feasibility-method-dot--${tone}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <small>{"notes" in item ? item.notes : item.sourceRef}</small>
                    </div>
                    <em>{item.confidence ?? item.status ?? "open"}</em>
                  </article>
                );
              })}
              {challenges.length === 0 && knowledgeItems.length === 0 ? <p className="muted">No assumption challenges are linked yet.</p> : null}
            </div>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel">
            <div className="site-panel-title">
              <h3>Key Assumptions</h3>
              <Link className="site-mini-action" href="/base-costs">Templates</Link>
            </div>
            <table className="feasibility-method-mini-table">
              <tbody>
                {knowledgeItems.slice(0, 5).map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.kind}</td>
                    <td>{item.confidence ?? item.status ?? "open"}</td>
                  </tr>
                ))}
                {knowledgeItems.length === 0 ? (
                  <tr><td colSpan={3}>No linked assumptions yet</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel" id="levers">
            <div className="site-panel-title">
              <h3>Optimisation Levers</h3>
              <Link className="site-mini-action" href={`/project-network?linkedRefType=feasibility_branch&linkedRefId=${branch?.id ?? option.id}`}>Assign</Link>
            </div>
            <div className="feasibility-method-lever-list">
              {(levers.length ? levers : knowledgeItems.slice(0, 5)).map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{("area" in item ? item.area : item.kind)} · {item.status ?? "open"}</small>
                  </div>
                  <span>{"value" in item && item.value ? String(item.value) : "review"}</span>
                </article>
              ))}
              {levers.length === 0 && knowledgeItems.length === 0 ? <p className="muted">No levers have been linked to this option yet.</p> : null}
            </div>
          </section>

          <section className="site-dashboard-panel feasibility-method-panel">
            <div className="site-panel-title">
              <h3>Agent Activity Log</h3>
              <span className="tag">harness-ready</span>
            </div>
            <div className="feasibility-method-agent-log">
              {["Scout Agent: site basis loaded", "Planning Agent: constraints queued", "Yield Agent: scheme inputs editable", "Cost Agent: mid range wired", "Sales Agent: GDV inputs wired", "Evaluator Agent: assumption graph linked"].map((entry) => (
                <span key={entry}>{entry}</span>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <p className="feasibility-method-footnote">All values editable where supported · writes through the existing Supabase/demo store layer · templates provide defaults.</p>
    </div>
  );
}
