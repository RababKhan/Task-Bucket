# Deploying Task Bucket

There are two supported ways to run this app. Pick one.

| | **Path A — Vercel + Neon** | **Path B — [your own server](DEPLOY-SELFHOST.md)** |
|---|---|---|
| Payment method | **None needed** | A card, or a VPS you can pay for |
| Time to live | ~30 minutes | ~90 minutes |
| You operate | Nothing | One Linux box |
| Commercial use | **Not allowed** on Vercel's free Hobby tier | Fine |
| Scale ceiling | Free-tier limits (below) | Whatever you rent |

**This page is Path A.** It is the right choice for a personal or portfolio
project, and it needs no credit card at any point. If you later charge money for
this, Vercel's Hobby terms are non-commercial, so move to
[self-hosting](DEPLOY-SELFHOST.md) — everything for that is already in the repo
and nothing you do here is wasted.

---

## What you are building

```
                    +---------------- Vercel ----------------+
  browser --HTTPS-->|  Next.js app (serverless functions)     |
                    +-----------------------------------------+
                                     |
                                     | pooled connection, TLS
                                     v
                    +---------------- Neon ------------------+
                    |  PostgreSQL 17 (sleeps when idle)      |
                    +-----------------------------------------+
        ^
        | deploys on every push to main
   GitHub repo
```

Vercel builds and hosts the app and gives you HTTPS automatically. Neon holds the
database. GitHub Actions applies schema migrations. Nothing runs on your machine.

---

## Before you start

Three accounts, all free, **none of which asks for a card**:

| What | Where | Sign in with |
|---|---|---|
| Neon (database) | <https://neon.com> | GitHub |
| Vercel (hosting) | <https://vercel.com> | GitHub |
| Resend *or* Gmail (email) | <https://resend.com> | GitHub |

Signing in to all three with your GitHub account is the quickest route and means
one less password.

Email is not optional — invitations, password resets and signup codes all go
through it. Step 2 covers the choice, and it matters more than it looks.

---

## Step 1 — Create the database

1. Sign up at <https://neon.com> with GitHub.
2. **Create a project.** Name it `task-bucket`. For the region, pick whichever is
   closest to you; you will point Vercel at the same part of the world in step 3.
3. Neon shows you a connection string. **Copy the pooled one** — the host has
   `-pooler` in it, like:

   ```
   postgresql://user:PASSWORD@ep-something-123456-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```

   If you only see the direct string, open **Connect** and turn on *Connection
   pooling*. Serverless functions open and close connections constantly; the
   pooled endpoint is what survives that.

4. Keep this string somewhere safe for the next two steps. It contains your
   database password.

> **Ignore Neon's CLI onboarding.** After creating a project, Neon offers a
> setup flow — `neon skills`, `neon mcp`, `neon config init`, `neon deploy`.
> That is infrastructure-as-code for Neon Functions, AI Gateway and object
> storage, none of which this app uses, and you do not need any of it.
>
> In particular **do not run `neon deploy`**: it writes credentials into
> `.env.local`, which here points at your *local* Postgres. Overwriting it
> would silently aim your development server at the production database.
>
> The connection string above is the only thing you need from Neon.

> **Free tier:** 0.5 GB of storage and 100 compute-hours a month. The database
> sleeps after 5 minutes of inactivity and wakes on the next query, so an idle
> app costs nothing — the first request after a quiet spell just takes a second
> or two longer.

---

## Step 2 — Set up email

Pick **one** of these. The difference is not cosmetic, so read both.

### Option 1: Gmail SMTP — can email anyone, no domain needed

Best if you want other people to actually receive invitations.

1. Your Google account needs 2-Step Verification turned on.
2. Go to <https://myaccount.google.com/apppasswords> and create an app password
   named `Task Bucket`. Google shows you 16 characters — copy them.
