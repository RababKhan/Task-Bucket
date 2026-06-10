# Deploying Task Bucket to Vercel

Task Bucket runs on Vercel with a **Turso** (libSQL) database and **Resend** for
email. Both have free tiers that comfortably cover a small app.

Locally you need none of this — with no env vars the app uses a local SQLite
file at `data/pm.db` and prints emails to the console.

---

## 1. Create a Turso database (free)

1. Sign up at <https://turso.tech> and install the CLI (or use the dashboard).
2. Create a database and grab its credentials:

   ```bash
   turso db create task-bucket
   turso db show task-bucket --url          # → libsql://task-bucket-<org>.turso.io
   turso db tokens create task-bucket       # → the auth token
   ```

   (Or copy both from the database page in the Turso dashboard.)

The schema and a sample project are created automatically on first run — no
migration step needed.

## 2. Create a Resend API key (free) — for email

1. Sign up at <https://resend.com> and create an API key.
2. **Verify a sending domain** (required to email real users). For a quick demo
   you can use `onboarding@resend.dev`, but it only delivers to your own Resend
   account email.

## 3. Push to GitHub

Already done — the repo is at <https://github.com/RababKhan/Task-Bucket>.

## 4. Import into Vercel

1. <https://vercel.com/new> → import the `Task-Bucket` repo.
2. Framework preset: **Next.js** (auto-detected). No build settings to change.
3. Add **Environment Variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |----------|-------|
   | `AUTH_SECRET` | a random secret — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `AUTH_URL` | your Vercel URL, e.g. `https://task-bucket.vercel.app` |
   | `TURSO_DATABASE_URL` | `libsql://…turso.io` from step 1 |
   | `TURSO_AUTH_TOKEN` | the token from step 1 |
   | `RESEND_API_KEY` | from step 2 |
   | `EMAIL_FROM` | e.g. `Task Bucket <noreply@yourdomain.com>` |

   Optional (only if you use social login):
   `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
   Set each provider's callback URL to `https://<your-domain>/api/auth/callback/<provider>`.

4. **Deploy.**

## 5. After deploy

- Visit the URL — you'll land on the sign-up page and can create an account.
- If you set a custom domain later, update `AUTH_URL` (and any OAuth callback
  URLs) to match.

---

### Notes

- **Node version:** pinned to `>=20` in `package.json` (`engines`). Vercel honors
  this.
- **Database driver:** the app talks to libSQL via `@libsql/client`. With
  `TURSO_DATABASE_URL` set it connects to Turso over HTTPS (serverless-friendly);
  with it empty it uses a local `file:` database for development.
- **Workspace subdomains** (e.g. `acme.taskbucket.local`) are display labels
  only — the app does not route by subdomain, so this works unchanged on a single
  Vercel domain.
