# Tajik Music Distribution CRM

## Overview

A comprehensive Music Distribution CRM and Admin Panel for a Tajik music label. This full-stack application provides catalog management, CRM functionalities, analytics, financial management, DDEX delivery, and publishing rights management. The project aims to streamline operations for music labels, offering tools for managing artists, releases, royalties, and external DSP integrations.

## User Preferences

- **Workflow on Replit**: Should simply run dev-servers (`pnpm --filter ... run dev`). Do not change them to `pnpm build && pnpm start` or production mode, as this will break the preview.
- **Deployment**: Deployment is done ONLY by pushing to `main` on GitHub, then accessing the VPS via SSH, and running `bash /var/www/tajikmusic/deploy/2_deploy.sh`. There is no automation between Replit and VPS, and none is needed.
- **Git Push from Replit**: This is done via a personal token in `GITHUB_TOKEN` (Replit Secrets). If a push fails, the token in Secrets likely needs to be updated (classic PAT with `repo` scope).
- **Communication Language**: Russian.
- **Communication Style**: The user is non-technical (label owner). Do not use jargon or emojis. Explain the consequences of any actions in simple terms.
- **Deployment Requests**: If the user says "publish" or "update the website," they mean "update the code on GitHub and deploy to Timeweb," not "click the Publish button in Replit." The correct sequence is:
    1. Run `pnpm run typecheck` (also set as a pre-push hook via simple-git-hooks).
    2. `git push origin main` (with `GITHUB_TOKEN` in env).
    3. Instruct the user to run one command on the server: `cd /var/www/tajikmusic && bash deploy/2_deploy.sh`.
- **Replit Features**: Do NOT suggest Replit-specific features like "Publish" / "Deploy" through Replit Deployments, Replit Object Storage / GCS / S3 / Yandex Object Storage, Replit Database / Replit Auth / Replit AI Integrations.
- **File Storage**: Do NOT install Replit Object Storage / GCS / S3 / Yandex Object Storage. Files (covers, audio, KYC) are stored on the local filesystem of the VPS.

## System Architecture

The application is built as a monorepo using `pnpm workspaces` and Node.js 24. It utilizes TypeScript 5.9, with an Express 5 API server and a React frontend built with Vite, Wouter, Tailwind CSS, and shadcn/ui.

**Core Features & Components:**

-   **Catalog Management**: CRUD operations for artists, labels, releases, and tracks. Includes an artist invitation flow and a release creation wizard with role-based UI adjustments.
-   **CRM**: Comprehensive contacts and task management. Features a dedicated business analytics hub with overview KPIs, user activity, revenue per artist, growth charts, and release/delivery/task funnels.
-   **Financial Management**: Transaction ledger, artist/label balances, payout management with approval/rejection workflows, and revenue split definitions. Includes server-side export of transactions and payouts in Excel (.xlsx) and CSV (.csv) formats via `GET /api/finance/transactions/export` and `GET /api/finance/payouts/export`. Export buttons with format dropdown are available in the Finance Overview and Payouts panels.
-   **Royalty Hub**: User-facing royalty summaries, statements (PDF/CSV), and breakdowns by release and DSP.
-   **DDEX Delivery**: Full DDEX ERN-4.3 pipeline for message creation, batching, and acknowledgement processing. Includes SFTP transport and a robust inbound acknowledgement webhook.
-   **Publishing Rights**: Management of publishing works with dynamic writer lists and share validation.
-   **Revenue Ingestion**: CSV import functionality for DSP reports (Spotify, Apple Music, YouTube Music, TikTok) with parsing, preview, and commitment to the `transactions` and `usage_reports` tables. Includes idempotency checks and unmatched ISRC handling.
-   **Analytics**: Real analytics dashboard covering streams, revenue, geography, top tracks, UGC, alerts, playlists, and TikTok performance, all backed by real data.
-   **Communication & Automation**: Implemented communications section with email templates, campaigns, automation triggers, internal notes, and outbound webhooks.
-   **User Management & Authentication**: Role-based access control (`admin`, `manager`, `label`, `artist`) with `express-session` and `connect-pg-simple`. Data scoping is applied server-side for non-privileged users. Passwords are hashed with bcrypt.
-   **Security**: Implements Helmet for HTTP headers, CSP for production, CORS whitelist, global and specific rate limiting (e.g., login, password change), per-account lockout for brute-force protection, and role-based API endpoint protection. All secrets are managed via environment variables.
-   **Asset Storage**: Uses local filesystem storage for uploaded files (audio, covers, documents). Uploads leverage a presigned URL mechanism with HMAC signatures for security and size limits. Deduplication based on SHA256 hashes is implemented.
-   **Audit Log**: Structured compliance journal (`audit_log` table) recording detailed changes (who, what, when, before/after states, diffs) for releases, tracks, artists, labels, finance, splits, and users.
-   **UI/UX**: Features a dark navy/slate background with electric indigo accent, designed for a professional admin cockpit aesthetic. Components are built with shadcn/ui. The frontend dynamically adjusts UI elements (e.g., release creation form, settings) based on the user's role. Internationalization (i18n) is supported, primarily in Russian.
-   **Transfer Track Module**: A fully localized module for importing existing music catalogs from Spotify, including artist search and robust release/track insertion with UPC conflict resolution and buffered audit logging.
-   **CRM Business Analytics Hub**: Enhanced `/crm` page with multiple tabs for detailed business analytics, including user activity, ARPU, growth metrics, and funnels.
-   **Role-aware UX**: Settings page dynamically renders content based on user roles. Release creation wizard adapts form fields and options for artists and labels.

