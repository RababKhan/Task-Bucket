import { NextResponse } from "next/server";
import { dbGet, dbRun, type Project } from "@/lib/db";
import { currentUserId } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

// Fetch a project only if it belongs to the given user.
function ownedProject(
  id: string,
  userId: string
): Promise<Project | undefined> {
  return dbGet<Project>(
    "SELECT * FROM projects WHERE id = ? AND owner_id = ?",
    [id, userId]
  );
}

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await ownedProject(id, userId);
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

  await dbRun("UPDATE projects SET name = ?, description = ? WHERE id = ?", [
    name,
    description,
    id,
  ]);

  const updated = await dbGet<Project>("SELECT * FROM projects WHERE id = ?", [
    id,
  ]);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await ownedProject(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Remove tasks explicitly (don't rely on FK cascade across drivers).
  await dbRun("DELETE FROM tasks WHERE project_id = ?", [id]);
  await dbRun("DELETE FROM projects WHERE id = ? AND owner_id = ?", [
    id,
    userId,
  ]);
  return NextResponse.json({ ok: true });
}
