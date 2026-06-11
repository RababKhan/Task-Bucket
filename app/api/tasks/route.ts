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

  // Top-level tasks only (subtasks live on the task detail page), with a
  // rolled-up count of their subtasks.
  const tasks = await dbAll<Task & { subtask_total: number; subtask_done: number }>(
    `SELECT t.*,
       (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id) AS subtask_total,
       (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done') AS subtask_done
     FROM tasks t
     WHERE t.project_id = ? AND t.parent_id IS NULL
     ORDER BY t.position ASC, t.id ASC`,
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
  const parentId = body.parent_id != null ? Number(body.parent_id) : null;

  if (!projectId || !title) {
    return NextResponse.json(
      { error: "project_id and title are required" },
      { status: 400 }
    );
  }
  if (!(await userOwnsProject(projectId, userId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // A subtask must hang off a top-level task in the same project (one level deep).
  if (parentId) {
    const parent = await dbGet(
      "SELECT 1 AS x FROM tasks WHERE id = ? AND project_id = ? AND parent_id IS NULL",
      [parentId, projectId]
    );
    if (!parent) {
      return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
    }
  }

  const status = ["todo", "in_progress", "done"].includes(body.status)
    ? body.status
    : "todo";
  const priority = ["low", "medium", "high"].includes(body.priority)
    ? body.priority
    : "medium";
  const description = String(body.description ?? "").trim();
  const dueDate = body.due_date ? String(body.due_date) : null;

  // Position among siblings (same parent + status).
  const posRow = await dbGet<{ maxPos: number }>(
    parentId
      ? "SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE parent_id = ? AND status = ?"
      : "SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE project_id = ? AND parent_id IS NULL AND status = ?",
    [parentId ?? projectId, status]
  );
  const maxPos = posRow?.maxPos ?? -1;

  const info = await dbRun(
    `INSERT INTO tasks (project_id, parent_id, title, description, status, priority, due_date, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [projectId, parentId, title, description, status, priority, dueDate, maxPos + 1]
  );

  const task = await dbGet<Task>("SELECT * FROM tasks WHERE id = ?", [
    info.lastInsertRowid,
  ]);

  return NextResponse.json(task, { status: 201 });
}