**Technical Implementations:**

-   **API Framework**: Express 5.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Validation**: Zod for schema validation.
-   **API Codegen**: Orval for generating API hooks from OpenAPI specs.
-   **Frontend**: React, Vite, Wouter for routing, Tailwind CSS for styling, Recharts for charts, react-hook-form for forms.
-   **Build System**: esbuild for backend, Vite for frontend.
-   **Migrations**: Drizzle versioned migrations for database schema changes, designed to be idempotent.

## External Dependencies

-   **PostgreSQL**: Primary database for all application data.
-   **Express.js**: Backend API framework.
-   **React**: Frontend UI library.
-   **Vite**: Frontend build tool.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **shadcn/ui**: UI component library.
-   **Recharts**: Charting library for data visualization.
-   **react-hook-form**: Form management library.
-   **Zod**: Schema validation library.
-   **Drizzle ORM**: TypeScript ORM for PostgreSQL.
-   **Orval**: OpenAPI spec code generator.
-   **esbuild**: Fast JavaScript bundler.
-   **Wouter**: Small routing library for React.
-   **pm2**: Production process manager for Node.js applications (on VPS).
-   **nginx**: Reverse proxy server (on VPS).
-   **certbot**: For HTTPS certificate management (on VPS).
-   **Spotify Web API**: For searching artists and releases during catalog transfer.
-   **music-metadata**: Library for parsing audio file metadata (duration).
-   **csv-parse/sync**: For parsing CSV files during revenue ingestion.
-   **multer**: Middleware for handling multipart/form-data, used for file uploads.
-   **ssh2-sftp-client**: (Conditional) For SFTP transport in DDEX deliveries and polling acknowledgements.

## Recent Changes

### 2026-05-01 — Создание пользователей админом (фикс «нет кнопки + мёртвые юзеры»)
До этого: на странице `/users` админ не мог создать пользователя из UI вообще, хотя `POST /api/users` существовал. Хуже того — старый endpoint вставлял запись БЕЗ `passwordHash`, то есть созданный пользователь не мог войти (фактически «мёртвый» аккаунт).

- **Backend** (`artifacts/api-server/src/routes/users.ts`):
  - Email нормализуется (trim+lowercase) и проверяется на уникальность → 409 `email_taken` с понятным сообщением вместо сырого 500 от unique-индекса.
  - Генерируется временный пароль (`generateTempPassword(12)` — тот же helper, что в signup approve), хэшируется bcrypt, сохраняется в `passwordHash`. `kycStatus='not_started'`.
  - Best-effort приглашение через `sendMailAndForget` (text + html) с временным паролем. Если SMTP не сконфигурирован — тихо пропускаем.
  - В response возвращается `tempPassword` ОДНОРАЗОВО — админ показывает его в UI и может скопировать. В БД хранится только bcrypt-хэш.
- **UI** (`artifacts/crm-panel/src/pages/users/`):
  - Новая кнопка «Новый пользователь» (`UserPlus`-icon) в header карточки `All Users` — видна **только админу** (`currentUser?.role === "admin"`).
  - Новый компонент `_create-user-dialog.tsx`: поля name / email / role / status. После успеха показывает временный пароль с кнопкой Copy + предупреждение «показывается только один раз». Закрытие диалога reset'ит state. Клиент дёргает `POST /api/users` напрямую через fetch (а не через сгенерированный `useCreateUser`) — потому что нужен доступ к нестандартному полю `tempPassword` в ответе.
  - i18n: добавлены RU+EN строки `create_button`, `create_dialog_title`, `create_dialog_desc`, `create_submit`, `create_saved`, `create_error`, `create_validation_error`, `create_temp_pwd_title`, `create_temp_pwd_hint`, `create_copy`, `create_copied`, `create_done`.
