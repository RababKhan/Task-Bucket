import { NextResponse } from "next/server";
import { dbGet, dbRun, type RoleRow } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import {
  requirePermission,
  assertAdminRoleProtected,
  ERR,
} from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

// Load a role and confirm it belongs to the acting user's workspace.
async function roleInWorkspace(
  roleId: number,
  workspaceId: string
): Promise<RoleRow | null> {
  const r = await dbGet<RoleRow>(
    "SELECT * FROM roles WHERE id = ? AND workspace_id = ?",
    [roleId, workspaceId]
  );
  return r ?? null;
}

// PATCH /api/roles/[id] — rename / re-describe / activate-deactivate a role.
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "roles",
    "manage_roles",
    ERR.ONLY_ADMIN_ROLES
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const role = await roleInWorkspace(Number(id), m.workspace_id);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  // Determine the requested next active state (if any).
  const nextActive =
    body.active === undefined ? undefined : body.active ? 1 : 0;

  // The Admin role is locked: it can't be renamed away from its purpose or
  // deactivated. (Renaming the display label is harmless, but deactivation is
  // blocked here.)
  const adminGuard = await assertAdminRoleProtected(role.id, { nextActive });
  if (adminGuard) return adminGuard;

  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (typeof body.name === "string" && body.name.trim()) {
    sets.push("name = ?");
    args.push(body.name.trim().slice(0, 80));
  }
  if (typeof body.description === "string") {
    sets.push("description = ?");
    args.push(body.description.trim().slice(0, 200));
  }
  if (nextActive !== undefined) {
    sets.push("active = ?");
    args.push(nextActive);
  }
  if (!sets.length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  args.push(role.id);
  await dbRun(`UPDATE roles SET ${sets.join(", ")} WHERE id = ?`, args);
  return NextResponse.json({ ok: true });
}

// DELETE /api/roles/[id] — delete a custom role. System roles can't be deleted,
// and a role still assigned to members can't be deleted (reassign first).
export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "roles",
    "manage_roles",
    ERR.ONLY_ADMIN_ROLES
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const role = await roleInWorkspace(Number(id), m.workspace_id);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (role.is_system === 1) {
    return NextResponse.json(
      { error: "Built-in roles can't be deleted. You can deactivate a custom role instead." },
      { status: 400 }
    );
  }

  const inUse = await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ? AND role = ?",
    [m.workspace_id, role.key]
  );
  if ((inUse?.n ?? 0) > 0) {
    return NextResponse.json({ error: ERR.ROLE_IN_USE }, { status: 400 });
  }

  // role_permissions rows cascade via the FK.
  await dbRun("DELETE FROM roles WHERE id = ?", [role.id]);
  return NextResponse.json({ ok: true });
}
