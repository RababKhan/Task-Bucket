import {
  createClient,
  type Client,
  type InArgs,
  type Row,
} from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

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
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'assignee',
  active         INTEGER NOT NULL DEFAULT 1,
  last_active_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'assignee',
  token_hash     TEXT NOT NULL,
  invited_by     TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','expired','cancelled')),
  project_access TEXT NOT NULL DEFAULT '[]',
  message        TEXT,
  expires_at     TEXT NOT NULL,
  accepted_at    TEXT,
  cancelled_at   TEXT,
  updated_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  manager_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft',
  start_date   TEXT,
  due_date     TEXT,
  task_seq     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  added_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
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
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  sprint_id    INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('story','task','bug')),
  status       TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','dev_in_progress','dev_done','in_test','test_in_progress','test_fail','test_done','ready_for_deploy','done')),
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  severity     TEXT,
  story_points INTEGER,
  start_date   TEXT,
  due_date     TEXT,
  labels       TEXT NOT NULL DEFAULT '[]',
  position     INTEGER NOT NULL DEFAULT 0,
  seq          INTEGER,
  progress     INTEGER,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  story_id     INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  linked_to    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);

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

CREATE TABLE IF NOT EXISTS task_activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  text       TEXT NOT NULL,
  meta       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id);

CREATE TABLE IF NOT EXISTS task_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent ON task_comments(parent_id);

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id INTEGER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS comment_attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comment_attachments_comment ON comment_attachments(comment_id);

