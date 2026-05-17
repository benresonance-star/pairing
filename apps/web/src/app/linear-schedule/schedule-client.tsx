"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { LinearActivityType } from "../../../../../shared/contracts/api/index";
import type { LinearScheduleActivityRow, LinearScheduleData } from "../../lib/linear-schedule";

type ScheduleFilters = {
  scenarioId: string | null;
  packageIds: string[];
  workfront: string | null;
  activityType: LinearActivityType | null;
};

type TimeFocus = "full" | "data_date" | "selected";
type TimeWindow = { start: string; end: string; label: string };

type Props = {
  data: LinearScheduleData;
  filters: ScheduleFilters;
  embedded?: boolean;
  initialSelectedActivityId?: string | null;
  onSelectedActivityChange?: (activityId: string | null) => void;
};

const LINEAR_LEFT_GUTTER = 210;
const LINEAR_TOP_GUTTER = 124;
const LINEAR_HEADER_CLEARANCE = 42;
const LINEAR_RIGHT_GUTTER = 48;
const LINEAR_BOTTOM_GUTTER = 84;
const LINEAR_CHART_WIDTH = 1180;
const LINEAR_ROW_HEIGHT = 96;

const GANTT_TOP_GUTTER = 108;
const GANTT_HEADER_CLEARANCE = 34;
const GANTT_RIGHT_GUTTER = 48;
const GANTT_BOTTOM_GUTTER = 52;
const GANTT_CHART_WIDTH = 1180;
const GANTT_ROW_HEIGHT = 42;
const GANTT_LABEL_X = 18;
const GANTT_TREE_INDENT = 18;
const GANTT_COLUMN_GAP = 16;
const GANTT_MIN_BREAKDOWN_WIDTH = 190;
const GANTT_MIN_GROUP_WIDTH = 110;
const GANTT_MIN_TIME_WIDTH = 360;
const GANTT_DEFAULT_BREAKDOWN_WIDTH = 190;
const GANTT_DEFAULT_GROUP_WIDTH = 110;
const FLOW_CHART_WIDTH = 1280;
const FLOW_NODE_HEIGHT = 54;
const FLOW_NODE_SUBITEM_HEIGHT = 16;
const FLOW_TOP_GUTTER = 24;
const FLOW_BOTTOM_GUTTER = 24;
const MAX_ZOOM_LEVEL = 5;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MIN_VISIBLE_SPAN_MS = DAY_IN_MS * 3;

const COLOR_KEY: Record<string, string> = {
  siteworks: "#8ec5ff",
  civils: "#59d0a8",
  structure: "#7f8cff",
  envelope: "#f28f6c",
  services: "#c77dff",
  interiors: "#ffd166",
  externals: "#5dd39e",
  commissioning: "#ff6b9a",
  milestone: "#ffd166"
};

const COLOR_LABEL: Record<string, string> = {
  siteworks: "Siteworks",
  civils: "Civil and services",
  structure: "Structure",
  envelope: "Envelope and facade",
  services: "Services",
  interiors: "Interiors",
  externals: "External works",
  commissioning: "Commissioning",
  milestone: "Milestone"
};

const LAYER_STYLE: Record<string, { opacity: number; dash?: string; strokeWidth: number }> = {
  baseline: { opacity: 0.35, dash: "6 6", strokeWidth: 2 },
  planned: { opacity: 0.85, strokeWidth: 3 },
  actual: { opacity: 1, strokeWidth: 4 },
  remaining: { opacity: 0.8, dash: "3 4", strokeWidth: 3 }
};

