import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  archiveScenarioOption,
  archiveSitePlanningHighlight,
  archiveSiteResource,
  archiveSite,
  createSiteResource,
  createSiteScenarioOption,
  deleteSiteResource,
  deleteScenarioOption,
  getFeasibilityPortfolio,
  upsertSitePlanningHighlight,
  uploadSiteResourceFile,
  updateSite,
  updateSiteResource,
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

function csvValues(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
      siteCode: emptyToNull(formData.get("siteCode")),
      siteDate: emptyToNull(formData.get("siteDate")),
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

async function createSiteResourceAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  let nextUrl = `/sites/${siteId}?status=${encodeURIComponent("Site resource added")}`;
  try {
    const file = formData.get("resourceFile");
    const selectedFile = file instanceof File && file.size > 0 ? file : null;
    const uploaded = selectedFile ? await uploadSiteResourceFile(siteId, selectedFile) : null;
    const title = String(formData.get("title") ?? "").trim() || uploaded?.fileName || "";
    await createSiteResource({
      siteId,
      resourceType: String(formData.get("resourceType") ?? "other"),
      title,
      url: uploaded?.publicUrl || emptyToNull(formData.get("url")),
      storagePath: uploaded?.storagePath || emptyToNull(formData.get("storagePath")),
      sourceLabel: emptyToNull(formData.get("sourceLabel")),
      notes: emptyToNull(formData.get("notes")),
      status: "active"
    });
    revalidateSitePaths(siteId);
  } catch (error) {
    nextUrl = `/sites/${siteId}?resource=new&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to add resource")}`;
  }
  redirect(nextUrl);
}

async function updateSiteResourceAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  let nextUrl = `/sites/${siteId}?status=${encodeURIComponent("Site resource updated")}`;
  try {
    const file = formData.get("resourceFile");
    const selectedFile = file instanceof File && file.size > 0 ? file : null;
    const uploaded = selectedFile ? await uploadSiteResourceFile(siteId, selectedFile) : null;
    const title = String(formData.get("title") ?? "").trim() || uploaded?.fileName || "";
    await updateSiteResource({
      resourceId,
      siteId,
      resourceType: String(formData.get("resourceType") ?? "other"),
      title,
      url: uploaded?.publicUrl || emptyToNull(formData.get("url")),
      storagePath: uploaded?.storagePath || emptyToNull(formData.get("storagePath")),
      sourceLabel: emptyToNull(formData.get("sourceLabel")),
      notes: emptyToNull(formData.get("notes")),
      status: String(formData.get("status") ?? "active")
    });
    revalidateSitePaths(siteId);
  } catch (error) {
    nextUrl = `/sites/${siteId}?resourceEdit=${encodeURIComponent(resourceId)}&error=${encodeURIComponent(
      error instanceof Error ? error.message : "Unable to update resource"
    )}`;
  }
  redirect(nextUrl);
}

async function archiveSiteResourceAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await archiveSiteResource(siteId, String(formData.get("resourceId") ?? ""));
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Site resource archived")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive resource")}`);
  }
}

async function deleteSiteResourceAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await deleteSiteResource(siteId, String(formData.get("resourceId") ?? ""));
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Site resource deleted")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete resource")}`);
  }
}

async function upsertSitePlanningHighlightAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  let nextUrl = `/sites/${siteId}?status=${encodeURIComponent("Planning highlights saved")}`;
  try {
    await upsertSitePlanningHighlight({
      siteId,
      highlightId: emptyToNull(formData.get("highlightId")),
      sourceResourceId: emptyToNull(formData.get("sourceResourceId")),
      council: emptyToNull(formData.get("council")),
      planningScheme: emptyToNull(formData.get("planningScheme")),
      zoning: emptyToNull(formData.get("zoning")),
      overlays: csvValues(formData.get("overlays")),
      siteAreaSqm: optionalNumber(formData.get("siteAreaSqm")),
      lotPlan: emptyToNull(formData.get("lotPlan")),
      heritageStatus: emptyToNull(formData.get("heritageStatus")),
      floodStatus: emptyToNull(formData.get("floodStatus")),
      bushfireStatus: emptyToNull(formData.get("bushfireStatus")),
      vegetationStatus: emptyToNull(formData.get("vegetationStatus")),
      easements: emptyToNull(formData.get("easements")),
      planningSummary: emptyToNull(formData.get("planningSummary")),
      sourceDate: emptyToNull(formData.get("sourceDate")),
      status: "active"
    });
    revalidateSitePaths(siteId);
  } catch (error) {
    nextUrl = `/sites/${siteId}?edit=planning&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save planning highlights")}`;
  }
  redirect(nextUrl);
}

async function archiveSitePlanningHighlightAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("siteId") ?? "");
  try {
    await archiveSitePlanningHighlight(siteId, String(formData.get("highlightId") ?? ""));
    revalidateSitePaths(siteId);
    redirect(`/sites/${siteId}?status=${encodeURIComponent("Planning highlights archived")}`);
  } catch (error) {
    redirect(`/sites/${siteId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive planning highlights")}`);
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

function fileNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const cleanPath = path.split("?")[0] ?? path;
  const fileName = cleanPath.split("/").filter(Boolean).at(-1) ?? cleanPath;
  return fileName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "");
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "n/a";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export default async function SiteDetailPage({ params, searchParams }: PageProps) {
  const { siteId } = await params;
  const portfolio = await getFeasibilityPortfolio();
  const site = portfolio.sites.find((item) => item.id === siteId) ?? null;
  const query = (await searchParams) ?? {};
  const status = typeof query.status === "string" ? query.status : null;
  const error = typeof query.error === "string" ? query.error : null;
  const isEditingSite = query.edit === "site";
  const isEditingPlanning = query.edit === "planning";
  const isCreatingScenario = query.create === "scenario";
  const isAddingResource = query.resource === "new";
  const editingResourceId = typeof query.resourceEdit === "string" ? query.resourceEdit : null;

  if (!site) {
    notFound();
  }
  const planning = site.activePlanningHighlight;
  const overlays = planning?.overlays_json?.filter((item): item is string => typeof item === "string") ?? [];
  const activeResources = site.resources.filter((resource) => resource.status !== "archived");
  const reportResources = activeResources.filter((resource) => resource.resource_type === "property_report");
  const primaryReport = reportResources[0] ?? null;
  const siteInfoDate = site.siteDate ?? planning?.source_date ?? null;

  return (
    <div className="site-dashboard-shell">
      <section className="site-dashboard-hero">
        <div className="site-hero-main">
          <div>
            <h2>{site.name}</h2>
            <p className="site-hero-address">
              {site.address}
              {site.locality ? `, ${site.locality}` : ""}
            </p>
            <div className="site-info-row" aria-label="Site information">
              <span><strong>Date</strong>{formatDateLabel(siteInfoDate)}</span>
              <span><strong>Site Code</strong>{site.siteCode ?? site.id}</span>
            </div>
            <p className="site-hero-summary">{site.summary ?? "No site summary has been captured yet."}</p>
          </div>
        </div>
        <div className="site-hero-actions">
          <Link className="outline-link" href={isAddingResource ? `/sites/${site.id}` : `/sites/${site.id}?resource=new`}>Add Resource</Link>
          <Link className="outline-link" href={`/sites/${site.id}?resource=new`}>Add Report</Link>
          <Link className="outline-link" href={isEditingSite ? `/sites/${site.id}` : `/sites/${site.id}?edit=site`}>Edit Site</Link>
          <Link className="outline-link" href="/sites">Back to sites</Link>
        </div>
      </section>

      {status ? <div className="notice notice-success">{status}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="site-dashboard-grid">
        <section className="site-dashboard-panel site-dashboard-panel--wide">
          <div className="site-panel-title">
            <h2>Planning</h2>
            <Link className="site-mini-action" href={isEditingPlanning ? `/sites/${site.id}` : `/sites/${site.id}?edit=planning`}>
              {isEditingPlanning ? "Cancel" : "Edit"}
            </Link>
          </div>
          <div className="site-highlight-matrix">
            <div><span>Council</span><strong>{planning?.council ?? "n/a"}</strong></div>
            <div><span>Zoning</span><strong>{planning?.zoning ?? "n/a"}</strong></div>
            <div><span>Overlays</span><strong>{overlays.length > 0 ? overlays.join(", ") : "n/a"}</strong></div>
            <div><span>Site Area</span><strong>{formatNumber(planning?.site_area_sqm ?? site.siteAreaSqm, " sqm")}</strong></div>
            <div><span>Planning Scheme</span><strong>{planning?.planning_scheme ?? "n/a"}</strong></div>
            <div><span>Heritage</span><strong>{planning?.heritage_status ?? "n/a"}</strong></div>
            <div><span>Flood</span><strong>{planning?.flood_status ?? "n/a"}</strong></div>
            <div><span>Bushfire</span><strong>{planning?.bushfire_status ?? "n/a"}</strong></div>
            <div><span>Vegetation</span><strong>{planning?.vegetation_status ?? "n/a"}</strong></div>
            <div><span>Easements</span><strong>{planning?.easements ?? "n/a"}</strong></div>
            <div><span>Utilities</span><strong>Check authority reports</strong></div>
            <div><span>Topography</span><strong>{planning?.lot_plan ?? "n/a"}</strong></div>
          </div>
          <div className="site-planning-summary">
            <strong>Planning Summary</strong>
            <p>{planning?.planning_summary ?? "Add planning highlights from a property report to make this site dashboard useful for review."}</p>
          </div>
          <div className="site-planning-constraints">
            <h3>Planning and Site Constraints</h3>
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
          </div>
          {isEditingPlanning ? (
            <form action={upsertSitePlanningHighlightAction} className="stack-form site-form-block">
            <input type="hidden" name="siteId" value={site.id} />
            <input type="hidden" name="highlightId" value={planning?.id ?? ""} />
            <div className="form-grid">
              <label><span>Source report</span><select name="sourceResourceId" defaultValue={planning?.source_resource_id ?? ""}><option value="">No source selected</option>{reportResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select></label>
              <label><span>Council</span><input name="council" defaultValue={planning?.council ?? ""} /></label>
              <label><span>Planning scheme</span><input name="planningScheme" defaultValue={planning?.planning_scheme ?? ""} /></label>
              <label><span>Zoning</span><input name="zoning" defaultValue={planning?.zoning ?? ""} /></label>
              <label><span>Overlays, comma separated</span><input name="overlays" defaultValue={overlays.join(", ")} /></label>
              <label><span>Site area sqm</span><input name="siteAreaSqm" type="number" step="0.1" defaultValue={planning?.site_area_sqm ?? site.siteAreaSqm ?? ""} /></label>
              <label><span>Lot / plan</span><input name="lotPlan" defaultValue={planning?.lot_plan ?? ""} /></label>
              <label><span>Heritage</span><input name="heritageStatus" defaultValue={planning?.heritage_status ?? ""} /></label>
              <label><span>Flood</span><input name="floodStatus" defaultValue={planning?.flood_status ?? ""} /></label>
              <label><span>Bushfire</span><input name="bushfireStatus" defaultValue={planning?.bushfire_status ?? ""} /></label>
              <label><span>Vegetation</span><input name="vegetationStatus" defaultValue={planning?.vegetation_status ?? ""} /></label>
              <label><span>Source date</span><input name="sourceDate" type="date" defaultValue={planning?.source_date ?? ""} /></label>
            </div>
            <label><span>Easements</span><textarea name="easements" defaultValue={planning?.easements ?? ""} /></label>
            <label><span>Planning summary</span><textarea name="planningSummary" defaultValue={planning?.planning_summary ?? ""} /></label>
            <div className="inline-actions"><button type="submit">Save Planning Highlights</button></div>
          </form>
          ) : null}
        </section>

        <aside className="site-dashboard-panel site-map-report-panel">
          <div className="site-panel-title">
            <h2>Site Location</h2>
          </div>
          <iframe
            className="site-map-embed"
            src={site.googleMapsEmbedUrl}
            title={`${site.name} Google Maps preview`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </aside>
      </div>

      <section className="site-dashboard-panel">
        <div className="site-panel-title">
          <h2>Site Resources</h2>
          <Link className="site-mini-action" href={isAddingResource ? `/sites/${site.id}` : `/sites/${site.id}?resource=new`}>
            {isAddingResource ? "Cancel" : "Add Resource"}
          </Link>
        </div>
        {activeResources.length === 0 ? (
          <p className="muted">No resources have been added yet. Add a URL or Supabase-uploaded file path to make it available here.</p>
        ) : (
          <div className="site-resource-categories">
            {activeResources.map((resource) => {
              const viewHref = resource.url || resource.storage_path || null;
              const fileName = fileNameFromPath(resource.storage_path);
              const detailText =
                resource.notes ?? resource.source_label ?? (fileName && fileName !== resource.title ? fileName : null);
              const isEditingResource = editingResourceId === resource.id;
              return (
                <article
                  className={`site-resource-category-card site-resource-record-card${isEditingResource ? " site-resource-record-card--editing" : ""}`}
                  key={resource.id}
                >
                  <div className="site-resource-category-head">
                    <h3>{resource.title}</h3>
                    <span>{resource.resource_type.replaceAll("_", " ")}</span>
                  </div>
                  {detailText ? <p>{detailText}</p> : null}
                  <div className="site-resource-format-row">
                    {resource.url ? <span>URL</span> : null}
                    {resource.storage_path ? <span>FILE</span> : null}
                    {!resource.url && !resource.storage_path ? <span>MISSING LINK/FILE</span> : null}
                  </div>
                  <div className="site-resource-card-actions">
                    {viewHref ? (
                      <a className="site-card-link" href={viewHref} target="_blank" rel="noreferrer">View</a>
                    ) : (
                      <span className="site-card-link site-card-link--disabled">Missing link/file</span>
                    )}
                    <Link className="site-card-link" href={isEditingResource ? `/sites/${site.id}` : `/sites/${site.id}?resourceEdit=${resource.id}`}>
                      {isEditingResource ? "Close" : "Edit"}
                    </Link>
                  </div>
                  {isEditingResource ? (
                    <form action={updateSiteResourceAction} className="stack-form site-resource-edit-form" encType="multipart/form-data">
                      <input type="hidden" name="siteId" value={site.id} />
                      <input type="hidden" name="resourceId" value={resource.id} />
                      <input type="hidden" name="status" value={resource.status} />
                      <div className="form-grid">
                        <label><span>Resource type</span><select name="resourceType" defaultValue={resource.resource_type}><option value="property_report">property report</option><option value="listing">listing</option><option value="document">document</option><option value="other">other</option></select></label>
                        <label><span>Title</span><input name="title" defaultValue={resource.title} /></label>
                        <label><span>Replace uploaded file</span><input name="resourceFile" type="file" /></label>
                        <label><span>URL link</span><input name="url" defaultValue={resource.url ?? ""} /></label>
                        <label><span>Uploaded file path</span><input name="storagePath" defaultValue={resource.storage_path ?? ""} /></label>
                        <label><span>Source label</span><input name="sourceLabel" defaultValue={resource.source_label ?? ""} /></label>
                      </div>
                      <label><span>Notes</span><textarea name="notes" defaultValue={resource.notes ?? ""} /></label>
                      <div className="inline-actions">
                        <button type="submit">Save Resource</button>
                      </div>
                    </form>
                  ) : null}
                  {isEditingResource ? (
                    <form action={deleteSiteResourceAction} className="inline-form site-resource-delete-form">
                      <input type="hidden" name="siteId" value={site.id} />
                      <input type="hidden" name="resourceId" value={resource.id} />
                      <button type="submit" className="danger-button">Delete Resource</button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        {isAddingResource ? (
          <form action={createSiteResourceAction} className="stack-form site-form-block" encType="multipart/form-data">
            <input type="hidden" name="siteId" value={site.id} />
            <div className="form-grid">
              <label><span>Resource type</span><select name="resourceType" defaultValue="property_report"><option value="property_report">property report</option><option value="listing">listing</option><option value="document">document</option><option value="other">other</option></select></label>
              <label><span>Title</span><input name="title" placeholder="Planning property report" /></label>
              <label><span>Upload file to Supabase</span><input name="resourceFile" type="file" /></label>
              <label><span>URL link</span><input name="url" placeholder="https://..." /></label>
              <label><span>Existing uploaded file path</span><input name="storagePath" placeholder="site-reports/site-id/report.pdf" /></label>
              <label><span>Source label</span><input name="sourceLabel" placeholder="Council PDF / CoreLogic / realestate.com.au" /></label>
            </div>
            <label><span>Notes</span><textarea name="notes" placeholder="Choose a file to upload, add a URL link, or reference an existing Supabase file path. Include what this resource proves or why it matters." /></label>
            <button type="submit">Add Site Resource</button>
          </form>
        ) : null}
      </section>

      {isEditingSite ? (
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
                <span>Date</span>
                <input name="siteDate" type="date" defaultValue={site.siteDate ?? ""} />
              </label>
              <label>
                <span>Site Code</span>
                <input name="siteCode" defaultValue={site.siteCode ?? site.id} />
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
      ) : null}

      {isCreatingScenario ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Create Scenario Option</h2>
              <p className="muted">
                Start from a reusable scenario template and optional master cost template, then instantiate an active
                site-linked option.
              </p>
            </div>
            <Link className="outline-link" href={`/sites/${site.id}`}>
              Cancel
            </Link>
          </div>
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
      ) : null}

      <section className="site-dashboard-panel site-scenarios-panel">
        <div className="site-panel-title">
          <h2>Scenario Options</h2>
        </div>
        <div className="site-scenario-card-grid">
          {site.scenarioOptions.map((option) => {
            const midBand = option.costBands.find((band) => band.range_key === "mid");
            return (
              <article className="site-scenario-card" key={option.id}>
                <div>
                  <div>
                    <h3>{option.name}</h3>
                    <p className="muted">{option.summary}</p>
                  </div>
                  <span className="tag">{option.status}</span>
                </div>
                <div className="site-scenario-metrics">
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
                <div className="site-scenario-primary-actions">
                  {option.linkedScenarioName && option.scenario_id ? (
                    <Link className="outline-link" href={`/scenarios/${option.scenario_id}`}>View Scenario</Link>
                  ) : (
                    <span className="muted">No detailed scenario linked yet</span>
                  )}
                  {option.scheduleSummary.activityCount > 0 && option.scenario_id ? (
                    <Link href={`/linear-schedule?scenarioId=${option.scenario_id}&siteId=${site.id}`}>Gantt</Link>
                  ) : null}
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
          <Link className="site-scenario-create-card" href={`/sites/${site.id}?create=scenario`}>
            <span>+</span>
            <strong>Create New Scenario</strong>
          </Link>
        </div>
      </section>
    </div>
  );
}
