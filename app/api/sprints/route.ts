import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type Sprint } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProject } from "@/lib/membership";

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  if (!(await canAccessProject(projectId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sprints = await dbAll<Sprint & { task_count: number }>(
    `SELECT s.*,
       (SELECT COUNT(*) FROM tasks t WHERE t.sprint_id = s.id AND t.parent_id IS NULL) AS task_count
     FROM sprints s
     WHERE s.project_id = ?
     ORDER BY
       CASE s.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
       s.created_at DESC, s.id DESC`,
    [projectId]
  );
  return NextResponse.json(sprints);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.project_id);
  const name = String(body.name ?? "").trim();
  const goal = String(body.goal ?? "").trim();

  if (!projectId || !name) {
    return NextResponse.json(
      { error: "project_id and name are required" },
      { status: 400 }
    );
  }
  if (!(await canAccessProject(projectId, userId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const info = await dbRun(
    "INSERT INTO sprints (project_id, name, goal) VALUES (?, ?, ?)",
    [projectId, name, goal]
  );
  const sprint = await dbGet<Sprint>("SELECT * FROM sprints WHERE id = ?", [
    info.lastInsertRowid,
  ]);
  return NextResponse.json(sprint, { status: 201 });
}
