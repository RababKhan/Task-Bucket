import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProject } from "@/lib/membership";
import { fetchCommentTree } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

// Toggle an emoji reaction on a comment for the current user.
export async function POST(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const c = await dbGet<{ id: number; task_id: number; project_id: number }>(
    `SELECT c.id, c.task_id, t.project_id
     FROM task_comments c JOIN tasks t ON t.id = c.task_id
     WHERE c.id = ?`,
    [id]
  );
  if (!c || !(await canAccessProject(c.project_id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
      "INSERT OR IGNORE INTO comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)",
      [id, userId, emoji]
    );
  }
  return NextResponse.json({ comments: await fetchCommentTree(c.task_id, userId) });
}
