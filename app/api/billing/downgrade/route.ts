import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import {
  billingAdminWorkspace,
  getEffectivePlan,
  deactivateSubscription,
} from "@/lib/billing";

// A workspace admin voluntarily downgrades from Pro to Free. This is immediate
// and forfeits any remaining paid time (no proration/refund) — the client warns
// about that before calling here. Pro-only perks (white-labeling, custom roles
// editing, unlimited limits) stop applying as soon as the plan flips.
export async function POST() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wsId = await billingAdminWorkspace(userId);
  if (!wsId) {
    return NextResponse.json(
      { error: "Only workspace admins can change the plan." },
      { status: 403 }
    );
  }
  if ((await getEffectivePlan(wsId)) !== "pro") {
    return NextResponse.json(
      { error: "This workspace is already on Free." },
      { status: 400 }
    );
  }

  await deactivateSubscription(wsId);

  return NextResponse.json({ ok: true });
}
