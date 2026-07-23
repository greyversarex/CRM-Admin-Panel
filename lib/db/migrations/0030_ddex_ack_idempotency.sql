-- Exact ACK replays must not create duplicate journal rows or repeat state
-- transitions. The column stays nullable so legacy rows require no risky
-- backfill; PostgreSQL unique indexes allow multiple NULL values.
ALTER TABLE "ddex_acknowledgements"
  ADD COLUMN IF NOT EXISTS "payload_hash" text;

CREATE UNIQUE INDEX IF NOT EXISTS "ddex_acks_payload_hash_unique"
  ON "ddex_acknowledgements" ("payload_hash");
