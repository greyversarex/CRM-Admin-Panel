# Аудит кодовой базы Tajik Music Distribution CRM
**Дата:** 02 мая 2026  
**Методология:** Глубокое чтение исходного кода (~60 frontend-страниц, ~45 API-маршрутов, схема БД из 15 миграций), сравнение с ТЗ (xlsx, 2 листа: Dashboard + Admin Panel 12 секций).  
**Стек:** TypeScript monorepo, Express 5, React 19 + Vite + Tailwind + shadcn/ui, Drizzle ORM + PostgreSQL, pnpm workspaces.

---

## Итоговая таблица критичности

| # | Секция ТЗ            | Реализация | Критических заглушек | Оценка |
|---|----------------------|-----------|----------------------|--------|
| 1 | Dashboard            | Полная     | 0                    | ✅ |
| 2 | Distribution         | Частичная  | 2                    | ⚠️ |
| 3 | Catalog              | Полная     | 0                    | ✅ |
| 4 | Users / KYC          | Полная     | 0                    | ✅ |
| 5 | Analytics            | Частичная  | 2                    | ⚠️ |
| 6 | Finance              | Почти полная | 1                  | ⚠️ |
| 7 | Rights               | Полная     | 0                    | ✅ |
| 8 | Publishing           | Условная   | 1                    | ⚠️ |
| 9 | CRM                  | Полная     | 0                    | ✅ |
|10 | Communications       | Условная   | 1                    | ⚠️ |
|11 | Automation           | Частичная  | 2                    | ⚠️ |
|12 | Settings             | Частичная  | 3                    | ⚠️ |
| — | Profile (Профиль)    | Частичная  | 1                    | ⚠️ |
| — | Marketing            | Заглушка   | 2                    | 🔴 |

---

## Секция 1 — Dashboard (Дашборд)

**Файлы:** `pages/dashboard.tsx`, `routes/dashboard.ts`

### Что реализовано
- KPI-карточки (треки, артисты, релизы, пользователи, выручка, ожидающие релизы) — реальные SQL-запросы через Drizzle ORM.
- График стримов за 6 месяцев из таблицы `usage_reports` (агрегат по периодам).
- Секция «Последние релизы» — реальный JOIN `releases → tracks count`.
- Блок топ-10 треков — реальный запрос из `usage_reports` с сортировкой по streams.
- DDEX-очередь на дашборде — реальный счётчик из `ddex_deliveries`.
- **Изоляция данных по ролям:** admin/manager видят все данные; label — только свои; artist — только свои треки. Реализовано через `getDataScope()`.

### Проблемы
- Нет. Секция соответствует ТЗ.

---

## Секция 2 — Distribution (Дистрибуция)

**Файлы:** `pages/distribution/index.tsx`, `routes/delivery.ts`, `routes/distribution-extras.ts`, `routes/ddex.ts`

### Что реализовано
- DDEX-конвейер: создание XML-сообщений (ERN 4.1/4.3), очередь доставки (`ddex_deliveries`), retry-механизм, статусы `pending/sent/acked/failed`.
- Системный воркер `delivery-worker` (запускается при старте сервера, описан в `src/workers/`).
- Ack-poller (`ack-poller`) — опрос SFTP-ящиков на входящие ack от DSP.
- Диспетчер webhook (`webhook-dispatcher`) — доставка событий подписчикам.
- Takedown-запросы: полный CRUD (`routes/takedowns.ts`), страница `/releases/takedown`.
- ACR-сканирование: реальная интеграция с ACRCloud API (HMAC-SHA1, multipart, SSRF-guard).
- Диспуты (конфликты прав при дистрибуции): чтение из `rights_conflicts`.

### Проблемы

#### 🔴 КРИТИЧНО — Pre-save links: домен не существует
**Файлы:** `routes/marketing.ts` стр. 36, 80; `pages/marketing/presave.tsx`  
Все созданные кампании генерируют ссылку вида `presave.tajikmusic.com/<slug>`. Этот домен **не существует и нигде не настроен**. Нет ни одного публичного маршрута на бэкенде, который обрабатывал бы переходы по этому URL. Пользователь видит ссылку, копирует её, отправляет фанатам — ссылка ведёт в никуда (404). Аналогично для Smart Links (`link.tajikmusic.com/<slug>`).

