import {
  createClient,
  type Client,
  type InArgs,
  type Row,
} from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

// Database connection.
//   - Local dev:  file:data/pm.db   (no env needed)
//   - Production: set TURSO_DATABASE_URL (libsql://…) + TURSO_AUTH_TOKEN
const url = process.env.TURSO_DATABASE_URL?.trim() || "file:data/pm.db";
const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

// Ensure the local data directory exists when using a file: URL.
if (url.startsWith("file:")) {
  const dir = path.dirname(url.slice("file:".length));
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Reuse the client + init across hot reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __pmClient: Client | undefined;
  // eslint-disable-next-line no-var
  var __pmReady: Promise<void> | undefined;
}

const client =
  globalThis.__pmClient ?? createClient({ url, authToken, intMode: "number" });
if (process.env.NODE_ENV !== "production") globalThis.__pmClient = client;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  email         TEXT UNIQUE,
  image         TEXT,
  password_hash TEXT,
  email_verified TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_otps (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  otp_hash         TEXT,
  expires_at       TEXT,
  attempts         INTEGER NOT NULL DEFAULT 0,
  reset_token_hash TEXT,
  reset_expires_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signup_otps (
  email             TEXT PRIMARY KEY,
  otp_hash          TEXT,
  expires_at        TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  verify_token_hash TEXT,
  verify_expires_at TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  subdomain  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date    TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
`;

// Lightweight migration for databases created before auth was added.
async function migrate(): Promise<void> {
  const info = await client.execute("PRAGMA table_info(projects)");
  const hasOwner = info.rows.some((r) => (r as Row).name === "owner_id");
  if (!hasOwner) {
    await client.execute("ALTER TABLE projects ADD COLUMN owner_id TEXT");
  }
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)"
  );

  // Subtasks: tasks.parent_id (added after the initial tasks table).
  const taskInfo = await client.execute("PRAGMA table_info(tasks)");
  const hasParent = taskInfo.rows.some((r) => (r as Row).name === "parent_id");
  if (!hasParent) {
    await client.execute("ALTER TABLE tasks ADD COLUMN parent_id INTEGER");
  }
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)"
  );
}

// Seed an unowned sample project the first account claims on sign-up.
async function seedIfEmpty(): Promise<void> {
  const res = await client.execute("SELECT COUNT(*) AS n FROM projects");
  if (Number((res.rows[0] as Row).n) > 0) return;

  const proj = await client.execute({
    sql: "INSERT INTO projects (name, description) VALUES (?, ?)",
    args: ["Website Redesign", "Revamp the marketing site for the Q3 launch."],
  });
  const projectId = Number(proj.lastInsertRowid);

  const tasks: Array<[string, string, string, string, string | null]> = [
    ["Audit current pages", "List all pages and flag outdated content.", "done", "medium", null],
    ["Design new homepage", "Hero, features, social proof sections.", "in_progress", "high", "2026-06-20"],
    ["Set up analytics", "Add event tracking for key CTAs.", "todo", "low", null],
    ["Write launch copy", "Headlines and body copy for all sections.", "todo", "medium", "2026-06-25"],
  ];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    await client.execute({
      sql: "INSERT INTO tasks (project_id, title, description, status, priority, due_date, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [projectId, t[0], t[1], t[2], t[3], t[4], i],
    });
  }
}

async function init(): Promise<void> {
  await client.executeMultiple(SCHEMA);
  await migrate();
  await seedIfEmpty();
}

// Run init exactly once; every query awaits it first.
const ready = globalThis.__pmReady ?? init();
if (process.env.NODE_ENV !== "production") globalThis.__pmReady = ready;

// ---- Query helpers (async) ----
export async function dbGet<T = Row>(
  sql: string,
  args: InArgs = []
): Promise<T | undefined> {
  await ready;
  const res = await client.execute({ sql, args });
  return res.rows[0] as T | undefined;
}

export async function dbAll<T = Row>(
  sql: string,
  args: InArgs = []
): Promise<T[]> {
  await ready;
  const res = await client.execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function dbRun(
  sql: string,
  args: InArgs = []
): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  await ready;
  const res = await client.execute({ sql, args });
  return {
    lastInsertRowid:
      res.lastInsertRowid != null ? Number(res.lastInsertRowid) : 0,
    rowsAffected: res.rowsAffected,
  };
}

export type {
  Project,
  Task,
  TaskStatus,
  TaskPriority,
} from "@/lib/types";
