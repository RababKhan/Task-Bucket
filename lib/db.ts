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

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'assignee' CHECK (role IN ('admin','manager','assignee')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'assignee' CHECK (role IN ('admin','manager','assignee')),
  token_hash   TEXT NOT NULL,
  invited_by   TEXT,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sprints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  goal        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  sprint_id   INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date    TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

CREATE TABLE IF NOT EXISTS custom_fields (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','number','date','select')),
  options    TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  value    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (field_id, task_id)
);
`;

// Lightweight migration for databases created before auth was added.
async function migrate(): Promise<void> {
  const info = await client.execute("PRAGMA table_info(projects)");
  const hasOwner = info.rows.some((r) => (r as Row).name === "owner_id");
  if (!hasOwner) {
    await client.execute("ALTER TABLE projects ADD COLUMN owner_id TEXT");
  }
  if (!info.rows.some((r) => (r as Row).name === "workspace_id")) {
    await client.execute("ALTER TABLE projects ADD COLUMN workspace_id TEXT");
  }
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id)"
  );

  // Backfill multi-user model: every workspace owner is an admin member, and
  // each existing project belongs to its owner's workspace.
  await client.execute(
    `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
     SELECT id, owner_id, 'admin' FROM workspaces`
  );
  await client.execute(
    `UPDATE projects
     SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_id = projects.owner_id)
     WHERE workspace_id IS NULL AND owner_id IS NOT NULL`
  );

  // Columns added to tasks after the initial table (subtasks, sprints).
  const taskInfo = await client.execute("PRAGMA table_info(tasks)");
  const taskCols = taskInfo.rows.map((r) => (r as Row).name);
  if (!taskCols.includes("parent_id")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN parent_id INTEGER");
  }
  if (!taskCols.includes("sprint_id")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN sprint_id INTEGER");
  }
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id)"
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
  Sprint,
  SprintStatus,
  CustomField,
  CustomFieldType,
  CustomFieldWithValue,
  Role,
  Member,
  PendingInvite,
} from "@/lib/types";