#### ℹ️ ЗАМЕЧАНИЕ (не баг) — ACRCloud: требует реальные credentials, фиктивный результат не возвращается
**Файл:** `routes/distribution-extras.ts` стр. 88–91  
Это **правильное поведение**: без настроенных ключей система честно возвращает `HTTP 503` и не делает вид, что проверила трек. Возвращать фиктивный "чисто" было бы намного хуже — можно пропустить реальное нарушение авторских прав. ACRCloud — внешний сервис, требующий договора с acrcloud.com.  
**Единственный UX-пробел:** при первом входе в раздел нет дружелюбного онбординга ("Зарегистрируйтесь на acrcloud.com → скопируйте ключи → Settings → Интеграции → ACRCloud"). Сейчас пользователь видит просто техническое сообщение об ошибке без инструкции.

#### ⚠️ СРЕДНЕ — Вкладка Disputes (Споры) в Distribution: только чтение
**Файл:** `pages/distribution/disputes-tab.tsx` (упоминалось ранее в аудите)  
Вкладка отображает конфликты из `rights_conflicts`, но не содержит кнопок «Решить», «Эскалировать», «Отклонить». Разрешение конфликтов возможно только через раздел Rights → Конфликты. Несоответствие UX ожиданиям ТЗ (у пользователя в Distribution должен быть полный контроль).

---

## Секция 3 — Catalog (Каталог)

**Файлы:** `pages/catalog/`, `routes/catalog.ts`, `routes/catalog-bulk.ts`

### Что реализовано
- Обзор каталога: треки, релизы, артисты с поиском и пагинацией.
- Bulk-edit треков: массовое обновление метаданных через API.
- Управление ассетами: загрузка аудио/обложек через защищённые HMAC-токены.
- Дубликаты: поиск по ISRC-совпадениям, UI-страница `/catalog/duplicates`.
- Коды (ISRC/EAN): генерация и привязка, страница `/catalog/codes`.
- Transfer/Import: страница `/releases/transfer` + `/releases/transfer/new` для импорта треков из другого дистрибутора.

### Проблемы
- Нет значимых. Секция соответствует ТЗ.

---

## Секция 4 — Users (Пользователи и KYC)

**Файлы:** `pages/users/index.tsx`, `pages/admin/kyc.tsx`, `pages/admin/signups.tsx`, `routes/users.ts`, `routes/kyc.ts`, `routes/signup.ts`

### Что реализовано
- Управление пользователями: CRUD, смена роли, блокировка, reset пароля.
- Регистрация: публичный endpoint `/signup`, поля name/email/password/role/company.
- Система ролей: `admin`, `manager`, `label`, `artist` — разные права через `permissions.ts`.
- KYC (верификация): загрузка документов (passport, id_card, company_reg, tax_cert, bank_statement, other), статусы pending/approved/rejected, файлы хранятся через `ObjectStorageService`.
- Рецензирование KYC администратором: `/admin/kyc` — просмотр документов, одобрение/отклонение с комментарием.
- Приглашения в команду лейбла: `/invite/:token` — реальный flow с JWT-токеном.
- Лог аудита действий: `/admin/audit` — реальные записи из `audit_logs`.

### Проблемы
- Нет значимых. Один из самых полных разделов.

---

## Секция 5 — Analytics (Аналитика)

**Файлы:** `pages/analytics/index.tsx`, `pages/analytics/ugc-tab.tsx`, `pages/analytics/realtime-tab.tsx`, `routes/analytics.ts`, `routes/analytics-extras.ts`

### Что реализовано
- Вкладки: Стримы, UGC, Realtime Alerts, Плейлисты (Spotify), TikTok.
- Данные стримов — из `usage_reports`, реальные запросы с агрегацией по периодам/DSP.
- UGC-сводка (YouTube CMS, TikTok, Meta, Instagram) — хранится в `ugc_reports`, ручной импорт через форму.
- Realtime Alerts: полный CRUD алертов из `realtime_alerts`, разрешение/переоткрытие.
- Spotify Import: реальный вызов Spotify Web API (если настроен), fallback 503 без ключей.

