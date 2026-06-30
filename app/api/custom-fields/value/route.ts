import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessTask } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";

// Upsert a custom-field value on a task (task + field must share a project the
// user owns).
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const taskId = Number(body.task_id);
  const fieldId = Number(body.field_id);
  const value = String(body.value ?? "");

  if (!taskId || !fieldId) {
    return NextResponse.json(
      { error: "task_id and field_id are required" },
      { status: 400 }
    );
  }
  // Setting a field value edits the task.
  const denied = await requirePermission(userId, "tasks", "edit");
  if (denied) return denied;
  if (!(await canAccessTask(taskId, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
  }

  const ok = await dbGet(
    `SELECT 1 AS x
     FROM tasks t
     JOIN custom_fields f ON f.project_id = t.project_id
     JOIN projects p ON p.id = t.project_id
     JOIN workspace_members m ON m.workspace_id = p.workspace_id
     WHERE t.id = ? AND f.id = ? AND m.user_id = ?`,
    [taskId, fieldId, userId]
  );
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await dbRun(
    `INSERT INTO custom_field_values (field_id, task_id, value)
     VALUES (?, ?, ?)
     ON CONFLICT(field_id, task_id) DO UPDATE SET value = excluded.value`,
    [fieldId, taskId, value]
  );
  return NextResponse.json({ ok: true });
}
