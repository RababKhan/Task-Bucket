import { NextResponse } from "next/server";
import { dbAll, dbGet, dbInsert } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessTask } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  attachmentStoragePath,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TASK,
  signedDownloadUrl,
  uploadAttachment,
} from "@/lib/attachments";

type Ctx = { params: Promise<{ id: string }> };

type AttachmentRow = {
  id: number;
  task_id: number;
  name: string;
  type: string;
  size: number;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
  uploader_name: string | null;
  uploader_image: string | null;
};

// Shared by GET and POST: the list a client renders after either loading the
// task or finishing an upload. Signed URLs are generated fresh each call —
// the bucket is private, so nothing is ever stored as a permanent public link.
// `uploaded_by_me` (not the raw `uploaded_by` id) is what the UI uses to
// decide whether to show the remove button — same as CommentNode.mine in
// lib/comments.ts.
async function listAttachments(taskId: string, viewerId: string) {
  const rows = await dbAll<AttachmentRow>(
    `SELECT a.id, a.task_id, a.name, a.type, a.size, a.storage_path,
            a.uploaded_by, a.created_at,
            u.name AS uploader_name, u.image AS uploader_image
       FROM task_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.task_id = ?
      ORDER BY a.created_at ASC, a.id ASC`,
    [taskId]
  );
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      size: r.size,
      created_at: r.created_at,
      uploader_name: r.uploader_name,
      uploader_image: r.uploader_image,
      uploaded_by_me: r.uploaded_by === viewerId,
      url: await signedDownloadUrl(r.storage_path),
    }))
  );
}

// GET — list a task's attachments.
export async function GET(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await requirePermission(userId, "tasks", "download");
  if (denied) return denied;
  if (!(await canAccessTask(id, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
  }
  return NextResponse.json({ attachments: await listAttachments(id, userId) });
}

// POST — upload one file (multipart/form-data, field name "file").
export async function POST(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await requirePermission(userId, "tasks", "upload");
  if (denied) return denied;
  if (!(await canAccessTask(id, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
  }

  const count = await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM task_attachments WHERE task_id = ?",
    [id]
  );
  if (Number(count?.n ?? 0) >= MAX_ATTACHMENTS_PER_TASK) {
    return NextResponse.json(
      { error: `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments.` },
      { status: 400 }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "Files must be 20MB or smaller." },
      { status: 400 }
    );
  }

  const name = file.name.slice(0, 200) || "file";
  const type = file.type || "application/octet-stream";
  const path = attachmentStoragePath(Number(id), name);
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    await uploadAttachment(path, bytes, type);
  } catch (err) {
    console.error("[tasks/attachments] upload failed:", err);
    return NextResponse.json(
      { error: "Could not upload that file. Try again." },
      { status: 502 }
    );
  }

  await dbInsert(
    `INSERT INTO task_attachments (task_id, name, type, size, storage_path, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, type, file.size, path, userId]
  );
  await logActivity(Number(id), userId, `attached "${name}"`);

  return NextResponse.json({ attachments: await listAttachments(id, userId) });
}