3. You will set these in step 3:

   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=you@gmail.com
   SMTP_PASS=the 16-character app password
   EMAIL_FROM=Task Bucket <you@gmail.com>
   ```

   Gmail allows around 500 messages a day, far more than a portfolio app sends.

### Option 2: Resend — nicer, but only reaches *you* without a domain

1. Sign up at <https://resend.com> and create an API key.
2. Set `RESEND_API_KEY` and leave `EMAIL_FROM` as
   `Task Bucket <onboarding@resend.dev>`.

**The catch:** until you verify a sending domain — which means owning a domain —
Resend only delivers to the address on your own Resend account. Invitations to
anyone else silently go nowhere. That is the single most common "the invite never
arrived" problem, and with no domain you cannot fix it.

So: **Gmail if anyone but you needs email. Resend if you own a domain**, or if
you are the only person who will ever log in.

---

## Step 3 — Deploy the app

1. Sign up at <https://vercel.com> with GitHub.
2. **Add New → Project**, then import `RababKhan/Task-Bucket`. Vercel detects
   Next.js on its own — leave the build settings alone.
3. Before clicking Deploy, open **Environment Variables** and add these.

   Generate the secret first, in a terminal:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string from step 1 |
   | `AUTH_SECRET` | the value you just generated |
   | `AUTH_TRUST_HOST` | `true` |
   | `SUPERADMIN_EMAILS` | your own email address |
   | *email vars* | whichever set you chose in step 2 |

4. **Deploy.** It takes two or three minutes. Vercel gives you a URL like
   `task-bucket-abc123.vercel.app` — that is a real HTTPS address, free forever,
   and you can use it permanently.

5. Now that you know the URL, go to **Settings → Environment Variables** and add
   one more:

   | Name | Value |
   |---|---|
   | `AUTH_URL` | `https://your-actual-url.vercel.app` |

   Then **Deployments → ⋯ → Redeploy**. Sign-in builds redirect URLs from this,
   so it has to match the address you really visit.

> **Do not put secrets in the repo.** Everything above lives in Vercel's
> environment-variable store, which is write-only once saved. `.env.local`,
> `.env.docker` and `.env.prod` are all git-ignored for the same reason.

---

## Step 4 — Create the schema

The app is deployed but the database is still empty. Migrations run from GitHub
Actions, not from the Vercel build — a Vercel build also runs for every preview
branch, and you do not want each of those migrating your real database.

1. In the repo: **Settings → Secrets and variables → Actions → New repository
   secret.**

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the same pooled Neon string |

2. Go to the **Actions** tab → **Migrate database** → **Run workflow**.

3. Watch it finish. It creates the 24 tables, then installs the compatibility
   functions the app's SQL depends on (a case-insensitive collation plus
   `datetime()` and `group_concat()`), and seeds one sample project.

From now on this runs by itself whenever you push a change that touches
`lib/schema.ts` or `drizzle/`.

---

## Step 5 — Create your account

Open your Vercel URL and sign up.

**Do this before you share the address with anyone.** The first person to sign up
creates the first workspace and becomes its Owner.

Then check everything is wired up:

```
https://your-url.vercel.app/api/health
```

That should answer `{"status":"ok","database":"up","latencyMs":42}`. If it says
`database` is down, the `DATABASE_URL` in Vercel is wrong or step 4 has not run.

---

## Step 6 — Your own domain (optional)

Only if you already own one. Registering a domain costs money, and the
`.vercel.app` address works perfectly well without it.

1. Vercel → your project → **Settings → Domains** → add your domain.
2. Vercel shows you the DNS records to create at your registrar. Add them.
3. Once it verifies, update `AUTH_URL` to `https://yourdomain.com` and redeploy.
   Set `NEXT_PUBLIC_WORKSPACE_DOMAIN` to the same value if you want the signup
   form to show `acme.yourdomain.com` instead of the default.

Owning a domain also unlocks Resend properly — verify it there and email starts
reaching everyone, not just you.

