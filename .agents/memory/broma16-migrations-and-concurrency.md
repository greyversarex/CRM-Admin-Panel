---
name: lib/db migrations + runtime concurrency guards
description: How lib/db migrations are applied, and when to use advisory locks instead of new schema constraints.
---

# lib/db migrations are journal-tracked (not re-run idempotently)

`lib/db/src/migrate.ts` uses the standard drizzle `migrate()` (node-postgres),
applying files from `lib/db/migrations/` tracked via `drizzle.__drizzle_migrations`
+ `meta/_journal.json`. The SQL is hand-written to be *self*-idempotent
(`CREATE TABLE/INDEX IF NOT EXISTS`, FK via `NOT VALID` + `VALIDATE`), but each
file runs **once** per DB (journal hash), not on every boot.

**How to apply:** You cannot just drop a new `.sql` into `migrations/` — drizzle
will not pick it up unless the journal/meta is consistent. Adding a real schema
change post-deploy means a properly-sequenced new migration file.

# Prefer a Postgres advisory lock over a new constraint for runtime races

When the only goal is to serialize concurrent writes at runtime (e.g. a
check-then-insert race that could create duplicate rows), use a transactional
advisory lock instead of adding a partial unique index:

```ts
db.transaction(async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(<ns>, ${key})`);
  // ... check-then-insert; lock auto-releases at tx end
});
```

**Why:** avoids migration churn / journal risk for a guard that doesn't need a
persisted constraint. Used for the Broma16 push-enqueue (one active job per
release) and an in-process promise-chain mutex serializes statistics ingestion
(cron + manual sync write the same usage table).

**How to apply:** reach for advisory locks / in-process mutex for "don't run two
of these at once"; reserve new migrations for durable schema/constraint changes.
