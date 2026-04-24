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
  `2_deploy.sh` сам делает `pnpm install --frozen-lockfile`, `pnpm --filter @workspace/db run migrate` (versioned migrations), билд API/фронта, `pm2 startOrReload --update-env`.
  Первый запуск с `SEED=1` для засева тестовых данных.
- **Docker Compose** — `docker compose up -d --build`, миграции через `docker compose exec api pnpm --filter @workspace/db run migrate`.

Все секреты живут в `/var/www/tajikmusic/.env` (или корневом `.env` в случае docker), шаблон — `deploy/.env.example`.
Никаких Replit-специфичных импортов в боевом коде нет; vite-плагины Replit подключаются только при `NODE_ENV !== "production" && REPL_ID !== undefined`.
Cookie сессий: `secure: true` в production, `sameSite: lax`. Express trust-proxy=1, чтобы за nginx работал HTTPS.

## Security baseline

Полный набор P0-защит для прод-релиза (Task #2 апр-2026):

- **Helmet** — X-Frame-Options=SAMEORIGIN, X-Content-Type-Options=nosniff, HSTS, Referrer-Policy и пр.
- **CSP** — включён в `helmet({ contentSecurityPolicy })` **только в `NODE_ENV=production`**. Директивы: `default-src 'self'`, `img-src 'self' data: blob: https:`, `style-src 'self' 'unsafe-inline'` (shadcn/Tailwind инжектят inline `<style>`), `script-src 'self'`, `frame-ancestors 'self'`, `object-src 'none'`. В dev отключён, чтобы не ломать Vite HMR-WebSocket и Replit-баннеры.
- **CORS whitelist** — `WEB_ORIGINS` env (CSV доменов). В dev fallback на `https://${REPLIT_DEV_DOMAIN}` + `http://localhost:5173`. Запрос с чужого Origin отклоняется как `403 {error: "CORS: origin not allowed"}` (есть error-handler middleware в `app.ts`, который мапит throw из cors() в чистый JSON-ответ).
- **Глобальный rate-limit на `/api`** — 300 req/60s в prod, 3000 в dev. Ключ — `req.ip` (через `trust proxy=1`). Проверки `/health` исключены из лимита.
- **Login limiter** — 10 попыток/5 мин на IP (prod) / 100 (dev) на `POST /auth/login`, `skipSuccessfulRequests:true`.
- **Change-password limiter** — 5 попыток/15 мин на IP (prod) / 100 (dev) на `POST /auth/change-password`.
- **Per-account lockout** (защита от distributed brute-force, который IP-лимит не ловит): таблица `users` имеет `failed_login_attempts integer DEFAULT 0` + `locked_until timestamptz`. После 5 неудач подряд → блокировка на 15 мин (HTTP 429 + сообщение «Аккаунт временно заблокирован, попробуй через X мин»). Успешный логин ИЛИ смена пароля обнуляют счётчик. Lockout-чек выполняется ДО bcrypt-сравнения (не жжём CPU и не отдаём сессию атакующему, узнавшему пароль внутри окна). Поля `failed_login_attempts` / `locked_until` исключены из всех API-ответов (`buildProfilePayload` в `routes/auth.ts` whitelisted; `formatUser` в `routes/users.ts` явно destructures их прочь вместе с `passwordHash`).
- **Integrations API защищён двойным guard'ом**: `routes/index.ts` ставит `requireRole("admin","manager")` на префикс `/integrations`, а `routes/integrations.ts` повторяет `router.use(requireRole("admin","manager"))` внутри файла (defence-in-depth — если префикс пропадёт при рефакторинге, доступ остаётся закрыт). Все мутирующие эндпоинты валидируют тело через Zod (`RegisterBody`, `CredentialsBody`, `EnableBody`, `TestBody`, `JobsQuery`), параметр `:code` ограничен `^[a-z0-9-]+$`.
- **На проде API должен слушать только за nginx** (UFW в `deploy/1_setup.sh` блокирует все порты кроме SSH/Nginx) — иначе rate-limit обходится через прямые запросы с подменой `X-Forwarded-For`.

Smoke-тесты (curl, проверены в dev):
- Чужой Origin → 403 `{"error":"CORS: origin not allowed"}`.
- Replit dev origin → 200/401, заголовок `Access-Control-Allow-Origin` присутствует.
- Артист на `/api/integrations` → 403 `{"error":"Forbidden: insufficient role"}`.
- Bad `:code` (`/integrations/BAD_CODE/enable`) → 400 с описанием Zod-ошибки.
- Bad body (`{"enabled":"yes"}`) → 400 с описанием Zod-ошибки.
- Manager: 4 неверных пароля → 401, 5-й → 429 (lockout), DB подтверждает `failed_login_attempts=5` и `locked_until > now()`. После сброса + правильного логина — 200 и счётчик 0.

## Audit log (Task #3, апр-2026)

Структурированный compliance-журнал изменений (§14 #1, §4.12 ТЗ) — отдельная таблица `audit_log`, параллельно существующему `activity_log` (который остался для дашборд-виджета «Recent activity»).

**Схема** (`lib/db/src/schema/audit_log.ts`, миграция `0002_audit_log.sql`):
- Поля: `id serial PK`, `user_id integer FK→users.id ON DELETE SET NULL`, `user_email text`, `user_role text` (роль на момент действия — для исторической точности), `action text` (`create|update|delete|login|approve|reject|deliver`), `entity_type text`, `entity_id integer NULL` (login не привязан к сущности), `before jsonb`, `after jsonb`, `diff jsonb` (массив `{field, old, new}` только изменённых полей), `ip text`, `user_agent text`, `request_id text`, `created_at timestamptz`.
- Индексы: `(entity_type, entity_id, created_at)`, `(user_id, created_at)`, `(created_at)`, `(action)`.

**Helper** (`artifacts/api-server/src/lib/audit.ts`):
- `auditMutation(req, {action, entityType, entityId, before, after})` — fire-and-forget. Никогда не ждём перед `res.json()`. Ошибки записи логируются в pino, пользователь не страдает.
- `computeDiff(before, after)` — shallow diff с `JSON.stringify` для вложенных объектов.
- `sanitizeFields()` — строгий blocklist: `passwordHash, password, cipherText, secret, token, accessToken, refreshToken, apiKey, privateKey, failedLoginAttempts, lockedUntil`. Date → ISO для стабильного diff.

**Интеграция в роуты**: `releases` (POST/PUT/PATCH status/DELETE), `tracks` (POST/PUT/DELETE), `artists` (POST/PUT/DELETE), `labels` (POST/PUT/DELETE), `finance` (POST /payouts, /approve, /reject), `splits` (POST/PUT/DELETE), `users` (POST/PUT/DELETE/PATCH /me). Везде где не было pre-fetch — добавлен `SELECT before UPDATE/DELETE` для diff.

**API**: `GET /api/audit?entity_type=&entity_id=&user_id=&action=&from=&to=&limit=50&offset=0` (admin/manager only), `GET /api/audit/facets` (entityTypes/actions/users для фильтров UI).

**UI**: вкладка «Audit Logs» в `pages/settings/index.tsx` — фильтры (сущность/действие/пользователь), таблица с expand-row для diff (red/green side-by-side, с user-agent внизу). Старый activity feed оставлен ниже отдельной карточкой как информация для дашборда.

**Не путать**: `activity_log` пишет одну строку «человекочитаемого события» (например `release_status_changed`) — её читает виджет дашборда. `audit_log` — структурированный before/after для расследований/compliance. Релиз-роуты сейчас пишут в обе таблицы.

**Bonus fix в этой же задаче**: `app.ts` rate-limit использовал `req.ip` напрямую → express-rate-limit v8 валидатор `ipKeyGenerator` падал при старте. Заменил на `ipKeyGenerator(req.ip ?? "unknown")` — теперь IPv6-клиенты не могут обходить лимит за счёт многих /64-адресов.

## Mock cleanup (Polish task #1, апр-2026)

Перед фазой DDEX/Self-Signup убрали из CRM-панели мок-разделы и мок-данные с дашборда:

- **Удалённые страницы** (были чистые моки, не подвязаны к API): `pages/marketing/`, `pages/communications/`, `pages/automation/`, `pages/rights/`, `pages/integrations/`. Соответствующие импорты, `<ProtectedRoute>` и записи в `permissions.ts ROUTE_ROLES` тоже удалены. **Внимание**: настоящий API-функционал по интеграциям DSP остался — он живёт в `pages/settings/index.tsx` под `/api/integrations` (это таблица `integrations` из `lib/db/src/schema/integrations.ts`, 29 записей реестра). Удалена только дубликат-страница `/integrations` с моками.
- **`components/sidebar-nav.tsx`** — убраны 5 пунктов навигации, fake badge "3" с `/distribution`, неиспользуемые иконки (`Megaphone`, `MessageSquare`, `ShieldCheck`, `Zap`, `PlugZap`).
- **`lib/i18n.tsx`** — убраны nav-ключи и `subtitle`-блоки (`marketing`, `communications`, `automation`, `rights`, `integrations`) в EN и RU словарях.
- **`pages/dashboard.tsx`** переписан: удалены константы `DATA_ADMIN`/`DATA_LABEL`/`DATA_ARTIST` и все мок-фолбэки `?? roleData.xxx`. KPI-карточек 4 (Revenue / Artists / Releases / Active Deliveries) — все тянутся из `useGetDashboardSummary`. Графики (`AreaChart` revenue, `BarChart` releases-by-status, top artists, recent activity) — на реальных хуках (`useGetDashboardRevenueByMonth`, `useGetDashboardReleasesByStatus`, `useGetDashboardTopArtists`, `useGetDashboardRecentActivity`). Если данных нет — показывается `<EmptyChart>` плейсхолдер. Убраны мок-секции Geo/UGC/Social и Label-only trends/labelTracks/playlists.
- **`components/dashboard-sections.tsx`** очищен: удалены `GeoStreamsCard`, `WorldStreamsMap`, `UgcOverviewCard`, `SocialViewsCard` (все на моках из удалённого `data/dashboard-extras.ts`). Оставлены 6 секций для admin/manager — все на `useQuery` к реальным `/api/dashboard/*` эндпоинтам: `TopDspCard`, `TopTerritoriesCard`, `LatestReleasesGridCard`, `TopTracksCard`, `RoyaltySummaryCard`, `ArtistsStatsTableCard`.
- **Удалён файл** `data/dashboard-extras.ts` (вся фабрика моков). Папка `data/` пуста — её можно удалить целиком при следующей чистке.
- **Orphan dependency**: `react-simple-maps` теперь не используется (был только в `WorldStreamsMap`). Можно убрать из `artifacts/crm-panel/package.json` отдельным проходом.
- **`/distribution` и `/videos`** оставлены как есть (полные моки) — они будут переписаны на реальный API в задачах DDEX ERN 4.3 и Videos соответственно.

## CRM page (контакты + задачи)

`pages/crm/index.tsx` полностью на реальном API:
- Источники: `GET /api/crm/contacts`, `GET /api/crm/tasks`, `GET /api/users` (для дропдауна «Ответственный»). Все эндпоинты `/crm/*` и `/users` доступны только `admin/manager` (guard в `routes/index.ts`).
- Создание/редактирование/удаление контактов и задач — через `Dialog` + `AlertDialog`, реальные `POST/PUT/DELETE`. Все CRUD протестированы curl'ом + права (`artist → 403`).
- Toggle статуса задачи (todo↔done) — оптимистичный апдейт **с per-task lock** (`pendingTaskIds`) и реконсиляцией от ответа сервера, чтобы не было «потерянных апдейтов» при двойном клике или out-of-order ответах.
- Фронт-гейт: `useEffect` ждёт `authLoading` и `isAdmin`, иначе не делает fetch (не плодит 403 + тосты для не-админов). Не-админу показывается «доступно только админам/менеджерам».
- Telegram-ссылки прогоняются через `safeTelegramHref()` — принимаем только `@username`, чистый username, или `https://t.me|telegram.me/...`. Иначе ссылка не рендерится. Защита от хранимого open-redirect/фишинга.
- Все icon-only кнопки имеют `aria-label`; экшены раскрываются по `group-hover` **и** `group-focus-within` (доступны с клавиатуры). Anchor-кнопки сделаны через `<Button asChild>`, чтобы не было невалидного `<a><button>`.
- Вкладку «Заметки» из старого мока убрал — таблицы для заметок нет, есть только поле `notes` на контакте.

## Revenue Ingestion (Task #5, апр-2026)

CSV-импорт DSP-отчётов от Spotify/Apple Music/YouTube Music/TikTok → парсинг → preview/commit → запись в `transactions` + `usage_reports`.

- **DB:** `ingestion_imports` (журнал загрузок, UNIQUE на `idempotency_key` = sha256(file)+":"+dsp+":"+period — защита от двойного импорта) + `ingestion_unmatched` (строки CSV, ISRC которых не найден в `tracks` — ручной разбор админом). Оба `id serial` (сохраняем pattern всех 20 таблиц). FKs: `uploaded_by → users.id` SET NULL, `import_id → ingestion_imports.id` CASCADE. Migration `0004_eager_black_crow.sql`.
- **Парсеры:** `artifacts/api-server/src/services/ingestion/{spotify,apple,youtube,tiktok}.ts` — каждый делает `csv-parse/sync` и возвращает унифицированный `ParsedRow[]`. Apple авто-детектит TSV по `\t` в первой строке. Хедеры ищутся по нескольким алиасам — DSP меняют названия колонок в зависимости от версии отчёта. `utils.ts` — общие helpers: `normIsrc` (cleanup + либеральная regex `^[A-Z]{2}[A-Z0-9]{8,18}$` — стандарт ISO 3901 — 12 chars, но реальные seed/DSP-данные часто 13), `normCountry` (ISO-2, агрегаты WORLD/WW/ZZ → null), `parseNumber` (терпит запятые, скобки=отрицательное, символы валюты), `normPeriod` (YYYY-MM из 5+ форматов), `dominantValue` (mode по массиву).
- **Service** (`services/ingestion/service.ts`): `previewImport` — парсит, матчит ISRC → `tracks`, возвращает 10-row sample + counts + warnings БЕЗ записи в БД. `commitImport` — одной `db.transaction`: вставляет `ingestion_imports` (UNIQUE catches race), раскладывает matched-строки в `usage_reports` (artistId/releaseId/trackId/platform/period/streams/revenue/countryCode), unmatched в `ingestion_unmatched`, агрегирует доход per `(release, period)` в `transactions(type='dsp_revenue', platform=dsp, period)`. Вставка чанками по 500 строк. Idempotency check ДО парсинга — повторный POST того же файла вернёт `{importId, duplicate: true}` с HTTP 200, без побочных эффектов.
- **Routes** (`routes/ingestion.ts`): `POST /api/finance/ingest/preview`, `POST /api/finance/ingest/commit` (multipart, multer.memoryStorage 50MB), `GET /api/finance/imports?limit=N`. Все три замаунчены под `adminOnly = requireRole("admin","manager")` в `routes/index.ts`. Артист/лейбл получают 403. Audit-log пишется ТОЛЬКО при non-duplicate commit, `idempotencyKey` редактится в `[redacted-hash]` чтобы не светить sha256.
- **UI** (`pages/finance/import.tsx`): drag-drop dropzone + DSP-select + period (auto из preview) → preview-карточка с counts (total/valid/matched/unmatched/revenue), 10-row sample-таблицей и warnings → Commit. Список последних 20 импортов внизу. Обновлена `pages/finance/index.tsx` — убрана хардкод-таблица 5 моков, заменена на real `GET /finance/imports?limit=10` + кнопка-link «Загрузить CSV». Маршрут `/finance/import` в `App.tsx` + `/finance/import: ["admin","manager"]` в `permissions.ts`.
- **Test fixtures** (`artifacts/api-server/test-fixtures/ingestion/`): `spotify.csv`, `apple_music.csv` (TSV), `youtube_music.csv`, `tiktok.csv` — каждый с реальными seeded ISRC + 1 unmatched (`TJSND9999...`) для проверки fallback-пути. Smoke-test (curl multipart) подтвердил: matched/unmatched counts корректны, idempotency duplicate=true работает, artist→403, audit-log пишется.

## Asset storage & uploads (Task #1)

Хранилище — **Replit Object Storage** (через `@google-cloud/storage` + sidecar token). В проде заменим на Yandex Object Storage по тем же контрактам.

- Таблица `assets` (`lib/db/src/schema/assets.ts`): `kind` (audio/cover/image/document), уникальный `storageKey`, `objectPath` (вида `/objects/uploads/<uuid>`), `sha256` (уникальный когда не null → дедуп при повторной заливке того же файла), `durationSeconds` (для аудио), FK на `release/track/artist/label`, `uploadedBy`.
- API (`POST /api/assets/presign` → `PUT` напрямую в GCS → `POST /api/assets/confirm`):
  - presign: лимиты — audio 200 МБ, cover/image/document 25 МБ; scope-чек по `release/track/artist/label`.
  - confirm: тянет метаданные из GCS, считает sha256, для аудио вытаскивает длительность через `music-metadata.parseStream`. При совпадении sha256 возвращает существующий `assets` ряд (дедуп). Если `attach: true` (default) — пишет URL в `release.coverUrl` / `track.audioUrl`.
- Чтение в браузере: `GET /api/storage/objects/uploads/:id` — стримит файл напрямую из GCS под session-cookie со scope-чеком (без подписанных URL для UI). Подписанные URL отдаются только через `GET /api/assets/:id` (5 мин TTL) — оставлено для будущего «Скачать оригинал».
- Frontend: `components/asset-uploader.tsx` — `useAssetUpload()` (XHR с прогрессом), `<CoverUploader>` (квадратный превью), `<AudioUploader>` (HTML5 `<audio controls>` после загрузки). На `/releases/new` и `/releases/[id]` обложка теперь грузится файл-инпутом, не URL'ом. На `/releases/[id]` появилась форма «Добавить трек» + per-track audio uploader + удаление трека.
- `coverUrl` / `audioUrl` хранят `objectPath`; в UI рендерится через `assetHref()` → `/api/storage{objectPath}`. Старые внешние URL (если попадутся) проходят без обёртки.

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
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only, no history)
- `pnpm --filter @workspace/db run generate` — generate a versioned SQL migration from schema diff
- `pnpm --filter @workspace/db run migrate` — apply pending migrations (use this in prod / CI)
- `pnpm --filter @workspace/db run seed` — seed the database with sample data
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Schema (20 business tables + `session`)

All ID columns are `serial`. Every `*_id` column has a `FOREIGN KEY` constraint with an explicit `ON DELETE` strategy, and hot read paths are indexed. Schema is migrations-based (`lib/db/migrations/` + `lib/db/src/migrate.ts` runner) — `drizzle-kit push` is dev-only.

- `labels` — record labels with parent/sub-label hierarchy (parent_label_id → labels, SET NULL)
- `artists` — artists with genre, label, social links (label_id → labels, SET NULL)
- `releases` — albums/singles/EPs (artist_id RESTRICT, label_id SET NULL); idx on artist/label/status/release_date/upc
- `tracks` — individual tracks (release_id CASCADE, artist_id RESTRICT); idx on release/artist/isrc
- `users` — system users with roles admin/label/artist/manager (artist_id, label_id SET NULL); idx on role/artist/label
- `contacts` — CRM contacts (no FKs — standalone); idx on type/email
- `crm_tasks` — CRM tasks (assigned_to_id → users SET NULL); polymorphic related_entity (idx on status/assignee/related)
- `transactions` — financial ledger (artist_id, label_id, release_id all RESTRICT — finance is forever); idx on period/artist/label/release/type/(period+artist)
- `splits` — revenue split definitions (release_id, track_id CASCADE)
- `payouts` — payout requests (artist_id, label_id RESTRICT); idx on artist/label/status
- `publishing_works` — publishing rights ASCAP/BMI/Songtrust/MLC (track_id SET NULL — work outlives track); idx on track/status/iswc
- `usage_reports` — streaming usage reports (artist/release/track all SET NULL — history survives deletes); idx on period/track/release/artist/platform/(period+track)
- `deliveries` — DDEX delivery queue (release_id CASCADE); idx on release/status/target
- `activity_log` — system activity (user_id SET NULL — logs survive user deletion); idx on (entity_type+entity_id)/user/created
- `assets` — uploaded files in object storage (release/track/artist/label/uploaded_by all SET NULL); idx on release/track/artist/sha256
- `integrations`, `integration_credentials`, `integration_sync_jobs` — DSP/delivery connectors registry with AES-256-GCM encrypted creds (CASCADE FK from creds/jobs to integrations)
- `ingestion_imports` — журнал импортов CSV (uploaded_by → users SET NULL); UNIQUE на `idempotency_key`; idx (dsp,period)/created
- `ingestion_unmatched` — строки CSV с ISRC, не найденным в tracks (import_id CASCADE); idx import/raw_isrc/resolved

Migration workflow: `pnpm --filter @workspace/db run generate --name <change>` → review/edit `lib/db/migrations/0NNN_<name>.sql` to make it idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`, FK constraints wrapped in `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '...') THEN ALTER TABLE ... ADD CONSTRAINT ... NOT VALID; ALTER TABLE ... VALIDATE CONSTRAINT ...; END IF; END $$;`) → commit → deploy runs `migrate` automatically. Idempotent SQL means the same migration is safe to run against pristine, previously-pushed, or already-migrated databases. `NOT VALID` + `VALIDATE` ensures FK creation never blocks on existing data — if `VALIDATE` fails because of orphan rows, the operator gets a clear error pointing to the offending constraint and can clean up before re-running. Test legacy/virgin scenarios with `lib/db/scripts/test-migrations.sh`.

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
- `/analytics` — Real analytics dashboard (admin/manager only). Backed by `/api/analytics/{streams,platforms,geography,top-tracks}` aggregating from `usage_reports` table. Period selector: 7d/30d/90d/180d/1y. Daily bar/area chart on short periods, monthly bins on long ones. Pie chart by platform with brand colours, geography progress bars by country with flags, top-tracks table with prior-period trend %. Removed legacy mock UGC/TikTok/Alerts/Playlists tabs (no real data sources). `usage_reports` is seeded deterministically (~52K rows, 6 months × 6 platforms × 8 countries × all tracks) — re-seed via raw SQL if needed (TRUNCATE + INSERT in scratchpad).
- `/delivery` — DDEX delivery queue
- `/users` — User management with roles
- `/settings` — Admin-only system settings (6 tabs). **Live tabs**: DDEX & DSP (real `/api/integrations` filtered to `dsp`+`delivery` categories with enable/disable Switch via POST `/integrations/:code/enable` and Test button via POST `/integrations/:code/test`, optimistic updates with rollback), Audit Logs (real `/api/dashboard/recent-activity` with client-side filter, severity inferred from event type). **Demo tabs** (clearly marked with amber `Demo data` badge): General/Branding, API Keys (no `api_keys` table yet), Security (2FA/IP rules), Backup History.

## Theme

Dark navy/slate background with electric indigo (#6366f1) accent. Dense, professional admin cockpit aesthetic designed for music industry professionals.
