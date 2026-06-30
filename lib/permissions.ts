// Permission model — the single source of truth for the RBAC system.
//
// This file is CLIENT-SAFE: it has no server-only imports, so both the
// permission-matrix UI and the server-side `can()` checks import from here.
// The migration seed (lib/seed-roles.ts) and the matrix columns are both
// derived from the constants below, so the catalog never drifts.

// ---- Modules: the areas of the app access can be granted on ----
export const MODULES = [
  "dashboard",
  "projects",
  "tasks",
  "subtasks",
  "team_member",
  "teams",
  "comments",
  "files",
  "reports",
  "notifications",
  "settings",
  "roles",
] as const;
export type Module = (typeof MODULES)[number];

// ---- Actions: the operations that can be permitted on a module ----
export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "assign",
  "comment",
  "upload",
  "download",
  "invite",
  "update_role",
  "update_project_access",
  "deactivate",
  "remove",
  "resend",
  "cancel",
  "manage_settings",
  "manage_roles",
  "manage_permissions",
] as const;
export type Action = (typeof ACTIONS)[number];

export type PermKey = `${Module}:${Action}`;
export const permKey = (m: Module, a: Action): PermKey => `${m}:${a}`;

// Human-friendly labels for the matrix UI.
export const MODULE_LABELS: Record<Module, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  tasks: "Tasks",
  subtasks: "Subtasks",
  team_member: "Team Members",
  teams: "Teams",
  comments: "Comments",
  files: "Files",
  reports: "Reports",
  notifications: "Notifications",
  settings: "Settings",
  roles: "Roles & Permissions",
};

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  assign: "Assign",
  comment: "Comment",
  upload: "Upload",
  download: "Download",
  invite: "Invite",
  update_role: "Update Role",
  update_project_access: "Update Project Access",
  deactivate: "Deactivate",
  remove: "Remove",
  resend: "Resend Invite",
  cancel: "Cancel Invite",
  manage_settings: "Manage Settings",
  manage_roles: "Manage Roles",
  manage_permissions: "Manage Permissions",
};

// ---- Which actions are valid on which module ----
// Not every action applies to every module. This drives the matrix columns:
// a checkbox is rendered only for valid (module, action) pairs.
export const VALID_ACTIONS: Record<Module, Action[]> = {
  dashboard: ["view"],
  projects: ["view", "create", "edit", "delete", "assign"],
  tasks: ["view", "create", "edit", "delete", "assign", "comment"],
  subtasks: ["view", "create", "edit", "delete", "assign"],
  team_member: [
    "view",
    "invite",
    "edit",
    "update_role",
    "update_project_access",
    "deactivate",
    "remove",
    "resend",
    "cancel",
  ],
  teams: ["view", "create", "edit", "delete"],
  comments: ["view", "create", "edit", "delete", "comment"],
  files: ["view", "upload", "download", "delete"],
  reports: ["view"],
  notifications: ["view"],
  settings: ["view", "manage_settings"],
  roles: ["view", "create", "edit", "delete", "manage_roles", "manage_permissions"],
};

export function isValidPermission(m: Module, a: Action): boolean {
  return VALID_ACTIONS[m]?.includes(a) ?? false;
}

// Every valid (module, action) pair — the Admin grant set.
export function allPermissionPairs(): [Module, Action][] {
  const out: [Module, Action][] = [];
  for (const m of MODULES) for (const a of VALID_ACTIONS[m]) out.push([m, a]);
  return out;
}

export const ALL_PERM_KEYS: PermKey[] = allPermissionPairs().map(([m, a]) =>
  permKey(m, a)
);

// ---- Default permissions for the three system roles ----
// Admin = everything. Manager and Member get sensible starting sets that an
// admin can later customize. The "own work only" narrowing for Member (can edit
// only their own tasks/comments) is enforced at runtime via canAccessTask, not
// expressed here — these are the coarse module/action grants.
export const DEFAULT_PERMISSIONS: Record<
  "admin" | "manager" | "assignee",
  [Module, Action][]
> = {
  admin: allPermissionPairs(),
  manager: [
    ["dashboard", "view"],
    ["projects", "view"],
    ["projects", "create"],
    ["projects", "edit"],
    ["projects", "assign"],
    ["tasks", "view"],
    ["tasks", "create"],
    ["tasks", "edit"],
    ["tasks", "assign"],
    ["tasks", "comment"],
    ["subtasks", "view"],
    ["subtasks", "create"],
    ["subtasks", "edit"],
    ["subtasks", "assign"],
    ["team_member", "view"],
    ["team_member", "invite"],
    ["team_member", "update_project_access"],
    ["team_member", "resend"],
    ["team_member", "cancel"],
    ["teams", "view"],
    ["comments", "view"],
    ["comments", "create"],
    ["comments", "edit"],
    ["comments", "comment"],
    ["files", "view"],
    ["files", "upload"],
    ["files", "download"],
    ["reports", "view"],
    ["notifications", "view"],
    ["settings", "view"],
    ["roles", "view"],
  ],
  assignee: [
    ["dashboard", "view"],
    ["projects", "view"],
    ["team_member", "view"],
    ["tasks", "view"],
    ["tasks", "edit"],
    ["tasks", "comment"],
    ["subtasks", "view"],
    ["subtasks", "edit"],
    ["comments", "view"],
    ["comments", "create"],
    ["comments", "comment"],
    ["files", "view"],
    ["files", "upload"],
    ["files", "download"],
    ["notifications", "view"],
  ],
};

// The reserved system role keys. Custom roles may not reuse these.
export const SYSTEM_ROLE_KEYS = ["admin", "manager", "assignee"] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export function isSystemRoleKey(key: string): key is SystemRoleKey {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);
}

// Parse a "module:action" string back into a validated pair (or null).
export function parsePermKey(s: string): [Module, Action] | null {
  const [m, a] = s.split(":");
  if (
    (MODULES as readonly string[]).includes(m) &&
    (ACTIONS as readonly string[]).includes(a) &&
    isValidPermission(m as Module, a as Action)
  ) {
    return [m as Module, a as Action];
  }
  return null;
}
