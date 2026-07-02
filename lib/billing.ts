import "server-only";
import { dbGet, dbRun } from "@/lib/db";
import { getMembership } from "@/lib/membership";
import { isExpired } from "@/lib/invites";
import {
  planLimit,
  ACTIVE_STATUSES,
  type PlanId,
  type BillingInterval,
} from "@/lib/plans";

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
