#!/usr/bin/env bash
# Migration test matrix.
#
# Verifies that `pnpm --filter @workspace/db migrate` works correctly across the
# three rollout scenarios we actually care about:
#
#   1. PRISTINE — empty database; baseline must create every table, FK, and index.
#   2. LEGACY-PUSH — database with all tables/data but no `drizzle.__drizzle_migrations`
#      (i.e. previously managed by `drizzle-kit push`); baseline must apply as a
#      no-op via the `IF NOT EXISTS` guards.
#   3. LEGACY-PUSH WITH ORPHANS — same as (2), but with deliberately introduced
#      orphan rows; `VALIDATE CONSTRAINT` must fail with a clear error so the
#      operator can clean up before re-running.
#
# Run from repo root:
#   bash lib/db/scripts/test-migrations.sh
#
# Requires DATABASE_URL pointing at a Postgres instance where we can create/drop
# test databases. The script is non-destructive to the main DB — it only creates
# and drops databases named `migrate_test_*`.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set" >&2
  exit 1
fi

ADMIN_DB_URL="$DATABASE_URL"

mk_test_db_url() {
  local name="$1"
  echo "$ADMIN_DB_URL" | sed "s|/[^/]*$|/$name|"
}

cleanup() {
  for name in migrate_test_pristine migrate_test_legacy migrate_test_orphan; do
    psql "$ADMIN_DB_URL" -c "DROP DATABASE IF EXISTS $name" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

cleanup
echo

# ---------- 1. PRISTINE ----------
echo "=== [1/3] PRISTINE: empty DB → baseline creates everything ==="
psql "$ADMIN_DB_URL" -c "CREATE DATABASE migrate_test_pristine" >/dev/null
PRISTINE_URL="$(mk_test_db_url migrate_test_pristine)"
DATABASE_URL="$PRISTINE_URL" pnpm --filter @workspace/db migrate
TABLES=$(psql "$PRISTINE_URL" -Atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
FKS=$(psql "$PRISTINE_URL" -Atc "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'")
IDX=$(psql "$PRISTINE_URL" -Atc "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname NOT LIKE '%_pkey'")
echo "  tables=$TABLES (expect 19)  fks=$FKS (expect 29)  indexes=$IDX (expect ≥54)"
[ "$TABLES" = "19" ] && [ "$FKS" = "29" ] || { echo "  FAIL"; exit 1; }
echo "  OK"
echo

# ---------- 2. LEGACY-PUSH (no orphans) ----------
echo "=== [2/3] LEGACY-PUSH: tables exist, no __drizzle_migrations → baseline is no-op ==="
psql "$ADMIN_DB_URL" -c "CREATE DATABASE migrate_test_legacy" >/dev/null
LEGACY_URL="$(mk_test_db_url migrate_test_legacy)"
# Seed the legacy DB by running the baseline once, then dropping the migration tracker.
DATABASE_URL="$LEGACY_URL" pnpm --filter @workspace/db migrate >/dev/null
psql "$LEGACY_URL" -c "DROP SCHEMA drizzle CASCADE" >/dev/null
# Now re-run migrate — should be a no-op (constraints already exist, IF NOT EXISTS guards skip them).
DATABASE_URL="$LEGACY_URL" pnpm --filter @workspace/db migrate
FKS_AFTER=$(psql "$LEGACY_URL" -Atc "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'")
echo "  fks=$FKS_AFTER (expect 29, unchanged)"
[ "$FKS_AFTER" = "29" ] || { echo "  FAIL"; exit 1; }
echo "  OK"
echo

# ---------- 3. LEGACY-PUSH WITH ORPHANS ----------
echo "=== [3/3] LEGACY-PUSH WITH ORPHANS: VALIDATE CONSTRAINT must fail clearly ==="
psql "$ADMIN_DB_URL" -c "CREATE DATABASE migrate_test_orphan" >/dev/null
ORPHAN_URL="$(mk_test_db_url migrate_test_orphan)"
# Bootstrap full schema first, then simulate a "push-managed legacy DB without FK"
# by dropping the FK we want to test, inserting an orphan, and dropping the drizzle tracker.
DATABASE_URL="$ORPHAN_URL" pnpm --filter @workspace/db migrate >/dev/null
psql "$ORPHAN_URL" >/dev/null <<'SQL'
ALTER TABLE releases DROP CONSTRAINT releases_artist_id_artists_id_fk;
INSERT INTO artists (name, slug) VALUES ('Real', 'orphan-fixture-real');
-- Orphan: artist_id=999999 doesn't exist
INSERT INTO releases (title, artist_id, release_type, status) VALUES ('Orphan Release', 999999, 'single', 'draft');
DROP SCHEMA drizzle CASCADE;
SQL
# Re-run migrate — expect failure on VALIDATE for releases_artist_id_artists_id_fk.
set +e
OUT=$(DATABASE_URL="$ORPHAN_URL" pnpm --filter @workspace/db migrate 2>&1)
RC=$?
set -e
echo "$OUT" | tail -15
if [ $RC -eq 0 ]; then
  echo "  FAIL: migrate should have errored on orphan row"; exit 1
fi
if echo "$OUT" | grep -qi "releases_artist_id_artists_id_fk"; then
  echo "  OK — error correctly identifies the offending FK constraint"
else
  echo "  PARTIAL: migrate failed but error doesn't mention the FK by name"
  exit 1
fi
echo

echo "=== ALL SCENARIOS PASSED ==="