### Проблемы

#### ⚠️ СРЕДНЕ — Artist и Label видят только 2 вкладки без данных
**Файл:** `pages/analytics/index.tsx`  
Пользователи с ролью `artist` или `label` имеют доступ только к вкладкам «Плейлисты» и «TikTok». Оба источника данных зависят от внешних интеграций (Spotify, TikTok Ads API), которые не настроены. Артист фактически видит пустые таблицы. В ТЗ указано, что художник должен видеть свою аналитику по стримам.

#### ⚠️ СРЕДНЕ — UGC: только ручной ввод, нет автоматического сбора
**Файл:** `pages/analytics/ugc-tab.tsx`  
Все данные YouTube CMS, TikTok, Meta, Instagram вводятся **вручную** через форму или CSV. Реального подключения к YouTube Data API, TikTok API, Meta Insights API нет. Кнопка «Импорт из Spotify» работает, но остальные платформы — исключительно ручной ввод, что противоречит ожиданию автоматического сбора из ТЗ.

---

## Секция 6 — Finance (Финансы)

**Файлы:** `pages/finance/index.tsx`, `pages/royalties/index.tsx`, `pages/payouts/index.tsx`, `routes/finance.ts`, `routes/royalties.ts`, `routes/finance-export.ts`

### Что реализовано
- Транзакции: полный список из `transactions`, фильтры по типу/периоду/артисту/лейблу.
- Выплаты: CRUD `payouts`, запросы на выплату, статусы pending/processing/completed/failed.
- Сплиты: управление долями через `splits`, привязка к релизам.
- Экспорт: реальный XLSX/CSV через библиотеку `xlsx` — транзакции и выплаты с учётом прав доступа.
- Импорт: загрузка CSV/Excel отчётов DSP через `/finance/import`, парсинг и матчинг.
- Нераспределённые: `/finance/unmatched` — треки без привязки к финансовым записям.

### Проблемы

#### ⚠️ СРЕДНЕ — Роялти рассчитываются по фиксированной формуле $0.0035/стрим
**Файл:** `routes/royalties.ts`  
Расчёт роялти из streaming-отчётов использует фиксированную ставку **$0.0035 за стрим** для всех DSP. Реальные ставки существенно различаются (Spotify ~$0.003–$0.005, Apple Music ~$0.007–$0.01, Яндекс Музыка — рублёвые). Это приводит к неточным расчётам. Формула зашита в код без возможности настройки через UI.

---

## Секция 7 — Rights (Права)

**Файлы:** `pages/rights/index.tsx`, `routes/rights.ts`, `routes/rights-extras.ts`

### Что реализовано
- Правообладатели: CRUD `rights_holders` (artist, label, publisher, distributor, other), типы прав (master, sync, mechanical, neighboring, all), территории, доли в %.
- Конфликты прав: CRUD `rights_conflicts`, типы (dsp_claim, acr_flag, manual_dispute, territorial_overlap), статусы (open/investigating/resolved/dismissed/escalated), resolve-форма для admin/manager прямо в строке.
- Дополнительные вкладки: DSP-сделки (`dsp-deals-tab`), Content ID (`content-id-tab`), Территории (`territories-tab`), Freeze (`freeze-tab`), История (`history-tab`).
- Сервис MusicBrainz: `services/musicbrainz.ts` — поиск по ISRC, определение конфликтов.

### Проблемы
- Нет значимых. Секция одна из самых проработанных.

---

## Секция 8 — Publishing (Паблишинг)

**Файлы:** `pages/publishing/index.tsx`, `routes/publishing.ts`, `routes/publishing-extras.ts`

### Что реализовано
- Publishing Works: CRUD произведений, поля ISWC, авторы (writers с долями %), PRO-членство.
- Автоопределение конфликтов: `/publishing/conflicts/detect` — дубликаты ISWC, overlapping shares, unclaimed shares.
- Разрешение конфликтов: PATCH с resolutionNote — полноценное.
- PRO Registration: endpoint `POST /publishing/works/:id/register/:pro` для ASCAP, BMI, Songtrust, MLC.

