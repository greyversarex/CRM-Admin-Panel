import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../migrations");

/**
 * Drizzle migrator runner.
 *
 * Migration files are written to be idempotent:
 *   - `CREATE TABLE IF NOT EXISTS`
 *   - `CREATE INDEX IF NOT EXISTS`
 *   - FK constraints wrapped in `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_constraint
 *     WHERE conname = '…') THEN ALTER TABLE … ADD CONSTRAINT … NOT VALID; ALTER
 *     TABLE … VALIDATE CONSTRAINT …; END IF; END $$;`
 *
 * Why NOT VALID + VALIDATE: on a legacy database that previously used
 * `drizzle-kit push` (no FKs enforced), there might be orphan child rows. A plain
 * `ADD CONSTRAINT FOREIGN KEY` would fail the entire migration on the first
 * orphan. With `NOT VALID`, the constraint is added (and immediately enforces
 * NEW writes), then `VALIDATE CONSTRAINT` checks existing rows. If there are
 * orphans, only VALIDATE fails — with a clear error pointing to the offending
 * constraint — and the operator can clean up data and re-run.
 *
 * This makes the same migration safe against pristine, previously-pushed, and
 * already-migrated databases. Tested matrix: see `lib/db/scripts/test-migrations.sh`.
 *
 * The advisory lock serialises concurrent migrate runs (e.g. blue-green deploys
 * launching two replicas at once). 4242042 is an arbitrary 32-bit constant.
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  await pool.query(`SELECT pg_advisory_lock(4242042)`);
  try {
    console.log("[migrate] Running drizzle migrator…");
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const appliedRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations`,
    );
    console.log(`[migrate] Done. Total applied migrations: ${appliedRes.rows[0]?.count ?? "?"}`);
  } finally {
    await pool.query(`SELECT pg_advisory_unlock(4242042)`);
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
