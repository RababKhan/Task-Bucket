import { NextResponse } from "next/server";
import { dbAll, dbGet } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac";
import type { TeamMember } from "@/lib/types";

// GET /api/team/members — the workspace Team Members directory, with
// server-side search (q), filters (role/project/status), and pagination.
export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "team_member",
    "view",
    "You do not have permission to view team members."
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) {
    return NextResponse.json({ members: [], total: 0, page: 1, page_size: 20 });
  }
  const wsId = m.workspace_id;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const role = (searchParams.get("role") ?? "").trim();
  const project = (searchParams.get("project") ?? "").trim();
  const status = (searchParams.get("status") ?? "").trim(); // active|inactive
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number(searchParams.get("pageSize") ?? 20) || 20)
  );

  // Build the filtered WHERE clause + args incrementally.
  const where: string[] = ["wm.workspace_id = ?"];
  const args: (string | number)[] = [wsId];
  if (q) {
    where.push("(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (role) {
    where.push("wm.role = ?");
    args.push(role);
  }
  if (status === "active") where.push("wm.active = 1");
  if (status === "inactive") where.push("wm.active = 0");
  if (project) {
    where.push(
      "EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = wm.user_id)"
    );
    args.push(Number(project));
  }
  const whereSql = where.join(" AND ");

  // All four reads are independent — run them in one parallel batch. The can_*
  // flags resolve from the request-memoized permission set (no extra queries).
  const [totalRow, rows, roles, projects, perms] = await Promise.all([
    dbGet<{ n: number }>(
      `SELECT COUNT(*) AS n
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE ${whereSql}`,
      args
    ),
    dbAll<TeamMember>(
      `SELECT wm.user_id, u.name, u.email, u.image, wm.role,
              COALESCE(r.name, wm.role) AS role_name,
              wm.active, wm.created_at AS joined_at, wm.last_active_at,
              (SELECT COUNT(*) FROM project_members pm WHERE pm.user_id = wm.user_id) AS project_count
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       LEFT JOIN roles r ON r.workspace_id = wm.workspace_id AND r.key = wm.role
       WHERE ${whereSql}
       ORDER BY CASE wm.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'assignee' THEN 2 ELSE 3 END,
                u.name COLLATE NOCASE ASC
       LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    ),
    dbAll<{ key: string; name: string }>(
      "SELECT key, name FROM roles WHERE workspace_id = ? AND active = 1 ORDER BY is_system DESC, created_at ASC",
      [wsId]
    ),
    dbAll<{ id: number; name: string }>(
      "SELECT id, name FROM projects WHERE workspace_id = ? ORDER BY name ASC",
      [wsId]
    ),
    getEffectivePermissions(userId),
  ]);
  const total = totalRow?.n ?? 0;
  const permSet = perms as Set<string>;
  const has = (a: string) =>
    m.role === "admin" || permSet.has(`team_member:${a}`);

  return NextResponse.json({
    members: rows,
    total,
    page,
    page_size: pageSize,
    roles,
    projects,
    my_id: userId,
    my_role: m.role,
    can_invite: has("invite"),
    can_update_role: has("update_role"),
    can_update_project_access: has("invite"),
    can_deactivate: has("deactivate"),
    can_remove: has("remove"),
    can_resend: has("resend"),
    can_cancel: has("cancel"),
  });
}
