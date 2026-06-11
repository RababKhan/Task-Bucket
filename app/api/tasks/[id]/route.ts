import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type Task } from "@/lib/db";
import { currentUserId } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["todo", "in_progress", "done"];
const PRIORITIES = ["low", "medium", "high"];

// Fetch a task only if its project belongs to the given user.
function ownedTask(id: string, userId: string): Promise<Task | undefined> {
  return dbGet<Task>(
    `SELECT t.* FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = ? AND p.owner_id = ?`,
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

  const task = await dbGet<Task & { project_name: string }>(
    `SELECT t.*, p.name AS project_name
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = ? AND p.owner_id = ?`,
    [id, userId]
  );
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const subtasks = await dbAll<Task>(
    "SELECT * FROM tasks WHERE parent_id = ? ORDER BY position ASC, id ASC",
    [id]
  );

  return NextResponse.json({ ...task, subtasks });
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

  await dbRun(
    `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, sprint_id = ? WHERE id = ?`,
    [title, description, status, priority, dueDate, sprintId, id]
  );

  const updated = await dbGet<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
  return NextResponse.json(updated);
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
