import { NextResponse } from "next/server";
import { dbAll, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { requirePermission } from "@/lib/rbac";
import { parseProjectAccess } from "@/lib/invites";
import type { PendingInvite } from "@/lib/types";

// GET /api/team/invites — pending invitations for the workspace. Past-due
// pending invites are lazily flipped to 'expired' before listing.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "team_member",
    "view",
    "You do not have permission to view team members."
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ invites: [] });

  // Lazily expire past-due pending invites for this workspace.
  await dbRun(
    `UPDATE workspace_invites
     SET status = 'expired', updated_at = datetime('now')
     WHERE workspace_id = ? AND status = 'pending' AND expires_at < datetime('now')`,
    [m.workspace_id]
  );

  const rows = await dbAll<{
    id: number;
    email: string;
    role: string;
    status: PendingInvite["status"];
    project_access: string;
    message: string | null;
    expires_at: string;
    created_at: string;
  }>(
    `SELECT id, email, role, status, project_access, message, expires_at, created_at
     FROM workspace_invites
     WHERE workspace_id = ? AND status = 'pending'
     ORDER BY created_at DESC`,
    [m.workspace_id]
  );

  const invites: PendingInvite[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    project_access: parseProjectAccess(r.project_access),
    message: r.message,
    expires_at: r.expires_at,
    created_at: r.created_at,
  }));

  return NextResponse.json({ invites });
}
