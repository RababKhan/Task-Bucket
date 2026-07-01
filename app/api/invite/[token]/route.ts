import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { createCredentialsUser, getUserByEmail } from "@/lib/auth-db";
import { currentUserId } from "@/lib/session";
import { passwordMeetsRules } from "@/lib/password";
import { sha256, inviteAcceptError, parseProjectAccess } from "@/lib/invites";

type Ctx = { params: Promise<{ token: string }> };

type InviteRow = {
  id: number;
  workspace_id: string;
  email: string;
  role: string;
  status: string;
  project_access: string;
  message: string | null;
  invited_by: string | null;
  expires_at: string;
};

// Load an invite by raw token (any status) so callers can return precise
// status-based messages.
function loadInvite(token: string): Promise<InviteRow | undefined> {
  return dbGet<InviteRow>(
    `SELECT id, workspace_id, email, role, status, project_access, message, invited_by, expires_at
     FROM workspace_invites WHERE token_hash = ?`,
    [sha256(token)]
  );
}

// Apply an accepted invite: add the workspace membership (with the invited role)
// and grant the invited project access. Idempotent on membership.
async function applyInvite(invite: InviteRow, userId: string): Promise<void> {
  await dbRun(
    "INSERT INTO workspace_members (workspace_id, user_id, role, active) VALUES (?, ?, ?, 1) ON CONFLICT DO NOTHING",
    [invite.workspace_id, userId, invite.role]
  );
  const projectIds = parseProjectAccess(invite.project_access);
  for (const pid of projectIds) {
    // Only grant access to projects that still belong to this workspace.
    const ok = await dbGet(
      "SELECT 1 AS x FROM projects WHERE id = ? AND workspace_id = ?",
      [pid, invite.workspace_id]
    );
    if (!ok) continue;
    await dbRun(
      `INSERT INTO project_members (project_id, user_id, added_by, status, created_at)
       VALUES (?, ?, ?, 'active', datetime('now')) ON CONFLICT DO NOTHING`,
      [pid, userId, invite.invited_by]
    );
  }
  await dbRun(
    "UPDATE workspace_invites SET status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [invite.id]
  );
}

// GET — info for the accept page.
export async function GET(_request: Request, { params }: Ctx) {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "This invite is invalid." }, { status: 404 });
  }
  const rejected = inviteAcceptError(invite);
  if (rejected) {
    // Reflect a lazily-expired pending invite in the DB.
    if (rejected.message.includes("expired") && invite.status === "pending") {
      await dbRun(
        "UPDATE workspace_invites SET status = 'expired', updated_at = datetime('now') WHERE id = ?",
        [invite.id]
      );
    }
    return NextResponse.json(
      { error: rejected.message },
      { status: rejected.status }
    );
  }

  const ws = await dbGet<{ name: string }>(
    "SELECT name FROM workspaces WHERE id = ?",
    [invite.workspace_id]
  );
  const taken = !!(await getUserByEmail(invite.email));
  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    workspace_name: ws?.name ?? "the workspace",
    account_exists: taken,
    project_count: parseProjectAccess(invite.project_access).length,
    message: invite.message,
  });
}

// POST — accept the invite. New users send {name, password}; existing users must
// be signed in as the invited email (no body needed).
export async function POST(request: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));

  const invite = await loadInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "This invite is invalid." }, { status: 404 });
  }
  const rejected = inviteAcceptError(invite);
  if (rejected) {
    if (rejected.message.includes("expired") && invite.status === "pending") {
      await dbRun(
        "UPDATE workspace_invites SET status = 'expired', updated_at = datetime('now') WHERE id = ?",
        [invite.id]
      );
    }
    return NextResponse.json(
      { error: rejected.message },
      { status: rejected.status }
    );
  }

  const existingUser = await getUserByEmail(invite.email);

  if (existingUser) {
    // Existing account: they must be signed in as the invited email to accept.
    const me = await currentUserId();
    if (!me) {
      return NextResponse.json(
        { needs_signin: true, email: invite.email },
        { status: 401 }
      );
    }
    if (me !== existingUser.id) {
      return NextResponse.json(
        {
          error: `This invite is for ${invite.email}. Sign in with that account to accept it.`,
        },
        { status: 403 }
      );
    }
    // One-workspace-per-user model: block if already in a (different) workspace.
    const already = await dbGet<{ workspace_id: string }>(
      "SELECT workspace_id FROM workspace_members WHERE user_id = ? LIMIT 1",
      [me]
    );
    if (already && already.workspace_id !== invite.workspace_id) {
      return NextResponse.json(
        { error: "Your account already belongs to another workspace." },
        { status: 409 }
      );
    }
    await applyInvite(invite, me);
    return NextResponse.json({ ok: true, email: invite.email, joined: true });
  }

  // New account: create credentials user, then accept.
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  if (!passwordMeetsRules(password)) {
    return NextResponse.json(
      { error: "Password must be 8+ chars with upper, lower, and a number." },
      { status: 400 }
    );
  }
  const user = await createCredentialsUser(invite.email, password, name);
  await dbRun("UPDATE users SET email_verified = datetime('now') WHERE id = ?", [
    user.id,
  ]);
  await applyInvite(invite, user.id);

  return NextResponse.json({ ok: true, email: invite.email });
}
