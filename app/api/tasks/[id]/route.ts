import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type Task } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import {
  STATUS_ORDER,
  PRIORITY_ORDER,
  STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_TYPE_LABELS,
  type TaskStatus,
  type TaskPriority,
  type TaskType,
} from "@/lib/types";
import {
  TASK_TYPES,
  TASK_SEVERITIES,
  normalizeLabels,
  parseLabels,
  shapeTask,
} from "@/lib/tasks";

type Ctx = { params: Promise<{ id: string }> };
type TaskRow = Task & { assignees_raw?: string | null };

const STATUSES: string[] = STATUS_ORDER;
const PRIORITIES: string[] = PRIORITY_ORDER;

function fetchShaped(id: string) {
  return dbGet<TaskRow>(
    `SELECT t.*,
       (SELECT group_concat(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id) AS assignees_raw
     FROM tasks t WHERE t.id = ?`,
    [id]
  );
}

// Fetch a task only if its project belongs to the given user.
function ownedTask(id: string, userId: string): Promise<Task | undefined> {
  return dbGet<Task>(
    `SELECT t.* FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN workspace_members m ON m.workspace_id = p.workspace_id
     WHERE t.id = ? AND m.user_id = ?`,
    [id, userId]
  );
}

// Full task for the detail page: the task, its project name, and its subtasks.
export async function GET(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const task = await dbGet<TaskRow & { project_name: string }>(
    `SELECT t.*, p.name AS project_name,
       (SELECT group_concat(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id) AS assignees_raw
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN workspace_members m ON m.workspace_id = p.workspace_id
     WHERE t.id = ? AND m.user_id = ?`,
    [id, userId]
  );
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const shaped = shapeTask(task);

  const subtasks = await dbAll<Task>(
    "SELECT * FROM tasks WHERE parent_id = ? ORDER BY position ASC, id ASC",
    [id]
  );

  // Project's custom fields with this task's values (if any).
  const fieldRows = await dbAll<{
    id: number;
    project_id: number;
    name: string;
    type: string;
    options: string;
    value: string;
  }>(
    `SELECT f.id, f.project_id, f.name, f.type, f.options,
       COALESCE(v.value, '') AS value
     FROM custom_fields f
     LEFT JOIN custom_field_values v ON v.field_id = f.id AND v.task_id = ?
     WHERE f.project_id = ?
     ORDER BY f.id ASC`,
    [id, task.project_id]
  );
  const custom_fields = fieldRows.map((r) => {
    let options: string[] = [];
    try {
      const v = JSON.parse(r.options);
      if (Array.isArray(v)) options = v.map(String);
    } catch {}
    return { ...r, options };
  });

  // Activity log (newest first) with the actor's name/avatar.
  const activity = await dbAll<{
    id: number;
    text: string;
    created_at: string;
    actor_id: string | null;
    actor_name: string | null;
    actor_image: string | null;
  }>(
    `SELECT a.id, a.text, a.created_at, a.actor_id,
       u.name AS actor_name, u.image AS actor_image
     FROM task_activity a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.task_id = ?
     ORDER BY a.id DESC`,
    [id]
  );

  return NextResponse.json({ ...shaped, subtasks, custom_fields, activity });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await ownedTask(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const title =
    body.title !== undefined ? String(body.title).trim() : existing.title;
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const description =
    body.description !== undefined
      ? String(body.description).trim()
      : existing.description;
  const status =
    body.status !== undefined && STATUSES.includes(body.status)
      ? body.status
      : existing.status;
  const priority =
    body.priority !== undefined && PRIORITIES.includes(body.priority)
      ? body.priority
      : existing.priority;
  const dueDate =
    body.due_date !== undefined
      ? body.due_date
        ? String(body.due_date)
        : null
      : existing.due_date;
  const sprintId =
    body.sprint_id !== undefined
      ? body.sprint_id != null
        ? Number(body.sprint_id)
        : null
      : existing.sprint_id;
  // Type only applies to top-level work items, never subtasks.
  const type =
    existing.parent_id == null &&
    body.type !== undefined &&
    TASK_TYPES.includes(body.type)
      ? body.type
      : existing.type;
  const severity =
    body.severity !== undefined
      ? TASK_SEVERITIES.includes(body.severity)
        ? body.severity
        : null
      : existing.severity;
  const startDate =
    body.start_date !== undefined
      ? body.start_date
        ? String(body.start_date)
        : null
      : existing.start_date;
  const storyPoints =
    body.story_points !== undefined
      ? body.story_points != null && body.story_points !== ""
        ? Math.max(0, Math.round(Number(body.story_points))) || null
        : null
      : existing.story_points;
  const labels =
    body.labels !== undefined
      ? normalizeLabels(body.labels)
      : parseLabels(existing.labels);
  const progress =
    body.progress !== undefined
      ? body.progress != null && body.progress !== ""
        ? Math.min(100, Math.max(0, Math.round(Number(body.progress))))
        : null
      : existing.progress;

  await dbRun(
    `UPDATE tasks SET title = ?, description = ?, type = ?, status = ?, priority = ?, severity = ?, story_points = ?, start_date = ?, due_date = ?, labels = ?, sprint_id = ?, progress = ? WHERE id = ?`,
    [
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
      sprintId,
      progress,
      id,
    ]
  );

  // Rebuild assignees when provided.
  if (body.assignees !== undefined) {
    const ids: string[] = Array.isArray(body.assignees)
      ? [...new Set((body.assignees as unknown[]).map(String))]
      : [];
    let valid: string[] = [];
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const rows = await dbAll<{ user_id: string }>(
        `SELECT wm.user_id FROM workspace_members wm
         JOIN projects p ON p.workspace_id = wm.workspace_id
         WHERE p.id = ? AND wm.user_id IN (${placeholders})`,
        [existing.project_id, ...ids]
      );
      valid = rows.map((r) => r.user_id);
    }
    await dbRun("DELETE FROM task_assignees WHERE task_id = ?", [id]);
    for (const uid of valid) {
      await dbRun(
        "INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)",
        [id, uid]
      );
    }
  }

  // Record human-readable activity for whatever changed.
  const events: string[] = [];
  if (title !== existing.title) events.push(`renamed this item to "${title}"`);
  if (status !== existing.status)
    events.push(
      `changed status to ${STATUS_LABELS[status as TaskStatus] ?? status}`
    );
  if (priority !== existing.priority)
    events.push(
      `changed priority to ${
        PRIORITY_LABELS[priority as TaskPriority] ?? priority
      }`
    );
  if (type !== existing.type)
    events.push(
      `changed type to ${TASK_TYPE_LABELS[type as TaskType] ?? type}`
    );
  if (startDate !== existing.start_date)
    events.push(
      startDate ? `set the start date to ${startDate}` : "cleared the start date"
    );
  if (dueDate !== existing.due_date)
    events.push(
      dueDate ? `set the due date to ${dueDate}` : "cleared the due date"
    );
  if (storyPoints !== existing.story_points)
    events.push(
      storyPoints != null
        ? `set story points to ${storyPoints}`
        : "cleared story points"
    );
  if (progress !== existing.progress)
    events.push(
      progress != null ? `set progress to ${progress}%` : "cleared progress"
    );
  if (JSON.stringify(labels) !== JSON.stringify(parseLabels(existing.labels)))
    events.push("updated the labels");
  if (description !== existing.description)
    events.push("updated the description");
  if (sprintId !== existing.sprint_id) events.push("changed the sprint");
  if (body.assignees !== undefined) events.push("updated the assignees");
  for (const text of events) await logActivity(Number(id), userId, text);

  const updated = await fetchShaped(id);
  return NextResponse.json(updated ? shapeTask(updated) : null);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await ownedTask(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await dbRun("DELETE FROM tasks WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
