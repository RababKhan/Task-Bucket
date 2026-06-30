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

// System role keys. Custom roles use arbitrary string keys, so anywhere a role
// value can be a custom role it is typed as `string` (see RoleRow / Member).
export type Role = "admin" | "manager" | "assignee";

// Fallback display labels for the system keys. The authoritative, per-workspace
// display name lives in the `roles` table (RoleRow.name); these are used where a
// roles-table lookup isn't available (e.g. the cached session role).
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Project Manager",
  assignee: "Member",
};

// A row from the `roles` table — a system or custom role within a workspace.
export type RoleRow = {
  id: number;
  workspace_id: string;
  key: string;
  name: string;
  description: string;
  is_system: number; // 0 | 1
  active: number; // 0 | 1
  created_at: string;
};

export type Member = {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string; // a role key (system or custom)
  active: number; // 0 | 1
  created_at: string;
};

export type InviteStatus = "pending" | "accepted" | "expired" | "cancelled";

export type PendingInvite = {
  id: number;
  email: string;
  role: string; // a role key (system or custom)
  status: InviteStatus;
  project_access: number[];
  message: string | null;
  expires_at: string;
  created_at: string;
};

// Derived status shown in the Team Members directory.
export type MemberStatus = "active" | "inactive" | "invited";

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  invited: "Invited",
};

// A row in the workspace Team Members directory.
export type TeamMember = {
  user_id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string; // role key
  role_name: string; // display name
  active: number; // 0 | 1
  project_count: number;
  joined_at: string;
  last_active_at: string | null;
};

// Full member detail (directory/[uid] page).
export type MemberDetail = {
  user_id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  role_name: string;
  is_custom_role: boolean;
  active: number;
  joined_at: string;
  last_active_at: string | null;
  projects: { id: number; name: string }[];
  tasks: { id: number; title: string; seq: number | null; project_id: number; status: string }[];
  activity: { id: number; text: string; created_at: string }[];
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
  created_by: string | null;
  story_id: number | null;
  linked_to: number | null;
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
