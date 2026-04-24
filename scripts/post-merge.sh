#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Use migrate (not push) so prod gets atomic, versioned, reviewable schema changes.
# The runner auto-detects "legacy push" databases and seeds the baseline as applied
# without running it — so existing environments keep their data on first switch-over.
pnpm --filter @workspace/db migrate
