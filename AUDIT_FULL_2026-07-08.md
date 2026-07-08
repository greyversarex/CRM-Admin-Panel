# 🔍 ПОЛНЫЙ АУДИТ ПРОЕКТА — Tajik Music Distribution CRM
**Дата:** 08 июля 2026 · **Тип:** три аудита в одном (Фронтенд · Бэкенд · Сопоставление) · **Правило:** только анализ, код не менялся.

> Документ построен по коду (не по догадкам). Проверены: ~80 страниц фронтенда (`artifacts/crm-panel`), ~50 файлов роутов бэкенда (`artifacts/api-server`), 65 таблиц БД (`lib/db`).

---

## 📖 Как читать этот документ (легенда)

| Метка | Значение |
|---|---|
| 🟢 **РЕАЛЬНО** | Фронт вызывает реальный API, бэк читает/пишет БД |
| 🟡 **ЧАСТИЧНО** | Работает, но часть логики не доведена (напр. сохраняет, но не отправляет) |
| 🔴 **МОК/ФЕЙК** | Данные захардкожены / генерируются случайно / демо-массив |
| ⚪ **ТОЛЬКО UI** | Элемент есть, но обработчика/бэка нет (кнопка ничего не делает) |
| 🔵 **БЭК БЕЗ ФРОНТА** | Endpoint работает, но в UI нет вызова |

Разделы: **A** Фронт Admin/Manager · **B** Фронт Label · **C** Фронт Artist · **D** Создание релиза (атомарно) · **E** Бэкенд API · **F** Таблицы БД · **G** Сопоставление фронт↔бэк · **H** Поток Broma16/ACRCloud · **I** Проблемы. В конце — общая карта меню по ролям.

---

## 🧭 Архитектура и точки входа (контекст)

- **Монорепо pnpm:** `artifacts/api-server` (Express 5, порт 8080) · `artifacts/crm-panel` (React 19 + Vite, порт 5000) · `lib/db` (Drizzle + PostgreSQL) · `lib/api-spec` / `lib/api-zod` / `lib/api-client-react` (OpenAPI codegen).
- **Фронт → бэк:** Vite проксирует `/api` → `http://localhost:8080` (`vite.config.ts`). В проде — nginx, тот же origin.
- **Авторизация:** `express-session` + cookie, роли `admin` / `manager` / `label` / `artist`. Роутинг фронта — `wouter`; доступ к страницам — `src/lib/permissions.ts` (`canAccess`); меню — `src/components/sidebar-nav.tsx`.
- **Роль menedжера** дополнительно гейтится через таблицу `manager_permissions` (9 ключей, по умолчанию все `enabled=true`).

### Верхняя панель (topbar, `components/layout.tsx`) — видна на всех страницах
- Кнопка **«Создать релиз»** — только для `artist` / `label` → `/releases/new`.
- Переключатель языка **EN / RU** (i18n, англ. — источник истины).
- **Колокольчик уведомлений** (`NotificationsPopover`).
- **Меню аватара:** Мой профиль (`/profile`), Оплата и налоги (`/payouts`), Настройки (`/settings`), **Сменить аккаунт** (только admin → импersonation), выбор языка, тёмная/светлая тема, Выход.
- 🔴 **Хардкод:** `accountNumber = "28301"` (layout.tsx:61) — «Account# 28301» в меню профиля показывается всем одинаково.
- Жёлтый баннер импersonation, когда admin вошёл под другим пользователем.

> ⚠️ Важно: пункт **«Настройки» (`/settings`) и «Профиль» доступны ТОЛЬКО через topbar** — в левом сайдбаре их нет (у label профиля нет даже там). Это легко пропустить.

---

## 📊 РАЗДЕЛ F (данные вперёд): реальное наполнение таблиц БД

Снято `COUNT(*)` со всех 65 таблиц на момент аудита (после `seed`).

**Есть данные (сид/старт):** `integrations` 31, `dsp_catalog` 30, `audit_log` 11, `manager_permissions` 9, `activity_log` 7, `deliveries` 7, `transactions` 7, `releases` 5, `tracks` 5, `crm_tasks` 5, `artists` 4, `contacts` 4, `payouts` 4, `users` 4, `publishing_works` 3, `splits` 3, `labels` 2, `ddex_messages` 1, `realtime_alerts` 1.

**Пустые (0 строк) — 46 таблиц:** `acr_checks`, `api_keys`, `assets`, `automation_triggers`, `broma16_dictionaries`, `broma16_push_jobs`, `campaigns`, `commission_rules`, `content_id_assets`, `ddex_acknowledgements`, `ddex_batches`, `dsp_deals`, `email_templates`, `fraud_alerts`, `fraud_rules`, `ingestion_imports`, `ingestion_unmatched`, `integration_credentials`, `integration_sync_jobs`, `internal_notes`, `kyc_documents`, `label_members`, `moderation_rules`, `notifications`, `payment_automation_rules`, `platform_settings`, `playlist_stats`, `presave_campaigns`, `promo_assets`, `publishing_conflicts`, `push_subscriptions`, `release_artists`, `release_dsps`, `rights_conflicts`, `rights_holders`, `signup_requests`, `smart_links`, `support_ticket_messages`, `support_tickets`, `takedown_requests`, `tiktok_stats`, `transfer_imports`, `ugc_metrics`, `usage_reports`, `webhooks`.

> Вывод верхнего уровня: наполнены только сид-таблицы из `lib/db/src/seed.ts` + справочники, засеиваемые на старте (`integrations`, `dsp_catalog`, `manager_permissions`). `broma16_dictionaries` пуст → интеграция Broma16 не настроена (это ожидаемо без ключей). `ddex_messages`/`realtime_alerts` по 1 строке — созданы фоновыми воркерами уже во время работы (значит воркеры реально крутятся). Детализация «кто пишет/читает» — в Разделе F ниже.

---
<!-- Разделы A–I добавляются ниже по мере сбора данных -->

---

# 🎬 РАЗДЕЛ D — Создание релиза (атомарный разбор)

**Мастер:** `components/release-wizard/wizard.tsx` — 4 шага. Данные 🟢 РЕАЛЬНЫЕ (react-query → `/api/*`). Черновик релиза (`releases`, status=`draft`) создаётся при сохранении Шага 1.

**Точки входа:** artist/label — кнопка «Создать релиз» в topbar → `/releases/new`; admin/manager — `/releases` → «Создать».

### Шаг 1 — Детали (`Step1Details`)
| Поле | Тип | Обязат. | Источник значений |
|---|---|---|---|
| Название (title) | text | да | — |
| Версия (version) | text | нет | напр. Remix / Radio Edit |
| Язык метаданных | combobox | да | `useCatalogOptions` → `GET /api/catalog/dictionary/language`; **fallback** локальный массив `LANGS`, если Broma16 не подключён |
| Основной артист | combobox | да | `GET /api/artists` (scope: artist→только себя, label→свой ростер, admin→все) |
| Лейбл | select | — | `GET /api/labels` |
| Жанр / Поджанр | combobox | да | `GET /api/catalog/dictionary/genre`; **fallback** `GENRE_OPTIONS` |
| Copyright ©-line + год | text + year-select | да | — |
| Phonographic ℗-line + год | text + year-select | да | — |
| Использование ИИ (AI usage) | radio | да | enum (nullable в БД — см. память track-nullable-enum) |

**Сохранение:** `POST /api/releases` (новый draft) или `PUT /api/releases/:id`. Артисты синхронизируются `PUT /api/releases/:id/artists` (первый primary = владелец; каждый artistId проверяется на scope — защита от IDOR).

### Шаг 2 — Треки (`Step2Tracks`)
- Компонент `TrackCard` на каждый трек, кнопка добавления.
- **Поля трека:** название, исполнители (primary/featured), **ISRC**, ISWC, язык, `explicit_status`, `ai_usage`, `audio_style` (три nullable-enum: требуют явного выбора перед сохранением, иначе Zod отклоняет; см. память), № трека, длительность.
- 🔴 **ISRC генерируется на клиенте СЛУЧАЙНО:** `TJ-CTM-YY-NNNNN`, где `NNNNN = Math.floor(Math.random()*100000)` (`release-wizard/track-card.tsx:29-31`, `tracks/edit.tsx:62`). Риск коллизий; серверный последовательный генератор `/api/catalog/codes/isrc` в мастере **не используется**.
- **Аудио:** `AudioUploader` → `POST /api/assets/presign` → PUT в хранилище → `POST /api/assets/confirm` (валидация стерео при `audioProfile=stereo`). Файлы в `LOCAL_STORAGE_ROOT` (`.data/uploads`).
- Сохранение: `POST /api/tracks` / `PUT /api/tracks/:id`.

