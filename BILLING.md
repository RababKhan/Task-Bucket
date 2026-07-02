# Billing (manual bank transfer)

Task Bucket bills **per workspace** on two flat tiers:

| Plan | Limits | Price |
|---|---|---|
| **Free** | 2 projects, 3 members | $0 |
| **Pro** | Unlimited projects + members | $12/mo or $120/yr |

There is **no payment provider**. Customers pay you by **bank transfer** and you
activate Pro manually.

## The flow

1. A workspace admin opens **Settings → Billing**, picks monthly/yearly, and
   sees your bank details + their workspace domain.
2. They transfer the money, then **email their invoice + workspace domain** to
   your billing contact.
3. They click **"I've made the transfer — request activation"** (records a
   pending request you can see with `npm run billing -- requests`).
4. You verify the payment and **activate Pro** from the CLI.

## Configure (`.env.local`)

```
BILLING_CONTACT_EMAIL="billing@yourdomain.com"
BANK_NAME="Example Bank PLC"
BANK_BENEFICIARY="Account Holder Name"
BANK_ACCOUNT_NUMBER="0000000000"
BANK_BRANCH="Branch, City"
BANK_ROUTING="000000000"
BANK_BRANCH_CODE="000"
BANK_SWIFT="EXAMPLEXXX"
BANK_IBAN=""
BANK_REFERENCE=""
```

Only the fields you set are shown (blank ones are hidden). Restart
`npm run dev` after changing them.

## Owner CLI

```bash
npm run billing -- list                 # all workspaces + their plan/usage
npm run billing -- requests             # pending upgrade requests (subdomain + interval)

# Activate Pro (subdomain comes from the request / the customer's email):
npm run billing -- activate acme --interval year --note "INV-1024"
npm run billing -- activate acme --months 3        # custom duration
npm run billing -- activate acme                   # perpetual (no expiry)

npm run billing -- deactivate acme      # back to Free
```

- With `--interval year` Pro is valid for 12 months, `--interval month` for 1;
  `--months N` overrides. No flag = **no expiry** (stays Pro until you
  deactivate). Expired Pro auto-falls back to free-tier limits.
- Activating also resolves the workspace's pending upgrade request.

## How it works

| Piece | Where |
|---|---|
| Plan catalog + limits | `lib/plans.ts` (client-safe) |
| Subscription read / gating / requests | `lib/billing.ts` |
| State | `subscriptions` (1 row/workspace) + `billing_requests` (queue) |
| API | `GET /api/billing`, `POST /api/billing/request` |
| Plan gating | project create + invite return `402` at free limits |
| UI | `app/(app)/settings/billing` |
| Owner activation | `scripts/billing.mjs` (`npm run billing`) |

The Billing page + gating work without any config — bank details just show a
"not configured" note until you set the env vars.
