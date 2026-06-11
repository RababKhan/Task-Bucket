// Client-safe shared types (no server-only imports here).

export type ProjectStatus =
  | "backlog"
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "backlog",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];

export type Project = {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
  manager_id: string | null;
  created_at: string;
};

export type Role = "admin" | "manager" | "assignee";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  assignee: "Assignee",
};

export type Member = {
  user_id: string;
  name: string | null;
  email: string | null;
  role: Role;
  created_at: string;
};

export type PendingInvite = {
  id: number;
  email: string;
  role: Role;
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

export type CustomFieldType = "text" | "number" | "date" | "select";

export type CustomField = {
  id: number;
  project_id: number;
  name: string;
  type: CustomFieldType;
  options: string[]; // for select; empty otherwise
  created_at: string;
};

// A field plus the current value for a particular task.
export type CustomFieldWithValue = CustomField & { value: string };

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
