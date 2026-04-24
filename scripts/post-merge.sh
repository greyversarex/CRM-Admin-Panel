#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Use migrate (not push) so prod gets atomic, versioned, reviewable schema changes.
# Migration files are idempotent (CREATE TABLE/INDEX IF NOT EXISTS, FK as
# DO IF NOT EXISTS pg_constraint with NOT VALID + VALIDATE), so this is safe
# against both pristine and previously-pushed databases.
pnpm --filter @workspace/db migrate
