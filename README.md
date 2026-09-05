# Task Bucket — Project & Task Manager

A multi-workspace project and task manager built with **Next.js 15 (App
Router)**, **React 19** and **PostgreSQL**.

- **Deploying it?** See [DEPLOY.md](DEPLOY.md).
- **API reference?** Import [`postman/Task-Bucket.postman_collection.json`](postman/)
  into Postman — every endpoint, grouped, with sample bodies.

---

## Features

**Workspaces and people**

- Each account creates a workspace and becomes its **Owner**
- Invite members by email; invitations expire and are single-use
- Employee directory with profile photos, designations and inline role editing
- Four system roles — **Owner**, **Admin**, **Manager**, **Assignee** — plus
  custom roles with a per-module permission matrix
- Owner and Admin have identical permissions except that only the Owner can
  delete the workspace

**Work tracking**

- Projects with members, labels, custom fields and per-project settings
- Tasks with status, priority, due dates, assignees, sub-tasks and parent
  linking
- Sprints, a board view, a list view with bulk actions, and a timesheet
- Rich-text descriptions and comments (TipTap), with activity history

**Account and platform**

- Email/password sign-up with an emailed verification code, plus Google and
  GitHub OAuth
- Password reset by email; two-factor authentication (TOTP)
- Workspace branding (accent colour, logo) on paid plans
- A super-admin "Platform" console for workspace and billing administration

---

## Tech

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + Next.js App Router, TanStack Query |
| Backend | Next.js Route Handlers (`app/api/**`) — 59 endpoints |
| Database | PostgreSQL 17, accessed with `pg`; schema managed by Drizzle |
| Auth | Auth.js (NextAuth v5), JWT sessions |
| Email | Resend, or any SMTP server |
| Tests | Vitest (unit) + Playwright (end-to-end) |
| Deployment | Docker images, Caddy for TLS, GitHub Actions |

---

## Getting started

You need **Node.js 22+** and a **PostgreSQL 17** server.

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` and set at least:

```ini
DATABASE_URL=postgresql://postgres:yourpassword@127.0.0.1:5432/task_bucket
AUTH_SECRET=<run: openssl rand -base64 32>
```

Create the schema, then start:

```bash
npm run db:migrate     # apply drizzle/*.sql
npm run db:setup       # compatibility functions + a sample project
npm run dev
```

Open <http://localhost:3000> and sign up. The first account claims the seeded
"Website Redesign" sample project.

### Or run the whole stack in Docker

No local Postgres needed, and outgoing email is captured rather than sent:

```bash
cp .env.docker.example .env.docker    # set AUTH_SECRET and POSTGRES_PASSWORD
docker compose --env-file .env.docker up --build
```

App on <http://localhost:3000>; the Mailpit inbox on <http://localhost:8025>.

> The `--env-file` flag is required. `env_file:` only populates containers,
> while the `${...}` placeholders in `docker-compose.yml` are interpolated from
> `--env-file`.

---

## Optional configuration

All of these go in `.env.local`. Restart the dev server after editing.

**Google / GitHub sign-in** — the buttons only appear once their credentials
are present.

- GitHub: create an OAuth app at <https://github.com/settings/developers> with
  callback `http://localhost:3000/api/auth/callback/github`, then set
  `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
- Google: create credentials at
  <https://console.cloud.google.com/apis/credentials> with redirect URI
  `http://localhost:3000/api/auth/callback/google`, then set `AUTH_GOOGLE_ID`
  and `AUTH_GOOGLE_SECRET`.

Start and finish the OAuth flow on the **same hostname** — beginning on
`127.0.0.1` and returning to `localhost` fails the PKCE check.

**Email** — set `RESEND_API_KEY`, or the `SMTP_*` variables. Without either,
invitations and reset links are printed to the server console, so the flows
stay testable. With Resend, mail only reaches your own address until you verify
a sending domain.

**Platform console** — add your address to `SUPERADMIN_EMAILS`
(comma-separated) to unlock the "Platform" section.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and run |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run db:migrate` | Apply versioned migrations from `drizzle/` |
| `npm run db:generate` | Generate a migration after editing `lib/schema.ts` |
| `npm run db:push` | Push the schema directly — dev only, no migration file |
| `npm run db:setup` | Postgres compatibility functions + sample data |
| `npm run db:studio` | Drizzle Studio, a browser DB explorer |

### Changing the schema

Edit `lib/schema.ts`, then:

```bash
npm run db:generate    # writes drizzle/NNNN_name.sql — commit it
npm run db:migrate     # applies it
```

Use `db:push` only for throwaway local databases. Production applies the
committed migration files, and skipping them leaves the two out of step.

---

## Project structure

```
auth.ts, auth.config.ts      # NextAuth: providers, callbacks, edge-safe config
middleware.ts                # Route protection; exempts /api/health
next.config.mjs              # output: "standalone" for the Docker image

app/
  (auth)/                    # login, signup, forgot/reset password
  (app)/                     # the signed-in app; layout resolves permissions
                             #   server-side so the sidebar never flickers
    dashboard, projects, project/[id]/{details,members,labels,sprints,settings}
    tasks, task/[id], timesheet, directory, directory/[uid]
    settings/{profile,workspace,roles,billing}, owner
  invite/[token]/            # accept an invitation
  api/                       # 59 route handlers
    health/                  # unauthenticated liveness + DB check

lib/
  db.ts                      # Postgres pool (created lazily on first query)
  schema.ts                  # Drizzle schema — the source of truth
  permissions.ts, rbac.ts    # Roles, modules, actions; hasFullAccess()
  workspace.ts, membership.ts, invites.ts
  rate-limit.ts              # Fixed-window limiter, backed by Postgres
  email.ts                   # Resend / SMTP / console sender
  ...

drizzle/                     # Versioned migrations (0000_baseline.sql onward)
deploy/                      # Server bootstrap, Caddyfile, backup/restore
tests/                       # Vitest unit tests + Playwright e2e
postman/                     # Importable API collection
```

---

## Notes

- **`lib/db.ts` connects lazily.** Importing it must never require
  `DATABASE_URL`, because `next build` imports the whole module graph and the
  build runs without a database.
- **Sessions are stateless JWTs**, which the Credentials provider requires. That
  is also why the app scales horizontally without shared session storage.
- **Passwords** are hashed with `scrypt`. Reset tokens are single-use, expire
  after an hour, and only their hash is stored.
- **Rate limiting** lives in Postgres (`lib/rate-limit.ts`) rather than Redis —
  one fewer service to operate at this size. The email-sending endpoints allow
  5 requests per address and 20 per IP per hour.
- **The `nocase` collation and the `datetime()` / `group_concat()` functions**
  installed by `db:setup` exist so SQL written against the app's original
  SQLite backend keeps working on Postgres. Run it after migrating a fresh
  database.