---

## Day-to-day

**Deploying** is pushing to `main`. Vercel builds and swaps it in; if the build
fails, the previous version stays up.

**Rolling back:** Vercel → Deployments → find the last good one → ⋯ →
*Promote to Production*. Instant, and it does not rebuild.

**Logs:** Vercel → your project → **Logs**. Runtime errors from route handlers
appear here.

**Database:** Neon's **SQL Editor** runs queries in the browser. Neon keeps its
own backups on the free tier, with restore-to-a-point-in-time over the last 24
hours.

**Changing the schema:** edit `lib/schema.ts`, then

```bash
npm run db:generate    # writes drizzle/NNNN_name.sql — commit it
```

Push it; the Migrate workflow applies it automatically.

---

## What the free tiers actually give you

| | Limit | What happens at the edge |
|---|---|---|
| Vercel | 100 GB transfer, 1M function calls/month | Features pause until the window resets; nothing is deleted or charged |
| Neon | 0.5 GB storage, 100 compute-hours/month | Writes are refused when storage is full |
| Gmail SMTP | ~500 emails/day | Sending is throttled |

Two things worth knowing about this app specifically:

- **Profile photos are stored in the database** as data URLs, not as files. That
  is what makes the app stateless and easy to host, but it does eat into Neon's
  0.5 GB. A few hundred avatars is fine; thousands is not.
- **The database sleeps.** After five idle minutes the first request takes an
  extra second or two while Neon wakes up. Normal for free serverless Postgres.

**Vercel Hobby is non-commercial.** If you start charging for this, you need
either Vercel Pro or [Path B](DEPLOY-SELFHOST.md).

---

## Troubleshooting

**`/api/health` says the database is down.**
`DATABASE_URL` in Vercel is wrong, or the Migrate workflow has not run. Check
you used the **pooled** string, with `-pooler` in the host and `?sslmode=require`
on the end.

**Sign-in redirects somewhere wrong, or fails with `error=Configuration`.**
`AUTH_URL` does not match the address you visited, or `AUTH_SECRET` is missing.
Both live in Vercel's environment variables — redeploy after changing either.

**Everything works but no email arrives.**
If you are on Resend without a verified domain, that is expected: it only
delivers to your own account address. Switch to the Gmail option in step 2.

**Google/GitHub sign-in buttons do not appear.**
They only render when their credentials are set. Add `AUTH_GITHUB_ID` /
`AUTH_GITHUB_SECRET` (callback `https://your-url/api/auth/callback/github`) or
the Google equivalents, then redeploy.

**A build fails with a type error.**
CI runs the same checks on every push — open the Actions tab and read the
**CI** run, which usually names the file and line more clearly than Vercel's log.

**Migrations fail with "relation already exists".**
The database already has tables that the migration journal does not know about.
Easiest fix on a project with no real data yet: delete the Neon branch's tables
(Neon → SQL Editor → `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) and
re-run the Migrate workflow.

---

## When to move to Path B

Move to [self-hosting](DEPLOY-SELFHOST.md) when any of these becomes true:

1. **You start charging for it.** Vercel Hobby is non-commercial; this is a terms
   question, not a technical one.
2. **You outgrow 0.5 GB of database.** Realistically, avatars and attachments.
3. **Cold starts start to bother you or your users.**

The self-hosted path is already built and tested — Docker images, a Caddy
reverse proxy with automatic HTTPS, backup and restore scripts, and a deploy
workflow. It needs a Linux server and a way to pay for it, and it is not
AWS-specific: any $5/month VPS works, including regional providers that accept
local bank transfers or mobile wallets.

---

## Running the whole stack locally

Unrelated to either path, but useful:

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

Fill in `AUTH_SECRET` at minimum. The app runs on <http://localhost:3000>, and
every outgoing email is caught by Mailpit at <http://localhost:8025> instead of
being sent.
