// Owner CLI for manual (bank-transfer) billing.
//
//   npm run billing -- list                     list workspaces + plans
//   npm run billing -- requests                 show pending upgrade requests
//   npm run billing -- activate <subdomain> [--interval month|year] [--months N] [--note "INV-123"]
//   npm run billing -- deactivate <subdomain>
//
// Activation with no --months/--interval is perpetual (no expiry). --interval
// year => 12 months, month => 1 month; --months overrides.
import pg from "pg";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const [, , cmd, ...rest] = process.argv;

function flag(name) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}
function nowText() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function plusMonths(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

async function main() {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    if (cmd === "list") {
      const { rows } = await c.query(`
        SELECT w.subdomain, w.name,
               COALESCE(s.plan,'free') AS plan,
               COALESCE(s.status,'active') AS status,
               s.current_period_end,
               (SELECT COUNT(*)::int FROM projects p WHERE p.workspace_id = w.id) AS projects,
               (SELECT COUNT(*)::int FROM workspace_members m WHERE m.workspace_id = w.id AND m.active = 1) AS members
        FROM workspaces w
        LEFT JOIN subscriptions s ON s.workspace_id = w.id
        ORDER BY w.created_at`);
      console.table(rows);
      return;
    }

    if (cmd === "requests") {
      const { rows } = await c.query(`
        SELECT r.id, w.subdomain, r.interval, r.status, r.created_at
        FROM billing_requests r JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at`);
      if (!rows.length) console.log("No pending upgrade requests.");
      else console.table(rows);
      return;
    }

    const subdomain = rest[0];
    if ((cmd === "activate" || cmd === "deactivate") && !subdomain) {
      console.error(`Usage: npm run billing -- ${cmd} <subdomain>`);
      process.exit(1);
    }
    const ws = subdomain
      ? (await c.query("SELECT id FROM workspaces WHERE subdomain = $1", [subdomain])).rows[0]
      : null;
    if (subdomain && !ws) {
      console.error(`No workspace with subdomain "${subdomain}".`);
      process.exit(1);
    }

    if (cmd === "activate") {
      const interval = flag("interval") === "year" ? "year" : flag("interval") === "month" ? "month" : null;
      const months = flag("months")
        ? Number(flag("months"))
        : interval === "year"
          ? 12
          : interval === "month"
            ? 1
            : null;
      const expiry = months ? plusMonths(months) : null;
      const note = flag("note") ?? null;
      await c.query(
        `INSERT INTO subscriptions
           (workspace_id, plan, status, interval, current_period_end, note, activated_by, updated_at)
         VALUES ($1,'pro','active',$2,$3,$4,'owner-cli',$5)
         ON CONFLICT (workspace_id) DO UPDATE SET
           plan='pro', status='active', interval=$2, current_period_end=$3,
           note=$4, activated_by='owner-cli', updated_at=$5`,
        [ws.id, interval, expiry, note, nowText()]
      );
      await c.query(
        "UPDATE billing_requests SET status='resolved', resolved_at=$2 WHERE workspace_id=$1 AND status='pending'",
        [ws.id, nowText()]
      );
      console.log(
        `✓ Activated Pro for "${subdomain}"${expiry ? ` until ${expiry}` : " (no expiry)"}${note ? ` [${note}]` : ""}.`
      );
      return;
    }

    if (cmd === "deactivate") {
      await c.query(
        `INSERT INTO subscriptions (workspace_id, plan, status, updated_at)
         VALUES ($1,'free','free',$2)
         ON CONFLICT (workspace_id) DO UPDATE SET
           plan='free', status='free', current_period_end=NULL, updated_at=$2`,
        [ws.id, nowText()]
      );
      console.log(`✓ Deactivated Pro for "${subdomain}" (back to Free).`);
      return;
    }

    console.log(
      "Usage:\n" +
        "  npm run billing -- list\n" +
        "  npm run billing -- requests\n" +
        "  npm run billing -- activate <subdomain> [--interval month|year] [--months N] [--note INV-123]\n" +
        "  npm run billing -- deactivate <subdomain>"
    );
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