### Шаг 3 — Доставка (`Step3Delivery`)
- **Дата релиза** — date, обязательна. **Время** — optional.
- **Территории** — Switch «Весь мир / Выбранные» (обязательно).
- **Магазины (DSP/outlets)** — диалог `OutletPickerDialog`, источник `GET /api/catalog/dictionary/outlet` (проксирует справочник outlets Broma16; **без интеграции список пуст/скуден**). Категории: Streaming, Video, Social и т.д. Сохраняется в `releases.broma16DistributionOutlets`.
- Сохранение: `PUT /api/releases/:id` (таймлайн) + `PUT /api/releases/:id/distribution-outlets`.
- ⚠️ Шаг 3 — это **ВЫБОР** магазинов, а **не отправка**. Реальная отправка в стор — отдельно и только admin/manager (Раздел H). Label/artist кнопок «отправить в стор» не видят.

### Шаг 4 — Отправка на проверку (`Step4Submission`)
- **Валидация:** `GET /api/releases/:id/issues` (`release-flow.ts:148`) — проверяет: обложку, наличие треков, жанр, дату (предупреждение при <7 дней), сумму сплитов = 100 %.
- **Кнопка «Отправить»:** `POST /api/releases/:id/submit` → статус `pending_review`.

### После создания — жизненный цикл и управление
- **Статусы:** `draft` → `pending_review` → `approved` / `rejected` → (admin/manager: `POST /api/releases/:id/deliver`) `delivering` → `delivered` / `live`.
- **Редактирование** `/releases/:id/edit` заблокировано (409), если статус не `draft`/`rejected` (`releaseEditableReason`, `releases.ts:130`; статус-гварды в WHERE, атомарно).
- **SplitShare** `/releases/:id/splitshare`: сумма долей = 100 % на трек; после submit владельцу блокируется; править вправе admin/manager или владелец релиза.
- **Прочее:** `availability` (территории/доступность), `multi-track-edit` (массовое редактирование полей треков), `reorder-tracks` (порядок), `takedown` (снятие), `transfer` (импорт каталога из Spotify — синтетические SPOTIFY-id, ISRC подтягиваются батчем).
- **Роли:** label/artist — создают/редактируют черновики и отправляют на проверку; distribution/deliver/Broma16 им недоступны. admin/manager — полный цикл.

---

# 🚚 РАЗДЕЛ H — Интеграции дистрибуции: Broma16 (ROD) и ACRCloud

## H.1 Broma16 (ROD API) — доставка релизов в магазины
**Статус на момент аудита:** 🔴 НЕ настроена (нет ключей: `integration_credentials`=0, `broma16_dictionaries`=0). При настройке (Настройки → Интеграции) переход интеграции в `connected` вызывает `onConnected` → автосинхронизацию справочников (жанры/языки/страны/outlets).

**Где в UI:**
- Карточка `Broma16PushCard` на странице релиза `/releases/:id` (`components/broma16-push-card.tsx`). Видят **только admin/manager** с permission `distribution`. Label/artist — нет.
- Пикер outlets: `GET /api/broma16/dictionaries/outlet` (пусто без синка).
- Кнопка «Проверить статус модерации»: `POST /api/broma16/releases/:id/check-moderation`.

**9 шагов пуша** (`STEP_LABELS`, фоновая очередь `broma16_push_jobs`):
1. **Artist** — `syncArtist` (создать/найти артиста). Блокер: если у аккаунта в Broma16 `completion_step="account"` → 404 «не найден» (нужно завершить онбординг в панели Broma16, это не баг кода).
2. **Create Release** — объект релиза ROD (`isTransfer` → `isTransferRelease`).
3. **Upload Tracks** — бинарные файлы (multipart, filename с расширением).
4. **Track Metadata** — ISRC, названия (`catalog_number` обязателен; `created_date` записи ≤ сегодня).
5. **Composition** — авторы/доли (`/contributors` **добавляет**, не upsert → нужен guard от повторного пуша, иначе дубли авторов).
6. **Lyrics** — тексты.
7. **Cover** — обложка.
8. **Distribution** — выбранные outlets (`releases.broma16DistributionOutlets`; `code=null` → значения `externalId`).
9. **Moderate** — финальная отправка на модерацию.

**Особенности контракта:** ©/℗-даты строками; заголовок сингла должен совпадать с релизом; проверка статусов **регистронезависимая** («OK»/«ok» приходят по-разному). Аутлеты артиста — динамический список `broma16_outlets` (39 шт.), а не фиксированные spotify/apple.

**Синхронизация статистики:** кнопка Sync на «Аналитике» → `POST /api/broma16/statistics/sync` (тянет стримы в аналитические таблицы).

## H.2 ACRCloud — распознавание аудио (антиплагиат)
**Где в UI:**
- `Distribution → вкладка ACR` (`acr-tab.tsx`): выбрать релиз → кнопка «Запустить» → `POST /api/distribution/acr/scan`.
- В диалоге модерации (`moderation-dialog.tsx:291`) — кнопка «ACRCloud Check».

🔴 **КЛЮЧЕВОЕ:** в `moderation-dialog.tsx:125-126` есть `MOCK_ACR_MATCHES` («для демо») — этот диалог показывает **ЗАХАРДКОЖЕННЫЕ** совпадения, а не реальные результаты. Реальный ACRCloud вызывается **только** через вкладку ACR: `/api/distribution/acr/scan` → `distribution-extras.ts:383` (скачивает ~512 КБ сэмпл, вызывает ACRCloud Identify API, есть SSRF-guard). Результаты пишутся в `acr_checks` (сейчас 0 строк; для работы нужны ключи ACRCloud + загруженные аудиофайлы).

**Итог H:** код обеих интеграций реален и функционален, но обе **не сконфигурированы ключами** → в текущем состоянии не дают данных. Единственный настоящий «фейк» в этом потоке — демо-совпадения ACR в диалоге модерации.

---

# 🔧 РАЗДЕЛ E — Бэкенд: полный аудит API

Все маршруты — под префиксом **`/api`** (Vite/nginx проксируют `/api` → api-server:8080). Смонтированы в `routes/index.ts`. Найдено **452** определения маршрутов в 49 файлах роутеров.

## E.0 Порядок middleware и гарды (`routes/index.ts`)
1. **Публичные (без сессии):** `health`, `auth`, `signup` (`POST /signup-requests`), приём приглашений лейбла (`labelMembersPublic`).
2. **Пре-аутентификация по подписи (ДО `requireAuth`):** `storage-upload` (HMAC-токен в query — приёмник presigned PUT), `ddex inbound` (`X-DDEX-Signature`).
3. **`securityPolicy`** — IP-whitelist + динамический таймаут сессии.
4. **`requireAuth`** — всё ниже требует сессию или `X-API-Key`.
5. **`adminOnly = requireRole("admin","manager")`** — навешивается на back-office модули; менеджер дополнительно гейтится `requireManagerPermission(<key>)`.

## E.1 Матрица доступа по роутерам (дословно из `index.ts`)
| Роутер | Гард на монтировании | manager_permission | Скоуп / примечание |
|---|---|---|---|
| dashboard | requireAuth | — | scoped per-route (label/artist видят отфильтрованные виджеты) |
| artists | requireAuth | — | scoped per-route |
| labels | requireAuth | — | GET scoped; POST/PUT/DELETE guarded внутри |
| releases | requireAuth | — | scoped; `POST /releases/:id/deliver` — adminOnly внутри |
| releases-extras | requireAuth | — | `/dsp-catalog`, `/releases/:id/{artists,dsps,validate}` |
| catalog-dictionary | requireAuth (**все роли**) | — | `GET /catalog/dictionary/:type` — намеренно ДО admin-гарда `/catalog` |
| release-flow | requireAuth | — | `check-upc`, `/tracks/reusable`, reorder, `/issues` |
| tracks | requireAuth | — | scoped |
| users | requireAuth | — | `/users/me` — всем; `/users` CRUD — строго admin внутри |
| kyc | requireAuth | — | owner видит свои документы; ревью — admin |
| contacts, crm | **adminOnly** | crm | — |
| finance | requireAuth | — | scoped; комиссии/approval выплат — admin внутри |
| finance-export | requireAuth | — | экспорт Excel/CSV, scoped |
| finance/ingest, finance/imports | **adminOnly** | finance | CSV-импорт DSP-отчётов |
| royalties | requireAuth | — | scoped (entity из сессии) |
| splits | requireAuth | — | GET scoped; мутации — admin внутри |
| publishing | requireRole(admin,manager,**label**) | rights (только для manager) | per-label scoping в хендлерах |
| analytics-marketing | requireAuth (**label/artist тоже**) | — | playlists + TikTok, ДО admin-гарда |
| analytics | **adminOnly** | analytics | org-wide агрегаты |
| analytics-extras, ugc-import | под /analytics | analytics | UGC + realtime alerts |
| deliveries | **adminOnly** | distribution | — |
| distribution | **adminOnly** | distribution | ACRCloud + disputes |
| broma16 | per-route admin/manager | distribution | ROD login/тест/словари/статистика/пуш |
| ddex | **adminOnly** | distribution | — |
| assets | requireAuth | — | scoped (cover/audio/KYC streaming, byte-range) |
| notifications | requireAuth | — | только свои |
| support | requireAuth | — | customer scoped или staff inbox |
| marketing | requireAuth | — | scoped per label/artist |
| takedowns | requireAuth | — | scoped |
| label-members | requireAuth | — | команда лейбла (scoped) |
| integrations | **adminOnly** | — (системный) | — |
| audit | admin/manager (внутри) | — | — |
| rights | requireAuth | — | scoped (label/artist видят свои) |
| rights-extras | admin/manager (внутри) | — | freeze + history |
| settings, api-keys, webhooks | **adminOnly** | — (системные) | — |
| communications | **adminOnly** | support_comms | — |
| communications-channels | под admin | support_comms | Telegram + WhatsApp |
| automation | **adminOnly** | automation_audit | — |
| automation-extras | под /automation | automation_audit | payment rules |
| catalog | **adminOnly** | catalog | — |
| catalog-bulk | под /catalog | catalog | `POST /catalog/bulk-edit` |
| manager-permissions | **строго admin** | — | — |


