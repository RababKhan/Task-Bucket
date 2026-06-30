import { createHash } from "node:crypto";

// Pure invitation helpers (no DB import, so they're unit-testable). Route files
// do their own DB queries and use these for hashing, expiry, status checks, and
// project-access diffing.

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type InviteStatus = "pending" | "accepted" | "expired" | "cancelled";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// SQLite datetimes are stored without a timezone ("YYYY-MM-DD HH:MM:SS", UTC).
// An ISO string `ms` in the future, formatted to match.
export function isoPlus(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace("T", " ").slice(0, 19);
}

export function isExpired(iso: string | null, now: number = Date.now()): boolean {
  if (!iso) return true;
  // Treat the stored value as UTC.
  return new Date(iso.replace(" ", "T") + "Z").getTime() < now;
}

// Parse the project_access JSON column into a list of numeric project ids.
export function parseProjectAccess(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) {
      return [...new Set(v.map(Number).filter((n) => Number.isFinite(n)))];
    }
  } catch {}
  return [];
}

// Exact, user-facing rejection messages for the accept flow.
export const INVITE_ERROR = {
  invalid: { status: 404, message: "This invite is invalid." },
  cancelled: { status: 410, message: "This invitation has been cancelled." },
  accepted: { status: 409, message: "This invitation has already been accepted." },
  expired: { status: 410, message: "This invitation has expired." },
} as const;

// Given an invite's status + expiry, return the rejection (status code +
// message) if it can't be accepted, or null if it's a valid pending invite.
export function inviteAcceptError(
  row: { status: string; expires_at: string | null },
  now: number = Date.now()
): { status: number; message: string } | null {
  if (row.status === "cancelled") return INVITE_ERROR.cancelled;
  if (row.status === "accepted") return INVITE_ERROR.accepted;
  if (row.status === "expired" || isExpired(row.expires_at, now))
    return INVITE_ERROR.expired;
  if (row.status !== "pending") return INVITE_ERROR.expired;
  return null;
}

// Compute which project ids to add and remove to go from `current` to `next`.
export function diffProjectAccess(
  current: number[],
  next: number[]
): { add: number[]; remove: number[] } {
  const cur = new Set(current);
  const nxt = new Set(next);
  return {
    add: [...nxt].filter((id) => !cur.has(id)),
    remove: [...cur].filter((id) => !nxt.has(id)),
  };
}
