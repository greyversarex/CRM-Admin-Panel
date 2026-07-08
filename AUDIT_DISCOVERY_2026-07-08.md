# 🔬 ПОЛНЫЙ DISCOVERY-АУДИТ CRM «Tajik Music Distribution»
**Дата:** 08 июля 2026 · **Метод:** сплошной обход кода (роутер + сайдбар + все Tabs-компоненты + бэкенд-роуты + фактические COUNT(*) в БД). **Правило:** код не менялся — только анализ.

---

## 0. КАК ЧИТАТЬ ЭТОТ ОТЧЁТ

### 0.1. Легенда вердиктов
| Маркер | Значение |
|---|---|
| 🟢 | Работает, данные реальные (эндпоинт + таблица заполнены) |
| 🟡 | Код реальный, но таблица **пуста** → экран пустой не из-за бага, а из-за отсутствия данных/настройки интеграции |
| 🔴 | **Мок / хардкод** в коде (массив-константа, случайная генерация, фейковые данные) |
| ⚪ | **Только UI** — кнопка/действие без обработчика, `toast`-заглушка, редирект-заглушка |
| 🔑 | Доступ гейтится (роль и/или manager-permission) |

### 0.2. Как проводился DISCOVERY (доказательство полноты)
Ничего не выбиралось «на глаз». Источники истины:
1. **Все роуты** — `src/App.tsx` (`<Switch>`), 55 маршрутов (см. §2).
2. **Все пункты меню по ролям** — `src/components/sidebar-nav.tsx` (`adminNavGroups` / `labelNavGroups` / `artistNavGroups`), см. §3.
3. **Все вкладки** — `grep -n "<TabsTrigger"` по `src/pages/**`. Подсчёт (открывающих тегов) — см. §4. Контрольные числа совпали с ожидаемыми: **Настройки = 19 вкладок** (4 пользовательских + 15 системных), **Права = 7**, **Автоматизация = 6**.
4. **Доступ по ролям** — `src/lib/permissions.ts` (`ROUTE_ROLES` + `canAccess` + `ROUTE_MANAGER_PERMISSION_KEY`).
5. **Реальность данных** — сверка каждого эндпоинта с `artifacts/api-server/src/routes/*.ts` и с фактическими `n_live_tup` из PostgreSQL (§0.3).

### 0.3. Состояние БД на момент аудита (факт, не догадка)
**Заполнены (есть строки):** `broma16_dictionaries` 768, `integrations` 31, `dsp_catalog` 30, `audit_log` 13, `manager_permissions` 9, `activity_log` 7, `deliveries` 7, `transactions` 7, `releases` 6, `crm_tasks` 5, `tracks` 5, `artists` 4, `contacts` 4, `integration_credentials` 4, `payouts` 4, `users` 4, `publishing_works` 3, `release_artists` 3, `splits` 3, `labels` 2, `ddex_messages` 1, `realtime_alerts` 1.
**Пусты (0 строк):** `acr_checks`, `api_keys`, `assets`, `automation_triggers`, `broma16_push_jobs`, `campaigns`, `commission_rules`, `content_id_assets`, `ddex_acknowledgements`, `ddex_batches`, `dsp_deals`, `email_templates`, `fraud_alerts`, `fraud_rules`, `ingestion_imports`, `ingestion_unmatched`, `internal_notes`, `kyc_documents`, `label_members`, `moderation_rules`, `notifications`, `payment_automation_rules`, `platform_settings`, `playlist_stats`, `presave_campaigns`, `promo_assets`, `publishing_conflicts`, `push_subscriptions`, `release_dsps`, `rights_conflicts`, `rights_holders`, `signup_requests`, `smart_links`, `support_ticket_messages`, `support_tickets`, `takedown_requests`, `tiktok_stats`, `transfer_imports`, `ugc_metrics`, `usage_reports`, `webhooks`.

> **Главный вывод заранее:** приложение в подавляющем большинстве **настоящее** (реальные эндпоинты → реальные таблицы). Пустые экраны — это **отсутствие данных/настройки интеграций** (41 из 65 таблиц пусты, `usage_reports` пуст → вся стриминг-аналитика пустая), а НЕ заглушки. Настоящих моков/UI-заглушек немного — они перечислены поимённо в §«Проблемы».

---

## 1. АРХИТЕКТУРА И КОНТРОЛЬ ДОСТУПА

- **Стек фронта:** React + `wouter` (роутинг) + TanStack React-Query (данные). Один SPA `artifacts/crm-panel`.
- **Роли:** `admin`, `manager`, `label`, `artist` (`ROLE_LABELS`: Администратор / Менеджер / Лейбл / Артист).
- **Гейт роутов:** `ProtectedRoute` (`App.tsx`) → `canAccess(role, path)` (`permissions.ts`).
  - `admin` — полный доступ (по `ROUTE_ROLES`).
  - `manager` — `ROUTE_ROLES` **плюс** индивидуальные `manager_permissions` (группа скрывается, если пермишен выключен).
  - `label` / `artist` — только по `ROUTE_ROLES`.
  - Неизвестный путь → доступ по **самому длинному префиксу**; если нет — только admin.
- **Меню:** три конфигурации в `sidebar-nav.tsx` (admin=manager, label, artist). Пункты дополнительно фильтруются `canAccess`.
- **ВАЖНО:** доступ по URL (`ROUTE_ROLES`) и наличие пункта в меню (`sidebar-nav`) — **две разные вещи**. Есть роуты, доступные роли по URL, но отсутствующие в её меню (напр. `/settings`, `/rights`, `/finance` у части ролей) — см. §5 и «Проблемы».

---

## 2. ПОЛНЫЙ СПИСОК РОУТОВ (55) — `App.tsx` × `ROUTE_ROLES`

**Публичные:** `/login`, `/signup` (залогиненного редиректит на `/`), `/invite/:token`.

| Путь | Компонент | Доступ (роли) |
|---|---|---|
| `/` | Dashboard | все |
| `/analytics` | Analytics | все *(label/artist — усечённый набор вкладок)* |
| `/distribution` | Distribution | admin, manager 🔑 |
| `/releases` | Releases | все |
| `/releases/new` | CreateRelease | все *(префикс /releases)* |
| `/releases/bulk` | BulkUploadReleases | admin, manager |
| `/releases/transfer` · `/releases/transfer/new` | Transfer | все |
| `/releases/:id` | ReleaseDetail | все |
| `/releases/:id/edit` | EditRelease | все |
| `/releases/:id/availability` | ReleaseAvailability | все |
| `/releases/:id/splitshare` | ReleaseSplitShare | все |
| `/releases/:id/multi-track-edit[/:category]` | MultiTrackEdit | все |
| `/releases/:id/reorder-tracks` | ReorderTracks | все |
| `/releases/:id/audio-upload` | ReleaseAudioUpload | все |
| `/releases/:id/tracks/:tid/edit` · `.../audio-upload` | Track edit/upload | все |
| `/releases/calendar` | ReleaseCalendar | admin, manager, label |
| `/releases/takedown` | TakedownRequests | все |
| `/artists` | Artists | все |
| `/labels` | Labels | admin, manager |
| `/users` | Users | admin, manager 🔑 |
| `/publishing` | Publishing | admin, manager, label 🔑 |
| `/rights` | Rights | все 🔑 |
| `/crm` | CRM | admin, manager 🔑 |
| `/royalties` | Royalties | все 🔑 |
| `/finance` | Finance | admin, manager, **artist** *(не label!)* 🔑 |
| `/finance/import` | FinanceImport | admin, manager |
| `/finance/unmatched` | FinanceUnmatched | admin, manager, artist *(наследует /finance — потенц. переизбыток)* |
| `/splits` | Splits | все 🔑 |
| `/payouts` | Payouts | все 🔑 |
| `/settings` | Settings | все *(нет в сайдбаре — см. §5)* |
| `/profile` | ProfilePage | все |
| `/support` | SupportPage | все 🔑 |
| `/communications` | Communications | admin, manager 🔑 |
| `/catalog` · `/catalog/assets` · `/catalog/duplicates` | Catalog | admin, manager 🔑 |
| `/catalog/codes` | CatalogCodes | admin, manager, label 🔑 |
| `/catalog/bulk-edit` | CatalogBulkEdit | admin, manager *(префикс /catalog)* |
| `/automation` | Automation | admin, manager 🔑 |
| `/marketing` · `/presave` · `/links` · `/assets` · `/playlists` · `/trends` | Marketing | все |
| `/delivery` | Delivery | все по URL, **но GET /api/deliveries = adminOnly** ⚠ |
| `/admin/signups` · `/admin/kyc` · `/admin/audit` | Admin | admin, manager 🔑 |

---

## 3. МЕНЮ ПО РОЛЯМ (точно из `sidebar-nav.tsx`)

### 3.1. ADMIN / MANAGER (`adminNavGroups`)
> Для **manager** каждая группа скрывается, если соответствующий `manager_permissions` выключен (ключ указан в скобках).

- **Обзор:** Dashboard (`/`)
- **Каталог** *(кл. catalog)*: Каталог-хаб (`/catalog`)
- **Дистрибуция** *(distribution)*: Дистрибуция (`/distribution`)
- **Финансы** *(finance)*: Финансы (`/finance`)
- **Аналитика** *(analytics)*: Аналитика (`/analytics`)
- **CRM** *(crm)*: CRM (`/crm`)
- **Пользователи** *(users_kyc)*: Пользователи (`/users`), Регистрации (`/admin/signups`), KYC (`/admin/kyc`)
- **Права** *(rights)*: Права (`/rights`), Издательство (`/publishing`)
- **Поддержка/Коммуникации** *(support_comms)*: Поддержка (`/support`), Коммуникации (`/communications`)
- **Автоматизация/Аудит** *(automation_audit)*: Автоматизация (`/automation`), Аудит (`/admin/audit`)
- **Аккаунт:** Профиль (`/profile`)

### 3.2. LABEL (`labelNavGroups`)
- **Обзор:** Dashboard (`/`)
- **Мой каталог:** Релизы (`/releases`), Артисты (`/artists`), Трансфер (`/releases/transfer`), Календарь релизов (`/releases/calendar`)
- **Издательство:** Издательство (`/publishing`)
- **Аналитика:** Аналитика (`/analytics`)
- **Маркетинг:** Маркетинг (`/marketing`)
- **Доходы:** Доходы (`/royalties`, подпись «Доходы»), Выплаты (`/payouts`)
- **Поддержка:** Поддержка (`/support`)
- **НЕТ в меню лейбла:** Профиль, Настройки, Сплиты, Финансы, Дистрибуция, CRM, Пользователи, Права, Каталог-хаб, Коммуникации, Автоматизация, Доставка.

### 3.3. ARTIST (`artistNavGroups`)
- **Обзор:** Dashboard (`/`)
- **Мой каталог:** Мои релизы (`/releases`), Трансфер (`/releases/transfer`), Снятие с площадок (`/releases/takedown`), Доставка (`/delivery`)
- **Маркетинг:** Маркетинг (`/marketing`)
- **Аналитика:** Аналитика (`/analytics`)
- **Доходы:** Доходы (`/royalties`), Сплиты (`/splits`), Выплаты (`/payouts`)
- **Поддержка:** Поддержка (`/support`)
- **Аккаунт:** Профиль (`/profile`)
- **НЕТ в меню артиста:** Настройки, Права, Издательство, Финансы (хотя URL `/finance` артисту разрешён!), Календарь релизов.

---

## 4. ПОЛНОЕ ДЕРЕВО ВКЛАДОК (каждая вкладка найдена в коде)

> Числа — количество **вкладок верхнего уровня**. Под-фильтры статусов вынесены отдельной строкой.

| Страница (файл) | Вкладки (value) | Кол-во |
|---|---|---|
| **Каталог** `catalog/index.tsx` | hub, releases, artists, labels*(admin)*, videos*(admin)* | 3–5 |
| — Дубликаты `catalog/duplicates.tsx` | artist, track, release, asset | 4 |
| **Дистрибуция** `distribution/index.tsx` | moderation, dsp-status, scheduled, takedowns, acr, disputes, messages, batches, acks | **9** |
| — Модерация `moderation-tab.tsx` | pending_review, approved, rejected, all | 4 |
| — Снятия `takedowns-tab.tsx` | all, pending, processing, completed, rejected | 5 |
| **Финансы** `finance/index.tsx` | overview, royalties, splits, payouts | 4 |
| — Несопоставленные `finance/unmatched.tsx` | pending, resolved, all | 3 |
| **Роялти** `royalties/index.tsx` | summary, statements, releases, dsp, request, history (+ by_artist для label) | 6–7 |
| **Аналитика** `analytics/index.tsx` | admin/mgr: streams, revenue, geo, tracks, ugc, realtime, playlists, tiktok · label/artist: playlists, tiktok | **8 / 2** |
| **CRM** `crm/index.tsx` | overview, activity, arpu, growth, funnel, contacts, tasks | 7 |
| **Пользователи** `users/index.tsx` | users, signups, roles, kyc, activity | 5 |
| — Регистрации `admin/signups.tsx` | pending, approved, rejected | 3 |
| — KYC `admin/kyc.tsx` | pending, approved, rejected | 3 |
| **Права** `rights/index.tsx` | holders, conflicts, dsp-deals, content-id, territories, freeze, history | **7** |
| **Издательство** `publishing/index.tsx` | works, writers, splits, conflicts, partners, registration, reports | 7 |
| **Поддержка** `support/index.tsx` | tickets, help, contact | 3 |
| **Коммуникации** `communications/index.tsx` | overview, inbox, templates, campaigns, automation, notes | 6 |
| **Автоматизация** `automation/index.tsx` | workflow, scheduled, fraud, alerts, moderation, payments | **6** |
| **Маркетинг** `marketing/index.tsx` | admin/mgr: presave, smart_links, playlists, trends, promo_assets · label: −presave · artist: presave, smart_links, promo_assets | 5 / 4 / 3 |
| **Релизы** `releases/index.tsx` | all, draft, pending_review, scheduled, live, takedown *(фильтры статуса)* | 6 |
| **Настройки** `settings/index.tsx` | **польз.:** profile, password, notifications, members · **систем.:** integrations, general, ddex, api, payment, currency, dsp, security, storage, notifications, audit, activity, acrcloud, pros, manager-perms | **19** |
| **Профиль** `profile/index.tsx` | profile, social, password, kyc, bank, tax, members | 7 |

**Итого только вкладок верхнего уровня ≈ 110**, плюс ~24 под-фильтра, плюс 55 роутов и шаги мастера создания релиза. Полный атомарный разбор каждой — в §6.

---

## 5. РОЛЕВЫЕ КАРТЫ (что реально видит каждая роль)

### 5.1. ADMIN — видит всё
Все разделы §3.1 + доступ ко всем URL из §2. Настройки-система (15 системных вкладок) — только admin (см. §6, раздел Настройки). Единственная навигационная странность: **Настройки нет в сайдбаре** — вход через топбар/прямой URL.

### 5.2. MANAGER — как admin, но по пермишенам
Тот же сайдбар, что у admin, НО каждая группа гейтится `manager_permissions` (`catalog`, `distribution`, `finance`, `analytics`, `crm`, `users_kyc`, `rights`, `support_comms`, `automation_audit`). В таблице `manager_permissions` 9 строк — пермишены реально применяются. Внутри Настроек вкладка **«Права менеджеров»** (manager-perms) управляет этими флагами.

### 5.3. LABEL — каталог/издательство/доходы
- **Меню:** §3.2. **Доступ по URL шире меню:** лейблу также разрешены `/rights`, `/splits`, `/settings`, `/profile`, `/catalog/codes` — но их **нет в его сайдбаре** (доступны по URL / из других экранов).
- **Явно закрыто (ROUTE_ROLES):** `/distribution`, `/crm`, `/users`, `/labels`, `/catalog`(hub/assets/duplicates), `/automation`, `/communications`, **`/finance`** (лейбл НЕ имеет доступа к /finance по URL — только `/royalties`, `/payouts`).
- **Аналитика:** только 2 вкладки (Плейлисты, TikTok).
- **Маркетинг:** 4 вкладки (без Pre-save).
- **Роялти:** доступна доп. вкладка «По артистам».

### 5.4. ARTIST — свой каталог/доходы
- **Меню:** §3.3. **Доступ по URL шире меню:** артисту также разрешены `/rights`, `/finance`, `/settings` — но их **нет в сайдбаре**.
- **Явно закрыто:** `/distribution`, `/crm`, `/users`, `/labels`, `/catalog*` (кроме — нет и codes), `/publishing`, `/automation`, `/communications`, `/releases/calendar`, `/releases/bulk`.
- **Аналитика:** 2 вкладки. **Маркетинг:** 3 вкладки (Pre-save, Smart Links, Промо). **Доставка** (`/delivery`) в меню есть, но бэкенд `GET /api/deliveries` — adminOnly ⇒ артист получит 403 (см. «Проблемы»).

---

# 6. АТОМНЫЙ РАЗБОР ПО РАЗДЕЛАМ
*(Ниже — поэлементный разбор каждой страницы и вкладки: элементы → бэкенд → вердикт.)*


# Аудит области «РЕЛИЗЫ и создание релиза»

Область: `artifacts/crm-panel/src/pages/releases/*` + `components/release-wizard/*`.
Метод: трассировка каждого useQuery/useMutation/fetch до серверного роута (`api-server/src/routes/*`) и таблицы БД.
Справка БД: `releases`=6, `tracks`=5, `splits`=3, `deliveries`=7, `dsp_catalog`=30, `broma16_dictionaries`=768, `transfer_imports`=0, `takedown_requests`=0.

---

### Релизы → Список (STATUS_TABS)  (index.tsx:65)
- Путь: `/releases` · Доступ: admin, manager, label, artist (`ROUTE_ROLES["/releases"]`), менеджер гейтится `manager_permissions.catalog`.
- Вкладки-фильтры (6): `all` / `draft` / `pending_review` / `scheduled`(→`approved,delivering,delivered`) / `live` / `takedown`(→`takedown_requested,removed`). Маппинг `TAB_TO_STATUS` (index.tsx:34). Лейблы из `t.releases.tabs.*`.
- Элементы:
  - Кнопки шапки: «Transfer track» → `/releases/transfer`; «Export CSV» → `exportCatalogCsv()` (lib/export-catalog); «Upload CSV» → `/releases/bulk`; «Create release» → `/releases/new`. Первые три скрыты для artist/label.
  - 4 StatCard (admin/manager): ready_to_submit / unfinished / live / takedown_removed — из `useGetReleaseCounts()` → `GET /api/releases/counts` (releases.ts:218, group by status по таблице `releases`). Клик меняет `statusFilter`.
  - Поиск (input, поиск по каталогу), toggle grid/list, select pageSize (10/20/50/100), пагинация — все клиентские состояния, прокидываются в запрос.
  - Таблица/грид: `useListReleases({search,status,page,limit,artist_id?,label_id?})` → `GET /api/releases` (releases.ts, `enrichRelease`). Колонки: cover, title+UPC, artist, type, label, releaseDate, StatusBadge, actions-меню.
  - Actions-меню (list-view, dropdown): «View/Edit» → goto(id) ✅; **«Deliver»** — `onClick` только `e.stopPropagation()`, действия НЕТ ⚠️; **«Delete»** — `onClick` только `stopPropagation`, действия НЕТ ⚪.
- Бэкенд: `GET /api/releases`, `GET /api/releases/counts` → таблица `releases` (+ artists/labels для enrich).
- Данные: РЕАЛЬНЫЕ (releases=6).
- Вердикт: Работает частично (список/counts/фильтры реальны) · Данные реальные · 🟢 (с оговоркой: 2 пункта dropdown-меню — 🔴 заглушки-noop).

---

### Релизы → Создание релиза (страница new.tsx)  (new.tsx)
- Путь: `/releases/new` · Доступ: admin, manager, label, artist (наследует `/releases`; отдельного правила нет).
- Это ОДНОСТРАНИЧНАЯ форма-черновик (НЕ мастер). Мастер (wizard) используется на `/releases/:id/edit`.
- Поля:
  - releaseType (radio: single/album/ep/compilation — `RELEASE_TYPE_VALUES`, хардкод-локальный).
  - Обложка `CoverUploader` (upload asset), `coverAiUsage` (select none/some/all — обязателен для create).
  - title* (обяз.), releaseVersion.
  - language: `useCatalogOptions("language", valueKey:"code", fallback:LANGS)` — **Broma16 dict** `GET /api/catalog/dictionary/language` (768 rows), fallback хардкод `LANGS` (types.ts).
  - Артисты: MultiArtistPicker + быстрый диалог создания артиста `useCreateArtist()`. Primary обязателен. Роль artist/label автоматически ограничивается своими артистами.
  - labelId (select из `useListLabels`), авто-подстановка C/P Line из имени лейбла.
  - genre* : `useCatalogOptions("genre", valueKey:"code", fallback+extra:GENRE_OPTIONS)` — **Broma16 dict** `/api/catalog/dictionary/genre`, fallback хардкод.
  - subgenre: объединённый список genre+SUBGENRE_OPTIONS (Broma16 + хардкод-extra).
  - catalogNumber, cLine/cLineYear, pLine/pLineYear, isCompilation* (bool, обяз.), isVariousArtists (checkbox).
  - translations[] (language/title/version) — добавляемые строки.
- Кнопка «Создать»: `canCreate` требует title+primaryArtist+coverAiUsage+genre+isCompilation. `useCreateRelease()` → `POST /api/releases`, затем `useUpdateReleaseArtists()` → `PUT /api/releases/:id/artists` (если >1 артиста). `upcRequestPending:true`, `metadataTranslations`. Редирект на `/releases/:id`.
- Бэкенд: `POST /api/releases` (releases.ts) → таблица `releases`; `POST /api/artists`; `PUT /api/releases/:id/artists` → `release_artists`. Справочники → `broma16_dictionaries`.
- Данные: РЕАЛЬНЫЕ. Селекты жанр/язык из Broma16 (реальные, 768 rows) с хардкод-фолбэком.
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релизы → Мастер релиза (ReleaseWizard, 4 шага)  (wizard.tsx:324 STEPS)
- Путь: `/releases/:id/edit` (edit.tsx→`<ReleaseWizard initialReleaseId={id}/>`) · Доступ: `/releases/:id/edit` не в ROUTE_ROLES явно → наследует общий (в App.tsx ProtectedRoute). Шаги: `details / tracks / delivery / submission`.
- **Шаг 1 — details** (Step1Details, wizard.tsx:596): те же поля, что new.tsx (releaseType, cover+AI, title/version, genre/subgenre/language через `useCatalogOptions` Broma16, artists multi-picker, label, C/P line, dates releaseDate/releaseTime, UPC, catalogNumber, isExplicit/isCompilation/isVariousArtists). Save `saveStep1` → `POST/PUT /api/releases` + `PUT /api/releases/:id/artists`. После создания редирект на `/releases/:id`.
- **Шаг 2 — tracks** (Step2Tracks, wizard.tsx:929): список `useListTracks({release_id})` → `GET /api/tracks`. Создание трека `useCreateTrack`→`POST /api/tracks`. Каждый трек = `<TrackCard>`.
  - **TrackCard (track-card.tsx)**: поля title, trackVersion, **ISRC + кнопка Wand2 генерации** `generateIsrc()` — ⚠️ **КЛИЕНТСКИЙ `Math.random()`** (track-card.tsx:29-33, формат `TJ-CTM-YY-NNNNN`), НЕ вызывает серверный `POST /api/catalog/codes/isrc` (catalog.ts:193 существует, но не используется здесь). iswc, trackNumber, genre/subgenre/language/countryOfRecording (Broma16 dict через useCatalogOptions/DictionaryCombobox + хардкод COUNTRIES), isExplicit/explicitStatus, aiUsage, clip start, recordingYear, audioStyle, vocalLanguage. Контрибьюторы: DisplayArtists/Writers/Performers/Production (contributors-editor.tsx). Save требует наличия producer. `useUpdateTrack`→`PUT /api/tracks/:id`, аудио через `useAssetUpload`. Удаление `useDeleteTrack`.
- **Шаг 3 — delivery** (Step3Delivery, wizard.tsx:1026): выбор DSP через `DspPickerInline` (dsp-picker.tsx) — `useListDspCatalog()`→`GET /api/dsp-catalog` (таблица `dsp_catalog`=30, РЕАЛЬНО). Доставляемость = наличие `ddexPartyId`. Территории (WW/список стран). `saveStep3`: `PUT /api/releases/:id` (даты/территории) + `PUT /api/releases/:id/distribution-outlets` (releases-extras.ts:265, direct fetch).
  - Примечание: COVERAGE карта покрытия регионов — **хардкод-объект** (dsp-picker.tsx:25), только для визуализации «карты покрытия».
- **Шаг 4 — submission** (Step4Submission, wizard.tsx:1152): `useValidateReleaseForSubmission`→`GET /api/releases/:id/validate` (авто при входе на шаг). Показ issues с кнопками «Fix»→переход на шаг. Кнопка отправки `submitForReview`→`POST /api/releases/:id/submit`. Редирект на `/releases/:id`.
- Бэкенд: `/api/releases`, `/api/tracks`, `/api/dsp-catalog`, `/api/releases/:id/validate`, `/api/releases/:id/submit`, `/api/releases/:id/distribution-outlets` — все реальные. Таблицы `releases`, `tracks`, `release_artists`, `dsp_catalog`, `broma16_dictionaries`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢, **кроме генерации ISRC — 🔴 (клиентский random вместо серверного `POST /api/catalog/codes/isrc`)** и COVERAGE — 🔴 хардкод (косметика).

---

### Релиз → Детальная страница [id]  ([id].tsx)
- Путь: `/releases/:id` · Доступ: наследует `/releases`.
- `useGetRelease(id)`→`GET /api/releases/:id`. Секции/кнопки:
  - Метаданные релиза (inline-редакт для draft, иначе EditDialog `useUpdateRelease`→`PUT /api/releases/:id`). ⚠️ Subgenre в шапке отображается захардкоженным «—» ([id].tsx:490 `KV label="Subgenre" value="—"`).
  - Треки: список `<TrackCard>`, ссылки на `/multi-track-edit`, `/reorder-tracks`, `/audio-upload`.
  - Кнопка **«Deliver to DSPs»** (admin/manager + `release.canDeliver`) → DeliverDialog: выбор `DELIVER_TARGETS` (хардкод-список, соответствует connectors/registry) → direct `POST /api/releases/:id/deliver` (учёт copyright strikes, force). Реально создаёт delivery-jobs (таблица `deliveries`).
  - **«Submit for review»** → SubmitDialog `useSubmitReleaseForReview`→`POST /api/releases/:id/submit`.
  - **«Request takedown»** (если `allowedTransitions.includes("takedown_requested")`) → TakeDownDialog → `POST /api/releases/:id/request-takedown` (releases.ts:1044).
  - Cancel submit, Edit, Delete (`useDeleteRelease`).
  - ACR: `useQuery` fetch `GET /api/distribution/acr/checks?releaseId=` (distribution-extras.ts:80) — таблица `acr_checks`=0 (ПУСТО).
- Бэкенд: все endpoints реальные. Таблицы `releases`, `tracks`, `deliveries`, `acr_checks`(пусто).
- Данные: РЕАЛЬНЫЕ (кроме ACR — реально-но-пусто; subgenre в шапке — хардкод «—»).
- Вердикт: Работает да · Данные реальные · 🟢 (ACR 🟡; subgenre-KV 🔴 мелкий хардкод).

---

