import { NextResponse } from "next/server";
import { dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { requirePermission } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Cancelling an invite is part of managing members.
  const denied = await requirePermission(userId, "team_member", "cancel");
  if (denied) return denied;

  const { id } = await params;
  const m = await getMembership(userId);
  if (!m) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbRun("DELETE FROM workspace_invites WHERE id = ? AND workspace_id = ?", [
    id,
    m.workspace_id,
  ]);
  return NextResponse.json({ ok: true });
}
