// One-time backfill for the tasks:upload / tasks:download permissions added
// alongside task attachments (lib/permissions.ts). Idempotent — safe to
// re-run. New workspaces don't need this: lib/seed-roles.ts already grants
// the current DEFAULT_PERMISSIONS to every role it creates.
//
// Grants the two new actions to Owner/Admin (who hold every valid action) and
// to Manager/Member, matching where "comment" already sits in
// DEFAULT_PERMISSIONS. Never touches a role's other grants, and never touches
// a custom (non-system) role — those are left for an admin to configure via
// the Roles & Permissions screen, same as any other new permission would be.
//
// Run with:  node scripts/backfill-task-attachment-perms.mjs
import pg from "pg";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set — add it to .env.local first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

// Owner/Admin get every valid action; Manager/Member get the same two
// actions "comment" already has for them.
const ROLES_TO_GRANT = ["owner", "admin", "manager", "assignee"];
const NEW_ACTIONS = ["upload", "download"];

async function main() {
  await client.connect();

  let granted = 0;
  for (const roleKey of ROLES_TO_GRANT) {
    for (const action of NEW_ACTIONS) {
      const { rowCount } = await client.query(
        `INSERT INTO role_permissions (role_id, workspace_id, module, action)
           SELECT id, workspace_id, 'tasks', $2
             FROM roles
            WHERE key = $1 AND is_system = 1
         ON CONFLICT DO NOTHING`,
        [roleKey, action]
      );
      granted += rowCount ?? 0;
    }
  }
  console.log(`permission grants added: ${granted}`);

  const { rows: summary } = await client.query(
    `SELECT role, action, COUNT(*)::int AS n
       FROM (
         SELECT r.key AS role, rp.action
           FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
          WHERE rp.module = 'tasks' AND rp.action IN ('upload','download') AND r.is_system = 1
       ) x
      GROUP BY role, action
      ORDER BY role, action`
  );
  console.table(summary);
}

main()
  .then(async () => {
    await client.end();
    console.log("done");
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await client.end().catch(() => {});
    process.exit(1);
  });
