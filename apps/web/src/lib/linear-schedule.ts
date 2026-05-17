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
  objectRefType: "zone" | "model_object" | "hotlink_instance" | null;
  objectRefId: string | null;
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

export type LinearScheduleGanttRowKind = "summary" | "activity";
export type LinearScheduleGanttHierarchyLevel = "package" | "subtask" | "task" | "activity";

export type LinearScheduleGanttRow = {
  id: string;
  rowKind: LinearScheduleGanttRowKind;
  hierarchyLevel: LinearScheduleGanttHierarchyLevel;
  parentId: string | null;
  depth: number;
  label: string;
  groupLabel: string;
  childIds: string[];
  activityIds: string[];
  startDate: string;
  finishDate: string;
  activityId: string | null;
  activityType: LinearActivityType | null;
  displayLayer: LinearDisplayLayer | null;
  colorKey: string | null;
  packageId: string | null;
  workfront: string | null;
  sequenceGroup: string | null;
  sequenceOrder: number | null;
};

export type LinearScheduleDependencyRow = {
  id: string;
  predecessorActivityId: string;
  successorActivityId: string;
  dependencyType: "finish_to_start";
  lagDays: number;
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
  dependencies: LinearScheduleDependencyRow[];
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

function compareGanttActivities(left: LinearScheduleActivityRow, right: LinearScheduleActivityRow) {
  const startCompare = left.startDate.localeCompare(right.startDate);
  if (startCompare !== 0) {
    return startCompare;
  }
  const finishCompare = left.finishDate.localeCompare(right.finishDate);
  if (finishCompare !== 0) {
    return finishCompare;
  }
  const sequenceOrderCompare = (left.sequenceOrder ?? 9999) - (right.sequenceOrder ?? 9999);
  if (sequenceOrderCompare !== 0) {
    return sequenceOrderCompare;
  }
  const workfrontCompare = (left.workfront ?? "").localeCompare(right.workfront ?? "");
  if (workfrontCompare !== 0) {
    return workfrontCompare;
  }
  const sequenceGroupCompare = (left.sequenceGroup ?? "").localeCompare(right.sequenceGroup ?? "");
  if (sequenceGroupCompare !== 0) {
    return sequenceGroupCompare;
  }
  return left.displayLabel.localeCompare(right.displayLabel);
}

function hierarchyLevelFromDepth(depth: number): LinearScheduleGanttHierarchyLevel {
  if (depth <= 0) {
    return "package";
  }
  if (depth === 1) {
    return "subtask";
  }
  return "task";
}

function representativeColorKey(
  descendantActivityIds: string[],
  activityById: Map<string, LinearScheduleActivityRow>
): string | null {
  const counts = new Map<string, number>();
  for (const activityId of descendantActivityIds) {
    const colorKey = activityById.get(activityId)?.colorKey;
    if (!colorKey) {
      continue;
    }
    counts.set(colorKey, (counts.get(colorKey) ?? 0) + 1);
  }

  let winner: string | null = null;
  let winnerCount = -1;
  for (const [colorKey, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = colorKey;
      winnerCount = count;
    }
  }
  return winner;
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
  const viewRecord =
    (filters.scenarioId
      ? state.linear_schedule_views.find((item) => readString(item.scenario_id) === filters.scenarioId)
      : null) ?? state.linear_schedule_views[0];
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
        objectRefType:
          readString(item.object_ref_type) === "zone" ||
          readString(item.object_ref_type) === "model_object" ||
          readString(item.object_ref_type) === "hotlink_instance"
            ? (readString(item.object_ref_type) as "zone" | "model_object" | "hotlink_instance")
            : null,
        objectRefId: readString(item.object_ref_id),
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
  const effectiveTimeAxisStart =
    activities.length > 0
      ? [String(viewRecord.time_axis_start), ...activities.map((activity) => activity.startDate)].sort(
          (left, right) => left.localeCompare(right)
        )[0]
      : String(viewRecord.time_axis_start);
  const effectiveTimeAxisFinish =
    activities.length > 0
      ? [String(viewRecord.time_axis_finish), ...activities.map((activity) => activity.finishDate)].sort(
          (left, right) => right.localeCompare(left)
        )[0]
      : String(viewRecord.time_axis_finish);

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

  const ganttHierarchy = readObject(viewMetadata?.gantt_hierarchy);
  const sortedGanttActivities = [...activities].sort(compareGanttActivities);
  const activityById = new Map(sortedGanttActivities.map((activity) => [activity.id, activity]));
  const activityIdsByStageKey = new Map<string, string[]>();

  for (const activity of sortedGanttActivities) {
    if (!activity.stageKey) {
      continue;
    }
    const current = activityIdsByStageKey.get(activity.stageKey) ?? [];
    current.push(activity.id);
    activityIdsByStageKey.set(activity.stageKey, current);
  }

  type GanttHierarchyNodeRecord = {
    id: string;
    label: string;
    parentId: string | null;
    packageId: string;
    hierarchyLevel: LinearScheduleGanttHierarchyLevel;
    depth: number;
    directActivityIds: string[];
    descendantActivityIds: string[];
    childNodeIds: string[];
    startDate: string;
    finishDate: string;
    sortOrder: number | null;
  };

  const packageIdsForGantt = [
    ...new Set(sortedGanttActivities.map((activity) => activity.packageId).filter((item): item is string => item !== null))
  ];
  const packageNodeIdByPackageId = new Map(packageIdsForGantt.map((packageId) => [packageId, `package:${packageId}`]));
  const hierarchyNodes = new Map<string, GanttHierarchyNodeRecord>();
  const directActivityIdsByNodeId = new Map<string, Set<string>>();

  for (const packageId of packageIdsForGantt) {
    const packageNodeId = packageNodeIdByPackageId.get(packageId) ?? `package:${packageId}`;
    hierarchyNodes.set(packageNodeId, {
      id: packageNodeId,
      label: packageNameById.get(packageId) ?? packageId,
      parentId: null,
      packageId,
      hierarchyLevel: "package",
      depth: 0,
      directActivityIds: [],
      descendantActivityIds: [],
      childNodeIds: [],
      startDate: "",
      finishDate: "",
      sortOrder: null
    });
    directActivityIdsByNodeId.set(packageNodeId, new Set<string>());
  }

  const metadataNodes = Array.isArray(ganttHierarchy?.nodes)
    ? ganttHierarchy.nodes
        .map((entry) => readObject(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
  const activityLinks = Array.isArray(ganttHierarchy?.activity_links)
    ? ganttHierarchy.activity_links
        .map((entry) => readObject(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];

  for (const entry of metadataNodes) {
    const nodeId = readString(entry.id);
    const packageId = readString(entry.package_id);
    if (!nodeId || !packageId || !packageNodeIdByPackageId.has(packageId)) {
      continue;
    }
    const explicitParentId = readString(entry.parent_id);
    const explicitLevel = readString(entry.hierarchy_level);
    const fallbackParentId = packageNodeIdByPackageId.get(packageId) ?? null;
    const parentId =
      explicitParentId && explicitParentId !== nodeId
        ? explicitParentId
        : fallbackParentId;
    const parentDepth = parentId ? (hierarchyNodes.get(parentId)?.depth ?? 0) : -1;
    const hierarchyLevel = (
      explicitLevel === "package" ||
      explicitLevel === "subtask" ||
      explicitLevel === "task" ||
      explicitLevel === "activity"
        ? explicitLevel
        : hierarchyLevelFromDepth(parentDepth + 1)
    ) as LinearScheduleGanttHierarchyLevel;
    const directActivityIds = new Set<string>(readStringArray(entry.activity_ids));
    const stageKeys = readStringArray(entry.stage_keys);

    for (const stageKey of stageKeys) {
      for (const activityId of activityIdsByStageKey.get(stageKey) ?? []) {
        directActivityIds.add(activityId);
      }
    }

    hierarchyNodes.set(nodeId, {
      id: nodeId,
      label: readString(entry.label) ?? nodeId,
      parentId,
      packageId,
      hierarchyLevel,
      depth: parentDepth + 1,
      directActivityIds: [],
      descendantActivityIds: [],
      childNodeIds: [],
      startDate: "",
      finishDate: "",
      sortOrder: readNumber(entry.sort_order)
    });
    directActivityIdsByNodeId.set(nodeId, directActivityIds);
  }

  for (const entry of activityLinks) {
    const nodeId = readString(entry.node_id);
    if (!nodeId || !directActivityIdsByNodeId.has(nodeId)) {
      continue;
    }
    const directActivityIds = directActivityIdsByNodeId.get(nodeId) ?? new Set<string>();
    for (const activityId of readStringArray(entry.activity_ids)) {
      directActivityIds.add(activityId);
    }
    for (const stageKey of readStringArray(entry.stage_keys)) {
      for (const activityId of activityIdsByStageKey.get(stageKey) ?? []) {
        directActivityIds.add(activityId);
      }
    }
    directActivityIdsByNodeId.set(nodeId, directActivityIds);
  }

  const childNodeIdsByParentId = new Map<string | null, string[]>();
  for (const node of hierarchyNodes.values()) {
    if (node.parentId && hierarchyNodes.has(node.parentId)) {
      const current = childNodeIdsByParentId.get(node.parentId) ?? [];
      current.push(node.id);
      childNodeIdsByParentId.set(node.parentId, current);
    }
  }

  const nodeDepth = (nodeId: string): number => {
    const node = hierarchyNodes.get(nodeId);
    if (!node) {
      return 0;
    }
    if (node.parentId === null || !hierarchyNodes.has(node.parentId)) {
      return 0;
    }
    return nodeDepth(node.parentId) + 1;
  };

  for (const node of hierarchyNodes.values()) {
    node.depth = nodeDepth(node.id);
    node.childNodeIds = childNodeIdsByParentId.get(node.id) ?? [];
    node.directActivityIds = [...(directActivityIdsByNodeId.get(node.id) ?? new Set<string>())].filter((activityId) =>
      activityById.has(activityId)
    );
  }

  const explicitLeafParentByActivityId = new Map<string, string>();
  for (const [nodeId, directActivityIds] of directActivityIdsByNodeId.entries()) {
    const node = hierarchyNodes.get(nodeId);
    if (!node) {
      continue;
    }
    for (const activityId of directActivityIds) {
      if (!activityById.has(activityId)) {
        continue;
      }
      const currentNodeId = explicitLeafParentByActivityId.get(activityId);
      const currentDepth = currentNodeId ? (hierarchyNodes.get(currentNodeId)?.depth ?? -1) : -1;
      if (node.depth >= currentDepth) {
        explicitLeafParentByActivityId.set(activityId, nodeId);
      }
    }
  }

  const leafParentByActivityId = new Map<string, string | null>();
  for (const activity of sortedGanttActivities) {
    const explicitParentId = explicitLeafParentByActivityId.get(activity.id);
    if (explicitParentId) {
      leafParentByActivityId.set(activity.id, explicitParentId);
      continue;
    }
    const packageNodeId = activity.packageId ? packageNodeIdByPackageId.get(activity.packageId) ?? null : null;
    leafParentByActivityId.set(activity.id, packageNodeId);
  }

  const visitedNodeIds = new Set<string>();
  const descendantActivityIdsForNode = (nodeId: string): string[] => {
    const node = hierarchyNodes.get(nodeId);
    if (!node) {
      return [];
    }
    if (visitedNodeIds.has(nodeId)) {
      return node.descendantActivityIds;
    }
    visitedNodeIds.add(nodeId);

    const descendantIds = new Set(node.directActivityIds);
    for (const childNodeId of node.childNodeIds) {
      for (const activityId of descendantActivityIdsForNode(childNodeId)) {
        descendantIds.add(activityId);
      }
    }
    for (const activity of sortedGanttActivities) {
      if (leafParentByActivityId.get(activity.id) === nodeId) {
        descendantIds.add(activity.id);
      }
    }

    node.descendantActivityIds = [...descendantIds].sort((left, right) => {
      const leftActivity = activityById.get(left);
      const rightActivity = activityById.get(right);
      if (leftActivity && rightActivity) {
        return compareGanttActivities(leftActivity, rightActivity);
      }
      return left.localeCompare(right);
    });
    node.startDate = node.descendantActivityIds[0]
      ? String(
          node.descendantActivityIds
            .map((activityId) => activityById.get(activityId)?.startDate ?? "9999-12-31")
            .sort((left, right) => left.localeCompare(right))[0]
        )
      : "";
    node.finishDate = node.descendantActivityIds[0]
      ? String(
          node.descendantActivityIds
            .map((activityId) => activityById.get(activityId)?.finishDate ?? "0000-01-01")
            .sort((left, right) => right.localeCompare(left))[0]
        )
      : "";
    return node.descendantActivityIds;
  };

  for (const nodeId of hierarchyNodes.keys()) {
    descendantActivityIdsForNode(nodeId);
  }

  const visibleHierarchyNodes = [...hierarchyNodes.values()].filter((node) => node.descendantActivityIds.length > 0);
  const visibleNodeIds = new Set(visibleHierarchyNodes.map((node) => node.id));
  const leafActivitiesByParentId = new Map<string | null, LinearScheduleActivityRow[]>();
  for (const activity of sortedGanttActivities) {
    const parentId = leafParentByActivityId.get(activity.id) ?? null;
    if (parentId && !visibleNodeIds.has(parentId)) {
      continue;
    }
    const current = leafActivitiesByParentId.get(parentId) ?? [];
    current.push(activity);
    leafActivitiesByParentId.set(parentId, current);
  }
  for (const current of leafActivitiesByParentId.values()) {
    current.sort(compareGanttActivities);
  }

  const summaryGroupLabel = (
    hierarchyLevel: LinearScheduleGanttHierarchyLevel,
    descendantActivityIds: string[]
  ) => {
    const workfronts = [
      ...new Set(
        descendantActivityIds
          .map((activityId) => activityById.get(activityId)?.workfront ?? null)
          .filter((item): item is string => item !== null)
      )
    ];
    if (workfronts.length === 1) {
      return workfronts[0];
    }
    return hierarchyLevel === "package"
      ? "Package"
      : hierarchyLevel === "subtask"
        ? "Subtask"
        : "Task";
  };

  const ganttRows: LinearScheduleGanttRow[] = [];
  const flattenNode = (nodeId: string) => {
    const node = hierarchyNodes.get(nodeId);
    if (!node || node.descendantActivityIds.length === 0) {
      return;
    }

    const visibleChildNodeIds = node.childNodeIds.filter((childNodeId) => {
      const childNode = hierarchyNodes.get(childNodeId);
      return childNode ? childNode.descendantActivityIds.length > 0 : false;
    });
    const directLeafRows = (leafActivitiesByParentId.get(node.id) ?? []).map((activity) => ({
      id: `gantt-${activity.id}`,
      rowKind: "activity" as const,
      hierarchyLevel: "activity" as const,
      parentId: node.id,
      depth: node.depth + 1,
      label: activity.displayLabel,
      groupLabel: activity.workfront ?? activity.sequenceGroup ?? "Ungrouped",
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
    }));
    const sortedChildItems = [
      ...visibleChildNodeIds.map((childNodeId) => ({
        kind: "node" as const,
        childNodeId,
        sortOrder: hierarchyNodes.get(childNodeId)?.sortOrder ?? null,
        startDate: hierarchyNodes.get(childNodeId)?.startDate ?? "9999-12-31",
        finishDate: hierarchyNodes.get(childNodeId)?.finishDate ?? "9999-12-31",
        label: hierarchyNodes.get(childNodeId)?.label ?? childNodeId
      })),
      ...directLeafRows.map((row) => ({
        kind: "activity" as const,
        row,
        sortOrder: row.sequenceOrder,
        startDate: row.startDate,
        finishDate: row.finishDate,
        label: row.label
      }))
    ].sort((left, right) => {
      const leftSort = left.sortOrder ?? 9999;
      const rightSort = right.sortOrder ?? 9999;
      if (leftSort !== rightSort) {
        return leftSort - rightSort;
      }
      const startCompare = left.startDate.localeCompare(right.startDate);
      if (startCompare !== 0) {
        return startCompare;
      }
      const finishCompare = left.finishDate.localeCompare(right.finishDate);
      if (finishCompare !== 0) {
        return finishCompare;
      }
      return left.label.localeCompare(right.label);
    });

    ganttRows.push({
      id: node.id,
      rowKind: "summary",
      hierarchyLevel: node.hierarchyLevel,
      parentId: visibleNodeIds.has(node.parentId ?? "") ? node.parentId : null,
      depth: node.depth,
      label: node.label,
      groupLabel: summaryGroupLabel(node.hierarchyLevel, node.descendantActivityIds),
      childIds: sortedChildItems.map((item) => (item.kind === "node" ? item.childNodeId : item.row.id)),
      activityIds: node.descendantActivityIds,
      startDate: node.startDate,
      finishDate: node.finishDate,
      activityId: null,
      activityType: null,
      displayLayer: null,
      colorKey: representativeColorKey(node.descendantActivityIds, activityById),
      packageId: node.packageId,
      workfront: null,
      sequenceGroup: null,
      sequenceOrder: null
    });

    for (const item of sortedChildItems) {
      if (item.kind === "node") {
        flattenNode(item.childNodeId);
        continue;
      }
      ganttRows.push(item.row);
    }
  };

  const rootNodeIds = visibleHierarchyNodes
    .filter((node) => node.parentId === null || !visibleNodeIds.has(node.parentId))
    .sort((left, right) => {
      const leftSort = left.sortOrder ?? 9999;
      const rightSort = right.sortOrder ?? 9999;
      if (leftSort !== rightSort) {
        return leftSort - rightSort;
      }
      const startCompare = left.startDate.localeCompare(right.startDate);
      if (startCompare !== 0) {
        return startCompare;
      }
      const finishCompare = left.finishDate.localeCompare(right.finishDate);
      if (finishCompare !== 0) {
        return finishCompare;
      }
      return left.label.localeCompare(right.label);
    })
    .map((node) => node.id);

  for (const rootNodeId of rootNodeIds) {
    flattenNode(rootNodeId);
  }
  const dependencies = Array.isArray(ganttHierarchy?.dependencies)
    ? ganttHierarchy.dependencies
        .map((entry) => readObject(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
          id:
            readString(entry.id) ??
            `${String(entry.predecessor_activity_id)}-${String(entry.successor_activity_id)}`,
          predecessorActivityId: String(entry.predecessor_activity_id),
          successorActivityId: String(entry.successor_activity_id),
          dependencyType: "finish_to_start" as const,
          lagDays: readNumber(entry.lag_days) ?? 0
        }))
        .filter(
          (dependency) =>
            activityById.has(dependency.predecessorActivityId) &&
            activityById.has(dependency.successorActivityId) &&
            dependency.predecessorActivityId !== dependency.successorActivityId
        )
    : [];
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
      timeAxisStart: effectiveTimeAxisStart,
      timeAxisFinish: effectiveTimeAxisFinish,
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
    dependencies,
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
