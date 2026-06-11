import { NextResponse } from "next/server";
import { dbGet, dbRun, type Sprint } from "@/lib/db";
import { currentUserId } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["planned", "active", "completed"];

function ownedSprint(id: string, userId: string): Promise<Sprint | undefined> {
  return dbGet<Sprint>(
    `SELECT s.* FROM sprints s
     JOIN projects p ON p.id = s.project_id
     WHERE s.id = ? AND p.owner_id = ?`,
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

  const existing = await ownedSprint(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const name =
    body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const goal =
    body.goal !== undefined ? String(body.goal).trim() : existing.goal;
  const status =
    body.status !== undefined && STATUSES.includes(body.status)
      ? body.status
      : existing.status;
  const startDate =
    body.start_date !== undefined
      ? body.start_date
        ? String(body.start_date)
        : null
      : existing.start_date;
  const endDate =
    body.end_date !== undefined
      ? body.end_date
        ? String(body.end_date)
        : null
      : existing.end_date;

  await dbRun(
    "UPDATE sprints SET name = ?, goal = ?, status = ?, start_date = ?, end_date = ? WHERE id = ?",
    [name, goal, status, startDate, endDate, id]
  );
  const updated = await dbGet<Sprint>("SELECT * FROM sprints WHERE id = ?", [id]);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await ownedSprint(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Detach tasks, then remove the sprint (don't rely on FK SET NULL).
  await dbRun("UPDATE tasks SET sprint_id = NULL WHERE sprint_id = ?", [id]);
  await dbRun("DELETE FROM sprints WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
