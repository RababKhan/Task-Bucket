import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type Project } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership, userWorkspaceId } from "@/lib/membership";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wsId = await userWorkspaceId(userId);
  if (!wsId) return NextResponse.json([]);

  const projects = await dbAll<Project & { task_count: number }>(
    `SELECT p.*, COUNT(t.id) AS task_count
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE p.workspace_id = ?
     GROUP BY p.id
     ORDER BY p.created_at DESC, p.id DESC`,
    [wsId]
  );
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();

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
  if (membership.role === "assignee") {
    return NextResponse.json(
      { error: "Assignees can't create projects." },
      { status: 403 }
    );
  }
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

  const info = await dbRun(
    `INSERT INTO projects (owner_id, workspace_id, manager_id, name, description, status, start_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, wsId, managerId, name, description, status, startDate, dueDate]
  );
  const projectId = info.lastInsertRowid;

  for (const uid of memberIds) {
    await dbRun(
      "INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)",
      [projectId, uid]
    );
  }

  const project = await dbGet<Project>("SELECT * FROM projects WHERE id = ?", [
    projectId,
  ]);

  return NextResponse.json(project, { status: 201 });
}
