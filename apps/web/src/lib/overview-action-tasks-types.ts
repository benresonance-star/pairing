export type OverviewActionTaskPriority = "HIGH" | "MEDIUM" | "LOW";

export type OverviewActionTask = {
  id: string;
  title: string;
  notes: string | null;
  priority: OverviewActionTaskPriority;
  linkPath: string | null;
  sortOrder: number;
};

export type CreateOverviewActionTaskInput = {
  title: string;
  notes?: string | null;
  priority: OverviewActionTaskPriority;
  linkPath?: string | null;
};

export type UpdateOverviewActionTaskInput = {
  title?: string;
  notes?: string | null;
  priority?: OverviewActionTaskPriority;
  linkPath?: string | null;
};
