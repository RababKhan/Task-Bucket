import "server-only";
import { cache } from "react";
import { NextResponse } from "next/server";
import { dbGet, dbAll } from "@/lib/db";
import {
  ALL_PERM_KEYS,
  permKey,
  type Module,
  type Action,
  type PermKey,
} from "@/lib/permissions";

// Server-side permission resolution and authorization guards.
//
// IMPORTANT: every check here queries the database live. The signed-in role is
// cached on the JWT and can be stale, so it must never be trusted for
// authorization. Querying live is also what makes deactivating or deleting a
// user take effect immediately.

// Clear, user-facing error messages (match the product spec verbatim).
export const ERR = {
  UNAUTHORIZED: "You must be signed in to do this.",
  NO_PERMISSION: "You do not have permission to perform this action.",
  NO_PROJECT_ACCESS: "You do not have access to this project.",
  ONLY_ADMIN_ROLES: "Only Admin can manage roles and permissions.",
  INACTIVE: "This user is inactive.",
  LAST_ADMIN: "At least one Admin must remain in the system.",
  ADMIN_ROLE_LOCKED: "The Admin role can't be edited, deactivated, or deleted.",
  ROLE_IN_USE: "This role is assigned to members and can't be deleted.",
} as const;

export type UserRoleRow = {
  workspace_id: string;
  role: string; // the role key (system or custom)
  active: number; // 0 | 1
  is_system: number; // 0 | 1 (of the resolved role)
  role_id: number | null;
} | null;

// Resolve the user's workspace, role key, active flag, and the matching row in
// the `roles` table (for the role id + is_system). role_id is null only if the
// member's role key has no matching roles row (shouldn't happen post-migration).
// Memoized per request (React cache): all the requirePermission/can/scoping
// calls in a single request share ONE role lookup instead of each re-querying.
export const getUserRoleRow = cache(async function getUserRoleRow(
  userId: string
): Promise<UserRoleRow> {
  const row = await dbGet<{
    workspace_id: string;
    role: string;
    active: number;
    is_system: number | null;
    role_id: number | null;
  }>(
    `SELECT m.workspace_id, m.role, m.active,
            r.id AS role_id, r.is_system AS is_system
     FROM workspace_members m
     LEFT JOIN roles r
       ON r.workspace_id = m.workspace_id AND r.key = m.role
     WHERE m.user_id = ? LIMIT 1`,
    [userId]
  );
  if (!row) return null;
  return {
    workspace_id: row.workspace_id,
    role: row.role,
    active: row.active,
    is_system: row.is_system ?? 0,
    role_id: row.role_id ?? null,
  };
});

// The full set of permissions a user effectively has, as "module:action" keys.
//   - inactive members             => empty (no access)
//   - admin role                   => every valid permission (full access)
//   - everyone else                => the grants on their role
// Memoized per request: the role's full grant set is fetched once and reused by
// every can() call in the request (routes often check many permissions).
export const getEffectivePermissions = cache(async function getEffectivePermissions(
  userId: string
): Promise<Set<PermKey>> {
  const row = await getUserRoleRow(userId);
  if (!row || row.active !== 1) return new Set();
  if (row.role === "admin") return new Set(ALL_PERM_KEYS);
  if (row.role_id == null) return new Set();

  const rows = await dbAll<{ module: string; action: string }>(
    "SELECT module, action FROM role_permissions WHERE role_id = ?",
    [row.role_id]
  );
  return new Set(
    rows.map((r) => permKey(r.module as Module, r.action as Action))
  );
});

// The single permission check. Admins always pass; inactive users always fail.
// Resolves from the memoized permission set, so repeated checks cost nothing.
export async function can(
  userId: string,
  module: Module,
  action: Action
): Promise<boolean> {
  const row = await getUserRoleRow(userId);
  if (!row || row.active !== 1) return false;
  if (row.role === "admin") return true;
  if (row.role_id == null) return false;
  return (await getEffectivePermissions(userId)).has(permKey(module, action));
}

// Guard helper for API routes: returns a 403 NextResponse when the user lacks
// the permission, or null when they're allowed. Distinguishes the
// "deactivated" case so the caller can surface the right message.
//
//   const denied = await requirePermission(userId, "projects", "create");
//   if (denied) return denied;
export async function requirePermission(
  userId: string,
  module: Module,
  action: Action,
  message?: string
): Promise<NextResponse | null> {
  const row = await getUserRoleRow(userId);
  if (!row) {
    return NextResponse.json({ error: ERR.NO_PERMISSION }, { status: 403 });
  }
  if (row.active !== 1) {
    return NextResponse.json({ error: ERR.INACTIVE }, { status: 403 });
  }
  if (await can(userId, module, action)) return null;
  return NextResponse.json(
    { error: message ?? ERR.NO_PERMISSION },
    { status: 403 }
  );
}

// Count the active admin USERS in a workspace.
async function activeAdminCount(workspaceId: string): Promise<number> {
  const row = await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ? AND role = 'admin' AND active = 1",
    [workspaceId]
  );
  return row?.n ?? 0;
}

// Block any change that would leave a workspace with zero active admins:
// removing, deactivating, or demoting the last admin. Returns a 403 or null.
export async function assertNotLastAdmin(
  workspaceId: string,
  targetUserId: string,
  opts: { removing?: boolean; nextRole?: string; nextActive?: number }
): Promise<NextResponse | null> {
  const target = await dbGet<{ role: string; active: number }>(
    "SELECT role, active FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [workspaceId, targetUserId]
  );
  // Only relevant if the target is currently an active admin.
  if (!target || target.role !== "admin" || target.active !== 1) return null;

  const wouldStopBeingAdmin =
    opts.removing === true ||
    opts.nextActive === 0 ||
    (opts.nextRole != null && opts.nextRole !== "admin");
  if (!wouldStopBeingAdmin) return null;

  if ((await activeAdminCount(workspaceId)) <= 1) {
    return NextResponse.json({ error: ERR.LAST_ADMIN }, { status: 400 });
  }
  return null;
}

// Protect the built-in Admin role itself: it can't be edited, deactivated, or
// deleted, and its role/permission-management grants can't be stripped. Pass
// the role id; non-admin roles return null (no restriction).
export async function assertAdminRoleProtected(
  roleId: number,
  change: { deleting?: boolean; nextActive?: number; nextPerms?: PermKey[] }
): Promise<NextResponse | null> {
  const role = await dbGet<{ key: string; is_system: number }>(
    "SELECT key, is_system FROM roles WHERE id = ?",
    [roleId]
  );
  if (!role || role.key !== "admin" || role.is_system !== 1) return null;

  if (change.deleting || change.nextActive === 0) {
    return NextResponse.json(
      { error: ERR.ADMIN_ROLE_LOCKED },
      { status: 400 }
    );
  }
  if (change.nextPerms) {
    const set = new Set(change.nextPerms);
    if (
      !set.has(permKey("roles", "manage_roles")) ||
      !set.has(permKey("roles", "manage_permissions"))
    ) {
      return NextResponse.json(
        { error: ERR.ADMIN_ROLE_LOCKED },
        { status: 400 }
      );
    }
  }
  return null;
}
