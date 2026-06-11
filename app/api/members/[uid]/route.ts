import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";

type Ctx = { params: Promise<{ uid: string }> };
const ROLES = ["admin", "manager", "assignee"];

// Only an admin may change roles / remove members, within their own workspace.
async function adminContext(userId: string) {
  const m = await getMembership(userId);
  if (!m || m.role !== "admin") return null;
  return m.workspace_id;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { uid } = await params;
  const body = await request.json().catch(() => ({}));
  const role = ROLES.includes(body.role) ? body.role : null;
  if (!role) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const wsId = await adminContext(userId);
  if (!wsId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (uid === userId) {
    return NextResponse.json(
      { error: "You can't change your own role." },
      { status: 400 }
    );
  }
  const target = await dbGet(
    "SELECT 1 AS x FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [wsId, uid]
  );
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await dbRun(
    "UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?",
    [role, wsId, uid]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { uid } = await params;

  const wsId = await adminContext(userId);
  if (!wsId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (uid === userId) {
    return NextResponse.json(
      { error: "You can't remove yourself." },
      { status: 400 }
    );
  }
  await dbRun(
    "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [wsId, uid]
  );
  return NextResponse.json({ ok: true });
}
