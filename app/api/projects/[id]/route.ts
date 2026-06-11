import { NextResponse } from "next/server";
import { dbGet, dbRun, dbAll, type Project } from "@/lib/db";
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

  const existing = await dbGet<Project & { workspace_id: string }>(
    "SELECT * FROM projects WHERE id = ?",
    [id]
  );
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const name =
    body.name !== undefined ? String(body.name).trim() : existing.name;
  const description =
    body.description !== undefined
      ? String(body.description).trim()
      : existing.description;

  const VALID_STATUS = [
    "draft", "on_track", "at_risk", "off_track",
    "on_hold", "completed", "cancelled",
  ];
  const status =
    body.status !== undefined && VALID_STATUS.includes(body.status)
      ? body.status
      : existing.status;

  const startDate =
    body.start_date !== undefined
      ? body.start_date || null
      : existing.start_date;
  const dueDate =
    body.due_date !== undefined ? body.due_date || null : existing.due_date;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Only people in this workspace can be manager / members.
  const valid = new Set(
    (
      await dbAll<{ user_id: string }>(
        "SELECT user_id FROM workspace_members WHERE workspace_id = ?",
        [existing.workspace_id]
      )
    ).map((r) => r.user_id)
  );

  const managerId =
    body.manager_id !== undefined
      ? body.manager_id && valid.has(String(body.manager_id))
        ? String(body.manager_id)
        : null
      : existing.manager_id;

  await dbRun(
    "UPDATE projects SET name = ?, description = ?, status = ?, manager_id = ?, start_date = ?, due_date = ? WHERE id = ?",
    [name, description, status, managerId, startDate, dueDate, id]
  );

  if (Array.isArray(body.member_ids)) {
    const memberIds = body.member_ids
      .map((x: unknown) => String(x))
      .filter((x: string) => valid.has(x));
    await dbRun("DELETE FROM project_members WHERE project_id = ?", [id]);
    for (const uid of memberIds) {
      await dbRun(
        "INSERT INTO project_members (project_id, user_id) VALUES (?, ?)",
        [id, uid]
      );
    }
  }

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
