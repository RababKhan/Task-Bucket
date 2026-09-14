import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessTask } from "@/lib/membership";
import { can } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { deleteAttachment } from "@/lib/attachments";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

// DELETE — remove one attachment. Same rule as comment delete (see
// app/api/comments/[id]/route.ts): the person who uploaded it may always
// remove it; anyone else needs the tasks:edit permission (moderation).
export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, attachmentId } = await params;
  if (!(await canAccessTask(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = await dbGet<{
    id: number;
    task_id: number;
    name: string;
    storage_path: string;
    uploaded_by: string | null;
  }>(
    "SELECT id, task_id, name, storage_path, uploaded_by FROM task_attachments WHERE id = ? AND task_id = ?",
    [attachmentId, id]
  );
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isUploader = row.uploaded_by === userId;
  if (!isUploader && !(await can(userId, "tasks", "edit"))) {
    return NextResponse.json(
      { error: "You do not have permission to remove this attachment." },
      { status: 403 }
    );
  }

  await dbRun("DELETE FROM task_attachments WHERE id = ?", [row.id]);
  await deleteAttachment(row.storage_path);
  await logActivity(row.task_id, userId, `removed the attachment "${row.name}"`);

  return NextResponse.json({ ok: true });
}