- **Smoke**: POST с новым email → 201 + tempPassword=12 chars; повтор того же email → 409 `email_taken`.
- **Severe-фиксы по итогам architect-review**:
  - `POST /users` теперь под `adminOnlyStrict = requireRole("admin")` — менеджер не может создавать аккаунты (тем более с ролью admin).
  - INSERT обёрнут в try/catch на Postgres unique_violation `23505` → тот же 409 `email_taken` без 500 на гонке между pre-check и insert.
  - Pre-check уникальности email теперь case-insensitive (`lower(email) = lower(input)`), чтобы legacy записи смешанного регистра не пускали логические дубликаты.
  - `PUT /users/:id` (всё ещё под `adminOnly = admin|manager` для обычного редактирования профилей) обзавёлся anti-escalation guard'ом: менеджер не может (а) править админов вообще, (б) менять `role` никому. Иначе manager → self-promote → admin обходил бы строгий create-гейт.
  - Smoke escalation: manager promote себя/чужих → 403; manager редактирует admin → 403; manager переименовывает artist без смены role → 200; admin меняет role → 200.

### 2026-05-01 — Защита репутации лейбла: 5 уровней проверки + multi-segment ACR
Цель — снизить риск «ACR clean → Spotify reject». Внедрено пять связанных слоёв:

1. **Schema (миграция 0013)**:
   - `acr_checks`: `mode` (`sample`|`full`), `engine` (`acrcloud`|`musicbrainz_isrc`), `segments` jsonb (timeline сэмплов).
   - `releases`: `risk_score` int 0-100, `risk_factors` jsonb (`{code,message,severity}[]`).
   - `labels`: `copyright_strikes` int (накопительный счётчик отказов DSP), `risk_score` int.

2. **Multi-segment ACR scan**: `POST /api/distribution/acr/scan-full` — режет файл на 5 байтовых окон по ~512KB (0/25/50/75/95% позиции), сканит каждое через ACRCloud `/v1/identify`. Сохраняет таймлайн в `acr_checks.segments` со статусом по сегменту, score, найденными метаданными. UI рисует горизонтальную полосу 0..100% с цветовыми зонами.

3. **MusicBrainz ISRC validator** (`services/musicbrainz.ts` + `POST /api/distribution/musicbrainz/check-isrc`): rate-limited (1 RPS) лукап `https://musicbrainz.org/ws/2/recording/?query=isrc:X&fmt=json`. Если ISRC найден у другого артиста/трека — пишет `acr_checks` с `engine=musicbrainz_isrc`, `status=matched`. Free, no auth, второй движок проверки.

4. **Risk engine + label strikes** (`services/risk-engine.ts`): `computeRisk(release, label, checks)` собирает 0-100 + список факторов (`acr_matched`, `musicbrainz_isrc_conflict`, `label_strikes_high`, `regional_genre_weak_acr_coverage`, `pending_full_scan`). Вызывается на submit/approve/reject/scan через `assessAndPersist(releaseId)`. Delivery-worker инкрементит `labels.copyright_strikes` при ack=Rejected с copyright/conflict-keyword. При `copyright_strikes >= 3` `POST /releases/:id/deliver` возвращает 409 `label_blocked_too_many_strikes`; обходится `force: true` в body (аудитится).

5. **Регион/жанр detection**: `isRegionalGenre(genre, language)` → true для tj/uz/kz/tg/fa и жанров world/folk/persian/tajik. Поднимает фактор риска «региональный каталог — слабое покрытие ACR».

**UI** (`releases/[id].tsx`):
- Новая карточка **«Оценка риска»** между Status и Release Details: цветной badge score (зелёный <40 / янтарный 40-69 / красный 70+), список факторов риска с severity-точками, кнопки модератора **Full multi-segment ACR** и **MusicBrainz ISRC check**, история проверок (последние 6) с inline-таймлайном сегментов.
- **DeliverDialog**: при 409 `label_blocked_too_many_strikes` показывает confirm-экран с числом страйков и порогом, повтор отгрузки уходит с `force=true`.

**API spec / типы**: `lib/api-spec/openapi.yaml` — добавлены `Release.riskScore`/`riskFactors`, `DeliverReleaseBody.force`. Прогнан codegen `@workspace/api-spec`. Расширены `AcrCheckSegment` (index, startPct/endPct, startBytes/endBytes, error, tookMs) и `AuditAction` (`acr_scan_full`, `musicbrainz_isrc_check`).

