// Plan catalog — CLIENT-SAFE (no server-only imports, no secret price ids).
// The UI and server both import this for names, display prices, and limits.
// Stripe price ids live in env and are resolved server-side only.

export type PlanId = "free" | "pro";
export type BillingInterval = "month" | "year";

export type PlanLimits = {
  // null = unlimited
  projects: number | null;
  members: number | null;
};

export type Plan = {
  id: PlanId;
  name: string;
  // Display price in whole currency units (USD). 0 for free.
  price: { month: number; year: number };
  limits: PlanLimits;
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: { month: 0, year: 0 },
    limits: { projects: 2, members: 3 },
    features: ["Up to 2 projects", "Up to 3 members", "Core task management"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: { month: 12, year: 120 },
    limits: { projects: null, members: null },
    features: [
      "Unlimited projects",
      "Unlimited members",
      "Sprints, custom fields, RBAC",
      "Priority support",
    ],
  },
};

// A subscription counts as "paid/active" for these Stripe statuses.
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

export function planLimit(plan: PlanId, key: keyof PlanLimits): number {
  const v = PLANS[plan].limits[key];
  return v == null ? Infinity : v;
}

export function isUnlimited(plan: PlanId, key: keyof PlanLimits): boolean {
  return PLANS[plan].limits[key] == null;
}