CREATE TABLE IF NOT EXISTS roles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  is_system    INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS idx_roles_workspace ON roles(workspace_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id      INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module       TEXT NOT NULL,
  action       TEXT NOT NULL,
  PRIMARY KEY (role_id, module, action)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_ws ON role_permissions(workspace_id);
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
  const projCols = info.rows.map((r) => (r as Row).name);
  if (!projCols.includes("manager_id")) {
    await client.execute("ALTER TABLE projects ADD COLUMN manager_id TEXT");
  }
  if (!projCols.includes("status")) {
    await client.execute(
      "ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'"
    );
  }
  // Remap any legacy status values to the current set.
  await client.execute(
    "UPDATE projects SET status = 'draft' WHERE status IN ('backlog','planning')"
  );
  await client.execute(
    "UPDATE projects SET status = 'on_track' WHERE status = 'active'"
  );
  if (!projCols.includes("start_date")) {
    await client.execute("ALTER TABLE projects ADD COLUMN start_date TEXT");
  }
  if (!projCols.includes("due_date")) {
    await client.execute("ALTER TABLE projects ADD COLUMN due_date TEXT");
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
  // Agile work-item fields added with the task-type redesign.
  if (!taskCols.includes("type")) {
    await client.execute(
      "ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'task'"
    );
  }
  if (!taskCols.includes("severity")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN severity TEXT");
  }
  if (!taskCols.includes("story_points")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN story_points INTEGER");
  }
  if (!taskCols.includes("start_date")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN start_date TEXT");
  }
  if (!taskCols.includes("labels")) {
    await client.execute(
      "ALTER TABLE tasks ADD COLUMN labels TEXT NOT NULL DEFAULT '[]'"
    );
  }
  // Per-project incremental number behind the human task id (e.g. DEV-001).
  if (!taskCols.includes("seq")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN seq INTEGER");
    // Backfill existing tasks: number them per project in creation order.
    await client.execute(`
      UPDATE tasks SET seq = (
        SELECT COUNT(*) FROM tasks t2
        WHERE t2.project_id = tasks.project_id AND t2.id <= tasks.id
      ) WHERE seq IS NULL
    `);
  }
  // Manually-set completion percentage (0-100); null falls back to the derived
  // subtask-completion progress on the detail page.
  if (!taskCols.includes("progress")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN progress INTEGER");
  }
  // Who created the task (for the "Created by" field).
  if (!taskCols.includes("created_by")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN created_by TEXT");
  }
  // Story a task is linked to (a Story item can link existing project tasks).
  if (!taskCols.includes("story_id")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN story_id INTEGER");
  }
  // Story/Task a bug is linked to (a Story or Task can link existing bugs).
  if (!taskCols.includes("linked_to")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN linked_to INTEGER");
  }
  // Monotonic per-project task counter behind the human task id. Never decreases,
  // so deleting a task doesn't let the next one reuse its number. Seeded from the
  // current highest task seq (runs after tasks.seq exists/backfills above).
  if (!projCols.includes("task_seq")) {
    await client.execute(
      "ALTER TABLE projects ADD COLUMN task_seq INTEGER NOT NULL DEFAULT 0"
    );
    await client.execute(`
      UPDATE projects SET task_seq = (
        SELECT COALESCE(MAX(seq), 0) FROM tasks WHERE tasks.project_id = projects.id
      )
    `);
  }
  // Structured metadata for activity entries (e.g. field + raw from/to values
  // so the UI can render status/priority icons inline).
  const actInfo = await client.execute("PRAGMA table_info(task_activity)");
  const actCols = actInfo.rows.map((r) => (r as Row).name);
  if (actCols.length && !actCols.includes("meta")) {
    await client.execute("ALTER TABLE task_activity ADD COLUMN meta TEXT");
  }
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id)"
  );

  // Migrate the task workflow from the original 3 statuses to the 9-stage
  // agile/dev pipeline. The status column has a CHECK constraint that only
  // allows the old values, so the table must be rebuilt (SQLite can't ALTER a
  // CHECK). Detect by whether the new statuses appear in the table's DDL.
  const tasksDdl = String(
    (
      await client.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'"
      )
    ).rows[0]?.sql ?? ""
  );
  if (!tasksDdl.includes("'critical'")) {
    await client.execute("PRAGMA foreign_keys=OFF");
    await client.execute(`
      CREATE TABLE tasks_new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        sprint_id    INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
        title        TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        type         TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('story','task','bug')),
        status       TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','dev_in_progress','dev_done','in_test','test_in_progress','test_fail','test_done','ready_for_deploy','done')),
        priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
        severity     TEXT,
        story_points INTEGER,
        start_date   TEXT,
        due_date     TEXT,
        labels       TEXT NOT NULL DEFAULT '[]',
        position     INTEGER NOT NULL DEFAULT 0,
        seq          INTEGER,
        progress     INTEGER,
        created_by   TEXT,
        story_id     INTEGER,
        linked_to    INTEGER,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Map legacy statuses; pass already-migrated statuses through unchanged so
    // re-running this rebuild (e.g. to widen the priority CHECK) is safe.
    await client.execute(`
      INSERT INTO tasks_new (id, project_id, parent_id, sprint_id, title, description, type, status, priority, severity, story_points, start_date, due_date, labels, position, seq, progress, created_by, story_id, linked_to, created_at)
      SELECT id, project_id, parent_id, sprint_id, title, description,
        COALESCE(type, 'task'),
        CASE status
          WHEN 'todo' THEN 'backlog'
          WHEN 'in_progress' THEN 'dev_in_progress'
          WHEN 'backlog' THEN 'backlog'
          WHEN 'dev_in_progress' THEN 'dev_in_progress'
          WHEN 'dev_done' THEN 'dev_done'
          WHEN 'in_test' THEN 'in_test'
          WHEN 'test_in_progress' THEN 'test_in_progress'
          WHEN 'test_fail' THEN 'test_fail'
          WHEN 'test_done' THEN 'test_done'
          WHEN 'ready_for_deploy' THEN 'ready_for_deploy'
          WHEN 'done' THEN 'done'
          ELSE 'backlog'
        END,
        priority, severity, story_points, start_date, due_date,
        COALESCE(labels, '[]'), position, seq, progress, created_by, story_id, linked_to, created_at
      FROM tasks
    `);
    await client.execute("DROP TABLE tasks");
    await client.execute("ALTER TABLE tasks_new RENAME TO tasks");
    await client.execute("PRAGMA foreign_keys=ON");
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id)"
    );
  }

  // Remap the legacy severity vocabulary (low/medium/high/critical) to the new
  // set (critical/major/minor/low). The severity column has no CHECK, so plain
  // UPDATEs suffice; these are idempotent.
  await client.execute("UPDATE tasks SET severity = 'moderate' WHERE severity IN ('medium','minor')");
  await client.execute("UPDATE tasks SET severity = 'major' WHERE severity = 'high'");

  await migrateRbac();
}

// RBAC migration: relaxes the role CHECK constraints so custom role keys are
// allowed, adds the per-member `active` flag, and backfills the system roles +
// their default permissions for every existing workspace. Idempotent — each
// table rebuild is gated on the live DDL, and seeding uses INSERT OR IGNORE.
async function migrateRbac(): Promise<void> {
  // 1. Rebuild workspace_members to drop the role CHECK and add `active`.
  //    SQLite can't ALTER a CHECK constraint, so the table is rebuilt (same
  //    pattern as the tasks rebuild above).
  const wmDdl = String(
    (
      await client.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='workspace_members'"
      )
    ).rows[0]?.sql ?? ""
  );
  if (wmDdl.includes("CHECK") || !wmDdl.includes("active")) {
    await client.execute("PRAGMA foreign_keys=OFF");
    await client.execute(`
      CREATE TABLE workspace_members_new (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role         TEXT NOT NULL DEFAULT 'assignee',
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, user_id)
      )
    `);
    await client.execute(`
      INSERT INTO workspace_members_new (workspace_id, user_id, role, active, created_at)
      SELECT workspace_id, user_id, role, 1, created_at FROM workspace_members
    `);
    await client.execute("DROP TABLE workspace_members");
    await client.execute(
      "ALTER TABLE workspace_members_new RENAME TO workspace_members"
    );
    await client.execute("PRAGMA foreign_keys=ON");
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id)"
    );
  }

  // 2. Rebuild workspace_invites to the invitation-lifecycle schema: drops the
  //    legacy role CHECK AND adds status/project_access/message/timestamps in a
  //    single rebuild. Gated on the new `status` column so it runs exactly once
  //    (this also supersedes the earlier role-CHECK-only rebuild).
  const wiDdl = String(
    (
      await client.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='workspace_invites'"
      )
    ).rows[0]?.sql ?? ""
  );
  if (!wiDdl.includes("status")) {
    await client.execute("PRAGMA foreign_keys=OFF");
    await client.execute(`
      CREATE TABLE workspace_invites_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email          TEXT NOT NULL,
        role           TEXT NOT NULL DEFAULT 'assignee',
        token_hash     TEXT NOT NULL,
        invited_by     TEXT,
        status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','accepted','expired','cancelled')),
        project_access TEXT NOT NULL DEFAULT '[]',
        message        TEXT,
        expires_at     TEXT NOT NULL,
        accepted_at    TEXT,
        cancelled_at   TEXT,
        updated_at     TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Legacy rows are all pending invitations.
    await client.execute(`
      INSERT INTO workspace_invites_new (id, workspace_id, email, role, token_hash, invited_by, status, expires_at, created_at)
      SELECT id, workspace_id, email, role, token_hash, invited_by, 'pending', expires_at, created_at FROM workspace_invites
    `);
    await client.execute("DROP TABLE workspace_invites");
    await client.execute(
      "ALTER TABLE workspace_invites_new RENAME TO workspace_invites"
    );
    await client.execute("PRAGMA foreign_keys=ON");
  }
  // Ensure the status index exists for both fresh DBs (where the rebuild above
  // is skipped) and migrated ones. Runs only once the status column exists.
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_invites_ws_status ON workspace_invites(workspace_id, status)"
  );

  // 3. Seed the three system roles for every workspace (idempotent on the
  //    UNIQUE(workspace_id, key) constraint).
  await client.execute(
    `INSERT OR IGNORE INTO roles (workspace_id, key, name, description, is_system, active)
     SELECT id, 'admin', 'Admin', 'Full access to everything.', 1, 1 FROM workspaces`
  );
  await client.execute(
    `INSERT OR IGNORE INTO roles (workspace_id, key, name, description, is_system, active)
     SELECT id, 'manager', 'Project Manager', 'Manages assigned projects, tasks, members, and reports.', 1, 1 FROM workspaces`
  );
  await client.execute(
    `INSERT OR IGNORE INTO roles (workspace_id, key, name, description, is_system, active)
     SELECT id, 'assignee', 'Member', 'Views assigned projects and works on assigned tasks.', 1, 1 FROM workspaces`
  );

  // 4. Seed default permissions for each system role across all workspaces
  //    (idempotent on the role_permissions primary key). Done directly against
  //    the client here (not via lib/seed-roles.ts) to avoid a circular import.
  const sysRoles = await client.execute(
    "SELECT id, workspace_id, key FROM roles WHERE is_system = 1"
  );
  for (const r of sysRoles.rows) {
    const key = String((r as Row).key) as "admin" | "manager" | "assignee";
    const grants = DEFAULT_PERMISSIONS[key];
    if (!grants) continue;
    for (const [module, action] of grants) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO role_permissions (role_id, workspace_id, module, action) VALUES (?, ?, ?, ?)`,
        args: [
          Number((r as Row).id),
          String((r as Row).workspace_id),
          module,
          action,
        ],
      });
    }
  }

  await migrateTeamMembers();
}

// Team Member Management migration: adds the per-member last_active_at column,
// the project_members metadata columns, and carries the old `members`-module
// permission grants over to the new `team_member` module. Idempotent.
async function migrateTeamMembers(): Promise<void> {
  // last_active_at on workspace_members.
  const wmInfo = await client.execute("PRAGMA table_info(workspace_members)");
  if (!wmInfo.rows.some((r) => (r as Row).name === "last_active_at")) {
    await client.execute(
      "ALTER TABLE workspace_members ADD COLUMN last_active_at TEXT"
    );
  }

  // project_members metadata (role_id, status, added_by, created_at). ADD COLUMN
  // can't use a non-constant default, so created_at is added nullable then
  // backfilled.
  const pmInfo = await client.execute("PRAGMA table_info(project_members)");
  const pmCols = pmInfo.rows.map((r) => (r as Row).name);
  if (!pmCols.includes("role_id")) {
    await client.execute("ALTER TABLE project_members ADD COLUMN role_id INTEGER");
  }
  if (!pmCols.includes("status")) {
    await client.execute(
      "ALTER TABLE project_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"
    );
  }
  if (!pmCols.includes("added_by")) {
    await client.execute("ALTER TABLE project_members ADD COLUMN added_by TEXT");
  }
  if (!pmCols.includes("created_at")) {
    await client.execute("ALTER TABLE project_members ADD COLUMN created_at TEXT");
    await client.execute(
      "UPDATE project_members SET created_at = datetime('now') WHERE created_at IS NULL"
    );
  }

  // Carry over any existing `members`-module grants to the new `team_member`
  // module so custom roles don't silently lose member-management access.
  // UPDATE OR IGNORE avoids PK collisions if the target row already exists.
  await client.execute(
    "UPDATE OR IGNORE role_permissions SET module = 'team_member', action = 'view' WHERE module = 'members' AND action = 'view'"
  );
  await client.execute(
    "UPDATE OR IGNORE role_permissions SET module = 'team_member', action = 'invite' WHERE module = 'members' AND action = 'invite_member'"
  );
  await client.execute(
    "UPDATE OR IGNORE role_permissions SET module = 'team_member', action = 'remove' WHERE module = 'members' AND action = 'remove_member'"
  );
  await client.execute("DELETE FROM role_permissions WHERE module = 'members'");
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
    ["Design new homepage", "Hero, features, social proof sections.", "dev_in_progress", "high", "2026-06-20"],
    ["Set up analytics", "Add event tracking for key CTAs.", "backlog", "low", null],
    ["Write launch copy", "Headlines and body copy for all sections.", "backlog", "medium", "2026-06-25"],
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
  ProjectStatus,
  Task,
  TaskStatus,
  TaskPriority,
  Sprint,
  SprintStatus,
  CustomField,
  CustomFieldType,
  CustomFieldWithValue,
  Role,
  RoleRow,
  Member,
  PendingInvite,
} from "@/lib/types";
