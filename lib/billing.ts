import "server-only";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { getMembership } from "@/lib/membership";
import { isExpired } from "@/lib/invites";
import {
  planLimit,
  ACTIVE_STATUSES,
  type PlanId,
  type BillingInterval,
} from "@/lib/plans";

// "now + N months" in the app's stored timestamp format ("YYYY-MM-DD HH:MM:SS",
// UTC) — the same shape isExpired() parses.
function plusMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export type Subscription = {
  workspace_id: string;
  plan: PlanId;
  status: string;
  interval: string | null;
  current_period_end: string | null;
  note: string | null;
  activated_by: string | null;
};

// Absence of a row => free plan.
export async function getSubscription(
  workspaceId: string
): Promise<Subscription> {
  const row = await dbGet<Subscription>(
    "SELECT * FROM subscriptions WHERE workspace_id = ?",
    [workspaceId]
  );
  return (
    row ?? {
      workspace_id: workspaceId,
      plan: "free",
      status: "active",
      interval: null,
      current_period_end: null,
      note: null,
      activated_by: null,
    }
  );
}

// Effective plan: "pro" only when active AND not past its (optional) expiry.
export async function getEffectivePlan(workspaceId: string): Promise<PlanId> {
  const s = await getSubscription(workspaceId);
  if (
    s.plan === "pro" &&
    (ACTIVE_STATUSES as readonly string[]).includes(s.status)
  ) {
    if (s.current_period_end && isExpired(s.current_period_end)) return "free";
    return "pro";
  }
  return "free";
}

// Billing management is workspace-admin only.
export async function billingAdminWorkspace(
  userId: string
): Promise<string | null> {
  const m = await getMembership(userId);
  return m && m.role === "admin" ? m.workspace_id : null;
}

// ---- Upgrade requests (customer signals "I've paid, please activate") ----
export async function createUpgradeRequest(
  workspaceId: string,
  interval: BillingInterval
): Promise<void> {
  await dbRun(
    "UPDATE billing_requests SET status = 'resolved', resolved_at = datetime('now') WHERE workspace_id = ? AND status = 'pending'",
    [workspaceId]
  );
  await dbRun(
    "INSERT INTO billing_requests (workspace_id, interval, status) VALUES (?, ?, 'pending')",
    [workspaceId, interval]
  );
}

export async function getPendingRequest(
  workspaceId: string
): Promise<{ interval: string; created_at: string } | undefined> {
  return dbGet<{ interval: string; created_at: string }>(
    "SELECT interval, created_at FROM billing_requests WHERE workspace_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [workspaceId]
  );
}

export type BillingHistoryRow = {
  interval: string | null;
  created_at: string;
  resolved_at: string | null;
};

// Past activations = resolved upgrade requests. Each one is a payment/activation
// event; amount + plan name are derived from the interval on the client.
export async function getBillingHistory(
  workspaceId: string
): Promise<BillingHistoryRow[]> {
  return dbAll<BillingHistoryRow>(
    "SELECT interval, created_at, resolved_at FROM billing_requests WHERE workspace_id = ? AND status = 'resolved' ORDER BY id DESC",
    [workspaceId]
  );
}

// ---- Owner (super-admin) activation ----

export type OwnerBillingRow = {
  workspace_id: string;
  subdomain: string;
  name: string;
  plan: PlanId;
  status: string;
  interval: string | null;
  current_period_end: string | null;
  projects: number;
  members: number;
  pending_interval: string | null;
  pending_created_at: string | null;
};

// Every workspace with its plan, usage, and any pending upgrade request. Pending
// requests sort first so the owner sees what needs action at the top.
export async function ownerBillingOverview(): Promise<OwnerBillingRow[]> {
  return dbAll<OwnerBillingRow>(`
    SELECT w.id AS workspace_id, w.subdomain, w.name,
           COALESCE(s.plan, 'free') AS plan,
           COALESCE(s.status, 'active') AS status,
           s.interval AS interval,
           s.current_period_end,
           (SELECT COUNT(*) FROM projects p WHERE p.workspace_id = w.id) AS projects,
           (SELECT COUNT(*) FROM workspace_members m
              WHERE m.workspace_id = w.id AND m.active = 1) AS members,
           pr.interval AS pending_interval,
           pr.created_at AS pending_created_at
    FROM workspaces w
    LEFT JOIN subscriptions s ON s.workspace_id = w.id
    LEFT JOIN LATERAL (
      SELECT interval, created_at FROM billing_requests
      WHERE workspace_id = w.id AND status = 'pending'
      ORDER BY id DESC LIMIT 1
    ) pr ON true
    ORDER BY (pr.created_at IS NULL), w.created_at
  `);
}

// Flip a workspace to Pro (mirrors the owner CLI). interval "year"/"month" sets a
// 12- or 1-month expiry unless months is given; null interval => perpetual.
export async function activateSubscription(
  workspaceId: string,
  opts: {
    interval?: BillingInterval | null;
    months?: number | null;
    note?: string | null;
    activatedBy: string;
  }
): Promise<{ expiry: string | null }> {
  const interval =
    opts.interval === "year" ? "year" : opts.interval === "month" ? "month" : null;
  const months =
    opts.months != null
      ? opts.months
      : interval === "year"
        ? 12
        : interval === "month"
          ? 1
          : null;
  const expiry = months ? plusMonths(months) : null;
  const note = opts.note ?? null;
  await dbRun(
    `INSERT INTO subscriptions
       (workspace_id, plan, status, interval, current_period_end, note, activated_by, updated_at)
     VALUES (?, 'pro', 'active', ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (workspace_id) DO UPDATE SET
       plan = 'pro', status = 'active', interval = ?, current_period_end = ?,
       note = ?, activated_by = ?, updated_at = datetime('now')`,
    [workspaceId, interval, expiry, note, opts.activatedBy, interval, expiry, note, opts.activatedBy]
  );
  await dbRun(
    "UPDATE billing_requests SET status = 'resolved', resolved_at = datetime('now') WHERE workspace_id = ? AND status = 'pending'",
    [workspaceId]
  );
  return { expiry };
}

