// Client-safe shared types (no server-only imports here).

export type ProjectStatus =
  | "draft"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "on_hold"
  | "completed"
  | "cancelled";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: "#9ca3af", // grey
  on_track: "#3b82f6", // blue
  at_risk: "#e0a30b", // amber
  off_track: "#f97316", // orange
  on_hold: "#eab308", // yellow
  completed: "#16a34a", // green
  cancelled: "#e5484d", // red
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "draft",
  "on_track",
  "at_risk",
  "off_track",
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

export type TaskStatus =
  | "backlog"
  | "dev_in_progress"
  | "dev_done"
  | "in_test"
  | "test_in_progress"
  | "test_fail"
  | "test_done"
  | "ready_for_deploy"
  | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export const PRIORITY_ORDER: TaskPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "var(--prio-critical)",
  high: "var(--prio-high)",
  medium: "var(--prio-medium)",
  low: "var(--prio-low)",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "#9ca3af",
  dev_in_progress: "#3b82f6",
  dev_done: "#6366f1",
  in_test: "#e0a30b",
  test_in_progress: "#f59e0b",
  test_fail: "#e5484d",
  test_done: "#14b8a6",
  ready_for_deploy: "#8b5cf6",
  done: "#16a34a",
};
export type TaskType = "story" | "task" | "bug";
export type TaskSeverity = "critical" | "major" | "moderate" | "low";

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  story: "Story",
  task: "Task",
  bug: "Bug",
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  story: "#66C2AC", // teal
  task: "#2AA7E1", // light blue
  bug: "#e5484d", // red
};

export const TASK_TYPE_ORDER: TaskType[] = ["story", "task", "bug"];

export const TASK_SEVERITY_LABELS: Record<TaskSeverity, string> = {
  critical: "Critical",
  major: "Major",
  moderate: "Moderate",
  low: "Low",
};

export const TASK_SEVERITY_ORDER: TaskSeverity[] = [
  "critical",
  "major",
  "moderate",
  "low",
];

export type Task = {
  id: number;
  project_id: number;
  parent_id: number | null;
  sprint_id: number | null;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  severity: TaskSeverity | null;
  story_points: number | null;
  start_date: string | null;
  due_date: string | null;
  labels: string[];
  position: number;
  seq: number | null;
  progress: number | null;
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
  backlog: "Backlog",
  dev_in_progress: "Development Ongoing",
  dev_done: "Development Done",
  in_test: "In Test",
  test_in_progress: "Test Ongoing",
  test_fail: "Test Fail",
  test_done: "Test Done",
  ready_for_deploy: "Ready for Deployment",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = [
  "backlog",
  "dev_in_progress",
  "dev_done",
  "in_test",
  "test_in_progress",
  "test_fail",
  "test_done",
  "ready_for_deploy",
  "done",
];
