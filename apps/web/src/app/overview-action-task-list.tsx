"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { appNavRouteOptions } from "../lib/app-nav-routes";
import type { OverviewActionTask, OverviewActionTaskPriority } from "../lib/overview-action-tasks-types";

function formatPriorityLabel(priority: OverviewActionTaskPriority): string {
  switch (priority) {
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return priority;
  }
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [removed] = copy.splice(from, 1);
  copy.splice(to, 0, removed);
  return copy;
}

type Props = {
  mode: "demo" | "supabase";
  initialTasks: OverviewActionTask[];
  createTaskAction: (formData: FormData) => Promise<{ error?: string }>;
  updateTaskAction: (formData: FormData) => Promise<{ error?: string }>;
  deleteTaskAction: (taskId: string) => Promise<{ error?: string }>;
  reorderTasksAction: (orderedIds: string[]) => Promise<{ error?: string }>;
};

function SupabaseTaskRow({
  task,
  onEdit,
  onDelete,
  isPending,
  onDropOnTask
}: {
  task: OverviewActionTask;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  onDropOnTask: (draggedId: string, targetId: string) => void;
}) {
  const body = (
    <>
      <strong>{task.title}</strong>
      {task.notes ? <small>{task.notes}</small> : null}
    </>
  );

  return (
    <div
      className="overview-task-row overview-task-row--supabase"
      onDragEnter={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId =
          event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("Text");
        if (draggedId && draggedId !== task.id) {
          onDropOnTask(draggedId, task.id);
        }
      }}
    >
      {/* Use a div, not <button draggable>: many browsers do not start HTML5 drag from draggable buttons. */}
      <div
        className="overview-task-drag"
        role="button"
        tabIndex={0}
        aria-label="Drag to reorder"
        aria-disabled={isPending}
        draggable={!isPending}
        onDragStart={(event) => {
          if (isPending) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData("text/plain", task.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
          }
        }}
      >
        ::
      </div>
      <span className="overview-task-check" aria-hidden="true" />
      <div className="overview-task-body">
        {task.linkPath ? (
          <Link href={task.linkPath} className="overview-task-link-hit" onClick={(e) => e.stopPropagation()}>
            {body}
          </Link>
        ) : (
          <div className="overview-task-static">{body}</div>
        )}
      </div>
      <em>{formatPriorityLabel(task.priority)}</em>
      <div className="overview-task-actions">
        <button type="button" className="overview-task-icon-btn" disabled={isPending} onClick={() => onEdit(task.id)}>
          Edit
        </button>
        <button type="button" className="overview-task-icon-btn overview-task-icon-btn--risk" disabled={isPending} onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function OverviewActionTaskList({
  mode,
  initialTasks,
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  reorderTasksAction
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tasks, setTasks] = useState(initialTasks);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const handleDropOnTask = (draggedId: string, targetId: string) => {
    if (mode !== "supabase") {
      return;
    }
    const from = tasks.findIndex((t) => t.id === draggedId);
    const to = tasks.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const next = arrayMove(tasks, from, to);
    setTasks(next);
    const orderedIds = next.map((t) => t.id);
    startTransition(async () => {
      const res = await reorderTasksAction(orderedIds);
      if (res.error) {
        setFeedback(res.error);
      } else {
        setFeedback(null);
      }
      router.refresh();
    });
  };

  const runCreate = (formData: FormData) => {
    startTransition(async () => {
      setFeedback(null);
      const res = await createTaskAction(formData);
      if (res.error) {
        setFeedback(res.error);
        return;
      }
      setShowAdd(false);
      router.refresh();
    });
  };

  const runUpdate = (formData: FormData) => {
    startTransition(async () => {
      setFeedback(null);
      const res = await updateTaskAction(formData);
      if (res.error) {
        setFeedback(res.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  };

  const runDelete = (taskId: string) => {
    if (!window.confirm("Delete this task?")) {
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const res = await deleteTaskAction(taskId);
      if (res.error) {
        setFeedback(res.error);
        return;
      }
      if (editingId === taskId) {
        setEditingId(null);
      }
      router.refresh();
    });
  };

  const priorityField = (name: string, defaultValue: OverviewActionTaskPriority) => (
    <label className="overview-task-field">
      <span>Priority</span>
      <select name={name} defaultValue={defaultValue}>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </select>
    </label>
  );

  const linkField = (name: string, defaultHref: string) => (
    <label className="overview-task-field">
      <span>Link when clicked</span>
      <select name={name} defaultValue={defaultHref}>
        <option value="">No link</option>
        {appNavRouteOptions.map((opt) => (
          <option key={opt.href} value={opt.href}>
            {opt.label} ({opt.href})
          </option>
        ))}
      </select>
    </label>
  );

  if (mode === "demo") {
    return (
      <div className="overview-task-list-wrap">
        <div className="overview-task-list">
          {tasks.map((task) => (
            <Link key={task.id} className="overview-task-row" href={task.linkPath ?? "/"}>
              <span className="overview-task-check" aria-hidden="true" />
              <span>
                <strong>{task.title}</strong>
                {task.notes ? <small>{task.notes}</small> : null}
              </span>
              <em>{formatPriorityLabel(task.priority)}</em>
            </Link>
          ))}
        </div>
        <p className="muted overview-task-demo-note">Tasks are sample data in Demo JSON mode. Switch to Supabase to manage this list.</p>
      </div>
    );
  }

  const editingTask = editingId ? tasks.find((t) => t.id === editingId) : undefined;

  return (
    <div className="overview-task-list-wrap">
      {feedback ? <p className="overview-task-error">{feedback}</p> : null}
      <div className="overview-task-list">
        {tasks.length === 0 ? <p className="muted">No action tasks yet. Add one below.</p> : null}
        {tasks.map((task) =>
          editingId === task.id && editingTask ? (
            <form key={task.id} className="overview-task-form" action={runUpdate}>
              <input type="hidden" name="taskId" value={task.id} />
              <label className="overview-task-field">
                <span>Title</span>
                <input name="title" type="text" required defaultValue={editingTask.title} />
              </label>
              <label className="overview-task-field">
                <span>Notes</span>
                <textarea name="notes" rows={2} defaultValue={editingTask.notes ?? ""} />
              </label>
              {priorityField("priority", editingTask.priority)}
              {linkField("linkPath", editingTask.linkPath ?? "")}
              <div className="overview-task-form-actions">
                <button type="submit" className="outline-link" disabled={isPending}>
                  Save
                </button>
                <button type="button" className="outline-link" disabled={isPending} onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <SupabaseTaskRow
              key={task.id}
              task={task}
              isPending={isPending}
              onEdit={setEditingId}
              onDelete={runDelete}
              onDropOnTask={handleDropOnTask}
            />
          )
        )}
      </div>

      <div className="overview-task-toolbar">
        <button type="button" className="outline-link" disabled={isPending} onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Close add form" : "Add task"}
        </button>
      </div>

      {showAdd ? (
        <form className="overview-task-form overview-task-form--add" action={runCreate}>
          <label className="overview-task-field">
            <span>Title</span>
            <input name="title" type="text" required placeholder="e.g. Review site pipeline" />
          </label>
          <label className="overview-task-field">
            <span>Notes</span>
            <textarea name="notes" rows={2} placeholder="Optional context" />
          </label>
          {priorityField("priority", "MEDIUM")}
          {linkField("linkPath", "")}
          <div className="overview-task-form-actions">
            <button type="submit" className="outline-link" disabled={isPending}>
              Create task
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