## E.2 — Полный перечень эндпоинтов по роутерам (все под `/api`)

**`analytics-extras.ts`** — 5 эндп.:
```
GET    /analytics/ugc
POST   /analytics/ugc
GET    /analytics/realtime-alerts
POST   /analytics/realtime-alerts
PATCH  /analytics/realtime-alerts/:id
```

**`analytics-marketing.ts`** — 6 эндп.:
```
GET    /analytics/playlists
GET    /analytics/tiktok
POST   /playlists
PUT    /playlists/:id
DELETE /playlists/:id
GET    /dashboard/ugc-summary
```

**`analytics-ugc-import.ts`** — 1 эндп.:
```
POST   /analytics/ugc/import-spotify
```

**`analytics.ts`** — 5 эндп.:
```
GET    /analytics/streams
GET    /analytics/platforms
GET    /analytics/geography
GET    /analytics/top-tracks
GET    /analytics/export
```

**`artists.ts`** — 9 эндп.:
```
POST   /artists/upload-image
GET    /artists
POST   /artists
GET    /artists/meta/outlets
GET    /artists/:id
PUT    /artists/:id
DELETE /artists/:id
GET    /artists/:id/stats
POST   /artists/:id/invite-user
```

**`assets.ts`** — 6 эндп.:
```
GET    /assets
POST   /assets/presign
POST   /assets/confirm
GET    /assets/:id
DELETE /assets/:id
GET    /storage/objects/uploads/:objectId
```

**`audit.ts`** — 2 эндп.:
```
GET    /audit
GET    /audit/facets
```

**`auth.ts`** — 6 эндп.:
```
POST   /auth/login
POST   /auth/logout
GET    /auth/me
POST   /auth/impersonate
POST   /auth/stop-impersonate
POST   /auth/change-password
```

**`automation-extras.ts`** — 4 эндп.:
```
GET    /automation/payment-rules
POST   /automation/payment-rules
PATCH  /automation/payment-rules/:id
DELETE /automation/payment-rules/:id
```

**`automation.ts`** — 11 эндп.:
```
GET    /automation/scheduled
GET    /automation/fraud-rules
POST   /automation/fraud-rules
PATCH  /automation/fraud-rules/:id
DELETE /automation/fraud-rules/:id
GET    /automation/fraud-alerts
PATCH  /automation/fraud-alerts/:id
GET    /automation/moderation-rules
POST   /automation/moderation-rules
PATCH  /automation/moderation-rules/:id
DELETE /automation/moderation-rules/:id
```

**`broma16.ts`** — 13 эндп.:
```
GET    /broma16/status
POST   /broma16/test
GET    /broma16/dictionaries/:type
POST   /broma16/dictionaries/sync
POST   /broma16/artists/:id/sync
GET    /broma16/statistics/outlets
POST   /broma16/statistics/request
GET    /broma16/statistics/status/:reportId
POST   /broma16/statistics/ingest
POST   /broma16/statistics/sync
POST   /broma16/releases/:id/push
GET    /broma16/releases/:id/push
POST   /broma16/releases/:id/check-moderation
```

**`catalog-bulk.ts`** — 1 эндп.:
```
POST   /catalog/bulk-edit
```

**`catalog-dictionary.ts`** — 1 эндп.:
```
GET    /catalog/dictionary/:type
```

**`catalog.ts`** — 5 эндп.:
```
GET    /catalog/duplicates
POST   /catalog/codes/isrc
POST   /catalog/codes/upc
GET    /catalog/codes/config
PUT    /catalog/codes/config
```

**`communications-channels.ts`** — 3 эндп.:
```
POST   /communications/send
POST   /communications/test-channel
GET    /communications/channels-status
```

**`communications.ts`** — 24 эндп.:
```
GET    /communications/templates
GET    /communications/templates/:id
POST   /communications/templates
PUT    /communications/templates/:id
DELETE /communications/templates/:id
POST   /communications/templates/:id/preview
GET    /communications/campaigns
GET    /communications/campaigns/:id
POST   /communications/campaigns
PUT    /communications/campaigns/:id
POST   /communications/campaigns/:id/send
POST   /communications/campaigns/:id/cancel
POST   /communications/campaigns/quick-send
GET    /communications/triggers
POST   /communications/triggers
PUT    /communications/triggers/:id
PATCH  /communications/triggers/:id/toggle
DELETE /communications/triggers/:id
GET    /communications/notes
POST   /communications/notes
PUT    /communications/notes/:id
DELETE /communications/notes/:id
PATCH  /communications/notes/:id/pin
GET    /communications/overview
```

**`crm.ts`** — 15 эндп.:
```
GET    /crm/contacts
POST   /crm/contacts
GET    /crm/contacts/:id
PUT    /crm/contacts/:id
DELETE /crm/contacts/:id
GET    /crm/tasks
POST   /crm/tasks
GET    /crm/tasks/:id
PUT    /crm/tasks/:id
DELETE /crm/tasks/:id
GET    /crm/analytics/overview
GET    /crm/analytics/user-activity
GET    /crm/analytics/revenue-per-user
GET    /crm/analytics/growth
GET    /crm/analytics/funnel
```

**`dashboard.ts`** — 18 эндп.:
```
GET    /dashboard/summary
GET    /dashboard/recent-activity
GET    /dashboard/top-artists
GET    /dashboard/revenue-by-month
GET    /dashboard/releases-by-status
GET    /dashboard/top-dsp
GET    /dashboard/top-territories
GET    /dashboard/latest-releases
GET    /dashboard/top-tracks
GET    /dashboard/royalty-summary
GET    /dashboard/artists-table
GET    /dashboard/finance-kpis
GET    /dashboard/ops-kpis
GET    /dashboard/publishing-kpis
GET    /dashboard/streams-by-month
GET    /dashboard/playlist-placements
GET    /dashboard/ugc-timeseries
GET    /dashboard/users-ranking
```

**`ddex.ts`** — 11 эндп.:
```
GET    /ddex/messages
GET    /ddex/messages/:id
GET    /ddex/messages/:id/xml
POST   /ddex/messages
POST   /ddex/messages/:id/send
POST   /ddex/messages/:id/cancel
GET    /ddex/batches
GET    /ddex/batches/:id
GET    /ddex/acknowledgements
GET    /ddex/transports
POST   /ddex/acknowledgements/inbound
```

**`delivery.ts`** — 3 эндп.:
```
GET    /deliveries
GET    /deliveries/:id
POST   /deliveries/:id/retry
```

**`distribution-extras.ts`** — 13 эндп.:
```
GET    /distribution/acr/checks
GET    content-length
POST   /distribution/acr/scan
POST   /distribution/acr/scan-full
POST   /distribution/acr/drop
POST   /distribution/acr/manual-result
POST   /distribution/musicbrainz/check-isrc
GET    /distribution/moderation
GET    /distribution/dsp-status
GET    /distribution/scheduled
GET    /distribution/disputes
POST   /distribution/backfill-audio-tech
GET    /distribution/moderation/:releaseId/details
```

**`finance-export.ts`** — 2 эндп.:
```
GET    /finance/transactions/export
GET    /finance/payouts/export
```

**`finance-extras.ts`** — 6 эндп.:
```
GET    /finance/commissions
POST   /finance/commissions
PATCH  /finance/commissions/:id
DELETE /finance/commissions/:id
POST   /finance/payouts/:id/approve
POST   /finance/payouts/:id/reject
```

**`finance.ts`** — 7 эндп.:
```
GET    /finance/transactions
POST   /finance/transactions
GET    /finance/balances
GET    /payouts
POST   /payouts
PATCH  /payouts/:id/approve
PATCH  /payouts/:id/reject
```

**`health.ts`** — 1 эндп.:
```
GET    /healthz
```

