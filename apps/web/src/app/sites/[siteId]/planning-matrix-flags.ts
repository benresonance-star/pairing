export const PLANNING_MATRIX_FLAG_KEYS = [
  "council",
  "zoning",
  "overlays",
  "siteArea",
  "planningScheme",
  "heritage",
  "flood",
  "bushfire",
  "vegetation",
  "easements",
  "utilities",
  "topography"
] as const;

export type PlanningMatrixFlagKey = (typeof PLANNING_MATRIX_FLAG_KEYS)[number];

/** Every flag key set explicitly so controlled checkboxes never see `checked={undefined}`. */
export function normalizePlanningMatrixFlags(
  flags: Partial<Record<PlanningMatrixFlagKey, boolean>> | null | undefined
): Record<PlanningMatrixFlagKey, boolean> {
  const out = {} as Record<PlanningMatrixFlagKey, boolean>;
  for (const key of PLANNING_MATRIX_FLAG_KEYS) {
    out[key] = flags?.[key] === true;
  }
  return out;
}

/** Pre-rendered cell text for the planning matrix (view + edit preview). */
export type PlanningMatrixContent = Record<PlanningMatrixFlagKey, string>;

export function isPlanningMatrixCellFlagged(
  planning: { matrix_cell_flags_json?: unknown } | null | undefined,
  key: PlanningMatrixFlagKey
): boolean {
  let raw = planning?.matrix_cell_flags_json;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return false;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const v = (raw as Record<string, unknown>)[key];
  return v === true || v === 1 || v === "true" || v === "1";
}

/** Reads flags from a JSON blob appended by the client edit panel (reliable with controlled checkboxes). */
export function matrixCellFlagsFromJsonField(formData: FormData): Record<string, boolean> | null {
  const entries = formData.getAll("matrixCellFlagsJson").filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  const raw = entries.length > 0 ? entries[entries.length - 1]!.trim() : null;
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const src = parsed as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const key of PLANNING_MATRIX_FLAG_KEYS) {
    const v = src[key];
    if (v === true || v === 1 || v === "1" || v === "true") {
      out[key] = true;
    }
  }
  return out;
}

/** Checkbox names `matrix_flag_*` (server-only / legacy); client edit panel sends `matrixCellFlagsJson` instead. */
export function matrixCellFlagsFromForm(formData: FormData): Record<string, boolean> {
  const fromJson = matrixCellFlagsFromJsonField(formData);
  if (fromJson !== null) {
    return fromJson;
  }
  const out: Record<string, boolean> = {};
  for (const key of PLANNING_MATRIX_FLAG_KEYS) {
    const field = formData.get(`matrix_flag_${key}`);
    out[key] = field === "on" || field === "1" || field === "true";
  }
  return out;
}

export function compactMatrixCellFlags(flags: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (value) out[key] = true;
  }
  return out;
}

export function parseMatrixCellFlagsRecord(raw: unknown): Record<PlanningMatrixFlagKey, boolean> {
  const out = {} as Record<PlanningMatrixFlagKey, boolean>;
  for (const key of PLANNING_MATRIX_FLAG_KEYS) {
    out[key] = isPlanningMatrixCellFlagged({ matrix_cell_flags_json: raw }, key);
  }
  return normalizePlanningMatrixFlags(out);
}
