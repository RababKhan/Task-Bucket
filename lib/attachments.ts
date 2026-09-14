import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

// All task-attachment files live in this one private Supabase Storage
// bucket. It's private (not public), so nobody can read a file without the
// app handing out a short-lived signed URL first — see signedDownloadUrl.
export const ATTACHMENT_BUCKET = "task-attachments";

// Re-exported for every existing server-side import of these two — the
// values themselves live in lib/attachment-limits.ts (no "server-only"),
// so the upload modal can also check a file's size before ever touching
// the network.
export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TASK } from "@/lib/attachment-limits";

// A storage path never reused, and never trusted as a filename on disk — the
// human-readable name is kept separately in task_attachments.name and used
// only for display / the browser's download prompt.
export function attachmentStoragePath(taskId: number, filename: string): string {
  const safeExt = (filename.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] ?? "").toLowerCase();
  return `tasks/${taskId}/${randomUUID()}${safeExt}`;
}

export async function uploadAttachment(
  path: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .storage.from(ATTACHMENT_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
}

export async function deleteAttachment(path: string): Promise<void> {
  // Best-effort: if the object is already gone, that's fine — the DB row is
  // the source of truth for what the user sees, and we're removing that too.
  await getSupabaseAdmin().storage.from(ATTACHMENT_BUCKET).remove([path]);
}

// A time-limited link the browser can download/view directly from Supabase —
// generated fresh on every list request rather than stored, since the bucket
// is private and a permanent public link would defeat that.
export async function signedDownloadUrl(
  path: string,
  expiresInSeconds = 60
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
