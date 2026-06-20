import { dbRun } from "@/lib/db";

// Optional structured data so the UI can render icons inline (e.g. the
// status/priority icon next to a "from X to Y" change).
export type ActivityMeta = {
  field: "status" | "priority" | "type";
  from: string | null;
  to: string | null;
};

// Append one activity-log entry for a task. Best-effort: callers don't await a
// result, and a logging failure should never break the underlying mutation.
export async function logActivity(
  taskId: number,
  actorId: string | null,
  text: string,
  meta?: ActivityMeta
): Promise<void> {
  try {
    await dbRun(
      "INSERT INTO task_activity (task_id, actor_id, text, meta) VALUES (?, ?, ?, ?)",
      [taskId, actorId, text, meta ? JSON.stringify(meta) : null]
    );
  } catch {
    // ignore — activity logging is non-critical
  }
}
