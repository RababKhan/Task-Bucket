import { dbRun } from "@/lib/db";

// Append one activity-log entry for a task. Best-effort: callers don't await a
// result, and a logging failure should never break the underlying mutation.
export async function logActivity(
  taskId: number,
  actorId: string | null,
  text: string
): Promise<void> {
  try {
    await dbRun(
      "INSERT INTO task_activity (task_id, actor_id, text) VALUES (?, ?, ?)",
      [taskId, actorId, text]
    );
  } catch {
    // ignore — activity logging is non-critical
  }
}
