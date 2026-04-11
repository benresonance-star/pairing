import { vocab, type LinearActivityType, type LinearAxisOrientation, type LinearDisplayLayer } from "../../../../shared/contracts/api/index";
import type { RuntimeState } from "./runtime-state";

export type LocationEntry = {
  id: string;
  label: string;
  order: number;
  startStation: number | null;
  finishStation: number | null;
};

export type LinearScheduleActivityRow = {
  id: string;
  activityName: string;
  displayLabel: string;
  stageKey: string | null;
  activityType: LinearActivityType;
  displayLayer: LinearDisplayLayer;
  packageId: string | null;
  workfront: string | null;
  colorKey: string | null;
  startDate: string;
  finishDate: string;
  locationRef: string | null;
  startLocationRef: string | null;
  finishLocationRef: string | null;
  sequenceGroup: string | null;
  sequenceOrder: number | null;
  metadataJson: Record<string, unknown> | null;
};

export type LinearProgressPointRow = {
  id: string;
  linearScheduleActivityId: string;
  progressDate: string;
  locationRef: string;
  note: string | null;
};

export type LinearScheduleGanttRow = {
  id: string;
  activityId: string;
  label: string;
  groupLabel: string;
  startDate: string;
  finishDate: string;
  activityType: LinearActivityType;
  displayLayer: LinearDisplayLayer;
  colorKey: string | null;
  packageId: string | null;
  workfront: string | null;
  sequenceGroup: string | null;
  sequenceOrder: number | null;
};

export type LinearScheduleFlowNode = {
  id: string;
  label: string;
  subItems: string[];
  group: string | null;
  stageKeys: string[];
  activityIds: string[];
  x: number;
  y: number;
  width: number;
};

export type LinearScheduleFlowEdge = {
  id: string;
  from: string;
  to: string;
  label: string | null;
  isSecondaryPath: boolean;
};

export type LinearScheduleFilters = {
  scenarioId?: string | null;
  packageIds?: string[];
  workfront?: string | null;
  activityType?: LinearActivityType | null;
};

export type LinearScheduleData = {
  view: {
    id: string;
    name: string;
    description: string | null;
    orientation: LinearAxisOrientation;
    timeAxisStart: string;
    timeAxisFinish: string;
    dataDate: string | null;
  };
  axis: {
    id: string;
    name: string;
    description: string | null;
    unitsLabel: string | null;
    locationReferenceModel: string;
    locations: LocationEntry[];
  };
  activities: LinearScheduleActivityRow[];
  progressPoints: LinearProgressPointRow[];
  progressByActivityId: Record<string, LinearProgressPointRow[]>;
  ganttRows: LinearScheduleGanttRow[];
  flow: {
    nodes: LinearScheduleFlowNode[];
    edges: LinearScheduleFlowEdge[];
  };
  scenarios: Array<{ id: string; name: string }>;
  packages: Array<{ id: string; label: string }>;
  workfronts: Array<{ id: string; label: string }>;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => readString(entry))
        .filter((entry): entry is string => entry !== null)
    : [];
}

function matchesFilter<T extends string>(value: T | null, filterValue: string | null | undefined): boolean {
  return !filterValue || value === filterValue;
}

function matchesMultiFilter<T extends string>(value: T | null, filterValues: string[] | undefined): boolean {
  return !filterValues || filterValues.length === 0 || (value !== null && filterValues.includes(value));
}

function displayLabelForActivity(
  activityName: string,
  metadataJson: Record<string, unknown> | null
): string {
  const metadataLabel = readString(metadataJson?.label);
  return metadataLabel && metadataLabel.length <= activityName.length ? metadataLabel : activityName;
}

