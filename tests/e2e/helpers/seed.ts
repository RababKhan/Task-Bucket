import { Client } from "pg";
import { scryptSync, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_PERMISSIONS } from "../../../lib/permissions";
import { USERS, WS, PROJECTS, PASSWORD } from "../fixtures";

// Mirror lib/auth-db.ts hashPassword (scrypt, salt:hash) so seeded users can
// log in through the real credentials flow.
function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

const ROLE_META: Record<string, { name: string; description: string }> = {
  admin: { name: "Admin", description: "Full access to everything." },
  manager: {
    name: "Project Manager",
    description: "Manages assigned projects, tasks, members, and reports.",
  },
  assignee: {
    name: "Member",
    description: "Views assigned projects and works on assigned tasks.",
  },
};

const ALL_TABLES = [
  "comment_reactions", "comment_attachments", "task_comments", "task_activity",
  "custom_field_values", "custom_fields", "task_assignees", "tasks", "sprints",
  "project_members", "projects", "role_permissions", "roles",
  "workspace_invites", "workspace_members", "workspaces",
  "oauth_accounts", "password_reset_tokens", "password_otps", "signup_otps",
  "users",
];

export type SeedData = {
  users: Record<string, string>; // role key -> user id
  workspaces: Record<string, string>; // ws key -> workspace id
  projects: Record<string, number>; // project key -> project id
};

export async function resetAndSeed(): Promise<SeedData> {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const q = (sql: string, args: unknown[] = []) => client.query(sql, args);

  try {
    await q(`TRUNCATE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    const userIds: Record<string, string> = {};
    const wsIds: Record<string, string> = {};
    const projectIds: Record<string, number> = {};

    // 1. Users
    for (const [key, u] of Object.entries(USERS)) {
      const id = randomUUID();
      userIds[key] = id;
      await q(
        "INSERT INTO users (id, name, email, password_hash, email_verified) VALUES ($1,$2,$3,$4, now())",
        [id, u.name, u.email, hashPassword(PASSWORD)]
      );
    }

    // 2. Workspaces (owned by their owner user)
    const owners: Record<string, string> = {};
    for (const [key, u] of Object.entries(USERS)) if (u.owner) owners[u.ws] = key;
    for (const [key, w] of Object.entries(WS)) {
      const id = randomUUID();
      wsIds[key] = id;
      await q(
        "INSERT INTO workspaces (id, owner_id, name, subdomain) VALUES ($1,$2,$3,$4)",
        [id, userIds[owners[key]], w.name, w.subdomain]
      );
    }

    // Put both test workspaces on Pro so plan limits don't interfere with the
    // functional specs (limit enforcement can be tested separately).
    for (const wsId of Object.values(wsIds)) {
      await q(
        "INSERT INTO subscriptions (workspace_id, plan, status) VALUES ($1,'pro','active') ON CONFLICT DO NOTHING",
        [wsId]
      );
    }

    // 3. Memberships
    for (const [key, u] of Object.entries(USERS)) {
      await q(
        "INSERT INTO workspace_members (workspace_id, user_id, role, active) VALUES ($1,$2,$3,1)",
        [wsIds[u.ws], userIds[key], u.role]
      );
    }

    // 4. System roles + default permissions per workspace
    for (const wsKey of Object.keys(WS)) {
      const wsId = wsIds[wsKey];
      for (const roleKey of ["admin", "manager", "assignee"] as const) {
        const meta = ROLE_META[roleKey];
        const { rows } = await q(
          `INSERT INTO roles (workspace_id, key, name, description, is_system, active)
           VALUES ($1,$2,$3,$4,1,1) RETURNING id`,
          [wsId, roleKey, meta.name, meta.description]
        );
        const roleId = rows[0].id;
        const grants = DEFAULT_PERMISSIONS[roleKey] ?? [];
        for (const [module, action] of grants) {
          await q(
            `INSERT INTO role_permissions (role_id, workspace_id, module, action)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [roleId, wsId, module, action]
          );
        }
      }
    }

    // 5. Projects
    for (const [key, p] of Object.entries(PROJECTS)) {
      const owner = owners[p.ws];
      const { rows } = await q(
        `INSERT INTO projects (owner_id, workspace_id, name, status)
         VALUES ($1,$2,$3,'on_track') RETURNING id`,
        [userIds[owner], wsIds[p.ws], p.name]
      );
      projectIds[key] = rows[0].id;
    }

    // 6. Scope the member to Alpha only (assignee sees just assigned projects)
    await q(
      `INSERT INTO project_members (project_id, user_id, status, created_at)
       VALUES ($1,$2,'active', now()) ON CONFLICT DO NOTHING`,
      [projectIds.alpha, userIds.member]
    );

    // 7. A couple of tasks in Alpha so detail/nav/comment specs have data.
    const alphaTasks: Array<[string, string, string]> = [
      ["Design homepage", "backlog", "high"],
      ["Write launch copy", "dev_in_progress", "medium"],
    ];
    for (let i = 0; i < alphaTasks.length; i++) {
      const [title, status, priority] = alphaTasks[i];
      await q(
        `INSERT INTO tasks (project_id, title, status, priority, position, seq, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [projectIds.alpha, title, status, priority, i, i + 1, userIds.admin]
      );
    }
    await q("UPDATE projects SET task_seq = $1 WHERE id = $2", [
      alphaTasks.length,
      projectIds.alpha,
    ]);

    const data: SeedData = {
      users: userIds,
      workspaces: wsIds,
      projects: projectIds,
    };
    mkdirSync("tests/e2e/.auth", { recursive: true });
    writeFileSync("tests/e2e/.auth/seed.json", JSON.stringify(data, null, 2));
    return data;
  } finally {
    await client.end();
  }
}
