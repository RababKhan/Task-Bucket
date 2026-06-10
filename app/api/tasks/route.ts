import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type Task } from "@/lib/db";
import { currentUserId } from "@/lib/session";

async function userOwnsProject(
  projectId: number | string,
  userId: string
): Promise<boolean> {
  const row = await dbGet(
    "SELECT 1 AS x FROM projects WHERE id = ? AND owner_id = ?",
    [projectId, userId]
  );
  return !!row;
}

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
  if (!(await userOwnsProject(projectId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tasks = await dbAll<Task>(
    "SELECT * FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC",
    [projectId]
  );

  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.project_id);
  const title = String(body.title ?? "").trim();

  if (!projectId || !title) {
    return NextResponse.json(
      { error: "project_id and title are required" },
      { status: 400 }
    );
  }
  if (!(await userOwnsProject(projectId, userId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const status = ["todo", "in_progress", "done"].includes(body.status)
    ? body.status
    : "todo";
  const priority = ["low", "medium", "high"].includes(body.priority)
    ? body.priority
    : "medium";
  const description = String(body.description ?? "").trim();
  const dueDate = body.due_date ? String(body.due_date) : null;

  const posRow = await dbGet<{ maxPos: number }>(
    "SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE project_id = ? AND status = ?",
    [projectId, status]
  );
  const maxPos = posRow?.maxPos ?? -1;

  const info = await dbRun(
    `INSERT INTO tasks (project_id, title, description, status, priority, due_date, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, title, description, status, priority, dueDate, maxPos + 1]
  );

  const task = await dbGet<Task>("SELECT * FROM tasks WHERE id = ?", [
    info.lastInsertRowid,
  ]);

  return NextResponse.json(task, { status: 201 });
}
