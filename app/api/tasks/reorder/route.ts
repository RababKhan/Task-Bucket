import { NextResponse } from "next/server";
import { dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";

// Persist a manual drag order for a set of sibling items (linked tasks/bugs or
// subtasks). `ids` is the desired order, top-to-bottom. Lists are read back
// ordered by position DESC, so the top row gets the highest position.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "number")) {
    return NextResponse.json({ error: "ids must be a number[]" }, { status: 400 });
  }

  const n = ids.length;
  for (let i = 0; i < n; i++) {
    await dbRun("UPDATE tasks SET position = ? WHERE id = ?", [n - 1 - i, ids[i]]);
  }

  return NextResponse.json({ ok: true });
}
