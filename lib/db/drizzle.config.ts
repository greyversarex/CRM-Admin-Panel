import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Paths are relative to the package directory (lib/db) — drizzle-kit needs
// relative paths to correctly resolve `out` when reading the meta/_journal.json
// during `generate`. Always invoke via `pnpm --filter @workspace/db ...` from
// any directory; pnpm cd's into lib/db before running the command.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
