import { NextResponse } from "next/server";
import { dbGet, dbRun, type Project } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { projectRole } from "@/lib/membership";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const role = await projectRole(id, userId);
  if (!role) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (role === "assignee") {
    return NextResponse.json(
      { error: "You don't have permission to edit this project." },
      { status: 403 }
    );
  }

  const existing = await dbGet<Project>("SELECT * FROM projects WHERE id = ?", [
    id,
  ]);
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

  const role = await projectRole(id, userId);
  if (!role) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can delete projects." },
      { status: 403 }
    );
  }

  // Remove tasks explicitly (don't rely on FK cascade across drivers).
  await dbRun("DELETE FROM tasks WHERE project_id = ?", [id]);
  await dbRun("DELETE FROM projects WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