### Релизы → Bulk-загрузка (bulk.tsx)
- Путь: `/releases/bulk` · Доступ: admin, manager (`ROUTE_ROLES`).
- Элементы: `COLUMNS`/`RELEASE_TYPES` (хардкод-схема CSV), кнопка «Download template», upload файла / вставка CSV-текста, парсинг, предпросмотр строк, «Импортировать» → по каждой строке `useCreateRelease().mutateAsync({data:r.payload})`→`POST /api/releases`.
- Бэкенд: `POST /api/releases` → `releases`.
- Данные: РЕАЛЬНЫЕ (создаёт записи). Схема колонок/шаблон — хардкод (это нормально для CSV-парсера).
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релиз → Доступность (availability.tsx)
- Путь: `/releases/:id/availability` · Доступ: admin, manager, label, artist.
- `useGetRelease`, `useGetReleaseDsps`→`GET /api/releases/:id/dsps`, `DspPickerInline` (dsp_catalog реально). Выбор территорий (WW / список стран — фильтр). Save: `useUpdateRelease`→`PUT /api/releases/:id` (territories) + `useUpdateReleaseDsps`→`PUT /api/releases/:id/dsps`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релиз → SplitShare (splitshare.tsx)
- Путь: `/releases/:id/splitshare` · Доступ: admin, manager, label, artist.
- `useGetRelease`, `useListSplits`→`GET /api/splits`, `useListUsers`. Участники (entityType artist/user, entityId, percentage; сумма=100%). `useCreateSplit`→`POST /api/splits`, `useUpdateSplit`→`PUT /api/splits/:id`.
- Бэкенд: `/api/splits` (splits.ts) → таблица `splits`=3 (РЕАЛЬНО).
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релиз → Multi-track edit (multi-track-edit.tsx) и Multi-track edit category (multi-track-edit-category.tsx)
- Пути: `/releases/:id/multi-track-edit`, `/releases/:id/multi-track-edit/:category` · Доступ: наследует `/releases`.
- `useGetRelease` (треки). Category-версия: массовое редактирование поля по всем трекам. Селекты genre/language/country — `useCatalogOptions` (Broma16) + DictionaryCombobox + хардкод COUNTRIES/GENRE_OPTIONS/SUBGENRE_OPTIONS/DISPLAY_ARTIST_ROLES fallback. Save через `useUpdateTrack`→`PUT /api/tracks/:id`.
- Данные: РЕАЛЬНЫЕ (треки), справочники Broma16.
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релиз → Reorder tracks (reorder-tracks.tsx)
- Путь: `/releases/:id/reorder-tracks` · Доступ: наследует `/releases`.
- `useGetRelease`, drag-n-drop, Save → direct `POST /api/releases/:id/tracks/reorder` (release-flow.ts:94), body `{order:[ids]}`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релиз → Audio upload (audio-upload.tsx + tracks/audio-upload.tsx)
- Пути: `/releases/:id/audio-upload`, `/releases/:id/tracks/:tid/audio-upload` · Доступ: наследует `/releases`.
- `useGetRelease`, `useAssetUpload` (загрузка аудио, ALLOWED_EXT хардкод-фильтр расширений). Прикрепление к треку.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релиз → Track edit (tracks/edit.tsx)
- Путь: `/releases/:id/tracks/:tid/edit` · Доступ: наследует `/releases`.
- Полноценный редактор одного трека (аналог TrackCard). `useUpdateTrack`→`PUT /api/tracks/:id`. (ISRC-генерация — тот же клиентский подход.)
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релизы → Календарь (calendar.tsx)
- Путь: `/releases/calendar` · Доступ: admin, manager, label.
- Direct `fetch("/api/releases?limit=500")`, фильтр по `releaseDate`, отрисовка в календарной сетке. `MONTHS_RU` хардкод (локализация). Клик по релизу.
- Бэкенд: `GET /api/releases` → `releases`.
- Данные: РЕАЛЬНЫЕ (только релизы с releaseDate).
- Вердикт: Работает да · Данные реальные · 🟢.

---

### Релизы → Takedown-запросы (takedown.tsx)
- Путь: `/releases/takedown` · Доступ: admin, manager, label, artist.
- Элементы: список запросов `GET /api/takedowns` (takedowns.ts:9). Новый запрос — диалог: release(текст), upc, reason (select из `REASONS` хардкод), note, DSPs (чекбоксы из `ALL_DSPS` **хардкод-массив 10 площадок**, takedown.tsx:38). Подтверждение → `POST /api/takedowns` (takedowns.ts:39, insert в `takedown_requests`).
- Бэкенд: `GET/POST /api/takedowns` → таблица `takedown_requests`=0 (ПУСТО).
- Данные: реально-но-ПУСТО (endpoint реальный, таблица пуста). Список DSP и причины — хардкод.
- Вердикт: Работает да (создаёт реальные записи) · Данные пусто · 🟡 (⚠️ выбор релиза свободным текстом+UPC, не привязан к каталогу; DSP-список хардкод, не из dsp_catalog).

---

### Релизы → Transfer (импорт) — список (transfer/index.tsx)
- Путь: `/releases/transfer` · Доступ: admin, manager, label, artist.
- `useListTransferImports()`→`GET /api/releases/transfer-imports` (releases.ts:327). Список джобов импорта (статус, importedCount/failedCount, spotifyArtistName, items). Аккордеон с шагами (Step title/desc — статические подписи процесса). Кнопка «New import» → `/releases/transfer/new`.
- Бэкенд: `GET /api/releases/transfer-imports` → таблица `transfer_imports`=0 (ПУСТО).
- Данные: реально-но-ПУСТО.
- Вердикт: Работает да · Данные пусто · 🟡.

---

### Релизы → Transfer — новый импорт (transfer/new.tsx)
- Путь: `/releases/transfer/new` · Доступ: admin, manager, label, artist.
- Ввод: строка (артист или UPC). При UPC → `useImportReleaseByUpc`→`POST /api/releases/import-upc` (releases.ts:1542, admin/manager) — реальный запрос к Spotify (creds из integrations/platformSettings). При артисте → поиск `GET /api/releases/transfer-imports/spotify-search` (releases.ts:519). Импорт выбранного → `useCreateTransferImport`→`POST /api/releases/transfer-imports` (реально создаёт artist/label/release/tracks в транзакции, подтягивает реальные ISRC из Spotify если настроен).
- Бэкенд: `POST /api/releases/import-upc`, `GET .../spotify-search`, `POST .../transfer-imports` → таблицы `transfer_imports`, `releases`, `tracks`, `artists`, `labels`. **Зависит от интеграции Spotify** (creds); без неё import-upc отдаёт 503, transfer-imports продолжается с плейсхолдерами.
- Данные: РЕАЛЬНЫЕ (при настроенном Spotify); иначе плейсхолдер-треки.
- Вердикт: Работает да (полный бэкенд) · Данные реальные (при Spotify) · 🟢 (⚠️ зависит от интеграции Spotify — integration_credentials=4, платформа поддерживает).

---

## ПРОБЛЕМЫ (releases)

1. **ISRC генерируется клиентским `Math.random()`** — `components/release-wizard/track-card.tsx:29-33` (и tracks/edit.tsx). Формат `TJ-CTM-YY-NNNNN`, коллизии вероятны, реестр не проверяется. На сервере ЕСТЬ `POST /api/catalog/codes/isrc` (`api-server/src/routes/catalog.ts:193` + `generateIsrc()` catalog.ts:141) — но фронт его НЕ вызывает.
   → Предлагаю: заменить клиентский `generateIsrc()` на вызов серверного `POST /api/catalog/codes/isrc` (последовательная нумерация, без коллизий).

2. **Dropdown «Deliver» и «Delete» в списке релизов — noop-заглушки** — `pages/releases/index.tsx:363-369`. `onClick` содержит только `e.stopPropagation()`, никакого действия/API/навигации.
   → Предлагаю: «Deliver» вести на `/releases/:id` (открыть DeliverDialog) или вызвать `POST /releases/:id/deliver`; «Delete» — подтверждение + `useDeleteRelease`. Либо убрать пункты.

3. **Takedown: выбор релиза свободным текстом + список DSP хардкодом** — `pages/releases/takedown.tsx:38` (`ALL_DSPS` хардкод 10 шт.), поля `release`/`upc` вводятся руками, не привязаны к реальному каталогу. Дублирует более корректный флоу `POST /releases/:id/request-takedown` на детальной странице.
   → Предлагаю: заменить текстовый ввод на выбор релиза из `useListReleases`, DSP-чекбоксы брать из `dsp_catalog` (реально доставленные площадки релиза).

4. **Subgenre в шапке детальной страницы захардкожен «—»** — `pages/releases/[id].tsx:490` (`KV label="Subgenre" value="—"`), игнорирует реальное `release.subgenre`.
   → Предлагаю: подставить `release.subgenre ?? "—"`.

5. **COVERAGE (карта покрытия DSP по регионам) — хардкод-объект** — `components/release-wizard/dsp-picker.tsx:25-36`. Регионы прописаны вручную по кодам, не из `dsp_catalog`. Косметика/визуализация, но при добавлении новых площадок карта устаревает.
   → Предлагаю: хранить регионы в `dsp_catalog` и брать оттуда, либо пометить как заведомо статичную справку.

6. **Хардкод-фолбэки справочников (жанр/язык/страна/типы)** — `components/release-wizard/types.ts` (`GENRES`, `SUBGENRES`, `LANGS`, `COUNTRIES`, `RELEASE_TYPES`). Используются как fallback, когда Broma16 dict пуст; но при подключённом Broma16 (768 rows) `valueKey:"code"` смешивает коды Broma16 и хардкод-строки в одном списке `extra`.
   → Предлагаю: проверить, что при активном Broma16 в payload уходит именно код словаря, а не строка-название (сервер `resolveGenres` нормализует, но лучше не полагаться).

7. **Transfer и Takedown разделы визуально «пустые»** — таблицы `transfer_imports`=0 и `takedown_requests`=0 (не баг, но пустые списки). Transfer критично зависит от настроенной интеграции Spotify (`integration_credentials`).
   → Предлагаю: убедиться, что при отсутствии Spotify-creds UI даёт понятную ошибку (503 из `import-upc` обрабатывается), и засеять демо-данные при необходимости.

8. **Доступ `/releases/:id/edit` и под-роуты не заданы явно в ROUTE_ROLES** — в `permissions.ts` есть `/releases/:id/availability` и `/splitshare`, но нет `/edit`, `/multi-track-edit`, `/reorder-tracks`, `/audio-upload`, `/tracks/:tid/edit`. Полагаются на общий ProtectedRoute-фолбэк.
   → Предлагаю: явно перечислить эти роуты в ROUTE_ROLES для предсказуемого гейтинга ролей.


# Аудит области: ДИСТРИБУЦИЯ + Broma16 + ACRCloud

Файл-страница: `artifacts/crm-panel/src/pages/distribution/index.tsx` (774 стр.)
Путь(URL): `/distribution` · Доступ (ROUTE_ROLES, `lib/permissions.ts:20`): **admin, manager**. Гард пермишена: `requireManagerPermission("distribution")` (`api-server/src/routes/index.ts:143,148`).

Общая обвязка страницы (шапка, всегда видна независимо от вкладки):
- KPI-виджеты (4 шт., `index.tsx:491-496`): «Всего сообщений / В очереди / Отправлено сегодня / Требуют внимания». Источник — агрегация по `messagesQ` (GET `/api/ddex/messages`), считается на клиенте из первых 50 записей (`kpi` useMemo `index.tsx:453-461`). ⚠️ `sentToday`/`queued`/`issues` считаются только по загруженной странице (limit=50), не по всему набору — при большом объёме цифры неточные.
- Кнопка «Обновить» (`index.tsx:481`) → invalidate трёх query-ключей (ddex-messages/batches/acks). Реальная.
- Кнопка/диалог «Создать сообщение» (`CreateMessageDialog`, `index.tsx:152-259`) — глобальная (вне вкладок). Разбор ниже во вкладке «DDEX-сообщения».

Данные по БД (справка 2026-07-08): releases 6, ddex_messages 1, ddex_batches 0, ddex_acknowledgements 0, acr_checks 0, takedown_requests(=takedowns) — в справке НЕТ (отсутствует ⇒ 0), rights_conflicts 0, broma16_push_jobs 0, broma16_dictionaries 768.

---

### Дистрибуция → Модерация (value="moderation", index.tsx:511-513 → ModerationTab, moderation-tab.tsx:93)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Поле поиска (`input-moderation-search`, moderation-tab.tsx:138) — text, необязательное, клиентская фильтрация по title/artist/upc.
  - Под-фильтры (Tabs, moderation-tab.tsx:148-155): `pending_review` / `approved` / `rejected` / `all`. Управляют query-параметром `status`.
  - Таблица (moderation-tab.tsx:158-208): колонки Релиз(title+artistName), Тип(releaseType), UPC, Получено(submittedAt), Аудио(withAudio/total — X/Y OK/fail), QC(ACR-бейдж + risk-score), Действия. Источник — GET `/api/distribution/moderation?status=…&limit=100`.
  - Бейджи: AudioBadge, QcBadge (acr.status: match/error/clean/pending/none), RiskBadge (riskScore). Все из ответа сервера.
  - Кнопка «Рассмотреть / Детали» (moderation-tab.tsx:195) → открывает `ModerationDetailDialog` (модалка). Реальная.
  - Кнопка «Открыть» (moderation-tab.tsx:198) → `<Link href="/releases/:id">`. Реальный роут.
- Модалка `ModerationDetailDialog` (moderation-detail-dialog.tsx:138): GET `/api/distribution/moderation/:releaseId/details`. Внутри: Header(cover/title/artists/status), ReleaseMetaCard(catalog/upc/genre/lang/dates/©/℗), RequirementsCard(форматы .wav/.flac, sampleRate, bitDepth — пороги из `requirements`), TracksCard(разворачиваемые треки с tech-specs из assets: sampleRateHz/bitDepth/channels/codec/size + FAIL/OK), IssuesCard(auto-QC errors/warnings), AcrCard, Textarea комментария, футер-действия.
    - Footer: «Одобрить релиз» (disabled если есть errors) → PATCH `/api/releases/:id/status` {status:"approved"}. «More actions» dropdown: Save&Exit(onClose), Fail&Return(→ FailReturnDialog, PATCH status:"rejected" + структурный note), Park/Hide(PATCH status:"parked"), Discard&Exit(onClose). Все действия — реальные мутации, кроме Save&Exit/Discard (просто закрытие, ОК по смыслу).
    - **AcrCard (moderation-detail-dialog.tsx:590-720)** — ключевой блок Broma16/ACR-потока. Внутри:
        - История ACR-проверок (`acr.latest`) из details-ответа.
        - Кнопка **«Отправить в ACRCloud»** (стр.653-660) → POST `/api/distribution/acr/drop` {releaseId}. Загружает полный DDEX-пакет в S3 ACRCloud. Реальная (endpoint distribution-extras.ts:667).
        - Query дублей: GET `/api/distribution/acr/checks?releaseId=…`, фильтр engine==="acrcloud_ddex".
        - Кнопки ручного вердикта «Уникально / Дубликат / В обработке» (стр.693-710) → POST `/api/distribution/acr/manual-result` {checkId, verdict}. Реальные.
- Бэкенд: GET `/distribution/moderation`, `/distribution/moderation/:id/details`, POST `/distribution/acr/drop`, `/distribution/acr/manual-result`, PATCH `/releases/:id/status` — все в `distribution-extras.ts` / `releases*.ts`. Таблицы: releases, artists, tracks, assets, acr_checks, rights_conflicts.
- Данные: releases=6 (есть данные), acr_checks=0 (проверок ещё не было — история/дубли будут пустыми). Модерационный поток по релизам — РЕАЛЬНЫЙ.
- Вердикт: Работает **да** · Данные **реальные (список релизов) / пусто (ACR-история)** · 🟢 (ACR-блок внутри — 🟡: реально, но таблица acr_checks пуста).

### Дистрибуция → Статус площадок (value="dsp-status", index.tsx:514-516 → DspStatusTab, dsp-status-tab.tsx:47)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Кнопка «Обновить» (dsp-status-tab.tsx:65) → refetch. Реальная.
  - Виджеты-карточки по каждому DSP (dsp-status-tab.tsx:73-110): статус интеграции (connected/unverified/disconnected/нет), Stat-счётчики sent/acked/issues, «в очереди», «всего», «Последняя отправка / ack», предупреждение при disconnected. Источник — GET `/api/distribution/dsp-status` (агрегация ddex_messages GROUP BY partner_code + JOIN integrations).
- Бэкенд: GET `/distribution/dsp-status` (distribution-extras.ts:991). Таблицы: ddex_messages, integrations.
- Данные: integrations=31 (интеграции есть), ddex_messages=1 (счётчики почти нулевые). Карточки покажут интеграции, но с почти пустой статистикой доставки.
- Вердикт: Работает **да** · Данные **реальные, но статистика почти пустая** · 🟡.

### Дистрибуция → Запланированные (value="scheduled", index.tsx:517-519 → ScheduledTab, scheduled-tab.tsx:54)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Кнопка «Обновить» (scheduled-tab.tsx:84) → refetch. Реальная.
  - Таймлайн-карточки, сгруппированные по дате релиза (scheduled-tab.tsx:98-138): бейджи «сегодня / через N дней», статус-бейдж (approved/delivering/live/pending_review), строки релизов (title/artist/type/upc/releaseTime), кнопка «Открыть» → `/releases/:id`. Источник — GET `/api/distribution/scheduled`.
- Бэкенд: GET `/distribution/scheduled` (distribution-extras.ts:1059). Таблица: releases (releaseDate в будущем).
- Данные: releases=6 — зависит есть ли релизы с будущей датой; вероятно ПУСТО (мало данных), но endpoint реальный.
- Вердикт: Работает **да** · Данные **реальные (может быть пусто)** · 🟢/🟡.

### Дистрибуция → Снятия / Takedowns (value="takedowns", index.tsx:520-522 → TakedownsTab, takedowns-tab.tsx:65)
- Путь(URL): `/distribution` · Доступ: admin, manager (список scope-aware на бэке).
- Элементы:
  - Поиск (`input-takedown-search`) — клиентская фильтрация. Кнопка «Обновить» → refetch.
  - Под-фильтры Tabs (takedowns-tab.tsx:133-141): `all` / `pending` / `processing` / `completed` / `rejected` с бейджами-счётчиками (клиентские counts).
  - Таблица (takedowns-tab.tsx:143-213): Релиз/артист, UPC, Причина+note, Площадки(dsps[]), Статус, Подано/Выполнено, Действия. Источник — GET `/api/takedowns`.
  - Кнопки действий: «В работу» (→processing), «Снят» (→completed), «Отклонить» (→rejected) — все PATCH `/api/takedowns/:id/status`. Реальные мутации.
- Бэкенд: GET/PATCH `/takedowns` (takedowns.ts:9,39 + status). Таблица: takedown_requests.
- Данные: takedown_requests — в справке БД отсутствует ⇒ **0 (пусто)**. Таблица покажет «Заявок нет».
- Вердикт: Работает **да** · Данные **пусто** · 🟡.
- ⚠️ Комментарий: заявки создаются POST `/takedowns`, но UI создания в этой вкладке НЕТ — заявки приходят извне (из портала артиста/лейбла). Здесь только обработка. Не проблема, но стоит отметить.

### Дистрибуция → ACRCloud (value="acr", index.tsx:700-702 → AcrTab, acr-tab.tsx:29)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Бейдж «credentials configured / not configured» (acr-tab.tsx:112) из `configured` в ответе. Плашка-подсказка при отсутствии ключей.
  - Кнопка «Обновить» (acr-tab.tsx:117) → load(). Реальная.
  - **Поиск релиза + выпадающий список** (acr-tab.tsx:128-189): комбобокс по `useListReleases({limit:200})` (реальный API-клиент), выбор релиза.
  - **Кнопка «Запустить»** (`button-acr-scan`, acr-tab.tsx:191-199) → POST `/api/distribution/acr/scan` {releaseId}. Это и есть кнопка запуска ACR-проверки на вкладке. Реальная.
  - Список отчётов `ScanReportCard` (acr-tab.tsx:208-219, 248+): статус (matched/clean/error/pending), музыкальные совпадения (MatchEntry: title/artists/album/label/isrc/upc/score/жанры + внешние ссылки Spotify/YouTube/Deezer из external_metadata), тех.метаданные скана (_scan_meta), raw JSON. Источник — GET `/api/distribution/acr/checks`.
- Бэкенд: GET `/distribution/acr/checks` (distribution-extras.ts:80), POST `/distribution/acr/scan` (:383), также существуют `/acr/scan-full` (:614), `/acr/drop` (:667), `/acr/manual-result` (:738). Таблица: acr_checks + integration `acrcloud`.
- Данные: acr_checks=0 → «Проверок ещё не было». Запуск требует настроенных ключей ACRCloud (иначе endpoint вернёт not_configured).
- Вердикт: Работает **да** (при наличии ключей) · Данные **пусто** · 🟡.

### Дистрибуция → Споры (value="disputes", index.tsx:704-706 → DisputesTab, disputes-tab.tsx:21)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Кнопка «Обновить» (disputes-tab.tsx:42) → load(). Реальная.
  - Список споров (disputes-tab.tsx:47-65): Release #id · claimantName, conflictType, status(open/…), приоритет, дата. Источник — GET `/api/distribution/disputes` через `adminApi`.
- Бэкенд: GET `/distribution/disputes` (distribution-extras.ts:1105). Таблица: rights_conflicts (assetType='release').
- Данные: rights_conflicts=0 → «Споров нет».
- Вердикт: Работает **да** · Данные **пусто** · 🟡.
- ⚠️ Только чтение: нет действий по спорам (разрешить/эскалировать) в этой вкладке — лишь список.

### Дистрибуция → DDEX-сообщения (value="messages", index.tsx:525-606)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Фильтры (index.tsx:530-558): Select «Статус» (9 значений draft…cancelled, хардкод-список), Select «Партнёр» (опции из `partners` = integrations delivery+dsp, реальные). Управляют query.
  - Таблица (index.tsx:563-603): messageRef+ernVersion/profile, Релиз, Партнёр, Тип(Initial/Update/Takedown), Статус(MsgStatusBadge), Создано, «Открыть». Источник — GET `/api/ddex/messages?status&partnerCode&limit=50`.
  - Клик по строке / «Открыть» → `MessageDetailDialog`.
  - Диалог **«Создать сообщение»** (CreateMessageDialog, index.tsx:152): Select релиз (useListReleases), Select партнёр, Select тип (OriginalMessage/UpdateMessage/TakedownMessage — хардкод), чекбокс «Отправить сразу». Кнопка «Создать» → POST `/api/ddex/messages`. Реальная.
  - `MessageDetailDialog` (index.tsx:263): детали сообщения GET `/api/ddex/messages/:id`, XML GET `/api/ddex/messages/:id/xml` (+ скачивание), batch-инфо, история ack, кнопки «Отправить» POST `/…/send`, «Отменить» POST `/…/cancel`. Все реальные.
- Бэкенд: `/ddex/messages` (GET/POST), `/:id`, `/:id/xml`, `/:id/send`, `/:id/cancel` (ddex.ts). Таблицы: ddex_messages, ddex_batches, ddex_acknowledgements, releases, integrations.
- Данные: ddex_messages=1 (одно сообщение). Функционал реальный.
- Вердикт: Работает **да** · Данные **реальные (1 запись)** · 🟢.

### Дистрибуция → Батчи (value="batches", index.tsx:609-646)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Таблица (index.tsx:612-643): BatchRef, Партнёр, Транспорт, Статус(BatchStatusBadge), Файлов, Размер, Загружен, Удалённый путь. Источник — GET `/api/ddex/batches?limit=50` (enabled только когда tab==="batches").
- Бэкенд: GET `/ddex/batches` (ddex.ts). Таблица: ddex_batches.
- Данные: ddex_batches=0 → «Батчей ещё не было».
- Вердикт: Работает **да** · Данные **пусто** · 🟡. Нет действий (только просмотр).

### Дистрибуция → Журнал ack (value="acks", index.tsx:649-698)
- Путь(URL): `/distribution` · Доступ: admin, manager.
- Элементы:
  - Таблица (index.tsx:652-689): Получено, Партнёр, Тип, Статус(accepted/rejected/warning), Источник, Сообщение(link → MessageDetailDialog), Batch. Источник — GET `/api/ddex/acknowledgements?limit=50` (enabled tab==="acks").
  - **Блок «Тестирование webhook»** (`ManualAckTester`, index.tsx:723-773): поле «Партнёр (X-DDEX-Partner)» (default "ddex_main", хардкод), Textarea с шаблоном XML (хардкод-заготовка), кнопка «Отправить ack» → POST `/api/ddex/acknowledgements/inbound`. Реальная (dev-инструмент).
- Бэкенд: GET `/ddex/acknowledgements`, POST `/ddex/acknowledgements/inbound` (ddexInboundRouter). Таблица: ddex_acknowledgements.
- Данные: ddex_acknowledgements=0 → «Подтверждений ещё не было».
- Вердикт: Работает **да** · Данные **пусто** · 🟡. XML-заготовка в тестере — хардкод (по назначению, dev-tool).

---

## Broma16 — где кнопка «отправить в Broma16» и как админ до неё доходит

**Важно: в разделе `/distribution` (9 вкладок) НЕТ вкладки/кнопки Broma16-push.** grep `broma16` по фронту показал 17 файлов, но push-кнопка живёт НЕ в distribution, а на карточке релиза.

- Компонент: `components/broma16-push-card.tsx` (`Broma16PushCard`, стр.98).
- Рендерится: `pages/releases/[id].tsx:640` — `{isModeratorRole && <Broma16PushCard releaseId={id} />}`.
- **Путь админа:** Каталог/Релизы → открыть релиз `/releases/:id` → (только admin/manager, `isModeratorRole`) видит карточку Broma16. НЕ через `/distribution`.
- Элементы карточки (broma16-push-card.tsx):
  - Статус: GET `/api/broma16/releases/:id/push` (release-поля + последний job из broma16_push_jobs), опрос каждые 4с пока job queued/processing.
  - Выбор витрин (outlets): Checkbox-список из GET `/api/broma16/dictionaries/outlet` (словарь Broma16, broma16_dictionaries=768 — реальные).
  - Кнопка **«Отправить»** (стр.313) → POST `/api/broma16/releases/:id/push` → `enqueueBroma16Push` (ставит job в broma16_push_jobs). Бэкенд требует статус релиза `approved` (broma16.ts:242, иначе 409).
  - Кнопка «Проверить модерацию» (стр.329) → POST `/api/broma16/releases/:id/check-moderation`.
- Бэкенд: broma16.ts (все per-route гарды `...staff` = admin/manager + distribution). Таблицы: releases (broma16_* поля), broma16_push_jobs, broma16_dictionaries.
- Данные: broma16_dictionaries=768 (витрины/словари реальны), broma16_push_jobs=0 (пушей ещё не было). Push доступен только для approved-релиза + настроенных Broma16 credentials.
- Вердикт: Работает **да (условно)** · Данные **словари реальны / jobs пусто** · 🟢/🟡.

---

## ACRCloud — сводка кнопок запуска
Две точки входа (обе реальные):
1. Вкладка `/distribution` → ACRCloud → поиск релиза → «Запустить» → POST `/distribution/acr/scan` (аудио-fingerprint отдельного релиза).
2. Модалка модерации (ModerationDetailDialog → AcrCard) → «Отправить в ACRCloud» → POST `/distribution/acr/drop` (полный DDEX-пакет в S3) + ручной вердикт `/distribution/acr/manual-result`.
Также бэкенд: `/distribution/acr/scan-full`, `/distribution/musicbrainz/check-isrc` (не вижу прямого UI для этих двух в distribution — см. проблемы). Таблица acr_checks=0.

---

## ПРОБЛЕМЫ (Дистрибуция + Broma16 + ACRCloud)

