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
  // Display price in whole currency units (BDT). 0 for free.
  price: { month: number; year: number };
  limits: PlanLimits;
  features: string[];
};

// Display currency for all plan prices. The workspace bills in Bangladeshi Taka.
export const CURRENCY = { code: "BDT", symbol: "৳" } as const;

// Format a whole-taka amount for display, e.g. 12000 -> "৳12,000".
export function fmtPrice(amount: number): string {
  return `${CURRENCY.symbol}${amount.toLocaleString("en-US")}`;
}

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
    price: { month: 1500, year: 15000 },
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
