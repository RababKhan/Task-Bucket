import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun, type CustomField } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProjectScoped } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";

const TYPES = ["text", "number", "date", "select"];

type FieldRow = Omit<CustomField, "options"> & { options: string };

function parse(row: FieldRow): CustomField {
  let options: string[] = [];
  try {
    const v = JSON.parse(row.options);
    if (Array.isArray(v)) options = v.map(String);
  } catch {}
  return { ...row, options };
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "tasks", "view");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  if (!(await canAccessProjectScoped(projectId, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
  }

  const rows = await dbAll<FieldRow>(
    "SELECT * FROM custom_fields WHERE project_id = ? ORDER BY id ASC",
    [projectId]
  );
  return NextResponse.json(rows.map(parse));
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const projectId = Number(body.project_id);
  const name = String(body.name ?? "").trim();
  const type = TYPES.includes(body.type) ? body.type : "text";
  const options =
    type === "select" && Array.isArray(body.options)
      ? body.options.map((o: unknown) => String(o).trim()).filter(Boolean)
      : [];

  if (!projectId || !name) {
    return NextResponse.json(
      { error: "project_id and name are required" },
      { status: 400 }
    );
  }
  const denied = await requirePermission(userId, "projects", "edit");
  if (denied) return denied;
  if (!(await canAccessProjectScoped(projectId, userId))) {
    return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
  }

  const info = await dbRun(
    "INSERT INTO custom_fields (project_id, name, type, options) VALUES (?, ?, ?, ?)",
    [projectId, name, type, JSON.stringify(options)]
  );
  const row = await dbGet<FieldRow>("SELECT * FROM custom_fields WHERE id = ?", [
    info.lastInsertRowid,
  ]);
  return NextResponse.json(row ? parse(row) : null, { status: 201 });
}