// Revert a workspace to Free.
export async function deactivateSubscription(
  workspaceId: string
): Promise<void> {
  await dbRun(
    `INSERT INTO subscriptions (workspace_id, plan, status, updated_at)
     VALUES (?, 'free', 'free', datetime('now'))
     ON CONFLICT (workspace_id) DO UPDATE SET
       plan = 'free', status = 'free', current_period_end = NULL, updated_at = datetime('now')`,
    [workspaceId]
  );
}

export async function getWorkspaceMeta(
  workspaceId: string
): Promise<{ subdomain: string; name: string } | undefined> {
  return dbGet<{ subdomain: string; name: string }>(
    "SELECT subdomain, name FROM workspaces WHERE id = ?",
    [workspaceId]
  );
}

// Active admins of a workspace — recipients of the "you're on Pro" email.
export async function workspaceAdminEmails(
  workspaceId: string
): Promise<{ email: string; name: string | null }[]> {
  return dbAll<{ email: string; name: string | null }>(
    `SELECT u.email, u.name FROM workspace_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ? AND m.active = 1 AND m.role = 'admin'`,
    [workspaceId]
  );
}

// ---- Bank-transfer details (owner-configured via env) ----
export function billingContact() {
  const clean = (v?: string) => (v?.trim() ? v.trim() : "");
  return {
    email: clean(process.env.BILLING_CONTACT_EMAIL),
    bank: {
      beneficiary: clean(process.env.BANK_BENEFICIARY),
      bankName: clean(process.env.BANK_NAME),
      accountNumber: clean(process.env.BANK_ACCOUNT_NUMBER),
      branch: clean(process.env.BANK_BRANCH),
      routing: clean(process.env.BANK_ROUTING),
      branchCode: clean(process.env.BANK_BRANCH_CODE),
      swift: clean(process.env.BANK_SWIFT),
      iban: clean(process.env.BANK_IBAN),
      reference: clean(process.env.BANK_REFERENCE),
    },
  };
}

// ---- Plan-limit checks (used for gating) ----
export async function projectCount(workspaceId: string): Promise<number> {
  const r = await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ?",
    [workspaceId]
  );
  return Number(r?.n ?? 0);
}

export async function memberCount(workspaceId: string): Promise<number> {
  const r = await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ? AND active = 1",
    [workspaceId]
  );
  return Number(r?.n ?? 0);
}

export async function taskCount(workspaceId: string): Promise<number> {
  const r = await dbGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks t
       JOIN projects p ON p.id = t.project_id
      WHERE p.workspace_id = ? AND t.parent_id IS NULL`,
    [workspaceId]
  );
  return Number(r?.n ?? 0);
}

// Per-project task counts (busiest first) — the Tasks limit is per-project.
// Counts top-level items only (story/task/bug); subtasks (parent_id set) are
// excluded.
export async function taskCountsByProject(
  workspaceId: string
): Promise<{ id: number; name: string; tasks: number }[]> {
  return dbAll<{ id: number; name: string; tasks: number }>(
    `SELECT p.id, p.name, COUNT(t.id) AS tasks
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id AND t.parent_id IS NULL
      WHERE p.workspace_id = ?
      GROUP BY p.id, p.name
      ORDER BY COUNT(t.id) DESC, p.name ASC`,
    [workspaceId]
  );
}

// Approximate bytes of stored assets for a workspace: member avatars, the
// branding logo/favicon, and comment attachments — all data URLs kept as text,
// so their character length ≈ bytes on disk.
export async function storageBytesUsed(workspaceId: string): Promise<number> {
  const r = await dbGet<{ bytes: number }>(
    `SELECT
       COALESCE((SELECT SUM(LENGTH(u.image)) FROM users u
                   JOIN workspace_members m ON m.user_id = u.id
                  WHERE m.workspace_id = ? AND u.image IS NOT NULL), 0)
     + COALESCE((SELECT COALESCE(LENGTH(brand_logo), 0) + COALESCE(LENGTH(brand_favicon), 0)
                   FROM workspaces WHERE id = ?), 0)
     + COALESCE((SELECT SUM(LENGTH(ca.data))
                   FROM comment_attachments ca
                   JOIN task_comments tc ON tc.id = ca.comment_id
                   JOIN tasks t ON t.id = tc.task_id
                   JOIN projects p ON p.id = t.project_id
                  WHERE p.workspace_id = ?), 0) AS bytes`,
    [workspaceId, workspaceId, workspaceId]
  );
  return Number(r?.bytes ?? 0);
}

export async function canAddProject(workspaceId: string): Promise<boolean> {
  const plan = await getEffectivePlan(workspaceId);
  return (await projectCount(workspaceId)) < planLimit(plan, "projects");
}

export async function canAddMember(workspaceId: string): Promise<boolean> {
  const plan = await getEffectivePlan(workspaceId);
  const limit = planLimit(plan, "members");
  if (limit === Infinity) return true;
  const pending = await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM workspace_invites WHERE workspace_id = ? AND status = 'pending'",
    [workspaceId]
  );
  return (await memberCount(workspaceId)) + Number(pending?.n ?? 0) < limit;
}

export const BILLING_ERR = {
  PROJECT_LIMIT:
    "You've reached your plan's project limit. Upgrade to Pro for unlimited projects.",
  MEMBER_LIMIT:
    "You've reached your plan's member limit. Upgrade to Pro for unlimited members.",
} as const;
