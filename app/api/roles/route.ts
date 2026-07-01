import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, dbInsert, type RoleRow } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { can, requirePermission, ERR } from "@/lib/rbac";
import { isSystemRoleKey, isValidPermission, parsePermKey } from "@/lib/permissions";

type RoleWithCount = RoleRow & { member_count: number };

// Turn a free-text role name into a stable, url-safe key.
function slugifyKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// GET /api/roles — list the workspace's roles with how many members hold each.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "roles", "view");
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ roles: [] });

  const roles = await dbAll<RoleWithCount>(
    `SELECT r.id, r.workspace_id, r.key, r.name, r.description, r.is_system, r.active, r.created_at,
            (SELECT COUNT(*) FROM workspace_members wm
             WHERE wm.workspace_id = r.workspace_id AND wm.role = r.key) AS member_count
     FROM roles r
     WHERE r.workspace_id = ?
     ORDER BY r.is_system DESC,
              CASE r.key WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'assignee' THEN 2 ELSE 3 END,
              r.created_at ASC`,
    [m.workspace_id]
  );

  // Whether the acting user may manage roles/permissions (drives the UI).
  const canManageRoles = await can(userId, "roles", "manage_roles");
  const canManagePerms = await can(userId, "roles", "manage_permissions");

  return NextResponse.json({
    roles,
    can_manage_roles: canManageRoles,
    can_manage_permissions: canManagePerms,
  });
}

// POST /api/roles — create a custom role (optionally with an initial permission
// set). Requires the roles:manage_roles permission.
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "A role name is required." }, { status: 400 });
  }

  let key = slugifyKey(name);
  if (!key) {
    return NextResponse.json(
      { error: "Enter a role name with letters or numbers." },
      { status: 400 }
    );
  }
  // Custom roles may never reuse a reserved system key.
  if (isSystemRoleKey(key)) key = `${key}_custom`;

  // Ensure the key is unique within the workspace (append a counter if needed).
  let unique = key;
  let n = 1;
  while (
    await dbGet("SELECT 1 AS x FROM roles WHERE workspace_id = ? AND key = ?", [
      m.workspace_id,
      unique,
    ])
  ) {
    n += 1;
    unique = `${key}_${n}`.slice(0, 40);
    if (n > 100) break;
  }

  const roleId = await dbInsert(
    `INSERT INTO roles (workspace_id, key, name, description, is_system, active)
     VALUES (?, ?, ?, ?, 0, 1)`,
    [m.workspace_id, unique, name.slice(0, 80), description.slice(0, 200)]
  );

  // Optional initial permissions: validated "module:action" strings.
  const perms = Array.isArray(body.permissions) ? body.permissions : [];
  for (const p of perms) {
    const pair = parsePermKey(String(p));
    if (!pair) continue;
    const [module, action] = pair;
    if (!isValidPermission(module, action)) continue;
    await dbRun(
      `INSERT INTO role_permissions (role_id, workspace_id, module, action)
       VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [roleId, m.workspace_id, module, action]
    );
  }

  return NextResponse.json({ ok: true, id: roleId, key: unique });
}
