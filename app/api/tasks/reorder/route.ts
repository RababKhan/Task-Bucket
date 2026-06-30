import { NextResponse } from "next/server";
import { dbAll, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { canAccessProjectScoped } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";

// Persist a manual drag order for a set of sibling items (linked tasks/bugs or
// subtasks). `ids` is the desired order, top-to-bottom. Lists are read back
// ordered by position DESC, so the top row gets the highest position.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "tasks", "edit");
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "number")) {
    return NextResponse.json({ error: "ids must be a number[]" }, { status: 400 });
  }
  if (!ids.length) return NextResponse.json({ ok: true });

  // Verify every task belongs to a project the user can access (prevents
  // reordering tasks outside the caller's reach).
  const placeholders = ids.map(() => "?").join(",");
  const projRows = await dbAll<{ project_id: number }>(
    `SELECT DISTINCT project_id FROM tasks WHERE id IN (${placeholders})`,
    ids as number[]
  );
  for (const r of projRows) {
    if (!(await canAccessProjectScoped(r.project_id, userId))) {
      return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
    }
  }

  const n = ids.length;
  for (let i = 0; i < n; i++) {
    await dbRun("UPDATE tasks SET position = ? WHERE id = ?", [n - 1 - i, ids[i]]);
  }

  return NextResponse.json({ ok: true });
}
