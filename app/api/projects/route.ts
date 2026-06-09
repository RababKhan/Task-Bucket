import { NextResponse } from "next/server";
import db, { type Project } from "@/lib/db";
import { currentUserId } from "@/lib/session";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = db
    .prepare(
      `SELECT p.*, COUNT(t.id) AS task_count
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.owner_id = ?
       GROUP BY p.id
       ORDER BY p.created_at DESC, p.id DESC`
    )
    .all(userId) as (Project & { task_count: number })[];
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const info = db
    .prepare(
      "INSERT INTO projects (owner_id, name, description) VALUES (?, ?, ?)"
    )
    .run(userId, name, description);

  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(info.lastInsertRowid) as Project;

  return NextResponse.json(project, { status: 201 });
}