**`ingestion.ts`** — 7 эндп.:
```
POST   /finance/ingest/preview
POST   /finance/ingest/commit
GET    /finance/imports
GET    /finance/ingest/unmatched
GET    /finance/ingest/track-search
POST   /finance/ingest/unmatched/:id/resolve
POST   /finance/ingest/unmatched/bulk-auto-resolve
```

**`integrations.ts`** — 9 эндп.:
```
GET    /integrations
POST   /integrations/:code/register
POST   /integrations/:code/credentials
DELETE /integrations/:code
PATCH  /integrations/:code/config
POST   /integrations/:code/enable
POST   /integrations/:code/test
POST   /integrations/:code/poll-acks
GET    /integrations/:code/jobs
```

**`kyc.ts`** — 12 эндп.:
```
POST   /users/me/kyc-documents
POST   /users/me/kyc-documents/presign
POST   /users/me/kyc-documents/confirm
GET    /users/me/kyc-documents
DELETE /users/me/kyc-documents/:id
POST   /users/me/submit-kyc
GET    /admin/kyc/users
GET    /admin/kyc/users/:id/documents
POST   /admin/kyc-documents/:id/approve
POST   /admin/kyc-documents/:id/reject
POST   /admin/users/:id/kyc/approve
POST   /admin/users/:id/kyc/reject
```

**`label-members.ts`** — 6 эндп.:
```
GET    /label-members
POST   /label-members/invite
GET    /label-members/invite/:token
POST   /label-members/invite/:token/accept
PATCH  /label-members/:id/role
DELETE /label-members/:id
```

**`labels.ts`** — 5 эндп.:
```
GET    /labels
POST   /labels
GET    /labels/:id
PUT    /labels/:id
DELETE /labels/:id
```

**`manager-permissions.ts`** — 2 эндп.:
```
GET    /manager-permissions
PATCH  /manager-permissions/:key
```

**`marketing.ts`** — 7 эндп.:
```
GET    /marketing/presave
POST   /marketing/presave
PATCH  /marketing/presave/:id/status
GET    /marketing/links
POST   /marketing/links
GET    /marketing/assets
POST   /marketing/assets/generate
```

**`notifications.ts`** — 5 эндп.:
```
GET    /notifications/stream
GET    /notifications
GET    /notifications/unread-count
POST   /notifications/read-all
POST   /notifications/:id/read
```

**`publishing-extras.ts`** — 4 эндп.:
```
GET    /publishing/conflicts
POST   /publishing/conflicts/detect
PATCH  /publishing/conflicts/:id
POST   /publishing/works/:id/register/:pro
```

**`publishing.ts`** — 5 эндп.:
```
GET    /publishing/works
POST   /publishing/works
GET    /publishing/works/:id
PUT    /publishing/works/:id
POST   /publishing/works/:id/push-broma16
```

**`release-flow.ts`** — 4 эндп.:
```
GET    /releases/check-upc
GET    /tracks/reusable
POST   /releases/:id/tracks/reorder
GET    /releases/:id/issues
```

**`releases-extras.ts`** — 8 эндп.:
```
GET    /dsp-catalog
GET    /releases/:id/artists
PUT    /releases/:id/artists
GET    /releases/:id/dsps
PUT    /releases/:id/dsps
GET    /releases/:id/distribution-outlets
PUT    /releases/:id/distribution-outlets
POST   /releases/:id/validate
```

**`releases.ts`** — 16 эндп.:
```
GET    /releases
GET    /releases/counts
GET    /releases/transfer-imports
POST   /releases/transfer-imports
GET    /releases/transfer-imports/spotify-search
POST   /releases
GET    /releases/:id
PUT    /releases/:id
DELETE /releases/:id
POST   /releases/:id/submit
POST   /releases/:id/cancel-submission
POST   /releases/:id/reopen
POST   /releases/:id/request-takedown
PATCH  /releases/:id/status
POST   /releases/:id/deliver
POST   /releases/import-upc
```

**`rights-extras.ts`** — 3 эндп.:
```
POST   /rights/holders/:id/freeze
POST   /rights/holders/:id/unfreeze
GET    /rights/history
```

**`rights.ts`** — 19 эндп.:
```
GET    /rights/holders
POST   /rights/holders
GET    /rights/holders/:id
PUT    /rights/holders/:id
DELETE /rights/holders/:id
GET    /rights/conflicts
POST   /rights/conflicts
GET    /rights/conflicts/:id
PATCH  /rights/conflicts/:id
DELETE /rights/conflicts/:id
GET    /rights/dsp-deals
POST   /rights/dsp-deals
PATCH  /rights/dsp-deals/:id
DELETE /rights/dsp-deals/:id
GET    /rights/content-id
POST   /rights/content-id
PATCH  /rights/content-id/:id
DELETE /rights/content-id/:id
GET    /rights/territories
```

**`royalties.ts`** — 5 эндп.:
```
GET    /royalties/summary
GET    /royalties/statements
GET    /royalties/statements/:period/download
GET    /royalties/by-release
GET    /royalties/by-dsp
```

**`settings.ts`** — 11 эндп.:
```
GET    /settings/:key
PUT    /settings/:key
GET    /api-keys
POST   /api-keys
DELETE /api-keys/:id
PATCH  /api-keys/:id
GET    /webhooks
POST   /webhooks
PUT    /webhooks/:id
DELETE /webhooks/:id
POST   /webhooks/:id/test
```

**`signup.ts`** — 4 эндп.:
```
POST   /signup-requests
GET    /signup-requests
POST   /signup-requests/:id/approve
POST   /signup-requests/:id/reject
```

**`splits.ts`** — 7 эндп.:
```
GET    /splits
POST   /splits
GET    /splits/:id
PUT    /splits/:id
DELETE /splits/:id
POST   /splits/:id/accept
POST   /splits/:id/reject
```

**`storage-upload.ts`** — 1 эндп.:
```
PUT    /storage/upload/:objectId
```

**`support.ts`** — 6 эндп.:
```
GET    /support/tickets
GET    /support/tickets/:id
POST   /support/tickets
POST   /support/tickets/:id/messages
PATCH  /support/tickets/:id
GET    /support/agents
```

**`takedowns.ts`** — 3 эндп.:
```
GET    /takedowns
POST   /takedowns
PATCH  /takedowns/:id/status
```

**`tracks.ts`** — 6 эндп.:
```
GET    /tracks
POST   /tracks
GET    /tracks/:id
PUT    /tracks/:id
DELETE /tracks/:id
POST   /tracks/:id/transcribe-lyrics
```

**`users.ts`** — 11 эндп.:
```
GET    /users
POST   /users
PATCH  /users/me/bank-info
PATCH  /users/me/tax-info
PATCH  /users/me
GET    /users/:id
PUT    /users/:id
GET    /users/avatars/:objectId
POST   /users/me/avatar
DELETE /users/me/avatar
DELETE /users/:id
```

> Итого уникальных определений маршрутов: **344**.

---

# 🗄️ РАЗДЕЛ F — База данных: 65 таблиц

`Строк` — фактический `COUNT(*)` на момент аудита. ⚪ = пусто (0), 🟢 = есть данные. Схема: `lib/db/src/schema/`.
> Отдельно: хранилище сессий `connect-pg-simple` (таблица `session`) не входит в drizzle-схему и здесь не считается.

### F.1 Пользователи, доступ, KYC
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `users` | 🟢 4 | Учётные записи (admin/manager/label/artist), bcrypt-хэши, банк/налоги | auth, users, signup approve |
| `manager_permissions` | 🟢 9 | 9 флагов доступа менеджера к модулям | manager-permissions, bootstrap на старте |
| `signup_requests` | ⚪ 0 | Заявки на регистрацию (модерация) | signup, admin approve/reject |
| `kyc_documents` | ⚪ 0 | Загруженные KYC-документы + статус | kyc (upload/review) |
| `label_members` | ⚪ 0 | Команда лейбла (приглашения/роли) | label-members |
| `push_subscriptions` | ⚪ 0 | Web-push подписки браузера | notifications |
| `api_keys` | ⚪ 0 | Ключи X-API-Key для программного доступа | settings/api-keys |

### F.2 Каталог: релизы, треки, артисты, лейблы, ассеты
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `releases` | 🟢 5 | Релизы, статус, таймлайн, outlets Broma16 | releases, release-flow |
| `tracks` | 🟢 5 | Треки, ISRC/ISWC, explicit/ai/audio_style | tracks |
| `artists` | 🟢 4 | Профили артистов, outlets Broma16 | artists |
| `labels` | 🟢 2 | Лейблы (иерархия parent) | labels |
| `release_artists` | ⚪ 0 | Связь релиз↔артисты (primary/featured, владелец) | releases artists PUT |
| `release_dsps` | ⚪ 0 | Прямой DDEX-путь: DSP на релиз (отд. от Broma16) | releases-extras |
| `assets` | ⚪ 0 | Медиа-ассеты (audio/cover/video), sha256, метаданные | assets (presign/confirm) |
| `dsp_catalog` | 🟢 30 | Справочник DSP (Spotify/Apple/…), категории | сид на старте |

