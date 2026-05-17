"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  compactMatrixCellFlags,
  normalizePlanningMatrixFlags,
  parseMatrixCellFlagsRecord,
  type PlanningMatrixContent,
  type PlanningMatrixFlagKey
} from "./planning-matrix-flags";

type PlanningFormSnapshot = {
  id?: string;
  source_resource_id?: string | null;
  council?: string | null;
  planning_scheme?: string | null;
  zoning?: string | null;
  site_area_sqm?: number | null;
  lot_plan?: string | null;
  heritage_status?: string | null;
  flood_status?: string | null;
  bushfire_status?: string | null;
  vegetation_status?: string | null;
  utilities_status?: string | null;
  easements?: string | null;
  planning_summary?: string | null;
  source_date?: string | null;
  matrix_cell_flags_json?: unknown;
};

type ReportOption = { id: string; title: string };

function matrixCellClass(flagged: boolean): string | undefined {
  return flagged ? "site-highlight-matrix__cell--flagged" : undefined;
}

export function PlanningIntelligenceEditPanel({
  siteId,
  siteAreaSqm,
  planning,
  matrixContent,
  overlaysCsv,
  reportResources,
  saveAction
}: {
  siteId: string;
  siteAreaSqm: number | null;
  planning: PlanningFormSnapshot | null;
  matrixContent: PlanningMatrixContent;
  overlaysCsv: string;
  reportResources: ReportOption[];
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const planningMatrixKey = useMemo(
    () => `${planning?.id ?? ""}|${JSON.stringify(planning?.matrix_cell_flags_json ?? null)}`,
    [planning?.id, planning?.matrix_cell_flags_json]
  );
  const [matrixFlags, setMatrixFlags] = useState<Record<PlanningMatrixFlagKey, boolean>>(() =>
    normalizePlanningMatrixFlags(parseMatrixCellFlagsRecord(planning?.matrix_cell_flags_json))
  );

  useEffect(() => {
    setMatrixFlags(normalizePlanningMatrixFlags(parseMatrixCellFlagsRecord(planning?.matrix_cell_flags_json)));
  }, [planningMatrixKey]);

  const matrixCellFlagsJson = JSON.stringify(compactMatrixCellFlags(matrixFlags as Record<string, boolean>));

  const setFlag = (key: PlanningMatrixFlagKey, checked: boolean) => {
    setMatrixFlags((prev) => normalizePlanningMatrixFlags({ ...prev, [key]: checked }));
  };

  return (
    <>
      <div className="site-highlight-matrix">
        <div className={matrixCellClass(matrixFlags.council)}>
          <span>Council</span>
          <strong>{matrixContent.council}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.zoning)}>
          <span>Zoning</span>
          <strong>{matrixContent.zoning}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.overlays)}>
          <span>Overlays</span>
          <strong>{matrixContent.overlays}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.siteArea)}>
          <span>Site Area</span>
          <strong>{matrixContent.siteArea}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.planningScheme)}>
          <span>Planning Scheme</span>
          <strong>{matrixContent.planningScheme}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.heritage)}>
          <span>Heritage</span>
          <strong>{matrixContent.heritage}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.flood)}>
          <span>Flood</span>
          <strong>{matrixContent.flood}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.bushfire)}>
          <span>Bushfire</span>
          <strong>{matrixContent.bushfire}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.vegetation)}>
          <span>Vegetation</span>
          <strong>{matrixContent.vegetation}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.easements)}>
          <span>Easements</span>
          <strong>{matrixContent.easements}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.utilities)}>
          <span>Utilities</span>
          <strong>{matrixContent.utilities}</strong>
        </div>
        <div className={matrixCellClass(matrixFlags.topography)}>
          <span>Topography</span>
          <strong>{matrixContent.topography}</strong>
        </div>
      </div>
      <div className="site-planning-summary">
        <strong>Site-Specific Planning Summary</strong>
        <p>{planning?.planning_summary ?? "Add planning highlights from a property report to make this site dashboard useful for review."}</p>
      </div>
      <form action={saveAction} className="stack-form site-form-block">
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="highlightId" value={planning?.id ?? ""} />
        <input type="hidden" name="matrixCellFlagsJson" value={matrixCellFlagsJson} readOnly />
        <div className="form-grid">
          <label>
            <span>Source report</span>
            <select name="sourceResourceId" defaultValue={planning?.source_resource_id ?? ""}>
              <option value="">No source selected</option>
              {reportResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              Council
              <input
                name="matrix_flag_council"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.council}
                onChange={(e) => setFlag("council", e.target.checked)}
                aria-label="Flag council cell in the planning matrix"
              />
            </span>
            <input name="council" defaultValue={planning?.council ?? ""} />
          </label>
          <label>
            <span>
              Planning scheme
              <input
                name="matrix_flag_planningScheme"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.planningScheme}
                onChange={(e) => setFlag("planningScheme", e.target.checked)}
                aria-label="Flag planning scheme cell in the planning matrix"
              />
            </span>
            <input name="planningScheme" defaultValue={planning?.planning_scheme ?? ""} />
          </label>
          <label>
            <span>
              Zoning
              <input
                name="matrix_flag_zoning"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.zoning}
                onChange={(e) => setFlag("zoning", e.target.checked)}
                aria-label="Flag zoning cell in the planning matrix"
              />
            </span>
            <input name="zoning" defaultValue={planning?.zoning ?? ""} />
          </label>
          <label>
            <span>
              Overlays, comma separated
              <input
                name="matrix_flag_overlays"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.overlays}
                onChange={(e) => setFlag("overlays", e.target.checked)}
                aria-label="Flag overlays cell in the planning matrix"
              />
            </span>
            <input name="overlays" defaultValue={overlaysCsv} />
          </label>
          <label>
            <span>
              Site area sqm
              <input
                name="matrix_flag_siteArea"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.siteArea}
                onChange={(e) => setFlag("siteArea", e.target.checked)}
                aria-label="Flag site area cell in the planning matrix"
              />
            </span>
            <input name="siteAreaSqm" type="number" step="0.1" defaultValue={planning?.site_area_sqm ?? siteAreaSqm ?? ""} />
          </label>
          <label>
            <span>
              Lot / plan
              <input
                name="matrix_flag_topography"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.topography}
                onChange={(e) => setFlag("topography", e.target.checked)}
                aria-label="Flag topography cell in the planning matrix"
              />
            </span>
            <input name="lotPlan" defaultValue={planning?.lot_plan ?? ""} />
          </label>
          <label>
            <span>
              Heritage
              <input
                name="matrix_flag_heritage"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.heritage}
                onChange={(e) => setFlag("heritage", e.target.checked)}
                aria-label="Flag heritage cell in the planning matrix"
              />
            </span>
            <input name="heritageStatus" defaultValue={planning?.heritage_status ?? ""} />
          </label>
          <label>
            <span>
              Flood
              <input
                name="matrix_flag_flood"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.flood}
                onChange={(e) => setFlag("flood", e.target.checked)}
                aria-label="Flag flood cell in the planning matrix"
              />
            </span>
            <input name="floodStatus" defaultValue={planning?.flood_status ?? ""} />
          </label>
          <label>
            <span>
              Bushfire
              <input
                name="matrix_flag_bushfire"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.bushfire}
                onChange={(e) => setFlag("bushfire", e.target.checked)}
                aria-label="Flag bushfire cell in the planning matrix"
              />
            </span>
            <input name="bushfireStatus" defaultValue={planning?.bushfire_status ?? ""} />
          </label>
          <label>
            <span>
              Vegetation
              <input
                name="matrix_flag_vegetation"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.vegetation}
                onChange={(e) => setFlag("vegetation", e.target.checked)}
                aria-label="Flag vegetation cell in the planning matrix"
              />
            </span>
            <input name="vegetationStatus" defaultValue={planning?.vegetation_status ?? ""} />
          </label>
          <label>
            <span>
              Utilities
              <input
                name="matrix_flag_utilities"
                type="checkbox"
                value="1"
                className="planning-matrix-cell-flag"
                checked={matrixFlags.utilities}
                onChange={(e) => setFlag("utilities", e.target.checked)}
                aria-label="Flag utilities cell in the planning matrix"
              />
            </span>
            <input name="utilitiesStatus" defaultValue={planning?.utilities_status ?? ""} placeholder="Water, sewer, power, telco…" />
          </label>
          <label>
            <span>Source date</span>
            <input name="sourceDate" type="date" defaultValue={planning?.source_date ?? ""} />
          </label>
        </div>
        <label>
          <span>
            Easements
            <input
              name="matrix_flag_easements"
              type="checkbox"
              value="1"
              className="planning-matrix-cell-flag"
              checked={matrixFlags.easements}
              onChange={(e) => setFlag("easements", e.target.checked)}
              aria-label="Flag easements cell in the planning matrix"
            />
          </span>
          <textarea name="easements" defaultValue={planning?.easements ?? ""} />
        </label>
        <label>
          <span>Planning summary</span>
          <textarea name="planningSummary" defaultValue={planning?.planning_summary ?? ""} />
        </label>
        <div className="inline-actions site-planning-form-actions">
          <button type="submit">Save</button>
          <Link className="outline-link site-planning-cancel-link" href={`/sites/${siteId}`}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
