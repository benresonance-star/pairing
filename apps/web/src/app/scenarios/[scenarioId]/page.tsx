import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import {
  archiveScenario,
  createScenarioOperationalChangeSet,
  deleteScenario,
  getAssumptionGraphData,
  getFeasibilityPortfolio,
  getScenarioEditorData,
  updateScenario,
  type ScenarioEditorOperationalRow
} from "../../../lib/demo-store";
import { AssumptionGraphPanel } from "../../assumption-graph-panel";
import ConfirmSubmitButton from "./confirm-submit-button";
import PreserveScrollSubmitButton from "./preserve-scroll-submit-button";
import RestoreScrollOnLoad from "./restore-scroll-on-load";
import {
  createGanttHierarchyNodeAction,
  createScheduleActivityAction,
  createScheduleDependencyAction,
  deleteGanttHierarchyNodeAction,
  deleteScheduleActivityAction,
  deleteScheduleDependencyAction,
  moveGanttHierarchyNodeAction,
  saveScheduleActivityAction,
  updateGanttHierarchyNodeAction
} from "./schedule-actions";
import SelectedActivityFields from "./selected-activity-fields";
import ScenarioEditorVisuals from "./scenario-visuals";
import type {
  LinearScheduleActivityRow,
  LinearScheduleData,
  LinearScheduleGanttRow
} from "../../../lib/linear-schedule";

type PageProps = {
  params: Promise<{ scenarioId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type QueryState = {
  selectedActivityId?: string | null;
  selectedOperationalId?: string | null;
  status?: string | null;
  error?: string | null;
};

const GANTT_WIDTH = 980;
const GANTT_LEFT = 280;
const GANTT_RIGHT = 24;
const GANTT_ROW_HEIGHT = 28;
const LINEAR_WIDTH = 980;
const LINEAR_LEFT = 200;
const LINEAR_RIGHT = 24;
const LINEAR_TOP = 24;
const LINEAR_BOTTOM = 40;

function editorUrl(scenarioId: string, query: QueryState = {}) {
  const params = new URLSearchParams();
  if (query.selectedActivityId) params.set("activityId", query.selectedActivityId);
  if (query.selectedOperationalId) params.set("operationalId", query.selectedOperationalId);
  if (query.status) params.set("status", query.status);
  if (query.error) params.set("error", query.error);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return `/scenarios/${scenarioId}${suffix}`;
}

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

function revalidateScenarioEditorPaths(scenarioId: string) {
  revalidatePath("/");
  revalidatePath("/scenarios");
  revalidatePath(`/scenarios/${scenarioId}`);
  revalidatePath("/objects");
  revalidatePath("/change-sets");
  revalidatePath("/linear-schedule");
}

function revalidateScenarioCollectionPaths() {
  revalidatePath("/");
  revalidatePath("/scenarios");
  revalidatePath("/objects");
  revalidatePath("/change-sets");
  revalidatePath("/linear-schedule");
}

function getActionErrorMessage(error: unknown, fallbackMessage: string) {
  if (isRedirectError(error)) {
    throw error;
  }
  return error instanceof Error ? error.message : fallbackMessage;
}

async function submitScenarioHeader(formData: FormData) {
  "use server";

  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("selectedActivityId"));
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await updateScenario(scenarioId, {
      name: String(formData.get("name") ?? ""),
      status: String(formData.get("status") ?? "")
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        status: "Scenario details updated"
      })
    );
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to update scenario")
      })
    );
  }
}

async function archiveScenarioAction(formData: FormData) {
  "use server";

  const scenarioId = String(formData.get("scenarioId") ?? "");
  try {
    await archiveScenario(scenarioId);
    revalidateScenarioEditorPaths(scenarioId);
    redirect("/scenarios?status=Scenario%20archived");
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        error: getActionErrorMessage(error, "Unable to archive scenario")
      })
    );
  }
}

async function deleteScenarioAction(formData: FormData) {
  "use server";

  const scenarioId = String(formData.get("scenarioId") ?? "");
  try {
    await deleteScenario(scenarioId);
    revalidateScenarioCollectionPaths();
    redirect("/scenarios?status=Scenario%20deleted");
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        error: getActionErrorMessage(error, "Unable to delete scenario")
      })
    );
  }
}

async function saveOperationalRowAction(formData: FormData) {
  "use server";

  const scenarioId = String(formData.get("scenarioId") ?? "");
  const operationalRowId = String(formData.get("operationalRowId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("selectedActivityId"));

  try {
    const result = await createScenarioOperationalChangeSet({
      scenarioId,
      operationalRowId,
      patch: {
        packageId: emptyToNull(formData.get("packageId")),
        constructionState: emptyToNull(formData.get("constructionState")),
        sequenceGroup: emptyToNull(formData.get("sequenceGroup")),
        sequenceOrder: optionalNumber(formData.get("sequenceOrder")),
        plannedStart: emptyToNull(formData.get("plannedStart")),
        plannedFinish: emptyToNull(formData.get("plannedFinish")),
        actualStart: emptyToNull(formData.get("actualStart")),
        actualFinish: emptyToNull(formData.get("actualFinish"))
      }
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId: operationalRowId,
        status: `Draft change set created with ${result.itemCount} item${result.itemCount === 1 ? "" : "s"}`
      })
    );
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId: operationalRowId,
        error: getActionErrorMessage(error, "Unable to create operational change set")
      })
    );
  }
}

