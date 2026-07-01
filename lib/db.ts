import { Pool, types } from "pg";

// node-postgres over TCP to a local Postgres instance.
//   - Set DATABASE_URL, e.g. postgresql://postgres:postgres@localhost:5432/task_bucket
// Schema is applied out-of-band via `npm run db:push` + `npm run db:setup`
// (drizzle-kit + the compat shims), NOT on each request.
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  throw new Error(
    "DATABASE_URL is not set — add your local Postgres connection string to .env.local"
  );
}

// SQLite returned COUNT()/SUM() as JS numbers; node-postgres returns bigint(20)
// and numeric(1700) as strings. Coerce them back to numbers so every
// `Number(row.n)`-free comparison (e.g. `count.n === 1`) keeps working.
// (Counts are well within 2^53, so precision is not a concern here.)
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

// Reuse one pool across hot reloads in dev so we don't leak connections.
declare global {
  // eslint-disable-next-line no-var
  var __pmPool: Pool | undefined;
}
const pool = globalThis.__pmPool ?? new Pool({ connectionString: url });
if (process.env.NODE_ENV !== "production") globalThis.__pmPool = pool;

// The whole app writes SQLite-style `?` placeholders; rewrite them to Postgres
// `$1, $2, …` positionally. (No SQL string in this codebase contains a literal
// `?` outside of a bound parameter, so a straight count is safe.)
function toPg(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

type Args = ReadonlyArray<unknown>;

export async function dbGet<T = Record<string, unknown>>(
  text: string,
  args: Args = []
): Promise<T | undefined> {
  const res = await pool.query(toPg(text), args as unknown[]);
  return res.rows[0] as T | undefined;
}

export async function dbAll<T = Record<string, unknown>>(
  text: string,
  args: Args = []
): Promise<T[]> {
  const res = await pool.query(toPg(text), args as unknown[]);
  return res.rows as T[];
}

export async function dbRun(
  text: string,
  args: Args = []
): Promise<{ rowsAffected: number }> {
  const res = await pool.query(toPg(text), args as unknown[]);
  return { rowsAffected: res.rowCount ?? 0 };
}

// INSERT helper that returns the new row's `id` (Postgres has no
// lastInsertRowid; we append RETURNING id). Use only for tables with an `id`
// serial column where the caller needs the new id.
export async function dbInsert(
  text: string,
  args: Args = []
): Promise<number> {
  const res = await pool.query(`${toPg(text)} RETURNING id`, args as unknown[]);
  return Number((res.rows[0] as { id?: number } | undefined)?.id ?? 0);
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
