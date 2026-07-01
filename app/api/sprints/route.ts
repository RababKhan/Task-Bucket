import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, dbInsert, type Sprint } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProjectScoped } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "tasks", "view");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  if (!(await canAccessProjectScoped(projectId, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
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
  const startDate = body.start_date ? String(body.start_date) : null;
  const endDate = body.end_date ? String(body.end_date) : null;
  const autoStart = body.auto_start === true;

  if (!projectId || !name) {
    return NextResponse.json(
      { error: "project_id and name are required" },
      { status: 400 }
    );
  }
  const denied = await requirePermission(userId, "projects", "edit");
  if (denied) return denied;
  if (!(await canAccessProjectScoped(projectId, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
  }

  // Auto-start kicks the sprint to "active" if its start date has already
  // arrived (a scheduler would be needed to auto-start future-dated sprints).
  const today = new Date().toISOString().slice(0, 10);
  const status =
    autoStart && startDate && startDate <= today ? "active" : "planned";

  const sprintId = await dbInsert(
    "INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)",
    [projectId, name, goal, startDate, endDate, status]
  );
  const sprint = await dbGet<Sprint>("SELECT * FROM sprints WHERE id = ?", [
    sprintId,
  ]);
  return NextResponse.json(sprint, { status: 201 });
}
