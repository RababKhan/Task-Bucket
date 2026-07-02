import { NextResponse } from "next/server";
import { dbAll } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { accessibleProjectIds } from "@/lib/membership";
import { shapeTask } from "@/lib/tasks";

// Cross-project task list — every top-level task in the projects the user can
// access, with its project name. Powers the Tasks module.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "tasks", "view");
  if (denied) return denied;

  const ids = await accessibleProjectIds(userId);
  if (!ids.length) return NextResponse.json([]);
  const placeholders = ids.map(() => "?").join(",");

  const rows = await dbAll<
    Record<string, unknown> & { assignees_raw?: string | null }
  >(
    `SELECT t.*, p.name AS project_name,
       (SELECT group_concat(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id) AS assignees_raw
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.project_id IN (${placeholders}) AND t.parent_id IS NULL
     ORDER BY t.created_at DESC, t.id DESC`,
    ids
  );

  return NextResponse.json(rows.map(shapeTask));
}
