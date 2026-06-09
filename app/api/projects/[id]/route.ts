import { NextResponse } from "next/server";
import db, { type Project } from "@/lib/db";
import { currentUserId } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

// Fetch a project only if it belongs to the given user.
function ownedProject(id: string, userId: string): Project | undefined {
  return db
    .prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?")
    .get(id, userId) as Project | undefined;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = ownedProject(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const name =
    body.name !== undefined ? String(body.name).trim() : existing.name;
  const description =
    body.description !== undefined
      ? String(body.description).trim()
      : existing.description;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  db.prepare("UPDATE projects SET name = ?, description = ? WHERE id = ?").run(
    name,
    description,
    id
  );

  const updated = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as Project;
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const info = db
    .prepare("DELETE FROM projects WHERE id = ? AND owner_id = ?")
    .run(id, userId);
  if (info.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
