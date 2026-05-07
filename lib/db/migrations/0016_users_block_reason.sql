-- Drift fix: schema has users.blockReason but no migration created the column.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "block_reason" text;
