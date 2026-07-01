import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, dbInsert, type Task } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProjectScoped } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
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
  // Creating a subtask needs subtasks:create; a top-level item needs tasks:create.
  const createDenied = await requirePermission(
    userId,
    parentId ? "subtasks" : "tasks",
    "create"
  );
  if (createDenied) return createDenied;
  if (!(await canAccessProjectScoped(projectId, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
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

  // Per-project incremental number behind the human task id (e.g. DEV-001).
  // Uses a monotonic counter on the project so numbers are never reused, even
  // after a task is deleted.
  await dbRun("UPDATE projects SET task_seq = task_seq + 1 WHERE id = ?", [
    projectId,
  ]);
  const seqRow = await dbGet<{ task_seq: number }>(
    "SELECT task_seq FROM projects WHERE id = ?",
    [projectId]
  );
  const seq = seqRow?.task_seq ?? 1;

  const taskId = await dbInsert(
    `INSERT INTO tasks (project_id, parent_id, title, description, type, status, priority, severity, story_points, start_date, due_date, labels, position, seq, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      seq,
      userId,
    ]
  );

  await logActivity(
    Number(taskId),
    userId,
    parentId ? "added this subtask" : "created this item"
  );
  // Mirror onto the parent's activity feed so it shows the subtask was added.
  if (parentId) {
    await logActivity(Number(parentId), userId, `added a subtask "${title}"`);
  }

  for (const uid of validAssignees) {
    await dbRun(
      "INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
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