Файлы: `lib/db/src/schema/{acr_checks,releases,labels}.ts`, `artifacts/api-server/src/services/{musicbrainz,risk-engine}.ts`, `artifacts/api-server/src/routes/{distribution-extras,releases}.ts`, `artifacts/api-server/src/workers/delivery-worker.ts`, `artifacts/api-server/src/lib/audit.ts`, `artifacts/crm-panel/src/pages/releases/[id].tsx`, `lib/api-spec/openapi.yaml`. Type-check (api-server + crm-panel) clean.

### 2026-05-01 — Inline release metadata editor (фикс «после кнопки нет редактора»)
- На странице `/releases/:id` для черновика кнопка **Edit Release** теперь не открывает диалог-заглушку, а переключает карточку «Release Details» в инлайн-режим редактирования метаданных. Все поля: title, language, releaseType, genre, releaseDate, upc, pLine, cLine, isExplicit, territories. Сохранение через `useUpdateRelease` (PUT `/api/releases/:id`) с честным payload `CreateReleaseBody` (включая `artistId`/`labelId`/`coverUrl` из существующего релиза, чтобы пройти Zod-валидацию на бэке).
- Для статуса `rejected` оставлен прежний диалог `EditReleaseDialog`, который сначала переводит rejected→draft.
- Auto-close: `useEffect` закрывает инлайн-форму, если статус релиза уезжает с draft (например, пользователь параллельно отправил на модерацию). Без этого следующий PUT упирался бы в backend-lock.
- Файл: `artifacts/crm-panel/src/pages/releases/[id].tsx`. Архитектурный review (architect) пройден.

### 2026-05-01 — Admin-create-artist UX (фикс прод-401 + фото с устройства + телефон)
- **Фикс 401 в продакшене (часть 1, customFetch)**: orval-сгенерированный `customFetch` (`lib/api-client-react/src/custom-fetch.ts`) не передавал `credentials`, и браузер по дефолту использовал `same-origin`. В split-domain prod-сборке (api ≠ panel) session-кука POST-запроса не уходила, и backend возвращал 401. Теперь дефолт — `credentials: "include"`. На бэке CORS-whitelist уже стоит, так что чужие origin'ы всё равно блокируются.
- **Фикс 401 в продакшене (часть 2, Secure-cookie без HTTPS)**: после деплоя на ubuntu-сервер (nginx + pm2) пользователь видел 401 на ВСЕХ ручках (`/api/labels`, `/api/artists`, `/api/notifications/unread-count`), потому что сайт идёт по HTTP без TLS, а сессионный cookie помечается `Secure` (т.к. `NODE_ENV=production`). Браузер отказывается сохранять Secure-cookie через HTTP → login возвращает 200 + Set-Cookie, но cookie никогда не записывается, и каждый следующий запрос — без сессии. Введён env-флаг `SESSION_COOKIE_SECURE=true|false` (`artifacts/api-server/src/app.ts`) с дефолтом `true` в проде. Решение для пользователя: правильный путь — настроить TLS через certbot (`certbot --nginx -d ваш-домен`), временный путь — выставить `SESSION_COOKIE_SECURE=false` в `/var/www/tajikmusic/.env` и перезапустить pm2.
- **Фото артиста — загрузка с устройства**: новый эндпоинт `POST /api/artists/upload-image` (multer memoryStorage, 5 МБ лимит, MIME-whitelist PNG/JPEG/GIF/WEBP, `requireRole admin/manager/label`). Файл сохраняется в GCS под `${PRIVATE_OBJECT_DIR}/uploads/avatars/<uuid>` и отдаётся через существующий `GET /api/users/avatars/:objectId` (обе ручки гейтятся `requireAuth`). Multer-обёртка переводит `LIMIT_FILE_SIZE` в 413, остальные multer-ошибки — в 400 с русским текстом. Форма артиста (`artist-form-dialog.tsx`) теперь имеет file picker с превью (через blob URL + `URL.revokeObjectURL` на cleanup), кнопками «Загрузить с устройства» / «Заменить» / «Убрать». Старое поле «Ссылка на фото» удалено.
- **Поле телефон**: добавлена колонка `artists.phone text` (миграция `0014_massive_pepper_potts.sql`), поле `phone` добавлено в `Artist` и `CreateArtistBody` в `lib/api-spec/openapi.yaml` (PUT использует `CreateArtistBody`). После регенерации orval-типов фронт-форма получила `<Input type="tel">` с placeholder `+992 …`. Список артистов (`GET /api/artists`) теперь тоже возвращает `phone`, а dropdown «Edit» в `pages/artists/index.tsx` пробрасывает `phone` в `editing` — без этого редактирование без правки телефона силенсово обнуляло бы значение.
- Architect-review: 1 критическое замечание (потеря phone при edit — list-select не возвращал поле, edit-init не пробрасывал) + 1 необязательное (multer error handler) — оба пофикшены. Регрессионный smoke: login → create with phone → list содержит phone → PUT без правки phone сохраняет значение → upload 6 МБ файла даёт корректный 413.

