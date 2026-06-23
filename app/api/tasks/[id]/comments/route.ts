import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProject } from "@/lib/membership";
import { fetchCommentTree } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

// Resolve the task and verify the user can access its project.
async function ensureAccess(taskId: string, userId: string) {
  const t = await dbGet<{ project_id: number }>(
    "SELECT project_id FROM tasks WHERE id = ?",
    [taskId]
  );
  if (!t) return null;
  if (!(await canAccessProject(t.project_id, userId))) return null;
  return t;
}

export async function GET(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ensureAccess(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ comments: await fetchCommentTree(id, userId) });
}

export async function POST(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ensureAccess(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();

  // Attachments arrive as data URLs (capped to keep DB rows reasonable).
  const rawAtt = Array.isArray(body.attachments) ? body.attachments : [];
  const attachments = rawAtt
    .slice(0, 8)
    .map((a: { name?: unknown; type?: unknown; data?: unknown }) => ({
      name: String(a?.name ?? "file").slice(0, 200),
      type: String(a?.type ?? ""),
      data: String(a?.data ?? ""),
    }))
    .filter(
      (a: { data: string }) =>
        a.data.startsWith("data:") && a.data.length < 6_000_000
    );

  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: "Empty comment" }, { status: 400 });
  }

  // Replies attach to a top-level comment of the same task; resolve to that
  // comment's root so threads stay one level deep.
  let parentId: number | null = null;
  if (body.parent_id != null) {
    const p = await dbGet<{ id: number; parent_id: number | null }>(
      "SELECT id, parent_id FROM task_comments WHERE id = ? AND task_id = ?",
      [Number(body.parent_id), id]
    );
    if (p) parentId = p.parent_id ?? p.id;
  }

  const info = await dbRun(
    "INSERT INTO task_comments (task_id, parent_id, user_id, body) VALUES (?, ?, ?, ?)",
    [id, parentId, userId, text.slice(0, 5000)]
  );
  const commentId = info.lastInsertRowid;
  for (const a of attachments) {
    await dbRun(
      "INSERT INTO comment_attachments (comment_id, name, type, data) VALUES (?, ?, ?, ?)",
      [commentId, a.name, a.type, a.data]
    );
  }
  return NextResponse.json({ comments: await fetchCommentTree(id, userId) });
}
