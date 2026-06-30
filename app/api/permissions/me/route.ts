import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getUserRoleRow, getEffectivePermissions } from "@/lib/rbac";

// GET /api/permissions/me — the signed-in user's effective permissions, used by
// the client to hide UI they can't use. This is a UX convenience only; every
// action is independently enforced on the server.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await getUserRoleRow(userId);
  if (!row) {
    return NextResponse.json({
      role: null,
      role_name: null,
      active: false,
      permissions: [],
    });
  }

  // The role's display name (per-workspace), falling back to the key.
  const roleRow = await dbGet<{ name: string }>(
    "SELECT name FROM roles WHERE workspace_id = ? AND key = ?",
    [row.workspace_id, row.role]
  );

  // Heartbeat: this route is hit on every app load (PermissionProvider), so use
  // it to keep the member's last-active timestamp fresh. Best-effort.
  await dbRun(
    "UPDATE workspace_members SET last_active_at = datetime('now') WHERE workspace_id = ? AND user_id = ?",
    [row.workspace_id, userId]
  );

  const permissions = [...(await getEffectivePermissions(userId))];

  return NextResponse.json({
    role: row.role,
    role_name: roleRow?.name ?? row.role,
    active: row.active === 1,
    is_admin: row.role === "admin",
    permissions,
  });
}
