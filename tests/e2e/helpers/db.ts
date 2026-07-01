import { Client } from "pg";
import { createHash } from "node:crypto";

// Direct DB access for tests that need to plant records the UI can't easily
// create (e.g. an invite with a known raw token, since the app stores only the
// SHA-256 hash and emails the raw token).

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

function futureTs(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace("T", " ").slice(0, 19);
}

// Insert a pending invite whose token_hash matches sha256(token), so a test can
// visit /invite/<token> directly.
export async function seedInvite(opts: {
  email: string;
  token: string;
  wsId: string;
  invitedBy: string;
  role?: string;
  projectAccess?: number[];
}): Promise<void> {
  const { email, token, wsId, invitedBy } = opts;
  await withDb((c) =>
    c.query(
      `INSERT INTO workspace_invites
         (workspace_id, email, role, token_hash, invited_by, status, project_access, expires_at)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
      [
        wsId,
        email,
        opts.role ?? "assignee",
        sha256(token),
        invitedBy,
        JSON.stringify(opts.projectAccess ?? []),
        futureTs(7 * 24 * 60 * 60 * 1000),
      ]
    )
  );
}