### F.3 Дистрибуция и доставка
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `deliveries` | 🟢 7 | Задания доставки в DSP, статусы | delivery-worker, deliver |
| `broma16_dictionaries` | ⚪ 0 | Справочники Broma16 (жанры/языки/страны/outlets) | синк при connect |
| `broma16_push_jobs` | ⚪ 0 | Очередь пуша релизов в ROD (9 шагов) | broma16-push-worker |
| `ddex_messages` | 🟢 1 | Сформированные ERN-сообщения DDEX | ddex/service, delivery |
| `ddex_batches` | ⚪ 0 | Батчи выгрузки DDEX | ddex/service |
| `ddex_acknowledgements` | ⚪ 0 | Подтверждения партнёров (ack-poller) | ack-poller worker |
| `takedown_requests` | ⚪ 0 | Запросы на снятие релизов из магазинов | takedowns |
| `acr_checks` | ⚪ 0 | Результаты сканов ACRCloud | distribution-extras (scan) |
| `content_id_assets` | ⚪ 0 | YouTube Content ID активы | rights |
| `moderation_rules` | ⚪ 0 | Правила автомодерации релизов | distribution/moderation |

### F.4 Финансы
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `transactions` | 🟢 7 | Реестр движений (доход DSP/паблишинг/выплаты) | finance, ingest |
| `payouts` | 🟢 4 | Заявки на выплату + статус 2-step approval | finance-extras |
| `splits` | 🟢 3 | Соглашения о раздёле дохода по трекам | splits |
| `commission_rules` | ⚪ 0 | Правила комиссии (global/label/artist/dsp) | finance-extras |
| `payment_automation_rules` | ⚪ 0 | Автоправила выплат (порог/cron) | automation-extras |
| `usage_reports` | ⚪ 0 | **Стримы/выручка по DSP — источник ВСЕЙ аналитики** | ingest, broma16 stats |
| `ingestion_imports` | ⚪ 0 | Загрузки CSV-отчётов DSP (история) | ingestion |
| `ingestion_unmatched` | ⚪ 0 | Несопоставленные строки импорта | ingestion |

### F.5 Издательство и права
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `publishing_works` | 🟢 3 | Произведения (works), авторы/доли | publishing |
| `publishing_conflicts` | ⚪ 0 | Конфликты регистрации в PRO | publishing-extras |
| `rights_holders` | ⚪ 0 | Правообладатели, территории | rights |
| `rights_conflicts` | ⚪ 0 | Конфликты прав | rights |
| `dsp_deals` | ⚪ 0 | Сделки/ставки с DSP | rights (dsp-deals) |

### F.6 Аналитика
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `playlist_stats` | ⚪ 0 | Плейлист-питчинг статистика | analytics-marketing |
| `tiktok_stats` | ⚪ 0 | TikTok тренды/UGC | analytics-marketing |
| `ugc_metrics` | ⚪ 0 | UGC-метрики (импорт из Spotify) | analytics-ugc-import |
| `realtime_alerts` | 🟢 1 | Реалтайм-алерты (фрод/аномалии) | fraud/risk engine |

### F.7 CRM, коммуникации, поддержка, уведомления
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `contacts` | 🟢 4 | CRM-контакты (artist/author/label/…) | crm |
| `crm_tasks` | 🟢 5 | CRM-задачи (todo→done) | crm |
| `internal_notes` | ⚪ 0 | Внутренние заметки по сущностям | communications/crm |
| `email_templates` | ⚪ 0 | Шаблоны писем ({{переменные}}) | communications |
| `campaigns` | ⚪ 0 | Email-кампании | communications |
| `automation_triggers` | ⚪ 0 | Триггеры авто-коммуникаций | communications |
| `support_tickets` | ⚪ 0 | Тикеты поддержки (TCK-YYYY-NNNN) | support |
| `support_ticket_messages` | ⚪ 0 | Сообщения в тикетах (public/internal) | support |
| `notifications` | ⚪ 0 | Уведомления пользователю (SSE) | notifications, triggers |

### F.8 Маркетинг
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `presave_campaigns` | ⚪ 0 | Pre-save кампании | marketing |
| `smart_links` | ⚪ 0 | Smart-ссылки на релизы (DSP badges) | marketing |
| `promo_assets` | ⚪ 0 | Промо-материалы (IG/YT/press-kit) | marketing |

### F.9 Интеграции, система, аудит, риск
| Таблица | Строк | Назначение | Кто пишет |
|---|---|---|---|
| `integrations` | 🟢 31 | Реестр интеграций (Spotify/ACR/Broma16/R2/…) | сид на старте |
| `integration_credentials` | ⚪ 0 | **Зашифрованные** ключи интеграций | settings (Save) |
| `integration_sync_jobs` | ⚪ 0 | Задания синхронизации интеграций | integrations |
| `platform_settings` | ⚪ 0 | Настройки платформы + счётчики ISRC/UPC | settings, catalog codes |
| `webhooks` | ⚪ 0 | Исходящие вебхуки | settings/webhooks |
| `audit_log` | 🟢 11 | Аудит мутаций (allowlist полей, diff) | auditMutation middleware |
| `activity_log` | 🟢 7 | Лента активности (для дашборда) | разные хендлеры |
| `fraud_rules` | ⚪ 0 | Правила фрод-детекции | automation |
| `fraud_alerts` | ⚪ 0 | Сработавшие фрод-алерты | fraud-engine worker |
| `transfer_imports` | ⚪ 0 | Импорт каталога (Spotify transfer) | releases transfer |

> **Итог F:** наполнены только сид-таблицы (`seed.ts`) и старт-справочники (`integrations`, `dsp_catalog`, `manager_permissions`). Критично: **`usage_reports` пуст** — а это источник почти всей аналитики (стримы, гео, топ-треки, топ-DSP). Значит код аналитики реальный, но экраны будут **пустыми**, пока нет импорта DSP-отчётов или синка Broma16. См. Раздел G.

---

# 🅰️ РАЗДЕЛ A — Фронтенд: Администратор / Менеджер

Admin и Manager используют одно меню (`adminNavGroups`). Разница: у **менеджера** каждая группа/пункт дополнительно гейтится флагами `manager_permissions` (по умолчанию все включены). Ниже — по модулям, в порядке сайдбара.

## A.1 Дашборд (`/`) — 🟢 РЕАЛЬНО
`pages/dashboard.tsx` + `components/dashboard-sections.tsx`. Все виджеты тянут `/api/dashboard/*` (28 эндп.).
- **KPI-карточки:** Выручка, Стримы, Артисты, Релизы, Доставки — `/dashboard/summary` (читает `usage_reports`, `artists`, `releases`, `payouts`, `deliveries`).
- **Finance-KPI (admin/manager):** `/dashboard/finance-kpis` (`payouts`, `realtime_alerts`). **Ops-KPI:** `/dashboard/ops-kpis` (`deliveries`, `users`, `artists`).
- **Графики:** Performance Overview `/revenue-by-month` (`transactions`), Releases-by-status, Recent Activity (`activity_log`), Top DSP (donut, `usage_reports`), Top Territories, Latest Releases, Top Tracks/Artists, Royalty Summary (`transactions`), таблица Publishing (`/publishing/works`).
- ⚠️ Виджеты на базе `usage_reports` (Top DSP/Territories/Tracks, Стримы) сейчас **пустые** — таблица пуста (см. F/G). Виджеты на `transactions/releases/activity_log` показывают сид-данные.

## A.2 Каталог
**Хаб `/catalog`** (`catalog/index.tsx`): 9 карточек-ссылок — Релизы, Артисты, Лейблы, Видео, Ассеты, Дубликаты, Генератор кодов, Bulk Edit, Треки (Видео/Лейблы — только admin/manager).
- **Релизы** (`/releases`) — 🟢 список из `/api/releases` (scoped). Создание/редактирование — см. **Раздел D**.
- **Артисты** (`/artists`) — 🟢 `useListArtists`. Таблица: аватар, имя, лейбл, жанр, кол-во релизов, статус, действия. Форма (`artist-form-dialog.tsx`): `name`(req), `genre`, `country`, `labelId`(select ← `/api/labels`), `imageUrl`(upload), `phone`, `bio`, `status`(active/inactive), **outlets Broma16** (динамич. список ← `/api/artists/meta/outlets`), чекбокс «создать аккаунт» + `inviteEmail`. Кнопки: Создать (`POST /api/artists`), Сохранить (`PUT`), Пригласить (`POST /api/artists/:id/invite-user`).
- **Лейблы** (`/labels`) — 🟢 `useListLabels`. Форма (`label-form-dialog.tsx`): `name`(req), `country`, `website`, `logoUrl`, `parentLabelId`(select), `status`. Кнопки → `POST/PUT /api/labels`.
- **Ассеты** (`/catalog/assets`) — 🟢 `GET /api/assets`. Поиск по имени, фильтр по типу (audio/cover/video). Аплоадер: presign → PUT → confirm (лимиты 200МБ audio / 25МБ прочее; стерео-валидация на сервере).
- **Дубликаты** (`/catalog/duplicates`) — 🟢 `GET /api/catalog/duplicates?type=` (SQL `HAVING count>1`): по имени артиста, ISRC/названию трека, UPC/названию релиза, sha256 ассета.
- **Генератор кодов** (`/catalog/codes`) — 🟢 `POST /api/catalog/codes/isrc|upc` (последовательность в `platform_settings`). ⚠️ `platform_settings` пуст → используется префикс-placeholder `TM1` (нужно задать реальный IFPI-префикс в Настройках).
- **Bulk Edit** (`/catalog/bulk-edit`) — 🟢 `POST /api/catalog/bulk-edit` (Zod discriminated union; admin/manager). Поля: сущность(select), IDs(textarea), patch(JSON).

