import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { requirePermission } from "@/lib/rbac";
import { sha256, isoPlus, INVITE_TTL_MS } from "@/lib/invites";
import { sendEmail, inviteEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/team/invites/[id]/resend — issue a fresh token + expiry for a
// pending or expired invite and re-send the email.
export async function POST(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "team_member", "resend");
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;

  const invite = await dbGet<{
    id: number;
    email: string;
    role: string;
    status: string;
    message: string | null;
  }>(
    "SELECT id, email, role, status, message FROM workspace_invites WHERE id = ? AND workspace_id = ?",
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

  const token = randomBytes(24).toString("hex");
  await dbRun(
    `UPDATE workspace_invites
     SET token_hash = ?, status = 'pending', expires_at = ?, cancelled_at = NULL, updated_at = datetime('now')
     WHERE id = ?`,
    [sha256(token), isoPlus(INVITE_TTL_MS), invite.id]
  );

  const ws = await dbGet<{ name: string }>(
    "SELECT name FROM workspaces WHERE id = ?",
    [m.workspace_id]
  );
  const base =
    process.env.AUTH_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const inviteUrl = `${base}/invite/${token}`;
  try {
    const { subject, html, text } = inviteEmail(
      ws?.name ?? "the workspace",
      invite.role,
      inviteUrl,
      invite.message
    );
    await sendEmail({ to: invite.email, subject, html, text });
  } catch (err) {
    console.error("[team/invite resend] email failed:", err);
  }

  return NextResponse.json({ ok: true, inviteUrl });
}
