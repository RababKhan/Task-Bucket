import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import {
  billingAdminWorkspace,
  getEffectivePlan,
  createUpgradeRequest,
} from "@/lib/billing";

// A workspace admin files an upgrade request after paying by bank transfer.
// The owner cross-references it with the emailed invoice + domain and activates.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wsId = await billingAdminWorkspace(userId);
  if (!wsId) {
    return NextResponse.json(
      { error: "Only workspace admins can request an upgrade." },
      { status: 403 }
    );
  }
  if ((await getEffectivePlan(wsId)) === "pro") {
    return NextResponse.json(
      { error: "This workspace is already on Pro." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const interval = body.interval === "year" ? "year" : "month";
  await createUpgradeRequest(wsId, interval);

  return NextResponse.json({ ok: true });
}