1. **Broma16-push недоступен из раздела «Дистрибуция».**
   Что: кнопка «Отправить в Broma16» есть только на карточке релиза (`components/broma16-push-card.tsx`, рендер `pages/releases/[id].tsx:640`), а в `/distribution` (позиционируется как центр дистрибуции) её нет.
   Почему проблема: неинтуитивно — админ ожидает управлять дистрибуцией из раздела «Дистрибуция», а не искать релиз в каталоге. Нет обзорного списка «что запушено/в очереди/с ошибкой» в broma16_push_jobs.
   Предлагаю: добавить в `/distribution` вкладку «Broma16 / ROD» со списком push-jobs (broma16_push_jobs) + быстрым доступом к push.

2. **KPI на шапке считаются по неполной выборке (limit=50).**
   Где: `index.tsx:453-461` (`kpi` useMemo) — `queued/sentToday/issues` фильтруются по первым 50 сообщениям, а не по всему набору.
   Почему: при >50 сообщениях цифры «В очереди / Отправлено сегодня / Требуют внимания» будут занижены и вводят в заблуждение.
   Предлагаю: считать KPI серверным агрегатом (отдельный endpoint) либо запросом без пагинации по count.

3. **Вкладка «Споры» — только чтение, без действий.**
   Где: `disputes-tab.tsx` — лишь список rights_conflicts, нет кнопок разрешить/эскалировать/назначить.
   Почему: спор нельзя обработать из UI, только увидеть; поток обрывается.
   Предлагаю: добавить действия по спору (изменение status/priority) с мутацией на бэк.

4. **Вкладка «Снятия» не даёт создать заявку.**
   Где: `takedowns-tab.tsx` — только обработка статусов; POST `/takedowns` существует, но UI-формы создания в разделе нет.
   Почему: если заявки не приходят из внешнего портала, админ не может завести takedown вручную.
   Предлагаю: добавить диалог «Новая заявка на снятие» (POST /takedowns) — если это ожидаемый сценарий.

5. **Бэкенд-эндпоинты без UI в разделе.**
   Где: `/distribution/acr/scan-full` (distribution-extras.ts:614), `/distribution/musicbrainz/check-isrc` (:786), `/distribution/backfill-audio-tech` (:1120) — не вызываются из distribution-вкладок (backfill/isrc возможно из других мест, scan-full — не найден вызов).
   Почему: «мёртвый» функционал с точки зрения этого раздела; часть возможностей ACR не доступна оператору.
   Предлагаю: проверить, откуда вызываются; при отсутствии вызова — либо добавить UI, либо удалить.

