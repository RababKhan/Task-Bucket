import { NextResponse } from "next/server";
import { dbAll, dbGet } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { accessibleProjectIds } from "@/lib/membership";

// Everything the Dashboard needs in one scoped round-trip: headline stats, the
// tasks assigned to me, my projects, active sprints, and recent activity —
// all limited to the projects the caller can access.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(userId, "dashboard", "view");
  if (denied) return denied;

  const ids = await accessibleProjectIds(userId);
  if (!ids.length) {
    return NextResponse.json({
      stats: { my_open_tasks: 0, overdue: 0, projects: 0, active_sprints: 0 },
      my_tasks: [],
      projects: [],
      sprints: [],
      activity: [],
    });
  }
  const ph = ids.map(() => "?").join(",");
  const today = new Date().toISOString().slice(0, 10);

  const [
    myOpen,
    overdue,
    activeSprintCount,
    myTasks,
    projects,
    sprints,
    activity,
  ] = await Promise.all([
    dbGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tasks t
       JOIN task_assignees ta ON ta.task_id = t.id AND ta.user_id = ?
       WHERE t.project_id IN (${ph}) AND t.status <> 'done'`,
      [userId, ...ids]
    ),
    dbGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tasks t
       JOIN task_assignees ta ON ta.task_id = t.id AND ta.user_id = ?
       WHERE t.project_id IN (${ph}) AND t.status <> 'done'
         AND t.due_date IS NOT NULL AND t.due_date < ?`,
      [userId, ...ids, today]
    ),
    dbGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sprints WHERE project_id IN (${ph}) AND status = 'active'`,
      ids
    ),
    dbAll(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.type,
              p.name AS project_name
       FROM tasks t
       JOIN task_assignees ta ON ta.task_id = t.id AND ta.user_id = ?
       JOIN projects p ON p.id = t.project_id
       WHERE t.project_id IN (${ph}) AND t.status <> 'done'
       ORDER BY (t.due_date IS NULL), t.due_date ASC, t.id DESC
       LIMIT 8`,
      [userId, ...ids]
    ),
    dbAll(
      `SELECT p.id, p.name, p.status,
              (SELECT COUNT(*) FROM tasks x WHERE x.project_id = p.id AND x.parent_id IS NULL) AS task_count,
              (SELECT COUNT(*) FROM tasks x WHERE x.project_id = p.id AND x.parent_id IS NULL AND x.status = 'done') AS done_count
       FROM projects p WHERE p.id IN (${ph})
       ORDER BY p.created_at DESC LIMIT 6`,
      ids
    ),
    dbAll(
      `SELECT s.id, s.project_id, s.name, s.status, s.start_date, s.end_date, p.name AS project_name,
              (SELECT COUNT(*) FROM tasks x WHERE x.sprint_id = s.id AND x.parent_id IS NULL) AS task_count,
              (SELECT COUNT(*) FROM tasks x WHERE x.sprint_id = s.id AND x.parent_id IS NULL AND x.status = 'done') AS done_count
       FROM sprints s JOIN projects p ON p.id = s.project_id
       WHERE s.project_id IN (${ph}) AND s.status = 'active'
       ORDER BY s.start_date DESC LIMIT 5`,
      ids
    ),
    dbAll(
      `SELECT a.id, a.text, a.created_at, u.name AS actor_name,
              t.id AS task_id, t.title AS task_title, p.name AS project_name
       FROM task_activity a
       JOIN tasks t ON t.id = a.task_id
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE t.project_id IN (${ph})
       ORDER BY a.created_at DESC, a.id DESC LIMIT 10`,
      ids
    ),
  ]);

  return NextResponse.json({
    stats: {
      my_open_tasks: Number(myOpen?.n ?? 0),
      overdue: Number(overdue?.n ?? 0),
      projects: ids.length,
      active_sprints: Number(activeSprintCount?.n ?? 0),
    },
    my_tasks: myTasks,
    projects,
    sprints,
    activity,
  });
}