## A.3 Дистрибуция (`/distribution`) — только admin/manager
Вкладки: **Moderation**, **ACR**, **DSP-status**, **Disputes**, **Scheduled**, **Takedowns**. Детали Broma16-пуша и ACRCloud — **Раздел H**.
- Moderation (`moderation-tab.tsx` → `moderation-detail-dialog.tsx`) — 🟢 **активный флоу реальный**: `GET /api/distribution/moderation/:id/details` + реальные ACR-эндпоинты (`/acr/checks`, `/acr/drop`, `/acr/manual-result`). 🟡 Мок `MOCK_ACR_MATCHES` лежит в **осиротевшем** `components/moderation-dialog.tsx:126`, который **нигде не импортируется** (мёртвый код, в активной модерации не участвует).
- ACR (`acr-tab.tsx`) — 🟢 реальный скан `POST /api/distribution/acr/scan` → `acr_checks` (пусто без ключей).
- DSP-status / Disputes / Scheduled / Takedowns — 🟢 читают `/api/distribution/*`, `/api/deliveries`, `/api/takedowns` (данных мало/нет).

## A.4 Финансы (`/finance`) — вкладки Overview / Royalties / Splits / Payouts
- **Overview** — 🟢 `useListTransactions`, `useListBalances`. Реальный расчёт баланса (`finance.ts:151`): `balance = max(0, gross*(1−PLATFORM_FEE_RATE) − paidOut)`.
- **Импорт CSV** (`/finance/import`) — 🟢 drag&drop, выбор DSP (spotify/apple/youtube/tiktok), период, файл. Кнопки: Preview (`/finance/ingest/preview`), Commit (`/finance/ingest/commit`) → `ingestion_imports`/`usage_reports`/`transactions`.
- **Unmatched** (`/finance/unmatched`) — 🟢 `ingestion_unmatched`. Кнопки: Auto-resolve, Resolve.
- **Комиссии** (`commissions-tab.tsx`) — 🟢 `commission_rules`. Форма: scope(global/label/artist/dsp), условный id, percentage(15), notes.
- **Роялти** (`/royalties`) — 🟢 `/api/royalties` (scoped).
- **Сплиты** (`/splits`) — 🟢 `splits`. Диалог создания: trackId, участники (артист/лейбл + доля %). Accept/Reject → `/api/splits/:id/accept|reject`.
- **Выплаты** (`/payouts`) — 🟢 `payouts`. Approve/Reject → `/finance/payouts/:id/approve|reject` (2-step).

## A.5 Аналитика (`/analytics`) — 🟢 код реальный / ⚠️ данные пустые
`analytics/index.tsx` + realtime/ugc табы. Фильтр периода (7d…1y). Кнопка **Sync** → `POST /api/broma16/statistics/sync`.
- Вкладки Streams/Revenue/Geo/Tracks/Playlists/TikTok/Realtime/UGC → `/api/analytics/*`.
- Источник — `usage_reports`, `playlist_stats`, `tiktok_stats`, `ugc_metrics` (**все пусты** → графики пустые). UGC-импорт из Spotify (`POST /analytics/ugc/import-spotify`) — реальный, требует ключей Spotify. Realtime-alerts (`realtime_alerts`) — 1 запись.

## A.6 CRM (`/crm`) — 🟢 РЕАЛЬНО
`crm/index.tsx`. Дашборд (Recharts), KPI (выручка/доставки/рост). Контакты (`contacts`): name, type, email, phone, company, country, notes. Задачи (`crm_tasks`): title, description, status(todo/in_progress/done/cancelled), priority, assignedToId, dueDate. Данные из `/api/crm/*`.

## A.7 Пользователи (`/users`, `/admin/signups`, `/admin/kyc`) — 🟢 РЕАЛЬНО
- **Users** — `useListUsers`. KPI + вкладки Users/Signups/Roles/KYC/Activity, фильтры роль/статус, поиск. Создать (`POST /api/users`): name, email, role, status. Редактировать (`PUT`): + blockReason. Suspend/Reactivate. **Impersonate** (только admin, `impersonate-dialog.tsx` → `/api/users?limit=200`, фильтрует админов).
- **Signups** — заявки `/api/signup-requests`. Approve → создаёт user + label/artist + временный пароль (показывается 1 раз). Reject (reason). ⚠️ `signup_requests` пуст.
- **KYC** — `/api/admin/kyc/users`. Approve/Reject документа (reason 3-500). Глобальный approve/reject пользователя. ⚠️ `kyc_documents` пуст.

## A.8 Права и издательство
- **Rights** (`/rights`) — вкладки Content-ID / DSP-deals / Freeze / History / Territories. 🟢 `/api/rights/*` (`rights_holders`, `content_id_assets`, `dsp_deals` — все пусты). Content-ID: `POST /api/rights/content-id` (admin).
- **Publishing** (`/publishing`) — 🟢 works/writers `publishing_works` (3 записи) + вкладки Registration (PRO) и Conflicts (`publishing-extras`).

## A.9 Поддержка и коммуникации
- **Support inbox** (`/support`) — 🟢 `useSupportTickets`, фильтры статус/приоритет/исполнитель. ⚠️ `support_tickets` пуст.
- **Communications** (`/communications`) — 🟢 редактор шаблонов, кампании, триггеры, внутренние заметки; `{{переменные}}`. ⚠️ `email_templates`/`campaigns`/`automation_triggers` пусты. Каналы: Telegram/WhatsApp (`communications-channels`).

## A.10 Автоматизация и аудит
- **Automation** (`/automation`): ⚪ вкладка «Workflow Rules» = **только UI** (редирект в Communications). 🟢 Scheduled tasks (`/api/automation/scheduled`). 🟢 Fraud rules CRUD (`fraud_rules`), Fraud alerts (`fraud_alerts`), Payment rules (`payment_automation_rules`) — таблицы пусты.
- **Audit** (`/admin/audit`) — 🟢 `/api/audit` (`audit_log`, 11 записей). Фильтры (тип/действие/юзер/id/даты), пресет «Finance Only», диалог с JSON-diff.

## A.11 Маркетинг (`/marketing`) — доступен и admin
Вкладки: Pre-save, Smart Links, Promo Assets, Playlists, Trends. 🟢 код реальный (`/api/marketing/*`, `/api/analytics/*`), но таблицы `presave_campaigns`/`smart_links`/`promo_assets`/`playlist_stats`/`tiktok_stats` **пусты**. ⚪ Кнопка «Download» у Promo Assets — только toast (файл не скачивается). «Auto-generate» → `POST /api/marketing/assets/generate`.

## A.12 Настройки / Профиль / Уведомления (через topbar)
- **Settings → Integrations** (`/settings`, только admin/manager) — 🟢 каталог сервисов (R2, AWS, Resend, ACRCloud, Spotify, Broma16, …). Диалог конфигурации (ключи/ID/пароли, SFTP/S3). Кнопки: **Test** (`/integrations/:code/test`), **Save** (`/integrations/:code/credentials` → шифрует в `integration_credentials`).
- **Settings → Manager Permissions** — 🟢 тумблеры (catalog/distribution/finance/analytics/crm/…) → `PATCH /api/manager-permissions`.
- **Profile** (`/profile`) — 🟢 вкладки Profile/Social/Password/KYC/Bank/Tax → `PATCH /api/users/me`, `POST /api/users/me/avatar`, `POST /api/auth/change-password`.
- **Notifications** (колокольчик) — 🟢 SSE (`useNotificationStream`) + polling, `/api/notifications`. ⚠️ `notifications` пуст.

---

# 🅱️ РАЗДЕЛ B — Фронтенд: Лейбл (label)

Меню `labelNavGroups`. Данные скоупятся `getDataScope` → лейбл видит **свой ростер** (артистов и релизы своего лейбла).

