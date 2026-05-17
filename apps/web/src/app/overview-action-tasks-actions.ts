"use server";

import { revalidatePath } from "next/cache";

import {
  createOverviewActionTask,
  deleteOverviewActionTask,
  reorderOverviewActionTasks,
  updateOverviewActionTask
} from "../lib/demo-store";
import type { OverviewActionTaskPriority } from "../lib/overview-action-tasks-types";
import { parseOverviewTaskLinkPath } from "../lib/overview-task-link";

function normalizePriority(value: FormDataEntryValue | null): OverviewActionTaskPriority {
  const raw = String(value ?? "MEDIUM").trim().toUpperCase();
  if (raw === "HIGH" || raw === "MEDIUM" || raw === "LOW") {
    return raw;
  }
  throw new Error("Priority must be HIGH, MEDIUM, or LOW");
}

function notesFromForm(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function linkPathFromForm(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  return parseOverviewTaskLinkPath(raw);
}

function actionError(error: unknown, fallback: string): { error: string } {
  const raw = error instanceof Error ? error.message : fallback;
  if (
    raw.includes("overview_action_tasks") &&
    (raw.includes("schema cache") || raw.includes("does not exist") || raw.includes("relation"))
  ) {
    return {
      error:
        "The overview_action_tasks table is not in your Supabase database yet. Open the SQL Editor in the Supabase dashboard and run the contents of database/migrations/015_overview_action_tasks.sql (or run npm run supabase:bootstrap for a full local reset — see docs/runbooks/supabase_live.md)."
    };
  }
  return { error: raw };
}

export async function createOverviewActionTaskAction(formData: FormData): Promise<{ error?: string }> {
  try {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) {
      throw new Error("Title is required");
    }
    await createOverviewActionTask({
      title,
      notes: notesFromForm(formData.get("notes")),
      priority: normalizePriority(formData.get("priority")),
      linkPath: linkPathFromForm(formData.get("linkPath"))
    });
    revalidatePath("/");
    return {};
  } catch (error) {
    return actionError(error, "Unable to create task");
  }
}

export async function updateOverviewActionTaskAction(formData: FormData): Promise<{ error?: string }> {
  try {
    const id = String(formData.get("taskId") ?? "").trim();
    if (!id) {
      throw new Error("Missing task id");
    }
    const title = String(formData.get("title") ?? "").trim();
    if (!title) {
      throw new Error("Title is required");
    }
    await updateOverviewActionTask(id, {
      title,
      notes: notesFromForm(formData.get("notes")),
      priority: normalizePriority(formData.get("priority")),
      linkPath: linkPathFromForm(formData.get("linkPath"))
    });
    revalidatePath("/");
    return {};
  } catch (error) {
    return actionError(error, "Unable to update task");
  }
}

export async function deleteOverviewActionTaskAction(taskId: string): Promise<{ error?: string }> {
  try {
    await deleteOverviewActionTask(taskId);
    revalidatePath("/");
    return {};
  } catch (error) {
    return actionError(error, "Unable to delete task");
  }
}

export async function reorderOverviewActionTasksAction(orderedIds: string[]): Promise<{ error?: string }> {
  try {
    await reorderOverviewActionTasks(orderedIds);
    revalidatePath("/");
    return {};
  } catch (error) {
    return actionError(error, "Unable to reorder tasks");
  }
}