function buildDateTicks(startDate: string, finishDate: string) {
  const ticks: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const finish = new Date(`${finishDate}T00:00:00Z`);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= finish) {
    ticks.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

function scaleDate(dateValue: string, startMs: number, finishMs: number, width: number, left: number, right: number) {
  const inner = width - left - right;
  const valueMs = new Date(`${dateValue}T00:00:00Z`).getTime();
  if (finishMs <= startMs) {
    return left;
  }
  return left + ((valueMs - startMs) / (finishMs - startMs)) * inner;
}

function ganttBarColor(row: LinearScheduleGanttRow) {
  if (row.rowKind === "summary") {
    return "rgba(138, 173, 255, 0.7)";
  }
  const key = row.colorKey ?? "siteworks";
  const palette: Record<string, string> = {
    siteworks: "#8ec5ff",
    civils: "#59d0a8",
    structure: "#7f8cff",
    envelope: "#f28f6c",
    services: "#c77dff",
    interiors: "#ffd166",
    externals: "#5dd39e",
    commissioning: "#ff6b9a"
  };
  return palette[key] ?? "#8ec5ff";
}

function renderGanttPreview(data: LinearScheduleData, scenarioId: string, selectedActivityId: string | null, selectedOperationalId: string | null) {
  const rows = data.ganttRows;
  const startMs = new Date(`${data.view.timeAxisStart}T00:00:00Z`).getTime();
  const finishMs = new Date(`${data.view.timeAxisFinish}T00:00:00Z`).getTime();
  const ticks = buildDateTicks(data.view.timeAxisStart, data.view.timeAxisFinish);
  const height = 60 + rows.length * GANTT_ROW_HEIGHT;

  return (
    <svg viewBox={`0 0 ${GANTT_WIDTH} ${height}`} className="scenario-editor-chart" role="img" aria-label="Scenario Gantt preview">
      <rect x="0" y="0" width={GANTT_WIDTH} height={height} rx="16" fill="#081120" />
      {ticks.map((tick) => {
        const x = scaleDate(tick, startMs, finishMs, GANTT_WIDTH, GANTT_LEFT, GANTT_RIGHT);
        return (
          <g key={tick}>
            <line x1={x} y1="32" x2={x} y2={height - 12} stroke="rgba(180, 194, 214, 0.12)" />
            <text x={x + 4} y="22" fill="#8aa2c1" fontSize="11">
              {new Date(`${tick}T00:00:00Z`).toLocaleDateString("en-AU", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC"
              })}
            </text>
          </g>
        );
      })}
      {rows.map((row, index) => {
        const y = 44 + index * GANTT_ROW_HEIGHT;
        const x1 = scaleDate(row.startDate, startMs, finishMs, GANTT_WIDTH, GANTT_LEFT, GANTT_RIGHT);
        const x2 = scaleDate(row.finishDate, startMs, finishMs, GANTT_WIDTH, GANTT_LEFT, GANTT_RIGHT);
        const isSelected = row.activityId !== null && row.activityId === selectedActivityId;
        const href =
          row.activityId === null
            ? undefined
            : editorUrl(scenarioId, {
                selectedActivityId: row.activityId,
                selectedOperationalId
              });

        return (
          <g key={row.id}>
            <rect
              x="12"
              y={y - 2}
              width={GANTT_WIDTH - 24}
              height={GANTT_ROW_HEIGHT - 2}
              fill={isSelected ? "rgba(111, 173, 255, 0.12)" : "transparent"}
              rx="8"
            />
            <text x={24 + row.depth * 16} y={y + 15} fill="#e5edf8" fontSize="12">
              {row.label}
            </text>
            {href ? (
              <a href={href}>
                <rect
                  x={x1}
                  y={y + 4}
                  width={Math.max(6, x2 - x1)}
                  height="14"
                  rx="7"
                  fill={ganttBarColor(row)}
                  stroke={isSelected ? "#ffffff" : "rgba(255,255,255,0.18)"}
                />
              </a>
            ) : (
              <rect
                x={x1}
                y={y + 4}
                width={Math.max(6, x2 - x1)}
                height="14"
                rx="7"
                fill={ganttBarColor(row)}
                opacity="0.8"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function renderLinearPreview(
  data: LinearScheduleData,
  scenarioId: string,
  selectedActivityId: string | null,
  selectedOperationalId: string | null
) {
  const startMs = new Date(`${data.view.timeAxisStart}T00:00:00Z`).getTime();
  const finishMs = new Date(`${data.view.timeAxisFinish}T00:00:00Z`).getTime();
  const ticks = buildDateTicks(data.view.timeAxisStart, data.view.timeAxisFinish);
  const locationById = new Map(data.axis.locations.map((location) => [location.id, location]));
  const height = LINEAR_TOP + LINEAR_BOTTOM + Math.max(180, data.axis.locations.length * 48);

  const yForLocation = (locationRef: string | null) => {
    const location = locationRef ? locationById.get(locationRef) : null;
    const order = location?.order ?? 0;
    return LINEAR_TOP + 24 + order * 42;
  };

  return (
    <svg viewBox={`0 0 ${LINEAR_WIDTH} ${height}`} className="scenario-editor-chart" role="img" aria-label="Scenario linear preview">
      <rect x="0" y="0" width={LINEAR_WIDTH} height={height} rx="16" fill="#081120" />
      {ticks.map((tick) => {
        const x = scaleDate(tick, startMs, finishMs, LINEAR_WIDTH, LINEAR_LEFT, LINEAR_RIGHT);
        return (
          <g key={tick}>
            <line x1={x} y1={LINEAR_TOP} x2={x} y2={height - LINEAR_BOTTOM} stroke="rgba(180, 194, 214, 0.12)" />
            <text x={x + 4} y="18" fill="#8aa2c1" fontSize="11">
              {new Date(`${tick}T00:00:00Z`).toLocaleDateString("en-AU", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC"
              })}
            </text>
          </g>
        );
      })}
      {data.axis.locations.map((location) => {
        const y = yForLocation(location.id);
        return (
          <g key={location.id}>
            <line x1={LINEAR_LEFT} y1={y} x2={LINEAR_WIDTH - LINEAR_RIGHT} y2={y} stroke="rgba(180, 194, 214, 0.12)" />
            <text x="18" y={y + 4} fill="#d6deea" fontSize="12">
              {location.label}
            </text>
          </g>
        );
      })}
      {data.activities.map((activity) => {
        const x1 = scaleDate(activity.startDate, startMs, finishMs, LINEAR_WIDTH, LINEAR_LEFT, LINEAR_RIGHT);
        const x2 = scaleDate(activity.finishDate, startMs, finishMs, LINEAR_WIDTH, LINEAR_LEFT, LINEAR_RIGHT);
        const y1 = yForLocation(activity.startLocationRef ?? activity.locationRef);
        const y2 = yForLocation(activity.finishLocationRef ?? activity.locationRef);
        const isSelected = activity.id === selectedActivityId;
        const href = editorUrl(scenarioId, {
          selectedActivityId: activity.id,
          selectedOperationalId
        });

        return (
          <a key={activity.id} href={href}>
            {activity.activityType === "milestone" ? (
              <circle cx={x1} cy={y1} r="6" fill={isSelected ? "#ffffff" : "#ffd166"} />
            ) : (
              <path
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                stroke={isSelected ? "#ffffff" : ganttBarColor({
                  id: activity.id,
                  rowKind: "activity",
                  hierarchyLevel: "activity",
                  parentId: null,
                  depth: 0,
                  label: activity.activityName,
                  groupLabel: activity.sequenceGroup ?? "",
                  childIds: [],
                  activityIds: [activity.id],
                  startDate: activity.startDate,
                  finishDate: activity.finishDate,
                  activityId: activity.id,
                  activityType: activity.activityType,
                  displayLayer: activity.displayLayer,
                  colorKey: activity.colorKey,
                  packageId: activity.packageId,
                  workfront: activity.workfront,
                  sequenceGroup: activity.sequenceGroup,
                  sequenceOrder: activity.sequenceOrder
                })}
                strokeWidth={isSelected ? "5" : "4"}
                fill="none"
                strokeLinecap="round"
              />
            )}
          </a>
        );
      })}
    </svg>
  );
}

function scenarioStatusOptions(currentStatus: string) {
  const statuses = ["baseline", "active", "draft", "archived"];
  return statuses.includes(currentStatus) ? statuses : [...statuses, currentStatus];
}

function constructionStateOptions(currentValue: string | null) {
  const values = [
    "not_started",
    "ready",
    "in_progress",
    "blocked",
    "complete"
  ];
  return currentValue && !values.includes(currentValue) ? [...values, currentValue] : values;
}

function ActivityEditorForm(props: {
  scenarioId: string;
  selectedOperationalId: string | null;
  activity: LinearScheduleActivityRow | null;
  activityChoices: Array<{ packageId: string | null; activityName: string }>;
  packages: LinearScheduleData["packages"];
  workfronts: LinearScheduleData["workfronts"];
  locations: LinearScheduleData["axis"]["locations"];
}) {
  const { activity, activityChoices, packages, workfronts, locations } = props;
  if (!activity) {
    return <p className="muted">Select a Gantt or linear schedule activity to edit it.</p>;
  }

  return (
    <>
      <form action={saveScheduleActivityAction} className="stack-form">
        <input type="hidden" name="scenarioId" value={props.scenarioId} />
        <input type="hidden" name="activityId" value={activity.id} />
        <input type="hidden" name="selectedOperationalId" value={props.selectedOperationalId ?? ""} />
        <SelectedActivityFields
          initialPackageId={activity.packageId}
          initialActivityName={activity.activityName}
          activityChoices={activityChoices}
          packages={packages}
        />
        <label>
          <span>Workfront</span>
          <input name="workfront" type="text" list="scenario-editor-workfronts" defaultValue={activity.workfront ?? ""} />
        </label>
        <label>
          <span>Color key</span>
          <input name="colorKey" type="text" defaultValue={activity.colorKey ?? ""} />
        </label>
        <div className="form-grid">
          <label>
            <span>Start</span>
            <input name="startDate" type="date" defaultValue={activity.startDate} />
          </label>
          <label>
            <span>Finish</span>
            <input name="finishDate" type="date" defaultValue={activity.finishDate} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>Start location</span>
            <select name="startLocationRef" defaultValue={activity.startLocationRef ?? ""}>
              <option value="">Use activity location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Finish location</span>
            <select name="finishLocationRef" defaultValue={activity.finishLocationRef ?? ""}>
              <option value="">Use activity location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>Reference location</span>
          <select name="locationRef" defaultValue={activity.locationRef ?? ""}>
            <option value="">None</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            <span>Sequence group</span>
            <input name="sequenceGroup" type="text" defaultValue={activity.sequenceGroup ?? ""} />
          </label>
          <label>
            <span>Sequence order</span>
            <input name="sequenceOrder" type="number" defaultValue={activity.sequenceOrder ?? ""} />
          </label>
        </div>
        <PreserveScrollSubmitButton>Save activity</PreserveScrollSubmitButton>
      </form>
      <form action={deleteScheduleActivityAction}>
        <input type="hidden" name="scenarioId" value={props.scenarioId} />
        <input type="hidden" name="activityId" value={activity.id} />
        <input type="hidden" name="selectedOperationalId" value={props.selectedOperationalId ?? ""} />
        <button type="submit" className="secondary-button danger-button">
          Delete selected activity
        </button>
      </form>
      <datalist id="scenario-editor-workfronts">
        {workfronts.map((workfront) => (
          <option key={workfront.id} value={workfront.id} />
        ))}
      </datalist>
    </>
  );
}

function OperationalEditorForm(props: {
  scenarioId: string;
  selectedActivityId: string | null;
  row: ScenarioEditorOperationalRow | null;
  packages: LinearScheduleData["packages"];
}) {
  const { row, packages } = props;
  if (!row) {
    return <p className="muted">Select an operational row to stage package, sequence, and date changes.</p>;
  }

  return (
    <>
      <p className="muted">
        Operational edits are staged as draft model approvals. Submit and approve them on the{" "}
        <Link href="/change-sets">Model Change Approvals</Link> page before Archicad sync.
      </p>
      <form action={saveOperationalRowAction} className="stack-form">
        <input type="hidden" name="scenarioId" value={props.scenarioId} />
        <input type="hidden" name="operationalRowId" value={row.id} />
        <input type="hidden" name="selectedActivityId" value={props.selectedActivityId ?? ""} />
        <label>
          <span>Package</span>
          <select name="packageId" defaultValue={row.packageId ?? ""}>
            <option value="">Unassigned</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Construction state</span>
          <select name="constructionState" defaultValue={row.constructionState ?? ""}>
            <option value="">Unspecified</option>
            {constructionStateOptions(row.constructionState).map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            <span>Sequence group</span>
            <input name="sequenceGroup" type="text" defaultValue={row.sequenceGroup ?? ""} />
          </label>
          <label>
            <span>Sequence order</span>
            <input name="sequenceOrder" type="number" defaultValue={row.sequenceOrder ?? ""} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>Planned start</span>
            <input name="plannedStart" type="date" defaultValue={row.plannedStart ?? ""} />
          </label>
          <label>
            <span>Planned finish</span>
            <input name="plannedFinish" type="date" defaultValue={row.plannedFinish ?? ""} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>Actual start</span>
            <input name="actualStart" type="date" defaultValue={row.actualStart ?? ""} />
          </label>
          <label>
            <span>Actual finish</span>
            <input name="actualFinish" type="date" defaultValue={row.actualFinish ?? ""} />
          </label>
        </div>
        <button type="submit">Create draft change set</button>
      </form>
    </>
  );
}

function durationDays(startDate: string, finishDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const finish = new Date(`${finishDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((finish - start) / (24 * 60 * 60 * 1000)) + 1);
}

function ProgrammeWorkspace(props: {
  scenarioId: string;
  data: LinearScheduleData;
  selectedActivityId: string | null;
  selectedOperationalId: string | null;
}) {
  const { scenarioId, data, selectedActivityId, selectedOperationalId } = props;
  const summaryRows = data.ganttRows.filter((row) => row.rowKind === "summary");
  const editableSummaryRows = summaryRows.filter((row) => !row.id.startsWith("package:"));
  const activityById = new Map(data.activities.map((activity) => [activity.id, activity]));

  return (
    <section className="panel programme-workspace">
      <div className="section-heading app-title-panel app-title-panel--compact">
        <div className="app-title-panel__content">
          <p className="eyebrow">Programme Editor</p>
          <h2>WBS / Task Table</h2>
          <p className="muted">
            Modify programme records here. The Gantt and linear schedule remain linked views of the
            same activities, hierarchy, and dependencies.
          </p>
        </div>
        <div className="programme-toolbar">
          <a href="#programme-new-activity" className="outline-link">Add activity</a>
          <a href="#programme-new-wbs-row" className="outline-link">Add WBS row</a>
          <a href="#programme-dependencies" className="outline-link">Dependencies</a>
        </div>
      </div>

      <div className="programme-grid programme-grid-header">
        <span>#</span>
        <span>WBS / Task</span>
        <span>Package</span>
        <span>Start</span>
        <span>Finish</span>
        <span>Dur.</span>
        <span>Layer</span>
        <span>Workfront</span>
        <span>Controls</span>
      </div>

      <div className="programme-row-stack">
        {data.ganttRows.map((row, index) => {
          if (row.rowKind === "summary") {
            const editable = !row.id.startsWith("package:");
            return (
              <div className="programme-grid programme-row programme-row-summary" key={row.id}>
                <span>{index + 1}</span>
                <div style={{ paddingLeft: `${row.depth * 16}px` }}>
                  {editable ? (
                    <form action={updateGanttHierarchyNodeAction} className="programme-inline-form">
                      <input type="hidden" name="scenarioId" value={scenarioId} />
                      <input type="hidden" name="nodeId" value={row.id} />
                      <input type="hidden" name="selectedActivityId" value={selectedActivityId ?? ""} />
                      <input type="hidden" name="selectedOperationalId" value={selectedOperationalId ?? ""} />
                      <input name="label" defaultValue={row.label} aria-label="WBS row label" />
                      <button type="submit" className="secondary-button">Save</button>
                    </form>
                  ) : (
                    <strong>{row.label}</strong>
                  )}
                  <div className="muted">{row.hierarchyLevel} / {row.activityIds.length} linked activities</div>
                </div>
                <span>{row.packageId ?? "-"}</span>
                <span>{row.startDate}</span>
                <span>{row.finishDate}</span>
                <span>{durationDays(row.startDate, row.finishDate)}d</span>
                <span>summary</span>
                <span>{row.groupLabel}</span>
                <div className="programme-row-actions">
                  {editable ? (
                    <>
                      {(["up", "down", "indent", "outdent"] as const).map((direction) => (
                        <form action={moveGanttHierarchyNodeAction} key={direction}>
                          <input type="hidden" name="scenarioId" value={scenarioId} />
                          <input type="hidden" name="nodeId" value={row.id} />
                          <input type="hidden" name="direction" value={direction} />
                          <input type="hidden" name="selectedActivityId" value={selectedActivityId ?? ""} />
                          <input type="hidden" name="selectedOperationalId" value={selectedOperationalId ?? ""} />
                          <button type="submit" className="mini-button">{direction}</button>
                        </form>
                      ))}
                      <form action={deleteGanttHierarchyNodeAction}>
                        <input type="hidden" name="scenarioId" value={scenarioId} />
                        <input type="hidden" name="nodeId" value={row.id} />
                        <input type="hidden" name="selectedActivityId" value={selectedActivityId ?? ""} />
                        <input type="hidden" name="selectedOperationalId" value={selectedOperationalId ?? ""} />
                        <button type="submit" className="mini-button danger-button">delete</button>
                      </form>
                    </>
                  ) : (
                    <span className="muted">package root</span>
                  )}
                </div>
              </div>
            );
          }

          const activity = row.activityId ? activityById.get(row.activityId) : null;
          if (!activity) {
            return null;
          }

          return (
            <form
              action={saveScheduleActivityAction}
              className={activity.id === selectedActivityId ? "programme-grid programme-row programme-row-active" : "programme-grid programme-row"}
              key={row.id}
            >
              <input type="hidden" name="scenarioId" value={scenarioId} />
              <input type="hidden" name="activityId" value={activity.id} />
              <input type="hidden" name="selectedOperationalId" value={selectedOperationalId ?? ""} />
              <span>{index + 1}</span>
              <div style={{ paddingLeft: `${row.depth * 16}px` }}>
                <input name="activityName" defaultValue={activity.activityName} aria-label="Activity name" />
                <div className="muted">{activity.activityType} / {activity.locationRef ?? activity.startLocationRef ?? "no location"}</div>
              </div>
              <select name="packageId" defaultValue={activity.packageId ?? ""} aria-label="Activity package">
                <option value="">Unassigned</option>
                {data.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.label}</option>
                ))}
              </select>
              <input name="startDate" type="date" defaultValue={activity.startDate} aria-label="Start date" />
              <input name="finishDate" type="date" defaultValue={activity.finishDate} aria-label="Finish date" />
              <span>{durationDays(activity.startDate, activity.finishDate)}d</span>
              <select name="displayLayer" defaultValue={activity.displayLayer} aria-label="Activity layer" disabled>
                <option value={activity.displayLayer}>{activity.displayLayer}</option>
              </select>
              <input name="workfront" defaultValue={activity.workfront ?? ""} aria-label="Workfront" />
              <div className="programme-row-actions">
                <input type="hidden" name="colorKey" value={activity.colorKey ?? ""} />
                <input type="hidden" name="locationRef" value={activity.locationRef ?? ""} />
                <input type="hidden" name="startLocationRef" value={activity.startLocationRef ?? ""} />
                <input type="hidden" name="finishLocationRef" value={activity.finishLocationRef ?? ""} />
                <input type="hidden" name="sequenceGroup" value={activity.sequenceGroup ?? ""} />
                <input type="hidden" name="sequenceOrder" value={activity.sequenceOrder ?? ""} />
                <button type="submit" className="secondary-button">Save</button>
                <Link
                  href={editorUrl(scenarioId, {
                    selectedActivityId: activity.id,
                    selectedOperationalId
                  })}
                >
                  Inspect
                </Link>
              </div>
            </form>
          );
        })}
      </div>

      <div className="programme-control-grid">
        <div className="compact-edit-panel" id="programme-new-wbs-row">
          <h3>Create WBS Row</h3>
          <form action={createGanttHierarchyNodeAction} className="stack-form">
            <input type="hidden" name="scenarioId" value={scenarioId} />
            <input type="hidden" name="selectedActivityId" value={selectedActivityId ?? ""} />
            <input type="hidden" name="selectedOperationalId" value={selectedOperationalId ?? ""} />
            <label><span>Label</span><input name="label" placeholder="Frame sequence" /></label>
            <label>
              <span>Package</span>
              <select name="packageId" defaultValue={data.packages[0]?.id ?? ""}>
                {data.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Parent</span>
              <select name="parentId" defaultValue="">
                <option value="">Package root</option>
                {summaryRows.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Level</span>
              <select name="hierarchyLevel" defaultValue="task">
                <option value="subtask">subtask</option>
                <option value="task">task</option>
              </select>
            </label>
            <button type="submit">Create WBS row</button>
          </form>
        </div>

        <div className="compact-edit-panel" id="programme-dependencies">
          <h3>Dependencies</h3>
          <p className="muted">First pass supports finish-to-start dependencies only.</p>
          <form action={createScheduleDependencyAction} className="stack-form">
            <input type="hidden" name="scenarioId" value={scenarioId} />
            <input type="hidden" name="selectedActivityId" value={selectedActivityId ?? ""} />
            <input type="hidden" name="selectedOperationalId" value={selectedOperationalId ?? ""} />
            <label>
              <span>Predecessor</span>
              <select name="predecessorActivityId" defaultValue="">
                <option value="">Select predecessor</option>
                {data.activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>{activity.activityName}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Successor</span>
              <select name="successorActivityId" defaultValue={selectedActivityId ?? ""}>
                <option value="">Select successor</option>
                {data.activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>{activity.activityName}</option>
                ))}
              </select>
            </label>
            <button type="submit">Link finish-to-start</button>
          </form>
          <div className="dependency-list">
            {data.dependencies.length === 0 ? <p className="muted">No dependencies yet.</p> : null}
            {data.dependencies.map((dependency) => {
              const predecessor = activityById.get(dependency.predecessorActivityId);
              const successor = activityById.get(dependency.successorActivityId);
              return (
                <div className="dependency-row" key={dependency.id}>
                  <span>
                    {predecessor?.activityName ?? dependency.predecessorActivityId} {"->"}{" "}
                    {successor?.activityName ?? dependency.successorActivityId}
                  </span>
                  <form action={deleteScheduleDependencyAction}>
                    <input type="hidden" name="scenarioId" value={scenarioId} />
                    <input type="hidden" name="dependencyId" value={dependency.id} />
                    <input type="hidden" name="selectedActivityId" value={selectedActivityId ?? ""} />
                    <input type="hidden" name="selectedOperationalId" value={selectedOperationalId ?? ""} />
                    <button type="submit" className="mini-button danger-button">delete</button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="muted">
        Editable WBS rows: {editableSummaryRows.length}. Direct chart drag/resize remains deferred; chart
        interaction should call these same actions when it is added.
      </p>
    </section>
  );
}

export default async function ScenarioEditorPage({ params, searchParams }: PageProps) {
  const { scenarioId } = await params;
  const query = (await searchParams) ?? {};
  const status = typeof query.status === "string" ? query.status : null;
  const error = typeof query.error === "string" ? query.error : null;
  const selectedActivityIdParam = typeof query.activityId === "string" ? query.activityId : null;
  const selectedOperationalIdParam = typeof query.operationalId === "string" ? query.operationalId : null;

  const [data, portfolio, assumptionGraph] = await Promise.all([
    getScenarioEditorData(scenarioId),
    getFeasibilityPortfolio(),
    getAssumptionGraphData()
  ]);
  const siteScenarioLink =
    portfolio.sites
      .flatMap((site) => site.scenarioOptions.map((option) => ({ site, option })))
      .find((item) => item.option.scenario_id === scenarioId) ?? null;
  const scenarioMidBand = siteScenarioLink?.option.costBands.find((band) => band.range_key === "mid") ?? null;
  const selectedActivity =
    data.linearScheduleData.activities.find((activity) => activity.id === selectedActivityIdParam) ??
    data.linearScheduleData.activities[0] ??
    null;
  const activityOperationalRow =
    selectedActivity?.objectRefType && selectedActivity.objectRefId
      ? data.operationalRows.find(
          (row) =>
            row.objectRefType === selectedActivity.objectRefType &&
            row.objectRefId === selectedActivity.objectRefId
        ) ?? null
      : null;
  const selectedOperationalRow =
    data.operationalRows.find((row) => row.id === selectedOperationalIdParam) ??
    activityOperationalRow ??
    data.operationalRows[0] ??
    null;
  const activityChoices = data.linearScheduleData.activities.map((activity) => ({
    packageId: activity.packageId,
    activityName: activity.activityName
  }));

  return (
    <>
      <RestoreScrollOnLoad />
      <section className="panel">
        <div className="section-heading app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Scenario Workspace</p>
            <h2>Scenario Editor</h2>
            <p className="muted">
              Work the option here: feasibility evidence, programme, scenario-local operational state,
              Project Network review, and controlled Archicad metadata approvals stay connected.
            </p>
          </div>
          <Link href="/scenarios" className="secondary-link">
            Back to scenarios
          </Link>
        </div>
        {status ? <div className="notice notice-success">{status}</div> : null}
        {error ? <div className="notice notice-error">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="section-heading app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Active Scenario</p>
            <h2>{data.scenario.name}</h2>
            <p className="muted">
              Parent: {data.scenario.parentScenarioId ?? "none"} | Operational rows: {data.scenario.operationalStateCount} |
              Change sets: {data.scenario.changeSetCount}
            </p>
            {siteScenarioLink ? (
              <p className="muted">
                Site option: <Link href={`/sites/${siteScenarioLink.site.id}`}>{siteScenarioLink.option.name}</Link> on{" "}
                {siteScenarioLink.site.name} |{" "}
                <Link href={`/project-network?linkedRefType=scenario&linkedRefId=${scenarioId}`}>review network</Link>
              </p>
            ) : null}
          </div>
          <span className="tag">{data.scenario.status}</span>
        </div>

        <div className="scenario-editor-layout">
          <div className="scenario-editor-main">
            <ScenarioEditorVisuals
              scenarioId={scenarioId}
              data={data.linearScheduleData}
              operationalRows={data.operationalRows}
              selectedActivityId={selectedActivity?.id ?? null}
              selectedOperationalId={selectedOperationalRow?.id ?? null}
            />
          </div>

          <aside className="scenario-editor-side">
            <div className="panel panel-subtle">
              <h3>Scenario Record</h3>
              <form action={submitScenarioHeader} className="stack-form">
                <input type="hidden" name="scenarioId" value={scenarioId} />
                <input type="hidden" name="selectedActivityId" value={selectedActivity?.id ?? ""} />
                <input type="hidden" name="selectedOperationalId" value={selectedOperationalRow?.id ?? ""} />
                <label>
                  <span>Name</span>
                  <input name="name" type="text" defaultValue={data.scenario.name} />
                </label>
                <label>
                  <span>Status</span>
                  <select name="status" defaultValue={data.scenario.status}>
                    {scenarioStatusOptions(data.scenario.status).map((statusValue) => (
                      <option key={statusValue} value={statusValue}>
                        {statusValue}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Save scenario</button>
              </form>

              <div className="inline-actions">
                <form action={archiveScenarioAction}>
                  <input type="hidden" name="scenarioId" value={scenarioId} />
                  <button type="submit" className="secondary-button" disabled={data.scenario.status === "baseline"}>
                    Archive
                  </button>
                </form>
                <form action={deleteScenarioAction}>
                  <input type="hidden" name="scenarioId" value={scenarioId} />
                  <ConfirmSubmitButton
                    className="secondary-button danger-button"
                    disabled={data.scenario.status === "baseline" || data.scenario.changeSetCount > 0}
                    confirmMessage="Delete this scenario permanently? This will also remove its operational state and schedule records."
                  >
                    Delete
                  </ConfirmSubmitButton>
                </form>
              </div>
              <p className="muted">
                Baselines cannot be deleted directly. Scenarios with dependent change sets should be archived instead of
                deleted.
              </p>
            </div>

            <div className="panel panel-subtle">
              <h3>Scenario Feasibility</h3>
              {siteScenarioLink ? (
                <div className="detail-grid">
                  <div className="detail-card">
                    <strong>Planning Fit</strong>
                    <div className="muted">{siteScenarioLink.option.planning_fit ?? "n/a"}</div>
                  </div>
                  <div className="detail-card">
                    <strong>Mid Cost</strong>
                    <div className="muted">{formatCurrency(scenarioMidBand?.totalCost)}</div>
                  </div>
                  <div className="detail-card">
                    <strong>Revenue</strong>
                    <div className="muted">{formatCurrency(siteScenarioLink.option.salesAssumption?.gross_realisation)}</div>
                  </div>
                  <div className="detail-card">
                    <strong>Mid Margin</strong>
                    <div className="muted">{formatPercent(scenarioMidBand?.marginPercent)}</div>
                  </div>
                  <div className="detail-card">
                    <strong>Programme</strong>
                    <div className="muted">
                      {siteScenarioLink.option.scheduleSummary.activityCount > 0
                        ? `${siteScenarioLink.option.scheduleSummary.durationDays} days`
                        : "not scheduled"}
                    </div>
                  </div>
                  <div className="detail-card">
                    <strong>Evidence</strong>
                    <div className="muted">{siteScenarioLink.option.costPlanItems.length} cost items</div>
                  </div>
                </div>
              ) : (
                <p className="muted">
                  This scenario is not linked to a site option yet, so feasibility evidence is unavailable.
                </p>
              )}
              <div className="inline-actions">
                <Link href="/feasibility">Compare options</Link>
                <Link href={`/project-network?linkedRefType=scenario&linkedRefId=${scenarioId}`}>Open review network</Link>
              </div>
            </div>

            <div className="panel panel-subtle">
              <AssumptionGraphPanel
                graph={assumptionGraph}
                refType={siteScenarioLink?.option.id ? "scenario_option" : "scenario"}
                refId={siteScenarioLink?.option.id ?? scenarioId}
                title="Scenario Assumption Branch"
                description="Applied assumptions, validation owners, evidence requirements, and future simulation inputs for this scenario branch."
                compact
              />
            </div>

            <div className="panel panel-subtle">
              <h3>Selected Activity</h3>
              <ActivityEditorForm
                key={selectedActivity?.id ?? "no-selected-activity"}
                scenarioId={scenarioId}
                selectedOperationalId={selectedOperationalRow?.id ?? null}
                activity={selectedActivity}
                activityChoices={activityChoices}
                packages={data.linearScheduleData.packages}
                workfronts={data.linearScheduleData.workfronts}
                locations={data.linearScheduleData.axis.locations}
              />
            </div>

            <div className="panel panel-subtle" id="programme-new-activity">
              <h3>New Activity</h3>
              <form action={createScheduleActivityAction} className="stack-form">
                <input type="hidden" name="scenarioId" value={scenarioId} />
                <input type="hidden" name="selectedOperationalId" value={selectedOperationalRow?.id ?? ""} />
                <label>
                  <span>Name</span>
                  <input name="activityName" type="text" placeholder="New schedule activity" />
                </label>
                <div className="form-grid">
                  <label>
                    <span>Type</span>
                    <select name="activityType" defaultValue="linear">
                      <option value="linear">linear</option>
                      <option value="bar">bar</option>
                      <option value="block">block</option>
                      <option value="milestone">milestone</option>
                    </select>
                  </label>
                  <label>
                    <span>Layer</span>
                    <select name="displayLayer" defaultValue="planned">
                      <option value="baseline">baseline</option>
                      <option value="planned">planned</option>
                      <option value="actual">actual</option>
                      <option value="remaining">remaining</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>Package</span>
                  <select name="packageId" defaultValue="">
                    <option value="">Unassigned</option>
                    {data.linearScheduleData.packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Workfront</span>
                  <input name="workfront" type="text" />
                </label>
                <label>
                  <span>Color key</span>
                  <input name="colorKey" type="text" placeholder="structure" />
                </label>
                <div className="form-grid">
                  <label>
                    <span>Start</span>
                    <input name="startDate" type="date" defaultValue={data.linearScheduleData.view.timeAxisStart} />
                  </label>
                  <label>
                    <span>Finish</span>
                    <input name="finishDate" type="date" defaultValue={data.linearScheduleData.view.timeAxisStart} />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    <span>Start location</span>
                    <select name="startLocationRef" defaultValue="">
                      <option value="">None</option>
                      {data.linearScheduleData.axis.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Finish location</span>
                    <select name="finishLocationRef" defaultValue="">
                      <option value="">None</option>
                      {data.linearScheduleData.axis.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    <span>Sequence group</span>
                    <input name="sequenceGroup" type="text" />
                  </label>
                  <label>
                    <span>Sequence order</span>
                    <input name="sequenceOrder" type="number" />
                  </label>
                </div>
                <button type="submit">Create activity</button>
              </form>
            </div>

            <div className="panel panel-subtle">
              <h3>Selected Operational Row</h3>
              <OperationalEditorForm
                key={selectedOperationalRow?.id ?? "no-selected-operational-row"}
                scenarioId={scenarioId}
                selectedActivityId={selectedActivity?.id ?? null}
                row={selectedOperationalRow}
                packages={data.linearScheduleData.packages}
              />
            </div>
          </aside>
        </div>
      </section>

      <ProgrammeWorkspace
        scenarioId={scenarioId}
        data={data.linearScheduleData}
        selectedActivityId={selectedActivity?.id ?? null}
        selectedOperationalId={selectedOperationalRow?.id ?? null}
      />

      <section className="panel">
        <div className="app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Operational State</p>
            <h2>Operational State Rows</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Object</th>
              <th>Package</th>
              <th>State</th>
              <th>Planned</th>
              <th>Actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.operationalRows.map((row) => (
              <tr key={row.id} className={row.id === selectedOperationalRow?.id ? "table-row-active" : undefined}>
                <td>
                  {row.label}
                  <div className="muted">{row.objectRefType}</div>
                </td>
                <td>{row.packageId ?? "unassigned"}</td>
                <td>{row.constructionState ?? "-"}</td>
                <td>
                  {row.plannedStart ?? "-"} to {row.plannedFinish ?? "-"}
                </td>
                <td>
                  {row.actualStart ?? "-"} to {row.actualFinish ?? "-"}
                </td>
                <td>
                  <Link
                    href={editorUrl(scenarioId, {
                      selectedActivityId: selectedActivity?.id ?? null,
                      selectedOperationalId: row.id
                    })}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </>
  );
}