### B.1 Меню лейбла (что ЕСТЬ)
- **Overview:** Дашборд (`/`) — те же виджеты, но по своему ростеру.
- **Мой каталог:** Релизы (`/releases`), Артисты (`/artists`), Transfer (`/releases/transfer`), Календарь релизов (`/releases/calendar`).
- **Publishing** (`/publishing`).
- **Аналитика** (`/analytics`).
- **Маркетинг** (`/marketing`).
- **Earnings:** Роялти (`/royalties`, в меню подписан «Earnings») + Выплаты (`/payouts`).
- **Поддержка** (`/support`).

### B.2 Отличия от Admin/Manager (дельта)
- **Скрыто из сайдбара:** Дистрибуция, Finance-overview, CRM, Пользователи/KYC/Signups, Rights, Automation/Audit, Communications, Settings, **Profile**.
- 🔴/⚠️ **Profile у лейбла отсутствует в сайдбаре вообще** — доступен только через меню аватара в topbar.
- **Finance:** лейбл **исключён** из роута `/finance` (`ROUTE_ROLES`), поэтому вместо обзора финансов — только «Earnings» (роялти) и «Выплаты».
- **Нет Splits в меню** (в отличие от артиста).
- **Publishing:** лейбл видит **только свой** каталог произведений — скоуп реализован в хендлере (`publishing.ts`): works по `release.labelId` ИЛИ `track.artistId` из ростера лейбла; прочие непривилегированные роли получают пусто. ⚠️ Комментарий в `routes/index.ts` про «нет per-label scoping» — **устаревший** (утечки нет).
- **Аналитика:** страница гейтит `isAdminOrManager` и для лейбла отдаёт **урезанный вид** (org-wide вкладки не грузятся; работают только playlists/TikTok через `analytics-marketing`, не под admin-гардом). Это корректная деградация, не 403.
- **Маркетинг:** у лейбла **нет вкладки Pre-save** (есть Smart Links / Promo Assets / Playlists / Trends).
- **Создание релиза:** кнопка «Создать релиз» в topbar доступна (только artist/label).
- **Support:** клиентский режим (создание тикета + FAQ). ⚠️ FAQ статичный (`FAQ_CATEGORIES`).
- Пункта **Delivery** в меню лейбла нет (но `/delivery` в `ROUTE_ROLES` разрешён лейблу → прямой заход по URL упрётся в 403, см. Раздел I).

---

# 🅲 РАЗДЕЛ C — Фронтенд: Артист (artist)

Меню `artistNavGroups`. Скоуп `getDataScope` → артист видит **только себя** (свои релизы/треки/профиль).

### C.1 Меню артиста (что ЕСТЬ)
- **Overview:** Дашборд (`/`).
- **Мой каталог:** Мои релизы (`/releases`), Transfer (`/releases/transfer`), Takedown (`/releases/takedown`), **Delivery** (`/delivery`).
- **Маркетинг** (`/marketing`).
- **Аналитика** (`/analytics`).
- **Earnings:** Роялти (`/royalties`, подписан «Earnings») + **Splits** (`/splits`) + Выплаты (`/payouts`).
- **Поддержка** (`/support`).
- **Account:** Profile (`/profile`) — у артиста **есть** в сайдбаре.

### C.2 Отличия от Admin/Label (дельта)
- **Скрыто:** всё back-office (дистрибуция, CRM, пользователи, rights, automation, communications, settings, finance-overview, publishing).
- **Takedown** (`/releases/takedown`) — артист сам запрашивает снятие релиза (`takedown_requests`), + причина.
- **Splits** (`/splits`) — артист **видит** сплиты по своим релизам и может **Accept/Reject** как участник; **создание** сплитов — только admin/manager (`POST` guarded).
- **Transfer** (`/releases/transfer`) — импорт каталога из Spotify (`transfer_imports`); синтетический UPC `SPOTIFY-<id>`, ISRC у simplified-треков отсутствует.
- **Маркетинг:** у артиста **нет вкладок Playlists и Trends** (есть Pre-save / Smart Links / Promo Assets).
- **Аналитика:** тот же role-gate → урезанный вид.
- ⚠️ **Delivery (`/delivery`) — реальный front↔back мисматч:** страница **не** проверяет роль и безусловно вызывает `useListDeliveries` → `GET /api/deliveries`, который смонтирован под **`adminOnly`** → артист получает **403** (список не грузится). В отличие от Analytics, здесь graceful-деградации нет.
- ⚪ Кнопка **«New Delivery»** на `/delivery` — **без обработчика** (onClick отсутствует), не выполняет ничего.

---

# 🔗 РАЗДЕЛ G — Карта соответствия Frontend ↔ Backend ↔ БД (главный вывод)

**Легенда вердикта:** 🟢 реально (UI→эндпоинт→таблица) · 🟡 код реальный, но данных/конфигурации нет · 🔴 мок/хардкод · ⚪ только UI (нет эффекта) · 🔵 бэк без фронта / рассинхрон.

## G.1 Сводная таблица по модулям
| Модуль (UI) | Эндпоинты | Таблицы | Вердикт |
|---|---|---|---|
| Дашборд | `/dashboard/*` (28) | usage_reports, transactions, releases, activity_log | 🟢 / 🟡 стримы-виджеты пусты |
| Релизы + мастер (4 шага) | releases, tracks, releases-extras, release-flow | releases, tracks, release_artists, assets | 🟢 (см. D) |
| Артисты / Лейблы | artists, labels | artists, labels | 🟢 |
| Ассеты / Дубликаты / Bulk | assets, catalog, catalog-bulk | assets, dsp_catalog | 🟢 (assets пуст) |
| Генератор кодов | `/catalog/codes/*` | platform_settings | 🟡 префикс-placeholder `TM1` |
| Дистрибуция / DDEX | delivery, ddex, distribution-extras | deliveries, ddex_*, acr_checks | 🟢 код / 🟡 не настроено |
| — модерация (активный диалог) | `/distribution/moderation`, `/distribution/acr/*` | acr_checks | 🟢 реальный; мок только в мёртвом компоненте (см. G.2) |
| Broma16 (ROD) | broma16 (13) | broma16_dictionaries, broma16_push_jobs | 🟢 код / 🟡 нет ключей (см. H) |
| ACRCloud скан | `/distribution/acr/scan` | acr_checks | 🟢 код / 🟡 нет ключей |
| Финансы / Роялти / Сплиты / Выплаты | finance, royalties, splits, finance-extras | transactions, splits, payouts | 🟢 (расчёт реальный) |
| Импорт CSV / Unmatched | ingestion | ingestion_imports, ingestion_unmatched, usage_reports | 🟢 |
| Аналитика | analytics, analytics-extras, analytics-marketing | usage_reports, playlist_stats, tiktok_stats, ugc_metrics | 🟡 код реальный, данные пусты |
| CRM | crm (26) | contacts, crm_tasks | 🟢 |
| Пользователи / Signups / KYC | users, signup, kyc | users, signup_requests, kyc_documents | 🟢 (signups/kyc пусты) |
| Rights / Publishing | rights, publishing | publishing_works, rights_holders, dsp_deals | 🟢 (rights пусты; publishing скоупится по лейблу) |
| Support | support (11) | support_tickets, support_ticket_messages | 🟡 inbox 🟢 / FAQ 🔴 статичный |
| Communications | communications (27) | email_templates, campaigns, automation_triggers | 🟢 код / данные пусты |
| Automation / Audit | automation, automation-extras, audit | fraud_rules, payment_automation_rules, audit_log | 🟢 (+ ⚪ «Workflow Rules») |
| Маркетинг | marketing, analytics-marketing | presave_campaigns, smart_links, promo_assets | 🟢 код / пусто (+ ⚪ «Download») |
| Настройки / Интеграции | settings, integrations | integrations, integration_credentials, platform_settings | 🟢 (credentials=0) |
| Manager Permissions | manager-permissions | manager_permissions | 🟢 |
| Профиль / Уведомления | users/me, notifications | users, notifications | 🟢 (notifications пусто) |
| **Delivery (artist/label)** | `GET /deliveries` (adminOnly) | deliveries | ⚠️ 🔵 мисматч: 403 + ⚪ кнопка |

## G.2 🔴 Моки и хардкоды (подтверждённые)
- `MOCK_ACR_MATCHES` — `components/moderation-dialog.tsx:126` — демо-совпадения ACR в **осиротевшем** компоненте, который **нигде не импортируется** (мёртвый код). Активная модерация (`moderation-detail-dialog.tsx`) использует реальные ACR-эндпоинты. Пользователю мок **не показывается** — файл стоит просто удалить.
- **Клиентский случайный ISRC** `TJ-CTM-YY-NNNNN` (`Math.random`) — `track-card.tsx:29-31`, `tracks/edit.tsx:62`. Серверный последовательный генератор `POST /api/catalog/codes/isrc` существует, но мастером **не используется**.
- **Хардкод** `accountNumber="28301"` — `layout.tsx:61` (topbar, одинаков для всех).
- **Статичный FAQ** `FAQ_CATEGORIES` — `support/index.tsx` (клиентский режим).
- Fallback-справочники жанров/языков в мастере — используются **только** когда Broma16 не подключён (иначе тянутся реальные словари).

