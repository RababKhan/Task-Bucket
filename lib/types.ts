// Client-safe shared types (no server-only imports here).

export type Project = {
  id: number;
  name: string;
  description: string;
  created_at: string;
};

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: number;
  project_id: number;
  parent_id: number | null;
  sprint_id: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  position: number;
  created_at: string;
};

export type SprintStatus = "planned" | "active" | "completed";

export type Sprint = {
  id: number;
  project_id: number;
  name: string;
  goal: string;
  status: SprintStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
