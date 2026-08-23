import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { getEffectivePlan } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

// Lightweight entitlement lookup: the workspace's effective plan + its limits.
// Cheap (one subscription read) so UI can gate limit-bound actions.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const m = await getMembership(userId);
  if (!m) {
    return NextResponse.json({ plan: "free", limits: PLANS.free.limits });
  }
  const plan = await getEffectivePlan(m.workspace_id);
  return NextResponse.json({ plan, limits: PLANS[plan].limits });
}
