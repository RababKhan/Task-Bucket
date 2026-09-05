// One-time backfill for the Owner role (idempotent — safe to re-run).
//
//   1. Seeds the `owner` system role + its grants into every existing workspace.
//   2. Promotes each workspace's creator (workspaces.owner_id) to that role.
//
// New workspaces don't need this: lib/seed-roles.ts and lib/workspace.ts
// already handle them. Run with:  node scripts/migrate-owner-role.mjs
import pg from "pg";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set — add it to .env.local first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const OWNER = {
  key: "owner",
  name: "Owner",
  description:
    "Full access to everything, plus deleting the workspace. Held by whoever created it.",
};

async function main() {
  await client.connect();

  const { rows: workspaces } = await client.query(
    `SELECT id, owner_id FROM workspaces`
  );
  console.log(`workspaces: ${workspaces.length}`);

  // 1. Seed the Owner role row.
  for (const ws of workspaces) {
    await client.query(
      `INSERT INTO roles (workspace_id, key, name, description, is_system, active)
       VALUES ($1, $2, $3, $4, 1, 1) ON CONFLICT DO NOTHING`,
      [ws.id, OWNER.key, OWNER.name, OWNER.description]
    );
  }

  // 2. Owner holds every valid permission — mirror whatever Admin has granted.
  const { rowCount: grants } = await client.query(
    `INSERT INTO role_permissions (role_id, workspace_id, module, action)
     SELECT o.id, o.workspace_id, rp.module, rp.action
       FROM roles o
       JOIN roles a
         ON a.workspace_id = o.workspace_id AND a.key = 'admin' AND a.is_system = 1
       JOIN role_permissions rp ON rp.role_id = a.id
      WHERE o.key = 'owner' AND o.is_system = 1
     ON CONFLICT DO NOTHING`
  );
  console.log(`permission grants copied from Admin: ${grants}`);

  // 3. Promote each workspace creator.
  const { rowCount: promoted } = await client.query(
    `UPDATE workspace_members wm
        SET role = 'owner'
       FROM workspaces w
      WHERE w.id = wm.workspace_id
        AND wm.user_id = w.owner_id
        AND wm.role <> 'owner'`
  );
  console.log(`members promoted to Owner: ${promoted}`);

  const { rows: summary } = await client.query(
    `SELECT role, COUNT(*)::int AS n FROM workspace_members GROUP BY role ORDER BY role`
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
