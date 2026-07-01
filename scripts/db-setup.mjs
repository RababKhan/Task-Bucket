// One-time Postgres setup: installs the SQLite-compatibility shims used by the
// app's raw SQL, then seeds the sample project if the DB is empty.
// Run AFTER `npm run db:push` (which creates the tables):  npm run db:setup
import pg from "pg";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set — add it to .env.local first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();

  // 1. `COLLATE NOCASE` → a case-insensitive (nondeterministic) ICU collation.
  await client.query(`DO $$ BEGIN
    CREATE COLLATION nocase (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

  // 2. `datetime('now')` → UTC 'YYYY-MM-DD HH:MM:SS' text (matches SQLite).
  await client.query(`CREATE OR REPLACE FUNCTION datetime(text) RETURNS text AS $f$
    SELECT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS');
  $f$ LANGUAGE sql STABLE;`);

  // 3. `group_concat(x)` → comma-joined; `group_concat(x, sep)` → custom
  //    separator. Both SQLite forms are used in the app.
  await client.query(`CREATE OR REPLACE FUNCTION _gc_sfunc(acc text, val text) RETURNS text AS $f$
    SELECT CASE WHEN acc IS NULL THEN val WHEN val IS NULL THEN acc ELSE acc || ',' || val END;
  $f$ LANGUAGE sql IMMUTABLE;`);
  await client.query(`DROP AGGREGATE IF EXISTS group_concat(text);`);
  await client.query(`CREATE AGGREGATE group_concat(text) (SFUNC = _gc_sfunc, STYPE = text);`);

  await client.query(`CREATE OR REPLACE FUNCTION _gc_sfunc2(acc text, val text, sep text) RETURNS text AS $f$
    SELECT CASE WHEN acc IS NULL THEN val WHEN val IS NULL THEN acc ELSE acc || sep || val END;
  $f$ LANGUAGE sql IMMUTABLE;`);
  await client.query(`DROP AGGREGATE IF EXISTS group_concat(text, text);`);
  await client.query(`CREATE AGGREGATE group_concat(text, text) (SFUNC = _gc_sfunc2, STYPE = text);`);

  console.log("✓ compatibility shims installed");

  // 4. Seed an unowned sample project (claimed by the first workspace on signup).
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM projects`);
  if (rows[0].n > 0) {
    console.log("• projects already exist — skipping seed");
    return;
  }

  const proj = await client.query(
    `INSERT INTO projects (name, description)
     VALUES ('Website Redesign', 'Revamp the marketing site for the Q3 launch.')
     RETURNING id`
  );
  const projectId = proj.rows[0].id;

  const tasks = [
    ["Audit current pages", "List all pages and flag outdated content.", "done", "medium", null],
    ["Design new homepage", "Hero, features, social proof sections.", "dev_in_progress", "high", "2026-06-20"],
    ["Set up analytics", "Add event tracking for key CTAs.", "backlog", "low", null],
    ["Write launch copy", "Headlines and body copy for all sections.", "backlog", "medium", "2026-06-25"],
  ];
  for (let i = 0; i < tasks.length; i++) {
    const [title, description, status, priority, due] = tasks[i];
    await client.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, due_date, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [projectId, title, description, status, priority, due, i]
    );
  }
  console.log("✓ seeded sample project");
}

main()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await client.end().catch(() => {});
    process.exit(1);
  });
