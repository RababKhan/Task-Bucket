# Billing setup (Stripe)

Task Bucket bills **per workspace** on two flat tiers: **Free** (2 projects, 3
members) and **Pro** (unlimited, monthly or yearly). This guide wires Stripe in
**test mode** for local development.

## 1. Create the Stripe test product + prices

1. Create a Stripe account and stay in **Test mode** (toggle, top-right of the
   dashboard).
2. **Products → Add product** → name it "Task Bucket Pro".
3. Add **two recurring prices** to it:
   - Monthly — e.g. `$12 / month`
   - Yearly — e.g. `$120 / year`
4. Copy each **Price ID** (`price_…`).

## 2. Get your API keys

- **Developers → API keys** → copy the **Secret key** (`sk_test_…`).

## 3. Fill in `.env.local`

```
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PRICE_PRO_MONTHLY="price_..."
STRIPE_PRICE_PRO_YEARLY="price_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
# STRIPE_WEBHOOK_SECRET set in step 4
```

## 4. Forward webhooks locally (Stripe CLI)

The app keeps its subscription state in sync via webhooks. Install the
[Stripe CLI](https://stripe.com/docs/stripe-cli), then:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
```

It prints a signing secret (`whsec_…`) — put it in `.env.local`:

```
STRIPE_WEBHOOK_SECRET="whsec_..."
```

Restart `npm run dev` so the new env is picked up. Keep `stripe listen` running
while you test.

## 5. Test the flow

1. Sign in as a **workspace admin** → sidebar **Billing** → **Upgrade to Pro**.
2. On Stripe Checkout use test card `4242 4242 4242 4242`, any future expiry/CVC.
3. After redirect back, the webhook flips the workspace to **Pro** (unlimited).
4. **Manage billing** opens the Stripe Billing Portal (change plan / cancel).

## How it works

| Piece | Where |
|---|---|
| Plan catalog + limits | `lib/plans.ts` (client-safe) |
| Stripe client + price/URL helpers | `lib/stripe.ts` (server-only) |
| Subscription read/gating helpers | `lib/billing.ts` |
| Subscription state | `subscriptions` table (1 row per workspace) |
| Checkout / Portal / Webhook | `app/api/billing/{checkout,portal,webhook}` |
| Plan gating | project create (`/api/projects`) + invite (`/api/team/invite`) return `402` at the free limit |
| UI | `app/(app)/settings/billing` |

Without keys the app still runs — the Billing page shows a "not configured"
notice and gating uses the free-tier limits. The webhook route is exempt from
auth middleware (Stripe calls it unauthenticated) and verifies the signature.

## Going to production

- Use **live-mode** keys + a real webhook endpoint
  (`https://yourdomain/api/billing/webhook`) whose signing secret goes in
  `STRIPE_WEBHOOK_SECRET`.
- Set `NEXT_PUBLIC_APP_URL` to your production URL.
- Consider enabling **Stripe Tax** (you are the merchant of record).
