// Client-safe constants shared between the upload UI and the server route.
// Split out of lib/attachments.ts (which has `import "server-only"` and pulls
// in the Supabase admin client) so a "use client" component can check a
// file's size instantly, before ever starting a network request, without
// pulling server-only code into the browser bundle.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB — matches the
// bucket's own fileSizeLimit (see the create-bucket setup this was seeded with).
export const MAX_ATTACHMENTS_PER_TASK = 20;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
