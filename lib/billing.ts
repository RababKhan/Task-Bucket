import "server-only";
import { dbGet, dbRun } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getMembership } from "@/lib/membership";
import { planLimit, ACTIVE_STATUSES, type PlanId } from "@/lib/plans";

export type Subscription = {
  workspace_id: string;
  plan: PlanId;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  price_id: string | null;
  interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
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
      stripe_customer_id: null,
      stripe_subscription_id: null,
      price_id: null,
      interval: null,
      current_period_end: null,
      cancel_at_period_end: 0,
    }
  );
}

// Effective plan: "pro" only when the sub is pro AND in an active/trialing state
// (so a past_due/canceled Pro sub falls back to free-tier limits).
export async function getEffectivePlan(workspaceId: string): Promise<PlanId> {
  const s = await getSubscription(workspaceId);
  if (
    s.plan === "pro" &&
    (ACTIVE_STATUSES as readonly string[]).includes(s.status)
  ) {
    return "pro";
  }
  return "free";
}

export async function ensureSubscriptionRow(workspaceId: string): Promise<void> {
  await dbRun(
    "INSERT INTO subscriptions (workspace_id, plan, status) VALUES (?, 'free', 'active') ON CONFLICT DO NOTHING",
    [workspaceId]
  );
}

// Create (or reuse) the workspace's Stripe customer.
export async function ensureStripeCustomer(
  workspaceId: string,
  email: string,
  name: string
): Promise<string> {
  if (!stripe) throw new Error("Stripe is not configured");
  const s = await getSubscription(workspaceId);
  if (s.stripe_customer_id) return s.stripe_customer_id;
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { workspace_id: workspaceId },
  });
  await ensureSubscriptionRow(workspaceId);
  await dbRun(
    "UPDATE subscriptions SET stripe_customer_id = ?, updated_at = datetime('now') WHERE workspace_id = ?",
    [customer.id, workspaceId]
  );
  return customer.id;
}

// Billing management is workspace-admin only.
export async function billingAdminWorkspace(
  userId: string
): Promise<string | null> {
  const m = await getMembership(userId);
  return m && m.role === "admin" ? m.workspace_id : null;
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

// Pending invites count toward the seat limit so you can't over-invite.
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
