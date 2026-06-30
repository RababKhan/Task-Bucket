import { NextResponse } from "next/server";
import { dbAll } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { can, requirePermission } from "@/lib/rbac";
import { ALL_PERM_KEYS, permKey, type Module, type Action } from "@/lib/permissions";

// GET /api/roles/matrix — every workspace role plus its granted permissions, in
// one payload, for the functionality × roles matrix view. The Admin role is
// reported with the full permission set (it always has everything).
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "roles", "view");
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ roles: [], grants: {} });

  const roles = await dbAll<{
    id: number;
    key: string;
    name: string;
    is_system: number;
    active: number;
  }>(
    `SELECT id, key, name, is_system, active FROM roles
     WHERE workspace_id = ?
     ORDER BY is_system DESC,
              CASE key WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'assignee' THEN 2 ELSE 3 END,
              created_at ASC`,
    [m.workspace_id]
  );

  const rows = await dbAll<{ role_id: number; module: string; action: string }>(
    "SELECT role_id, module, action FROM role_permissions WHERE workspace_id = ?",
    [m.workspace_id]
  );

  const grants: Record<number, string[]> = {};
  for (const r of roles) {
    // Admin is implicit-full; everyone else from their stored grants.
    grants[r.id] =
      r.key === "admin" && r.is_system === 1 ? [...ALL_PERM_KEYS] : [];
  }
  for (const row of rows) {
    const key = permKey(row.module as Module, row.action as Action);
    if (!(ALL_PERM_KEYS as string[]).includes(key)) continue; // skip stale keys
    const list = grants[row.role_id];
    if (list && !list.includes(key)) list.push(key);
  }

  return NextResponse.json({
    roles,
    grants,
    can_manage_permissions: await can(userId, "roles", "manage_permissions"),
    can_manage_roles: await can(userId, "roles", "manage_roles"),
  });
}
