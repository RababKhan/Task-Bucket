import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import {
  getUserRoleRow,
  requirePermission,
  assertNotLastAdmin,
} from "@/lib/rbac";

type Ctx = { params: Promise<{ uid: string }> };

// Resolve the acting user's workspace and confirm they may manage roles.
// Role assignment / member deactivation is a role-management capability.
async function manageContext(userId: string): Promise<string | null> {
  const m = await getMembership(userId);
  if (!m) return null;
  return m.workspace_id;
}

// PATCH /api/members/[uid] — change a member's role and/or active state.
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wsId = await manageContext(userId);
  if (!wsId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { uid } = await params;
  const body = await request.json().catch(() => ({}));

  // Gate per field: changing a role needs team_member:update_role; changing the
  // active flag needs team_member:deactivate.
  if (body.role !== undefined) {
    const d = await requirePermission(userId, "team_member", "update_role");
    if (d) return d;
  }
  if (body.active !== undefined) {
    const d = await requirePermission(userId, "team_member", "deactivate");
    if (d) return d;
  }

  // A user can never change their own role or deactivate themselves.
  if (uid === userId) {
    return NextResponse.json(
      { error: "You cannot change your own role." },
      { status: 400 }
    );
  }

  const target = await dbGet<{ role: string; active: number }>(
    "SELECT role, active FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [wsId, uid]
  );
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // --- Validate the requested role (if any) ---
  let nextRole: string | undefined;
  if (body.role !== undefined) {
    const roleKey = String(body.role);
    const valid = await dbGet(
      "SELECT 1 AS x FROM roles WHERE workspace_id = ? AND key = ? AND active = 1",
      [wsId, roleKey]
    );
    if (!valid) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // Only an admin may grant the admin role (prevents privilege escalation by
    // a custom role that happens to hold manage_roles).
    if (roleKey === "admin") {
      const me = await getUserRoleRow(userId);
      if (me?.role !== "admin") {
        return NextResponse.json(
          { error: "Only an Admin can grant the Admin role." },
          { status: 403 }
        );
      }
    }
    nextRole = roleKey;
  }

  // --- Validate the requested active state (if any) ---
  const nextActive =
    body.active === undefined ? undefined : body.active ? 1 : 0;

  if (nextRole === undefined && nextActive === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Don't let the last admin be demoted or deactivated.
  const guard = await assertNotLastAdmin(wsId, uid, { nextRole, nextActive });
  if (guard) return guard;

  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (nextRole !== undefined) {
    sets.push("role = ?");
    args.push(nextRole);
  }
  if (nextActive !== undefined) {
    sets.push("active = ?");
    args.push(nextActive);
  }
  args.push(wsId, uid);
  await dbRun(
    `UPDATE workspace_members SET ${sets.join(", ")} WHERE workspace_id = ? AND user_id = ?`,
    args
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/members/[uid] — remove a member from the workspace.
export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "team_member", "remove");
  if (denied) return denied;

  const wsId = await manageContext(userId);
  if (!wsId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { uid } = await params;
  if (uid === userId) {
    return NextResponse.json(
      { error: "You can't remove yourself." },
      { status: 400 }
    );
  }

  // Don't let the last admin be removed.
  const guard = await assertNotLastAdmin(wsId, uid, { removing: true });
  if (guard) return guard;

  await dbRun(
    "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [wsId, uid]
  );
  return NextResponse.json({ ok: true });
}
