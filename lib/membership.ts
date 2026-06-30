import { cache } from "react";
import { dbGet, dbAll } from "@/lib/db";
import type { Role } from "@/lib/types";

// The multi-user model: each user is a member of exactly one workspace, with a
// role. Access to a project is granted to members of the project's workspace.

// Single membership lookup, memoized per request (React cache) so the many
// authorization helpers below — getMembership, isActiveMember, scoping checks —
// share ONE round-trip instead of each issuing its own.
const getMembershipRow = cache(async function getMembershipRow(
  userId: string
): Promise<{ workspace_id: string; role: Role; active: number } | null> {
  const row = await dbGet<{ workspace_id: string; role: Role; active: number }>(
    "SELECT workspace_id, role, active FROM workspace_members WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return row ?? null;
});

export async function getMembership(
  userId: string
): Promise<{ workspace_id: string; role: Role } | null> {
  const row = await getMembershipRow(userId);
  return row ? { workspace_id: row.workspace_id, role: row.role } : null;
}

// Whether the user is a current, active member of a workspace. Deactivated
// members (active = 0) lose all access immediately.
export async function isActiveMember(userId: string): Promise<boolean> {
  const row = await getMembershipRow(userId);
  return !!row && row.active === 1;
}

export async function userWorkspaceId(userId: string): Promise<string | null> {
  return (await getMembership(userId))?.workspace_id ?? null;
}

// The user's role for a specific project (via that project's workspace), or
// null if they aren't a member of it.
export async function projectRole(
  projectId: number | string,
  userId: string
): Promise<Role | null> {
  const row = await dbGet<{ role: Role }>(
    `SELECT m.role
     FROM projects p
     JOIN workspace_members m ON m.workspace_id = p.workspace_id
     WHERE p.id = ? AND m.user_id = ?`,
    [projectId, userId]
  );
  return row?.role ?? null;
}

export async function canAccessProject(
  projectId: number | string,
  userId: string
): Promise<boolean> {
  return (await projectRole(projectId, userId)) !== null;
}

// ---- Assigned-only project/task scoping ----
//
// Workspace membership grants the *role*; these helpers narrow which specific
// projects/tasks a non-admin can actually touch:
//   - admin    => every project in the workspace
//   - manager  => projects they manage (projects.manager_id) or are added to
//                 (project_members)
//   - assignee => projects they're added to (project_members), and within those
//                 only tasks assigned to them or that they created.
// Deactivated members get nothing.

// The project ids the user may access, per the rules above. Returns [] for
// inactive users or users with no membership.
export async function accessibleProjectIds(userId: string): Promise<number[]> {
  const m = await getMembership(userId);
  if (!m) return [];
  if (!(await isActiveMember(userId))) return [];

  if (m.role === "admin") {
    const rows = await dbAll<{ id: number }>(
      "SELECT id FROM projects WHERE workspace_id = ?",
      [m.workspace_id]
    );
    return rows.map((r) => r.id);
  }

  if (m.role === "manager") {
    const rows = await dbAll<{ id: number }>(
      `SELECT p.id FROM projects p
       WHERE p.workspace_id = ?
         AND (p.manager_id = ?
              OR EXISTS (SELECT 1 FROM project_members pm
                         WHERE pm.project_id = p.id AND pm.user_id = ?))`,
      [m.workspace_id, userId, userId]
    );
    return rows.map((r) => r.id);
  }

  // assignee (or any custom role): only projects they're explicitly added to.
  const rows = await dbAll<{ id: number }>(
    `SELECT p.id FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE p.workspace_id = ? AND pm.user_id = ?`,
    [m.workspace_id, userId]
  );
  return rows.map((r) => r.id);
}

// Whether the user may access a specific project under the scoping rules above.
export async function canAccessProjectScoped(
  projectId: number | string,
  userId: string
): Promise<boolean> {
  const m = await getMembership(userId);
  if (!m) return false;
  if (!(await isActiveMember(userId))) return false;

  // The project must belong to the user's workspace.
  const proj = await dbGet<{ manager_id: string | null }>(
    "SELECT manager_id FROM projects WHERE id = ? AND workspace_id = ?",
    [projectId, m.workspace_id]
  );
  if (!proj) return false;

  if (m.role === "admin") return true;

  if (m.role === "manager" && proj.manager_id === userId) return true;

  // manager (not the manager_id) and assignee both fall back to explicit
  // project membership.
  const pm = await dbGet(
    "SELECT 1 AS x FROM project_members WHERE project_id = ? AND user_id = ?",
    [projectId, userId]
  );
  return !!pm;
}

// Whether the user may work on a specific task. Admins and managers with
// project access get the whole project; assignees are limited to tasks assigned
// to them or that they created ("own work only").
export async function canAccessTask(
  taskId: number | string,
  userId: string
): Promise<boolean> {
  const task = await dbGet<{ project_id: number; created_by: string | null }>(
    "SELECT project_id, created_by FROM tasks WHERE id = ?",
    [taskId]
  );
  if (!task) return false;
  if (!(await canAccessProjectScoped(task.project_id, userId))) return false;

  const m = await getMembership(userId);
  if (!m) return false;
  if (m.role === "admin" || m.role === "manager") return true;

  // assignee: only their own tasks.
  if (task.created_by === userId) return true;
  const a = await dbGet(
    "SELECT 1 AS x FROM task_assignees WHERE task_id = ? AND user_id = ?",
    [taskId, userId]
  );
  return !!a;
}
