// Plan catalog — CLIENT-SAFE (no server-only imports, no secret price ids).
// The UI and server both import this for names, display prices, and limits.
// Stripe price ids live in env and are resolved server-side only.

export type PlanId = "free" | "pro";
export type BillingInterval = "month" | "year";

export type PlanLimits = {
  // null = unlimited
  projects: number | null;
  members: number | null;
  storage: number | null; // in GB
  tasksPerProject: number | null;
};

export type Plan = {
  id: PlanId;
  name: string;
  // Display price in whole currency units (BDT). 0 for free.
  price: { month: number; year: number };
  limits: PlanLimits;
};

// Feature-parity rows for the plan cards. Each row is either included on a plan
// (a string = the label shown with a ✓) or not (false → shown greyed with a ✗).
export type PlanFeature = {
  label: string; // fallback label shown when a plan doesn't include the feature
  free: string | false;
  pro: string | false;
};

export const PLAN_FEATURES: PlanFeature[] = [
  { label: "Dashboard", free: "Few Dashboard widgets", pro: "Full Dashboard" },
  { label: "Projects", free: "2 Projects", pro: "Unlimited Projects" },
  { label: "Tasks", free: "200 Tasks per project", pro: "Unlimited Tasks" },
  { label: "Members", free: "5 Members", pro: "Unlimited Members" },
  { label: "Storage", free: "2 GB Storage", pro: "32 GB Storage" },
  { label: "White-labeling", free: false, pro: "White-labeling" },
  {
    label: "Custom Roles & Permissions",
    free: false,
    pro: "Custom Roles & Permissions",
  },
];

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
    limits: { projects: 2, members: 5, storage: 2, tasksPerProject: 200 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: { month: 1500, year: 15000 },
    limits: { projects: null, members: null, storage: 32, tasksPerProject: null },
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
