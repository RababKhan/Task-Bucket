import { NextResponse } from "next/server";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership, accessibleProjectIds } from "@/lib/membership";
import { requirePermission, ERR } from "@/lib/rbac";
import { diffProjectAccess } from "@/lib/invites";

type Ctx = { params: Promise<{ uid: string }> };

// GET — the member's current project access + the projects the acting user may
// grant (admin: all in workspace; otherwise only accessible ones).
export async function GET(_request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "team_member",
    "update_project_access"
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { uid } = await params;

  const [currentRows, allProjects, accessible] = await Promise.all([
    dbAll<{ project_id: number }>(
      `SELECT pm.project_id FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = ? AND p.workspace_id = ?`,
      [uid, m.workspace_id]
    ),
    dbAll<{ id: number; name: string }>(
      "SELECT id, name FROM projects WHERE workspace_id = ? ORDER BY name ASC",
      [m.workspace_id]
    ),
    accessibleProjectIds(userId),
  ]);
  const current = currentRows.map((r) => r.project_id);

  // Which projects the acting user may grant/revoke (admin: all; else accessible).
  const accessibleSet = new Set(accessible);
  const grantable =
    m.role === "admin"
      ? allProjects
      : allProjects.filter((p) => accessibleSet.has(p.id));

  return NextResponse.json({ current, grantable });
}

// PATCH — set the member's project access to the given list. Only projects the
// acting user may grant are touched; others are left unchanged.
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(
    userId,
    "team_member",
    "update_project_access"
  );
  if (denied) return denied;

  const m = await getMembership(userId);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { uid } = await params;

  // Target must be a member of this workspace.
  const target = await dbGet(
    "SELECT 1 AS x FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [m.workspace_id, uid]
  );
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const requested: number[] = Array.isArray(body.project_ids)
    ? [
        ...new Set(
          (body.project_ids as unknown[])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n))
        ),
      ]
    : [];

  // The set of projects the acting user is allowed to manage access for
  // (admin => every workspace project; others => their accessible set) — one
  // query, no per-project loop.
  const grantable = new Set<number>(await accessibleProjectIds(userId));

  // Any requested project outside the grantable set is a permission error.
  for (const pid of requested) {
    if (!grantable.has(pid)) {
      return NextResponse.json({ error: ERR.NO_PROJECT_ACCESS }, { status: 403 });
    }
  }

  // Diff only within the grantable set so we never touch projects the acting
  // user can't manage (e.g. access granted by an admin).
  const currentManageable = (
    await dbAll<{ project_id: number }>(
      `SELECT pm.project_id FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = ? AND p.workspace_id = ?`,
      [uid, m.workspace_id]
    )
  )
    .map((r) => r.project_id)
    .filter((id) => grantable.has(id));

  const { add, remove } = diffProjectAccess(
    currentManageable,
    requested.filter((id) => grantable.has(id))
  );

  for (const pid of add) {
    await dbRun(
      `INSERT INTO project_members (project_id, user_id, added_by, status, created_at)
       VALUES (?, ?, ?, 'active', datetime('now')) ON CONFLICT DO NOTHING`,
      [pid, uid, userId]
    );
  }
  for (const pid of remove) {
    await dbRun(
      "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
      [pid, uid]
    );
  }

  return NextResponse.json({ ok: true, added: add.length, removed: remove.length });
}
