import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { requirePermission } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/team/invites/[id]/cancel — mark a pending invite cancelled (the row
// is kept so the status is auditable; the token can no longer be accepted).
export async function POST(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "team_member", "cancel");
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;

  const invite = await dbGet<{ status: string }>(
    "SELECT status FROM workspace_invites WHERE id = ? AND workspace_id = ?",
    [id, m.workspace_id]
  );
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (invite.status === "accepted") {
    return NextResponse.json(
      { error: "This invitation has already been accepted." },
      { status: 409 }
    );
  }

  await dbRun(
    "UPDATE workspace_invites SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND workspace_id = ?",
    [id, m.workspace_id]
  );
  return NextResponse.json({ ok: true });
}
