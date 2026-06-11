import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";
import { createCredentialsUser, getUserByEmail } from "@/lib/auth-db";
import { passwordMeetsRules } from "@/lib/password";

type Ctx = { params: Promise<{ token: string }> };

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
function isExpired(iso: string | null): boolean {
  if (!iso) return true;
  return new Date(iso + "Z").getTime() < Date.now();
}

type InviteRow = {
  id: number;
  workspace_id: string;
  email: string;
  role: "admin" | "manager" | "assignee";
  expires_at: string;
};

async function loadInvite(token: string): Promise<InviteRow | null> {
  const row = await dbGet<InviteRow>(
    "SELECT id, workspace_id, email, role, expires_at FROM workspace_invites WHERE token_hash = ?",
    [sha256(token)]
  );
  if (!row || isExpired(row.expires_at)) return null;
  return row;
}

// Info for the accept page.
export async function GET(_request: Request, { params }: Ctx) {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "This invite is invalid or expired." }, { status: 404 });
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
  });
}

// Accept: create the account and join the workspace.
export async function POST(request: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");

  const invite = await loadInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "This invite is invalid or expired." }, { status: 404 });
  }
  if (await getUserByEmail(invite.email)) {
    return NextResponse.json(
      { error: "An account with this email already exists. Please sign in." },
      { status: 409 }
    );
  }
  if (!passwordMeetsRules(password)) {
    return NextResponse.json(
      { error: "Password must be 8+ chars with upper, lower, and a number." },
      { status: 400 }
    );
  }

  const user = await createCredentialsUser(invite.email, password, name);
  await dbRun(
    "UPDATE users SET email_verified = datetime('now') WHERE id = ?",
    [user.id]
  );
  await dbRun(
    "INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)",
    [invite.workspace_id, user.id, invite.role]
  );
  await dbRun("DELETE FROM workspace_invites WHERE id = ?", [invite.id]);

  return NextResponse.json({ ok: true, email: invite.email });
}
