import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import {
  getSubscription,
  getEffectivePlan,
  projectCount,
  memberCount,
} from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";

// Current plan + usage for the billing settings page.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const m = await getMembership(userId);
  if (!m) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }
  const wsId = m.workspace_id;
  const sub = await getSubscription(wsId);
  const plan = await getEffectivePlan(wsId);

  return NextResponse.json({
    plan,
    status: sub.status,
    interval: sub.interval,
    current_period_end: sub.current_period_end,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    usage: {
      projects: await projectCount(wsId),
      members: await memberCount(wsId),
    },
    limits: PLANS[plan].limits,
    is_admin: m.role === "admin",
    stripe_configured: stripeConfigured(),
  });
}
