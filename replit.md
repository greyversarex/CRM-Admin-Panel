# Tajik Music Distribution CRM

## Overview

A comprehensive Music Distribution CRM and Admin Panel for a Tajik music label. Full-stack application with catalog management, CRM, analytics, financial management, DDEX delivery, and publishing rights management.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Wouter + Tailwind CSS + shadcn/ui
- **Charts**: Recharts
- **Forms**: react-hook-form + zod

## Artifacts

- `artifacts/api-server` — Express 5 API server (port 8080, served at `/api`)
- `artifacts/crm-panel` — React + Vite frontend (previewPath `/`)

## Production deployment

Прод живёт **не на Replit** — на VPS (Таймвеб, далее возможен AWS). Replit = только разработка.
Деплой-обвязка лежит в `deploy/` и `Dockerfile` / `docker-compose.yml` в корне.

Два пути (см. `deploy/README.md`):
- **Ubuntu + pm2 + nginx** — `bash deploy/1_setup.sh` (один раз) → `bash deploy/2_deploy.sh` (каждый деплой).
  `2_deploy.sh` сам делает `pnpm install --frozen-lockfile`, `drizzle-kit push`, билд API/фронта, `pm2 startOrReload --update-env`.
  Первый запуск с `SEED=1` для засева тестовых данных.
- **Docker Compose** — `docker compose up -d --build`, миграции через `docker compose exec api pnpm --filter @workspace/db run push`.

Все секреты живут в `/var/www/tajikmusic/.env` (или корневом `.env` в случае docker), шаблон — `deploy/.env.example`.
Никаких Replit-специфичных импортов в боевом коде нет; vite-плагины Replit подключаются только при `NODE_ENV !== "production" && REPL_ID !== undefined`.
Cookie сессий: `secure: true` в production, `sameSite: lax`. Express trust-proxy=1, чтобы за nginx работал HTTPS.

## Auth & Data Scoping (Phase 1.1 + 1.2)

- Real session auth: `express-session` + `connect-pg-simple`, bcrypt password hashes, session ID regen on login.
- Roles: `admin`, `manager` — full access. `label` — scoped by `users.labelId`. `artist` — scoped by `users.artistId`.
- Helpers in `artifacts/api-server/src/lib/auth.ts`:
  - `requireAuth`, `requireRole(...roles)`
  - `getDataScope(req) → { fullAccess, role, artistId, labelId }`
  - `resolveScopeFilter(table, scope, { artistCol, labelCol })` — returns Drizzle SQL fragment or `false` for "no rows".
- Admin/manager-only routers (mounted in `routes/index.ts` behind `requireRole("admin","manager")`): `/labels`, `/users`, `/contacts`, `/crm`, `/splits`, `/publishing`, `/analytics`, `/deliveries`, `/integrations`.
- All read endpoints in `artists`, `releases`, `tracks`, `finance`, `royalties`, `dashboard` apply scope filters server-side; mutations include pre-flight scope checks. For non-privileged users, `query.artist_id` / `label_id` overrides are ignored.
- Test users (seeded): `admin@tajikmusic.com / admin123`, `manager@tajikmusic.com / manager123`, `label@tajikmusic.com / label123` (labelId=1), `artist@tajikmusic.com / artist123` (artistId=1).
- Known gaps: activity log has no entity-scope columns → `/dashboard/recent-activity` returns `[]` for non-admin/manager. CSRF deferred (sameSite=lax used).

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run seed` — seed the database with sample data
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Schema (14 tables)

- `labels` — record labels with parent/sub-label hierarchy
- `artists` — artists with genre, label, social links
- `releases` — albums/singles/EPs with UPC, DDEX metadata
- `tracks` — individual tracks with ISRC, composer credits
- `users` — system users with roles (admin/label/artist/manager)
- `contacts` — CRM contacts (artists/managers/partners/labels)
- `crm_tasks` — CRM task management with priorities
- `transactions` — financial ledger (DSP revenue/publishing/payouts)
- `splits` — revenue split definitions with percentage validation
- `payouts` — payout requests with approval workflow
- `publishing_works` — publishing rights (ASCAP/BMI/Songtrust/The MLC)
- `usage_reports` — streaming usage reports by platform
- `deliveries` — DDEX delivery queue to DSP platforms
- `activity_log` — system activity tracking

## API Routes

- `GET/POST /api/dashboard/*` — dashboard summary, activity, top artists, revenue, release status
- `GET/POST/PUT/DELETE /api/artists/*` — artist CRUD + stats
- `GET/POST/PUT/DELETE /api/labels/*` — label CRUD
- `GET/POST/PUT/DELETE/PATCH /api/releases/*` — release CRUD + status changes + UPC import
- `GET/POST/PUT/DELETE /api/tracks/*` — track CRUD
- `GET/POST/PUT/DELETE /api/users/*` — user management
- `GET/POST/PUT/DELETE /api/crm/contacts/*` — CRM contacts
- `GET/POST/PUT/DELETE /api/crm/tasks/*` — CRM tasks
- `GET/POST /api/finance/transactions` — transaction ledger
- `GET /api/finance/balances` — artist/label balances
- `GET/POST/PATCH /api/payouts/*` — payout management with approve/reject (filterable by artist_id/label_id/status)
- `GET /api/royalties/summary|statements|by-release|by-dsp` — user-facing royalty aggregates (entity-scoped)
- `GET /api/royalties/statements/:period/download?format=pdf|csv` — statement download
- `GET/POST/PUT/DELETE /api/splits/*` — revenue splits
- `GET/POST/PUT /api/publishing/works/*` — publishing rights
- `GET /api/analytics/*` — streams, platform breakdown, geography
- `GET/POST/GET /api/delivery/*` — DDEX delivery queue

## Frontend Pages (16 pages)

- `/` — Dashboard with KPIs, revenue chart, top artists, recent activity
- `/catalog` — Music catalog browse (releases + tracks)
- `/releases` — Release management with status badges and delivery triggers
- `/releases/:id` — Release detail with tracks, metadata
- `/artists` — Artist roster management
- `/artists/:id` — Artist profile with stats
- `/labels` — Label management
- `/crm` — CRM: contacts + tasks board
- `/royalties` — User-facing royalty hub (6 tabs: summary, statements PDF/CSV, by release, by DSP, request payment, history)
- `/finance` — Admin financial overview: transaction ledger + artist balances
- `/splits` — Revenue split management with visual distribution bars
- `/payouts` — Admin payout requests with approve/reject workflow
- `/publishing` — Publishing works with ASCAP/BMI/Songtrust badges
- `/analytics` — Streams, platform breakdown, geography analytics
- `/delivery` — DDEX delivery queue
- `/users` — User management with roles
- `/settings` — Settings placeholder

## Theme

Dark navy/slate background with electric indigo (#6366f1) accent. Dense, professional admin cockpit aesthetic designed for music industry professionals.
