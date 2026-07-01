import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { dbGet, dbRun } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { ACTIVE_STATUSES } from "@/lib/plans";

// Stripe requires the raw request body to verify the signature, so this route
// reads request.text() and never parses JSON first.
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "no webhook secret" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature") ?? "";
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await syncSubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

// Upsert our subscriptions row from a Stripe Subscription object.
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  // Field shapes vary slightly across API versions; read defensively.
  const s = sub as unknown as {
    id: string;
    status: string;
    customer: string;
    cancel_at_period_end?: boolean;
    current_period_end?: number;
    metadata?: Record<string, string>;
    items: {
      data: Array<{
        current_period_end?: number;
        price?: { id?: string; recurring?: { interval?: string } };
      }>;
    };
  };

  const customerId =
    typeof s.customer === "string" ? s.customer : String(s.customer);
  const wsId =
    s.metadata?.workspace_id || (await workspaceForCustomer(customerId));
  if (!wsId) return;

  const item = s.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const interval = item?.price?.recurring?.interval ?? null;
  const periodEndUnix = s.current_period_end ?? item?.current_period_end ?? null;
  const periodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString().replace("T", " ").slice(0, 19)
    : null;
  const plan = (ACTIVE_STATUSES as readonly string[]).includes(s.status)
    ? "pro"
    : "free";
  const cancelAtEnd = s.cancel_at_period_end ? 1 : 0;

  await dbRun(
    `INSERT INTO subscriptions
       (workspace_id, plan, status, stripe_customer_id, stripe_subscription_id,
        price_id, interval, current_period_end, cancel_at_period_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (workspace_id) DO UPDATE SET
       plan = excluded.plan,
       status = excluded.status,
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       price_id = excluded.price_id,
       interval = excluded.interval,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       updated_at = datetime('now')`,
    [
      wsId,
      plan,
      s.status,
      customerId,
      s.id,
      priceId,
      interval,
      periodEnd,
      cancelAtEnd,
    ]
  );
}

async function workspaceForCustomer(
  customerId: string
): Promise<string | null> {
  const row = await dbGet<{ workspace_id: string }>(
    "SELECT workspace_id FROM subscriptions WHERE stripe_customer_id = ?",
    [customerId]
  );
  return row?.workspace_id ?? null;
}
