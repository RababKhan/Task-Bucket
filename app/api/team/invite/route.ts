import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership, accessibleProjectIds } from "@/lib/membership";
import { requirePermission, getUserRoleRow, ERR } from "@/lib/rbac";
import { sha256, isoPlus, INVITE_TTL_MS } from "@/lib/invites";
import { sendEmail, inviteEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/team/invite — invite a new member to the acting user's workspace,
// optionally granting initial project access and an optional message.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "team_member",
    "invite",
    "You do not have permission to invite members."
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const wsId = m.workspace_id;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const message = body.message ? String(body.message).slice(0, 1000) : null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  // Validate the requested role against this workspace's active roles; only an
  // admin may invite someone as an admin.
  const roleKey = String(body.role ?? "assignee");
  const roleRow = await dbGet(
    "SELECT 1 AS x FROM roles WHERE workspace_id = ? AND key = ? AND active = 1",
    [wsId, roleKey]
  );
  const role = roleRow ? roleKey : "assignee";
  if (role === "admin") {
    const me = await getUserRoleRow(userId);
    if (me?.role !== "admin") {
      return NextResponse.json(
        { error: "Only an Admin can invite someone as an Admin." },
        { status: 403 }
      );
    }
  }

  // Block inviting someone who is already a member of this workspace.
  const existing = await dbGet(
    `SELECT 1 AS x FROM workspace_members wm JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ? AND u.email = ? COLLATE NOCASE`,
    [wsId, email]
  );
  if (existing) {
    return NextResponse.json(
      { error: "This user already exists in this workspace." },
      { status: 409 }
    );
  }

  // Validate requested project access: each id must be in this workspace and the
  // inviter must be allowed to grant it (admin: any; otherwise scoped access).
  const requested: number[] = Array.isArray(body.project_access)
    ? [
        ...new Set(
          (body.project_access as unknown[])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n))
        ),
      ]
    : [];
  // Resolve the workspace's projects and the inviter's grantable set in two
  // queries (not one-per-id). A requested project outside the workspace is
  // ignored; one inside the workspace the inviter can't grant is an error.
  const grantable: number[] = [];
  if (requested.length) {
    const [wsProjects, accessible] = await Promise.all([
      dbAll<{ id: number }>(
        "SELECT id FROM projects WHERE workspace_id = ?",
        [wsId]
      ),
      accessibleProjectIds(userId),
    ]);
    const wsSet = new Set(wsProjects.map((p) => p.id));
    const accessibleSet = new Set(accessible);
    for (const pid of requested) {
      if (!wsSet.has(pid)) continue;
      if (accessibleSet.has(pid)) grantable.push(pid);
      else
        return NextResponse.json(
          { error: ERR.NO_PROJECT_ACCESS },
          { status: 403 }
        );
    }
  }

  // Supersede any prior pending invite for this email in the workspace.
  await dbRun(
    "UPDATE workspace_invites SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE workspace_id = ? AND email = ? COLLATE NOCASE AND status = 'pending'",
    [wsId, email]
  );

  const token = randomBytes(24).toString("hex");
  await dbRun(
    `INSERT INTO workspace_invites
       (workspace_id, email, role, token_hash, invited_by, status, project_access, message, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      wsId,
      email,
      role,
      sha256(token),
      userId,
      JSON.stringify(grantable),
      message,
      isoPlus(INVITE_TTL_MS),
    ]
  );

  const ws = await dbGet<{ name: string }>(
    "SELECT name FROM workspaces WHERE id = ?",
    [wsId]
  );
  const base =
    process.env.AUTH_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const inviteUrl = `${base}/invite/${token}`;
  try {
    const { subject, html, text } = inviteEmail(
      ws?.name ?? "the workspace",
      role,
      inviteUrl,
      message
    );
    await sendEmail({ to: email, subject, html, text });
  } catch (err) {
    console.error("[team/invite] email failed:", err);
  }

  return NextResponse.json({ ok: true, inviteUrl });
}

// GET helper: which projects the inviter can grant + assignable roles, for the
// invite modal. Reuses the same gate as POST.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "team_member", "invite");
  if (denied) return denied;
  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ roles: [], projects: [] });

  const [roles, allProjects, accessible] = await Promise.all([
    dbAll<{ key: string; name: string }>(
      "SELECT key, name FROM roles WHERE workspace_id = ? AND active = 1 ORDER BY is_system DESC, created_at ASC",
      [m.workspace_id]
    ),
    dbAll<{ id: number; name: string }>(
      "SELECT id, name FROM projects WHERE workspace_id = ? ORDER BY name ASC",
      [m.workspace_id]
    ),
    accessibleProjectIds(userId),
  ]);

  // Admins can grant any workspace project; others only the ones they can access.
  const accessibleSet = new Set(accessible);
  const projects =
    m.role === "admin"
      ? allProjects
      : allProjects.filter((p) => accessibleSet.has(p.id));

  return NextResponse.json({ roles, projects, is_admin: m.role === "admin" });
}
