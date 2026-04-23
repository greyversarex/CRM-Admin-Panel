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

## Security baseline

- `helmet()` подключён в `app.ts` — отдаёт X-Frame-Options=SAMEORIGIN, X-Content-Type-Options=nosniff, HSTS, Referrer-Policy и пр. CSP/COEP отключены (SPA тянет ассеты из многих источников; CSP сделаем отдельным заходом).
- `express-rate-limit` на `POST /auth/login`: 10 попыток/5 мин (prod) или 100 (dev), `skipSuccessfulRequests:true` чтобы успешный логин не жрал лимит. IP читается через `trust proxy=1` за nginx.
- На проде API должен слушать только за nginx (UFW в `1_setup.sh` блокирует все порты кроме SSH/Nginx) — иначе rate-limit обходится через прямые запросы с подменой `X-Forwarded-For`.

## CRM page (контакты + задачи)

`pages/crm/index.tsx` полностью на реальном API:
- Источники: `GET /api/crm/contacts`, `GET /api/crm/tasks`, `GET /api/users` (для дропдауна «Ответственный»). Все эндпоинты `/crm/*` и `/users` доступны только `admin/manager` (guard в `routes/index.ts`).
- Создание/редактирование/удаление контактов и задач — через `Dialog` + `AlertDialog`, реальные `POST/PUT/DELETE`. Все CRUD протестированы curl'ом + права (`artist → 403`).
- Toggle статуса задачи (todo↔done) — оптимистичный апдейт **с per-task lock** (`pendingTaskIds`) и реконсиляцией от ответа сервера, чтобы не было «потерянных апдейтов» при двойном клике или out-of-order ответах.
- Фронт-гейт: `useEffect` ждёт `authLoading` и `isAdmin`, иначе не делает fetch (не плодит 403 + тосты для не-админов). Не-админу показывается «доступно только админам/менеджерам».
- Telegram-ссылки прогоняются через `safeTelegramHref()` — принимаем только `@username`, чистый username, или `https://t.me|telegram.me/...`. Иначе ссылка не рендерится. Защита от хранимого open-redirect/фишинга.
- Все icon-only кнопки имеют `aria-label`; экшены раскрываются по `group-hover` **и** `group-focus-within` (доступны с клавиатуры). Anchor-кнопки сделаны через `<Button asChild>`, чтобы не было невалидного `<a><button>`.
- Вкладку «Заметки» из старого мока убрал — таблицы для заметок нет, есть только поле `notes` на контакте.

## Profile / Self-service users API

Колонки в таблице `users`, добавленные для страницы `/profile`:
`phone, address, country, region, city, zip_code, about, dsp_profiles (jsonb), social_links (jsonb)`.

Self-service эндпоинты (НЕ требуют admin):
- `GET  /api/auth/me`             — возвращает полный профиль (берётся из БД, не из сессии). Заодно ре-синкает `req.session.user.role/name/scope` из БД и завершает сессию, если статус ≠ active.
- `PATCH /api/users/me`           — апдейт собственных полей. **Whitelist** через `UpdateMyProfileBody` (`.strict()` + `.strict()` на nested `dspProfiles`/`socialLinks`). НЕЛЬЗЯ изменить: `role, status, email, artistId, labelId, passwordHash`.
- `POST /api/auth/change-password` — `currentPassword` + `newPassword` (≥8 символов), bcrypt-проверка текущего, ratelimit 5/15мин (prod).

Админские user-эндпоинты (`GET /users`, `POST /users`, `GET/PUT/DELETE /users/:id`) защищены **per-route** middleware `adminOnly = requireRole("admin","manager")` внутри `routes/users.ts`. Глобальный `router.use("/users", adminOnly)` в `routes/index.ts` снят, чтобы `/users/me` был доступен всем аутентифицированным.

`formatUser()` всегда вырезает `passwordHash` через деструктуризацию — он не уйдёт ни в одном /users-ответе. `/auth/me` и `/auth/login` используют отдельный `buildProfilePayload()`, тоже без хеша.

Таблица `session` (от `connect-pg-simple`) явно описана в `lib/db/src/schema/sessions.ts`, чтобы `drizzle-kit push` не пытался её снести при следующих миграциях.

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
- `/publishing` — DB-backed publishing works (admin/manager only). CRUD via `/api/publishing/works` (POST/PUT, no DELETE — works are IP). Editor dialog with dynamic writers list (name/role/share/CAE-IPI), share-sum-100% validation, ASCAP/BMI/Songtrust toggles, territory list. Server-side `validateWriters()` enforces share bounds 0–100, no duplicates by `(name, caeIpi)`, sum=100%; client mirrors same checks.
- `/analytics` — Streams, platform breakdown, geography analytics
- `/delivery` — DDEX delivery queue
- `/users` — User management with roles
- `/settings` — Settings placeholder

## Theme

Dark navy/slate background with electric indigo (#6366f1) accent. Dense, professional admin cockpit aesthetic designed for music industry professionals.
