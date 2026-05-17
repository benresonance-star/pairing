"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import {
  createGanttHierarchyNode,
  createScheduleActivity,
  createScheduleDependency,
  deleteGanttHierarchyNode,
  deleteScheduleActivity,
  deleteScheduleDependency,
  moveGanttHierarchyNode,
  updateGanttHierarchyNode,
  updateScheduleActivity
} from "../../../lib/demo-store";

function editorUrl(
  scenarioId: string,
  query: {
    selectedActivityId?: string | null;
    selectedOperationalId?: string | null;
    status?: string | null;
    error?: string | null;
  } = {}
) {
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

function revalidateScenarioEditorPaths(scenarioId: string) {
  revalidatePath("/");
  revalidatePath("/scenarios");
  revalidatePath(`/scenarios/${scenarioId}`);
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

export async function saveScheduleActivityAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const activityId = String(formData.get("activityId") ?? "");
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await updateScheduleActivity(activityId, {
      activityName: String(formData.get("activityName") ?? ""),
      packageId: emptyToNull(formData.get("packageId")),
      workfront: emptyToNull(formData.get("workfront")),
      colorKey: emptyToNull(formData.get("colorKey")),
      startDate: String(formData.get("startDate") ?? ""),
      finishDate: String(formData.get("finishDate") ?? ""),
      locationRef: emptyToNull(formData.get("locationRef")),
      startLocationRef: emptyToNull(formData.get("startLocationRef")),
      finishLocationRef: emptyToNull(formData.get("finishLocationRef")),
      sequenceGroup: emptyToNull(formData.get("sequenceGroup")),
      sequenceOrder: optionalNumber(formData.get("sequenceOrder"))
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId: activityId,
        selectedOperationalId,
        status: "Programme activity updated"
      })
    );
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId: activityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to update schedule activity")
      })
    );
  }
}

export async function createScheduleActivityAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    const result = await createScheduleActivity({
      scenarioId,
      activityName: String(formData.get("activityName") ?? ""),
      packageId: emptyToNull(formData.get("packageId")),
      workfront: emptyToNull(formData.get("workfront")),
      colorKey: emptyToNull(formData.get("colorKey")),
      activityType: String(formData.get("activityType") ?? "linear"),
      displayLayer: String(formData.get("displayLayer") ?? "planned"),
      startDate: String(formData.get("startDate") ?? ""),
      finishDate: String(formData.get("finishDate") ?? ""),
      locationRef: emptyToNull(formData.get("locationRef")),
      startLocationRef: emptyToNull(formData.get("startLocationRef")),
      finishLocationRef: emptyToNull(formData.get("finishLocationRef")),
      sequenceGroup: emptyToNull(formData.get("sequenceGroup")),
      sequenceOrder: optionalNumber(formData.get("sequenceOrder"))
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId: result.activityId,
        selectedOperationalId,
        status: "Programme activity created"
      })
    );
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to create schedule activity")
      })
    );
  }
}

export async function deleteScheduleActivityAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const activityId = String(formData.get("activityId") ?? "");
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await deleteScheduleActivity(activityId);
    revalidateScenarioEditorPaths(scenarioId);
    redirect(
      editorUrl(scenarioId, {
        selectedOperationalId,
        status: "Programme activity deleted"
      })
    );
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId: activityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to delete schedule activity")
      })
    );
  }
}

export async function createGanttHierarchyNodeAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("selectedActivityId"));
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await createGanttHierarchyNode({
      scenarioId,
      label: String(formData.get("label") ?? ""),
      packageId: String(formData.get("packageId") ?? ""),
      parentId: emptyToNull(formData.get("parentId")),
      hierarchyLevel: String(formData.get("hierarchyLevel") ?? "task") === "subtask" ? "subtask" : "task"
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(editorUrl(scenarioId, { selectedActivityId, selectedOperationalId, status: "WBS row created" }));
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to create WBS row")
      })
    );
  }
}

export async function updateGanttHierarchyNodeAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("selectedActivityId"));
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));
  const nodeId = String(formData.get("nodeId") ?? "");

  try {
    await updateGanttHierarchyNode({
      scenarioId,
      nodeId,
      label: String(formData.get("label") ?? "")
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(editorUrl(scenarioId, { selectedActivityId, selectedOperationalId, status: "WBS row updated" }));
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to update WBS row")
      })
    );
  }
}

export async function moveGanttHierarchyNodeAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("selectedActivityId"));
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await moveGanttHierarchyNode({
      scenarioId,
      nodeId: String(formData.get("nodeId") ?? ""),
      direction: String(formData.get("direction") ?? "down") as "up" | "down" | "indent" | "outdent"
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(editorUrl(scenarioId, { selectedActivityId, selectedOperationalId, status: "WBS row moved" }));
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to move WBS row")
      })
    );
  }
}

export async function deleteGanttHierarchyNodeAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("selectedActivityId"));
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await deleteGanttHierarchyNode(scenarioId, String(formData.get("nodeId") ?? ""));
    revalidateScenarioEditorPaths(scenarioId);
    redirect(editorUrl(scenarioId, { selectedActivityId, selectedOperationalId, status: "WBS row deleted" }));
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to delete WBS row")
      })
    );
  }
}

export async function createScheduleDependencyAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("successorActivityId")) ?? emptyToNull(formData.get("selectedActivityId"));
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await createScheduleDependency({
      scenarioId,
      predecessorActivityId: String(formData.get("predecessorActivityId") ?? ""),
      successorActivityId: String(formData.get("successorActivityId") ?? "")
    });
    revalidateScenarioEditorPaths(scenarioId);
    redirect(editorUrl(scenarioId, { selectedActivityId, selectedOperationalId, status: "Dependency created" }));
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to create dependency")
      })
    );
  }
}

export async function deleteScheduleDependencyAction(formData: FormData) {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const selectedActivityId = emptyToNull(formData.get("selectedActivityId"));
  const selectedOperationalId = emptyToNull(formData.get("selectedOperationalId"));

  try {
    await deleteScheduleDependency(scenarioId, String(formData.get("dependencyId") ?? ""));
    revalidateScenarioEditorPaths(scenarioId);
    redirect(editorUrl(scenarioId, { selectedActivityId, selectedOperationalId, status: "Dependency deleted" }));
  } catch (error) {
    redirect(
      editorUrl(scenarioId, {
        selectedActivityId,
        selectedOperationalId,
        error: getActionErrorMessage(error, "Unable to delete dependency")
      })
    );
  }
}