### Проблемы

#### ℹ️ ЗАМЕЧАНИЕ (не баг) — PRO Registration: требует реальный аккаунт в ASCAP/BMI/Songtrust/MLC
**Файл:** `routes/publishing-extras.ts` стр. 111–187  
Архитектура правильная: endpoint формирует CWR-like JSON payload и отправляет POST на реальный API PRO-организации, при ошибке честно возвращает 502/503 и обновляет статус произведения на `failed`. Не делать вид что регистрация прошла — корректно.  
**Суть:** это внешняя зависимость от бизнес-договора с ASCAP/BMI/Songtrust/MLC, а не проблема кода. Без договора endpoint просто не существует. Функция полностью работоспособна при наличии реального аккаунта.  
**Единственный UX-пробел:** кнопка «Зарегистрировать» активна даже без настроенных credentials — пользователь кликает и получает 503 без подсказки где их взять.

---

## Секция 9 — CRM

**Файлы:** `pages/crm/index.tsx`, `routes/crm.ts`

### Что реализовано
- Контакты: CRUD `crm_contacts` (artist, author, label, manager, partner), поиск, фильтры по типу/стране.
- Задачи: CRUD `crm_tasks` с приоритетами (low/medium/high/urgent), статусами, назначением исполнителя, дедлайнами.
- CRM-аналитика (4 вкладки):
  - **Overview** — KPI (треки, артисты, релизы, выручка), pie-чарты релизов по статусам и контактов по типам.
  - **User Activity** — активность пользователей по задачам (всего / завершено / %).
  - **Revenue** — таблица выручки по артистам (royalty, advance, payout, net).
  - **Growth** — помесячный рост артистов, релизов, пользователей.
  - **Funnel** — воронки Release, Delivery, Tasks.
- Все аналитические данные — реальные SQL-запросы из БД.

### Проблемы
- Нет. Секция полностью соответствует ТЗ.

---

## Секция 10 — Communications (Коммуникации)

**Файлы:** `pages/communications/index.tsx`, `routes/communications.ts`, `routes/communications-channels.ts`, `lib/mail.ts`

### Что реализовано
- Шаблоны писем: CRUD `email_templates` (subject, body с переменными), категории.
- Кампании: CRUD `email_campaigns`, связь с шаблоном, статистика (sent, opened, clicked).
- Триггеры: CRUD `email_triggers` — событие → шаблон → автоотправка.
- Каналы: настройка SMS/WhatsApp/Push через `communications_channels`.
- SMTP-отправка: реализована через Nodemailer с поддержкой 3 источников конфигурации (Resend-интеграция, Settings → Notifications → SMTP, env `SMTP_URL`).

### Проблемы

#### ⚠️ СРЕДНЕ — Email фактически не отправляется без SMTP-настройки
**Файл:** `lib/mail.ts` стр. 154–159  
При отсутствии SMTP-конфигурации `sendMail()` возвращает `{ sent: false }` и **только пишет в лог** без уведомления пользователя. В текущей установке (Replit dev) `SMTP_URL` не задан, Resend не настроен — все триггеры и кампании работают "вхолостую": UI показывает успех, письма не доходят. Это создаёт ложное ощущение работы системы.

---

## Секция 11 — Automation (Автоматизация)

**Файлы:** `pages/automation/index.tsx`, `pages/automation/payment-rules-tab.tsx`, `routes/automation.ts`, `routes/automation-extras.ts`

### Что реализовано
- Правила мошенничества: CRUD `fraud_rules` (spike_streams, low_completion, geo_burst, duplicate_play, stream_botting, custom), severity, threshold, window.
- Алерты мошенничества: `fraud_alerts` — просмотр и разрешение (resolve/dismiss с записью пользователя).
- Правила модерации: CRUD `moderation_rules`.
- Правила выплат: CRUD `payment_automation_rules` (вкладка PaymentRules).
- Расписание задач: отображает системные воркеры (delivery-worker, ack-poller, webhook-dispatcher, trigger-evaluator) + правила из БД.
- Workflow-правила: redirect-ссылка в «Коммуникации».

