import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { dbAll, dbGet, dbRun, type Member, type PendingInvite } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership, projectRole } from "@/lib/membership";
import { can, requirePermission } from "@/lib/rbac";
import { sendEmail, inviteEmail } from "@/lib/email";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Whether a role key is valid (exists and is active) within a workspace.
async function isAssignableRole(
  workspaceId: string,
  key: string
): Promise<boolean> {
  const row = await dbGet(
    "SELECT 1 AS x FROM roles WHERE workspace_id = ? AND key = ? AND active = 1",
    [workspaceId, key]
  );
  return !!row;
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
function isoPlus(ms: number) {
  return new Date(Date.now() + ms).toISOString().replace("T", " ").slice(0, 19);
}

async function workspaceOfProject(projectId: string): Promise<string | null> {
  const row = await dbGet<{ workspace_id: string }>(
    "SELECT workspace_id FROM projects WHERE id = ?",
    [projectId]
  );
  return row?.workspace_id ?? null;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");

  // With a project_id, scope to that project's workspace; without one (e.g. the
  // create-project modal), use the acting user's own workspace.
  let wsId: string | null;
  let myRole: string | null;
  if (projectId) {
    myRole = await projectRole(projectId, userId);
    if (!myRole) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    wsId = await workspaceOfProject(projectId);
  } else {
    const m = await getMembership(userId);
    wsId = m?.workspace_id ?? null;
    myRole = m?.role ?? null;
  }
  if (!wsId) {
    return NextResponse.json({
      members: [],
      invites: [],
      roles: [],
      my_role: myRole,
      my_id: userId,
      can_invite: false,
      can_remove: false,
      can_assign_roles: false,
    });
  }

  // These three reads are independent — run them in parallel (one DB round-trip
  // window instead of three).
  const [members, invites, roles] = await Promise.all([
    dbAll<Member>(
      `SELECT m.user_id, u.name, u.email, m.role, m.active, m.created_at
       FROM workspace_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ?
       ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'assignee' THEN 2 ELSE 3 END, m.created_at ASC`,
      [wsId]
    ),
    dbAll<PendingInvite>(
      "SELECT id, email, role, created_at FROM workspace_invites WHERE workspace_id = ? ORDER BY created_at DESC",
      [wsId]
    ),
    // The assignable roles for this workspace (so custom roles show in dropdowns).
    dbAll<{ key: string; name: string }>(
      "SELECT key, name FROM roles WHERE workspace_id = ? AND active = 1 ORDER BY is_system DESC, created_at ASC",
      [wsId]
    ),
  ]);

  // Role assignment is an admin/role-management capability.
  const canAssignRoles =
    myRole === "admin" || (await can(userId, "roles", "manage_roles"));

  return NextResponse.json({
    members,
    invites,
    roles,
    my_role: myRole,
    my_id: userId,
    can_invite: await can(userId, "team_member", "invite"),
    can_remove: await can(userId, "team_member", "remove"),
    can_assign_roles: canAssignRoles,
  });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const projectId = String(body.project_id ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();

  // Must be a member of the project's workspace.
  const myRole = await projectRole(projectId, userId);
  if (!myRole) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Inviting requires the team_member:invite permission.
  const denied = await requirePermission(
    userId,
    "team_member",
    "invite",
    "You do not have permission to invite members."
  );
  if (denied) return denied;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const wsId = await workspaceOfProject(projectId);
  if (!wsId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Validate the requested role against this workspace's active roles.
  const role = (await isAssignableRole(wsId, String(body.role)))
    ? String(body.role)
    : "assignee";

  // Already a member?
  const existing = await dbGet(
    `SELECT 1 AS x FROM workspace_members m JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = ? AND u.email = ? COLLATE NOCASE`,
    [wsId, email]
  );
  if (existing) {
    return NextResponse.json(
      { error: "That person is already a member." },
      { status: 409 }
    );
  }

  // Replace any prior pending invite for this email + workspace.
  await dbRun(
    "DELETE FROM workspace_invites WHERE workspace_id = ? AND email = ? COLLATE NOCASE",
    [wsId, email]
  );
  const token = randomBytes(24).toString("hex");
  await dbRun(
    `INSERT INTO workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [wsId, email, role, sha256(token), userId, isoPlus(INVITE_TTL_MS)]
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
      inviteUrl
    );
    await sendEmail({ to: email, subject, html, text });
  } catch (err) {
    console.error("[members/invite] email failed:", err);
  }

  return NextResponse.json({ ok: true, inviteUrl });
}
