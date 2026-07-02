import { NextResponse } from "next/server";
import { dbGet } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import {
  getSubscription,
  getEffectivePlan,
  projectCount,
  memberCount,
  billingContact,
  getPendingRequest,
} from "@/lib/billing";
import { PLANS } from "@/lib/plans";

// Current plan + usage + bank-transfer details for the billing settings page.
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
  const ws = await dbGet<{ subdomain: string; name: string }>(
    "SELECT subdomain, name FROM workspaces WHERE id = ?",
    [wsId]
  );
  const sub = await getSubscription(wsId);
  const plan = await getEffectivePlan(wsId);
  const pending = await getPendingRequest(wsId);

  return NextResponse.json({
    plan,
    status: sub.status,
    interval: sub.interval,
    current_period_end: sub.current_period_end,
    usage: {
      projects: await projectCount(wsId),
      members: await memberCount(wsId),
    },
    limits: PLANS[plan].limits,
    is_admin: m.role === "admin",
    workspace: { subdomain: ws?.subdomain ?? "", name: ws?.name ?? "" },
    contact: billingContact(),
    pending_request: pending
      ? { interval: pending.interval, created_at: pending.created_at }
      : null,
  });
}