### Проблемы

#### ⚠️ СРЕДНЕ — Системные воркеры — только описательный список, без реального мониторинга
**Файл:** `routes/automation.ts` стр. 47–52  
Список системных задач (`SYSTEM_WORKERS`) — **статический массив**, hardcoded в коде. Поле `lastRunAt` всегда `null` для системных воркеров (только для правил из БД заполняется). Нет механизма определения, работает ли воркер в данный момент. UI показывает "Активна" для всех воркеров, даже если сервер упал.

#### ⚠️ СРЕДНЕ — Правила мошенничества не имеют реального триггера оценки
**Файл:** `routes/automation.ts`, `services/risk-engine.ts` (упоминается в imports)  
Fraud rules сохраняются в БД, но нет воркера, который периодически их применяет к реальным стримам. Функция `assessAndPersist` из `risk-engine.ts` существует, но вызывается точечно (при ACR-сканировании). Триггера по расписанию нет — правила висят как конфигурация без применения.

---

## Секция 12 — Settings (Настройки)

**Файлы:** `pages/settings/index.tsx`, `pages/settings/integrations-tab.tsx`, `routes/settings.ts`

### Что реализовано
- General: название платформы, email, часовой пояс, язык, режим обслуживания, open registration — реальное хранение в `platform_settings`.
- Security: таймаут сессии, макс. попытки входа, lockout, IP-whitelist, требования к паролю, retention логов — реальный эффект (security policy middleware читает эти настройки).
- Storage: провайдер, пути, лимиты файлов — хранится в БД.
- Notifications: полный SMTP-конфиг, push VAPID-ключи, типы событий.
- Currency/Tax: валюты, налоги, payout threshold.
- API Keys: генерация (SHA-256 hash, prefix), permissions, TTL — реальное хранение и проверка.
- Webhooks: URL, events, retry, HMAC-secret — реальная доставка через `webhook-dispatcher`.
- Интеграции: 15+ сервисов с credentials storage — Cloudflare R2, AWS S3, Resend, SendGrid, Mailgun, Stripe, ACRCloud, Spotify, Яндекс Музыка, Apple Music, и др.
- Аудит-лог: полная история мутаций с diff, IP, user-agent.

### Проблемы

#### 🔴 КРИТИЧНО — 2FA (двухфакторная аутентификация): явно не реализована
**Файл:** `pages/settings/index.tsx` стр. 246–250  
Переключатель «Обязательная 2FA» **отключён (disabled)** с явным бейджем `"Скоро (требует доработки)"`. Сохранение флага в БД происходит, но при входе второй фактор не запрашивается. Если клиент ожидает 2FA согласно ТЗ — это критичная нехватка.

#### ⚠️ СРЕДНЕ — S3/CDN хранилище: UI есть, бэкенд игнорирует настройку
**Файл:** `lib/objectStorage.ts` (выводится из import-ов)  
Настройки storage (provider: s3, bucket, region) сохраняются в БД, но `ObjectStorageService` всегда использует **локальную файловую систему** (`./uploads`). Нет кода для инициализации AWS S3 SDK и переключения на облако. Переключение провайдера в Settings — декоративное.

#### ⚠️ СРЕДНЕ — Push-уведомления: VAPID-ключи хранятся, Web Push не отправляется
**Файл:** `routes/settings.ts`, `routes/notifications.ts`  
Настройка VAPID-ключей в Settings → Notifications сохраняется в БД. Нет кода на бэкенде для отправки Web Push через `web-push` библиотеку. Переключатель «Включить Push» — декоративный.

---

## Профиль пользователя (Profile)

**Файл:** `pages/profile/index.tsx`

