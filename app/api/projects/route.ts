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

  const info = await dbRun(
    "INSERT INTO projects (owner_id, workspace_id, name, description) VALUES (?, ?, ?, ?)",
    [userId, membership.workspace_id, name, description]
  );

  const project = await dbGet<Project>("SELECT * FROM projects WHERE id = ?", [
    info.lastInsertRowid,
  ]);

  return NextResponse.json(project, { status: 201 });
}
