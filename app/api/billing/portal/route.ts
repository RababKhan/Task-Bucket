import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { billingAdminWorkspace, getSubscription } from "@/lib/billing";
import { stripe, appUrl } from "@/lib/stripe";

// Open the Stripe Billing Portal so an admin can manage/cancel the subscription.
export async function POST() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wsId = await billingAdminWorkspace(userId);
  if (!wsId) {
    return NextResponse.json(
      { error: "Only workspace admins can manage billing." },
      { status: 403 }
    );
  }
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 500 }
    );
  }

  const sub = await getSubscription(wsId);
  if (!sub.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account yet — subscribe first." },
      { status: 400 }
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${appUrl()}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
