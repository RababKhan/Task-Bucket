import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { dbAll, dbGet, dbRun, type Member, type PendingInvite } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { projectRole } from "@/lib/membership";
import { sendEmail, inviteEmail } from "@/lib/email";

const ROLES = ["admin", "manager", "assignee"];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  const myRole = await projectRole(projectId, userId);
  if (!myRole) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const wsId = await workspaceOfProject(projectId);
  if (!wsId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const members = await dbAll<Member>(
    `SELECT m.user_id, u.name, u.email, m.role, m.created_at
     FROM workspace_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = ?
     ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, m.created_at ASC`,
    [wsId]
  );
  const invites = await dbAll<PendingInvite>(
    "SELECT id, email, role, created_at FROM workspace_invites WHERE workspace_id = ? ORDER BY created_at DESC",
    [wsId]
  );

  return NextResponse.json({ members, invites, my_role: myRole, my_id: userId });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const projectId = String(body.project_id ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = ROLES.includes(body.role) ? body.role : "assignee";

  const myRole = await projectRole(projectId, userId);
  if (!myRole) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (myRole === "assignee") {
    return NextResponse.json(
      { error: "You don't have permission to invite members." },
      { status: 403 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const wsId = await workspaceOfProject(projectId);
  if (!wsId) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
