import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessTask } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";
import { fetchCommentTree } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

// Toggle an emoji reaction on a comment for the current user.
export async function POST(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const c = await dbGet<{ id: number; task_id: number }>(
    "SELECT id, task_id FROM task_comments WHERE id = ?",
    [id]
  );
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Reacting is a comment-participation action on an accessible task.
  const denied = await requirePermission(userId, "comments", "comment");
  if (denied) return denied;
  if (!(await canAccessTask(c.task_id, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const emoji = String(body.emoji ?? "").trim().slice(0, 16);
  if (!emoji) return NextResponse.json({ error: "No emoji" }, { status: 400 });

  const existing = await dbGet(
    "SELECT 1 AS x FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
    [id, userId, emoji]
  );
  if (existing) {
    await dbRun(
      "DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
      [id, userId, emoji]
    );
  } else {
    await dbRun(
      "INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
      [id, userId, emoji]
    );
  }
  return NextResponse.json({ comments: await fetchCommentTree(c.task_id, userId) });
}
