import { NextResponse } from "next/server";
import { dbGet } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { billingAdminWorkspace, ensureStripeCustomer } from "@/lib/billing";
import { stripe, proPriceId, appUrl } from "@/lib/stripe";

// Create a Stripe Checkout session to subscribe the workspace to Pro.
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const interval = body.interval === "year" ? "year" : "month";
  const priceId = proPriceId(interval);
  if (!priceId) {
    return NextResponse.json(
      { error: "The Pro price is not configured." },
      { status: 500 }
    );
  }

  const user = await dbGet<{ email: string | null; name: string | null }>(
    "SELECT email, name FROM users WHERE id = ?",
    [userId]
  );
  const email = user?.email ?? "";
  const customerId = await ensureStripeCustomer(
    wsId,
    email,
    user?.name || email
  );

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${appUrl()}/settings/billing?success=1`,
    cancel_url: `${appUrl()}/settings/billing?canceled=1`,
    subscription_data: { metadata: { workspace_id: wsId } },
    metadata: { workspace_id: wsId },
  });

  return NextResponse.json({ url: session.url });
}