## G.3 ⚪ Только UI (элементы без эффекта)
- «Download» у Promo Assets (`/marketing`) → только toast.
- «Workflow Rules» в Automation → редирект в Communications (заглушка).
- «New Delivery» на `/delivery` → кнопка без `onClick`.

## G.4 🟡 Реальный код, но пустые данные (источник пуст)
Экраны корректны, но выводят пусто, пока не появятся данные/конфигурация:
- Аналитика (стримы/гео/топы/плейлисты/TikTok/UGC) ← `usage_reports`, `playlist_stats`, `tiktok_stats`, `ugc_metrics` = 0.
- Broma16 outlet-picker в мастере ← `broma16_dictionaries` = 0 (нет синка).
- KYC/Signups/Support/Communications/Marketing/Rights/Fraud ← соответствующие таблицы = 0.

## G.5 🔵 Рассинхрон фронт↔бэк
- **Delivery:** страница разрешена артисту/лейблу (меню/`ROUTE_ROLES`), но `GET /api/deliveries` — `adminOnly` ⇒ 403 без graceful-обработки.
- **ISRC:** сервер умеет выдавать коды последовательно, фронт генерит случайно — сервер-роут не задействован в создании трека.
- **Publishing:** скоуп по лейблу **реализован** в хендлерах (`publishing.ts`); устаревший комментарий в `routes/index.ts` утверждает обратное — рассинхрон комментария и кода, а не поведения.

---

# ⚠️ РАЗДЕЛ I — Проблемы, несоответствия, риски

## I.1 Критично (некорректные/вводящие в заблуждение данные)
1. 🟡 **`MOCK_ACR_MATCHES` — мёртвый код (не критично).** Фейковые ACR-совпадения лежат в `components/moderation-dialog.tsx:126`, но компонент **нигде не импортируется**; активная модерация (`moderation-detail-dialog.tsx`) работает с реальными ACR-эндпоинтами. Пользователю мок не виден — рекомендуется удалить осиротевший файл, чтобы не путать.
2. 🔴 **ISRC генерируется случайно на клиенте** (`Math.random`, `TJ-CTM-YY-NNNNN`) — риск коллизий и невалидных кодов; при этом есть корректный серверный последовательный генератор, который **не подключён** к мастеру.
3. 🔴 **Хардкод `accountNumber="28301"`** в topbar — одинаковый номер счёта для всех пользователей.
4. ⚠️ **Delivery для артиста/лейбла = 403** — страница `/delivery` в меню/`ROUTE_ROLES`, но безусловно бьёт в `adminOnly`-эндпоинт `GET /api/deliveries`; graceful-обработки нет (в отличие от Analytics).
5. ℹ️ **Publishing — устаревший комментарий, не баг.** Комментарий в `routes/index.ts` говорит, что per-label scoping отсутствует, но хендлеры (`publishing.ts`) **скоупят** works по лейблу. Утечки нет; стоит поправить вводящий в заблуждение комментарий.

## I.2 Нефункциональные элементы UI (⚪)
6. **«New Delivery»** (`/delivery`) — кнопка без `onClick`.
7. **«Download»** у Promo Assets (`/marketing`) — только toast, файл не отдаётся.
8. **«Workflow Rules»** (Automation) — редирект-заглушка в Communications.
9. 🔴 **Support FAQ** — статический массив `FAQ_CATEGORIES` (не из БД).

## I.3 Пустые данные / не настроенные интеграции (не баги кода, но «пустой» UX)
10. 🟡 **`usage_reports` пуст** → вся аналитика и стрим-виджеты дашборда (стримы, гео, топ-треки, топ-DSP, выручка по DSP) пусты, пока нет CSV-импорта или синка Broma16.
11. 🟡 **Интеграции не настроены** (`integration_credentials` = 0): Broma16, ACRCloud, Spotify, R2/S3, Resend. Следствия: словари ROD пусты, ACR-сканы недоступны, статистика не тянется, реальные аплоады/письма не работают.
12. ⚠️ **`platform_settings` пуст** → генератор кодов отдаёт placeholder-префикс `TM1` (невалидный IFPI ISRC-префикс). Нужно задать реальные префиксы.
13. 🟡 **46 из 65 таблиц пусты** — модули KYC, Signups, Support, Communications, Marketing, Rights, Fraud визуально пусты до появления данных (код при этом рабочий).

## I.4 Структурное / прочее
14. **Settings и Profile — только через topbar** (меню аватара), не в сайдбаре; у **Label вообще нет Profile** в сайдбаре.
15. **DDEX local-fs доставка** — dev-заглушка (env-gated `LOCAL_STORAGE_ROOT`), не для продакшена; локальные ассеты под `/tmp`/`.data/uploads` (эфемерны при рецикле контейнера).
16. **Broma16 push блокируется онбордингом аккаунта** в самой ROD-панели (шаг artist → 404, если аккаунт не завершил онбординг). Это не баг кода.
17. **Broma16 статусы «OK»/«ok»** приходят непоследовательно — клиент проверяет успех регистронезависимо (иначе синк словарей молча падает).

> **Вывод по I:** приложение в основной массе — **реальное и целостное** (react-query → реальные эндпоинты → реальные таблицы, реальный расчёт роялти, реальная бизнес-логика мастера и дистрибуции). «Пустота» экранов — это **отсутствие данных/ключей**, а не заглушки. Настоящих фейков немного и они точечные (см. I.1–I.2).

---

# 🧭 ФИНАЛ — Карта меню по ролям

| Пункт | Admin | Manager | Label | Artist |
|---|:--:|:--:|:--:|:--:|
| Дашборд `/` | ✅ | ✅ (perm) | ✅ | ✅ |
| Каталог-хаб `/catalog` | ✅ | 🔑 catalog | — | — |
| Релизы `/releases` | ✅ (через хаб) | 🔑 | ✅ | ✅ (Мои) |
| Артисты `/artists` | ✅ | 🔑 | ✅ | — |
| Transfer `/releases/transfer` | ✅ | 🔑 | ✅ | ✅ |
| Календарь `/releases/calendar` | ✅ | 🔑 | ✅ | — |
| Takedown `/releases/takedown` | ✅ | 🔑 | — | ✅ |
| Delivery `/delivery` | ✅ | 🔑 | — | ⚠️ (403) |
| Дистрибуция `/distribution` | ✅ | 🔑 distribution | — | — |
| Финансы `/finance` | ✅ | 🔑 finance | — | — |
| Роялти `/royalties` | ✅ | 🔑 | ✅ «Earnings» | ✅ «Earnings» |
| Сплиты `/splits` | ✅ | 🔑 | — | ✅ |
| Выплаты `/payouts` | ✅ | 🔑 | ✅ | ✅ |
| Аналитика `/analytics` | ✅ | 🔑 analytics | ✅ (урезано) | ✅ (урезано) |
| CRM `/crm` | ✅ | 🔑 crm | — | — |
| Пользователи `/users` | ✅ | 🔑 users_kyc | — | — |
| Signups `/admin/signups` | ✅ | 🔑 | — | — |
| KYC `/admin/kyc` | ✅ | 🔑 | — | — |
| Rights `/rights` | ✅ | 🔑 rights | — | — |
| Publishing `/publishing` | ✅ | 🔑 | ✅ (свой каталог) | — |
| Support `/support` | ✅ | 🔑 support_comms | ✅ (клиент) | ✅ (клиент) |
| Communications `/communications` | ✅ | 🔑 | — | — |
| Automation `/automation` | ✅ | 🔑 automation_audit | — | — |
| Audit `/admin/audit` | ✅ | 🔑 | — | — |
| Маркетинг `/marketing` | ✅ | 🔑 | ✅ (без Pre-save) | ✅ (без Playlists/Trends) |
| Настройки `/settings` | ✅ topbar | ✅ topbar | — | — |
| Профиль `/profile` | ✅ | ✅ | 🔵 только topbar | ✅ |
| Кнопка «Создать релиз» (topbar) | — | — | ✅ | ✅ |

**Обозначения:** ✅ есть · — скрыто · 🔑 у менеджера гейтится ключом `manager_permissions` (по умолчанию все включены) · «Earnings» — переименованный пункт роялти · ⚠️/🔵 — см. Разделы I/G.

---

## Итог аудита
Система «Tajik Music Distribution CRM» — **производственно-целостное** приложение: 4 роли, ~344 API-эндпоинта, 65 таблиц, реальная бизнес-логика (мастер релиза, роялти, сплиты, выплаты, Broma16/DDEX-дистрибуция, ACRCloud, publishing, CRM, KYC, аудит). Доступ строго разграничен (`requireAuth` + `adminOnly` + `manager_permissions` + `getDataScope`). Данных в БД мало (только сид/справочники), интеграции не настроены — отсюда «пустые» экраны при рабочем коде. Точечные фейки/недоработки перечислены в G.2–G.5 и I.1–I.4.

*Конец документа.*
