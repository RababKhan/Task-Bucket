import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type RoleRow } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import {
  requirePermission,
  assertAdminRoleProtected,
  ERR,
} from "@/lib/rbac";
import {
  parsePermKey,
  permKey,
  ALL_PERM_KEYS,
  type PermKey,
} from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

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

// GET /api/roles/[id]/permissions — the role's granted "module:action" keys.
export async function GET(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "roles", "view");
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const role = await roleInWorkspace(Number(id), m.workspace_id);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The Admin role implicitly has every permission.
  if (role.key === "admin" && role.is_system === 1) {
    return NextResponse.json({ permissions: ALL_PERM_KEYS, locked: true });
  }

  const rows = await dbAll<{ module: string; action: string }>(
    "SELECT module, action FROM role_permissions WHERE role_id = ?",
    [role.id]
  );
  const permissions = rows
    .map((r) => permKey(r.module as never, r.action as never))
    .filter((p) => (ALL_PERM_KEYS as string[]).includes(p));
  return NextResponse.json({ permissions, locked: false });
}

// PUT /api/roles/[id]/permissions — replace the role's permission set wholesale.
// Body: { permissions: string[] } of "module:action" keys.
export async function PUT(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "roles",
    "manage_permissions",
    ERR.ONLY_ADMIN_ROLES
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const role = await roleInWorkspace(Number(id), m.workspace_id);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const raw = Array.isArray(body.permissions) ? body.permissions : [];

  // Validate + dedupe to canonical "module:action" keys.
  const valid = new Set<PermKey>();
  for (const p of raw) {
    const pair = parsePermKey(String(p));
    if (pair) valid.add(permKey(pair[0], pair[1]));
  }
  const nextPerms = [...valid];

  // The Admin role's permissions are locked (must retain full management).
  const adminGuard = await assertAdminRoleProtected(role.id, { nextPerms });
  if (adminGuard) return adminGuard;
  if (role.key === "admin" && role.is_system === 1) {
    // Admin is implicit-full; never persist a partial matrix for it.
    return NextResponse.json({ error: ERR.ADMIN_ROLE_LOCKED }, { status: 400 });
  }

  // Replace: clear existing grants, insert the new set.
  await dbRun("DELETE FROM role_permissions WHERE role_id = ?", [role.id]);
  for (const key of nextPerms) {
    const [module, action] = key.split(":");
    await dbRun(
      `INSERT OR IGNORE INTO role_permissions (role_id, workspace_id, module, action)
       VALUES (?, ?, ?, ?)`,
      [role.id, m.workspace_id, module, action]
    );
  }

  return NextResponse.json({ ok: true, permissions: nextPerms });
}
