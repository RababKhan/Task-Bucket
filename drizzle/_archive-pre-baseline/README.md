# Archived migrations — do not apply

These are the migration files from before the Postgres baseline. They are kept
for reference only.

They were generated while the schema was still moving and were never tracked in
any database's migrations journal, so by the time the app ran on Postgres the
files and the real schema had drifted apart. Rather than hand-reconcile them,
the schema was captured as a single baseline.

**The migrations that actually run live in `drizzle/`**, starting at
`0000_baseline.sql`. Nothing in this folder is referenced by
`drizzle/meta/_journal.json`, and `drizzle-kit migrate` ignores it.

Applying these against a real database will fail or corrupt the schema.