### Что реализовано
- Личные данные: name, phone, address, country, region, city, zip, about — PATCH `/api/users/me`.
- DSP-профили: Apple Music ID, Spotify Artist ID, Яндекс Музыка ID, YouTube ID.
- Социальные сети: Facebook, Instagram, YouTube, TikTok, LinkedIn, X, Telegram, VK.
- Смена пароля: `POST /api/auth/change-password`, проверка текущего пароля через bcrypt.
- Аватар: загрузка через ObjectStorage.
- KYC-вкладка: полный flow загрузки/просмотра/удаления документов, кнопка «Отправить на проверку».
- Члены лейбла: просмотр команды (для роли label).

### Проблемы

#### 🔴 КРИТИЧНО — Отсутствует вкладка «Оплата и налоги» (банковские реквизиты)
**Файл:** `pages/profile/index.tsx`; FAQ в `pages/support/index.tsx` стр. 46  
В FAQ системы поддержки прямо написано: _"Как добавить банковский счёт? — Профиль → Оплата и налоги → Банковский счёт. Поддерживаем SWIFT, TJ-банки, Payeer, Webmoney."_ Но вкладки «Оплата и налоги» **не существует** в профиле пользователя. Артист не может указать реквизиты для получения выплат. Это прямое несоответствие FAQ ↔ реализация, и критичная дыра в бизнес-логике.

---

## Секция Marketing (Маркетинг)

**Файлы:** `pages/marketing/presave.tsx`, `pages/marketing/links.tsx`, `pages/marketing/assets.tsx`, `routes/marketing.ts`

### Проблемы

#### 🔴 КРИТИЧНО — Pre-save: публичная страница отсутствует
Кампании создаются, slug генерируется, но `presave.tajikmusic.com` — несуществующий домен. Нет ни одного публичного Express-маршрута, обрабатывающего переходы фанатов. Весь flow pre-save работает только как база данных кампаний, без рабочей воронки.

#### 🔴 КРИТИЧНО — Smart Links: публичная страница отсутствует  
Аналогично: `link.tajikmusic.com/<slug>` — несуществующий домен. Создаваемые ссылки нефункциональны. В UI кнопка «Копировать ссылку» копирует URL, который выдаёт ошибку.

#### ⚠️ СРЕДНЕ — Аналитика по кликам: только счётчик без источника
**Файл:** `routes/marketing.ts`  
Поля `clicks` и `saves` в таблицах `presave_campaigns` / `smart_links` существуют в БД, но нет endpoint'а, который их инкрементирует при переходе. Без работающей публичной страницы статистика никогда не обновляется автоматически.

---

## Сводный список всех заглушек и несоответствий

| Приоритет | Проблема | Файл(ы) |
|-----------|----------|---------|
| 🔴 КРИТИЧНО | Pre-save ссылки — домен `presave.tajikmusic.com` не существует | `routes/marketing.ts:36,80` |
| 🔴 КРИТИЧНО | Smart Links — домен `link.tajikmusic.com` не существует | `routes/marketing.ts:152+` |
| 🔴 КРИТИЧНО | Профиль: отсутствует вкладка «Оплата и налоги» (банк. реквизиты) | `pages/profile/index.tsx` |
| 🔴 КРИТИЧНО | 2FA — переключатель отключён, явно помечен «Скоро (требует доработки)» | `pages/settings/index.tsx:246-250` |
| ℹ️ UX-пробел | ACRCloud — нет онбординга при первом входе, пользователь видит 503 без инструкции | `routes/distribution-extras.ts:88-91` |
| ⚠️ СРЕДНЕ | Disputes в Distribution — вкладка read-only, нет действий resolve | `pages/distribution/disputes-tab.tsx` |
| ⚠️ СРЕДНЕ | Роялти: фиксированная ставка $0.0035/стрим для всех DSP | `routes/royalties.ts` |
| ℹ️ UX-пробел | PRO Registration — кнопка активна без credentials, 503 без подсказки где взять ключи | `routes/publishing-extras.ts:111-119` |
| ⚠️ СРЕДНЕ | Email отправка — без SMTP молча не отправляет, без предупреждения в UI | `lib/mail.ts:154-159` |
| ⚠️ СРЕДНЕ | Artist/Label в Analytics — видят только пустые вкладки Плейлисты/TikTok | `pages/analytics/index.tsx` |
| ⚠️ СРЕДНЕ | UGC-аналитика — только ручной ввод, нет автосбора с платформ | `pages/analytics/ugc-tab.tsx` |
| ⚠️ СРЕДНЕ | S3/CDN хранилище — UI-настройка есть, backend всегда использует local FS | `lib/objectStorage.ts` |
| ⚠️ СРЕДНЕ | Push-уведомления — VAPID-ключи хранятся, Web Push не отправляется | `routes/notifications.ts` |
| ⚠️ СРЕДНЕ | Системные воркеры в Automation — статический список, `lastRunAt` = null | `routes/automation.ts:47-52` |
| ⚠️ СРЕДНЕ | Fraud Rules — нет периодического триггера применения к реальным данным | `routes/automation.ts` |
| ⚠️ СРЕДНЕ | FX-курсы — настройка частоты обновления хранится, авто-обновления нет | `routes/settings.ts` |
| ℹ️ НЕЗНАЧИТ. | Статистика кликов presave/smart-links не инкрементируется авто | `routes/marketing.ts` |
| ℹ️ НЕЗНАЧИТ. | Tax Rate хранится в настройках, но не применяется к транзакциям | `routes/settings.ts` |
| ℹ️ НЕЗНАЧИТ. | Настройка Timezone в General Settings не влияет на серверный timezone | `routes/settings.ts` |

