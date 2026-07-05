import "server-only";
import { getUserById } from "@/lib/auth-db";

// Platform owners ("super-admins") sit above workspace-admins: they can activate
// or deactivate Pro for ANY workspace. They're identified by an email allowlist
// in SUPERADMIN_EMAILS (comma-separated, kept in .env.local — never committed).
// Empty/unset => nobody is a super-admin (secure default).
export function superAdminEmails(): Set<string> {
  return new Set(
    (process.env.SUPERADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Env-only check (no DB) — safe to call from the auth jwt callback.
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().has(email.trim().toLowerCase());
}

// Authoritative check used to guard owner endpoints: resolves the user's current
// email from the DB rather than trusting a client-supplied value.
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const u = await getUserById(userId);
  return isSuperAdminEmail(u?.email ?? null);
}