### 2026-05-01 — Audit fixes (no fakes/mocks/stubs, cross-role workflows closed)
- **Honest artist stats**: `GET /api/artists/:id/stats` теперь агрегирует реальные `usage_reports` + `transactions`. Никаких Math.random.
- **import-upc — честный 501**: Эндпоинт больше не создаёт мусорных релизов; возвращает понятное сообщение и направляет в Transfer-модуль.
- **TikTok/playlists analytics — без фейков**: `ensureTiktokSeedData`/`ensurePlaylistSeedData` удалены. Эндпоинты возвращают пустой массив, если данных нет.
- **DDEX local-fs**: stub-буфер на отсутствующие файлы доступен только при явном `DDEX_LOCAL_FS_STUB_MISSING=1`. Без этого флага доставка падает с понятной ошибкой.
- **Cross-role notifications**: добавлены уведомления при submit/deliver релиза (артисту и лейблу), при создании заявки на выплату (заявителю + админам), при сабмите KYC (модераторам).
- **Полный сценарий приглашения участника лейбла**: схема `label_members` дополнена `invite_token`/`invite_expires_at`/`user_id`. Новые эндпоинты `GET/POST /api/label-members/invite/:token` (публичные). Новая страница `/invite/:token` на фронте. Email-приглашение шлётся через существующий `sendMail` (best-effort, fallback на in-app notification, если у пользователя уже есть аккаунт). Цикл «лейбл пригласил → приглашённый создал пароль → вошёл и видит лейбл» работает end-to-end.
- **Тихие ошибки видны**: `loadNotifications`, `loadAcrConfig`, `loadSpotifyConfig` теперь логируют ошибку перед возвратом дефолта.
- **Zod-валидация**: `POST /api/analytics/ugc/import-spotify` (body) и `GET /api/distribution/acr/checks` (query) принимают только валидные параметры; иначе 400 с понятным сообщением.
- **Фикс «тест ACRCloud всегда зелёный»**: `acrcloudConnector.testConnection` теперь парсит JSON-тело ответа и проверяет `status.code` (3001 = неверный Access Key, 3014/3002 = неверная подпись, 0/1001/2004 = ключи валидны). Раньше смотрел только на HTTP-код и считал любой 200 успехом, хотя ACRCloud при битых ключах отвечает HTTP 200 + `{"status":{"code":3001,...}}`. Добавлен SSRF-allowlist `*.acrcloud.com`; тело ответа больше не отдаётся в UI.
- **Полный аудит всех `testConnection()` коннекторов** (риск: ложный «Подключено» у клиента). Введён флаг `unverified?: boolean` в `ConnectorResult` → маппится в статус `unverified` (жёлтая плашка на UI). Перерезаны:
  - **Реальный probe (ловит ложные креды → ok=false):** `resend` (GET /domains), `sendgrid` (GET /v3/scopes), `wise` (GET /v1/profiles), `stripe` (GET /v1/balance), `songtrust` (GET /api/v1/songwriters/), `vk_music` (users.get + строгий разбор `error.error_code`, ранее любая VK-ошибка → ok:true), `apple_music` (реальная подпись ES256 JWT из .p8 + GET /v1/catalog/us/songs), `cloudflare_r2` и `aws_s3` (полный SigV4-подписанный ListObjectsV2 + регексп-валидация account_id (32-hex) и region для anti-SSRF, ранее не-200/403 возвращали ok:true).
  - **Тест объективно невозможен → честный `unverified: true`** (раньше врали `ok: true`): `ascap`, `bmi`, `deezer` (OAuth требует браузер), `youtube_music`, `tiktok_music` (OAuth user-consent), `yandex_music`, `zvuk` (нет публичного API).
  - **DDEX-SFTP**: TCP-fallback (когда нет `ssh2-sftp-client`) теперь возвращает `unverified: true`, а не «подключено». Метод `deliverRelease` в SFTP-коннекторе помечен `unverified: true` с комментарием — он генерирует только XML-превью, реальную загрузку делает `delivery-worker` через `ddex/transports/sftp.ts`.
  - **UI**: `integrations-tab.tsx` и `integration-config-dialog.tsx` рендерят отдельный янтарный бейдж «Не проверено» для unverified, тосты пишут «сохранено, но без проверки» вместо «соединение OK».