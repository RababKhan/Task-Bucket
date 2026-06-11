import { NextResponse } from "next/server";
import { dbGet, dbRun, type CustomField } from "@/lib/db";
import { currentUserId } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };
type FieldRow = Omit<CustomField, "options"> & { options: string };

function ownedField(id: string, userId: string): Promise<FieldRow | undefined> {
  return dbGet<FieldRow>(
    `SELECT f.* FROM custom_fields f
     JOIN projects p ON p.id = f.project_id
     JOIN workspace_members m ON m.workspace_id = p.workspace_id
     WHERE f.id = ? AND m.user_id = ?`,
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

  const existing = await ownedField(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const name =
    body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  // Options only apply to select fields; the UI sends the full new list.
  let options = existing.options;
  if (body.options !== undefined && Array.isArray(body.options)) {
    options = JSON.stringify(
      body.options.map((o: unknown) => String(o).trim()).filter(Boolean)
    );
  }

  await dbRun("UPDATE custom_fields SET name = ?, options = ? WHERE id = ?", [
    name,
    options,
    id,
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await ownedField(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await dbRun("DELETE FROM custom_field_values WHERE field_id = ?", [id]);
  await dbRun("DELETE FROM custom_fields WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
