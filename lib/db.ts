import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import type { Project } from "@/lib/types";

// Single shared connection across hot reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __pmDb: DatabaseSync | undefined;
}

function createDb(): DatabaseSync {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, "pm.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
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
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
      priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
      due_date    TEXT,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  `);

  // Add owner_id to pre-existing databases BEFORE indexing it.
  migrate(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)");

  seedIfEmpty(db);
  return db;
}

// Lightweight migrations for databases created before auth was added.
function migrate(db: DatabaseSync) {
  const cols = db.prepare("PRAGMA table_info(projects)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "owner_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN owner_id TEXT");
  }
}

function seedIfEmpty(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM projects").get() as {
    n: number;
  };
  if (count.n > 0) return;

  // Seed an unowned sample project; the first account to sign up claims it.
  const insertProject = db.prepare(
    "INSERT INTO projects (name, description) VALUES (?, ?)"
  );
  const insertTask = db.prepare(
    "INSERT INTO tasks (project_id, title, description, status, priority, due_date, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  db.exec("BEGIN");
  try {
    const projectId = insertProject.run(
      "Website Redesign",
      "Revamp the marketing site for the Q3 launch."
    ).lastInsertRowid as number;

    const tasks: Array<[string, string, string, string, string | null]> = [
      ["Audit current pages", "List all pages and flag outdated content.", "done", "medium", null],
      ["Design new homepage", "Hero, features, social proof sections.", "in_progress", "high", "2026-06-20"],
      ["Set up analytics", "Add event tracking for key CTAs.", "todo", "low", null],
      ["Write launch copy", "Headlines and body copy for all sections.", "todo", "medium", "2026-06-25"],
    ];
    tasks.forEach((t, i) =>
      insertTask.run(projectId, t[0], t[1], t[2], t[3], t[4], i)
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const db = globalThis.__pmDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__pmDb = db;

export default db;

export type {
  Project,
  Task,
  TaskStatus,
  TaskPriority,
} from "@/lib/types";