6. **Массовые пустые таблицы создают впечатление «пустого» раздела.**
   Где: takedown_requests=0, ddex_batches=0, ddex_acknowledgements=0, acr_checks=0, rights_conflicts=0, broma16_push_jobs=0, ddex_messages=1.
   Почему: все эндпоинты реальные, но без сид-данных 7 из 9 вкладок показывают «нет данных» — тяжело оценить работоспособность/провести приёмку.
   Предлагаю: сид демо-данных для дистрибуции (это же предложено в Task #2/#3) — заполнить хотя бы по 2-3 записи в takedowns/acr_checks/ddex_batches/acks.

7. **ManualAckTester (dev-инструмент) в проде-UI.**
   Где: `index.tsx:723-773`, вкладка «Журнал ack» — блок «Тестирование webhook» с хардкод-XML.
   Почему: технический тестер виден обычному admin/manager; для продакшена это шумно и потенциально опасно (ручная инъекция ack).
   Предлагаю: скрыть за флагом окружения/дев-режимом или переместить в служебный раздел.


# Аудит области КАТАЛОГ (Tajik Music Distribution CRM)

Дата: справка БД от 2026-07-08. Режим: read-only.

Область охватывает хаб `/catalog` (табы hub, releases, artists, labels, videos) и под-страницы
`/catalog/assets`, `/catalog/duplicates`, `/catalog/codes`, `/catalog/bulk-edit`.

Ключевое системное наблюдение (см. раздел ПРОБЛЕМЫ):
- Бэкенд монтирует ВСЕ роуты под `/api/catalog/*` за middleware `requireRole("admin","manager")`
  (`artifacts/api-server/src/routes/index.ts:81,174`), а фронтовый `ROUTE_ROLES` даёт
  `/catalog/codes` роли `label` (`permissions.ts:51`). => label получит 403 от бэка.

---

### Каталог → hub (value="hub", index.tsx:95)
- Путь(URL): `/catalog` (default, `setLocation("/catalog")`) · Доступ: admin, manager (ROUTE_ROLES `/catalog`). Manager дополнительно гейтится ключом `catalog`.
- Элементы:
  - Сетка из 9 карточек-ссылок `HUB_CARDS` (index.tsx:30–40, ХАРДКОД-массив в файле). Каждая карточка — `<Link>` на:
    - Релизы → `/catalog?tab=releases`
    - Исполнители → `/catalog?tab=artists`
    - Лейблы → `/catalog?tab=labels`
    - Видео → `/catalog?tab=videos`
    - Ассеты → `/catalog/assets`
    - Дубликаты → `/catalog/duplicates`
    - Генератор кодов → `/catalog/codes`
    - Массовое редактирование → `/catalog/bulk-edit`
    - Треки → `/releases?tab=tracks`
  - Заголовок берётся из i18n `nav.catalog_group` с фолбэком «Каталог».
- Бэкенд: нет (чистая навигация ссылками).
- Данные: н/д (навигационный хаб).
- Вердикт: Работает? да (навигация) · Данные? н/д · 🟢 реально (навигация корректна).

---

### Каталог → releases (value="releases", index.tsx:112)
- Путь(URL): `/catalog?tab=releases` · Доступ: admin, manager.
- Элементы: рендерит `<ReleasesPanel/>` из `pages/releases/index.tsx:51` — тот же компонент, что и на `/releases`.
  Полный разбор списка релизов относится к области РЕЛИЗЫ; здесь это встроенная панель без фильтра по scope.
- Бэкенд: `GET /api/releases` (releases роут) → таблица `releases`.
- Данные: РЕАЛЬНЫЕ (releases n_live_tup=6).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

---

### Каталог → artists (value="artists", index.tsx:116)
- Путь(URL): `/catalog?tab=artists` · Доступ: admin, manager.
- Элементы: рендерит `<ArtistsPanel/>` из `pages/artists/index.tsx:25` — тот же, что на `/artists`. Полный разбор — область АРТИСТЫ.
- Бэкенд: `GET /api/artists` → таблица `artists`.
- Данные: РЕАЛЬНЫЕ (artists n_live_tup=4).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

---

### Каталог → labels (value="labels", index.tsx:120, ТОЛЬКО admin/manager)
- Путь(URL): `/catalog?tab=labels` · Доступ: admin, manager (таб виден лишь при `isAdminLike`, index.tsx:67,87).
- Элементы: рендерит `<LabelsPanel/>` из `pages/labels/index.tsx:25` — тот же, что на `/labels`. Разбор — область ЛЕЙБЛЫ.
- Примечание: комментарий в коде говорит «только admin», но фактически условие `isAdminLike` = admin ИЛИ manager (index.tsx:67).
- Бэкенд: `GET /api/labels` → таблица `labels`.
- Данные: РЕАЛЬНЫЕ (labels n_live_tup=2).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

---

### Каталог → videos (value="videos", index.tsx:126, ТОЛЬКО admin/manager)
- Путь(URL): `/catalog?tab=videos` · Доступ: admin, manager (при `isAdminLike`).
- Элементы: рендерит `<CatalogAssetsPanel initialKindOverride="video"/>` (assets.tsx:39) — панель ассетов с зафиксированным фильтром `kind=video`.
- Бэкенд: `GET /api/assets?kind=video` → `assets.ts:125` → таблица `assets`.
- Данные: ПУСТО. Таблица `assets` — 0 записей (в списке пустых). Эндпоинт реальный, отдаёт `[]`, UI покажет «Нет ассетов».
- Вердикт: Работает? да (эндпоинт реальный) · Данные? пусто · 🟡 реально-но-пусто.
- ⚠️ Дополнительно: контракт ответа рассогласован (см. ниже раздел assets) — фронт ждёт `j.assets/j.items`, бэк отдаёт голый массив → даже при наличии данных список останется пустым.

---

### Каталог → Ассеты (страница /catalog/assets, assets.tsx:31 / панель :39)
- Путь(URL): `/catalog/assets` · Доступ: admin, manager (ROUTE_ROLES `/catalog/assets`, permissions.ts:49; manager-key `catalog`).
- Элементы:
  - Поле поиска (Input, текст, необязательное) — фильтрация клиентская по `filename` (assets.tsx:68). Не отправляется на сервер.
  - Select «Тип» (assets.tsx:83) — источник опций ХАРДКОД в JSX: all/audio/cover/video/document/avatar. Значение уходит в query `kind`.
  - Кнопка «Обновить» (assets.tsx:94) → повторный `load()` → `GET /api/assets?kind=...`.
  - Таблица (assets.tsx:100) — колонки: ID, Файл (filename), Тип (kind, Badge), MIME, Размер (formatSize), Связан с (releaseId/trackId/artistId/labelId), Создан (createdAt). Источник — `GET /api/assets`.
- Бэкенд: `GET /api/assets` → `artifacts/api-server/src/routes/assets.ts:125` → таблица `assets`. Есть scope-фильтрация (artist/label видят только своё).
- Данные: ПУСТО. Таблица `assets` = 0 записей.
- Вердикт: Работает? частично · Данные? пусто · 🟡 реально-но-пусто.
- ⚠️ КОНТРАКТ: фронт `setItems(j.assets ?? j.items ?? [])` (assets.tsx:60), а бэк отвечает голым массивом `res.json(rows.map(serialize))` (assets.ts:157). При появлении данных таблица останется пустой — надо `j` (массив) либо изменить ответ сервера.

---

### Каталог → Дубликаты (страница /catalog/duplicates, duplicates.tsx:68; под-компонент DuplicatesList :14)
- Путь(URL): `/catalog/duplicates` · Доступ: admin, manager (ROUTE_ROLES `/catalog/duplicates`, permissions.ts:50; manager-key `catalog`).
- Элементы:
  - Кнопка «Назад» (duplicates.tsx:73) → `history.back()`.
  - Вложенные табы (defaultValue="artist"): Артисты(artist), Треки(track), Релизы(release), Файлы sha256(asset) — duplicates.tsx:79–89.
  - Каждый таб рендерит `<DuplicatesList type=.../>` (duplicates.tsx:14):
    - Строка «Найдено групп дубликатов: N».
    - Кнопка «Обновить» → `load()`.
    - Карточки групп: ключ (`g.key`), число записей (`g.cnt`), список элементов группы как `JSON.stringify(it)` (сырой JSON, duplicates.tsx:58).
- Бэкенд: `GET /api/catalog/duplicates?type=...` → `artifacts/api-server/src/routes/catalog.ts:19`. Реальный SQL `GROUP BY ... HAVING count(*)>1`:
  - artist → таблица `artists` (по lower(name));
  - track → `tracks` (по ISRC/lower(title));
  - release → `releases` (по UPC/lower(title));
  - asset → `assets` (по sha256).
- Данные: РЕАЛЬНЫЕ запросы. Фактический результат:
  - artist/track/release — по данным (artists 4, tracks 5, releases 6), группы дублей вероятны только если есть совпадения (обычно пусто → «Дубликатов не найдено»).
  - asset — таблица `assets` пуста → всегда пусто.
- Вердикт: Работает? да · Данные? реальные (запросы к живым таблицам; asset-вкладка пуста) · 🟢 реально (asset-подвкладка 🟡 пусто).

---

### Каталог → Генератор кодов (страница /catalog/codes, codes.tsx:55; под-компонент Generator :14)
- Путь(URL): `/catalog/codes` · Доступ (ФРОНТ ROUTE_ROLES): admin, manager, **label** (permissions.ts:51). Manager-key `catalog`.
- Элементы:
  - Кнопка «Назад» (codes.tsx:60) → `history.back()`.
  - Два блока Generator:
    - ISRC (codes.tsx:67): описание формата TJ-TM1-YY-NNNNN. Кнопка «Сгенерировать» → `POST /api/catalog/codes/isrc`; кнопка «Копировать» → clipboard + toast; поле-дисплей с кодом.
    - UPC (codes.tsx:68): описание 12 цифр + контрольная. Кнопка «Сгенерировать» → `POST /api/catalog/codes/upc`; кнопка «Копировать».
  - Инфо-блок пояснений (codes.tsx:71–75) — статичный текст; отмечает, что коды не сохраняются автоматически.
- Бэкенд:
  - `POST /api/catalog/codes/isrc` → `catalog.ts:193` (`generateIsrc`, :141) — атомарный счётчик в `platform_settings` (key="codes").
  - `POST /api/catalog/codes/upc` → `catalog.ts:202` (`generateUpc`, :169).
  - Таблица: `platform_settings` (для счётчика/префиксов).
- Данные: РЕАЛЬНЫЕ (генерация с БД-счётчиком).
  - Нюанс 1: UPC вернёт 409, если `upcCompanyPrefix` не настроен (catalog.ts:176) — на «свежей» установке кнопка UPC даст ошибку/toast. `platform_settings` в списке пустых → префикс не настроен → UPC не работает без настройки.
  - Нюанс 2: ISRC отдаёт placeholder-регистрант TM1 с warning; фронт warning не показывает (берёт только `j.code`, codes.tsx:11).
- Вердикт: Работает? частично (ISRC — да; UPC — только после настройки префикса) · Данные? реальные · 🟢 реально (UPC 🟡 требует настройки).
- ⚠️ РАССОГЛАСОВАНИЕ ДОСТУПА: фронт даёт роль `label`, но бэкенд-guard `/catalog` = admin/manager (index.ts:174) → label получит 403 при генерации.

---

### Каталог → Массовое редактирование (страница /catalog/bulk-edit, bulk-edit.tsx:22)
- Путь(URL): `/catalog/bulk-edit` · Доступ: НЕ в ROUTE_ROLES явно → `canAccess` берёт longest-prefix `/catalog` = admin, manager (permissions.ts:127-131). Backend: admin/manager.
- Элементы:
  - Select «Сущность» (bulk-edit.tsx:64) — источник опций ХАРДКОД `ENTITIES` (bulk-edit.tsx:16): release/track/artist. (Бэкенд также поддерживает `label`, но UI его не предлагает.)
  - Textarea «ID» (bulk-edit.tsx:73) — список ID через запятую/строки; парсится клиентом.
  - Textarea «Patch (JSON)» (bulk-edit.tsx:77) — JSON-патч, дефолт `{"status":"active"}`.
  - Кнопка «Применить» (bulk-edit.tsx:83) → `confirm()` → `POST /api/catalog/bulk-edit` через `adminApi`. Показывает `affectedCount`.
- Бэкенд: `POST /api/catalog/bulk-edit` → `catalog-bulk.ts:53`. Zod discriminatedUnion по entity (release/track/artist/label), whitelisting полей patch, `db.update(...).returning`, аудит `auditMutation` (action=bulk_edit) → `audit_log`.
  - Таблицы: `releases` / `tracks` / `artists` / `labels` + `audit_log`.
- Данные: РЕАЛЬНЫЕ (реальный UPDATE + аудит; audit_log n_live_tup=13).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

---

## ПРОБЛЕМЫ (Каталог)

1. **Рассогласование доступа для `label` на /catalog/codes**
   - Где: фронт `permissions.ts:51` (label разрешён) vs бэк `routes/index.ts:174` (`requireRole("admin","manager")` на всём `/catalog`).
   - Почему: label пройдёт фронтовый guard и увидит страницу, но `POST /api/catalog/codes/isrc|upc` вернёт 403.
   - Предлагаю: либо убрать `label` из ROUTE_ROLES `/catalog/codes`, либо вынести codes-роут из-под общего `adminOnly` и добавить точечный guard, разрешающий label.

2. **Контракт ответа /api/assets рассогласован с фронтом**
   - Где: фронт `assets.tsx:60` ждёт `j.assets ?? j.items ?? []`; бэк `assets.ts:157` отдаёт голый массив.
   - Почему: даже когда в `assets` появятся данные, список ассетов (и таб «Видео») останется пустым — тихая потеря данных.
   - Предлагаю: во фронте использовать сам массив (`Array.isArray(j) ? j : (j.assets ?? j.items ?? [])`), либо обернуть ответ сервера в `{ assets: [...] }`.

3. **UPC-генератор не работает без настройки префикса, ошибка непрозрачна**
   - Где: `catalog.ts:176` (409 при пустом `upcCompanyPrefix`); `platform_settings` в списке пустых таблиц.
   - Почему: на текущей БД UPC-кнопка выдаст toast-ошибку без объяснения, где настроить (Настройки → Каталог → UPC).
   - Предлагаю: показывать понятный текст ошибки/линк на настройки; или сидировать дефолтный префикс.

4. **ISRC warning не доводится до пользователя**
   - Где: бэк возвращает `warning` (catalog.ts:196), фронт берёт только `j.code` (codes.tsx:11).
   - Почему: пользователь не узнает, что используется placeholder-регистрант TM1 и коды нельзя отдавать в DSP.
   - Предлагаю: показывать `warning` в toast/баннере на codes.tsx.

5. **Клиентский поиск ассетов не масштабируется**
   - Где: `assets.tsx:68` — фильтр по filename только среди загруженных строк; бэк лимитирует 200 (assets.ts:156).
   - Почему: при >200 ассетах поиск найдёт не всё.
   - Предлагаю: передавать поисковый запрос на сервер (query-параметр), либо явно пометить лимит в UI.

6. **UI bulk-edit не предлагает сущность `label`, хотя бэк поддерживает**
   - Где: `bulk-edit.tsx:16` (ENTITIES без label) vs `catalog-bulk.ts:50` (label в union).
   - Почему: неполное покрытие функционала (не баг, но недоработка).
   - Предлагаю: добавить `{value:"label"}` в ENTITIES (для admin/manager).

7. **Комментарий кода вводит в заблуждение (labels/videos «только admin»)**
   - Где: `index.tsx:65-67` — комментарий про label/artist, условие `isAdminLike` фактически = admin ИЛИ manager; задание помечало labels/videos как «только admin».
   - Почему: расхождение ожидания и реализации; manager тоже видит эти табы.
   - Предлагаю: уточнить требование по видимости labels/videos для manager и привести комментарий/логику в соответствие.

8. **Дубликаты: сырой JSON в UI**
   - Где: `duplicates.tsx:58` — элементы группы выводятся как `JSON.stringify(it)`.
   - Почему: непригодно для оператора (нет ссылок на объекты, нечитаемо).
   - Предлагаю: отрисовать поля таблицей/чипами со ссылками на сущность (артист/трек/релиз/ассет).


# Аудит: ФИНАНСЫ / РОЯЛТИ / СПЛИТЫ / ВЫПЛАТЫ

Область: `/finance`, `/finance/import`, `/finance/unmatched`, `/royalties`, `/splits`, `/payouts`.
Метод: код прочитан построчно, каждый useQuery/fetch трассирован до серверного роута и таблицы БД.

---

## Финансы → Overview  (value="overview", finance/index.tsx:124 / панель :143)
- Путь: `/finance` (tab по умолчанию, без query). Только внутри `Finance`. · Доступ(ROUTE_ROLES `/finance`): **admin, manager, artist** (label в permissions НЕ входит; но вкладка рендерится только для admin/manager — `isAdminLike`, строка 103/123).
- Замечание: для роли **artist** `overview` не отрисовывается (нет TabsTrigger при !isAdminLike), а defaultTab="overview" → артист на `/finance` увидит пустое содержимое, пока не переключит вкладку. Артист по факту попадает на royalties/splits/payouts.
- Элементы:
  - `PeriodSummaryCard` (виджет, artistId/labelId проп) — отдельный компонент периодовой сводки (не в этой области; данные тянет сам).
  - 4 KPI-карточки: Total Income, Total Payouts, Transactions (count), Balances/Balance — источник `useListTransactions` (агрегация на клиенте: сумма amount>0 / <0) + `useListBalances`.
  - Карточка «Revenue Ingestion (DSP CSV)» (только admin/manager): кнопка «Unmatched» → `Link /finance/unmatched` (+бейдж счётчика pending), кнопка «Upload CSV» → `Link /finance/import`. Таблица истории импортов (Date, DSP, Period, File, Inserted, Unmatched, Revenue) — `fetch('/api/finance/imports?limit=10')`, бейдж — `fetch('/api/finance/ingest/unmatched?status=pending&limit=1')`.
  - «Transaction Ledger»: поиск (клиентский фильтр по description/platform/artistName), Export dropdown → `exportTransactions({format:xlsx|csv})` (lib/export-finance), таблица (Type[Badge с TYPE_LABELS хардкод-словарь], Artist/Platform, Description, Period, Amount) + пагинация Previous/Next.
  - «Balances»: список балансов (entityName/type, balance, pendingPayout), фильтруется по роли.
  - Карточка «Комиссии» → `<CommissionsTab/>` (только admin/manager).
- Бэкенд: `GET /finance/transactions` (finance.ts:81), `GET /finance/balances` (finance.ts:172), `GET /finance/imports` (ingestion.ts:183), `GET /finance/ingest/unmatched` (ingestion.ts:221) → таблицы `transactions`, `deliveries/payouts`(баланс), `ingestion_imports`, `ingestion_unmatched`.
- Данные: transactions=**РЕАЛЬНЫЕ** (7 строк); balances — вычисляемые из БД; imports — **ПУСТО** (`ingestion_imports` n_live_tup=0); unmatched — **ПУСТО** (`ingestion_unmatched`=0). Словари DSP_LABELS/TYPE_LABELS/TYPE_COLORS — хардкод в компоненте (только оформление).
- Вердикт: Работает **да** · Данные **реальные (транзакции) + пусто (импорты/unmatched)** · 🟢 (ledger/balances) + 🟡 (ingestion-таблица пуста).

## Финансы → Комиссии  (CommissionsTab, finance/commissions-tab.tsx:28)
- Встроена в overview. Доступ фактический admin/manager.
- Элементы: кнопка «Обновить» (reload GET), «Добавить» (открывает Dialog). Список правил (Badge scope, %, label/artist/dsp, дата). Кнопка удаления (Trash) на каждой строке → DELETE. Диалог: Select **область** (global/label/artist/dsp — хардкод SelectItem), Input labelId/artistId/dspCode (условные), Input percentage(15 по умолч.), Input notes. Кнопка «Создать» → POST.
- Бэкенд: `GET/POST /finance/commissions`, `PATCH/DELETE /finance/commissions/:id` (finance-extras.ts:40-73) → таблица `commission_rules`.
- Данные: `commission_rules` **ПУСТО** (n_live_tup=0).
- 🔴 **КРИТИЧНО**: правила комиссий НИГДЕ не применяются в расчёте роялти. `royalties.ts` использует хардкод `PLATFORM_FEE_RATE=0.15` (lib/finance.ts:3), а `commissionRulesTable` читается ТОЛЬКО в CRUD finance-extras.ts — grep по royalties.ts даёт 0 вхождений «commission». То есть UI-обещание «Применяется при расчёте роялти» ложно.
- Вердикт: Работает **частично (CRUD да, применение нет)** · Данные **пусто** · 🟡 таблица пуста + 🔴 бизнес-логика применения не реализована.

---

## Роялти → Summary  (value="summary", royalties/index.tsx:274)
- Путь: `/royalties` (own Layout) ИЛИ `/finance?tab=royalties` (RoyaltiesPanel переиспользуется). · Доступ(`/royalties`): **admin, manager, label, artist**.
- Внутренние вкладки (Tabs defaultValue, БЕЗ URL-синхронизации — состояние теряется при перезагрузке): summary, statements, releases, dsp, request, history, +by_artist (только label).
- KPI-полоса (над табами): Available (min payout), In processing (pending), This month (gross + %дельта), Streams (+%). Источник — `useGetRoyaltySummary`.
- Summary: AreaChart (gross/net timeline 12 мес) + карточка KPI (lifetime, current/prev month, nextStatementDate, nextPaymentDate).
- Бэкенд: `GET /royalties/summary` (royalties.ts:59) → таблица `transactions`.
- Данные: **РЕАЛЬНЫЕ** из transactions. НО: `net = gross*(1-0.15)` — фикс. 15% комиссия (хардкод). `streams` — НЕ реальные: аппроксимация `gross/STREAM_RATE_USD(0.0035)` (royalties.ts:100). `nextStatement/nextPayment` — вычисляемые даты (15/28 след. месяца, хардкод логика).
- Вердикт: Работает **да** · Данные **реальные + вычисляемые-суррогатные (streams, fee)** · 🟢 с оговоркой 🔴 на streams-аппроксимацию и фикс-fee.

## Роялти → Statements  (value="statements", royalties/index.tsx:355)
- Таблица: Period, Streams, Gross, Commission(−fees), Net, Status(draft/finalized/paid), Download PDF/CSV.
- Кнопки PDF/CSV → `<a href="/api/royalties/statements/{period}/download?format=pdf|csv">`.
- Бэкенд: `GET /royalties/statements` (royalties.ts:127), `GET /royalties/statements/:period/download` (royalties.ts:223) → `transactions`.
- Данные: **РЕАЛЬНЫЕ (агрегация по transactions)**. Statement-строки СИНТЕЗИРУЮТСЯ на 12 месяцев назад (пустые месяцы gross=0). Статус draft/finalized/paid определяется ТОЛЬКО возрастом месяца (i==0 draft, <3 finalized, else paid) — royalties.ts:163, **не реальный статус выплаты**. `id` = число из period. Download отдаёт реальный CSV/PDF из БД.
- Вердикт: Работает **да** · Данные **реальные, статусы фиктивные** · 🟢/🔴 (status — псевдо-логика по возрасту).

## Роялти → By Release  (value="releases", royalties/index.tsx:424)
- Таблица: cover, title/UPC, artist, streams, gross, net, trend%.
- Бэкенд: `GET /royalties/by-release` (royalties.ts:310) → `transactions` (join releases для cover/title). trend — реальный (30д vs пред. 30д).
- Данные: **РЕАЛЬНЫЕ** (releases=6, transactions=7). streams — аппроксимация. cover из releases.coverUrl.
- Вердикт: **да** · реальные · 🟢.

## Роялти → By DSP  (value="dsp", royalties/index.tsx:489)
- PieChart (gross по dsp) + BarChart + таблица (platform, streams, gross, net, share%, trend%).
- Бэкенд: `GET /royalties/by-dsp` (royalties.ts:382) → `transactions` группировка по platform. trend реальный.
- Данные: **РЕАЛЬНЫЕ** (из transactions.platform). PIE_COLORS — хардкод-палитра (оформление).
- Вердикт: **да** · реальные · 🟢.

## Роялти → Request Payment  (value="request", royalties/index.tsx:590)
- Форма: Input amount(number,обяз.), Select method (bank_transfer/paypal/payoneer/crypto/wallet — хардкод), Input details. Кнопка «Submit» + «Request max».
- Guard-алерты (реальные): недоступно если не artist/label; KYC не approved → блок + ссылка /profile; отсутствуют bank-реквизиты → блок. Клиентская валидация: >0, >=minimumPayout, <=availableBalance.
- Бэкенд: `useCreatePayoutRequest` → `POST /payouts` (finance.ts:392) → таблица `payouts`. Сервер дублирует KYC+bank guard (finance.ts:421-449), scope-проверки, two-step по threshold из `platform_settings`, notifyAdmins/notifyByArtistId.
- Данные: **РЕАЛЬНЫЕ** (payouts=4). ВНИМАНИЕ: `platform_settings` **ПУСТО** → threshold=0 → two-step на этом пути отключён (в POST /payouts берётся 0; в approve default $1000).
- Вердикт: Работает **да** · реальные · 🟢.

## Роялти → History  (value="history", royalties/index.tsx:713)
- Таблица выплат: date, method, amount, status(Badge), processedAt, note(rejectionReason/paymentDetails).
- Бэкенд: `useListPayouts` → `GET /payouts` (finance.ts:353) → `payouts`.
- Данные: **РЕАЛЬНЫЕ** (payouts=4). Лейблы статусов/методов — i18n словари.
- Вердикт: **да** · реальные · 🟢.

## Роялти → By Artist  (value="by_artist", royalties/index.tsx:772, ТОЛЬКО label)
- Условно рендерится при `user.role==="label"`. Таблица агрегируется НА КЛИЕНТЕ из `byReleaseQ.data` (group by artistName): релизов, стримов, gross, net, доля(bar). Кнопка «CSV» — клиентская генерация Blob (не API).
- Бэкенд: переиспользует `GET /royalties/by-release`. Отдельного by-artist эндпоинта НЕТ.
- Данные: **РЕАЛЬНЫЕ** (производные от by-release). CSV-экспорт — чисто клиентский.
- Вердикт: **да** · реальные (агрегация на фронте) · 🟢.

---

## Сплиты  (value="splits", splits/index.tsx:34 / диалог _new-split-dialog.tsx)
- Путь: `/splits` или `/finance?tab=splits`. · Доступ(`/splits`): **admin, manager, label, artist**.
- Элементы:
  - Кнопка «Новый сплит» (только admin/manager) → `<NewSplitDialog/>`.
  - Таблица: Entity(release/track name + overall-badge), Participants(count), Distribution(бейджи с % и иконкой статуса accepted/rejected/pending + прогресс-бар), Created, Actions.
  - Actions: для artist/label-участника со статусом pending — кнопки «Принять»/«Отклонить» → `fetch POST /api/splits/:id/accept|reject`. Для admin/manager — Trash (delete) → `useDeleteSplit`. Пагинация.
  - Диалог NewSplitDialog: выбор release/track (Select из `useListReleases`/`useListTracks` — реальные), участники (Select entityType хардкод: artist/label/producer/author/distributor/custom; для artist/label — Select пользователя из `useListUsers` фильтр по role; иначе Input имени), Input percentage, валидация суммы=100%. Кнопка «Создать» → `useCreateSplit`.
- Бэкенд: `GET/POST /splits` (splits.ts:114/165), `POST /splits/:id/accept|reject` (splits.ts:390/394), `DELETE /splits/:id` (splits.ts:292) → таблицы `splits`, `release_artists`/участники.
- Данные: **РЕАЛЬНЫЕ** (splits=3, releases=6, tracks=5, users=4). COLORS/BAR_COLORS — хардкод-палитра. entityType-опции — хардкод (не из dict). overall-статусы «Все подписали»/«Отклонён» и т.п. — хардкод RU-строки (не через i18n).
- Вердикт: Работает **да** · реальные · 🟢.

---

## Выплаты  (value="payouts", payouts/index.tsx:30)
- Путь: `/payouts` или `/finance?tab=payouts`. · Доступ(`/payouts`): **admin, manager, label, artist**.
- Элементы:
  - Фильтры дат from/to (Input date), Export dropdown: Excel → `exportPayouts({format:xlsx})`, CSV → `exportPayoutsCsv` (потоковый, прогресс `exportLoaded`). Кнопка «Запросить выплату» (только НЕ admin/manager) → `<RequestPayoutDialog/>`.
  - Поиск (клиентский по artist/label/method). Кнопка Filter (иконка) — **БЕЗ onClick, декоративная** (строка 175).
  - Таблица: аватар, Entity(name+тип), Amount, Method(capitalize), Date requested, Status(`StatusBadge`), Actions.
  - Actions: для pending+admin/manager — `<PayoutApprovalActions/>` (Подтвердить/Отклонить); для pending+не-admin — текст «awaiting review».
  - RequestPayoutDialog: Input amount(обяз.), Select currency (USD/EUR/RUB хардкод), Select method (bank_transfer/paypal/crypto/qiwi/yoomoney хардкод — ОТЛИЧАЕТСЯ от royalties-формы, где payoneer/wallet вместо qiwi/yoomoney), Input details. → `useCreatePayoutRequest` (POST /payouts).
  - PayoutApprovalActions: «Подтвердить» → `fetch POST /api/finance/payouts/:id/approve`; «Отклонить» (window.prompt причины) → `fetch POST /api/finance/payouts/:id/reject`. После — `window.location.reload()` (грубый reload вместо invalidate).
- Бэкенд: `POST /payouts` (finance.ts:392); approve/reject идут в `POST /finance/payouts/:id/approve|reject` (finance-extras.ts:85/135, two-step L1/L2, запрет самоподтверждения L2). ПРИМЕЧАНИЕ: в finance.ts:514 ЕСТЬ дублирующий `PATCH /payouts/:id/approve` (реализует ту же two-step логику), который фронтом НЕ используется → мёртвый/дублирующий эндпоинт. → таблица `payouts`.
- Данные: **РЕАЛЬНЫЕ** (payouts=4).
- Вердикт: Работает **да** · реальные · 🟢 (с замечаниями: кнопка Filter пустая ⚪, reload-вместо-invalidate, дубль approve-роута).

---

## Финансы → Импорт  (finance/import.tsx:72)
- Путь: `/finance/import`. · Доступ(`/finance/import`): **admin, manager**. Серверный guard: `/finance/ingest` и `/finance/imports` под `adminOnly + requireManagerPermission("finance")` (index.ts:108-109).
- Элементы:
  - Шаг 1: Select DSP (spotify/apple_music/youtube_music/tiktok — хардкод DSP_OPTIONS), Input period (YYYY-MM, автозаполняется из preview), dropzone (drag&drop + input file .csv/.tsv, max 50MB). Кнопки «Сбросить», «Preview».
  - Шаг 2 (после preview): 5 Stat-карточек (Total/Valid/Matched/Unmatched/Revenue), detected period, warnings, таблица sample (ISRC/Title/Artist/Country/Streams/Revenue/Match badge). Checkbox «force-correction» (появляется если existingTransactionsForPeriod>0). Кнопка «Commit Import» (disabled без period или без галочки при существующих tx).
  - История импортов: таблица (Date/DSP/Period/File/Inserted/Unmatched/Revenue) — `GET /finance/imports?limit=20`.
- Бэкенд: `POST /finance/ingest/preview` (ingestion.ts:107, multipart), `POST /finance/ingest/commit` (ingestion.ts:125, force-флаг, 409 existing_transactions guard, дедуп SHA256+DSP+период), `GET /finance/imports` (ingestion.ts:183) → таблицы `ingestion_imports`, `usage_reports`, `transactions`, `ingestion_unmatched`.
- Данные: логика реальная (полноценный preview→commit→dedup). Таблицы **ПУСТЫ**: `ingestion_imports`=0, `usage_reports`=0, `ingestion_unmatched`=0 → история пуста, но пайплайн рабочий.
- Вердикт: Работает **да (реальный пайплайн)** · Данные **пусто** · 🟡.

## Финансы → Unmatched  (finance/unmatched.tsx:58, под-вкладки pending/resolved/all)
- Путь: `/finance/unmatched`. · Доступ: в ROUTE_ROLES для `/finance/unmatched` записи НЕТ → наследует общий protected; клиентский guard `isAdminLike` показывает «Только для админов/менеджеров» иначе. Серверный guard adminOnly.
- Элементы:
  - Кнопка «Авто-сопоставить» → `POST /finance/ingest/unmatched/bulk-auto-resolve` (по ISRC + название+артист), выводит summary-карточку.
  - 2 KPI: «В ожидании» (count), «Незачисленный доход» (pendingRevenue).
  - Tabs фильтра: pending/resolved/all (`TabsList`, синхронизировано со state, не с URL).
  - Поиск (debounce 300мс) по ISRC/трек/артист. Таблица: Date/DSP/Period/ISRC/Track/Artist/Revenue/Streams/Action. Action: «Сопоставить» → открывает `<ResolvePicker/>`, либо бейдж «Сопоставлено».
  - ResolvePicker (Dialog): поиск трека (debounce, `GET /finance/ingest/track-search`), список кандидатов, выбор, кнопка «Сопоставить и зачислить» → `POST /finance/ingest/unmatched/:id/resolve {trackId}` (с защитой от задвоения дохода — alreadyAccounted).
- Бэкенд: `GET /finance/ingest/unmatched` (ingestion.ts:221), `bulk-auto-resolve` (ingestion.ts:534), `track-search` (ingestion.ts:308), `.../resolve` (ingestion.ts:338) → `ingestion_unmatched`, `tracks`, `transactions`.
- Данные: логика реальная. `ingestion_unmatched`=0 → пусто (все таблицы, автокнопка disabled при totalPending==0).
- Вердикт: Работает **да** · Данные **пусто** · 🟡.

---

## Разобрано вкладок/страниц
overview, commissions, royalties(summary/statements/releases/dsp/request/history/by_artist), splits(+dialog), payouts(+request-dialog+approval), import, unmatched(pending/resolved/all).

---

## ПРОБЛЕМЫ (finance)

1. **Правила комиссий не влияют на расчёт** — что: `CommissionsTab` создаёт правила в `commission_rules`, но роялти считаются по хардкоду 15%. где: royalties.ts:81/160/357/409 (`PLATFORM_FEE_RATE`=lib/finance.ts:3), commissionRulesTable читается только в finance-extras.ts (grep=0 в royalties.ts). почему: UI-текст «Применяется при расчёте роялти» ложный; per-label/artist/dsp комиссии игнорируются. предлагаю: подключить commissionRules к aggregate-функциям роялти (по scope+effectiveFrom) или пометить фичу «планируется».

2. **Streams — не реальные, а деление gross/0.0035** — где: royalties.ts:100-101/143/204/358. почему: KPI «Streams» и колонки «Streams» вводят в заблуждение (это производная от денег, а не факт стримов). предлагаю: брать стримы из `usage_reports`/`tiktok_stats`/`playlist_stats`, либо явно подписать «оценка».

3. **Статусы стейтментов фиктивные** — где: royalties.ts:163 (draft/finalized/paid по возрасту месяца). почему: не отражают реальную выплату/финализацию. предлагаю: определять статус из реальных payouts/периодной финализации.

4. **Дублирующий payout-approve роут** — где: finance.ts:514 `PATCH /payouts/:id/approve` vs finance-extras.ts:85 `POST /finance/payouts/:id/approve` (фронт использует POST). почему: две реализации two-step, риск расхождения логики/поддержки. предлагаю: удалить неиспользуемый PATCH или свести к одному.

5. **Две несовпадающие формы запроса выплаты** — где: royalties/index.tsx:100 (методы bank_transfer/paypal/payoneer/crypto/wallet) vs payouts/index.tsx:278 (bank_transfer/paypal/crypto/qiwi/yoomoney), currency-select только в payouts. почему: расхождение методов/UX для одного и того же `POST /payouts`. предлагаю: единый источник списка методов/валют (общий dict).

6. **Кнопка Filter без обработчика** — где: payouts/index.tsx:175 (иконка Filter, нет onClick). почему: ⚪ декоративная заглушка. предлагаю: реализовать фильтр по статусу/методу или убрать.

7. **`window.location.reload()` после approve/reject** — где: payouts/index.tsx:405/424. почему: грубый full-reload вместо `queryClient.invalidateQueries`, сбрасывает состояние/фильтры. предлагаю: инвалидировать `getListPayoutsQueryKey`.

8. **overview не отображается для artist + вкладки роялти без URL-синхронизации** — где: finance/index.tsx:103/123 (нет overview-триггера для artist, а defaultTab="overview"); royalties/index.tsx:260 (`Tabs defaultValue` без useSearch). почему: артист на `/finance` видит пустоту до переключения; refresh/deeplink на под-вкладку роялти теряется. предлагаю: для artist делать дефолт-вкладку royalties; синхронизировать роялти-табы с query.

9. **`/finance/unmatched` отсутствует в ROUTE_ROLES** — где: lib/permissions.ts (нет ключа `/finance/unmatched`, есть только клиентский isAdminLike-guard). почему: доступ полагается только на UI-проверку (сервер закрывает adminOnly, но карта ролей неполна). предлагаю: добавить `/finance/unmatched: [admin, manager]`.

10. **Пустые ingestion-таблицы** — где: `ingestion_imports`, `usage_reports`, `ingestion_unmatched` = 0 (справка БД). почему: весь блок Revenue Ingestion / Unmatched рабочий, но без данных (🟡). предлагаю: сид демо-CSV/импорта для наглядности.


# Аудит: АНАЛИТИКА + CRM + КОММУНИКАЦИИ

Область: `artifacts/crm-panel/src/pages/{analytics,crm,communications}/index.tsx` и под-компоненты.
Справка БД (n_live_tup, 2026-07-08): `usage_reports=0`, `playlist_stats=0`, `tiktok_stats=0`, `ugc_metrics=0`, `realtime_alerts=1`, `crm_tasks=5`, `contacts=4`, `releases=6`, `artists=4`, `tracks=5`, `users=4`, `transactions=7`, `payouts=4`, `email_templates=0`, `campaigns=0`, `automation_triggers=0`, `internal_notes=0`.

---

## РАЗДЕЛ 1 — АНАЛИТИКА (`analytics/index.tsx`)

Роль-зависимый рендер:
- **admin/manager** → 8 вкладок: `streams, revenue, geo, tracks, ugc, realtime(Алерты), playlists, tiktok` (строки 281–534).
- **label/artist** → ТОЛЬКО 2 вкладки: `playlists, tiktok` (строки 165–185, ветка `!isAdminOrManager`).

Общие данные страницы (KPI + streams/revenue/geo/tracks) грузятся `Promise.all` в `useEffect` (стр. 132–144) ТОЛЬКО для admin/manager. Период-селектор `7d/30d/90d/180d/1y` (Broma16-независимый; локальный enum, стр. 202–213). Кнопка «Экспорт» → `window.location.href=/api/analytics/export` (стр. 226–235). Кнопка «Синхронизировать статистику» (только admin/manager + perm `distribution`) → `POST /api/broma16/statistics/sync`, toast-only фон (стр. 107–125, 214–225).

Доступ по ROUTE_ROLES: `/analytics` = `["admin","manager","label","artist"]`; manager дополнительно гейтится ключом `analytics`.

### Аналитика → Streams (value="streams", index.tsx:294)
- Путь `/analytics` · Доступ admin/manager (вкладка видна только им).
- Элементы: 4 KPI-карты (стримы за период, выручка, активные площадки, страны — стр. 246–278, источник `streams/platforms/geo`); AreaChart «Динамика стримов» (по дню/месяцу, `chartData`); PieChart «По площадкам» + легенда с % (источник `platforms`); цвета площадок — хардкод `PLATFORM_COLORS` (стр. 47–54).
- Бэкенд: `GET /api/analytics/streams`, `/api/analytics/platforms` → `analytics.ts:35,64` → таблица `usage_reports`.
- Данные: ПУСТО (эндпоинты реальные, `usage_reports=0` → графики покажут «Нет данных»).
- Вердикт: Работает?да · Данные?пусто · 🟡реально-но-пусто

### Аналитика → Revenue (value="revenue", index.tsx:371)
- Путь `/analytics` · Доступ admin/manager.
- Элементы: BarChart выручки по дням/месяцам (`chartData.revenue`); таблица «Выручка по площадкам» (колонки: Площадка/Стримы/Доля%/Выручка — источник `platforms`).
- Бэкенд: `GET /api/analytics/platforms` + `/analytics/streams` → `analytics.ts` → `usage_reports`.
- Данные: ПУСТО (`usage_reports=0`).
- Вердикт: Работает?да · Данные?пусто · 🟡реально-но-пусто

### Аналитика → Geography (value="geo", index.tsx:436)
- Путь `/analytics` · Доступ admin/manager.
- Элементы: список стран с progress-bar (флаг из хардкода `COUNTRY_FLAGS` стр. 57–61, доля%, стримы — источник `geo`).
- Бэкенд: `GET /api/analytics/geography` → `analytics.ts:94` → `usage_reports.countryCode`.
- Данные: ПУСТО (`usage_reports=0`).
- Вердикт: Работает?да · Данные?пусто · 🟡реально-но-пусто

### Аналитика → Top Tracks (value="tracks", index.tsx:471)
- Путь `/analytics` · Доступ admin/manager.
- Элементы: таблица топ-треков (колонки: #/Трек+Артист/Топ-площадка(Badge)/Стримы/Выручка/Тренд% — источник `tracks`, limit=10). Тренд считается vs прошлый период.
- Бэкенд: `GET /api/analytics/top-tracks` → `analytics.ts:131` → JOIN `usage_reports`+`tracks`+`artists`.
- Данные: ПУСТО (`usage_reports=0` — треки/артисты есть, но нет отчётов).
- Вердикт: Работает?да · Данные?пусто · 🟡реально-но-пусто

### Аналитика → UGC (value="ugc", ugc-tab.tsx:17)
- Путь `/analytics` · Доступ admin/manager.
- Элементы: карточки-агрегаты по платформам (просмотры/лайки/шеры/видео/доход — источник `byPlatform`); кнопка «Обновить» (`load`); кнопка «Импорт из Spotify» → `POST /api/analytics/ugc/import-spotify` (требует настроенный Spotify, иначе 503); кнопка «Добавить» → диалог ручного ввода (select платформы: youtube_cms/tiktok/meta/instagram — хардкод; поля views/likes/shares/videos/revenueCents) → `POST /api/analytics/ugc`.
- Бэкенд: `GET/POST /api/analytics/ugc` → `analytics-extras.ts:23,63`; импорт → `analytics-ugc-import.ts:82` → таблица `ugc_metrics`.
- Данные: ПУСТО (`ugc_metrics=0`, покажет «Нет данных по UGC»).
- Вердикт: Работает?да (CRUD рабочий) · Данные?пусто · 🟡реально-но-пусто

### Аналитика → Алерты / Realtime (value="realtime", realtime-tab.tsx:30)
- Путь `/analytics` · Доступ admin/manager.
- Элементы: счётчик открытых (Badge); фильтр select open/all; кнопки «Обновить»/«Создать»; список алертов с иконкой resolved/open, Badge kind+severity, кнопка «Решить/Открыть» → `PATCH .../:id`; диалог создания (select kind: spike/drop/fraud/takedown/system_error/payment_failed — хардкод; select severity low/medium/high/critical; поле message) → `POST`.
- Бэкенд: `GET/POST /api/analytics/realtime-alerts`, `PATCH /:id` → `analytics-extras.ts:73,93,101` → таблица `realtime_alerts`.
- Данные: РЕАЛЬНЫЕ (`realtime_alerts=1` — покажет 1 запись).
- Вердикт: Работает?да · Данные?реальные(1 запись) · 🟢реально

### Аналитика → Плейлисты (value="playlists", PlaylistAnalyticsTab index.tsx:547)
- Путь `/analytics` · Доступ admin/manager (в этой ветке) + label/artist (в упрощённой ветке стр. 179). Бэкенд скоупит данные по label/artist.
- Элементы: 3 KPI (Плейлистов/Стримов/Подписчиков — reduce по rows); таблица (Плейлист/Платформа/Подписчики/Стримов/Обновлён/Тренд% — источник rows).
- Бэкенд: `GET /api/analytics/playlists` → `analytics-marketing.ts:45` → таблица `playlist_stats` (со scope-фильтром).
- Данные: ПУСТО (`playlist_stats=0` → «Нет данных о плейлистах»).
- Вердикт: Работает?да · Данные?пусто · 🟡реально-но-пусто

### Аналитика → TikTok (value="tiktok", TikTokAnalyticsTab index.tsx:653)
- Путь `/analytics` · Доступ admin/manager + label/artist. Скоупится на бэке.
- Элементы: 3 KPI (Использований/Просмотров/Треков — reduce); таблица (Трек+Артист/Использований/Просмотров/Лайков/Репостов — источник rows).
- Бэкенд: `GET /api/analytics/tiktok` → `analytics-marketing.ts:63` → таблица `tiktok_stats` (scope).
- Данные: ПУСТО (`tiktok_stats=0` → «Нет данных TikTok»).
- Вердикт: Работает?да · Данные?пусто · 🟡реально-но-пусто

---

## РАЗДЕЛ 2 — CRM (`crm/index.tsx`)

Доступ ROUTE_ROLES: `/crm` = `["admin","manager"]`, manager-ключ `crm`. В компоненте `isAdmin = role admin|manager` (стр. 535); иначе экран «Доступ ограничен» (стр. 625–637). 7 вкладок через URL `?tab=` (стр. 478–496). Хедер: кнопка «Добавить контакт» → `setContactDlg("new")`. 4 KPI (Всего контактов/Артисты/Открытые задачи/Просрочено — вычисляются локально из загруженных `contacts`+`tasks`, стр. 616–623). Данные грузятся `reload()` (стр. 537–553): `/api/crm/contacts?limit=100`, `/api/crm/tasks?limit=100`, `/api/users?limit=100`.

### CRM → Обзор (value="overview", CrmOverviewPanel crm/index.tsx:215)
- Путь `/crm` · Доступ admin/manager.
- Элементы: 8 KPI-плиток (Треки/Артисты/Релизы/Пользователи/Выручка(роялти)/Доставок отправлено/в очереди/Релизов всего — источник overview); 2 PieChart «Релизы по статусу» и «Контакты по типу» (labels RU из хардкод-словарей `STATUS_RU`/`ROLE_RU` стр. 123–127). Примечание: плитка «Релизов всего» дублирует `data.releases` (тот же value, что и «Релизов»), икона CheckSquare — визуальный баг-дубликат (стр. 235).
- Бэкенд: `GET /api/crm/analytics/overview` → `crm.ts:210` → таблицы releases/artists/tracks/users/transactions/deliveries/contacts.
- Данные: РЕАЛЬНЫЕ (все таблицы непустые).
- Вердикт: Работает?да · Данные?реальные · 🟢реально (мелкий баг дубль-плитки)

### CRM → Активность (value="activity", CrmActivityPanel crm/index.tsx:279)
- Путь `/crm` · Доступ admin/manager.
- Элементы: таблица (Пользователь/Роль(Badge)/Всего задач/Завершено/% выполнения — источник user-activity).
- Бэкенд: `GET /api/crm/analytics/user-activity` → `crm.ts:262` → JOIN users+crm_tasks.
- Данные: РЕАЛЬНЫЕ (`users=4`, `crm_tasks=5`).
- Вердикт: Работает?да · Данные?реальные · 🟢реально

### CRM → ARPU (value="arpu", CrmArpuPanel crm/index.tsx:324)
- Путь `/crm` · Доступ admin/manager.
- Элементы: 3 KPI (Общая выручка/Выплачено/ARPU); таблица (Артист/Роялти/Аванс/Выплачено/Нетто — сортировка по net).
- Бэкенд: `GET /api/crm/analytics/revenue-per-user` → `crm.ts:299` → artists+transactions+payouts.
- Данные: РЕАЛЬНЫЕ (`artists=4`, `transactions=7`, `payouts=4`).
- Вердикт: Работает?да · Данные?реальные · 🟢реально

### CRM → Рост (value="growth", CrmGrowthPanel crm/index.tsx:376)
- Путь `/crm` · Доступ admin/manager.
- Элементы: 3 KPI (новые артисты/релизы/пользователи за 12м); BarChart по месяцам (artists/releases/users).
- Бэкенд: `GET /api/crm/analytics/growth` → `crm.ts:341` → createdAt-агрегация artists/releases/users.
- Данные: РЕАЛЬНЫЕ (зависит от createdAt записей; данные есть, но могут не попасть в окно 12м → возможен пустой график).
- Вердикт: Работает?да · Данные?реальные(частично зависят от дат) · 🟢реально

### CRM → Воронки (value="funnel", CrmFunnelPanel crm/index.tsx:417)
- Путь `/crm` · Доступ admin/manager.
- Элементы: 3 FunnelBar (релизы draft→live; доставки queued→acked/failed; задачи todo→done/cancelled — источник funnel).
- Бэкенд: `GET /api/crm/analytics/funnel` → `crm.ts:402` → releases/deliveries/crm_tasks.
- Данные: РЕАЛЬНЫЕ (`releases=6`, `deliveries=7`, `crm_tasks=5`).
- Вердикт: Работает?да · Данные?реальные · 🟢реально

### CRM → Контакты (value="contacts", crm/index.tsx:756)
- Путь `/crm` · Доступ admin/manager.
- Элементы: поиск (name/email/company/phone — локальная фильтрация); Popover-фильтр (чекбоксы типов из `CONTACT_TYPE_KEYS` хардкод стр. 88; select страны — динамика из загруженных контактов; чекбокс «есть открытые задачи»); список контактов (аватар-инициалы, Badge типа, email/phone, ссылки mailto/Telegram через `safeTelegramHref`, кнопки Edit/Delete); диалог ContactDialog (create/update); AlertDialog подтверждения удаления.
- Бэкенд: `GET/POST/PUT/DELETE /api/crm/contacts` → `crm.ts:29,48,75,97` → таблица `contacts`.
- Данные: РЕАЛЬНЫЕ (`contacts=4`).
- Вердикт: Работает?да (полный CRUD) · Данные?реальные · 🟢реально

### CRM → Задачи (value="tasks", crm/index.tsx:905)
- Путь `/crm` · Доступ admin/manager.
- Элементы: кнопка «Добавить задачу»; список задач (чекбокс-toggle done → `PUT /:id` с оптимистичным апдейтом; заголовок, due date с подсветкой overdue, assignedToName, статус, Badge приоритета из `priorityClass`; кнопки Edit/Delete); TaskDialog (create/update, assignee select из `/api/users`); AlertDialog удаления.
- Бэкенд: `GET/POST/PUT/DELETE /api/crm/tasks` → `crm.ts:114,139,166,188` → таблица `crm_tasks`.
- Данные: РЕАЛЬНЫЕ (`crm_tasks=5`).
- Вердикт: Работает?да (полный CRUD + toggle) · Данные?реальные · 🟢реально

---

## РАЗДЕЛ 3 — КОММУНИКАЦИИ (`communications/index.tsx`)

Доступ ROUTE_ROLES: `/communications` = `["admin","manager"]`, manager-ключ `support_comms`. В компоненте `canView = admin|manager` (стр. 1140); иначе «Доступ ограничен» (стр. 1150–1160). 6 вкладок (локальный `useState activeTab`, НЕ через URL). Шаблоны предзагружаются для campaigns/automation (стр. 1142–1146).

### Коммуникации → Обзор (value="overview", TabOverview communications/index.tsx:125)
- Путь `/communications` · Доступ admin/manager.
- Элементы: 5 плиток-кнопок (Шаблонов/Рассылок/Email отправлено/Триггеров/Срабатываний — клик переключает вкладку); карта «Входящие обращения» → кнопка «Открыть Inbox» редирект `/support`; карта «Быстрые действия» (3 кнопки-переключатели вкладок).
- Бэкенд: `GET /api/communications/overview` → `communications.ts:472` → email_templates/campaigns/automation_triggers.
- Данные: ПУСТО (все 3 таблицы =0 → нули в плитках).
- Вердикт: Работает?да · Данные?пусто · 🟡реально-но-пусто

### Коммуникации → Inbox (value="inbox", index.tsx:1182)
- Путь `/communications` · Доступ admin/manager.
- Элементы: статичная карта с текстом + кнопка «Открыть Support Inbox» → редирект `window.location.href="/support"`. Собственного контента/данных нет.
- Бэкенд: НЕТ (вкладка — только редирект-заглушка на /support).
- Данные: — (нет запросов).
- Вердикт: Работает?только UI (редирект) · Данные?н/д · ⚪только-UI-заглушка

### Коммуникации → Шаблоны (value="templates", TabTemplates index.tsx:201)
- Путь `/communications` · Доступ admin/manager.
- Элементы: поиск; кнопка «Новый шаблон»; таблица (Название/Код/Тип(Email/Push)/Категория/Переменные(Badge)/Обновлён/Статус/Действия); кнопки Eye(preview → `POST /:id/preview`), Pencil(edit), Trash(delete); диалог create/edit (поля name/code/type-select/category-select из хардкод `TEMPLATE_CATEGORIES` стр. 114; subject; bodyHtml; bodyText; конструктор переменных; Switch isActive); диалог preview (dangerouslySetInnerHTML).
- Бэкенд: `GET/POST/PUT/DELETE/preview /api/communications/templates` → `communications.ts:70,83,91,101,109` → таблица `email_templates`.
- Данные: ПУСТО (`email_templates=0` → «Шаблонов ещё нет»). CRUD рабочий — можно создать.
- Вердикт: Работает?да (полный CRUD) · Данные?пусто · 🟡реально-но-пусто

### Коммуникации → Рассылки (value="campaigns", TabCampaigns index.tsx:490)
- Путь `/communications` · Доступ admin/manager.
- Элементы: две кнопки «Черновик рассылки»(диалог) и «Новая рассылка»(compose-режим); таблица (Название/Тип/Статус(из `CAMPAIGN_STATUS_MAP` хардкод)/Получатели/Запланирован/Отправлен/Действия: Send/Edit/Cancel). Compose-режим: тема, select аудитории (хардкод `AUDIENCE_OPTIONS` стр. 480), HTML-редактор + iframe-превью, кнопка «Вставить шаблон Newsletter» (гигантский хардкод `NEWSLETTER_TEMPLATE` стр. 396–478), «Создать и отправить» → `POST .../quick-send`. Диалог черновика: name/type/template-select/subject/audience/scheduledAt.
- Бэкенд: `GET/POST/PUT /campaigns`, `/:id/send`, `/:id/cancel`, `/quick-send` → `communications.ts:138–352` → таблица `campaigns`. Реальная отправка требует SMTP (Settings→Уведомления, предупреждение в UI стр. 667–670).
- Данные: ПУСТО (`campaigns=0` → «Рассылок ещё нет»).
- Вердикт: Работает?частично (CRUD рабочий; фактическая доставка email зависит от SMTP-настройки) · Данные?пусто · 🟡реально-но-пусто

### Коммуникации → Автоматизация (value="automation", TabAutomation index.tsx:798)
- Путь `/communications` · Доступ admin/manager.
- Элементы: кнопка «Добавить триггер»; таблица (Switch включён → `PATCH /:id/toggle`; Название; Событие(Badge+label из хардкод `EVENTS` стр. 92–104); Шаблон; Задержка; Получатель(из хардкод `RECIPIENTS` стр. 106–112); Последнее срабатывание; Всего; Edit/Delete); диалог create/edit (name/event-select/template-select/delayMinutes/recipient-select/Switch enabled).
- Бэкенд: `GET/POST/PUT/DELETE /triggers`, `/:id/toggle` → `communications.ts:353–384` → таблица `automation_triggers`. Требует SMTP (предупреждение UI стр. 854–857).
- Данные: ПУСТО (`automation_triggers=0` → «Триггеров ещё нет»).
- Вердикт: Работает?частично (CRUD рабочий; исполнение зависит от SMTP + серверного event-диспетчера) · Данные?пусто · 🟡реально-но-пусто

### Коммуникации → Заметки (value="notes", TabNotes index.tsx:1089)
- Путь `/communications` · Доступ admin/manager.
- Элементы: select типа сущности (release/artist/label/user/ticket — хардкод) + input ID (по умолчанию release #1); встроенный `InternalNotesPanel` (стр. 961): список заметок (аватар-инициалы, автор, дата, Badge закреплена/теги, кнопки Pin/Edit/Delete — edit/delete только для автора или admin); форма добавления (Textarea + теги + Ctrl+Enter).
- Бэкенд: `GET/POST/PUT/DELETE /notes`, `/:id/pin` → `communications.ts:404–461` → таблица `internal_notes`.
- Данные: ПУСТО (`internal_notes=0` → «Заметок нет»). CRUD рабочий.
- Вердикт: Работает?да (полный CRUD) · Данные?пусто · 🟡реально-но-пусто

---

## ПРОБЛЕМЫ (analytics-crm-communications)

1. **Массовая пустота аналитики стримов** — что: вкладки Streams/Revenue/Geo/Tracks на `/analytics` · где: `analytics/index.tsx:294–520`, бэкенд `analytics.ts` → `usage_reports` · почему проблема: таблица `usage_reports=0`, поэтому 4 из 8 вкладок (и 4 KPI вверху) всегда пусты для admin/manager — раздел выглядит нерабочим · предлагаю: засеять `usage_reports` демо-данными (seed-скрипт) или настроить синхронизацию Broma16.

2. **Playlists/TikTok пусты для всех ролей** — что: единственные 2 вкладки, доступные label/artist · где: `analytics-marketing.ts:45,63` → `playlist_stats=0`, `tiktok_stats=0` · почему проблема: label/artist видят ТОЛЬКО эти 2 вкладки, и обе пусты → для них весь раздел «Аналитика» = пустой экран · предлагаю: засеять `playlist_stats`/`tiktok_stats` или подключить сбор статистики.

3. **UGC пуст** — что: вкладка UGC · где: `ugc-tab.tsx`, `analytics-extras.ts:23` → `ugc_metrics=0` · почему проблема: карточки всегда «Нет данных»; импорт из Spotify требует настроенной интеграции (иначе 503) · предлагаю: seed `ugc_metrics` или настроить Spotify.

4. **Вкладка Inbox — редирект-заглушка** — что: `value="inbox"` в Коммуникациях · где: `communications/index.tsx:1182–1193` · почему проблема: вкладка не имеет собственного контента, только кнопка редиректа на `/support` — дублирует навигацию, вводит в заблуждение (ожидается встроенный inbox) · предлагаю: либо встроить реальный список тикетов, либо убрать вкладку и оставить пункт в меню.

5. **Коммуникации: templates/campaigns/automation/notes все пусты** — что: 4 из 6 вкладок · где: `communications.ts` → `email_templates=0, campaigns=0, automation_triggers=0, internal_notes=0` · почему проблема: раздел функционально готов (полный CRUD), но без сидов и без SMTP выглядит незаполненным; реальная отправка email/триггеров зависит от неподтверждённой SMTP-конфигурации · предлагаю: seed демо-шаблонов + документировать/проверить SMTP.

6. **Дубль-плитка в CRM Обзоре** — что: KPI «Релизов всего» повторяет «Релизов» · где: `crm/index.tsx:230 и 235` (обе = `data.releases`) · почему проблема: визуальная избыточность/ошибка — 8-я плитка не несёт новой информации · предлагаю: заменить на осмысленный показатель (напр. кол-во задач/контактов) или удалить.

7. **Огромный хардкод HTML-шаблона в компоненте** — что: `NEWSLETTER_TEMPLATE` (~80 строк inline HTML) · где: `communications/index.tsx:396–478` · почему проблема: раздувает бандл фронта, дублирует то, что должно жить в `email_templates`; правки требуют пересборки фронта · предлагаю: вынести в БД-шаблон или отдельный ассет.

8. **CRM Рост зависит от createdAt в 12-месячном окне** — что: график может оказаться пустым несмотря на наличие данных · где: `crm.ts:341` (`/analytics/growth`) · почему проблема: если демо-записи датированы вне последних 12 месяцев, BarChart будет пуст при непустых таблицах — вводит в заблуждение · предлагаю: проверить даты сид-данных или расширить окно.


# Аудит: ПРАВА + ИЗДАТЕЛЬСТВО

Область: `/rights` (7 вкладок) и `/publishing` (7 вкладок).
Файлы фронта: `crm-panel/src/pages/rights/index.tsx` (+ dsp-deals-tab, content-id-tab, territories-tab, freeze-tab, history-tab), `crm-panel/src/pages/publishing/index.tsx` (+ conflicts-tab, registration-tab).
Бэкенд: `api-server/src/routes/rights.ts`, `rights-extras.ts`, `publishing.ts`, `publishing-extras.ts`.

Справка БД: `rights_holders`=0, `rights_conflicts`=0, `dsp_deals`=0, `content_id_assets`=0, `publishing_conflicts`=0, `publishing_works`=3, `audit_log`=13.

---

# РАЗДЕЛ: ПРАВА (`/rights`)

Доступ по ROUTE_ROLES: `["admin","manager","label","artist"]` — видят страницу все 4 роли.
ВНИМАНИЕ: страница видна всем ролям, но внутри `isAdmin = role==="admin"||"manager"`. Кнопки создания/редактирования доступны только admin/manager; label/artist видят только чтение. Более того, ряд вкладок бэкенд закрывает `requireRole("admin","manager")` / `adminOnly` — для label/artist они вернут 403 (см. ниже).

### Права → Владельцы прав (value="holders", index.tsx:728)
- Путь(URL): `/rights` · Доступ: admin, manager, label, artist (чтение); мутации — только admin/manager.
- Элементы:
  - Статистика (4 карточки): «Записей о правах» (holdersTotal), «Конфликтов» (conflictsTotal), «Открытых споров» (openConflicts, вычисляется по массиву), «Критических» (criticalConflicts). Источник — реальные счётчики из API.
  - Поиск (Input, `holderSearch`) — фильтрация клиентская по holderName/assetTitle.
  - Select «Тип владельца» (`holderTypeFilter`) — источник опций: локальный dict `HOLDER_TYPE_LABELS` (хардкод-словарь лейблов; сами значения передаются серверу как `holder_type`).
  - Select «Вид прав» (`rightsTypeFilter`) — dict `RIGHTS_TYPE_LABELS`.
  - Кнопка ↻ Обновить → `loadHolders()` → GET `/api/rights/holders`.
  - Кнопка «Владелец» (в шапке, только admin) → открывает `HolderDialog`.
  - Кнопка «Конфликт» (в шапке, только admin) → `ConflictDialog`.
  - Таблица: колонки Актив, Владелец, Права, Доля, Территория, Срок, [действия для admin: Pencil→редакт, Trash2→delete]. Источник — GET `/api/rights/holders`.
  - Пагинация (page/limit=25).
  - Диалог `HolderDialog`: поля — Тип актива(select track/release, обяз.), ID трека/релиза(number, обяз.), Тип владельца(select, dict), Имя владельца(text, обяз.), ID артиста/лейбла(number, опц., по типу), Вид прав(select, dict), Доля %(number), Территория(text, дефолт WW), Действует с/до(date), чекбокс «Эксклюзивные права», Примечания(textarea). POST `/api/rights/holders` или PUT `/api/rights/holders/:id`.
- Бэкенд: GET/POST `/rights/holders`, PUT/DELETE `/rights/holders/:id` (rights.ts:176-291). POST/PUT/DELETE защищены `requireRole("admin","manager")`. Таблица БД: `rights_holders`.
- Данные: ПУСТО (эндпоинт реальный, `rights_holders`=0).
- Вердикт: Работает? да · Данные? пусто · 🟡 реально-но-пусто.

### Права → Конфликты (value="conflicts", index.tsx:829)
- Путь(URL): `/rights` · Доступ: все 4 роли (чтение); статус/удаление — только admin/manager (UI); POST конфликта на бэке — БЕЗ requireRole (доступен всем аутентиф.).
- Элементы:
  - Select «Статус» (`statusFilter`, dict `STATUS_LABELS`), «Приоритет» (`priorityFilter`, dict `PRIORITY_LABELS`), «Тип конфликта» (`conflictTypeFilter`, dict `CONFLICT_TYPE_LABELS`). Все словари — локальный хардкод.
  - Кнопка ↻ Обновить → `loadConflicts()` → GET `/api/rights/conflicts`.
  - Список `ConflictRow` (раскрывающиеся): заголовок (assetTitle, тип, claimantName, priorityBadge, statusBadge); раскрытие показывает описание, доп.инфо, даты открытия/закрытия, резолюцию.
  - Внутри строки (admin, не закрыт): Select «Изменить статус», Input «Примечание о решении», Button «Обновить» → PATCH `/api/rights/conflicts/:id`.
  - Кнопка «Удалить» (admin) → DELETE `/api/rights/conflicts/:id`.
  - Диалог `ConflictDialog`: Тип актива, ID трека/релиза, Тип конфликта(dict), Приоритет(dict), Заявитель(text, обяз.), Доп.информация(text), Описание(textarea, обяз.). POST `/api/rights/conflicts`.
  - Пагинация.
- Бэкенд: GET/POST `/rights/conflicts`, GET/PATCH `/rights/conflicts/:id` (без requireRole), DELETE только admin/manager (rights.ts:293-410). Таблица: `rights_conflicts`.
- Данные: ПУСТО (`rights_conflicts`=0).
- Вердикт: Работает? да · Данные? пусто · 🟡 реально-но-пусто.
- ⚠️ Расхождение доступа: POST/PATCH конфликта на сервере не имеют requireRole, тогда как UI прячет кнопки за isAdmin — label/artist через API теоретически могут создать/изменить конфликт.

### Права → Договоры с DSP (value="dsp-deals", index.tsx:886 → dsp-deals-tab.tsx)
- Путь(URL): `/rights` · Доступ (UI): все роли видят вкладку. Бэкенд: `requireRole("admin","manager")` на ВСЕХ эндпоинтах → для label/artist вкладка вернёт 403 и покажет toast ошибки + пустую таблицу.
- Элементы:
  - Счётчик «Всего договоров».
  - Кнопка ↻ Обновить → GET `/api/rights/dsp-deals`.
  - Кнопка «Новый договор» → `DealDialog`.
  - Таблица: DSP, Тип(dict TYPE_LABELS), Статус(dict STATUS_LABELS), Период, Доля, Территория, [Pencil/Trash2]. Источник — `{deals}` из API.
  - `DealDialog`: DSP(text), Тип(select dict), Статус(select dict), Начало/Окончание(date), Доля(text), Территория(text), Номер контракта(text), Примечания(textarea). POST/PATCH `/api/rights/dsp-deals[/:id]`.
- Бэкенд: GET/POST `/rights/dsp-deals`, PATCH/DELETE `/rights/dsp-deals/:id` (rights.ts:411-503), все admin/manager. Таблица: `dsp_deals`.
- Данные: ПУСТО (`dsp_deals`=0).
- Вердикт: Работает? да (для admin/manager) · Данные? пусто · 🟡 реально-но-пусто.
- ⚠️ Для label/artist вкладка видна, но нефункциональна (403).

### Права → Content ID (value="content-id", index.tsx:887 → content-id-tab.tsx)
- Путь(URL): `/rights` · Доступ: UI — все; бэкенд `requireRole("admin","manager")` → label/artist получат 403.
- Элементы:
  - Счётчик «Активов».
  - ↻ Обновить → GET `/api/rights/content-id`.
  - Кнопка «Регистрация Content ID» → `ItemDialog`.
  - Таблица: Тип, ID актива, YT Asset ID, Политика(dict POLICY_LABELS), Статус(dict STATUS_LABELS), Owner, [Pencil/Trash2]. Источник — `{items}`.
  - `ItemDialog`: Тип(select), ID актива(number, обяз.), YouTube Asset ID(text), Статус(select dict), Политика(select dict), Владение(text WW), Примечания(textarea). POST/PATCH `/api/rights/content-id[/:id]`.
- Бэкенд: GET/POST `/rights/content-id`, PATCH/DELETE `/rights/content-id/:id` (rights.ts:464-503), admin/manager. Таблица: `content_id_assets`.
- Данные: ПУСТО (`content_id_assets`=0). Реального интеграционного пуша в YouTube нет — это ручной учётный CRUD.
- Вердикт: Работает? да (CRUD, admin/manager) · Данные? пусто · 🟡 реально-но-пусто.

### Права → Территории (value="territories", index.tsx:888 → territories-tab.tsx)
- Путь(URL): `/rights` · Доступ: UI — все; бэкенд `requireRole("admin","manager")` → label/artist 403.
- Элементы:
  - Заголовок с числом (rows.length).
  - ↻ Обновить → GET `/api/rights/territories` (сырой fetch, не через api-хелпер).
  - Виджет-грид карточек по территориям: Globe + код, «Владельцев», «Эксклюзив», бэйджи видов прав (dict RIGHTS_TYPE_LABELS). Источник — агрегат SQL.
- Бэкенд: GET `/rights/territories` (rights.ts:506) — реальный `db.execute` агрегирующий SQL `GROUP BY territory` из `rights_holders`. admin/manager. Таблица: `rights_holders`.
- Данные: ПУСТО (агрегат по пустой `rights_holders` → 0 строк).
- Вердикт: Работает? да · Данные? пусто · 🟡 реально-но-пусто.

### Права → Заморозка (value="freeze", index.tsx:889 → freeze-tab.tsx)
- Путь(URL): `/rights` · Доступ: UI — все; бэкенд `adminOnly` на freeze/unfreeze, а список тянется через GET `/rights/holders?limit=100` (holders GET без requireRole, но данных 0).
- Элементы:
  - Заголовок + описание (killswitch).
  - ↻ Обновить → adminApi GET `/api/rights/holders?limit=100`.
  - Список правообладателей: иконка Snowflake/Sun, имя, бэйджи (holderType, rightsType, share%/territory), FROZEN-бэйдж, причина+дата.
  - Кнопка «Заморозить» → диалог с Input «Причина» (обяз.) → POST `/api/rights/holders/:id/freeze`.
  - Кнопка «Разморозить» → confirm → POST `/api/rights/holders/:id/unfreeze`.
- Бэкенд: POST `/rights/holders/:id/freeze` и `/unfreeze` (rights-extras.ts:22,36), `adminOnly`. Читает `rights_holders` (поля frozen/frozenReason/frozenAt). Таблица: `rights_holders`.
- Данные: ПУСТО (`rights_holders`=0 → список пуст).
- Вердикт: Работает? да · Данные? пусто · 🟡 реально-но-пусто.

### Права → История (value="history", index.tsx:890 → history-tab.tsx)
- Путь(URL): `/rights` · Доступ: UI — все; бэкенд `adminOnly` → label/artist 403.
- Элементы:
  - Select «Все типы» — источник: локальный хардкод-массив `TYPES` (right_holder, dsp_deal, content_id_asset, ownership_claim, rights_conflict).
  - ↻ Обновить → adminApi GET `/api/rights/history?limit=200`.
  - Список записей аудита: action-бэйдж, entityType#id, userEmail(role), дата.
- Бэкенд: GET `/rights/history` (rights-extras.ts:47), `adminOnly` — реальный select из `audit_log` с фильтром по entityType из фикс. списка. Таблица: `audit_log`.
- Данные: РЕАЛЬНЫЕ, но по факту почти ПУСТО для этой области — `audit_log`=13 всего, но фильтр только на rights-типы (right_holder/dsp_deal/…); поскольку rights-таблицы пусты и мутаций не было, релевантных записей, скорее всего, нет.
- Вердикт: Работает? да · Данные? реальные-но-фактически-пусто · 🟡 реально-но-пусто.

---

# РАЗДЕЛ: ИЗДАТЕЛЬСТВО (`/publishing`)

Доступ по ROUTE_ROLES: `["admin","manager","label"]`. В компоненте `isAdmin = role==="admin"||"manager"||"label"`. Для прочих ролей рендерится заглушка «admin/manager only».
Скоуп по лейблу ПОДТВЕРЖДЁН в бэке (publishing.ts:79-98): при `!fullAccess` и `role==="label"` works фильтруются `OR(release.labelId == lid, track.artistId IN rosterArtistIds)`. Любая иная непривилегированная роль → пустой ответ. Admin/manager видят все. ✔ Соответствует ТЗ.

### Издательство → Произведения (value="works", index.tsx:236)
- Путь(URL): `/publishing` · Доступ: admin, manager, label.
- Элементы:
  - Кнопка «Новое произведение» (в шапке) → `WorkDialog` (state="new").
  - 5 KPI-плиток: Всего, Registered(registered+active), Pending, Draft, Rejected — вычисляются из массива `works`.
  - Поиск (Input) — клиентская фильтрация по title/iswc/isrc/publisher/writers.
  - Select статуса (`statusFilter`) — опции из `STATUS_LABEL` (частично i18n: draft/pending/active/reject; «registered» хардкод "Registered").
  - Таблица: Title(+publisher, others), Composer(s), Lyricist(s), ISWC/ISRC, PRO(бэйджи ASCAP/BMI/Songtrust/MLC + registeredWith), Share (сумма долей, подсветка ≠100%), Status, [Pencil→редакт]. Источник — GET `/api/publishing/works?limit=200`.
  - Пагинация (клиентская, perPage=10).
  - `WorkDialog`: поля title(обяз.), ISWC, ISRC, статус(select), publisher, territory(csv), переключатели PRO (Songtrust/ASCAP/BMI — Switch/label), редактор авторов (writers: name, role[select из ROLE_OPTIONS i18n], share%, CAE/IPI, add/remove; валидация суммы=100%, дубликатов). POST `/api/publishing/works` / PUT `/api/publishing/works/:id`.
- Бэкенд: GET/POST `/publishing/works`, GET/PUT `/publishing/works/:id` (publishing.ts:69-267). Скоуп по лейблу реализован. Таблица: `publishing_works` (+join tracks/releases/artists для имени/скоупа).
- Данные: РЕАЛЬНЫЕ (`publishing_works`=3).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

### Издательство → Авторы (value="writers", index.tsx:416 → WritersTab)
- Путь(URL): `/publishing` · Доступ: admin/manager/label.
- Элементы: таблица «Автор / Роль / CAE-IPI / Произведений / Сумма долей». Источник — клиентская агрегация из `works[].writers` (useMemo, БЕЗ отдельного API). Пустой стейт при отсутствии авторов.
- Бэкенд: нет отдельного эндпоинта — данные из `/publishing/works`. Таблица: `publishing_works`.
- Данные: РЕАЛЬНЫЕ (агрегат из 3 works).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

### Издательство → Сплиты (value="splits", index.tsx:417 → SplitsTab)
- Путь(URL): `/publishing` · Доступ: admin/manager/label.
- Элементы: предупреждение о works с суммой долей ≠100%; таблица «Произведение / Авторы и доли / Сумма» (подсветка). Источник — `works` (клиентский расчёт `sumShares`).
- Бэкенд: нет отдельного — из `/publishing/works`. Таблица: `publishing_works`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

### Издательство → Конфликты (value="conflicts", index.tsx:418 → conflicts-tab.tsx)
- Путь(URL): `/publishing` · Доступ: admin/manager/label (по UI); бэк без requireRole.
- Элементы:
  - ↻ Обновить → adminApi GET `/api/publishing/conflicts`.
  - Кнопка «Запустить сканирование» → POST `/api/publishing/conflicts/detect` → toast «добавлено N». Реальный детектор (duplicate_iswc, split_overlap, unclaimed_share) на SQL/jsonb.
  - Список: Work#, описание, тип, severity, resolved-бэйдж, дата. Кнопка «Решить»/«Открыть» → PATCH `/api/publishing/conflicts/:id`.
- Бэкенд: GET/POST detect/PATCH (publishing-extras.ts:21-92). Таблица: `publishing_conflicts` (запись), читает `publishing_works` при detect.
- Данные: ПУСТО (`publishing_conflicts`=0), но реальный детектор наполнит таблицу при запуске сканирования (works есть — при некорректных долях/дубликатах ISWC создаст записи).
- Вердикт: Работает? да · Данные? пусто (детектор живой) · 🟡 реально-но-пусто.

### Издательство → Партнёры (value="partners", index.tsx:419 → PartnersTab)
- Путь(URL): `/publishing` · Доступ: admin/manager/label.
- Элементы: две карты-таблицы «Издатели (Publishers)» и «PRO/CMO». Источник — клиентская агрегация из `works` (publisher, registeredWith, ascap/bmi/songtrust). БЕЗ отдельного API.
- Бэкенд: из `/publishing/works`. Таблица: `publishing_works`.
- Данные: РЕАЛЬНЫЕ (агрегат).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

### Издательство → Регистрация в PRO (value="registration", index.tsx:420 → registration-tab.tsx)
- Путь(URL): `/publishing` · Доступ: admin/manager/label (UI). push-broma16 на бэке — только fullAccess (admin/manager), label получит 403.
- Элементы:
  - ↻ Обновить → adminApi GET `/api/publishing/works?limit=50`.
  - Форма: Input «ID работы»(number), Select «PRO» (опции — хардкод-массив `PROS`: ascap/bmi/songtrust/mlc), кнопка «Зарегистрировать» → POST `/api/publishing/works/:id/register/:pro`.
  - Список работ: #id, title, ISWC, статус, бэйджи PRO/MLC/Broma16-статус. Кнопка «В Broma16»/«Отправлено» → POST `/api/publishing/works/:id/push-broma16` (disabled если submitted).
- Бэкенд: POST `/publishing/works/:id/register/:pro` (publishing-extras.ts:111) — реальный внешний fetch на endpoint PRO из `platform_settings` (key=publishing/pros); при отсутствии credentials → 503 `credentials_not_configured`; при ошибке апстрима → 502. POST `/publishing/works/:id/push-broma16` (publishing.ts:269) — реальный вызов `pushCompositionToBroma16`, требует fullAccess. Таблицы: `publishing_works`, `platform_settings` (пуста → регистрация в PRO всегда 503).
- Данные: работы РЕАЛЬНЫЕ; регистрация в PRO НЕ РАБОТАЕТ по факту (нет credentials, `platform_settings`=0 → 503). Broma16-пуш зависит от настроенной интеграции.
- Вердикт: Работает? частично (список реальный; PRO-регистрация вернёт 503 без настроек; Broma16 требует интеграции и admin/manager) · Данные? реальные (works) · 🟡 реально-но-заблокировано-настройками.
- ⚠️ label видит кнопку «В Broma16», но бэк вернёт 403 (только fullAccess).

### Издательство → Отчёты (value="reports", index.tsx:421 → ReportsTab)
- Путь(URL): `/publishing` · Доступ: admin/manager/label.
- Элементы: карты «Готовность каталога» (всего, splitsOk, withIswc, withMlc), «По статусам», «По территориям» (бэйджи). Все — клиентская агрегация из `works`. Явная пометка, что финансовая часть — в /finance + /royalties.
- Бэкенд: из `/publishing/works`. Таблица: `publishing_works`.
- Данные: РЕАЛЬНЫЕ (агрегат из 3 works).
- Вердикт: Работает? да · Данные? реальные · 🟢 реально.

---

## ПРОБЛЕМЫ (rights + publishing)

1. **Рассинхрон доступа Rights: страница видна artist/label, но большинство вкладок закрыты на бэке.**
   Где: `permissions.ts` ROUTE_ROLES `/rights`=["admin","manager","label","artist"] против `rights.ts` — dsp-deals/content-id/territories `requireRole("admin","manager")`, `rights-extras.ts` freeze/history `adminOnly`.
   Почему: label/artist открывают вкладки «Договоры с DSP», «Content ID», «Территории», «Заморозка», «История» и видят только toast-ошибку/пустоту (403).
   Предлагаю: либо скрывать эти вкладки на фронте для не-admin/manager (условный рендер TabsTrigger по роли), либо реально давать label доступ на чтение с фильтром по лейблу.

2. **POST/PATCH конфликтов Rights без requireRole.**
   Где: `rights.ts:328` POST `/rights/conflicts`, `:362` PATCH `/rights/conflicts/:id` — нет ограничения роли, тогда как UI прячет кнопки за `isAdmin`.
   Почему: label/artist могут создавать/менять конфликты через прямой API-вызов, минуя UI-ограничение. Несогласованность модели прав.
   Предлагаю: добавить requireRole или scope-проверку на серверные мутации конфликтов.

3. **Регистрация в PRO фактически не работает — нет credentials.**
   Где: `publishing-extras.ts:111`, `platform_settings`=0.
   Почему: кнопка «Зарегистрировать» всегда возвращает 503 `credentials_not_configured`; для пользователя выглядит как неработающая функция. Сам код реальный (внешний fetch), но не сконфигурирован.
   Предлагаю: пометить в UI недоступность (баннер «настройте PRO в Настройках»); сейчас подсказка есть в подзаголовке, но кнопка активна — стоит дизейблить до настройки.

4. **label видит кнопку «В Broma16», но бэк требует fullAccess (403).**
   Где: `registration-tab.tsx` (кнопка для всех) против `publishing.ts:276-280` (только admin/manager).
   Почему: label получит ошибку 403 при клике.
   Предлагаю: скрывать/дизейблить кнопку Broma16 для роли label.

5. **Все ключевые Rights-таблицы пусты (rights_holders/rights_conflicts/dsp_deals/content_id_assets = 0).**
   Где: справка БД.
   Почему: весь раздел «Права» демонстрирует пустые состояния; функциональность нельзя оценить визуально без seed-данных.
   Предлагаю: сидировать демо-записи по правам/конфликтам/DSP-сделкам для проверки UI и отчёта по территориям.

6. **Content ID — чисто учётный CRUD, без реальной интеграции с YouTube.**
   Где: `content-id-tab.tsx` + `rights.ts:464-503`.
   Почему: «YT Asset ID» вводится вручную, никакого пуша/синка с YouTube CMS нет — может создавать ложное впечатление интеграции.
   Предлагаю: явно обозначить в UI, что это ручной реестр, а не автоматическая регистрация.

7. **Rights-хелпер `apiFetch` дублируется в каждом под-компоненте (dsp-deals, content-id) + смешение стилей вызова.**
   Где: `dsp-deals-tab.tsx:34`, `content-id-tab.tsx:34`, `territories-tab.tsx` (сырой fetch), freeze/history через `adminApi`.
   Почему: три разных способа обращения к API в одном разделе — риск расхождений в обработке ошибок/заголовков.
   Предлагаю: унифицировать через общий `adminApi`/`apiFetch`.

8. **История прав фильтруется по фикс-списку entityType; при пустых таблицах и отсутствии мутаций раздел практически всегда пуст.**
   Где: `history-tab.tsx` + `rights-extras.ts:47`.
   Почему: `audit_log`=13, но релевантных rights-событий нет → «Записей нет».
   Предлагаю: ок как есть (реальный аудит), но добавить seed-мутации для демонстрации.


# Аудит: ПОЛЬЗОВАТЕЛИ/АДМИН + НАСТРОЙКИ

Область: `/users` (5 вкладок), `/admin/signups`, `/admin/kyc`, `/admin/audit`, `/settings` (личные + системные вкладки).

**Доступ (ROUTE_ROLES, permissions.ts):**
- `/users`, `/admin/signups`, `/admin/kyc`, `/admin/audit` → `["admin","manager"]`. Менеджер дополнительно гейтится ключом `users_kyc` (для /users, /admin/signups, /admin/kyc) и `automation_audit` (для /admin/audit) через manager_permissions.
- `/settings` → все роли `["admin","manager","label","artist"]`.

**Ролевой гейтинг Settings (index.tsx:1452-1509):** `canView = role==="admin"||role==="manager"`. Если !canView и роль label/artist → рендерится `<PersonalSettings/>` (личные вкладки). Иначе (не должно случаться, т.к. роут пускает всех) — экран «Доступ ограничен». Т.е. **admin/manager видят системный TabsList (15 вкладок), label/artist — личный TabsList (3-4 вкладки).**

---

## USERS → Все пользователи (value="users", index.tsx:226)
- URL `/users` · Доступ admin, manager(+users_kyc)
- Элементы:
  - KPI ×3 (index.tsx:198): «Всего» = usersResp.pagination.total (реально); «Заявки» = signupsCount (из SignupsTab callback); «KYC» = kycPendingCount (из KycTab callback).
  - Кнопка «Создать» (только admin, :235) → открывает CreateUserDialog.
  - select роль (all/admin/manager/label/artist — хардкод опции), select статус (all/active/inactive/suspended — хардкод), поиск (Input) — все фильтры → параметры useListUsers.
  - Таблица: Имя, Роль, Статус, KYC, Создан, Последний вход, меню. Источник: `useListUsers` (GET /api/users, таблица users).
  - Dropdown-меню на строку: «Редактировать» (EditUserDialog), «Войти как» (impersonate — только admin, не для admin/себя/suspended), «Заблокировать»/«Реактивировать» (useUpdateUser → PATCH /api/users/:id).
  - Диалог блокировки (:449): textarea причина (обязательна для confirm), confirm → setStatus suspended.
- Бэкенд: `/api/users` (users.ts) → таблица `users` (n=4).
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢

## USERS → Заявки (value="signups", index.tsx:393 → _signups-tab.tsx)
- Компонент SignupsTab. Загрузка `api("/api/signup-requests?status=pending")`.
- Элементы: карточки заявок (name, email, phone, country, legalName, inn, message, createdAt); кнопки Approve (open диалог, выбор роли artist/label → POST /api/signup-requests/:id/approve, показ temp-пароля в модалке с copy), Reject (диалог с textarea причины → POST .../reject).
- Бэкенд: signup.ts (GET/POST approve/reject) → таблица `signup_requests`.
- Данные: **signup_requests ПУСТА (0)** — эндпоинт реальный, но записей нет. onCountChange(0).
- Вердикт: Работает да · Данные пусто · 🟡

## USERS → Роли (value="roles", index.tsx:398)
- Статичный дашборд прав. Массив `ROLES_PERMISSIONS` (index.tsx:118-185) — **ХАРДКОД** (описания прав по 4 ролям, на 2 языках). Счётчик пользователей на роль = `apiUsers.filter(...)` (реально из useListUsers).
- Нет кнопок/API. Это справочно-описательный экран, права здесь НЕ настраиваются (настройка — в Settings→Права менеджеров).
- Вердикт: Работает только UI (описание) · Данные хардкод (тексты прав) + реальные (счётчики) · 🔴 (перечень прав — хардкод-массив, не отражает реальную RBAC-модель)

## USERS → KYC (value="kyc", index.tsx:435 → _kyc-tab.tsx)
- Компонент KycTab. GET `/api/admin/kyc/users?status=` (фильтр pending/approved/rejected/all).
- Элементы: select фильтра; таблица (User, Role, Status, Documents-бэйджи, Updated, кнопка «Документы»); модалка документов → GET `/api/admin/kyc/users/:id/documents`; на документ: approve (POST /api/admin/kyc-documents/:id/approve), reject (диалог причины → .../reject), ссылка ExternalLink на objectPath; глобально: «Одобрить KYC целиком» (POST /api/admin/users/:id/kyc/approve), «Отклонить KYC» (window.prompt причины → .../kyc/reject).
- Бэкенд: kyc.ts (все эндпоинты реальны) → таблицы `kyc_documents` (ПУСТА 0), users.kycStatus.
- Данные: users есть, но **kyc_documents ПУСТА** → очередь pending будет пустой. onCountChange(0).
- Вердикт: Работает да · Данные пусто · 🟡

## USERS → Активность (value="activity", index.tsx:440 → _activity-tab.tsx)
- Компонент ActivityTab. GET `/api/audit/facets` (для select сущностей) и `/api/audit?...` (пагинация 25, фильтры user_id/entity_type).
- Элементы: select пользователь (из useListUsers), select сущность (из facets), таблица (Когда/Актор/Действие/Сущность/IP), пагинация prev/next.
- Бэкенд: audit.ts → таблица `audit_log` (n=13).
- Данные: РЕАЛЬНЫЕ (есть 13 записей).
- Вердикт: Работает да · Данные реальные · 🟢

---

## /admin/signups (admin/signups.tsx)
- URL `/admin/signups` · Доступ admin, manager(+users_kyc). Отдельная полная страница (дублирует функционал USERS→Заявки, но с табами pending/approved/rejected и поиском).
- Элементы: Tabs статусов, поиск (Enter→load), кнопка Обновить, таблица (Applicant/Type/Contacts/Date/Status/Actions), Approve-диалог (warning → POST approve), temp-password reveal-модалка с copy email/password, Reject-диалог (textarea, min 3 симв → POST reject).
- Бэкенд: signup.ts → `signup_requests` (ПУСТА 0).
- Вердикт: Работает да · Данные пусто · 🟡

## /admin/kyc (admin/kyc.tsx)
- URL `/admin/kyc` · Доступ admin, manager(+users_kyc). Полная страница master-detail (список пользователей слева + панель документов справа), богаче чем KycTab (KIND_LABEL, размер файла, mimeType, viewUrl через /api/storage/objects/uploads/:id).
- Элементы: Tabs pending/approved/rejected; список-кнопки пользователей; панель: approveUser (POST /api/admin/users/:id/kyc/approve), reject user/doc (диалог, min 3 симв), approveDoc (POST .../approve), ссылка «Смотреть» на объект storage.
- Бэкенд: kyc.ts → `kyc_documents` (ПУСТА 0), users.
- Вердикт: Работает да · Данные пусто · 🟡

## /admin/audit (admin/audit.tsx)
- URL `/admin/audit` · Доступ admin, manager(+automation_audit). Полноценный аудит с расширенными фильтрами.
- Элементы: пресет «Только финансы» (FINANCE_ENTITY_TYPES хардкод CSV → серверный ?entity_types=), Сброс; фильтры select сущность/действие/пользователь (facets), input entity_id, datetime-local from/to; таблица (When/Who/Action/Entity/IP/детали); пагинация 50; детальный диалог (meta, diff-таблица before/after, raw JSON snapshot).
- Бэкенд: audit.ts (GET /api/audit, /api/audit/facets) → `audit_log` (n=13).
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает да · Данные реальные · 🟢

---

# SETTINGS — ЛИЧНЫЕ вкладки (роль label/artist → PersonalSettings, index.tsx:1367)

TabsList: profile, password, notifications, **members (только role==="label", :1391)**. Артист видит 3 вкладки, лейбл — 4.

## SETTINGS → Профиль (value="profile", index.tsx:1398)
- Читает useAuth().user: Email, Роль (ROLE_LABELS), KYC-статус (бэйдж). Кнопка «Перейти в полный профиль» → navigate("/profile").
- Данные: РЕАЛЬНЫЕ (из auth-контекста). Нет собственного API/сохранения здесь.
- Вердикт: Работает да (read-only + редирект) · реальные · 🟢

## SETTINGS → Смена пароля (value="password", :1431 → PersonalPasswordTab:1249)
- Поля: текущий (обяз.), новый (обяз., min 8), подтверждение; eye-toggle. Submit → POST `/api/auth/change-password` (auth.ts) с валидацией.
- Данные: РЕАЛЬНЫЕ (мутация в users).
- Вердикт: Работает да · реальные · 🟢

## SETTINGS → Уведомления личные (value="notifications", :1435 → PersonalNotificationsTab:1319)
- 4 Switch (emailNewRelease/emailRoyalty/emailDelivery/emailReports). save → **localStorage.setItem("notif_prefs")** — НЕ на сервер. Начальное состояние — хардкод.
- Данные: хардкод-дефолты, персист только в localStorage. Нет эндпоинта.
- Вердикт: Работает только UI (локально) · 🔴 (нет бэкенда, localStorage-заглушка)

## SETTINGS → Команда (value="members", :1440, только label → LabelMembersTab:1705)
- Таблица участников (Участник/Роль/Приглашён/Статус/удалить). GET `/api/label-members`. Пригласить (диалог: имя*, email*, роль manager/viewer → POST /api/label-members/invite). Смена роли (Select → PATCH /api/label-members/:id/role). Удаление (DELETE /api/label-members/:id). owner — без изменения/удаления. Тип Member — локальный TS, роли owner/manager/viewer.
- Бэкенд: label-members.ts (все реальны) → таблица `label_members` (**ПУСТА 0**).
- Вердикт: Работает да · Данные пусто · 🟡

---

# SETTINGS — СИСТЕМНЫЕ вкладки (admin+manager, index.tsx:1522)

TabsList (15): integrations, general, ddex, api, payment, currency, dsp, security, storage, notifications, audit, activity, acrcloud, pros, **manager-perms (только role==="admin", :1566)**. Т.е. manager видит 14 вкладок, admin — 15. (channels-вкладка скрыта, :1586.)

## SETTINGS → Интеграции (value="integrations", :1574 → integrations-tab.tsx)
- Хаб внешних сервисов. `SERVICES` — **ХАРДКОД-каталог** (R2, S3, Resend, и т.д. с полями). GET `/api/integrations` (реально), register (POST /api/integrations/:code/register), credentials (POST .../credentials), test (POST .../test).
- Бэкенд: integrations.ts → таблицы `integrations` (n=31), `integration_credentials` (n=4).
- Данные: список статусов РЕАЛЬНЫЙ; но каталог доступных сервисов — хардкод.
- Вердикт: Работает да · Данные реальные (+ хардкод-каталог) · 🟢 (с оговоркой 🔴 на SERVICES-массив)

## SETTINGS → Общие (value="general", :1575 → TabGeneral:119)
- Поля: platformName, supportEmail, contactEmail, timezone(Select хардкод 4 зоны), language(Select ru/tg/en), logoUrl, primaryColor; Switch maintenanceMode, registrationOpen. GET/PUT `/api/settings/general`.
- Бэкенд: settings.ts → таблица `platform_settings` (**ПУСТА 0** → отдаются DEFAULTS из settings.ts:32).
- Данные: реальный эндпоинт, но платформа отдаёт дефолты (таблица пуста). Сохранение работает (insert/update).
- Вердикт: Работает да · Данные пусто/дефолты · 🟡

## SETTINGS → DDEX (value="ddex", :1576 → TabDdex:928)
- **Верхняя карта Party ID: DPID `PA-DPIDA-2024053004-T`, ERN 4.3, ISRC `TJ-MUS-26`, UPC `888002` — все readOnly ХАРДКОД** (кнопки copy). Нижняя таблица DDEX-партнёров = integrations фильтр category="delivery" (реально): toggle enabled (POST /api/integrations/:code/enable), Настроить (IntegrationConfigDialog), Тест (POST .../test).
- Бэкенд: integrations.ts → `integrations` (n=31, часть delivery). Party-блок — без бэкенда.
- Вердикт: Работает частично · Данные: транспорты реальные, Party-ID хардкод · 🔴 (Party Identification — 4 захардкоженных значения, не редактируемы/не из БД)

## SETTINGS → API & Webhooks (value="api", :1577 → TabApiKeys:529)
- API-ключи: таблица (Название/Префикс/Права/Использование/Статус/удалить), «Создать» (диалог: name, permissions из `ALL_PERMISSIONS` хардкод-8 → POST /api/api-keys, raw-key reveal-модалка с copy), toggle (PATCH), delete (DELETE).
- Webhooks (TabWebhooksInner:672): таблица, создать/редактировать (name/url/secret/events из `ALL_EVENTS` хардкод-10/retry/timeout → POST/PUT /api/webhooks), test (POST .../test), toggle, delete.
- Бэкенд: settings.ts → таблицы `api_keys` (**ПУСТА 0**), `webhooks` (**ПУСТА 0**).
- Данные: эндпоинты реальны, обе таблицы пусты. Списки прав/событий — хардкод (это нормально для констант).
- Вердикт: Работает да · Данные пусто · 🟡

## SETTINGS → Оплата (value="payment", :1578 → TabPayment:878)
- Таблица платёжных шлюзов = integrations фильтр category "payment"/"payment_gateway". toggle/Настроить/Тест как выше.
- Бэкенд: integrations.ts → `integrations` (в БД 31 записей; платёжных может не быть → пустой список с подсказкой добавить в DDEX&DSP).
- Вердикт: Работает да · Данные реальные (возможно пустая выборка категории) · 🟢/🟡

## SETTINGS → Валюта/НДС (value="currency", :1579 → TabCurrency:436)
- Поля: defaultCurrency(Select хардкод 5), supportedCurrencies(CSV), fxUpdateFrequency(Select hourly/daily/manual); Switch taxEnabled/taxIncluded, taxRate, taxLabel, royaltyPayoutThreshold, payoutCurrencies(CSV). GET/PUT `/api/settings/currency`.
- Бэкенд: settings.ts → `platform_settings` (ПУСТА → DEFAULTS:82).
- Вердикт: Работает да · Данные пусто/дефолты · 🟡

## SETTINGS → DSP (value="dsp", :1580 → TabDsp:817)
- Таблица DSP = integrations фильтр category="dsp": Платформа/Auth/Синхр/Статус/Включён/действия. toggle (POST enable), Настроить (config-диалог), Тест.
- Бэкенд: integrations.ts → `integrations` (n=31), `dsp_catalog` (n=30). Реальные данные есть.
- Вердикт: Работает да · Данные реальные · 🟢

## SETTINGS → Безопасность (value="security", :1581 → TabSecurity:195)
- Поля: sessionTimeout, maxLoginAttempts, lockoutDuration, **require2FA (Switch disabled, бэйдж «Скоро»)**, passwordMinLength, 3 Switch требований пароля, IP whitelist (add/remove бэйджи), auditRetentionDays. GET/PUT `/api/settings/security` (сервер инвалидирует password/security-policy кэши).
- Бэкенд: settings.ts → `platform_settings` (ПУСТА → DEFAULTS:44). 2FA не реализован (явно disabled).
- Вердикт: Работает да (кроме 2FA) · Данные пусто/дефолты · 🟡 (⚪ по 2FA — UI-заглушка disabled)

## SETTINGS → Хранилище (value="storage", :1582 → TabStorage:296)
- Поля: provider(Select local/s3/cdn), условные (localBasePath | s3Bucket/Region/KeyPrefix), cdnBaseUrl, maxFileSizeMb, allowedAudio/ImageFormats(CSV). GET/PUT `/api/settings/storage`.
- Бэкенд: settings.ts → `platform_settings` (ПУСТА → DEFAULTS:56).
- Вердикт: Работает да · Данные пусто/дефолты · 🟡

## SETTINGS → Уведомления системные (value="notifications", :1583 → TabNotifications:367)
- SMTP: emailEnabled, host, port, user, password(eye), tls, from address/name; Push: pushEnabled, VAPID; типы событий 4 Switch. GET/PUT `/api/settings/notifications`.
- Бэкенд: settings.ts → `platform_settings` (ПУСТА → DEFAULTS:67). (Отправка email фактически зависит от реализации — здесь только сохранение конфигурации.)
- Вердикт: Работает да (сохранение) · Данные пусто/дефолты · 🟡

## SETTINGS → Аудит (value="audit", :1584 → TabAudit:1019)
- Фильтры select сущность/действие/пользователь (facets), date from/to; таблица expandable с diff (raw before/after). GET `/api/audit`, `/api/audit/facets`.
- Бэкенд: audit.ts → `audit_log` (n=13).
- Вердикт: Работает да · Данные реальные · 🟢

## SETTINGS → Активность (value="activity", :1585 → TabActivity:1172)
- Таблица (Когда/Тип/Событие/Уровень), фильтр-строка (клиентский), Обновить. GET `/api/dashboard/recent-activity`. Уровень вычисляется эвристикой по type (sev()).
- Бэкенд: dashboard.ts recent-activity → `activity_log` (n=7).
- Вердикт: Работает да · Данные реальные · 🟢

## SETTINGS → ACRCloud (value="acrcloud", :1587 → TabAcrcloud:1607)
- Поля: host (дефолт-строка хардкод `identify-eu-west-1...`), accessKey, accessSecret(password). GET/PUT `/api/settings/acrcloud` (ключ есть в VALID_KEYS).
- Бэкенд: settings.ts (generic :key) → `platform_settings` (ПУСТА). Внимание: **у DEFAULTS нет ключа acrcloud** → GET вернёт value=undefined (в форме останется локальный дефолт). Сохранение работает.
- Вердикт: Работает да · Данные пусто · 🟡

## SETTINGS → PRO (value="pros", :1588 → TabPros:1642)
- 4 карты (ASCAP/BMI/Songtrust/MLC), у каждой endpoint + apiKey(password). GET/PUT `/api/settings/pros`.
- Бэкенд: settings.ts (generic :key) → `platform_settings` (ПУСТА, нет DEFAULTS[pros]).
- Вердикт: Работает да · Данные пусто · 🟡

## SETTINGS → Права менеджеров (value="manager-perms", :1589, только admin → manager-permissions-tab.tsx)
- `PERM_DEFS` — 9 ключей (catalog, distribution, finance, analytics, crm, users_kyc, rights, support_comms, automation_audit) хардкод-описания. useFullManagerPermissions (GET /api/manager-permissions), Switch → useTogglePermission (PATCH /api/manager-permissions/:key adminOnly). Default enabled=true если записи нет.
- Бэкенд: manager-permissions.ts → таблица `manager_permissions` (**n=9, С ДАННЫМИ**).
- Вердикт: Работает да · Данные реальные · 🟢

---

## ПРОБЛЕМЫ (users-settings)

1. **DDEX Party Identification захардкожен** — TabDdex, index.tsx:943-958. DPID `PA-DPIDA-2024053004-T`, ERN 4.3, ISRC `TJ-MUS-26`, UPC `888002` — readOnly-константы, не из БД и нередактируемы. Почему проблема: критичные для реальной DDEX-доставки идентификаторы фейковые/статичные. Предлагаю: хранить в platform_settings (ключ ddex) с формой редактирования.

2. **Личные уведомления пишут только в localStorage** — PersonalNotificationsTab, index.tsx:1319-1338. Нет эндпоинта, дефолты хардкод. Почему: настройки теряются между устройствами/сессиями, вводят пользователя в заблуждение (кнопка «Сохранено»). Предлагаю: эндпоинт user-notification-prefs или убрать/пометить как локальные.

3. **Вкладка USERS→Роли — хардкод-описание прав** — index.tsx:118-185. Массив ROLES_PERMISSIONS не связан с реальной RBAC (permissions.ts/manager_permissions). Почему: расхождение отображаемых и фактических прав. Предлагаю: генерировать из ROUTE_ROLES/ROUTE_MANAGER_PERMISSION_KEY или пометить как справочное.

4. **Дублирование функционала signups/kyc** — USERS→Заявки (_signups-tab) и /admin/signups (admin/signups.tsx) реализуют одно и то же; аналогично KYC (_kyc-tab vs admin/kyc.tsx). Почему: две расходящиеся реализации → риск рассинхрона (разные типы KycStatus: "none" в _kyc-tab vs "not_started" в admin/kyc). Предлагаю: свести к одному компоненту.

5. **Множество системных вкладок «пусто/дефолты» из-за пустого platform_settings** — general/currency/security/storage/notifications/acrcloud/pros читают DEFAULTS (таблица platform_settings n=0). Почему: не проблема кода, но UI показывает дефолты как «реальные настройки». Плюс **acrcloud/pros не имеют записей в DEFAULTS** (settings.ts:31) → GET отдаёт value без объекта, форма опирается на локальные дефолты. Предлагаю: добавить acrcloud/pros в DEFAULTS для консистентности.

6. **2FA — UI-заглушка** — TabSecurity, index.tsx:246-251. Switch require2FA disabled, бэйдж «Скоро». Флаг сохраняется, но не применяется. Честно помечено, но функционал отсутствует.

7. **Пустые таблицы у полностью рабочих фич** — api_keys(0), webhooks(0), label_members(0), signup_requests(0), kyc_documents(0). Эндпоинты и UI реальны, но данных нет → все эти экраны показывают пустые состояния (🟡). Не баг, но при демо будет казаться «ничего не работает».

8. **impersonate-редирект и toast-подтверждения** — большинство мутаций (approve/reject/toggle) подтверждаются toast и работают через реальные API — здесь заглушек нет; единственное toast-only без бэка — п.2 (личные уведомления).


# Аудит фронтенда — ПРОФИЛЬ + ПОДДЕРЖКА + МАРКЕТИНГ + АВТОМАТИЗАЦИЯ

Дата: 2026-07-08. READ-ONLY. Источники проверены по коду фронта (`crm-panel/src`) и бэка (`api-server/src/routes`).

---

## РАЗДЕЛ: ПРОФИЛЬ (`/profile`, все роли; файл `pages/profile/index.tsx`)

Единая страница, табы через `Tabs defaultValue="profile"`. Табы: profile, social, password, kyc, bank, tax, members (последний — только admin/manager, `isAdmin = role==="admin"||"manager"`).

### Профиль → profile (value="profile", index.tsx:355)
- Путь: `/profile` · Доступ: admin, manager, label, artist.
- Элементы:
  - Аватар-загрузчик (кнопка-дропзона, `fileRef.current.click()`) → `POST /api/users/me/avatar` (multipart, валидация типа/размера ≤5MB, локальный preview).
  - Карточка «DSP-профили»: 4 поля (Apple Music ID, Spotify ID, Yandex Music ID, YouTube Topic ID) — текст, необязательные. Кнопка «Сохранить» → `PATCH /api/users/me` (`dspProfiles`).
  - Карточка «Ваши данные»: firstName, lastName (текст); email (disabled, из user); phone (текст); address (текст); country — **select, хардкод-dict** (tj/ru/uz/kz/es); region, city, zip (текст); account_type (disabled); about (textarea). Кнопка «Сохранить» → `PATCH /api/users/me`.
- Бэкенд: `PATCH /api/users/me` (users.ts:307), `POST /api/users/me/avatar` (users.ts:436) → таблица `users`.
- Данные: РЕАЛЬНЫЕ (форма гидрируется из `useAuth().user`, сохраняется в `users`).
- Вердикт: Работает **да** · Данные **реальные** · 🟢

### Профиль → social (value="social", index.tsx:472)
- Путь: `/profile` · Доступ: все роли.
- Элементы: 8 полей соцсетей (Facebook, Instagram, YouTube, TikTok, LinkedIn, X, Telegram, VK) — текст/URL, необязательные. Кнопка «Сохранить» → `PATCH /api/users/me` (`socialLinks`).
- Бэкенд: `PATCH /api/users/me` → `users.socialLinks`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: **да** · реальные · 🟢

### Профиль → password (value="password", index.tsx:499)
- Путь: `/profile` · Доступ: все роли.
- Элементы: email (disabled); current_password, new_password, confirm_password (PwdInput с toggle показа). Валидация на клиенте (≥8, совпадение). Кнопка «Сохранить» → `POST /api/auth/change-password`. Ссылка «поддержка» — `href="#"` (**заглушка-якорь, никуда не ведёт**).
- Бэкенд: `POST /api/auth/change-password` (auth.ts:390, есть rate-limiter) → `users`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: **да** · реальные · 🟢 (минус: ссылка на поддержку — `#`).

### Профиль → kyc (value="kyc", index.tsx:532 → `KycTab` :734)
- Путь: `/profile` · Доступ: все роли.
- Элементы:
  - Алерты по статусу KYC (approved/pending/rejected) из `user.kycStatus`.
  - Форма загрузки (если не locked): select тип документа — **хардкод `KYC_KIND_KEYS`** (passport/id_card/company_reg/tax_certificate/bank_statement/other); file-input (валидация MIME/25MB). → `POST /api/users/me/kyc-documents` (multipart).
  - Список документов: карточки со статусом, кнопка открытия (`/api/storage/objects/uploads/...`), кнопка удаления pending → `DELETE /api/users/me/kyc-documents/:id`. Кнопка «Обновить» → `GET /api/users/me/kyc-documents`.
  - Кнопка «Отправить на проверку» → `POST /api/users/me/submit-kyc` (disabled если 0 pending).
  - Правая карточка «Требования» — статичный i18n-текст.
- Бэкенд: kyc.ts (91,222,231,260) → таблица `kyc_documents`.
- Данные: ПУСТО (эндпоинты реальные, таблица `kyc_documents` = 0). Список у любого юзера будет пуст, пока не загрузит.
- Вердикт: **да** (полный CRUD) · данные **пусто** · 🟡

### Профиль → bank (value="bank", index.tsx:537 → `BankTab` :1019)
- Путь: `/profile` · Доступ: все роли.
- Элементы: bankName, bankHolderName (текст); accountNumber, iban (текст, маскируются — сохраняются только при вводе, placeholder «•••» если уже задано); swift (текст); country — **select хардкод-dict** (tj/ru/uz/kz/kg/es). Кнопка «Сохранить» → `PATCH /api/users/me/bank-info`.
- Бэкенд: `PATCH /api/users/me/bank-info` (users.ts:232) → `users` (bank-поля).
- Данные: РЕАЛЬНЫЕ (users 4 строки).
- Вердикт: **да** · реальные · 🟢

### Профиль → tax (value="tax", index.tsx:542 → `TaxTab` :1136)
- Путь: `/profile` · Доступ: все роли.
- Элементы: taxId (текст); taxCountry — select хардкод-dict; taxFormType — **select хардкод** (self_employed/individual_entrepreneur/w8/w9). Кнопка «Сохранить» → `PATCH /api/users/me/tax-info`.
- Бэкенд: `PATCH /api/users/me/tax-info` (users.ts:285) → `users`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: **да** · реальные · 🟢

### Профиль → members (value="members", index.tsx:548 → `MembersTab` :559, только admin/manager)
- Путь: `/profile` · Доступ (таб): admin, manager.
- Элементы: таблица участников (колонки: Имя+аватар, Email, Роль, Последний вход, Статус). Источник — `GET /api/users?limit=100`. Бейджи статуса active/suspended/inactive.
- Бэкенд: `GET /api/users` → таблица `users`.
- Данные: РЕАЛЬНЫЕ (users 4).
- Вердикт: **да** · реальные · 🟢 (только просмотр, нет действий над участниками — приглашение/удаление отсутствует).

---

## РАЗДЕЛ: ПОДДЕРЖКА (`/support`, все роли; файл `pages/support/index.tsx`)

`SupportPage` разветвляется по роли: admin/manager → `SupportInbox` (staff-вид, `inbox.tsx`); label/artist → `SupportCustomer` (3 таба).

### Поддержка(staff) → Inbox (SupportInbox, inbox.tsx:51) — admin/manager
- Путь: `/support` · Доступ: admin, manager.
- Элементы: 5 KPI-плиток (open/in_progress/waiting/resolved_24h/urgent — считаются из загруженных тикетов на клиенте); фильтры (поиск, статус, приоритет, категория, assignee=me/unassigned); кнопка «Мои тикеты» (ставит `assignee=me`); список тикетов; Drawer (`InboxTicketDrawer`) с управлением статус/приоритет/исполнитель (`PATCH /api/support/tickets/:id`), тред, ответ + чекбокс «internal note» (`POST .../messages`). Assignee-select берёт агентов из `GET /api/support/agents`.
- Бэкенд: `GET/POST/PATCH /api/support/tickets*` (support.ts:91–496) → таблицы `support_tickets`, `support_ticket_messages`.
- Данные: ПУСТО (эндпоинты реальные, `support_tickets`=0, `support_ticket_messages`=0). Очередь будет пустой.
- Вердикт: **да** (полноценный CRUD) · данные **пусто** · 🟡

### Поддержка(клиент) → tickets (value="tickets", index.tsx:146) — label/artist
- Путь: `/support` · Доступ: label, artist.
- Элементы: список своих тикетов (аватар, ref, категория `CATEGORY_LABELS`, тема, счётчик сообщений, статус/приоритет-бейдж). Кнопка «Новый тикет» (→ таб contact). Клик → `CustomerTicketDrawer` (тред + форма ответа `POST .../messages`, блокировка при closed). Источник — `useSupportTickets({})` → `GET /api/support/tickets`.
- Бэкенд: support.ts → `support_tickets`.
- Данные: ПУСТО (таблица 0).
- Вердикт: **да** · **пусто** · 🟡

### Поддержка(клиент) → help / База знаний (value="help", index.tsx:211)
- Путь: `/support` · Доступ: label, artist.
- Элементы: поиск (клиентская фильтрация); аккордеоны FAQ. Источник — **хардкод-массив `FAQ_CATEGORIES`** (index.tsx:32, 3 категории × 2–3 Q&A). Это статичный копирайт-контент, не данные платформы. Кнопка «Связаться с поддержкой» → таб contact.
- Бэкенд: нет (не запрашивает сервер).
- Данные: МОК/хардкод (осознанно — статический контент).
- Вердикт: **только UI/статика** · данные **хардкод** · 🔴 (по критерию «хардкод-массив»; функционально это ожидаемо для FAQ).

### Поддержка(клиент) → contact / Создать тикет (value="contact", index.tsx:262)
- Путь: `/support` · Доступ: label, artist.
- Элементы: форма — категория (**select хардкод**: general/finance/distribution/catalog/marketing/account/bug/other), приоритет (**select хардкод**: low/medium/high/urgent), тема (текст, maxLength 200, обязательна), сообщение (textarea, обязательно). Кнопка «Отправить запрос» → `useCreateSupportTicket` → `POST /api/support/tickets`. Боковые карточки «Прямые контакты» (email/телефон/telegram — **хардкод-ссылки**) и «Время работы» (**хардкод-текст**).
- Бэкенд: `POST /api/support/tickets` (support.ts:266) → `support_tickets`.
- Данные: РЕАЛЬНЫЕ (создание пишет в БД); контактные блоки — хардкод.
- Вердикт: **да** (создание работает) · реальные (форма) / хардкод (контакты) · 🟢 с оговоркой по хардкод-контактам.

---

## РАЗДЕЛ: МАРКЕТИНГ (`/marketing`, все роли; хаб `pages/marketing/index.tsx`)

Набор табов зависит от роли (`ROLE_TABS`, index.tsx:36):
- admin/manager: presave, smart_links, playlists, trends, promo_assets
- label: smart_links, playlists, trends, promo_assets (без presave)
- artist: presave, smart_links, promo_assets (без playlists/trends)

Таб выбирается из `?tab=`, смена — `setLocation('/marketing?tab=...')`. Старые прямые роуты (`/marketing/links` и т.п.) сохранены в ROUTE_ROLES.

### Маркетинг → presave (PresavePanel, presave.tsx:45)
- Доступ (таб): admin, manager, artist.
- Элементы: 3 KPI (всего сохранений/переходов/активных — сумма по загруженным); кнопка «Новая кампания» (открывает Dialog); список карточек кампаний (title, artist, статус-бейдж `STATUS_LABELS` хардкод, saves/clicks, дата релиза, ссылка + кнопки Copy/ExternalLink). Диалог создания: title, artist, releaseDate (обязательны), platforms — **select хардкод** (all/spotify/apple/spotify_apple). Кнопка «Создать» → `POST /api/marketing/presave`. Copy → `navigator.clipboard` + toast.
- Бэкенд: `GET/POST /api/marketing/presave` (marketing.ts:20,41) → таблица `presave_campaigns`.
- Данные: ПУСТО (`presave_campaigns`=0).
- Вердикт: **да** · **пусто** · 🟡

### Маркетинг → smart_links (SmartLinksPanel, links.tsx:38)
- Доступ (таб): все роли.
- Элементы: 3 KPI (кол-во ссылок/всего переходов/ср. переходов); кнопка «Создать ссылку» (Dialog); список карточек (title, artist, clicks-бейдж, DSP-бейджи, slug-код + Copy/ExternalLink, дата). Диалог: title, artist (обязательны). Кнопка «Создать» → `POST /api/marketing/links`. Copy → clipboard+toast.
- Бэкенд: `GET/POST /api/marketing/links` (marketing.ts:103,121) → таблица `smart_links`.
- Данные: ПУСТО (`smart_links`=0).
- Вердикт: **да** · **пусто** · 🟡

### Маркетинг → playlists (PlaylistsPanel, playlists.tsx:56)
- Доступ (таб): admin, manager, label.
- Элементы: 3 KPI (кол-во/фолловеры/стримы); поиск; фильтр DSP — **select хардкод `DSP_OPTIONS`** (spotify/apple_music/youtube_music/deezer/tidal/amazon_music); таблица (Плейлист, DSP, Фолловеры, Стримы, Тренд%, Обновлён, действия). canEdit=admin/manager/label → кнопки «Добавить»/Pencil/Trash + `PlaylistEditor` (Dialog: name, dsp-select, followers, streams, trendPct). Создание → `POST /api/playlists`; правка → `PUT /api/playlists/:id`; удаление → `DELETE /api/playlists/:id`. Список → `GET /api/analytics/playlists`.
- Бэкенд: analytics-marketing.ts (45 GET, 96 POST, 121 PUT, 151 DELETE — writes требуют роль admin/manager/label) → таблица `playlist_stats`.
- Данные: ПУСТО (`playlist_stats`=0).
- Вердикт: **да** (полный CRUD) · **пусто** · 🟡

### Маркетинг → trends (MarketingTrendsPanel, trends.tsx:34)
- Доступ (таб): admin, manager, label.
- Элементы: таблица TikTok-трендов (Трек, Артист, Использования, Просмотры, Лайки, Период). Источник — `GET /api/analytics/tiktok`. Только чтение, нет действий.
- Бэкенд: `GET /api/analytics/tiktok` (analytics-marketing.ts:63) → таблица `tiktok_stats`.
- Данные: ПУСТО (`tiktok_stats`=0).
- Вердикт: **да** (read-only) · **пусто** · 🟡

### Маркетинг → promo_assets (PromoAssetsPanel, assets.tsx:42)
- Доступ (таб): все роли.
- Элементы: фильтр по релизу (select, значения из загруженных assets); кнопка «Авто-генерация» → `POST /api/marketing/assets/generate` (реально создаёт строки промо-ассетов по релизам из БД); список карточек (тип из **хардкод `TYPE_META`**: instagram_square/story/youtube_banner/press_kit, формат, размер, дата). Кнопка **«Скачать» = toast-заглушка** (`onClick={() => toast(...)}`, реального скачивания/URL нет). Список → `GET /api/marketing/assets`.
- Бэкенд: `GET /api/marketing/assets` (marketing.ts:166), `POST /api/marketing/assets/generate` (marketing.ts:185) → таблица `promo_assets`.
- Данные: ПУСТО (`promo_assets`=0; генерация зависит от наличия releases — есть 6, так что генерация даст строки).
- Вердикт: **частично** (генерация/список реальны, но **«Скачать» — toast-заглушка**) · **пусто** · 🟡 (🔴 для кнопки Download).

---

## РАЗДЕЛ: АВТОМАТИЗАЦИЯ (`/automation`, admin+manager; файл `pages/automation/index.tsx`)

Доступ: ROUTE_ROLES `/automation`=admin,manager; manager дополнительно гейтится ключом `automation_audit`. 6 табов, `Tabs defaultValue="workflow"`.

### Автоматизация → workflow (WorkflowRulesTab, index.tsx:31)
- Доступ: admin, manager.
- Элементы: статичная карточка-заглушка + кнопка-ссылка «Открыть Коммуникации» (`<a href="/communications">`). Никаких данных не загружает.
- Бэкенд: нет (только редирект-ссылка).
- Данные: нет.
- Вердикт: **только UI/редирект** · ⚪ (заглушка-редирект на /communications).

### Автоматизация → scheduled (ScheduledTab, index.tsx:57)
- Доступ: admin, manager.
- Элементы: счётчик задач; кнопка «Обновить»; таблица (Задача, Описание, Расписание, Статус). Источник — `GET /api/automation/scheduled`. Только чтение.
- Бэкенд: automation.ts:54 → комбинирует **хардкод `SYSTEM_WORKERS`** (системные воркеры на сервере) + реальные строки `payment_automation_rules`.
- Данные: частично — системные задачи всегда есть (server-side константа), правил из `payment_automation_rules`=0.
- Вердикт: **да** (read-only) · системные строки реальны из server-const, rule-строки пусто · 🟡 (список никогда не пуст из-за SYSTEM_WORKERS).

### Автоматизация → fraud / Fraud Detection (FraudRulesTab, index.tsx:142)
- Доступ: admin, manager.
- Элементы: счётчик; кнопки «Обновить»/«Новое правило»; таблица (Название, Тип, Порог, Окно, Серьёзность, Статус, действия); `FraudRuleDialog` (name, ruleType — **хардкод `FRAUD_RULE_TYPES`**, threshold, windowMinutes, severity, enabled-чекбокс). CRUD → `GET/POST /api/automation/fraud-rules`, `PATCH/DELETE .../:id`.
- Бэкенд: automation.ts:90–121 → таблица `fraud_rules`.
- Данные: ПУСТО (`fraud_rules`=0).
- Вердикт: **да** (полный CRUD) · **пусто** · 🟡

### Автоматизация → alerts / Fraud Alerts (FraudAlertsTab, index.tsx:473)
- Доступ: admin, manager.
- Элементы: счётчики (всего/открытых/критических); фильтр статуса (**select хардкод**); кнопка «Обновить»; таблица (Дата, Правило, Описание, Серьёзность, Статус, Объект). Клик по строке → `FraudAlertRow` Dialog (детали + смена статуса + заметка) → `PATCH /api/automation/fraud-alerts/:id`. Список → `GET /api/automation/fraud-alerts`.
- Бэкенд: automation.ts:123,136 → таблица `fraud_alerts`.
- Данные: ПУСТО (`fraud_alerts`=0).
- Вердикт: **да** · **пусто** · 🟡

### Автоматизация → moderation / Content Moderation (ModerationRulesTab, index.tsx:555)
- Доступ: admin, manager.
- Элементы: счётчик; кнопки «Обновить»/«Новое правило»; таблица (Название, Поле, Тип проверки, Параметр, Серьёзность, Статус, действия); `ModRuleDialog` (name, field, ruleType — **хардкод `MOD_KIND_LABELS`**: required/regex/min_length/max_length/blocklist; pattern/minLength/maxLength условно; severity; blockOnFail-чекбокс; enabled-чекбокс). CRUD → `GET/POST/PATCH/DELETE /api/automation/moderation-rules`.
- Бэкенд: automation.ts:166–188 → таблица `moderation_rules`.
- Данные: ПУСТО (`moderation_rules`=0).
- Вердикт: **да** (полный CRUD) · **пусто** · 🟡

### Автоматизация → payments / Платежи (PaymentRulesTab, payment-rules-tab.tsx:34)
- Доступ: admin, manager.
- Элементы: заголовок; кнопки «Обновить»/«Добавить»; список правил (Switch enabled → `PATCH .../:id`, тип `KIND_LABEL` **хардкод**, порог в $, cron, lastRun, Trash); Dialog создания (name, kind-select хардкод, thresholdCents, scheduleCron, enabled-switch, notes). CRUD → `GET/POST/PATCH/DELETE /api/automation/payment-rules` через `adminApi`.
- Бэкенд: automation-extras.ts:21–47 → таблица `payment_automation_rules`.
- Данные: ПУСТО (`payment_automation_rules`=0).
- Вердикт: **да** (полный CRUD) · **пусто** · 🟡

---

## ПРОБЛЕМЫ (Профиль / Поддержка / Маркетинг / Автоматизация)

1. **Кнопка «Скачать» промо-ассета — toast-заглушка**
   - Где: `pages/marketing/assets.tsx:155-158`.
   - Почему проблема: onClick только показывает toast «Скачивание...», реального URL файла / скачивания нет. Ассеты «генерируются» (строки в `promo_assets`), но без реального файла и без ссылки на объект — скачать нельзя.
   - Предлагаю: возвращать objectPath/downloadUrl из `/api/marketing/assets` и делать `<a download href=...>`; либо явно пометить фичу как «в разработке», убрав вводящую в заблуждение кнопку.

2. **Ссылка «поддержка» в табе password — пустой якорь `href="#"`**
   - Где: `pages/profile/index.tsx:505`.
   - Почему: клик ничего не делает (или скроллит вверх), выглядит как рабочая ссылка.
   - Предлагаю: вести на `/support?tab=contact` или убрать ссылку.

3. **Workflow Rules — таб-заглушка без функционала**
   - Где: `pages/automation/index.tsx:31-46`.
   - Почему: таб «Workflow Rules» лишь показывает текст и кнопку-редирект на `/communications`; в самой автоматизации workflow-правил нет. Пользователь ожидает управление правилами здесь.
   - Предлагаю: либо перенести управление триггерами сюда, либо переименовать таб, чтобы не создавать ложное ожидание.

4. **Контакты/время работы поддержки — хардкод**
   - Где: `pages/support/index.tsx:336-378` (email/тел/telegram/график) и FAQ `:32-56`.
   - Почему: контактные данные и FAQ зашиты в компонент; при смене реквизитов правится код. FAQ не редактируется через CRM (`email_templates`/`support_tickets` есть, но БЗ хранится в коде).
   - Предлагаю: вынести контакты в `platform_settings` (сейчас пусто), FAQ — в отдельную таблицу/справочник или CMS-эндпоинт.

5. **Массовая «пустота» ключевых разделов — нет seed-данных**
   - Где: presave/smart_links/playlists/trends/promo_assets, support_tickets, kyc_documents, все таблицы automation (fraud_rules/fraud_alerts/moderation_rules/payment_automation_rules).
   - Почему: эндпоинты и CRUD реальны, но соответствующие таблицы пусты (n_live_tup=0) → все эти вкладки при демо показывают пустые состояния, создаётся впечатление «нерабочих» фич.
   - Предлагаю: демо-seed по этим таблицам (аналогично releases/artists), чтобы вкладки демонстрировали данные.

6. **Members-таб профиля — только просмотр**
   - Где: `pages/profile/index.tsx:559` (`MembersTab`).
   - Почему: показывает участников из `/api/users`, но нет действий (пригласить/сменить роль/деактивировать) — таб выглядит как управление участниками, но это read-only список.
   - Предлагаю: добавить действия или переименовать в «Участники (просмотр)».

7. **`country`/`tax`/`bank` селекты — хардкод-словари стран**
   - Где: `profile/index.tsx` (country :429, bank country :1115, tax country :1193; taxFormType :1206).
   - Почему: список стран/форм зашит в 3 местах, расходится (в profile нет kg, в bank/tax — есть). Дублирование и рассинхрон.
   - Предлагаю: единый общий справочник стран (или `broma16_dictionaries`, где 768 строк) вместо трёх локальных хардкодов.

8. **Scheduled-таб всегда непустой из-за server-side хардкода**
   - Где: фронт `automation/index.tsx:57`; бэк `automation.ts:54` (`SYSTEM_WORKERS`).
   - Почему: список задач смешивает хардкод системных воркеров и реальные cron-правила; пользователь не отличает «настоящую» задачу от статичной. Статус/lastRun системных задач всегда `null/enabled` без реального контроля.
   - Предлагаю: помечать источник (`source: system|rule`) в UI и/или отражать реальный статус воркеров.


# Аудит: Артисты / Лейблы / Доставка / Дашборд / Топбар / Авторизация

Область охватывает страницы каталога (артисты, лейблы), доставку, дашборд со всеми виджетами,
публичные страницы авторизации (login/signup/invite/404) и общие элементы топбара
(шапка layout, уведомления, имперсонизация).

---

### Каталог → Артисты (файл: pages/artists/index.tsx:17)
- Путь: `/artists` · Доступ (ROUTE_ROLES): admin, manager, label, artist (менеджер доп. гейтится ключом `catalog`).
- Элементы:
  - Заголовок/подзаголовок — динамические по роли (t.artists.title_admin/label/artist).
  - Поле поиска (`search`, необяз., управляет `searchQuery`) → передаётся в `useListArtists({search})`.
  - Кнопка «Фильтр» (иконка Filter) — **БЕЗ onClick, декоративная** (строка ~78).
  - Кнопка «Новый артист / Подписать артиста» (Plus) — видна только admin/manager/label (`canCreate`), открывает `ArtistFormDialog` в режиме создания.
  - Таблица: колонки Аватар, Имя, Лейбл (labelName || «Независимый»), Жанр, Релизы (totalReleases), Статус (StatusBadge), Действия. Источник — `useListArtists` (реальный API).
  - Dropdown действий (MoreHorizontal) → пункт «Редактировать профиль» (только canCreate) открывает `ArtistFormDialog` с initial. Больше пунктов нет.
  - Диалог `ArtistFormDialog` — открывается по кнопке создания/редактирования (под-компонент, содержит форму артиста, включая `broma16Outlets`).
  - Клиентская фильтрация для роли artist: показывает только запись `user.artistId`; для label передаётся `label_id`.
- Бэкенд: `GET /api/artists` (через хук `useListArtists`) → таблица `artists` (n_live_tup=4). Создание/редакт — через ArtistFormDialog (см. отдельный аудит формы).
- Данные: РЕАЛЬНЫЕ (artists=4 строки).
- Вердикт: Работает — да (список+создание+редакт). Данные — реальные. 🟢
  - Оговорка: кнопка «Фильтр» — ⚪ только UI-заглушка (нет обработчика).

---

### Каталог → Лейблы (файл: pages/labels/index.tsx:17)
- Путь: `/labels` · Доступ (ROUTE_ROLES): admin, manager (менеджер доп. гейтится `catalog`). ВАЖНО: label/artist НЕ имеют доступа к роуту (в отличие от artists).
- Элементы:
  - Заголовок/подзаголовок динамические (admin vs label — но роут label не пускает).
  - Поле поиска → `useListLabels({search})`.
  - Кнопка «Фильтр» (Filter) — **БЕЗ onClick, декоративная** (строка ~75).
  - Кнопка «Новый лейбл» (Plus) — только admin/manager (`isAdminLike`), открывает `LabelFormDialog` (создание).
  - Таблица: колонки Логотип, Название, Страна, Артисты (totalArtists), Релизы (totalReleases), Статус, Действия. Источник — `useListLabels`.
  - Dropdown действий → «Редактировать лейбл» (только admin/manager) открывает `LabelFormDialog` с initial.
  - Диалог `LabelFormDialog` (под-компонент — форма лейбла: name, country, website, logoUrl, parentLabelId, status).
  - Клиентская фильтрация для label по `user.labelId` (мёртвый код — роут label не пускает).
- Бэкенд: `GET /api/labels` (`useListLabels`) → таблица `labels` (n_live_tup=2).
- Данные: РЕАЛЬНЫЕ (labels=2).
- Вердикт: Работает — да. Данные — реальные. 🟢
  - Оговорка: кнопка «Фильтр» — ⚪ только UI.

---

### Дистрибуция → Доставка (файл: pages/delivery/index.tsx:14)
- Путь: `/delivery` · Доступ (ROUTE_ROLES): admin, manager, label, artist.
- **КРИТИЧНО — рассинхрон фронт/бэк:** фронт разрешает роут всем ролям, НО бэкенд-эндпоинт `GET /api/deliveries` смонтирован под `adminOnly` + `requireManagerPermission("distribution")` (routes/index.ts:140). Подтверждено: `router.use("/deliveries", adminOnly, ...)`. Значит **artist/label, зайдя на /delivery, получат 403** от `useListDeliveries`, увидят пустую/сломанную таблицу без внятной ошибки (isLoading→нет данных). Обработчик — delivery.ts:40 `router.get("/deliveries")`.
- Элементы:
  - Поле поиска (`searchQuery`) — клиентская фильтрация по releaseName/target.
  - Кнопка «Новая доставка» (Send) — **БЕЗ onClick, декоративная** (строка 34). Заглушка UI.
  - Таблица: колонки Релиз (releaseName), Целевой DSP (target), DDEX-версия (ddexVersion || N/A), Дата (createdAt), Статус (StatusBadge + tooltip errorMessage), Действия. Источник — `useListDeliveries`.
  - Кнопка «Повторить» (RefreshCw, title=t.delivery.retry) в каждой строке — **БЕЗ onClick** (строка 108), хотя бэкенд `POST /api/deliveries/:id/retry` РЕАЛЬНО существует (delivery.ts:78, обновляет статус failed→queued). Фронт не вызывает его → нерабочая кнопка.
- Бэкенд: `GET /api/deliveries` (delivery.ts:40), `POST /api/deliveries/:id/retry` (delivery.ts:78) → таблица `deliveries` (n_live_tup=7).
- Данные: РЕАЛЬНЫЕ для admin/manager (deliveries=7); для artist/label — 403 (нет доступа).
- Вердикт: Работает — частично (только просмотр для admin/manager; кнопки создания и повтора не подключены). Данные — реальные (но недоступны для label/artist). 🔴 (по кнопкам-заглушкам) / 🟢 (список для админа).

---

### Дашборд (файл: pages/dashboard.tsx:31)
- Путь: `/` · Доступ (ROUTE_ROLES): admin, manager, label, artist. Все виджеты scoped по роли в бэкенде (getDataScope).
- Заголовок с бейджем scope (orgName/имя) + бейдж «мои данные» для label/artist.

**KPI-ряд (5 карточек, dashboard.tsx:95):** Выручка/Стримы/Артисты/Релизы/Активные доставки. Источник — `useGetDashboardSummary` → `GET /api/dashboard/summary` (dashboard.ts:96), агрегаты из `artists`, `releases`, `tracks`, `usage_reports`, `payouts`. Данные — РЕАЛЬНЫЕ, но streams/revenue из `usage_reports` (ПУСТА, n_live_tup=0) → стримы=0, выручка из transactions. 🟡 частично пусто.

**OpsKpiRow (admin/manager, dashboard.tsx:309):** fetch `GET /api/dashboard/ops-kpis` (dashboard.ts:762) — Delivered/Failed/Dispute/Takedown/Review/Users/Contracts. `if(!k) return null` — при ошибке ряд молча исчезает. Данные — РЕАЛЬНЫЕ (deliveries/releases/users). 🟢/🟡.

**FinanceKpiRow (admin/manager, dashboard.tsx:282):** fetch `GET /api/dashboard/finance-kpis` (dashboard.ts:705) — Ожидают выплаты/К выплате/Fraud alerts/Претензии. Источник — payouts, fraud_alerts (fraud_alerts ПУСТА=0). 🟡.

**PerformanceOverviewCard (dashboard-sections.tsx:689):** график Area (переключатель Стримы/Доход) + список DSP. useQuery `/api/dashboard/streams-by-month` (dashboard.ts:853, из `usage_reports` ПУСТА) + `/api/dashboard/top-dsp` (dashboard.ts:346, из usage_reports). Переключатель Стримы/Доход — рабочий (локальный state). Popover «Источники» — статичный список текста (хардкод описания Broma16/CSV/UGC). Данные — РЕАЛЬНЫЙ эндпоинт, но usage_reports=0 → «Нет данных». 🟡.

**Recent releases (bar chart, dashboard.tsx:151):** `useGetDashboardReleasesByStatus` → `/api/dashboard/releases-by-status` (dashboard.ts:325, из `releases`=6). РЕАЛЬНЫЕ. 🟢.

**Recent activity (dashboard.tsx:184):** `useGetDashboardRecentActivity` → `/api/dashboard/recent-activity` (dashboard.ts:175). Источник — activity_log (=7)/audit_log(=13). РЕАЛЬНЫЕ. 🟢.

**TopDspCard ×2 (streams+revenue, dashboard-sections.tsx:71):** `/api/dashboard/top-dsp` из usage_reports(=0). 🟡 пусто.

**TopTerritoriesCard (dashboard-sections.tsx:159):** `/api/dashboard/top-territories` (dashboard.ts:381) из usage_reports.countryCode(=0). 🟡 пусто.

**LatestReleasesGridCard (dashboard-sections.tsx:227):** `/api/dashboard/latest-releases` (dashboard.ts:409) из `releases`(=6). 🟢.

**TopArtistsCard (dashboard-sections.tsx:349):** `/api/dashboard/top-artists` (dashboard.ts:200) из usage_reports(=0) + artists. Стримы=0. 🟡.

**RoyaltySummaryCard (dashboard-sections.tsx:411):** `/api/dashboard/royalty-summary` (dashboard.ts:538) из `transactions`(=7). Total/DSP/Publishing/MTD + топ артистов/лейблов/релизов. РЕАЛЬНЫЕ (transactions есть). 🟢.

**PlaylistPlacementsCard (dashboard-sections.tsx:838):** `/api/dashboard/playlist-placements` (dashboard.ts:895) из `playlist_stats` (ПУСТА=0). 🟡 пусто.

**UgcMapCard (dashboard-sections.tsx:922):** `/api/dashboard/ugc-timeseries` (dashboard.ts:940) из `ugc_metrics` (ПУСТА=0). Мини-графики views/videos/likes. 🟡 пусто.

**ArtistsStatsTableCard (admin/manager, dashboard-sections.tsx:604):** `/api/dashboard/artists-table` (dashboard.ts:652) — artists + usage_reports LEFT JOIN. Артисты видны (=4), стримы/доход 0. 🟡 частично.

**UsersRankingCard (admin/manager, dashboard-sections.tsx:992):** `/api/dashboard/users-ranking` (dashboard.ts:998) из `users`(=4). РЕАЛЬНЫЕ. 🟢.

**PublishingKpiRow + LatestPublishingWorksCard (admin/manager, dashboard.tsx:576/352):** fetch `/api/dashboard/publishing-kpis` (dashboard.ts:803) и `/api/publishing/works`. Таблица works с поиском/статус-фильтром/пагинацией (реальные, publishing_works=3). Чекбоксы «выбрать все»/строк и кнопка «Filters» + иконка MoreVertical — **БЕЗ обработчиков** (декоративные). Данные — РЕАЛЬНЫЕ. 🟢 (данные) / ⚪ (checkbox/Filters/MoreVertical).

- Вердикт дашборда: Работает — да (архитектура и scope корректны). Данные — смешанные: реальны там, где таблицы наполнены (releases, transactions, users, publishing_works, artists, activity_log), и «Нет данных» там, где источники пусты (usage_reports, playlist_stats, ugc_metrics, fraud_alerts). 🟡 (доминирует «реально-но-часто-пусто» из-за пустого usage_reports — ключевого источника стримов).

---

### Топбар / Шапка (файл: components/layout.tsx:28)
- Присутствует на всех авторизованных страницах (обёртка Layout).
- Элементы шапки:
  - **Баннер имперсонизации** (layout.tsx:67) — виден если `impersonator` есть; показывает «Вы вошли как X (admin: Y)» + кнопка «Вернуться к админу» → `stopImpersonating()` → `POST /api/auth/stop-impersonate` (auth.ts:330), toast + navigate("/users"). РЕАЛЬНО. 🟢.
  - **Кнопка «Создать релиз»** (layout.tsx:94) — только artist/label, navigate("/releases/new"). Рабочая (навигация).
  - **Переключатель языка** (Globe dropdown, layout.tsx:100) — EN/RU, `setLang` (useLang, локальный i18n-контекст, не API). Рабочий. 🟢.
  - **NotificationsPopover** (layout.tsx:126) — см. ниже.
  - **Блок пользователя** (layout.tsx:128): имя + бейдж роли (ROLE_LABELS/ROLE_COLORS). Аватар с fallback-инициалами (AvatarImage src="" — реальной картинки нет, всегда fallback).
  - **Dropdown профиля** (layout.tsx:138):
    - Header: имя + `Account# {accountNumber}` — **ХАРДКОД `const accountNumber = "28301"` (layout.tsx:61)**. Один и тот же номер для ВСЕХ пользователей, не из БД/API. 🔴.
    - «Мой профиль» → navigate("/profile"). Рабочая.
    - «Оплата и налоги» → navigate("/payouts"). Рабочая.
    - «Настройки» → navigate("/settings"). Рабочая.
    - «Сменить аккаунт» (Repeat) — только admin и !impersonator → открывает ImpersonateDialog. Рабочая.
    - Блок «Предпочтения»: select языка (дублирует переключатель) + Switch тёмной темы (`darkMode`, localStorage "theme", toggle класса на <html>). Рабочий, без API.
    - «Выйти из системы» → `logout()` (auth-контекст → `POST /api/auth/logout`). Рабочая.
- Данные: РЕАЛЬНЫЕ (user из /auth/me), кроме accountNumber (хардкод).
- Вердикт: Работает — да. 🟢, но 🔴 маркер на хардкод accountNumber="28301".

---

### Топбар → Уведомления (файл: components/notifications-popover.tsx:51)
- Элементы:
  - Кнопка-колокол с бейджем непрочитанных (`useGetUnreadNotificationCount` → `GET /api/notifications/unread-count`, notifications.ts:101; refetch 60с).
  - SSE-стрим `useNotificationStream` → `GET /api/notifications/stream` (notifications.ts:29) — real-time инвалидация кэша.
  - При открытии — `useListNotifications({limit:30})` → `GET /api/notifications` (notifications.ts:65, scoped на текущего юзера) + polling 10с.
  - «Прочитать все» → `useMarkAllNotificationsRead` → `POST /api/notifications/read-all` (notifications.ts:111).
  - Клик по уведомлению → `useMarkNotificationRead` → `POST /api/notifications/:id/read` (notifications.ts:122) + переход по `n.link`.
  - Иконки по типу (TYPE_ICONS — локальный словарь эмодзи, оформление, не данные).
- Бэкенд: все эндпоинты `/notifications/*` РЕАЛЬНЫ → таблица `notifications`.
- Данные: **ПУСТО** — таблица `notifications` n_live_tup=0. UI покажет empty-state «Нет уведомлений», бейдж=0.
- Вердикт: Работает — да (полностью подключено, SSE+polling+mark-read). Данные — ПУСТО. 🟡 реально-но-пусто.

---

### Топбар → Имперсонизация (файл: components/impersonate-dialog.tsx:29)
- Открывается из dropdown профиля «Сменить аккаунт» (только admin, !impersonator).
- Элементы:
  - При open — `fetch("/api/users?limit=200")` (users route), фильтрует role!=="admin".
  - Поле поиска (по имени/email/роли, клиентская фильтрация).
  - Список сгруппирован по ролям (manager/label/artist), ROLE_LABELS/ROLE_COLORS.
  - Клик по пользователю → `impersonate(u.id)` (auth-контекст → `POST /api/auth/impersonate`, auth.ts:248) → toast + navigate("/"). Неактивные (status!=="active") задизейблены.
  - Кнопка «Отмена» → закрыть.
- Бэкенд: `GET /api/users` + `POST /api/auth/impersonate` (auth.ts:248, регенерирует сессию, пишет audit_log) РЕАЛЬНЫ. Выход — `POST /api/auth/stop-impersonate` (auth.ts:330).
- Данные: РЕАЛЬНЫЕ (users=4).
- Вердикт: Работает — да, полноценная имперсонизация с session regenerate и аудитом. 🟢.

---

### Авторизация → Вход (файл: pages/login.tsx:384)
- Путь: `/login` (публичный).
- Элементы:
  - Canvas-визуализатор музыки (декоративный, чистый рендер, не данные).
  - Логотип `/tajikmusic-logo.png` (статичный ассет).
  - Форма: email (обяз.), password (обяз., toggle показа). Submit → `login(email,password)` (auth-контекст → `POST /api/auth/login`, auth.ts:83). Успех → navigate("/").
  - Ссылка «Подать заявку» → /signup.
  - **DEMO-аккаунты** (login.tsx:514) — видны только `import.meta.env.DEV`. Массив `DEMO_ACCOUNTS` (4 роли, хардкод email/пароли admin123 и т.п.). Клик → `loginAs(role)` (демо-логин). 🔴 хардкод учёток (но огорожено DEV-флагом — не попадёт в прод).
- Бэкенд: `POST /api/auth/login` (auth.ts:83, loginLimiter) → таблица `users`.
- Данные: РЕАЛЬНЫЕ.
- Вердикт: Работает — да. 🟢. Demo-панель — 🔴 хардкод, но только в DEV.

---

### Авторизация → Регистрация/Заявка (файл: pages/signup.tsx:15)
- Путь: `/signup` (публичный).
- Элементы:
  - Переключатель типа (Артист/Лейбл) — кнопки-табы (локальный state).
  - Поля: Имя/Название (обяз., 2–120), Email (обяз.), Телефон, Страна (Select — **хардкод-словарь** 6 стран tj/ru/uz/kz/kg/es, signup.tsx:161). Для лейбла доп.: Юр.название, ИНН.
  - Textarea сообщение (≤2000).
  - Чекбокс согласия на обработку ПД (обяз., иначе ошибка).
  - Кнопка «Отправить заявку» → `POST /api/signup-requests` (signup.ts:65, rate-limit 3/час/IP). Успех → экран подтверждения с requestId.
- Бэкенд: `POST /api/signup-requests` (signup.ts:65) → таблица `signup_requests` (ПУСТА=0, но эндпоинт пишет реально).
- Данные: РЕАЛЬНЫЕ (запись создаётся; таблица пока пуста). Опции стран — хардкод.
- Вердикт: Работает — да. 🟢 (форма+сабмит реальны). 🟡 таблица пуста / 🔴 хардкод списка стран.

---

### Авторизация → Приём приглашения (файл: pages/invite.tsx:26)
- Путь: `/invite/:token` (публичный, по токену).
- Элементы:
  - При загрузке — `GET /api/label-members/invite/:token` (label-members.ts, publicRouter) → показывает email/имя/роль/лейбл.
  - Экраны: загрузка (Loader), ошибка (невалидный токен), форма, успех.
  - Форма: email (disabled/readonly), Имя (редактируемое), Пароль (обяз., ≥8). Submit → `POST /api/label-members/invite/:token/accept` (label-members.ts:212). Успех → navigate("/login") через 1.8с.
  - Предупреждение если accountExists (пароль будет обновлён).
- Бэкенд: публичные `GET/POST /api/label-members/invite/:token[/accept]` РЕАЛЬНЫ (мониторятся через labelMembersPublicRouter, index.ts:64) → таблица `label_members` (ПУСТА=0).
- Данные: РЕАЛЬНЫЕ (эндпоинты рабочие); приглашений пока нет (label_members=0).
- Вердикт: Работает — да. 🟡 реально-но-пусто (нет приглашений в БД).

---

### 404 (файл: pages/not-found.tsx:4)
- Путь: fallback-роут.
- Элементы: статичная карточка «404 Page Not Found» + текст «Did you forget to add the page to the router?».
- **ЗАМЕЧАНИЯ:** (1) текст на английском (весь остальной UI на RU), не через i18n; (2) стиль `bg-gray-50`/`text-gray-900` — светлая тема, не совпадает с тёмным дизайном приложения (шаблонная заглушка из стартера).
- Данные: нет.
- Вердикт: Работает — да (рендерится). ⚪ шаблонная заглушка, не локализована, не в стиле.

---

## ПРОБЛЕМЫ (Артисты/Лейблы/Доставка/Дашборд/Топбар/Авторизация)

1. **Рассинхрон доступа к Доставке (фронт vs бэк)** — `permissions.ts:21` даёт `/delivery` всем ролям, но `routes/index.ts:140` монтирует `/deliveries` под `adminOnly`. Почему проблема: artist/label открывают страницу и получают 403 без внятного сообщения (пустая таблица). Предлагаю: либо убрать label/artist из ROUTE_ROLES для `/delivery`, либо скрывать пункт меню/показывать явный «Нет доступа», либо (если задумано) снять adminOnly и сделать scope по владельцу.

2. **Кнопка «Повторить» доставку не подключена** — `pages/delivery/index.tsx:108` (RefreshCw) без onClick, хотя бэкенд `POST /api/deliveries/:id/retry` (delivery.ts:78) реально работает. Почему проблема: рабочий эндпоинт без UI. Предлагаю: повесить mutation на кнопку (enabled только для status==="failed").

3. **Кнопка «Новая доставка» — заглушка** — `pages/delivery/index.tsx:34`, без onClick. Предлагаю: подключить к flow создания доставки или скрыть до реализации.

4. **Хардкод номера счёта в шапке** — `layout.tsx:61` `const accountNumber = "28301"` показывается всем как `Account# 28301`. Почему проблема: фейковые персональные данные, одинаковы для всех. Предлагаю: брать реальный account/id из `user` (API /auth/me) или убрать строку.

5. **Кнопки «Фильтр» на Артистах и Лейблах — декоративные** — `artists/index.tsx:78`, `labels/index.tsx:75` без onClick. Предлагаю: реализовать панель фильтров либо убрать иконку.

6. **Ключевой источник дашборда `usage_reports` пуст** — большинство виджетов стримов/доходов/территорий/UGC/плейлистов (`streams-by-month`, `top-dsp`, `top-territories`, `top-artists` streams, `ugc-timeseries`, `playlist-placements`) показывают «Нет данных», т.к. таблицы usage_reports/ugc_metrics/playlist_stats/fraud_alerts = 0. Эндпоинты реальны, данных нет. Предлагаю: наполнить через импорт DSP-отчётов/Broma16 (это не баг кода, а пустая БД — отметить для сидинга).

7. **Таблица `notifications` пуста** — `notifications-popover.tsx` полностью подключён (SSE+polling+mark-read), но notifications=0 → всегда пустой список и бейдж 0. Предлагаю: генерировать нотификации на событиях (approve/reject релиза, payout) — часть логики, вероятно, уже пишет, но таблица пуста.

8. **Декоративные контролы в таблице Publishing на дашборде** — `dashboard.tsx` чекбоксы «выбрать все/строку», кнопка «Filters», иконка MoreVertical без обработчиков. Предлагаю: реализовать или убрать, чтобы не создавать ложное ожидание bulk-действий.

9. **Страница 404 — шаблонная, нелокализованная, вне стиля** — `not-found.tsx` (англ. текст, `bg-gray-50`). Предлагаю: перевести через i18n и привести к тёмному дизайну.

10. **Demo-аккаунты с хардкод-паролями** — `login.tsx:11` (admin123/manager123/...). Огорожено `import.meta.env.DEV`, в прод не попадёт, но стоит убедиться, что демо-юзеры не существуют в проде и что loginAs недоступен на бэке в prod.


---

# 7. КЛЮЧЕВЫЕ ПОТОКИ ДАННЫХ (сквозные сценарии)

### 7.1. Создание и выпуск релиза (полный путь)
1. **Черновик:** `/releases/new` (`new.tsx`) → `POST /api/releases` → строка в `releases` (status=`draft`).
2. **Мастер** на `/releases/:id/edit` (`components/release-wizard/`) — 4 шага:
   - **details** — метаданные (название, тип, дата, лейбл, жанр/язык). Жанр/язык/страна — из словарей **Broma16** (`broma16_dictionaries`, 768 строк, реально); при пустом словаре — хардкод-фолбэки из `types.ts`.
   - **tracks** — треки, аудио-загрузка (`assets`), ISRC. ⚠ **ISRC генерируется клиентским `Math.random()`** (`track-card.tsx:29-33`), хотя есть серверный `POST /api/catalog/codes/isrc`.
   - **delivery** — выбор аутлетов (`releases.broma16DistributionOutlets` из словаря выходов Broma16) / прямые DSP.
   - **submission** — валидация → `POST /releases/:id/submit` → status=`pending_review`.
3. **Модерация** (см. 7.2) → одобрение → status=`approved`.
4. **Публикация в Broma16 (ROD):** кнопка **только на карточке релиза** `/releases/:id` (`components/broma16-push-card.tsx`, рендер `[id].tsx:640`, видна только роли-модератору). `POST /api/broma16/releases/:id/push` — **требует status=approved**, иначе 409. Джобы фиксируются в `broma16_push_jobs` (сейчас пусто).
> ⚠ **Важно про местоположение:** кнопки Broma16-push **нет** в разделе «Дистрибуция». Путь оператора: Каталог → релиз → карточка Broma16.

### 7.2. Модерация релиза
`/distribution` → вкладка **Модерация**: список `GET /distribution/moderation` → модалка `GET /distribution/moderation/:id/details` (`moderation-detail-dialog.tsx`) → решение `PATCH /releases/:id/status` (`approved`/`rejected`/`parked`) + «Fail & Return». Всё реально, таблица `releases`=6.

### 7.3. ACRCloud (проверка на плагиат) — две точки входа
1. Вкладка **ACRCloud** (`/distribution` → acr): поиск релиза → «Запустить» → `POST /distribution/acr/scan`.
2. Модалка модерации, карточка `AcrCard`: «Отправить в ACRCloud» → `POST /distribution/acr/drop` + ручной вердикт `POST /distribution/acr/manual-result`.
Результаты → таблица `acr_checks` (сейчас **0** → блок ACR на карточке релиза пуст). Требует настройки ACRCloud-credentials. Неиспользуемые эндпоинты: `/acr/scan-full`, `/musicbrainz/check-isrc`.

### 7.4. Финансы: роялти и выплаты
- **Формула роялти (реальная):** `balance = max(0, gross × (1 − fee) − paidOut)`. **НО `fee` = хардкод 15%** (`PLATFORM_FEE_RATE`, `lib/finance.ts:3`) — правила из `commission_rules` в расчёте **не участвуют** (`royalties.ts`).
- **«Стримы»** в KPI/колонках — не факт, а производная `gross / 0.0035` (`royalties.ts:100-101`). Вводит в заблуждение.
- **Статусы стейтментов** (draft/finalized/paid) — вычисляются по возрасту месяца, а не по реальной выплате (`royalties.ts:163`).
- **Выплата:** запрос `POST /payouts` (форма в `royalties/request` или `payouts`) → двухшаговое одобрение админом `POST /finance/payouts/:id/approve` (`finance-extras.ts:85`). `payouts`=4, `transactions`=7 — реально. Есть дублирующий `PATCH /payouts/:id/approve` (`finance.ts:514`), фронт им не пользуется.

### 7.5. Импорт доходов (revenue ingestion)
`/finance/import` — загрузка CSV → `ingestion_imports`; несопоставленные строки → `/finance/unmatched` (`ingestion_unmatched`). Обе таблицы + `usage_reports` сейчас пусты → вся стриминговая аналитика (`/analytics` streams/revenue/geo/tracks) и UGC пустые. Механика реальна, нужен импорт/сидинг.

### 7.6. Изоляция данных издательства (publishing)
`GET /api/publishing/works` и связанные — фильтруют по `track → release.labelId` **ИЛИ** `track.artist` в ростере лейбла (`publishing.ts`). Изоляция по лейблу реальна и применяется на всех эндпоинтах.
> ⚠ Комментарий в `routes/index.ts` («no per-label scoping») — **устаревший и ложный**; доверять обработчику.

---

# 8. СВОДКА ПРОБЛЕМ (консолидировано, по приоритету)

> Полные пер-раздельные списки — в конце каждого раздела §6 («## ПРОБЛЕМЫ …»). Ниже — агрегат самого важного.

### 8.A. Рассинхрон доступа фронт ↔ бэк (🔴 приоритет — ломается для ролей)
| # | Где | Что происходит |
|---|---|---|
| A1 | `/delivery` (permissions.ts все роли) vs `GET /api/deliveries` adminOnly (`index.ts:140`) | **артист/лейбл → 403**. У артиста «Доставка» **есть в сайдбаре** → гарантированно битый пункт. |
| A2 | `/catalog/codes` (permissions.ts:51 даёт `label`) vs `/api/catalog` весь adminOnly (`index.ts:174`) | лейбл → 403 на генерации кодов. |
| A3 | `/rights` (все роли) vs бэк: dsp-deals/content-id/territories = admin/manager, freeze/history = adminOnly | лейбл/артист открывают 5 из 7 вкладок и видят 403/пустоту. |
| A4 | `POST/PATCH /rights/conflicts` — **без `requireRole`** (`rights.ts:328,362`) | лейбл/артист могут менять конфликты прямым API-вызовом (UI прячет кнопки, сервер — нет). |
| A5 | Publishing → «В Broma16» видна лейблу vs `publishing.ts:276` требует admin/manager | лейбл → 403 по клику. |
| A6 | `/finance/unmatched` отсутствует в `ROUTE_ROLES` | доступ держится только на клиентском guard; артист наследует доступ к `/finance`. |

### 8.B. Моки / хардкод, вводящие в заблуждение (🔴)
- **ISRC клиентским `Math.random()`** вместо серверного реестра — `track-card.tsx:29-33` (риск коллизий, коды не registry-safe).
- **Хардкод номера счёта `"28301"`** для всех пользователей — `layout.tsx:61` («Account# 28301»), фейковые персданные.
- **Комиссии не влияют на расчёт**: `commission_rules` пишутся, но роялти считаются по фикс-15% — UI-текст «применяется при расчёте» ложный.
- **«Стримы» — производная от денег** (`gross/0.0035`), а не реальные стримы.
- **Статусы стейтментов фиктивные** (по возрасту месяца).
- **DDEX Party ID захардкожен** (DPID/ERN/ISRC/UPC readOnly, `settings TabDdex:943-958`) — критичные для реальной DDEX-доставки идентификаторы статичны.
- **USERS→Роли** — хардкод-описание прав (`index.tsx:118-185`), не связано с реальным RBAC.
- **Такедаун-страница**: релиз свободным текстом + хардкод `ALL_DSPS` (`takedown.tsx:38`), дублирует корректный `POST /releases/:id/request-takedown`.
- **Subgenre = «—»** захардкожен (`[id].tsx:490`), игнорит `release.subgenre`.
- **FAQ/контакты/график** хардкод в Поддержке (`support/index.tsx:32,336`).
- **Словари стран** захардкожены в 3 местах и **рассинхронены** (в профиле нет `kg`, в bank/tax есть).
- **DSP-coverage карта** хардкод (`dsp-picker.tsx:25`), не из `dsp_catalog`.
- **Scheduled-таб** всегда непуст из-за серверного хардкода `SYSTEM_WORKERS`, статус системных задач фиктивный.

### 8.C. Кнопки/вкладки-заглушки (⚪ только UI)
- Dropdown **«Deliver»/«Delete»** в списке релизов — noop (`releases/index.tsx:363-369`).
- **«Новая доставка»** и **«Повторить»** — без onClick (`delivery/index.tsx:34,108`), хотя `POST /deliveries/:id/retry` реально существует → эндпоинт без UI.
- **Automation → Workflow Rules** — редирект-заглушка на `/communications`, функционала нет.
- **Communications → Inbox** — редирект-заглушка на `/support`, контента нет.
- **Промо-ассеты «Скачать»** — `toast`-заглушка (`assets.tsx:155`), файла/URL нет.
- **Личные уведомления** пишутся только в `localStorage` (`settings PersonalNotificationsTab`), кнопка «Сохранено» вводит в заблуждение.
- **Кнопки «Фильтр»** без onClick — Артисты (`:78`), Лейблы (`:75`), Выплаты (`:175`).
- **2FA** — switch disabled, «Скоро» (честно помечено, но не работает).

### 8.D. Латентные баги контракта/логики (🟠)
- **Assets: контракт не совпадает** — фронт ждёт `j.assets/j.items`, бэк отдаёт голый массив (`assets.ts:157`) → список ассетов и вкладка «Видео» останутся пустыми даже при данных (тихая потеря).
- **KPI дистрибуции считаются по первым 50 записям** (`distribution/index.tsx:453`) → занижены при >50 сообщениях.
- **UPC-генератор** падает 409 без `upcCompanyPrefix` (`catalog.ts:176`), ошибка непрозрачна.
- **CRM Обзор** — дубль-плитка «Релизов всего» == «Релизов» (`crm/index.tsx:230,235`).
- **`window.location.reload()`** после approve/reject выплат (`payouts/index.tsx:405,424`) вместо инвалидации кэша.
- **Дубликаты** выводятся сырым `JSON.stringify` (`duplicates.tsx:58`) — непригодно оператору.

### 8.E. Дублирование и тех-долг (🟡)
- Дублирующие реализации **signups/kyc** (вкладки USERS vs `/admin/*`) с расходящимися значениями `KycStatus`.
- Дублирующий **payout-approve** роут (PATCH vs POST).
- Две несовпадающие **формы запроса выплаты** (разные методы/валюты).
- **Newsletter-шаблон ~80 строк inline-HTML** в компоненте (`communications/index.tsx:396`) — должен жить в `email_templates`.
- **ManualAckTester** (dev-инструмент с хардкод-XML) виден в проде (`distribution/index.tsx:723`).
- **Content ID** — ручной CRUD без реальной интеграции с YouTube CMS (может имитировать интеграцию).
- **404-страница** вне дизайна (англ. текст, светлый фон).

### 8.F. Массовая пустота из-за отсутствия данных (🟡 — НЕ баги кода)
Эндпоинты и UI реальны, но таблицы пусты, поэтому экраны выглядят «нерабочими»:
- **`usage_reports`=0** → вся стриминг-аналитика (Streams/Revenue/Geo/Tracks + 4 KPI) пуста.
- **`playlist_stats`=0, `tiktok_stats`=0** → у лейбла/артиста аналитика (их единственные 2 вкладки) полностью пуста.
- `ugc_metrics`=0, `acr_checks`=0, `takedown_requests`=0, `transfer_imports`=0.
- `rights_holders/rights_conflicts/dsp_deals/content_id_assets`=0 → весь раздел «Права» пуст.
- `smart_links/presave_campaigns/promo_assets`=0 → маркетинг пуст.
- `support_tickets`=0, `kyc_documents`=0, `notifications`=0, `signup_requests`=0.
- `email_templates/campaigns/automation_triggers/internal_notes`=0 → коммуникации/автоматизация пусты.
- `api_keys/webhooks/label_members`=0, `platform_settings`=0 (настройки показывают дефолты как «реальные»).
> **Рекомендация:** засеять демо-данные (Task #2/#3) и настроить интеграции (Spotify/ACRCloud/Broma16/SMTP/PRO/UPC-prefix) — это устранит бóльшую часть «пустых экранов» без единой правки кода.

---

# 9. ИТОГ

- **Полнота охвата:** обойдены все **55 роутов**, **3 ролевых меню**, **~110 вкладок верхнего уровня** + ~24 под-фильтра + шаги мастера релиза, сверенные с **50 файлами бэкенд-роутов** и фактическим состоянием **65 таблиц** БД. Контрольные числа пользователя подтверждены: **Настройки — 19 вкладок**, **Права — 7**, **Автоматизация — 6**.
- **Главный вывод:** приложение **преимущественно настоящее** — почти каждый экран ходит в реальный эндпоинт и реальную таблицу. «Пустые» экраны в подавляющем большинстве — это **отсутствие данных/настройки интеграций** (41 из 65 таблиц пусты), а не заглушки.
- **Что реально требует правок кода** (не сидинга): рассинхроны доступа фронт↔бэк (§8.A) — приоритет №1 (ломается для лейбла/артиста); адресные моки/хардкоды, вводящие в заблуждение (§8.B, особенно ISRC, комиссии, DDEX-идентификаторы, номер счёта); кнопки/вкладки-заглушки (§8.C); латентный баг контракта ассетов (§8.D).
- **Правок в этом аудите не вносилось** — только анализ, согласно заданию.


