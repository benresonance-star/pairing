import Link from "next/link";

import { getFeasibilityPortfolio } from "../../lib/demo-store";

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

function marginClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "feasibility-margin";
  }
  if (value >= 18) return "feasibility-margin feasibility-margin--strong";
  if (value >= 12) return "feasibility-margin feasibility-margin--watch";
  return "feasibility-margin feasibility-margin--risk";
}

export default async function FeasibilityPage() {
  const portfolio = await getFeasibilityPortfolio();
  const options = portfolio.sites.flatMap((site) =>
    site.scenarioOptions.map((option) => ({
      site,
      option,
      midBand: option.costBands.find((band) => band.range_key === "mid") ?? null
    }))
  );
  const strongestMid = [...options]
    .filter((item) => item.midBand)
    .sort((left, right) => (right.midBand?.marginPercent ?? -Infinity) - (left.midBand?.marginPercent ?? -Infinity))[0];

  return (
    <>
      <section className="card-grid">
        <div className="card">
          <strong>Project</strong>
          <div>{portfolio.projectName}</div>
        </div>
        <div className="card">
          <strong>Sites</strong>
          <div>{portfolio.totals.siteCount}</div>
        </div>
        <div className="card">
          <strong>Scenario Options</strong>
          <div>{portfolio.totals.scenarioOptionCount}</div>
        </div>
        <div className="card">
          <strong>Best Mid Margin</strong>
          <div>{strongestMid ? formatPercent(strongestMid.midBand?.marginPercent) : "n/a"}</div>
        </div>
        <div className="card">
          <strong>Master Cost Templates</strong>
          <div>{portfolio.masterCostTemplates.length}</div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Master Cost Templates</h2>
            <p className="muted">
              Reusable Supabase-shaped cost libraries that can support loose sqm allowances, provisional sums,
              systems, Archicad elements/assemblies/zones, and detailed material lines.
            </p>
          </div>
          <Link className="secondary-link" href="/base-costs">
            Edit Base Costs
          </Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Items</th>
              <th>Granularity</th>
              <th>Example Basis</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.masterCostTemplates.map((template) => (
              <tr key={template.id}>
                <td>
                  <strong>{template.name}</strong>
                  <div className="muted">{template.description ?? "No description"}</div>
                </td>
                <td>{template.items.length}</td>
                <td>
                  {[...new Set(template.items.map((item) => item.estimate_granularity))].join(", ") || "n/a"}
                </td>
                <td>
                  {template.items[0]
                    ? `${template.items[0].costing_method} / ${template.items[0].quantity_basis ?? template.items[0].unit}`
                    : "n/a"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Feasibility Comparison</h2>
            <p className="muted">
              Compare low, mid, high, and other cost ranges against sales assumptions and construction timing.
            </p>
          </div>
          <Link className="secondary-link" href="/sites">
            Review sites
          </Link>
        </div>

        <table>
          <thead>
            <tr>
              <th>Site / Option</th>
              <th>Range</th>
              <th>Total Cost</th>
              <th>Revenue</th>
              <th>Margin</th>
              <th>Planning Fit</th>
              <th>Template / Cost Plan</th>
              <th>Construction Timing</th>
              <th>Archicad / Assemblies</th>
            </tr>
          </thead>
          <tbody>
            {options.flatMap(({ site, option }) =>
              option.costBands.map((band) => (
                <tr key={`${option.id}-${band.id}`}>
                  <td>
                    <Link href={`/sites/${site.id}`}>{site.name}</Link>
                    <div className="muted">{option.name}</div>
                  </td>
                  <td>
                    <span className="tag">{band.label}</span>
                  </td>
                  <td>{formatCurrency(band.totalCost)}</td>
                  <td>{formatCurrency(option.salesAssumption?.gross_realisation)}</td>
                  <td>
                    <span className={marginClass(band.marginPercent)}>
                      {formatCurrency(band.marginAmount)} ({formatPercent(band.marginPercent)})
                    </span>
                  </td>
                  <td>{option.planning_fit ?? "n/a"}</td>
                  <td>
                    {option.masterCostTemplate?.name ?? "No master template"}
                    <div className="muted">
                      {option.costPlanItems.length} cost items
                      {option.templateScenarioName ? ` from ${option.templateScenarioName}` : ""}
                    </div>
                  </td>
                  <td>
                    {option.scheduleSummary.activityCount > 0 ? (
                      <>
                        {option.scheduleSummary.durationDays} days
                        <div className="muted">
                          {option.scheduleSummary.activityCount} activities, {option.scheduleSummary.packageCount} packages
                        </div>
                      </>
                    ) : (
                      <span className="muted">No Gantt scenario yet</span>
                    )}
                  </td>
                  <td>
                    {option.archicadLink ? (
                      <>
                        {option.archicadLink.file_label}
                        <div className="muted">
                          {option.archicadLink.linked_guid_count ?? 0} GUIDs, {option.assemblyTaskIds.length} assembly tasks
                        </div>
                      </>
                    ) : (
                      <span className="muted">Model link pending</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Scenario Cost Plan Links</h2>
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th>Cost Code</th>
              <th>Item</th>
              <th>Level</th>
              <th>Basis</th>
              <th>Linked Target</th>
            </tr>
          </thead>
          <tbody>
            {options.flatMap(({ site, option }) =>
              option.costPlanItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/sites/${site.id}`}>{option.name}</Link>
                    <div className="muted">{site.name}</div>
                  </td>
                  <td>{item.cost_code}</td>
                  <td>{item.title}</td>
                  <td>{item.estimate_granularity}</td>
                  <td>
                    {item.quantity} {item.unit} @ {formatCurrency(item.rate)}
                    <div className="muted">{item.costing_method}</div>
                  </td>
                  <td>
                    {item.linked_target_type && item.linked_target_ref
                      ? `${item.linked_target_type}: ${item.linked_target_ref}`
                      : "Not linked"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Sales Assumptions</h2>
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th>Dwellings</th>
              <th>Average Sale</th>
              <th>Gross Realisation</th>
              <th>Sale Rate</th>
              <th>Settlement</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {options.map(({ site, option }) => (
              <tr key={option.id}>
                <td>
                  <Link href={`/sites/${site.id}`}>{option.name}</Link>
                </td>
                <td>{option.dwellings ?? "n/a"}</td>
                <td>{formatCurrency(option.salesAssumption?.average_sale_price)}</td>
                <td>{formatCurrency(option.salesAssumption?.gross_realisation)}</td>
                <td>
                  {option.salesAssumption?.sale_rate_per_month
                    ? `${option.salesAssumption.sale_rate_per_month} sales/month`
                    : "n/a"}
                </td>
                <td>
                  {option.salesAssumption?.settlement_months
                    ? `${option.salesAssumption.settlement_months} months`
                    : "n/a"}
                </td>
                <td>{option.salesAssumption?.notes ?? "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
