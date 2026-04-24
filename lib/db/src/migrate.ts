import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import pg from "pg";
import path from "path";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../migrations");

/**
 * Drizzle migrator runner with baseline support.
 *
 * Why baseline: this project initially used `drizzle-kit push` against a live DB
 * (no migration history). When we switch to `drizzle-kit generate` + migrate, the
 * first migration (0000_init.sql) recreates the entire schema. On a brand-new DB
 * that's correct. On the existing dev/prod DB the tables already exist, so we
 * must mark the baseline as "already applied" instead of running it.
 *
 * Logic:
 *   1. Read the journal to know which baseline tag(s) exist.
 *   2. If `drizzle.__drizzle_migrations` is missing AND business tables exist
 *      (i.e. someone ran `push` here before) → seed the migrations table with
 *      the baseline marked as applied, WITHOUT executing the SQL.
 *   3. Then call drizzle's normal migrator. For a virgin DB it runs everything.
 *      For our existing DB it sees the baseline is already applied and applies
 *      only newer migrations (0001+).
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  // Advisory lock = serialise concurrent migrate runs (e.g. blue-green deploys
  // running both replicas at once). 4242042 is an arbitrary 32-bit constant.
  await pool.query(`SELECT pg_advisory_lock(4242042)`);
  try {
    // Step 1: detect "legacy push" state.
    const tablesExistRes = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
       ) AS exists`,
    );
    const businessTablesExist = tablesExistRes.rows[0]?.exists === true;

    const drizzleSchemaRes = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
       ) AS exists`,
    );
    const migrationsTableExists = drizzleSchemaRes.rows[0]?.exists === true;

    if (businessTablesExist && !migrationsTableExists) {
      // Legacy push DB → seed baseline as applied.
      console.log("[migrate] Legacy push DB detected — seeding baseline as applied");

      const journalPath = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
        entries: { idx: number; tag: string; when: number }[];
      };
      const baseline = journal.entries[0];
      if (!baseline) {
        throw new Error("No baseline migration found in _journal.json");
      }

      // Hash matches what drizzle migrator would compute for this SQL file
      const sqlPath = path.join(MIGRATIONS_FOLDER, `${baseline.tag}.sql`);
      const sqlContent = readFileSync(sqlPath, "utf-8");
      const hash = createHash("sha256").update(sqlContent).digest("hex");

      await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `);
      // Idempotent: another concurrent migrator under the same advisory lock would
      // have already inserted the row by the time we run, so guard on hash.
      await pool.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
         SELECT $1, $2
         WHERE NOT EXISTS (
           SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1
         )`,
        [hash, baseline.when],
      );
      console.log(`[migrate] Baseline ${baseline.tag} marked as applied (hash ${hash.slice(0, 8)}…)`);
    }

    // Step 2: run drizzle migrator normally.
    console.log("[migrate] Running drizzle migrator…");
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // Sanity check
    const appliedRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations`,
    );
    console.log(`[migrate] Done. Total applied migrations: ${appliedRes.rows[0]?.count ?? "?"}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