function buildTimeTicks(startDate: string, finishDate: string) {
  const ticks: Array<{ label: string; iso: string }> = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const finish = new Date(`${finishDate}T00:00:00Z`);
  const spanDays = Math.max(1, Math.round((finish.getTime() - start.getTime()) / DAY_IN_MS));

  if (spanDays <= 35) {
    const cursor = new Date(start);
    while (cursor <= finish) {
      ticks.push({
        label: cursor.toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          timeZone: "UTC"
        }),
        iso: cursor.toISOString().slice(0, 10)
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return ticks;
  }

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= finish) {
    ticks.push({
      label: cursor.toLocaleDateString("en-AU", {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }),
      iso: cursor.toISOString().slice(0, 10)
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

function isoWeekNumber(date: Date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / DAY_IN_MS + 1) / 7);
}

function buildWeekGridTicks(startDate: string, finishDate: string) {
  const ticks: Array<{ iso: string; label: string }> = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const finish = new Date(`${finishDate}T00:00:00Z`);
  const cursor = new Date(start);
  const dayOfWeek = cursor.getUTCDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + daysUntilMonday);

  while (cursor <= finish) {
    ticks.push({
      iso: cursor.toISOString().slice(0, 10),
      label: String(isoWeekNumber(cursor)).padStart(2, "0")
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return ticks;
}

function xForDate(
  dateValue: string,
  startMs: number,
  endMs: number,
  width: number,
  leftGutter: number,
  rightGutter: number
) {
  const innerWidth = width - leftGutter - rightGutter;
  const value = new Date(`${dateValue}T00:00:00Z`).getTime();
  if (endMs === startMs) {
    return leftGutter;
  }
  return leftGutter + ((value - startMs) / (endMs - startMs)) * innerWidth;
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

function layerLabel(layer: string) {
  return layer.replaceAll("_", " ");
}

function activityTooltip(activity: LinearScheduleActivityRow) {
  const lines = [
    activity.activityName,
    `Type: ${activity.activityType}`,
    `Layer: ${layerLabel(activity.displayLayer)}`,
    `Dates: ${activity.startDate} to ${activity.finishDate}`
  ];
  if (activity.packageId) {
    lines.push(`Package: ${activity.packageId}`);
  }
  if (activity.workfront) {
    lines.push(`Workfront: ${activity.workfront}`);
  }
  if (activity.sequenceGroup) {
    lines.push(`Sequence: ${activity.sequenceGroup}`);
  }
  return lines.join("\n");
}

function progressTooltip(
  point: LinearScheduleData["progressPoints"][number],
  activityName: string | null
) {
  const lines = [`Progress sample: ${point.progressDate}`, `Location: ${point.locationRef}`];
  if (activityName) {
    lines.unshift(activityName);
  }
  if (point.note) {
    lines.push(`Note: ${point.note}`);
  }
  return lines.join("\n");
}

function flowNodeTooltip(
  node: LinearScheduleData["flow"]["nodes"][number],
  matchedActivities: LinearScheduleActivityRow[]
) {
  const lines = [node.label];
  if (node.subItems.length > 0) {
    lines.push(...node.subItems.map((item) => `- ${item}`));
  }
  lines.push(`${matchedActivities.length} linked schedule item${matchedActivities.length === 1 ? "" : "s"}`);
  return lines.join("\n");
}

function labelTextStyle(color: string) {
  return {
    fill: color,
    fontSize: 11,
    fontWeight: 600 as const
  };
}

function labelBadgeWidth(label: string) {
  return Math.max(44, label.length * 6.6 + 12);
}

function renderLabelBadge(options: {
  x: number;
  y: number;
  label: string;
  color: string;
  anchor?: "start" | "middle";
  rotation?: number;
}) {
  const width = labelBadgeWidth(options.label);
  const height = 18;
  const anchor = options.anchor ?? "start";
  const left = anchor === "middle" ? options.x - width / 2 : options.x;
  const transform = options.rotation
    ? `rotate(${options.rotation} ${options.x} ${options.y})`
    : undefined;

  return (
    <g transform={transform}>
      <rect
        x={left}
        y={options.y - height + 4}
        width={width}
        height={height}
        rx="8"
        fill="rgba(13, 22, 40, 0.94)"
        stroke={options.color}
        strokeOpacity="0.35"
      />
      <text
        x={anchor === "middle" ? options.x : options.x + 6}
        y={options.y - 3}
        textAnchor={anchor}
        style={labelTextStyle(options.color)}
      >
        {options.label}
      </text>
    </g>
  );
}

function shouldRenderActivityLabel(
  activity: LinearScheduleActivityRow,
  spanLength: number,
  isFocusedView: boolean
) {
  if (activity.activityType === "milestone") {
    return true;
  }
  if (activity.activityType === "bar") {
    return spanLength >= (isFocusedView ? 70 : 100);
  }
  if (activity.activityType === "block") {
    return spanLength >= (isFocusedView ? 95 : 130);
  }
  return spanLength >= (isFocusedView ? 110 : 155);
}

function intersectsWindow(startDate: string, finishDate: string, windowStart: string, windowEnd: string) {
  return finishDate >= windowStart && startDate <= windowEnd;
}

function resolveWindow(
  data: LinearScheduleData,
  focus: TimeFocus,
  selectedActivity: LinearScheduleActivityRow | null
): TimeWindow {
  const fullStart = data.view.timeAxisStart;
  const fullEnd = data.view.timeAxisFinish;

  if (focus === "selected" && selectedActivity) {
    const selectedStart = new Date(`${selectedActivity.startDate}T00:00:00Z`);
    const selectedEnd = new Date(`${selectedActivity.finishDate}T00:00:00Z`);
    selectedStart.setUTCDate(selectedStart.getUTCDate() - 7);
    selectedEnd.setUTCDate(selectedEnd.getUTCDate() + 7);
    return {
      start: selectedStart.toISOString().slice(0, 10),
      end: selectedEnd.toISOString().slice(0, 10),
      label: "Selected activity"
    };
  }

  if (focus === "data_date" && data.view.dataDate) {
    const dataDate = new Date(`${data.view.dataDate}T00:00:00Z`);
    const windowStart = new Date(dataDate);
    const windowEnd = new Date(dataDate);
    windowStart.setUTCDate(windowStart.getUTCDate() - 14);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 21);
    return {
      start: windowStart.toISOString().slice(0, 10) < fullStart ? fullStart : windowStart.toISOString().slice(0, 10),
      end: windowEnd.toISOString().slice(0, 10) > fullEnd ? fullEnd : windowEnd.toISOString().slice(0, 10),
      label: "Near data date"
    };
  }

  return {
    start: fullStart,
    end: fullEnd,
    label: "Full window"
  };
}

function dateToMs(dateValue: string) {
  return new Date(`${dateValue}T00:00:00Z`).getTime();
}

function msToDateString(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function visibleSpanDays(window: TimeWindow) {
  return Math.max(1, Math.round((dateToMs(window.end) - dateToMs(window.start)) / DAY_IN_MS));
}

function visibleSpanMs(window: TimeWindow) {
  return Math.max(MIN_VISIBLE_SPAN_MS, dateToMs(window.end) - dateToMs(window.start));
}

function centerDateForWindow(window: TimeWindow) {
  return msToDateString(dateToMs(window.start) + visibleSpanMs(window) / 2);
}

function clampCenterMs(baseWindow: TimeWindow, spanMs: number, centerMs: number) {
  const baseStartMs = dateToMs(baseWindow.start);
  const baseEndMs = dateToMs(baseWindow.end);
  const halfSpan = spanMs / 2;

  if (baseEndMs - baseStartMs <= spanMs) {
    return baseStartMs + (baseEndMs - baseStartMs) / 2;
  }

  return Math.min(baseEndMs - halfSpan, Math.max(baseStartMs + halfSpan, centerMs));
}

function applyZoomToWindow(baseWindow: TimeWindow, zoomLevel: number, anchorDate: string): TimeWindow {
  if (zoomLevel <= 0) {
    return baseWindow;
  }

  const baseStartMs = dateToMs(baseWindow.start);
  const baseEndMs = dateToMs(baseWindow.end);
  const baseSpanMs = Math.max(MIN_VISIBLE_SPAN_MS, baseEndMs - baseStartMs);
  const targetSpanMs = Math.max(MIN_VISIBLE_SPAN_MS, Math.round(baseSpanMs / Math.pow(2, zoomLevel)));
  const centerMs = clampCenterMs(
    baseWindow,
    targetSpanMs,
    Math.min(baseEndMs, Math.max(baseStartMs, dateToMs(anchorDate)))
  );
  const nextStartMs = centerMs - targetSpanMs / 2;
  const nextEndMs = centerMs + targetSpanMs / 2;

  return {
    start: msToDateString(nextStartMs),
    end: msToDateString(nextEndMs),
    label: baseWindow.label
  };
}

function zoomAnchorDate(
  baseWindow: TimeWindow,
  selectedActivity: LinearScheduleActivityRow | null,
  dataDate: string | null
) {
  if (selectedActivity) {
    const startMs = dateToMs(selectedActivity.startDate);
    const endMs = dateToMs(selectedActivity.finishDate);
    return msToDateString(startMs + (endMs - startMs) / 2);
  }
  if (dataDate && dataDate >= baseWindow.start && dataDate <= baseWindow.end) {
    return dataDate;
  }
  return msToDateString(dateToMs(baseWindow.start) + (dateToMs(baseWindow.end) - dateToMs(baseWindow.start)) / 2);
}

function activityBaseOpacity(
  activityId: string,
  highlightedActivityIds: Set<string>,
  baseOpacity: number
) {
  if (highlightedActivityIds.size === 0) {
    return baseOpacity;
  }
  return highlightedActivityIds.has(activityId)
    ? Math.min(1, baseOpacity + 0.1)
    : Math.max(0.12, baseOpacity * 0.22);
}

function ganttSummaryTooltip(row: LinearScheduleData["ganttRows"][number]) {
  return [
    row.label,
    `Level: ${row.hierarchyLevel}`,
    `Dates: ${row.startDate} to ${row.finishDate}`,
    `${row.activityIds.length} linked activity${row.activityIds.length === 1 ? "" : "ies"}`
  ].join("\n");
}

function ganttLevelLabel(level: LinearScheduleData["ganttRows"][number]["hierarchyLevel"]) {
  return level === "package"
    ? "Package"
    : level === "subtask"
      ? "Subtask"
      : level === "task"
        ? "Task"
        : "Activity";
}

function charsForColumnWidth(width: number) {
  return Math.max(8, Math.floor(width / 6.8));
}

function ganttColor(key: string | null) {
  return COLOR_KEY[key ?? ""] ?? "#8ec5ff";
}

function withAlpha(hexColor: string, alphaHex: string) {
  return `${hexColor}${alphaHex}`;
}

export default function LinearScheduleClient({
  data,
  filters,
  embedded = false,
  initialSelectedActivityId = null,
  onSelectedActivityChange
}: Props) {
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(initialSelectedActivityId);
  const [hoveredActivityId, setHoveredActivityId] = useState<string | null>(null);
  const [selectedGanttRowId, setSelectedGanttRowId] = useState<string | null>(null);
  const [hoveredGanttRowId, setHoveredGanttRowId] = useState<string | null>(null);
  const [ganttColumnWidths, setGanttColumnWidths] = useState({
    breakdown: GANTT_DEFAULT_BREAKDOWN_WIDTH,
    group: GANTT_DEFAULT_GROUP_WIDTH
  });
  const [showGanttSubtasks, setShowGanttSubtasks] = useState(false);
  const [expandedGanttRowIds, setExpandedGanttRowIds] = useState<string[]>([]);
  const [selectedFlowNodeId, setSelectedFlowNodeId] = useState<string | null>(null);
  const [hoveredFlowNodeId, setHoveredFlowNodeId] = useState<string | null>(null);
  const [showInlineLabels, setShowInlineLabels] = useState(false);
  const [showProgressNotes, setShowProgressNotes] = useState(false);
  const [showLinearSchedule, setShowLinearSchedule] = useState(true);
  const [showGanttView, setShowGanttView] = useState(true);
  const [timeFocus, setTimeFocus] = useState<TimeFocus>("full");
  const [zoomState, setZoomState] = useState<{ level: number; centerDate: string | null }>({
    level: 0,
    centerDate: null
  });
  const dragStateRef = useRef<{ pointerId: number; lastClientX: number; hasMoved: boolean } | null>(null);
  const ganttResizeStateRef = useRef<{
    column: "breakdown" | "group";
    startClientX: number;
    startWidths: { breakdown: number; group: number };
    unitsPerPixel: number;
  } | null>(null);
  const ganttSvgRef = useRef<SVGSVGElement | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setSelectedActivityId(initialSelectedActivityId);
  }, [initialSelectedActivityId]);

  function updateSelectedActivity(nextActivityId: string | null) {
    setSelectedActivityId(nextActivityId);
    onSelectedActivityChange?.(nextActivityId);
  }

  const activeActivityId = hoveredActivityId ?? selectedActivityId;
  const activeGanttRowId = hoveredGanttRowId ?? selectedGanttRowId;
  const selectedActivity =
    data.activities.find((activity) => activity.id === selectedActivityId) ?? null;
  const activeActivity =
    data.activities.find((activity) => activity.id === activeActivityId) ?? null;
  const activeGanttRow = data.ganttRows.find((row) => row.id === activeGanttRowId) ?? null;
  const activeGanttSummaryRow = activeGanttRow?.rowKind === "summary" ? activeGanttRow : null;
  const activityDrivenFlowNode =
    activeActivity?.stageKey
      ? data.flow.nodes.find((node) => node.stageKeys.includes(activeActivity.stageKey ?? "")) ?? null
      : null;
  const activeFlowNodeId = hoveredFlowNodeId ?? selectedFlowNodeId ?? activityDrivenFlowNode?.id ?? null;
  const activeFlowNode = data.flow.nodes.find((node) => node.id === activeFlowNodeId) ?? null;
  const highlightedActivityIds = useMemo(() => {
    const next = new Set<string>();
    if (activeFlowNode) {
      activeFlowNode.activityIds.forEach((activityId) => next.add(activityId));
    }
    if (activeGanttRow) {
      activeGanttRow.activityIds.forEach((activityId) => next.add(activityId));
    }
    if (activeActivityId) {
      next.add(activeActivityId);
    }
    return next;
  }, [activeFlowNode, activeGanttRow, activeActivityId]);
  const packageHighlightedActivityIds = useMemo(
    () => new Set(filters.packageIds.length > 0 ? data.activities.map((activity) => activity.id) : []),
    [filters.packageIds, data.activities]
  );
  const packageHighlightedFlowNodeIds = useMemo(
    () =>
      new Set(
        data.flow.nodes
          .filter((node) =>
            node.activityIds.some((activityId) => packageHighlightedActivityIds.has(activityId))
          )
          .map((node) => node.id)
      ),
    [data.flow.nodes, packageHighlightedActivityIds]
  );
  const activeFlowActivities = useMemo(
    () => data.activities.filter((activity) => highlightedActivityIds.has(activity.id)),
    [data.activities, highlightedActivityIds]
  );
  const focusedFilterState = Boolean(
    filters.scenarioId || filters.packageIds.length > 0 || filters.workfront || filters.activityType
  );

  const baseWindow = useMemo(
    () => resolveWindow(data, timeFocus, selectedActivity),
    [data, timeFocus, selectedActivity]
  );
  const defaultZoomAnchor = useMemo(
    () => zoomAnchorDate(baseWindow, selectedActivity, data.view.dataDate),
    [baseWindow, selectedActivity, data.view.dataDate]
  );
  const windowState = useMemo(
    () => applyZoomToWindow(baseWindow, zoomState.level, zoomState.centerDate ?? defaultZoomAnchor),
    [baseWindow, zoomState, defaultZoomAnchor]
  );
  const zoomedSpanDays = visibleSpanDays(windowState);
  const canPan = zoomState.level > 0 && visibleSpanMs(windowState) < visibleSpanMs(baseWindow);
  const windowStateRef = useRef(windowState);
  const baseWindowRef = useRef(baseWindow);

  useEffect(() => {
    windowStateRef.current = windowState;
    baseWindowRef.current = baseWindow;
  }, [windowState, baseWindow]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const resizeState = ganttResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const deltaUnits = (event.clientX - resizeState.startClientX) * resizeState.unitsPerPixel;
      const maxCombinedWidth =
        GANTT_CHART_WIDTH - GANTT_RIGHT_GUTTER - GANTT_LABEL_X - GANTT_COLUMN_GAP * 2 - GANTT_MIN_TIME_WIDTH;

      setGanttColumnWidths(() => {
        if (resizeState.column === "breakdown") {
          const breakdown = Math.min(
            maxCombinedWidth - resizeState.startWidths.group,
            Math.max(GANTT_MIN_BREAKDOWN_WIDTH, resizeState.startWidths.breakdown + deltaUnits)
          );
          return { breakdown, group: resizeState.startWidths.group };
        }

        const group = Math.min(
          maxCombinedWidth - resizeState.startWidths.breakdown,
          Math.max(GANTT_MIN_GROUP_WIDTH, resizeState.startWidths.group + deltaUnits)
        );
        return { breakdown: resizeState.startWidths.breakdown, group };
      });
    }

    function handlePointerUp() {
      ganttResizeStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const visibleActivities = useMemo(
    () =>
      data.activities.filter((activity) =>
        intersectsWindow(activity.startDate, activity.finishDate, windowState.start, windowState.end)
      ),
    [data.activities, windowState]
  );

  const visibleProgressPoints = useMemo(
    () =>
      data.progressPoints.filter(
        (point) =>
          point.progressDate >= windowState.start &&
          point.progressDate <= windowState.end &&
          visibleActivities.some((activity) => activity.id === point.linearScheduleActivityId)
      ),
    [data.progressPoints, visibleActivities, windowState]
  );

  const ganttRowsById = useMemo(
    () => new Map(data.ganttRows.map((row) => [row.id, row])),
    [data.ganttRows]
  );
  const visibleGanttLeafActivityIds = useMemo(
    () =>
      new Set(
        data.ganttRows
          .filter(
            (row) =>
              row.rowKind === "activity" &&
              row.activityId !== null &&
              intersectsWindow(row.startDate, row.finishDate, windowState.start, windowState.end)
          )
          .map((row) => row.activityId)
          .filter((item): item is string => item !== null)
      ),
    [data.ganttRows, windowState]
  );
  const visibleGanttRows = useMemo(
    () => {
      const expandedIds = new Set(expandedGanttRowIds);
      const rootRows = data.ganttRows.filter((row) => row.parentId === null);
      const rows: LinearScheduleData["ganttRows"] = [];
      const rowIsVisible = (row: LinearScheduleData["ganttRows"][number]) =>
        row.activityIds.some((activityId) => visibleGanttLeafActivityIds.has(activityId));
      const appendRow = (rowId: string) => {
        const row = ganttRowsById.get(rowId);
        if (!row || !rowIsVisible(row)) {
          return;
        }
        if (!showGanttSubtasks && row.hierarchyLevel !== "package") {
          return;
        }
        rows.push(row);
        if (row.rowKind === "summary" && showGanttSubtasks && expandedIds.has(row.id)) {
          row.childIds.forEach((childId) => appendRow(childId));
        }
      };

      rootRows.forEach((row) => appendRow(row.id));
      return rows;
    },
    [data.ganttRows, expandedGanttRowIds, ganttRowsById, showGanttSubtasks, visibleGanttLeafActivityIds]
  );

  const locationLookup = useMemo(
    () =>
      new Map(
        data.axis.locations.map((location, index) => [
          location.id,
          LINEAR_TOP_GUTTER + LINEAR_HEADER_CLEARANCE + index * LINEAR_ROW_HEIGHT
        ])
      ),
    [data.axis.locations]
  );

  const linearStartMs = new Date(`${windowState.start}T00:00:00Z`).getTime();
  const linearEndMs = new Date(`${windowState.end}T00:00:00Z`).getTime();
  const linearChartHeight =
    LINEAR_TOP_GUTTER +
    LINEAR_HEADER_CLEARANCE +
    LINEAR_BOTTOM_GUTTER +
    Math.max(0, data.axis.locations.length - 1) * LINEAR_ROW_HEIGHT;
  const linearTicks = buildTimeTicks(windowState.start, windowState.end).filter(
    (_, index, allTicks) =>
      zoomedSpanDays <= 35 || allTicks.length <= 4 || index % 2 === 0 || index === allTicks.length - 1
  );
  const weeklyGridTicks = zoomedSpanDays > 35 ? buildWeekGridTicks(windowState.start, windowState.end) : [];

  const ganttStartMs = linearStartMs;
  const ganttEndMs = linearEndMs;
  const ganttGroupX = GANTT_LABEL_X + ganttColumnWidths.breakdown + GANTT_COLUMN_GAP;
  const ganttLeftGutter = ganttGroupX + ganttColumnWidths.group + GANTT_COLUMN_GAP;
  const ganttBreakdownDividerX = ganttGroupX - GANTT_COLUMN_GAP / 2;
  const ganttTimeDividerX = ganttLeftGutter - GANTT_COLUMN_GAP / 2;
  const ganttHeight =
    GANTT_TOP_GUTTER +
    GANTT_HEADER_CLEARANCE +
    GANTT_BOTTOM_GUTTER +
    Math.max(1, visibleGanttRows.length) * GANTT_ROW_HEIGHT;
  const ganttTicks = linearTicks;
  const flowNodeHeights = useMemo(
    () =>
      new Map(
        data.flow.nodes.map((node) => [
          node.id,
          FLOW_NODE_HEIGHT + Math.max(0, node.subItems.length - 1) * FLOW_NODE_SUBITEM_HEIGHT
        ])
      ),
    [data.flow.nodes]
  );
  const flowNodeMap = useMemo(
    () => new Map(data.flow.nodes.map((node) => [node.id, node])),
    [data.flow.nodes]
  );
  const flowHeight =
    FLOW_BOTTOM_GUTTER +
    (data.flow.nodes.length > 0
      ? Math.max(
          ...data.flow.nodes.map((node) => node.y + (flowNodeHeights.get(node.id) ?? FLOW_NODE_HEIGHT))
        )
      : 140);

  const scenarioLabel =
    data.scenarios.find((scenario) => scenario.id === filters.scenarioId)?.name ?? null;
  const packageLabels = filters.packageIds
    .map((packageId) => data.packages.find((pkg) => pkg.id === packageId)?.label ?? packageId)
    .filter((label, index, allLabels) => allLabels.indexOf(label) === index);
  const workfrontLabel = data.workfronts.find((workfront) => workfront.id === filters.workfront)?.label ?? null;
  const activeFilters = [
    scenarioLabel ? `Scenario: ${scenarioLabel}` : null,
    packageLabels.length > 0 ? `Packages: ${packageLabels.join(", ")}` : null,
    workfrontLabel ? `Workfront: ${workfrontLabel}` : null,
    filters.activityType ? `Activity type: ${filters.activityType}` : null
  ].filter((item): item is string => Boolean(item));
  const packageDropdownSummary =
    packageLabels.length === 0
      ? "All packages"
      : packageLabels.length === 1
        ? packageLabels[0]
        : `${packageLabels.length} packages selected`;

  const detailPoints = activeActivity ? data.progressByActivityId[activeActivity.id] ?? [] : [];
  const colorLegendItems = useMemo(
    () =>
      [...new Set(data.activities.map((activity) => activity.colorKey).filter((item): item is string => Boolean(item)))]
        .sort((left, right) => left.localeCompare(right))
        .map((key) => ({
          key,
          label: COLOR_LABEL[key] ?? key,
          color: COLOR_KEY[key] ?? "#8ec5ff"
        })),
    [data.activities]
  );

  function bindActivityEvents(activityId: string) {
    return {
      onMouseEnter: () => setHoveredActivityId(activityId),
      onMouseLeave: () => setHoveredActivityId((current) => (current === activityId ? null : current)),
      onClick: () => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        updateSelectedActivity(selectedActivityId === activityId ? null : activityId);
      }
    };
  }

  function resolvedGanttRowActivityId(row: LinearScheduleData["ganttRows"][number]) {
    if (row.activityId) {
      return row.activityId;
    }
    return row.activityIds[0] ?? null;
  }

  function toggleExpandedGanttRow(rowId: string) {
    setExpandedGanttRowIds((current) =>
      current.includes(rowId) ? current.filter((entry) => entry !== rowId) : [...current, rowId]
    );
  }

  function bindGanttRowEvents(row: LinearScheduleData["ganttRows"][number]) {
    return {
      onMouseEnter: () => {
        setHoveredGanttRowId(row.id);
        if (row.activityId) {
          setHoveredActivityId(row.activityId);
        }
      },
      onMouseLeave: () => {
        setHoveredGanttRowId((current) => (current === row.id ? null : current));
        if (row.activityId) {
          setHoveredActivityId((current) => (current === row.activityId ? null : current));
        }
      },
      onClick: () => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        const nextActivityId = resolvedGanttRowActivityId(row);
        setSelectedGanttRowId((current) => (current === row.id ? null : row.id));
        if (nextActivityId) {
          updateSelectedActivity(selectedActivityId === nextActivityId ? null : nextActivityId);
          return;
        }
        updateSelectedActivity(null);
      }
    };
  }

  function startGanttColumnResize(
    column: "breakdown" | "group",
    event: React.PointerEvent<SVGRectElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = ganttSvgRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    ganttResizeStateRef.current = {
      column,
      startClientX: event.clientX,
      startWidths: ganttColumnWidths,
      unitsPerPixel: GANTT_CHART_WIDTH / Math.max(bounds.width, 1)
    };
  }

  function bindFlowNodeEvents(nodeId: string) {
    return {
      onMouseEnter: () => setHoveredFlowNodeId(nodeId),
      onMouseLeave: () => setHoveredFlowNodeId((current) => (current === nodeId ? null : current)),
      onClick: () =>
        setSelectedFlowNodeId((current) => (current === nodeId ? null : nodeId))
    };
  }

  function resetViewport(nextFocus: TimeFocus) {
    setTimeFocus(nextFocus);
    setZoomState({ level: 0, centerDate: null });
  }

  function setZoomLevel(nextLevel: number, anchorDate?: string) {
    const clampedLevel = Math.max(0, Math.min(MAX_ZOOM_LEVEL, nextLevel));
    setZoomState((current) => ({
      level: clampedLevel,
      centerDate:
        clampedLevel === 0
          ? null
          : anchorDate ?? current.centerDate ?? centerDateForWindow(windowStateRef.current)
    }));
  }

  function zoomIn(anchorDate?: string) {
    setZoomLevel(zoomState.level + 1, anchorDate);
  }

  function zoomOut(anchorDate?: string) {
    setZoomLevel(zoomState.level - 1, anchorDate);
  }

  function resetZoom() {
    setZoomState({ level: 0, centerDate: null });
  }

  function fitSelection() {
    if (!selectedActivity) {
      return;
    }
    setTimeFocus("selected");
    setZoomState({
      level: 2,
      centerDate: msToDateString(
        dateToMs(selectedActivity.startDate) +
          (dateToMs(selectedActivity.finishDate) - dateToMs(selectedActivity.startDate)) / 2
      )
    });
  }

  function panByPixels(deltaX: number, width: number) {
    if (!canPan || width <= 0) {
      return;
    }

    const currentWindow = windowStateRef.current;
    const base = baseWindowRef.current;
    const spanMs = visibleSpanMs(currentWindow);
    const currentCenterMs = dateToMs(centerDateForWindow(currentWindow));
    const deltaMs = (deltaX / width) * spanMs;
    const nextCenterMs = clampCenterMs(base, spanMs, currentCenterMs - deltaMs);

    setZoomState((current) => ({
      ...current,
      centerDate: msToDateString(nextCenterMs)
    }));
  }

  function handleChartPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canPan || event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      hasMoved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleChartPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.lastClientX;
    if (Math.abs(deltaX) < 1) {
      return;
    }

    dragState.hasMoved = true;
    dragState.lastClientX = event.clientX;
    panByPixels(deltaX, event.currentTarget.getBoundingClientRect().width);
  }

  function handleChartPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.hasMoved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const filterPanel = (
    <section className="panel">
      <div className="app-title-panel app-title-panel--compact">
        <div className="app-title-panel__content">
          <p className="eyebrow">Schedule Controls</p>
        <h2>Schedule Filters</h2>
        <p className="muted">
          Filter the linked stage flow, linear schedule, Gantt, and detail view from one place.
        </p>
        </div>
      </div>

      <form className="filter-row" method="get">
        {!embedded ? (
          <label className="filter-field">
            <span>Scenario</span>
            <select name="scenarioId" defaultValue={filters.scenarioId ?? ""}>
              <option value="">All scenarios</option>
              {data.scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="filter-field">
          <span>Package</span>
          <details className="checkbox-dropdown">
            <summary className="checkbox-dropdown-summary">{packageDropdownSummary}</summary>
            <div className="checkbox-dropdown-menu">
              {data.packages.map((pkg) => (
                <label key={pkg.id} className="checkbox-dropdown-option">
                  <input
                    type="checkbox"
                    name="packageId"
                    value={pkg.id}
                    defaultChecked={filters.packageIds.includes(pkg.id)}
                  />
                  <span>{pkg.label}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
        <label className="filter-field">
          <span>Workfront</span>
          <select name="workfront" defaultValue={filters.workfront ?? ""}>
            <option value="">All workfronts</option>
            {data.workfronts.map((workfront) => (
              <option key={workfront.id} value={workfront.id}>
                {workfront.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Activity type</span>
          <select name="activityType" defaultValue={filters.activityType ?? ""}>
            <option value="">All activity types</option>
            <option value="linear">Linear</option>
            <option value="bar">Bar</option>
            <option value="block">Block</option>
            <option value="milestone">Milestone</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
    </section>
  );

  const flowPanel = (
    <section className="panel flow-panel">
      <div className="flow-header app-title-panel app-title-panel--compact">
        <div className="app-title-panel__content">
          <p className="eyebrow">Stage Logic</p>
          <h3>Stage Flow</h3>
          <p className="muted">
            High-level sequencing map for the townhouse program. Hover or pin a stage to highlight
            the matching linear schedule and Gantt items.
          </p>
        </div>
      </div>

      <div className="flow-shell">
        <svg
          className="flow-svg"
          viewBox={`0 0 ${FLOW_CHART_WIDTH} ${flowHeight}`}
          role="img"
          aria-label="Stage flow diagram linked to the linear schedule"
        >
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#4f6288" />
            </marker>
          </defs>
          <rect x="0" y="0" width={FLOW_CHART_WIDTH} height={flowHeight} fill="#0d1628" />

          {data.flow.edges.map((edge) => {
            const fromNode = flowNodeMap.get(edge.from);
            const toNode = flowNodeMap.get(edge.to);
            if (!fromNode || !toNode) {
              return null;
            }

            const fromY = fromNode.y + (flowNodeHeights.get(fromNode.id) ?? FLOW_NODE_HEIGHT) / 2;
            const toY = toNode.y + (flowNodeHeights.get(toNode.id) ?? FLOW_NODE_HEIGHT) / 2;
            const fromX = fromNode.x + fromNode.width;
            const toX = toNode.x;
            const midX = fromX + (toX - fromX) / 2;
            const isActive =
              activeFlowNodeId !== null && (edge.from === activeFlowNodeId || edge.to === activeFlowNodeId);

            return (
              <path
                key={edge.id}
                d={`M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`}
                fill="none"
                stroke={isActive ? "#9bc0ff" : "#4f6288"}
                strokeWidth={isActive ? 2.4 : 1.5}
                strokeDasharray={edge.isSecondaryPath ? "5 5" : undefined}
                markerEnd="url(#flow-arrow)"
                opacity={highlightedActivityIds.size > 0 && !isActive ? 0.35 : 0.9}
              />
            );
          })}

          {data.flow.nodes.map((node) => {
            const nodeHeight = flowNodeHeights.get(node.id) ?? FLOW_NODE_HEIGHT;
            const isActive = activeFlowNodeId === node.id;
            const isPackageHighlighted = packageHighlightedFlowNodeIds.has(node.id);
            const isRelated =
              highlightedActivityIds.size > 0 &&
              node.activityIds.some((activityId) => highlightedActivityIds.has(activityId));
            const opacity =
              highlightedActivityIds.size === 0
                ? isPackageHighlighted || packageHighlightedFlowNodeIds.size === 0
                  ? 1
                  : 0.55
                : isRelated
                  ? 1
                  : 0.35;
            const matchedActivities = data.activities.filter((activity) => node.activityIds.includes(activity.id));

            return (
              <g key={node.id} {...bindFlowNodeEvents(node.id)}>
                <title>{flowNodeTooltip(node, matchedActivities)}</title>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={nodeHeight}
                  rx="10"
                  fill={isActive ? "#1c2d4d" : isPackageHighlighted ? "#182846" : "#152038"}
                  stroke={isActive ? "#9bc0ff" : isPackageHighlighted ? "#6f95d6" : "#31415f"}
                  strokeWidth={isActive ? 2 : isPackageHighlighted ? 1.6 : 1.2}
                  opacity={opacity}
                />
                <text x={node.x + 12} y={node.y + 20} fill="#eef4ff" fontSize="13" fontWeight="700">
                  {node.label}
                </text>
                {node.group ? (
                  <text x={node.x + 12} y={node.y + 36} fill="#8fb1e3" fontSize="10">
                    {node.group}
                  </text>
                ) : null}
                {node.subItems.map((item, index) => (
                  <text
                    key={`${node.id}-${item}`}
                    x={node.x + 12}
                    y={node.y + 52 + index * FLOW_NODE_SUBITEM_HEIGHT}
                    fill="#c5d1e6"
                    fontSize="10"
                  >
                    {truncateLabel(item, 34)}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );

  return (
    <>
      {filterPanel}
      {flowPanel}

      <section className="panel">
      <div className="schedule-header app-title-panel app-title-panel--compact">
        <div className="schedule-header-main app-title-panel__content">
          <p className="eyebrow">Programme View</p>
          <h2>Linear Schedule</h2>
          {!embedded ? (
            <>
              <p className="muted">
                Read-only React/SVG time-location view driven by project metadata, location-axis
                entries, and plotted schedule activities.
              </p>
              <p className="schedule-subtitle">
                <strong>{data.view.name}</strong>
                <span>{data.axis.name}</span>
                <span>{data.axis.locationReferenceModel}</span>
                {data.view.description ? <span>{data.view.description}</span> : null}
              </p>
            </>
          ) : null}
        </div>

        {!embedded ? (
          <details className="schedule-help">
            <summary className="schedule-help-button" aria-label="Explain how to use the linear schedule">
              ?
            </summary>
            <div className="schedule-help-popover">
              <strong>How to read this view</strong>
              <p>
                A linear schedule shows <strong>time</strong> across the page and <strong>location</strong>
                down the page so you can track how work moves through space.
              </p>
              <ul>
                <li>`baseline` is the original reference plan.</li>
                <li>`planned` is the currently intended sequence.</li>
                <li>`actual` shows recorded progress.</li>
                <li>`remaining` highlights work still outstanding after the data date.</li>
              </ul>
              <p>
                Use the controls below to simplify the picture, then select a single activity to see
                the same item highlighted in both the linear and Gantt views.
              </p>
              <p>
                The stage flow above the linear schedule shows the high-level handoff logic. Use the
                zoom controls to change the shared time window, and drag horizontally to pan once
                zoomed in.
              </p>
            </div>
          </details>
        ) : null}
        {embedded ? (
          <div className="schedule-header-actions">
            <button
              type="button"
              className={showLinearSchedule ? "schedule-focus-button is-active" : "schedule-focus-button"}
              onClick={() => setShowLinearSchedule((current) => !current)}
            >
              {showLinearSchedule ? "Collapse linear schedule" : "Expand linear schedule"}
            </button>
          </div>
        ) : null}
      </div>

      {!embedded || showLinearSchedule ? (
        <>
          <div className="schedule-toolbar">
            <div className="schedule-toggle-row">
              <label className="schedule-toggle">
                <input
                  type="checkbox"
                  checked={showInlineLabels}
                  onChange={(event) => setShowInlineLabels(event.target.checked)}
                />
                <span>Show inline labels</span>
              </label>
              <label className="schedule-toggle">
                <input
                  type="checkbox"
                  checked={showProgressNotes}
                  onChange={(event) => setShowProgressNotes(event.target.checked)}
                />
                <span>Show progress notes</span>
              </label>
            </div>

            <div className="schedule-focus-row">
              <span className="muted">Time focus</span>
              <div className="schedule-focus-buttons">
                <button
                  type="button"
                  className={timeFocus === "full" ? "schedule-focus-button is-active" : "schedule-focus-button"}
                  onClick={() => resetViewport("full")}
                >
                  Full
                </button>
                <button
                  type="button"
                  className={timeFocus === "data_date" ? "schedule-focus-button is-active" : "schedule-focus-button"}
                  onClick={() => resetViewport("data_date")}
                  disabled={!data.view.dataDate}
                >
                  Near data date
                </button>
                <button
                  type="button"
                  className={timeFocus === "selected" ? "schedule-focus-button is-active" : "schedule-focus-button"}
                  onClick={() => resetViewport("selected")}
                  disabled={!selectedActivity}
                >
                  Selected activity
                </button>
              </div>
            </div>

            <div className="schedule-focus-row">
              <span className="muted">Zoom</span>
              <div className="schedule-focus-buttons">
                <button
                  type="button"
                  className="schedule-focus-button"
                  onClick={() => zoomOut()}
                  disabled={zoomState.level === 0}
                >
                  Zoom out
                </button>
                <button
                  type="button"
                  className="schedule-focus-button"
                  onClick={() => zoomIn()}
                  disabled={zoomState.level === MAX_ZOOM_LEVEL}
                >
                  Zoom in
                </button>
                <button
                  type="button"
                  className="schedule-focus-button"
                  onClick={resetZoom}
                  disabled={zoomState.level === 0}
                >
                  Reset zoom
                </button>
                <button
                  type="button"
                  className="schedule-focus-button"
                  onClick={fitSelection}
                  disabled={!selectedActivity}
                >
                  Fit selection
                </button>
              </div>
            </div>

            {!embedded ? (
              <div className="schedule-focus-row">
                <span className="muted">Gestures</span>
                <span className="schedule-gesture-hint">
                  Drag horizontally to pan both charts once zoomed in.
                </span>
              </div>
            ) : null}
          </div>

          {!embedded ? (
            <p className="filter-summary">
              {activeFilters.length > 0
                ? `Showing ${activeFilters.join(" | ")}.`
                : "Showing the full schedule view. Use filters to focus on one scenario, package, workfront, or activity type."}{" "}
              <span className="muted">
                {visibleActivities.length} activities, {visibleProgressPoints.length} progress samples,{" "}
                {windowState.label.toLowerCase()}, zoom level {zoomState.level}, {zoomedSpanDays} day window.
              </span>
            </p>
          ) : null}

          <div className="legend">
            <div className="legend-group">
              <strong className="legend-title">Layer styling</strong>
              {[
                ["baseline", "Baseline layer"],
                ["planned", "Planned layer"],
                ["actual", "Actual layer"],
                ["remaining", "Remaining layer"]
              ].map(([layer, label]) => (
                <div className="legend-item" key={layer}>
                  <span
                    className="legend-swatch"
                    style={{
                      background:
                        layer === "baseline"
                          ? "#7d89a6"
                          : layer === "planned"
                            ? "#4f8cff"
                            : layer === "actual"
                              ? "#2ed3b7"
                              : "#ffd166",
                      opacity: LAYER_STYLE[layer].opacity
                    }}
                  />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div className="legend-group">
              <strong className="legend-title">Activity colors</strong>
              {colorLegendItems.map((item) => (
                <div className="legend-item" key={item.key}>
                  <span className="legend-swatch" style={{ background: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

        <div
          className={canPan ? "schedule-shell is-pannable" : "schedule-shell"}
          onPointerDown={handleChartPointerDown}
          onPointerMove={handleChartPointerMove}
          onPointerUp={handleChartPointerUp}
          onPointerCancel={handleChartPointerUp}
        >
          <svg
            className="schedule-svg"
            viewBox={`0 0 ${LINEAR_CHART_WIDTH} ${linearChartHeight}`}
            role="img"
            aria-label="Read-only linear schedule"
          >
            <rect x="0" y="0" width={LINEAR_CHART_WIDTH} height={linearChartHeight} fill="#0d1628" />
            <rect
              x={LINEAR_LEFT_GUTTER}
              y={LINEAR_TOP_GUTTER}
              width={LINEAR_CHART_WIDTH - LINEAR_LEFT_GUTTER - LINEAR_RIGHT_GUTTER}
              height={linearChartHeight - LINEAR_TOP_GUTTER - LINEAR_BOTTOM_GUTTER + 2}
              fill="none"
              stroke="#22314d"
              strokeWidth="1"
            />

          {weeklyGridTicks.map((tick) => {
            const x = xForDate(
              tick.iso,
              linearStartMs,
              linearEndMs,
              LINEAR_CHART_WIDTH,
              LINEAR_LEFT_GUTTER,
              LINEAR_RIGHT_GUTTER
            );
            return (
              <g key={`linear-week-${tick.iso}`}>
                <line
                  x1={x}
                  y1={LINEAR_TOP_GUTTER - 10}
                  x2={x}
                  y2={linearChartHeight - LINEAR_BOTTOM_GUTTER + 8}
                  stroke="rgba(135, 158, 196, 0.06)"
                  strokeWidth="1"
                />
                <text x={x + 2} y={LINEAR_TOP_GUTTER - 8} fill="#5f7396" fontSize="9">
                  {tick.label}
                </text>
              </g>
            );
          })}

          {linearTicks.map((tick) => {
            const x = xForDate(
              tick.iso,
              linearStartMs,
              linearEndMs,
              LINEAR_CHART_WIDTH,
              LINEAR_LEFT_GUTTER,
              LINEAR_RIGHT_GUTTER
            );
            return (
              <g key={tick.iso}>
                <line
                  x1={x}
                  y1={LINEAR_TOP_GUTTER - 10}
                  x2={x}
                  y2={linearChartHeight - LINEAR_BOTTOM_GUTTER + 8}
                  stroke="#243352"
                  strokeWidth="1"
                />
                <text x={x + 4} y={LINEAR_TOP_GUTTER - 20} fill="#a6b4cd" fontSize="12">
                  {tick.label}
                </text>
              </g>
            );
          })}

          {data.axis.locations.map((location) => {
            const y = locationLookup.get(location.id) ?? LINEAR_TOP_GUTTER;
            return (
              <g key={location.id}>
                <line
                  x1={LINEAR_LEFT_GUTTER}
                  y1={y}
                  x2={LINEAR_CHART_WIDTH - LINEAR_RIGHT_GUTTER}
                  y2={y}
                  stroke="#243352"
                  strokeWidth="1"
                />
                <text x="18" y={y + 4} fill="#e8eef9" fontSize="13">
                  {truncateLabel(location.label, 18)}
                </text>
                {location.startStation !== null ? (
                  <text x="110" y={y + 4} fill="#7f92b5" fontSize="11">
                    {location.startStation}+00
                  </text>
                ) : null}
              </g>
            );
          })}

          <text x="18" y="22" fill="#a6b4cd" fontSize="12">
            Location
          </text>
          <text x="110" y="22" fill="#a6b4cd" fontSize="12">
            Station
          </text>
          <text x={LINEAR_LEFT_GUTTER} y="22" fill="#a6b4cd" fontSize="12">
            Time
          </text>

          {data.view.dataDate ? (
            <>
              <line
                x1={xForDate(
                  data.view.dataDate,
                  linearStartMs,
                  linearEndMs,
                  LINEAR_CHART_WIDTH,
                  LINEAR_LEFT_GUTTER,
                  LINEAR_RIGHT_GUTTER
                )}
                y1={LINEAR_TOP_GUTTER - 10}
                x2={xForDate(
                  data.view.dataDate,
                  linearStartMs,
                  linearEndMs,
                  LINEAR_CHART_WIDTH,
                  LINEAR_LEFT_GUTTER,
                  LINEAR_RIGHT_GUTTER
                )}
                y2={linearChartHeight - LINEAR_BOTTOM_GUTTER + 8}
                stroke="#ff6b6b"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              <text
                x={
                  xForDate(
                    data.view.dataDate,
                    linearStartMs,
                    linearEndMs,
                    LINEAR_CHART_WIDTH,
                    LINEAR_LEFT_GUTTER,
                    LINEAR_RIGHT_GUTTER
                  ) + 6
                }
                y={linearChartHeight - LINEAR_BOTTOM_GUTTER + 28}
                fill="#ffb3b3"
                fontSize="12"
              >
                Data date
              </text>
            </>
          ) : null}

          {[...visibleActivities]
            .sort((left, right) =>
              ["baseline", "planned", "actual", "remaining"].indexOf(left.displayLayer) -
              ["baseline", "planned", "actual", "remaining"].indexOf(right.displayLayer)
            )
            .map((activity) => {
              const color = COLOR_KEY[activity.colorKey ?? ""] ?? "#8ec5ff";
              const style = LAYER_STYLE[activity.displayLayer];
              const x1 = xForDate(
                activity.startDate,
                linearStartMs,
                linearEndMs,
                LINEAR_CHART_WIDTH,
                LINEAR_LEFT_GUTTER,
                LINEAR_RIGHT_GUTTER
              );
              const x2 = xForDate(
                activity.finishDate,
                linearStartMs,
                linearEndMs,
                LINEAR_CHART_WIDTH,
                LINEAR_LEFT_GUTTER,
                LINEAR_RIGHT_GUTTER
              );
              const singleY = locationLookup.get(activity.locationRef ?? "") ?? LINEAR_TOP_GUTTER;
              const y1 = locationLookup.get(activity.startLocationRef ?? "") ?? singleY;
              const y2 = locationLookup.get(activity.finishLocationRef ?? "") ?? singleY;
              const segmentLength =
                activity.activityType === "linear"
                  ? Math.hypot(x2 - x1, y2 - y1)
                  : Math.max(10, x2 - x1);
              const showLabel =
                activeActivityId === activity.id ||
                ((showInlineLabels || zoomedSpanDays <= 21) &&
                  shouldRenderActivityLabel(
                    activity,
                    segmentLength,
                    focusedFilterState || zoomState.level > 0 || zoomedSpanDays <= 21
                  ));
              const opacity = activityBaseOpacity(activity.id, highlightedActivityIds, style.opacity);

              if (activity.activityType === "linear") {
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const angle = Math.max(-28, Math.min(28, (Math.atan2(dy, dx) * 180) / Math.PI));
                const length = Math.max(1, Math.hypot(dx, dy));
                const offsetX = (-dy / length) * 14;
                const offsetY = (dx / length) * 14;

                return (
                  <g key={activity.id} {...bindActivityEvents(activity.id)}>
                    <title>{activityTooltip(activity)}</title>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={highlightedActivityIds.has(activity.id) ? style.strokeWidth + 1 : style.strokeWidth}
                      strokeDasharray={style.dash}
                      opacity={opacity}
                    />
                    {showLabel
                      ? renderLabelBadge({
                          x: midX + offsetX,
                          y: midY + offsetY,
                          label: truncateLabel(activity.displayLabel, 22),
                          color,
                          anchor: "middle",
                          rotation: angle
                        })
                      : null}
                  </g>
                );
              }

              if (activity.activityType === "bar") {
                return (
                  <g key={activity.id} {...bindActivityEvents(activity.id)}>
                    <title>{activityTooltip(activity)}</title>
                    <rect
                      x={x1}
                      y={singleY - 12}
                      width={Math.max(10, x2 - x1)}
                      height="24"
                      rx="6"
                      fill={color}
                      opacity={opacity}
                    />
                    {showLabel
                      ? renderLabelBadge({
                          x: x1 + 4,
                          y: singleY - 18,
                          label: truncateLabel(activity.displayLabel, 24),
                          color
                        })
                      : null}
                  </g>
                );
              }

              if (activity.activityType === "block") {
                const top = Math.min(y1, y2) - 18;
                const height = Math.abs(y2 - y1) + 36;
                return (
                  <g key={activity.id} {...bindActivityEvents(activity.id)}>
                    <title>{activityTooltip(activity)}</title>
                    <rect
                      x={x1}
                      y={top}
                      width={Math.max(10, x2 - x1)}
                      height={height}
                      rx="10"
                      fill={color}
                      opacity={opacity * 0.65}
                      stroke={color}
                      strokeDasharray={style.dash}
                    />
                    {showLabel
                      ? renderLabelBadge({
                          x: x1 + 6,
                          y: top - 6,
                          label: truncateLabel(activity.displayLabel, 24),
                          color
                        })
                      : null}
                  </g>
                );
              }

              const milestoneSize = 10;
              const centerX = x2;
              const centerY = singleY;
              const points = `${centerX},${centerY - milestoneSize} ${centerX + milestoneSize},${centerY} ${centerX},${centerY + milestoneSize} ${centerX - milestoneSize},${centerY}`;

              return (
                <g key={activity.id} {...bindActivityEvents(activity.id)}>
                  <title>{activityTooltip(activity)}</title>
                  <polygon points={points} fill={color} opacity={opacity} />
                  {showLabel
                    ? renderLabelBadge({
                        x: centerX + 12,
                        y: centerY + 4,
                        label: truncateLabel(activity.displayLabel, 20),
                        color
                      })
                    : null}
                </g>
              );
            })}

          {visibleProgressPoints.map((point) => {
            const activity =
              data.activities.find((item) => item.id === point.linearScheduleActivityId) ?? null;
            if (!activity) {
              return null;
            }
            const x = xForDate(
              point.progressDate,
              linearStartMs,
              linearEndMs,
              LINEAR_CHART_WIDTH,
              LINEAR_LEFT_GUTTER,
              LINEAR_RIGHT_GUTTER
            );
            const y = locationLookup.get(point.locationRef) ?? LINEAR_TOP_GUTTER;
            const active = highlightedActivityIds.has(activity.id);

            return (
              <g key={point.id} {...bindActivityEvents(activity.id)}>
                <title>{progressTooltip(point, activity.activityName)}</title>
                <circle
                  cx={x}
                  cy={y}
                  r={active ? 5 : 4}
                  fill="#ffffff"
                  opacity={highlightedActivityIds.size > 0 && !active ? 0.35 : 1}
                />
                {(showProgressNotes || active || zoomedSpanDays <= 14) && point.note
                  ? renderLabelBadge({
                      x: x + 6,
                      y: y + 16,
                      label: truncateLabel(point.note, active ? 30 : 20),
                      color: "#d5def0"
                    })
                  : null}
              </g>
            );
          })}
          </svg>
        </div>
        </>
      ) : null}
      </section>

      <section className="panel gantt-panel">
          <div className="gantt-header app-title-panel app-title-panel--compact">
            <div className="app-title-panel__content">
              <p className="eyebrow">Linked Timeline</p>
              <h3>Linked Gantt View</h3>
              {!embedded ? (
                <p className="muted">
                  Time-first companion view. Expand package rows to reveal subtasks, tasks, and leaf
                  activities while keeping the same linked highlight behavior.
                </p>
              ) : null}
            </div>
            <div className="gantt-header-actions">
              {showGanttView ? (
                <label className="schedule-toggle">
                  <input
                    type="checkbox"
                    checked={showGanttSubtasks}
                    onChange={(event) => {
                      const nextChecked = event.target.checked;
                      setShowGanttSubtasks(nextChecked);
                      if (!nextChecked) {
                        setExpandedGanttRowIds([]);
                      }
                    }}
                  />
                  <span>Show subtasks</span>
                </label>
              ) : null}
              {embedded ? (
                <button
                  type="button"
                  className={showGanttView ? "schedule-focus-button is-active" : "schedule-focus-button"}
                  onClick={() => setShowGanttView((current) => !current)}
                >
                  {showGanttView ? "Collapse Gantt" : "Expand Gantt"}
                </button>
              ) : null}
            </div>
          </div>

          {showGanttView ? (
            <div
              className={canPan ? "gantt-shell is-pannable" : "gantt-shell"}
              onPointerDown={handleChartPointerDown}
              onPointerMove={handleChartPointerMove}
              onPointerUp={handleChartPointerUp}
              onPointerCancel={handleChartPointerUp}
            >
              <svg
                ref={ganttSvgRef}
                className="gantt-svg"
                viewBox={`0 0 ${GANTT_CHART_WIDTH} ${ganttHeight}`}
                role="img"
                aria-label="Linked Gantt schedule"
              >
              <rect x="0" y="0" width={GANTT_CHART_WIDTH} height={ganttHeight} fill="#0d1628" />
              <rect
                x={ganttLeftGutter}
                y={GANTT_TOP_GUTTER}
                width={GANTT_CHART_WIDTH - ganttLeftGutter - GANTT_RIGHT_GUTTER}
                height={ganttHeight - GANTT_TOP_GUTTER - GANTT_BOTTOM_GUTTER + 2}
                fill="none"
                stroke="#22314d"
                strokeWidth="1"
              />

            {weeklyGridTicks.map((tick) => {
              const x = xForDate(
                tick.iso,
                ganttStartMs,
                ganttEndMs,
                GANTT_CHART_WIDTH,
                ganttLeftGutter,
                GANTT_RIGHT_GUTTER
              );
              return (
                <g key={`gantt-week-${tick.iso}`}>
                  <line
                    x1={x}
                    y1={GANTT_TOP_GUTTER - 10}
                    x2={x}
                    y2={ganttHeight - GANTT_BOTTOM_GUTTER + 8}
                    stroke="rgba(135, 158, 196, 0.06)"
                    strokeWidth="1"
                  />
                  <text x={x + 2} y={GANTT_TOP_GUTTER - 8} fill="#5f7396" fontSize="9">
                    {tick.label}
                  </text>
                </g>
              );
            })}

            {ganttTicks.map((tick) => {
              const x = xForDate(
                tick.iso,
                ganttStartMs,
                ganttEndMs,
                GANTT_CHART_WIDTH,
                ganttLeftGutter,
                GANTT_RIGHT_GUTTER
              );
              return (
                <g key={tick.iso}>
                  <line
                    x1={x}
                    y1={GANTT_TOP_GUTTER - 10}
                    x2={x}
                    y2={ganttHeight - GANTT_BOTTOM_GUTTER + 8}
                    stroke="#243352"
                    strokeWidth="1"
                  />
                  <text x={x + 4} y={GANTT_TOP_GUTTER - 20} fill="#a6b4cd" fontSize="12">
                    {tick.label}
                  </text>
                </g>
              );
            })}

            <text x={GANTT_LABEL_X} y="22" fill="#a6b4cd" fontSize="12">
              Work breakdown
            </text>
            <text x={ganttGroupX} y="22" fill="#a6b4cd" fontSize="12">
              Group / level
            </text>
            <text x={ganttLeftGutter} y="22" fill="#a6b4cd" fontSize="12">
              Time
            </text>
            <line
              x1={ganttBreakdownDividerX}
              y1={12}
              x2={ganttBreakdownDividerX}
              y2={ganttHeight - GANTT_BOTTOM_GUTTER + 8}
              stroke="#32425f"
              strokeWidth="1"
            />
            <line
              x1={ganttTimeDividerX}
              y1={12}
              x2={ganttTimeDividerX}
              y2={ganttHeight - GANTT_BOTTOM_GUTTER + 8}
              stroke="#32425f"
              strokeWidth="1"
            />
            <rect
              className="gantt-resize-handle"
              x={ganttBreakdownDividerX - 6}
              y={0}
              width="12"
              height={ganttHeight}
              fill="transparent"
              onPointerDown={(event) => startGanttColumnResize("breakdown", event)}
            />
            <rect
              className="gantt-resize-handle"
              x={ganttTimeDividerX - 6}
              y={0}
              width="12"
              height={ganttHeight}
              fill="transparent"
              onPointerDown={(event) => startGanttColumnResize("group", event)}
            />

            {data.dependencies.map((dependency) => {
              const predecessorIndex = visibleGanttRows.findIndex(
                (row) => row.activityId === dependency.predecessorActivityId
              );
              const successorIndex = visibleGanttRows.findIndex(
                (row) => row.activityId === dependency.successorActivityId
              );
              const predecessor = data.activities.find((activity) => activity.id === dependency.predecessorActivityId);
              const successor = data.activities.find((activity) => activity.id === dependency.successorActivityId);
              if (predecessorIndex < 0 || successorIndex < 0 || !predecessor || !successor) {
                return null;
              }
              const x1 = xForDate(
                predecessor.finishDate,
                ganttStartMs,
                ganttEndMs,
                GANTT_CHART_WIDTH,
                ganttLeftGutter,
                GANTT_RIGHT_GUTTER
              );
              const x2 = xForDate(
                successor.startDate,
                ganttStartMs,
                ganttEndMs,
                GANTT_CHART_WIDTH,
                ganttLeftGutter,
                GANTT_RIGHT_GUTTER
              );
              const y1 = GANTT_TOP_GUTTER + GANTT_HEADER_CLEARANCE + predecessorIndex * GANTT_ROW_HEIGHT;
              const y2 = GANTT_TOP_GUTTER + GANTT_HEADER_CLEARANCE + successorIndex * GANTT_ROW_HEIGHT;
              const midX = Math.max(x1 + 16, Math.min(x2 - 8, x1 + Math.abs(x2 - x1) / 2));
              const active =
                highlightedActivityIds.has(dependency.predecessorActivityId) ||
                highlightedActivityIds.has(dependency.successorActivityId);

              return (
                <g key={dependency.id}>
                  <title>{`${predecessor.activityName} -> ${successor.activityName}`}</title>
                  <path
                    d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`}
                    fill="none"
                    stroke={active ? "#ffffff" : "#85f5d5"}
                    strokeOpacity={active ? 0.85 : 0.45}
                    strokeWidth={active ? 1.8 : 1.2}
                    strokeDasharray="4 4"
                  />
                  <polygon
                    points={`${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`}
                    fill={active ? "#ffffff" : "#85f5d5"}
                    opacity={active ? 0.9 : 0.55}
                  />
                </g>
              );
            })}

            {visibleGanttRows.map((row, index) => {
              const y = GANTT_TOP_GUTTER + GANTT_HEADER_CLEARANCE + index * GANTT_ROW_HEIGHT;
              const x1 = xForDate(
                row.startDate,
                ganttStartMs,
                ganttEndMs,
                GANTT_CHART_WIDTH,
                ganttLeftGutter,
                GANTT_RIGHT_GUTTER
              );
              const x2 = xForDate(
                row.finishDate,
                ganttStartMs,
                ganttEndMs,
                GANTT_CHART_WIDTH,
                ganttLeftGutter,
                GANTT_RIGHT_GUTTER
              );
              const isActive = row.activityIds.some((activityId) => highlightedActivityIds.has(activityId));
              const treeX = GANTT_LABEL_X + row.depth * GANTT_TREE_INDENT;
              const labelX = treeX + (row.rowKind === "summary" ? 16 : 10);
              const toggleExpanded = expandedGanttRowIds.includes(row.id);
              const rowColor = ganttColor(row.colorKey);
              const breakdownChars = charsForColumnWidth(
                Math.max(72, ganttColumnWidths.breakdown - (labelX - GANTT_LABEL_X) - 12)
              );
              const groupChars = charsForColumnWidth(ganttColumnWidths.group - 12);

              if (row.rowKind === "summary") {
                return (
                  <g key={row.id} {...bindGanttRowEvents(row)}>
                    <title>{ganttSummaryTooltip(row)}</title>
                    <rect
                      x={0}
                      y={y - 16}
                      width={GANTT_CHART_WIDTH}
                      height={GANTT_ROW_HEIGHT}
                      fill={isActive ? "rgba(78, 104, 159, 0.14)" : "transparent"}
                    />
                    <line
                      x1={ganttLeftGutter}
                      y1={y + 18}
                      x2={GANTT_CHART_WIDTH - GANTT_RIGHT_GUTTER}
                      y2={y + 18}
                      stroke="#243352"
                      strokeWidth="1"
                    />
                    {row.depth > 0 ? (
                      <>
                        <line
                          x1={treeX - 8}
                          y1={y - 18}
                          x2={treeX - 8}
                          y2={y}
                          stroke="#4b5f86"
                          strokeWidth="1.2"
                        />
                        <line
                          x1={treeX - 8}
                          y1={y}
                          x2={treeX + 2}
                          y2={y}
                          stroke="#4b5f86"
                          strokeWidth="1.2"
                        />
                      </>
                    ) : null}
                    {showGanttSubtasks && row.childIds.length > 0 ? (
                      <g
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpandedGanttRow(row.id);
                        }}
                      >
                        <rect
                          x={treeX - 2}
                          y={y - 11}
                          width="14"
                          height="14"
                          rx="3"
                          fill="#152038"
                          stroke="#31415f"
                        />
                        <text x={treeX + 2} y={y} fill="#dbe7ff" fontSize="11" fontWeight="700">
                          {toggleExpanded ? "-" : "+"}
                        </text>
                      </g>
                    ) : null}
                    <text x={labelX} y={y} fill="#eef4ff" fontSize="13" fontWeight="700">
                      {truncateLabel(row.label, breakdownChars)}
                    </text>
                    <text x={ganttGroupX} y={y} fill="#7f92b5" fontSize="11">
                      {truncateLabel(
                        row.groupLabel === "Package" ? ganttLevelLabel(row.hierarchyLevel) : row.groupLabel,
                        groupChars
                      )}
                    </text>
                    <rect
                      x={x1}
                      y={y - 10}
                      width={Math.max(10, x2 - x1)}
                      height="14"
                      rx="7"
                      fill={withAlpha(rowColor, isActive ? "55" : "38")}
                      stroke={isActive ? "#ffffff" : rowColor}
                      strokeWidth={isActive ? 1.5 : 1}
                    />
                  </g>
                );
              }

              const activity = data.activities.find((item) => item.id === row.activityId) ?? null;
              if (!activity || !row.activityId || !row.activityType || !row.displayLayer) {
                return null;
              }
              const color = COLOR_KEY[row.colorKey ?? ""] ?? "#8ec5ff";
              const style = LAYER_STYLE[row.displayLayer];
              const opacity = activityBaseOpacity(row.activityId, highlightedActivityIds, style.opacity);

              return (
                <g key={row.id} {...bindGanttRowEvents(row)}>
                  <title>{activityTooltip(activity)}</title>
                  <rect
                    x={0}
                    y={y - 16}
                    width={GANTT_CHART_WIDTH}
                    height={GANTT_ROW_HEIGHT}
                    fill={isActive ? "rgba(78, 104, 159, 0.12)" : "transparent"}
                  />
                  <line
                    x1={ganttLeftGutter}
                    y1={y + 18}
                    x2={GANTT_CHART_WIDTH - GANTT_RIGHT_GUTTER}
                    y2={y + 18}
                    stroke="#243352"
                    strokeWidth="1"
                  />
                  {row.depth > 0 ? (
                    <>
                      <line
                        x1={treeX - 8}
                        y1={y - 18}
                        x2={treeX - 8}
                        y2={y}
                        stroke="#4b5f86"
                        strokeWidth="1.2"
                      />
                      <line
                        x1={treeX - 8}
                        y1={y}
                        x2={treeX + 2}
                        y2={y}
                        stroke="#4b5f86"
                        strokeWidth="1.2"
                      />
                    </>
                  ) : null}
                  <text x={labelX} y={y} fill="#e8eef9" fontSize="13">
                    {truncateLabel(row.label, breakdownChars)}
                  </text>
                  <text x={ganttGroupX} y={y} fill="#7f92b5" fontSize="11">
                    {truncateLabel(row.groupLabel, groupChars)}
                  </text>

                  {row.activityType === "milestone" ? (
                    <polygon
                      points={`${x2},${y - 8} ${x2 + 8},${y} ${x2},${y + 8} ${x2 - 8},${y}`}
                      fill={color}
                      opacity={opacity}
                    />
                  ) : (
                    <rect
                      x={x1}
                      y={y - 12}
                      width={Math.max(10, x2 - x1)}
                      height={row.activityType === "block" ? 24 : 18}
                      rx="6"
                      fill={color}
                      opacity={opacity}
                      stroke={isActive ? "#ffffff" : color}
                      strokeWidth={isActive ? 1.5 : 0.8}
                      strokeDasharray={style.dash}
                    />
                  )}

                  {(data.progressByActivityId[row.activityId] ?? []).map((point) => {
                    if (point.progressDate < windowState.start || point.progressDate > windowState.end) {
                      return null;
                    }
                    const pointX = xForDate(
                      point.progressDate,
                      ganttStartMs,
                      ganttEndMs,
                      GANTT_CHART_WIDTH,
                      ganttLeftGutter,
                      GANTT_RIGHT_GUTTER
                    );
                    return (
                      <circle
                        key={point.id}
                        cx={pointX}
                        cy={y - 2}
                        r={isActive ? 4.5 : 3.5}
                        fill="#ffffff"
                        opacity={highlightedActivityIds.size > 0 && !isActive ? 0.35 : 1}
                      />
                    );
                  })}
                </g>
              );
            })}
              </svg>
            </div>
          ) : null}
        </section>

      {!embedded ? (
        <>
          <div className="detail-panel">
            <div>
              <strong>Activity or stage detail</strong>
              <p className="muted">
                Hover an activity or stage to inspect it temporarily, or click one to keep the selection
                pinned across the flow, linear schedule, and Gantt.
              </p>
            </div>
            {activeActivity ? (
              <div className="detail-grid">
                <div className="detail-card">
                  <strong>{activeActivity.activityName}</strong>
                  <div className="muted">{activeActivity.displayLabel}</div>
                </div>
                <div className="detail-card">
                  <strong>Layer</strong>
                  <div className="muted">{layerLabel(activeActivity.displayLayer)}</div>
                </div>
                <div className="detail-card">
                  <strong>Dates</strong>
                  <div className="muted">
                    {activeActivity.startDate} to {activeActivity.finishDate}
                  </div>
                </div>
                <div className="detail-card">
                  <strong>Package / Workfront</strong>
                  <div className="muted">
                    {activeActivity.packageId ?? "No package"} / {activeActivity.workfront ?? "No workfront"}
                  </div>
                </div>
                <div className="detail-card">
                  <strong>Sequence</strong>
                  <div className="muted">
                    {activeActivity.sequenceGroup ?? "No group"}
                    {activeActivity.sequenceOrder !== null ? ` / ${activeActivity.sequenceOrder}` : ""}
                  </div>
                </div>
                <div className="detail-card">
                  <strong>Progress samples</strong>
                  <div className="muted">{detailPoints.length}</div>
                </div>
                {detailPoints.length > 0 ? (
                  <div className="detail-card detail-card-wide">
                    <strong>Progress timeline</strong>
                    <ul className="detail-list">
                      {detailPoints.map((point) => (
                        <li key={point.id}>
                          <strong>{point.progressDate}</strong> at {point.locationRef}
                          {point.note ? ` - ${point.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : activeGanttSummaryRow ? (
              <div className="detail-grid">
                <div className="detail-card">
                  <strong>{activeGanttSummaryRow.label}</strong>
                  <div className="muted">{ganttLevelLabel(activeGanttSummaryRow.hierarchyLevel)}</div>
                </div>
                <div className="detail-card">
                  <strong>Linked activities</strong>
                  <div className="muted">{activeGanttSummaryRow.activityIds.length}</div>
                </div>
                <div className="detail-card">
                  <strong>Dates</strong>
                  <div className="muted">
                    {activeGanttSummaryRow.startDate} to {activeGanttSummaryRow.finishDate}
                  </div>
                </div>
                <div className="detail-card">
                  <strong>Package</strong>
                  <div className="muted">{activeGanttSummaryRow.packageId ?? "No package"}</div>
                </div>
              </div>
            ) : activeFlowNode ? (
              <div className="detail-grid">
                <div className="detail-card">
                  <strong>{activeFlowNode.label}</strong>
                  <div className="muted">{activeFlowNode.group ?? "Stage flow node"}</div>
                </div>
                <div className="detail-card">
                  <strong>Linked activities</strong>
                  <div className="muted">{activeFlowActivities.length}</div>
                </div>
                <div className="detail-card detail-card-wide">
                  <strong>Sub-items</strong>
                  <ul className="detail-list">
                    {activeFlowNode.subItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="detail-card detail-card-wide">
                  <strong>Matching schedule items</strong>
                  <ul className="detail-list">
                    {activeFlowActivities.map((activity) => (
                      <li key={activity.id}>
                        <strong>{activity.displayLabel}</strong> {activity.startDate} to {activity.finishDate}
                        {activity.workfront ? ` / ${activity.workfront}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="detail-empty muted">
                No stage or activity selected yet. Pin one in any view to keep the linked highlight.
              </div>
            )}
          </div>

          <div className="schedule-meta">
            <div className="card">
              <strong>View Window</strong>
              <div className="muted">
                {windowState.start} to {windowState.end}
              </div>
            </div>
            <div className="card">
              <strong>Zoom</strong>
              <div className="muted">Level {zoomState.level}</div>
            </div>
            <div className="card">
              <strong>Location Model</strong>
              <div className="muted">{data.axis.locationReferenceModel}</div>
            </div>
            <div className="card">
              <strong>Activities Rendered</strong>
              <div className="muted">{visibleActivities.length}</div>
            </div>
            <div className="card">
              <strong>Progress Samples</strong>
              <div className="muted">{visibleProgressPoints.length}</div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