---

## Что реализовано полноценно (без заглушек)

Следующие модули содержат реальный production-ready код с полным CRUD, правильной изоляцией данных по ролям и реальными DB-запросами:

- **Dashboard** — KPI, стримы, релизы, DDEX-очередь
- **Distribution pipeline** — DDEX XML, очередь, retry, ack-polling, webhooks
- **Catalog** — треки, релизы, bulk-edit, дубликаты, ISRC/EAN
- **Users & KYC** — регистрация, роли, KYC flow, admin-review, приглашения
- **Rights** — правообладатели, конфликты, DSP-сделки, Content ID, территории
- **CRM** — контакты, задачи, полная аналитика (funnel, growth, overview, revenue)
- **Finance** — транзакции, выплаты, сплиты, XLSX/CSV экспорт, импорт DSP-отчётов
- **Settings: General, Security, API Keys, Webhooks, Integrations, Audit Log** — все реальные
- **Automation: Fraud Rules, Fraud Alerts, Moderation Rules** — полный CRUD
- **Communications: Templates, Campaigns, Triggers** — полный CRUD (отправка условная — нужен SMTP)
- **Publishing: Works, Conflict Detection** — реальные запросы и алгоритмы

---

## Рекомендации по приоритетам исправлений

### P0 (до первого релиза)
1. Создать публичный маршрут `/presave/:slug` на бэкенде + landing-страницу с Spotify pre-save OAuth.
2. Создать публичный маршрут `/link/:slug` с редиректом на DSP по User-Agent / геолокации.
3. Добавить вкладку «Оплата и налоги» в профиль (bankAccount, swift, payeer, webmoney, payoneer).
4. Настроить SMTP по умолчанию (хотя бы через Resend) или явно предупреждать admin при старте.

### P1 (в течение первого месяца)
5. Реализовать 2FA (TOTP: Google Authenticator / Authy) — снять disabled с переключателя.
6. Подключить `aws-sdk` / `@aws-sdk/client-s3` для реального S3-хранилища.
7. Добавить настройку ставок роялти по DSP (вместо захардкоженного $0.0035).
8. Добавить action «Решить»/«Эскалировать» в вкладку Disputes раздела Distribution.
9. Реализовать периодический применитель Fraud Rules к usage_reports.

### P2 (в течение квартала)
10. Интегрировать YouTube Data API + TikTok API для автосбора UGC-метрик.
11. Подключить web-push для браузерных уведомлений.
12. Применять FX-курсы из внешнего источника (ExchangeRate API / NBT API).
13. Применять Tax Rate к транзакциям при формировании выплат.
14. Добавить мониторинг real-time статуса воркеров (health-check endpoint + UI).
