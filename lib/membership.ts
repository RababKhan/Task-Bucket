import { dbGet } from "@/lib/db";
import type { Role } from "@/lib/types";

// The multi-user model: each user is a member of exactly one workspace, with a
// role. Access to a project is granted to members of the project's workspace.

export async function getMembership(
  userId: string
): Promise<{ workspace_id: string; role: Role } | null> {
  const row = await dbGet<{ workspace_id: string; role: Role }>(
    "SELECT workspace_id, role FROM workspace_members WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return row ?? null;
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
