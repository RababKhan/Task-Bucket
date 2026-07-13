import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { can } from "@/lib/rbac";
import { fetchCommentTree } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

type CommentRow = { id: number; task_id: number; user_id: string | null };

// Load a comment regardless of author.
async function getComment(id: string): Promise<CommentRow | null> {
  const c = await dbGet<CommentRow>(
    "SELECT id, task_id, user_id FROM task_comments WHERE id = ?",
    [id]
  );
  return c ?? null;
}

// Return the comment only if it belongs to the requesting user (authors edit
// their own messages).
async function ownComment(id: string, userId: string) {
  const c = await getComment(id);
  return c && c.user_id === userId ? c : null;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const c = await ownComment(id, userId);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty comment" }, { status: 400 });

  await dbRun(
    "UPDATE task_comments SET body = ?, updated_at = datetime('now') WHERE id = ?",
    [text.slice(0, 5000), id]
  );
  return NextResponse.json({ comments: await fetchCommentTree(c.task_id, userId) });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  // Authors may always delete their own comment; otherwise the comments:delete
  // permission (moderation) is required.
  const c = await getComment(id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isAuthor = c.user_id === userId;
  if (!isAuthor && !(await can(userId, "tasks", "edit"))) {
    return NextResponse.json(
      { error: "You do not have permission to delete this comment." },
      { status: 403 }
    );
  }

  // Cascades to replies and reactions via foreign keys.
  await dbRun("DELETE FROM task_comments WHERE id = ?", [id]);
  return NextResponse.json({ comments: await fetchCommentTree(c.task_id, userId) });
}
