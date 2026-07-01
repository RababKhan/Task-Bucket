import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, dbInsert, type Project } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import {
  getMembership,
  userWorkspaceId,
  accessibleProjectIds,
} from "@/lib/membership";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "projects", "view");
  if (denied) return denied;

  const wsId = await userWorkspaceId(userId);
  if (!wsId) return NextResponse.json([]);

  // Scope to the projects this user may access (admins => all; managers =>
  // managed/assigned; members => assigned). Empty => nothing to show.
  const ids = await accessibleProjectIds(userId);
  if (!ids.length) return NextResponse.json([]);
  const idPlaceholders = ids.map(() => "?").join(",");

  const rows = await dbAll<
    Project & {
      task_count: number;
      done_count: number;
      owner_name: string | null;
      owner_email: string | null;
      manager_name: string | null;
      manager_email: string | null;
      members_raw: string | null;
    }
  >(
    `SELECT p.*,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
       ou.name AS owner_name,
       ou.email AS owner_email,
       mu.name AS manager_name,
       mu.email AS manager_email,
       (SELECT group_concat(u.id || '~~' || u.name || '~~' || u.email, '||')
          FROM project_members pm JOIN users u ON u.id = pm.user_id
          WHERE pm.project_id = p.id) AS members_raw
     FROM projects p
     LEFT JOIN users ou ON ou.id = p.owner_id
     LEFT JOIN users mu ON mu.id = p.manager_id
     WHERE p.workspace_id = ? AND p.id IN (${idPlaceholders})
     ORDER BY p.created_at DESC, p.id DESC`,
    [wsId, ...ids]
  );

  const projects = rows.map(({ members_raw, ...p }) => ({
    ...p,
    progress:
      p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0,
    owner: p.owner_email
      ? { name: p.owner_name ?? "", email: p.owner_email }
      : null,
    manager: p.manager_email
      ? { name: p.manager_name ?? "", email: p.manager_email }
      : null,
    members: (members_raw ?? "")
      .split("||")
      .filter(Boolean)
      .map((s) => {
        const [user_id, name, email] = s.split("~~");
        return { user_id, name, email };
      }),
  }));

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 32);
  const description = String(body.description ?? "").trim().slice(0, 500);

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const membership = await getMembership(userId);
  if (!membership) {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 }
    );
  }
  const denied = await requirePermission(userId, "projects", "create");
  if (denied) return denied;
  const wsId = membership.workspace_id;

  // Only people in this workspace can be owner / manager / members.
  const memberRows = await dbAll<{ user_id: string }>(
    "SELECT user_id FROM workspace_members WHERE workspace_id = ?",
    [wsId]
  );
  const valid = new Set(memberRows.map((r) => r.user_id));

  const STATUSES = [
    "draft",
    "on_track",
    "at_risk",
    "off_track",
    "on_hold",
    "completed",
    "cancelled",
  ];
  const status = STATUSES.includes(body.status) ? body.status : "draft";
  const startDate = body.start_date ? String(body.start_date) : null;
  const dueDate = body.due_date ? String(body.due_date) : null;
  const ownerId =
    body.owner_id && valid.has(body.owner_id) ? body.owner_id : userId;
  const managerId =
    body.manager_id && valid.has(body.manager_id) ? body.manager_id : null;
  const memberIds: string[] = Array.isArray(body.member_ids)
    ? body.member_ids.filter((id: unknown) => valid.has(String(id)))
    : [];

  const projectId = await dbInsert(
    `INSERT INTO projects (owner_id, workspace_id, manager_id, name, description, status, start_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, wsId, managerId, name, description, status, startDate, dueDate]
  );

  for (const uid of memberIds) {
    await dbRun(
      "INSERT INTO project_members (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      [projectId, uid]
    );
  }

  const project = await dbGet<Project>("SELECT * FROM projects WHERE id = ?", [
    projectId,
  ]);

  return NextResponse.json(project, { status: 201 });
}
