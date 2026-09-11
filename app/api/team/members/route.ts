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

  // Sorting has to happen here rather than in the client: results are paged, so
  // sorting the page you happen to be looking at would order 20 rows out of
  // however many exist. Both values come from a whitelist and are never
  // interpolated from raw input.
  const sort = searchParams.get("sort") === "role" ? "role" : null;
  const dir = searchParams.get("dir") === "desc" ? "DESC" : "ASC";

  // Seniority, not alphabetical: Owner, Admin, Manager, Assignee, then any
  // custom role.
  const ROLE_RANK =
    "CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'assignee' THEN 3 ELSE 4 END";
  const NAME = "u.name COLLATE NOCASE";
  // With no explicit sort, the long-standing default stands: most senior first,
  // then by name — which puts the Owner at the top.
  const orderBy =
    sort === "role"
      ? `${ROLE_RANK} ${dir}, ${NAME} ASC`
      : `${ROLE_RANK} ASC, ${NAME} ASC`;

  // Build the filtered WHERE clause + args incrementally.
  const where: string[] = ["wm.workspace_id = ?"];
  const args: (string | number)[] = [wsId];
  if (q) {
    where.push("(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (role) {
    const roleKeys = role
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (roleKeys.length) {
      where.push(`wm.role IN (${roleKeys.map(() => "?").join(", ")})`);
      args.push(...roleKeys);
    }
  }
  if (status === "active") where.push("wm.active = 1");
  if (status === "inactive") where.push("wm.active = 0");
  if (project) {
    // A comma-separated list: a member matches if they belong to any of the
    // chosen projects. Non-numeric ids are dropped rather than passed through.
    const projectIds = project
      .split(",")
      .map((p) => Number(p.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (projectIds.length) {
      where.push(
        `EXISTS (SELECT 1 FROM project_members pm WHERE pm.user_id = wm.user_id AND pm.project_id IN (${projectIds.map(() => "?").join(", ")}))`
      );
      args.push(...projectIds);
    }
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
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    ),
    dbAll<{ key: string; name: string }>(
      `SELECT key, name FROM roles
        WHERE workspace_id = ? AND active = 1 AND key <> 'owner'
        ORDER BY is_system DESC, created_at ASC`,
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
