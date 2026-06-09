# Task Bucket — Project & Task Manager

A simple project and task manager built with **Next.js (App Router)** and **SQLite**
(via Node's built-in `node:sqlite` — no native compilation required).

## Features

- **Authentication** — email/password sign-up & login, Google & GitHub OAuth, and
  a password-reset-by-email flow (Auth.js / NextAuth v5)
- **Per-user data** — each account only sees its own projects and tasks
- Projects with descriptions and live task counts
- Kanban-style task board: **To Do → In Progress → Done**
- Per-task priority (low / medium / high) and due dates (overdue dates flagged red)
- Create / edit / delete projects and tasks
- Move tasks between columns
- Data persists to a local SQLite file at `data/pm.db` (auto-created and seeded on first run)

## Authentication setup

Auth runs out of the box with **email/password** — just sign up. Google/GitHub login
and password-reset emails need credentials in `.env.local` (copy from `.env.example`):

1. **`AUTH_SECRET`** — already generated in `.env.local`. Regenerate any time with:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. **GitHub login** — create an OAuth app at
   <https://github.com/settings/developers>; callback URL
   `http://localhost:3000/api/auth/callback/github`. Set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.
3. **Google login** — create OAuth credentials at
   <https://console.cloud.google.com/apis/credentials>; redirect URI
   `http://localhost:3000/api/auth/callback/google`. Set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. **Password-reset email** — set `RESEND_API_KEY` (from <https://resend.com>) or the
   `SMTP_*` vars. **Until you do, reset links are printed to the server console** so the
   flow is still testable.

Social-login buttons only appear once their credentials are present. Restart `npm run dev`
after editing `.env.local`.

> The first account to sign up automatically claims the seeded "Website Redesign"
> sample project.

## Tech

| Layer    | Choice                                   |
| -------- | ---------------------------------------- |
| Frontend | React 19 + Next.js App Router            |
| Backend  | Next.js Route Handlers (`app/api/**`)    |
| Database | SQLite via `node:sqlite` (built into Node 22.13+/24) |

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

> Requires Node.js 22.13+ or 24+ (for the built-in `node:sqlite` module).

## Project structure

```
auth.ts                      # NextAuth instance (Credentials + OAuth + callbacks)
auth.config.ts               # Edge-safe config (providers, route protection)
middleware.ts                # Protects pages/APIs; redirects to /login
app/
  (auth)/                    # Auth pages (route group, no shared layout chrome)
    login/                   #   email/password + OAuth buttons
    signup/                  #   create account
    forgot-password/         #   request reset email
    reset-password/          #   set new password from emailed token
    OAuthButtons.tsx         #   shared Google/GitHub buttons
  api/
    auth/[...nextauth]/      # NextAuth handler
    register/route.ts        # POST — create credentials account
    password/forgot/route.ts # POST — send reset link
    password/reset/route.ts  # POST — consume token, set password
    projects/...             # CRUD, scoped to the signed-in user
    tasks/...                # CRUD, scoped via project ownership
  page.tsx                   # Main UI: sidebar + board + user chip
  TaskModal.tsx              # Create/edit task dialog
  providers.tsx              # SessionProvider wrapper
  layout.tsx, globals.css
lib/
  db.ts                      # SQLite connection, schema, migrations, seed
  auth-db.ts                 # Users/accounts/reset-tokens + scrypt hashing
  email.ts                   # Resend / SMTP / console email sender
  session.ts                 # currentUserId() helper for route handlers
  types.ts                   # Shared client/server types
types/next-auth.d.ts         # Session/JWT type augmentation
data/pm.db                   # SQLite database (git-ignored, auto-created)
```

## Notes

- `node:sqlite` is currently an experimental Node API, so you'll see one
  `ExperimentalWarning` line on startup — it's harmless.
- To reset the data, stop the server and delete the `data/` folder; it will be
  recreated and re-seeded on the next start.
- Passwords are hashed with `scrypt` (Node's built-in `crypto`, no native deps).
  Sessions are stateless JWTs (required by the Credentials provider). Password
  reset tokens are single-use, expire after 1 hour, and only their hash is stored.
