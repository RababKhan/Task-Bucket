import { NextResponse } from "next/server";
import { dbAll, dbGet } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { requirePermission } from "@/lib/rbac";

type Ctx = { params: Promise<{ uid: string }> };

// GET /api/team/members/[uid] — full detail for one workspace member:
// info, role, assigned projects + tasks, status, recent activity.
// (Role/active changes and removal reuse PATCH/DELETE /api/members/[uid].)
export async function GET(_request: Request, { params }: Ctx) {
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
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { uid } = await params;
  const wsId = m.workspace_id;

  // Member row + its projects/tasks/activity are independent — fetch in parallel.
  const [member, projects, tasks, activity] = await Promise.all([
    dbGet<{
      user_id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      role: string;
      role_name: string | null;
      is_system: number | null;
      active: number;
      joined_at: string;
      last_active_at: string | null;
    }>(
      `SELECT wm.user_id, u.name, u.email, u.image, wm.role,
              r.name AS role_name, r.is_system, wm.active,
              wm.created_at AS joined_at, wm.last_active_at
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       LEFT JOIN roles r ON r.workspace_id = wm.workspace_id AND r.key = wm.role
       WHERE wm.workspace_id = ? AND wm.user_id = ?`,
      [wsId, uid]
    ),
    // Projects this member is explicitly added to (within the workspace).
    dbAll<{ id: number; name: string }>(
      `SELECT p.id, p.name
       FROM project_members pm JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = ? AND p.workspace_id = ?
       ORDER BY p.name ASC`,
      [uid, wsId]
    ),
    // Tasks assigned to this member within the workspace.
    dbAll<{
      id: number;
      title: string;
      seq: number | null;
      project_id: number;
      status: string;
    }>(
      `SELECT t.id, t.title, t.seq, t.project_id, t.status
       FROM task_assignees ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN projects p ON p.id = t.project_id
       WHERE ta.user_id = ? AND p.workspace_id = ?
       ORDER BY t.id DESC
       LIMIT 50`,
      [uid, wsId]
    ),
    // Recent activity by this member.
    dbAll<{ id: number; text: string; created_at: string }>(
      `SELECT id, text, created_at FROM task_activity
       WHERE actor_id = ? ORDER BY id DESC LIMIT 20`,
      [uid]
    ),
  ]);

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    user_id: member.user_id,
    name: member.name,
    email: member.email,
    image: member.image,
    role: member.role,
    role_name: member.role_name ?? member.role,
    is_custom_role: member.is_system === 0,
    active: member.active,
    joined_at: member.joined_at,
    last_active_at: member.last_active_at,
    projects,
    tasks,
    activity,
    my_id: userId,
    my_role: m.role,
  });
}
