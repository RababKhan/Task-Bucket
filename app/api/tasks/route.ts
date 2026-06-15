import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type Task } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProject } from "@/lib/membership";
import { STATUS_ORDER, PRIORITY_ORDER } from "@/lib/types";
import {
  TASK_TYPES,
  TASK_SEVERITIES,
  normalizeLabels,
  shapeTask,
} from "@/lib/tasks";

const STATUSES: string[] = STATUS_ORDER;
const PRIORITIES: string[] = PRIORITY_ORDER;

type TaskRow = Task & { assignees_raw?: string | null };

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

  const rows = await dbAll<
    TaskRow & { subtask_total: number; subtask_done: number }
  >(
    `SELECT t.*,
       (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id) AS subtask_total,
       (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done') AS subtask_done,
       (SELECT group_concat(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id) AS assignees_raw
     FROM tasks t
     WHERE t.project_id = ? AND t.parent_id IS NULL
     ORDER BY t.position ASC, t.id ASC`,
    [projectId]
  );

  return NextResponse.json(rows.map(shapeTask));
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
  // Any member (including assignees) can create tasks.
  if (!(await canAccessProject(projectId, userId))) {
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

  const type =
    !parentId && TASK_TYPES.includes(body.type) ? body.type : "task";
  const status = STATUSES.includes(body.status) ? body.status : "backlog";
  const priority = PRIORITIES.includes(body.priority)
    ? body.priority
    : "medium";
  const severity = TASK_SEVERITIES.includes(body.severity)
    ? body.severity
    : null;
  const description = String(body.description ?? "").trim();
  const startDate = body.start_date ? String(body.start_date) : null;
  const dueDate = body.due_date ? String(body.due_date) : null;
  const storyPoints =
    body.story_points != null && body.story_points !== ""
      ? Math.max(0, Math.round(Number(body.story_points))) || null
      : null;
  const labels = normalizeLabels(body.labels);

  // Only people in the project's workspace can be assignees.
  const assigneeIds: string[] = Array.isArray(body.assignees)
    ? [...new Set((body.assignees as unknown[]).map(String))]
    : [];
  let validAssignees: string[] = [];
  if (assigneeIds.length) {
    const placeholders = assigneeIds.map(() => "?").join(",");
    const rows = await dbAll<{ user_id: string }>(
      `SELECT wm.user_id FROM workspace_members wm
       JOIN projects p ON p.workspace_id = wm.workspace_id
       WHERE p.id = ? AND wm.user_id IN (${placeholders})`,
      [projectId, ...assigneeIds]
    );
    validAssignees = rows.map((r) => r.user_id);
  }

  const posRow = await dbGet<{ maxPos: number }>(
    parentId
      ? "SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE parent_id = ? AND status = ?"
      : "SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE project_id = ? AND parent_id IS NULL AND status = ?",
    [parentId ?? projectId, status]
  );
  const maxPos = posRow?.maxPos ?? -1;

  const info = await dbRun(
    `INSERT INTO tasks (project_id, parent_id, title, description, type, status, priority, severity, story_points, start_date, due_date, labels, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      parentId,
      title,
      description,
      type,
      status,
      priority,
      severity,
      storyPoints,
      startDate,
      dueDate,
      JSON.stringify(labels),
      maxPos + 1,
    ]
  );
  const taskId = info.lastInsertRowid;

  for (const uid of validAssignees) {
    await dbRun(
      "INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)",
      [taskId, uid]
    );
  }

  const row = await dbGet<TaskRow>(
    `SELECT t.*,
       (SELECT group_concat(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id) AS assignees_raw
     FROM tasks t WHERE t.id = ?`,
    [taskId]
  );

  return NextResponse.json(row ? shapeTask(row) : null, { status: 201 });
}