export function buildLinearScheduleData(
  state: RuntimeState,
  filters: LinearScheduleFilters = {}
): LinearScheduleData {
  const viewRecord = state.linear_schedule_views[0];
  if (!viewRecord) {
    throw new Error("Runtime state does not contain a linear schedule view");
  }

  const axisRecord = state.location_axes.find((item) => item.id === viewRecord.location_axis_id);
  if (!axisRecord) {
    throw new Error(`Linear schedule view '${viewRecord.id}' is missing a location axis`);
  }

  const locations = Array.isArray(axisRecord.locations_json)
    ? axisRecord.locations_json
        .map((entry) => readObject(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
          id: String(entry.id),
          label: String(entry.label),
          order: Number(entry.order),
          startStation: readNumber(entry.start_station),
          finishStation: readNumber(entry.finish_station)
        }))
        .sort((left, right) => left.order - right.order)
    : [];
  const viewMetadata = readObject(viewRecord.metadata_json);
  const flowDiagram = readObject(viewMetadata?.flow_diagram);

  const viewActivities = state.linear_schedule_activities.filter(
    (item) => item.linear_schedule_view_id === viewRecord.id
  );
  const packageNameById = new Map(
    state.work_packages
      .map((item) => {
        const packageId = readString(item.package_id);
        if (!packageId) {
          return null;
        }
        const packageName = readString(item.package_name);
        return [packageId, packageName] as const;
      })
      .filter((entry): entry is readonly [string, string | null] => entry !== null)
  );
  const packageTimelineById = new Map<
    string,
    { startDate: string; sequenceOrder: number; label: string }
  >();

  for (const item of viewActivities) {
    const packageId = readString(item.package_id);
    if (!packageId) {
      continue;
    }

    const candidate = {
      startDate: String(item.start_date),
      sequenceOrder: typeof item.sequence_order === "number" ? item.sequence_order : 9999,
      label: packageNameById.get(packageId) ? `${packageNameById.get(packageId)} (${packageId})` : packageId
    };
    const current = packageTimelineById.get(packageId);

    if (
      !current ||
      candidate.startDate < current.startDate ||
      (candidate.startDate === current.startDate && candidate.sequenceOrder < current.sequenceOrder) ||
      (candidate.startDate === current.startDate &&
        candidate.sequenceOrder === current.sequenceOrder &&
        candidate.label.localeCompare(current.label) < 0)
    ) {
      packageTimelineById.set(packageId, candidate);
    }
  }

  const activities = viewActivities
    .filter((item) => matchesMultiFilter(readString(item.package_id), filters.packageIds))
    .filter((item) => matchesFilter(readString(item.workfront), filters.workfront))
    .filter((item) => matchesFilter(readString(item.activity_type), filters.activityType))
    .filter((item) => !filters.scenarioId || readString(item.scenario_id) === filters.scenarioId)
    .map((item) => {
      const activityType = readString(item.activity_type);
      const displayLayer = readString(item.display_layer);
      if (
        !activityType ||
        !vocab.linearActivityTypes.includes(activityType as LinearActivityType) ||
        !displayLayer ||
        !vocab.linearDisplayLayers.includes(displayLayer as LinearDisplayLayer)
      ) {
        throw new Error(`Invalid linear schedule activity '${item.id}' in runtime state`);
      }
      return {
        id: String(item.id),
        activityName: String(item.activity_name),
        displayLabel: displayLabelForActivity(String(item.activity_name), readObject(item.metadata_json)),
        stageKey: readString(readObject(item.metadata_json)?.stage_key),
        activityType: activityType as LinearActivityType,
        displayLayer: displayLayer as LinearDisplayLayer,
        packageId: readString(item.package_id),
        workfront: readString(item.workfront),
        colorKey: readString(item.color_key),
        startDate: String(item.start_date),
        finishDate: String(item.finish_date),
        locationRef: readString(item.location_ref),
        startLocationRef: readString(item.start_location_ref),
        finishLocationRef: readString(item.finish_location_ref),
        sequenceGroup: readString(item.sequence_group),
        sequenceOrder: typeof item.sequence_order === "number" ? item.sequence_order : null,
        metadataJson: readObject(item.metadata_json)
      };
    })
    .sort((left, right) => {
      const startCompare = left.startDate.localeCompare(right.startDate);
      if (startCompare !== 0) {
        return startCompare;
      }
      const sequenceCompare = (left.sequenceOrder ?? 9999) - (right.sequenceOrder ?? 9999);
      if (sequenceCompare !== 0) {
        return sequenceCompare;
      }
      const nameCompare = left.displayLabel.localeCompare(right.displayLabel);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return left.id.localeCompare(right.id);
    });

  const progressPoints = state.linear_progress_points
    .filter((item) => activities.some((activity) => activity.id === item.linear_schedule_activity_id))
    .map((item) => ({
      id: String(item.id),
      linearScheduleActivityId: String(item.linear_schedule_activity_id),
      progressDate: String(item.progress_date),
      locationRef: String(item.location_ref),
      note: readString(item.note)
    }))
    .sort((left, right) => left.progressDate.localeCompare(right.progressDate));

  const progressByActivityId = Object.fromEntries(
    activities.map((activity) => [
      activity.id,
      progressPoints
        .filter((point) => point.linearScheduleActivityId === activity.id)
        .sort((left, right) => left.progressDate.localeCompare(right.progressDate))
    ])
  ) as Record<string, LinearProgressPointRow[]>;

  const ganttRows = [...activities]
    .sort((left, right) => {
      const workfrontCompare = (left.workfront ?? "").localeCompare(right.workfront ?? "");
      if (workfrontCompare !== 0) {
        return workfrontCompare;
      }
      const sequenceGroupCompare = (left.sequenceGroup ?? "").localeCompare(right.sequenceGroup ?? "");
      if (sequenceGroupCompare !== 0) {
        return sequenceGroupCompare;
      }
      const sequenceOrderCompare = (left.sequenceOrder ?? 9999) - (right.sequenceOrder ?? 9999);
      if (sequenceOrderCompare !== 0) {
        return sequenceOrderCompare;
      }
      const startCompare = left.startDate.localeCompare(right.startDate);
      if (startCompare !== 0) {
        return startCompare;
      }
      return left.displayLabel.localeCompare(right.displayLabel);
    })
    .map((activity) => ({
      id: `gantt-${activity.id}`,
      activityId: activity.id,
      label: activity.displayLabel,
      groupLabel: activity.workfront ?? activity.sequenceGroup ?? "Ungrouped",
      startDate: activity.startDate,
      finishDate: activity.finishDate,
      activityType: activity.activityType,
      displayLayer: activity.displayLayer,
      colorKey: activity.colorKey,
      packageId: activity.packageId,
      workfront: activity.workfront,
      sequenceGroup: activity.sequenceGroup,
      sequenceOrder: activity.sequenceOrder
    }));
  const flowNodes = Array.isArray(flowDiagram?.nodes)
    ? flowDiagram.nodes
        .map((entry) => readObject(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => {
          const stageKeys = readStringArray(entry.stage_keys);
          const activityIds = activities
            .filter(
              (activity) =>
                stageKeys.length === 0 || (activity.stageKey !== null && stageKeys.includes(activity.stageKey))
            )
            .map((activity) => activity.id);

          return {
            id: String(entry.id),
            label: String(entry.label),
            subItems: readStringArray(entry.sub_items),
            group: readString(entry.group),
            stageKeys,
            activityIds,
            x: readNumber(entry.x) ?? 0,
            y: readNumber(entry.y) ?? 0,
            width: readNumber(entry.width) ?? 170
          };
        })
    : [];
  const flowEdges = Array.isArray(flowDiagram?.edges)
    ? flowDiagram.edges
        .map((entry) => readObject(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
          id: readString(entry.id) ?? `${String(entry.from)}-${String(entry.to)}`,
          from: String(entry.from),
          to: String(entry.to),
          label: readString(entry.label),
          isSecondaryPath: entry.is_secondary_path === true
        }))
    : [];

  return {
    view: {
      id: String(viewRecord.id),
      name: String(viewRecord.name),
      description: readString(viewRecord.description),
      orientation: String(viewRecord.orientation) as LinearAxisOrientation,
      timeAxisStart: String(viewRecord.time_axis_start),
      timeAxisFinish: String(viewRecord.time_axis_finish),
      dataDate: readString(viewRecord.data_date)
    },
    axis: {
      id: String(axisRecord.id),
      name: String(axisRecord.name),
      description: readString(axisRecord.description),
      unitsLabel: readString(axisRecord.units_label),
      locationReferenceModel: String(axisRecord.location_reference_model),
      locations
    },
    activities,
    progressPoints,
    progressByActivityId,
    ganttRows,
    flow: {
      nodes: flowNodes,
      edges: flowEdges
    },
    scenarios: state.scenarios.map((scenario) => ({
      id: String(scenario.id),
      name: String(scenario.name)
    })).sort((left, right) => left.name.localeCompare(right.name)),
    packages: [...new Set(viewActivities.map((item) => readString(item.package_id)).filter((item): item is string => item !== null))]
      .sort((left, right) => {
        const leftTimeline = packageTimelineById.get(left);
        const rightTimeline = packageTimelineById.get(right);

        if (leftTimeline && rightTimeline) {
          const startCompare = leftTimeline.startDate.localeCompare(rightTimeline.startDate);
          if (startCompare !== 0) {
            return startCompare;
          }

          const sequenceCompare = leftTimeline.sequenceOrder - rightTimeline.sequenceOrder;
          if (sequenceCompare !== 0) {
            return sequenceCompare;
          }

          const labelCompare = leftTimeline.label.localeCompare(rightTimeline.label, undefined, {
            numeric: true
          });
          if (labelCompare !== 0) {
            return labelCompare;
          }
        }

        return left.localeCompare(right, undefined, { numeric: true });
      })
      .map((packageId) => ({
        id: packageId,
        label: packageNameById.get(packageId) ? `${packageNameById.get(packageId)} (${packageId})` : packageId
      })),
    workfronts: [...new Set(viewActivities.map((item) => readString(item.workfront)).filter((item): item is string => item !== null))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((workfront) => ({
        id: workfront,
        label: workfront
      }))
  };
}
