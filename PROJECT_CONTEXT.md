# CRM Admin Panel — контекст проекта и передача следующей Codex-сессии

Последнее обновление: 2026-07-23 (Asia/Tashkent)

## 1. Назначение этого файла

Этот документ сохраняет накопленный контекст между чатами Codex. Перед началом
новой работы прочитайте файл полностью, затем перепроверьте только те факты,
которые могли измениться: `git status`, текущий commit, состояние Docker и БД.

Рекомендуемая инструкция для нового чата:

> Полностью прочитай `PROJECT_CONTEXT.md`, затем проверь актуальный `git status`
> и состояние Docker. Считай описанные здесь требования обязательными. Не
> повторяй уже выполненный аудит без причины и не исправляй проблемы, не поняв
> связанные frontend/API/DB контуры.

Документ не содержит production-секретов. Не добавляйте в него содержимое `.env`,
пароли, API-ключи, токены или приватные ключи.

## 2. Контекст владельца и правила работы

- Проект принадлежит IT-компании Webcorex, которая реализует разные IT-проекты
  и делает демонстрационные прототипы для потенциальных клиентов.
- CRM Admin Panel — особенно важный для владельца проект.
- Требование владельца: работать максимально ответственно, полноценно и без
  поверхностных решений; учитывать последствия изменений во всей системе.
- По обычным инженерным задачам следует действовать автономно: исследовать,
  реализовывать, проверять и доводить до результата без лишних вопросов.
- Нельзя без прямой задачи удалять данные, переписывать Git-историю, публиковать
  изменения, работать с production или раскрывать секреты.
- Перед изменением бизнес-логики нужно проверить как минимум UI, API, RBAC/data
  scope, схему/миграции БД, audit trail и обратную совместимость.

## 3. Репозиторий и текущий снимок

- Локальный путь: `C:\Projects\CRM-Admin-Panel`
- Remote: `https://github.com/greyversarex/CRM-Admin-Panel.git`
- Ветка на момент аудита: `main`
- Commit на момент аудита: `0816eb2009cabcebfbf8e0c2a1979c89713c9fb5`
- Commit message: `Add files via upload`
- Дата commit: `2026-07-22 18:54:03 +0500`
- Package manager: pnpm 10, Node.js 20+
- Monorepo: `artifacts/*`, `lib/*`, `scripts`

На момент создания документа worktree уже был изменён предыдущей работой:

- `M .dockerignore`
- `M Dockerfile`

Эти изменения не принадлежат текущему документу и не должны быть случайно
отменены. Они были сделаны для успешной Docker-сборки:

1. В `.dockerignore` разрешён необходимый
   `artifacts/mockup-sandbox/package.json`, потому что пакет входит в workspace.
2. В Dockerfile Corepack закреплён на pnpm 10 вместо плавающего `latest`.
3. В runtime-контейнер скопированы зависимости API, включая `nodemailer`, без
   которого собранный сервер не стартовал.

После продолжения работы 2026-07-22 в worktree также находится завершённое, но
ещё не закоммиченное исправление permission enforcement API-ключей. Оно затрагивает:

- `artifacts/api-server/src/lib/api-key-permissions.ts` и соседний test;
- `artifacts/api-server/src/lib/auth.ts`, `lib/audit.ts`;
- API управления ключами в `routes/settings.ts` и его mount guard в `routes/index.ts`;
- API-key UI в `artifacts/crm-panel/src/pages/settings/index.tsx`;
- test script API package и уточняющий комментарий schema `api_keys.ts`.

Не отменять эти изменения при переходе к следующему security blocker.

В той же сессии завершён второй blocker — DDEX inbound HMAC/replay protection:

- новый `artifacts/api-server/src/lib/ddex-inbound-auth.ts` и unit test;
- timestamp-bound HMAC guard в `routes/ddex.ts`;
- идемпотентный `ingestAck()` по SHA-256 payload hash;
- nullable schema column + unique index и миграция
  `lib/db/migrations/0030_ddex_ack_idempotency.sql`;
- Compose/env example и `docs/DDEX_ARCHITECTURE.md` описывают новый signing contract.

Затем завершён третий blocker — production encryption и rotation integration credentials:

- `INTEGRATIONS_ENCRYPTION_KEY` обязателен в production и проверяется до открытия
  HTTP-порта; source-known fallback остался только для development;
- новый ciphertext имеет authenticated versioned format `v1:<key-id>:<payload>`,
  предыдущие ключи задаются явно через `INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS`;
- добавлен dry-run/apply runner
  `artifacts/api-server/src/scripts/rotate-integration-credentials.ts` и инструкция
  `docs/INTEGRATIONS_KEY_ROTATION.md`;
- замена integration/Broma16 credentials теперь выполняется транзакционно.

2026-07-23 частично закрыт четвёртый blocker и восстановлены four-role demo buttons:

- frontend больше не содержит demo emails/passwords и не зависит от
  `import.meta.env.DEV`;
- API публикует список кнопок и выполняет one-click session login только при
  явном `DEMO_LOGIN_ENABLED=true`, по умолчанию feature отключена;
- текущий localhost Docker явно запущен с demo login и non-secure cookie для HTTP;
- известные пароли в `lib/db/src/seed.ts` пока остаются отдельным незакрытым риском.

Тогда же исправлен CORS для same-origin browser POST: production middleware теперь
сравнивает `Origin` с фактическими `Host`/`X-Forwarded-Proto` и всегда разрешает
собственный origin. `WEB_ORIGINS` продолжает управлять только дополнительными
cross-origin frontend-адресами; неизвестный внешний origin остаётся заблокирован.

Все три CTA «Создать релиз» (шапка каталога, toolbar каталога и глобальная кнопка
artist/label) используют общий React-компонент по визуальному референсу владельца:
black neon surface, blue-violet microphone SVG, glow и hover/focus states. Размеры
и типографика намеренно сохранены на прежнем уровне соседних controls (`h-9` /
`text-sm` и `h-8` / `text-xs`); маршрут остаётся `/releases/new`.

Перед любой новой работой выполнить:

```powershell
cd C:\Projects\CRM-Admin-Panel
git status --short
git diff -- .dockerignore Dockerfile
docker compose ps
```

## 4. Масштаб и технологическая архитектура

По состоянию аудита:

- около 1 314 файлов с учётом вложенных assets;
- около 104 720 строк релевантного source/schema/spec кода, включая generated;
- 83 frontend page-файла;
- 333 объявления Express-маршрутов в 51 route-файле;
- 68 PostgreSQL-таблиц;
- 31 SQL-миграция: `0000`–`0030`;
- OpenAPI: 61 path и 93 operation — заметно меньше фактического API;
- 119 прямых вызовов `fetch()` во frontend помимо generated API client.

Основной стек:

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, Wouter,
  TanStack Query, собственная RU/EN i18n.
- Backend: Express 5, TypeScript, Drizzle ORM, PostgreSQL, Zod.
- API contract: OpenAPI + Orval-generated React client + generated Zod schemas.
- Auth: server-side PostgreSQL sessions через `express-session` и
  `connect-pg-simple`.
- Infrastructure: Docker Compose, Nginx, PostgreSQL 16, отдельный API container.
- Файлы: локальное object storage на persistent volume; signed upload URL.
- Audio QC: `music-metadata` и ffmpeg/ffprobe в runtime image.
- Интеграции: SFTP/S3 DDEX, Broma16, Spotify, ACRCloud, MusicBrainz, iTunes,
  SMTP/Resend, Telegram/WhatsApp, outbound webhooks.

Поток приложения:

```text
React/Vite SPA
      |
    Nginx
      |
Express API ----- PostgreSQL
      |              |
      |              +-- sessions, catalog, finance, audit, queues
      +-- local object storage
      +-- DDEX delivery/ACK workers -> SFTP or S3
      +-- Broma16 workers/schedulers
      +-- email, webhooks and external DSP services
```

Ключевые файлы:

- `artifacts/crm-panel/src/App.tsx` — frontend routing;
- `artifacts/crm-panel/src/lib/permissions.ts` — frontend role matrix;
- `artifacts/api-server/src/app.ts` — middleware, CORS, session, rate limit;
- `artifacts/api-server/src/routes/index.ts` — порядок mount и backend guards;
- `artifacts/api-server/src/lib/auth.ts` — session/API-key auth и data scope;
- `lib/db/src/schema/index.ts` — экспорт всей модели данных;
- `artifacts/api-server/src/index.ts` — HTTP startup и фоновые процессы.

## 5. Бизнес-модули

Проект — не статический макет. Основные экраны связаны с реальным API и БД.

### Каталог и релизы

- Лейблы, артисты, пользователи, релизы, треки, contributors, DSP selection.
- Rich metadata, UPC/ISRC, territories, language, genres, P/C lines, explicit,
  AI usage, spatial metadata, transfer/import flows.
- Ассеты: обложки, аудио, KYC-документы, hash и audio technical metadata.
- Bulk edit, duplicate detection, catalog codes и metadata import aliases/cache.

Release state machine:

```text
draft -> pending_review
pending_review -> approved | rejected | draft | parked
approved -> delivering (через delivery endpoint) | rejected | takedown_requested | draft
rejected -> draft | pending_review
parked -> pending_review | rejected
delivering -> delivered | error
delivered -> live | error
live -> takedown_requested
error -> rejected | draft
takedown_requested -> removed | live
```

Есть submit validation, concurrency guards, ограничения редактирования по
статусу, manual retry и отдельный delivery workflow.

### Финансы

- DSP ingestion/imports и unmatched reconciliation.
- Transactions с provenance/source и периодами.
- Royalties, commissions, splits и экспорт Excel/CSV.
- Payouts с maker/checker и двухступенчатым approval.
- Payment automation: thresholds, KYC rejection и scheduled payouts.

### Rights, publishing и distribution

- Rights holders, conflicts, freeze/history, Content ID assets.
- Publishing works, writers/shares, PRO registration и conflicts.
- DDEX messages, batches, acknowledgements и deliveries.
- ACRCloud checks/disputes и takedown workflows.
- Broma16 artists/releases/compositions/dictionaries/statistics/moderation.

### CRM и операционные модули

- Contacts, CRM tasks, support inbox/messages.
- Signup review, KYC review, label invitations/team members.
- Notifications, email templates/campaigns, Telegram/WhatsApp.
- Marketing: pre-save, smart links, promo assets, playlists, trends.
- Fraud rules/alerts, automation triggers и audit screens.

## 6. Роли, авторизация и scoping

Роли: `admin`, `manager`, `label`, `artist`.

- `admin` и `manager` получают full data scope, но manager дополнительно должен
  ограничиваться `manager_permissions` по функциональным группам.
- `label` получает принудительный `labelId` из session; query-параметры не должны
  позволять выбрать чужой label.
- `artist` получает принудительный `artistId` из session.
- Основные routes artists/releases/tracks/finance/royalties/splits/assets/rights/
  publishing/support/marketing имеют серверные scope-проверки.
- Publishing был улучшен по сравнению со старым аудитом: label scope вычисляется
  через `track -> release.labelId` либо принадлежность artist лейблу; доступ
  fail-closed.

Положительные свойства auth:

- bcrypt password hashes;
- login rate limit;
- per-account lockout после неудачных попыток;
- одинаковый ответ для неизвестного email и неверного пароля;
- session ID регенерируется при login и impersonation;
- account/role/scope перечитываются из БД через `/auth/me`;
- disabled account завершает session;
- cookie: `HttpOnly`, `SameSite=Lax`, rolling expiry, `Secure` в production;
- impersonation разрешён только admin, запрещён для другого admin и аудитируется;
- logger/audit redaction не допускают утечку основных секретов и PII.

Manager permissions backend применяет группы:

- catalog;
- distribution;
- finance;
- analytics;
- crm;
- users_kyc;
- rights;
- support_comms;
- automation_audit.

Известная UI-несогласованность: sidebar передаёт manager permissions в
`canAccess`, а `ProtectedRoute` в `App.tsx` вызывает `canAccess` без них. Это не
обход backend-защиты, но direct URL может открыть shell страницы до получения
API 403.

## 7. Модель БД и миграции

Фактическая локальная БД содержала:

- 68 public tables;
- 68 primary keys;
- 116 foreign keys;
- 11 unique constraints;
- 0 CHECK constraints.

Отсутствие CHECK означает, что статусы, суммы/проценты и многие инварианты
защищены только приложением. Импорт, ручной SQL или новая интеграция могут
обойти эти правила.

Дополнительные особенности:

- splits participants хранятся в JSONB, а не нормализованной таблице;
- payout approver IDs не везде имеют FK;
- статусы во многих таблицах — `text`, а не PostgreSQL enum/check;
- seed не идемпотентен и содержит фиксированные demo accounts;
- локальная база создана через `drizzle-kit push`, поэтому
  `drizzle.__drizzle_migrations` отсутствует;
- production deploy script использует правильный порядок: migrate до запуска
  PM2/API;
- Docker README предлагает сначала `compose up`, затем ручной `push`, из-за чего
  API и background bootstrap стартуют до существования схемы.

`lib/db/scripts/test-migrations.sh` устарел: он ожидает 19 таблиц и 29 FK, тогда
как текущая схема содержит 68 таблиц и 116 FK. Тест нельзя считать действующим,
пока ожидания и сценарии не обновлены.

## 8. DDEX, Broma16 и фоновые процессы

При старте API запускаются:

- integration registry seed;
- delivery worker;
- optional ACK poller;
- fraud engine;
- payment automation scheduler;
- Broma16 push worker;
- Broma16 dictionary/statistics/moderation schedulers;
- manager-permissions bootstrap.

Delivery worker и Broma16 push worker реализуют:

- atomic `queued -> processing` claim;
- последовательную обработку ограниченного batch;
- максимум 5 попыток;
- exponential backoff;
- `nextRetryAt`;
- восстановление jobs, зависших в `processing`;
- сохранение Broma16 progress для продолжения неидемпотентного flow;
- audit/notification при delivery transitions.

Это хорошо работает с одним API process. Cron/scheduler jobs не имеют
межпроцессного leader election. При нескольких API replicas fraud, payment и
Broma16 scheduler будут запущены в каждом экземпляре. Перед горизонтальным
масштабированием нужен distributed/advisory lock либо выделенный worker service.

DDEX implementation содержит реальный ERN builder, business validation,
SFTP/S3/local transports, messages/batches и ACK parser. Но официальной
offline XSD-валидации ERN 4.3 нет. Перед реальными DSP-поставками требуются XSD,
partner conformance fixtures и end-to-end тест на test SFTP.

## 9. Локальный runtime на момент передачи

Запущены Docker services:

- `crm-admin-panel-nginx-1` — `http://localhost`, host port 80;
- `crm-admin-panel-api-1` — `127.0.0.1:3001`;
- `crm-admin-panel-postgres-1` — PostgreSQL 16, healthy, internal port 5432.

Health endpoint:

```text
GET http://127.0.0.1/api/healthz -> 200 {"status":"ok"}
```

Этот endpoint проверяет только liveness и не проверяет DB/storage/workers.

Локальная база была заполнена sample seed:

- users 4;
- labels 2;
- artists 4;
- releases 5;
- tracks 5;
- transactions 7;
- payouts 4;
- splits 3;
- publishing works 3;
- contacts 4;
- CRM tasks 5;
- deliveries 7;
- activity log 7;
- большинство новых integration/automation/DDEX/KYC/analytics таблиц пусты.

### Известная проблема локального login

Compose устанавливает `NODE_ENV=production`, а локальный Nginx работает по HTTP.
Без `SESSION_COOKIE_SECURE=false` Express считает cookie secure и не отправляет
`Set-Cookie` на HTTP request. Симптом:

- `POST /api/auth/login` возвращает 200;
- browser/HTTP client не получает session cookie;
- следующий `GET /api/auth/me` возвращает 401.

Compose теперь пробрасывает `SESSION_COOKIE_SECURE`. Для локального HTTP добавить
в локальный `.env` `SESSION_COOKIE_SECURE=false`; для production с TLS значение
должно быть `true`. Текущий container запущен с `false`, и живой session probe
подтвердил сохранение cookie для всех четырёх demo roles.

### Integration bootstrap

При первом Compose startup API стартовал до `drizzle-kit push`. Integration seed
получил `relation "integrations" does not exist`, завершился и автоматически не
повторился. После создания схемы осталась только одна integration record,
созданная Broma16 path. Нужен restart API после schema bootstrap либо автоматический
migrate/health gate/retry.

Локальный `.env` существует и игнорируется Git. Его содержимое не копировать в
документацию или commit.

После security fixes текущий API container запущен с одноразово сгенерированными
`DDEX_INBOUND_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` и тестовым previous encryption
key, переданными только через environment команды. В локальный `.env` секреты
намеренно не записывались. Перед следующим `docker compose up/recreate` нужно
самостоятельно добавить отдельные DDEX и current encryption secrets по 32 bytes,
например `openssl rand -hex 32`; previous key задаётся только на период реальной
ротации существующих credentials. Без обязательных current secrets production API
теперь корректно завершится fail-fast.

Текущий локальный container также одноразово запущен с
`DEMO_LOGIN_ENABLED=true` и `SESSION_COOKIE_SECURE=false`, чтобы four-role demo
buttons работали через plain HTTP localhost. Эти значения не записаны в `.env` и
будут потеряны при следующем recreate. В production demo login должен оставаться
`false`, а secure cookie — `true`.

## 10. Выполненные проверки

- Docker production build: успешно после правок Dockerfile/.dockerignore.
- API container: запускается.
- Nginx: отдаёт SPA и проксирует `/api/`.
- PostgreSQL: healthy.
- `/api/healthz`: 200.
- Core TypeScript:
  - `@workspace/api-server` — проходит;
  - `@workspace/crm-panel` — проходит;
  - перед ними нужен `tsc --build --force` для library declarations.
- Root `pnpm run typecheck`: не проходит из-за
  `artifacts/mockup-sandbox`, где package script ссылается на отсутствующий
  `tsconfig.json`.
- Общие domain unit tests отсутствуют; есть целевые security/config unit tests.
- API integration tests: отсутствуют.
- Browser e2e tests: отсутствуют.
- GitHub Actions/другой CI: отсутствует.
- API-key permission tests: 6 сценариев проходят в Linux typecheck image.
- DDEX inbound auth tests: 6 сценариев проходят.
- Integration encryption/key-ring tests: 6 сценариев проходят.
- Demo login config/role tests: 3 сценария проходят.
- CORS origin policy tests: 4 сценария проходят; всего целевых API tests — 25.
- После API-key исправления повторно прошли:
  - forced build TypeScript declarations;
  - `@workspace/api-server` typecheck;
  - `@workspace/crm-panel` typecheck;
  - production build API и frontend;
  - Docker Compose rebuild/restart API и `/api/healthz`.
- Живой API probe для ключа только с `read:artists` подтвердил: разрешённый GET
  возвращает 200, POST и чужой resource возвращают 403, system API недоступен,
  `Set-Cookie` не выдаётся и запрос без ключа после этого остаётся 401. Временный
  ключ удалён, тестовых/пользовательских API keys в локальной БД не осталось.
- Живой DDEX probe подтвердил 401 без timestamp/для stale timestamp, 202 для
  первого signed ACK, 200 для точного replay и одну idempotent строку в БД;
  тестовый ACK удалён.
- Живой integration rotation probe подтвердил `pending=1`, atomic apply,
  `pending=0`, новый формат `v1` и одно system audit event. Probe credential и
  audit event удалены. Отдельный production container без encryption key завершился
  с exit code 1 до открытия HTTP-порта.
- Живой demo-login probe через Nginx подтвердил четыре one-click session flow:
  `admin`, `manager`, `label`, `artist`, с последующим `/auth/me` и logout. API
  возвращает кнопки только при явном `DEMO_LOGIN_ENABLED=true`; production default
  — disabled. Отдаваемый production JS проверен: известных demo passwords нет.
- Живой CORS probe с `Origin: http://localhost` подтвердил preflight 204,
  demo-login 200 и рабочую session; unlisted `https://attacker.example` получает
  403. Same-origin больше не требует дублировать public URL в `WEB_ORIGINS`.

Для typecheck/build checks были созданы локальные временные Docker images
`crm-admin-panel-typecheck` и `crm-admin-panel-buildcheck`. Это не изменение
репозитория.

Frontend production output на момент проверки:

- CSS около 204 KB;
- основной JS около 2.2 MB;
- динамических `React.lazy`/`import()` не найдено.

## 11. Критические риски, которые нужно исправить первыми

### P0/P1 — безопасность и контроль доступа

1. **API-key permission enforcement — исправлено 2026-07-22.**
   Введены явные `read:<resource>` / `write:<resource>` scopes, строгая валидация
   при создании/изменении ключа и fail-closed mapping маршрутов. System endpoints
   (`auth`, settings, integrations, API keys, webhooks, manager permissions и
   неизвестные новые routes) не доступны ключам. Principal API-ключа остаётся
   request-scoped и не сериализуется в cookie session. Создание/изменение/удаление
   ключей и mutations от API key получают audit actor без raw key/hash. Управлять
   ключами теперь может только `admin`, не `manager`. Миграция БД не требуется;
   старые известные scopes совместимы, пустые/неизвестные scopes ничего не дают.

2. **DDEX inbound HMAC/replay protection — исправлено 2026-07-22.**
   Production fail-fast требует отдельный `DDEX_INBOUND_SECRET` минимум 32 bytes.
   Подпись привязана к `X-DDEX-Timestamp` и raw body, допустимое окно по умолчанию
   300 секунд. Точный повтор ACK дедуплицируется unique SHA-256 `payload_hash`:
   возвращается прежний `ackId`, `duplicate=true`, status transitions не повторяются.
   Legacy ACK rows остаются nullable; миграция `0030` не требует backfill. Compose,
   env example и DDEX architecture обновлены. Live probe подтвердил 401 без/stale
   timestamp, 202 для первого ACK, 200 для replay и ровно одну строку в БД.

3. **Production encryption и rotation integration credentials — исправлено
   2026-07-22.** Production fail-fast требует отдельный 32-byte current key.
   Ciphertext содержит version/key fingerprint и AES-GCM AAD; previous keys
   принимаются только из явного key ring. Legacy/current rows проверяются dry-run,
   apply сначала расшифровывает и self-verifies весь набор, затем обновляет pending
   rows и audit trail в одной транзакции. Секреты и plaintext в вывод/audit не
   попадают. Compose/env example и отдельный rotation runbook обновлены.

4. **Demo credentials в production bundle — frontend-часть исправлена
   2026-07-23; seed-риск остаётся.** Известные passwords и account mapping удалены
   из frontend. Кнопки и one-click backend endpoint включаются только явным
   `DEMO_LOGIN_ENABLED=true` (default false); API создаёт session server-side,
   проверяет allowlisted role и active dedicated account, применяется login rate
   limit. Production bundle не содержит старые пароли. Однако `lib/db/src/seed.ts`
   всё ещё создаёт active demo users с фиксированными passwords, а deploy допускает
   `SEED=1` в production. До исправления seed нельзя запускать на боевой БД; если
   он уже запускался, пароли нужно немедленно ротировать.

5. **Manager имеет системные права, предназначенные только admin.**
   В `routes/index.ts` переменная `adminOnly` фактически означает
   `requireRole("admin", "manager")` и защищает `/integrations`, `/settings`,
   `/api-keys`, `/webhooks`. UI также показывает manager все system tabs.
   Это противоречит `manager_permissions.ts`, где `settings_system` помечены
   как никогда не доступные manager.

6. **SSRF через outbound webhooks.**
   Webhook URL проверяется только `z.string().url()` и затем server-side fetch
   идёт на любой адрес, включая localhost/private/link-local. Broma16 asset fetch
   уже содержит хороший SSRF guard; его подход можно переиспользовать.
   Файлы: `routes/settings.ts`, `services/webhook-dispatcher.ts`.

### P1/P2 — целостность и эксплуатация

7. ✅ Обязательные production DDEX/encryption env и fail-fast добавлены; секреты
   всё ещё должны поставляться внешним secret manager/deploy environment, не Git.
8. Нет автоматических тестов и CI; критические auth/finance/release flows не
   защищены от регрессий.
9. Нет XSD/conformance validation DDEX.
10. Нет DB CHECK constraints для статусных и финансовых инвариантов.
11. Migration test matrix устарела; локальная база не имеет migration ledger.
12. Payment automation изменяет деньги без полноценного фонового audit trail.
13. Scheduler jobs не готовы к нескольким API replicas.
14. Healthcheck не является readiness check.
15. Backup описан только ручной командой `pg_dump`; automated backup/restore test
    и monitoring/alerting отсутствуют.

## 12. Другие найденные несоответствия и технический долг

- OpenAPI покрывает лишь часть API: 93 операции против 333 route declarations.
- Generated client активно используется в core pages, но 119 raw fetch calls
  создают второй, нетипизированный API слой.
- Frontend route guard не применяет manager permissions, хотя sidebar применяет.
- Security settings UI показывает `maxLoginAttempts` и
  `lockoutDurationMinutes`, но auth использует hardcoded 5 и 15 минут.
- `require2FA` присутствует как disabled setting, реализации MFA нет.
- Password reset/forgot password flow отсутствует.
- Maintenance mode и registrationOpen сохраняются, но не управляют API.
- Storage size/format settings в platform settings не управляют фактическим
  local object store, который использует env/default limits.
- Audit coverage существенное, но не полное; особенно проверить background
  finance automation, marketing, communications и webhook-triggered mutations.
- Webhook signing secret хранится plaintext в БД; он не возвращается API, но
  желательно шифровать тем же production key.
- API/Helmet security headers применяются к API responses; Docker Nginx static
  config почти не задаёт отдельные security headers для SPA HTML.
- Nginx TLS block в deploy config является шаблоном/комментарием, сертификаты
  должны быть настроены отдельно.
- Production PM2 setup запускает процесс от root — желательно отдельный system user.
- Нет LICENSE file.

## 13. Сильные стороны, которые важно сохранить

- Это функционально богатая реальная система, а не набор mock screens.
- Модель музыкальной дистрибуции заметно глубже обычной CRUD CRM.
- Хорошая server-side data isolation база для label/artist.
- Session fixation protection, account lockout и redaction реализованы аккуратно.
- Impersonation ограничен и аудитируется.
- Publishing label scope уже исправлен относительно старого аудита.
- Delivery/Broma queues имеют разумные claim/retry/recovery механизмы.
- Integration credentials используют versioned AES-256-GCM, production fail-fast
  и явный key ring для контролируемой ротации.
- Broma16 file fetch содержит защиту от internal/private адресов.
- DDEX service разделён на builder, validator, transports, batches и ACK parser.
- Production deploy script накатывает versioned migrations до запуска API.
- Audit allowlists специально исключают password, bank account, IBAN, SWIFT,
  tax ID и integration secrets.

Исправления не должны разрушить эти свойства или заменять server-side guards
только frontend-проверками.

## 14. Рекомендуемый порядок следующих работ

### Этап 1 — security blockers

1. ✅ Реальное permission enforcement API keys внедрено и проверено 2026-07-22.
2. ✅ DDEX inbound secret, timestamp replay window и ACK idempotency внедрены и
   проверены 2026-07-22.
3. ✅ `INTEGRATIONS_ENCRYPTION_KEY` обязателен в production; versioned ciphertext,
   previous-key ring и безопасный rotation runner внедрены и проверены 2026-07-22.
4. 🟡 Demo password mapping удалён из production frontend, server-side one-click
   login сделан explicit opt-in и проверен 2026-07-23. Осталось сделать seed явно
   development-only/безопасным и ротировать известные passwords там, где он уже
   запускался.
5. Разделить `admin` и `manager` для system settings/integrations/keys/webhooks.
6. Добавить SSRF-safe URL validation, DNS/IP re-check и redirect control.

### Этап 2 — воспроизводимость и тестовая сетка

1. Исправить root workspace typecheck/mockup-sandbox.
2. Добавить GitHub Actions: install, typecheck, build, migrations, tests.
3. Добавить API integration tests для auth/RBAC/data scope.
4. Добавить finance/payout and release-state-machine tests.
5. Добавить Playwright smoke flows для всех четырёх ролей.
6. Обновить migration matrix под текущие 68 tables и legacy push scenario.

### Этап 3 — production readiness

1. XSD DDEX validation и partner fixtures.
2. DB constraints и миграция грязных данных.
3. Readiness probes, structured metrics, error tracking и alerts.
4. Automated encrypted backups и регулярный restore drill.
5. Выделенный worker/scheduler или distributed locks.
6. TLS/security headers и non-root runtime.

### Этап 4 — поддерживаемость и performance

1. Довести OpenAPI до фактического API.
2. Перевести raw fetch на generated client/custom fetch.
3. Route-level code splitting и lazy-loading.
4. Разделить самые большие файлы: release detail, releases API, settings,
   distribution extras, CRM и communications.
5. Удалить/архивировать нерелевантные artifacts и устаревшие документы.

## 15. Документы репозитория, к которым относиться осторожно

- `AUDIT_DISCOVERY_2026-07-08.md` — полезный старый аудит Tajik Music CRM, но
  его количественные данные и часть выводов устарели. Например, publishing scope
  уже был исправлен, число таблиц/маршрутов выросло.
- `TECHNICAL_AUDIT.md` относится к другому проекту («Сканер Структур Графиков»)
  и не должен использоваться как аудит текущей CRM.
- `docs/DDEX_ARCHITECTURE.md` содержит как реализованную архитектуру, так и
  roadmap. Не считать описанную XSD validation уже существующей без проверки кода.

## 16. Правило завершения будущих задач

Перед сообщением «готово» для существенного изменения нужно:

1. проверить `git diff` и не затронуть чужие изменения;
2. выполнить core typecheck и relevant build;
3. выполнить существующие или добавленные tests;
4. проверить server-side role/data scope;
5. проверить schema/migration и backward compatibility;
6. проверить audit/log redaction и секреты;
7. при UI-задаче проверить реальный экран в browser;
8. сообщить владельцу точный результат, проверки и оставшиеся риски.

Нельзя объявлять production-ready только потому, что Docker build прошёл.

## 17. Label dashboard по пронумерованным референсам — реализовано 2026-07-23

- Источник истины для компоновки — `C:\Users\uSistem\Desktop\Дашборд\1.png`–`6.png`.
  Для роли `label` создан отдельный компонент
  `artifacts/crm-panel/src/components/label-dashboard-sections.tsx`; старые общие
  dashboard-виджеты для этой роли скрыты.
- Тот же scoped-компонент теперь используется ролью `artist`: общие Streams/DSP,
  Playlist, Latest Releases, rankings и UGC имеют идентичный layout у label и
  artist. Роль включена в React Query keys, поэтому кеш одной роли не используется
  другой. Artist-only Territories, DSP Earnings, Royalty и recent activity
  сохранены отдельно; дубли старых общих виджетов для artist скрыты.
- Порядок секций повторяет изображения 1→6: пять KPI; Streams chart + список DSP;
  Playlist + Top DSP Streams; Latest Releases (с Barcode и Label из БД);
  Top Artists + Top Track; широкий YouTube UGC Overview с views/watch time/new videos;
  затем отдельные TikTok и Meta cards.
- Карточки Playlist и Top DSP Streams растягиваются общей grid-строкой и имеют
  одинаковую высоту на desktop.
- Виджеты используют role-scoped endpoints и реальные таблицы: `transactions`,
  `usage_reports`, `deliveries`, `playlist_stats`, `releases`, `labels`, `artists`,
  `tracks`, `ugc_metrics`. При отсутствии импортов показываются empty states;
  значения, артистов, обложки и графики во frontend не подставляем.
- В `routes/dashboard.ts` добавлен scoped endpoint
  `/api/dashboard/streams-by-platform-month`, исправлен ключ начального месяца для
  `/streams-by-month`, а latest releases и playlists дополнены реальными label,
  barcode и artist metadata. UGC timeseries ограничен последними шестью месяцами.
- Label/artist revenue KPI берётся из `usage_reports.revenue`, куда Broma16
  statistics ingestion пишет доход вместе со streams. Финансовый ledger не
  подставляется вместо отсутствующего Broma16-отчёта. Active deliveries считает рабочие
  queue/processing/sent и legacy pending/in_progress.
- UGC дополнен реальным `watch_time_seconds` (migration
  `0031_ugc_watch_time.sql`). Ручная UGC-запись теперь обязательно привязывается
  к треку, release выводится сервером из трека; это делает label scope рабочим.
- Старый Spotify popularity import отключён ответом `410`: popularity 0–100 не
  является views и больше не записывается/не отображается как UGC. Dashboard UGC
  принимает только YouTube CMS, TikTok и Meta/Instagram/Facebook источники.
- Локальная migration применена без удаления данных. Docker API/frontend image
  пересобран и запущен; текущие ассеты: `index-C2Sk0fbP.js`, `index-DYU4JUky.css`.
- Live label probe (`label_id=1`) после deploy: Broma-derived revenue `0`, streams
  `0`, Broma platforms `0`, playlists `0`, потому что `usage_reports` и
  `playlist_stats` сейчас действительно пустые. Старые `$24,721.50` были суммой
  financial ledger и больше не подставляются как Broma16 dashboard revenue.
- Проверки: API/frontend TypeScript, production Docker API+frontend build,
  `/api/healthz`, label и artist demo sessions и все семь общих dashboard
  endpoints для обеих ролей прошли с `200`.
  Встроенный browser не был доступен (`browsers.list() = []`), поэтому визуальный
  browser smoke остаётся единственным непроведённым пунктом.

## 18. Label Catalog: Releases / Artists / Labels — реализовано 2026-07-23

- В sidebar роли `label` восстановлена группа Catalog с маршрутами `/releases`, `/artists`,
  `/labels`; существующий Transfer сохранён. `/labels` разрешён лейблу и на frontend, и на API.
- Модель владения: `users.label_id` является корнем каталога. Лейбл видит свой корневой label,
  все вложенные sublabels/imprints любой глубины, артистов этого дерева и релизы, напрямую либо
  через артиста принадлежащие этому дереву. Чужие деревья закрыты server-side; UI-фильтр не является
  границей безопасности.
- Лейбл может создавать sublabel только внутри своего дерева, редактировать собственный root/дочерние
  labels и переносить дочерний label только внутри дерева. Перенос root, циклы и чужой parent запрещены.
  Удаление label по-прежнему доступно только admin/manager.
- При создании/редактировании артиста label выбирается только из собственного дерева. Форма содержит
  имя, жанр, страну, фото, телефон, биографию, Spotify/Apple Artist ID, публичные URL для сайта,
  Spotify, Apple Music, YouTube, Instagram, TikTok, Facebook, Deezer, Яндекс Музыки и VK Музыки,
  а также IPI Name Number, IPN, ISNI и существующее сопоставление outlet ID Broma16.
- `socialLinks` проверяются на клиенте и повторно на сервере: разрешены только абсолютные HTTP/HTTPS URL,
  ограничены ключи, длина и количество. Некорректный protocol возвращает `400` до записи в БД.
- Artist stats используют `usage_reports` как источник истины Broma одновременно для streams и revenue.
  При отсутствии импортированных отчётов возвращаются честные нули.
- При login/demo-login/impersonation/stop/logout полностью очищается React Query cache, чтобы scoped-данные
  предыдущей роли не показывались новому пользователю.
- Добавлены unit-тесты дерева labels; полный API набор: 27/27. API и frontend TypeScript проходят без ошибок.
  Production Docker build и deploy выполнены; frontend assets: `index-Cko5JNBO.js`, `index-Sk3X4QJL.css`.
- Live probe под demo label `label_id=1`: `/labels` вернул только id `1`, `/artists` — 2 артиста только
  label `1`, `/releases` — 3 релиза только label `1`; `/labels/2` вернул `403`. Проверка вредоносной ссылки
  вернула `400`, число артистов не изменилось. Встроенный browser в сессии отсутствовал, поэтому визуальный
  click smoke не выполнен; bundle и asset проверены через nginx с `200`.

## 19. Общий стиль dashboard для admin/manager/label/artist — исправлено 2026-07-23

- Причина расхождения была архитектурной: label/artist использовали новый
  `ScopedDashboardSections`, а admin/manager продолжали рендерить старые
  `PerformanceOverviewCard`, `PlaylistPlacementsCard`, старые Top DSP, Latest Releases и UGC.
- Компонент переименован в `SharedDashboardSections` и теперь единожды рендерит общий набор для
  всех четырёх ролей. Внутренние секции также переименованы из `Label*` в `Shared*`; роль включена
  в React Query keys, а server-side API по-прежнему определяет фактический data scope по сессии.
- У admin/manager удалены старые дубли общих секций. Сохранены только административные дополнения:
  operations/finance KPI, recent activity/status, territories, DSP earnings, royalty summary,
  artist/user tables и publishing catalog.
- Playlist и Top DSP Streams теперь у всех ролей являются карточками одной общей grid-строки
  `items-stretch`; обе карточки имеют `h-full`, поэтому их высота одинакова независимо от данных.
- Frontend TypeScript и `git diff --check` прошли. Production Docker build/deploy выполнен;
  текущий bundle `index-bbN9RZjW.js`, CSS `index-Sk3X4QJL.css`.
- Live probe: семь общих dashboard endpoints вернули `200` и для admin, и для label;
  `/api/healthz` и новый asset также вернули `200`. Browser runtime снова не предоставил ни одного
  браузера, поэтому визуальный click/screenshot smoke не выполнен.

## 20. Metadata Language и наследование release → track — исправлено 2026-07-23

- Удалены три расходившихся UI-справочника и смешивание Metadata Language со служебным
  Broma16 language dictionary. Канонический источник теперь один:
  `artifacts/crm-panel/src/lib/metadata-languages.ts`.
- Список содержит 177 уникальных значений без дублей. Первые позиции строго:
  `Russian`, `Tajik`, `English`, затем приоритетные региональные языки; значение по умолчанию
  для нового релиза — `English`. Старое нестандартное значение из БД не теряется: оно временно
  добавляется в конец options при редактировании конкретной записи.
- Единый список подключён к активной Create Release, альтернативному release wizard,
  release edit, track card, полной Edit Track, metadata translations и multi-track edit.
- `POST /tracks` теперь server-side наследует непустые `language`, `genre`, `subgenre` из релиза,
  если клиент их не передал. Явные значения трека имеют приоритет; последний fallback языка —
  `English`. Это покрывает одиночное добавление, reuse и клиенты вне текущего UI.
- Bulk create и bulk audio upload больше не перетирают язык релиза константой `English`;
  активные действия передают также subgenre. Edit Track наследует язык/жанр/субжанр для старых
  пустых треков и отображает системный catalog number родительского релиза read-only.
- Исправлен ложный признак потери subgenre: карточка релиза раньше всегда выводила жёсткое `—`.
  Release edit теперь содержит поле Subgenre и отправляет его в API. Track summary показывает
  release fallback для старых треков без собственных значений.
- Catalog number остаётся полем релиза и не дублируется в таблицу tracks. Он присваивается сервером
  при одобрении (`TM######`), отображается на release и track edit и везде read-only; UI больше не
  создаёт впечатление, что ручное изменение будет сохранено.
- Broma16 по-прежнему преобразует выбранное имя в собственный `language_id`. Для DDEX добавлено
  отдельное преобразование product name → ISO/BCP-47 (`English` → `en`, `Tajik` → `tg`,
  `Dari` → `prs`, Chinese script variants → `zh-Hans`/`zh-Hant`); полные английские названия
  больше не уходят в XML как невалидные коды. То же преобразование применяется к переводам title;
  runtime-проверка подтвердила, что все 177 канонических значений имеют delivery code.
- Проверки: frontend/API TypeScript прошли; API unit suite `33/33` (наследование и DDEX language codes);
  production Docker API+frontend build и deploy прошли; `/api/healthz` вернул `200`, актуальный
  frontend bundle — `index-DjuDtIls.js`. Канонический список проверен runtime-скриптом:
  `177` элементов, `177` уникальных, default `English`.
- Browser runtime не предоставил ни одного браузера (`browsers.list() = []`), поэтому визуальный
  click smoke не выполнен; nginx, bundle, health, typecheck и серверная логика проверены.

## 21. UPC Gate перед Create Release и transfer-import — реализовано 2026-07-23

- Все существующие CTA `Create Release` по-прежнему ведут на `/releases/new`, но этот маршрут
  теперь открывает отдельный первый экран по референсу Symphonic. Исходная полная форма создания
  перенесена на `/releases/new/details`; кнопка `I need a UPC` и ссылка `I don't know my UPC`
  ведут туда без изменения прежней бизнес-логики.
- Для уже доставленного релиза пользователь вводит оригинальный UPC/EAN, выполняет отдельную
  проверку и после успешного результата запускает реальный `/releases/import-upc`. Создаётся
  `draft` с `isTransfer=true`, импортированными release/track metadata и оригинальными ISRC,
  после чего пользователь попадает в карточку релиза для проверки и загрузки отсутствующего audio.
- Серверная валидация поддерживает GTIN-8, UPC-A/GTIN-12, EAN-13 и GTIN-14, проверяет GS1 check
  digit, отклоняет all-zero/невыданный код и нормализует пробелы/дефисы. UPC-A и эквивалентный
  EAN-13 с ведущим нулём ищутся как один идентификатор, поэтому второй импорт блокируется.
- Исправлен порядок Express routers: `releaseFlowRouter` теперь подключается до динамического
  `/releases/:id`; ранее рабочая на вид заготовка `/releases/check-upc` фактически перехватывалась
  как строковый release id и возвращала validation error.
- UPC transfer доступен всем четырём ролям. Для admin/manager сохранено создание/поиск source
  label/artist. Для label найденный или новый artist ограничен собственным label tree, а релиз
  принудительно принадлежит session label. Для artist используются только session artist и его
  фактический label. Внешние metadata не могут переassign-ить tenant ownership.
- Новый экран локализован EN/RU, имеет idle/checking/error/available/importing состояния,
  inline duplicate/checksum/lookup ошибки, keyboard submit и отдельное предупреждение о
  UPC-A/EAN leading-zero equivalence.
- Проверки: API tests `37/37` (4 UPC unit scenarios), API и frontend TypeScript, API build,
  полный Linux Docker production build API+frontend и `git diff --check` прошли. Windows Vite
  build локально не стартовал из-за отсутствующего optional Rollup binary, но тот же frontend
  успешно собран в штатном Node 20 Linux image.
- Docker image пересобран и локальные API/nginx containers запущены; `/api/healthz` вернул `200`,
  актуальный frontend asset — `index-BYvicaKA.js`. Live label-session probe подтвердил валидный
  UPC `5063454557181`, `invalid_check_digit`, all-zero `invalid_format`, доступ label к import
  endpoint до server validation и наличие `/releases/new/details` в production bundle.
- Во время probe внешний каталог неожиданно сопоставил all-zero UPC с реальным релизом. Созданные
  тестовые release/track записи после проверки удалены; контрольный запрос к БД подтвердил `0/0`.

### Визуальное уточнение — 2026-07-24

- UPC Gate приведён ближе к композиции Symphonic: плоская узкая центральная колонка без большой
  карточки, свечения, декоративного badge и лишних иконок. Сохранены собственные шрифты, тёмная тема
  и фирменные цвета CRM, а также все состояния и прежняя UPC/import логика.
- Frontend TypeScript и полный Docker production build прошли. В nginx развёрнут asset
  `index-C-YonVUd.js`; `/api/healthz` и `/releases/new` вернули `200`. Browser runtime недоступен (`[]`).

## 22. Apple/Deezer artist identity search — исправлено 2026-07-24

- Deezer раньше запрашивался с `limit=6`; точный `Alisher Ans` в реальной выдаче API находился
  на 11-й позиции и отрезался сервером. Теперь API получает до 25 кандидатов, нормализует имена,
  поднимает точное совпадение первым и возвращает до 12 результатов.
- Бесплатный iTunes `musicArtist` не содержит artwork. Apple-поиск теперь параллельно получает
  релизы, сопоставляет artwork строго по `artistId` и отдаёт увеличенную картинку 300x300.
  Если каталог не содержит изображения или CDN-картинка не загрузилась, frontend показывает инициал.
- Пустой Deezer placeholder (`/artist//...000000...`) больше не считается настоящей картинкой.
- Добавлены unit-тесты ранжирования и artwork normalization: полный API suite `41/41`.
  API/frontend TypeScript и Docker production build прошли.
- Live CRM API probe для `Alisher Ans`: Deezer первым вернул точный профиль `166496087`
  из 12 результатов; Apple первым вернул `Alisher Ans` с непустым `imageUrl`.
  Развёрнут frontend asset `index-CfeH7l93.js`; `/api/healthz` вернул `ok`.
  Browser runtime не предоставил доступный браузер (`[]`), визуальный screenshot smoke не выполнен.

## 23. Иконки Broma outlets и возврат после Track Save — 2026-07-24

- Реальный Broma16 outlet dictionary проверен в локальной БД: 39 площадок; `raw` содержит id,
  title, release types и служебные флаги, но не содержит icon/logo URL.
- Доступность и названия площадок по-прежнему берутся только из Broma16. В Outlet Picker добавлен
  стабильный brand-icon resolver по названию словаря: Spotify, Apple, Amazon, Deezer, YouTube,
  TikTok, Meta, VK, Yandex, SoundCloud, Tidal и другие получают фирменные знаки/цвета; неизвестные
  и составные outlets получают единый музыкальный fallback. Тот же fallback используется в старом
  DSP picker, если `logoUrl` отсутствует.
- Обычный `Save` в Track Editor после успешного API update инвалидирует track/list/release cache
  и возвращает на `/releases/:id` — карточку релиза с Release Details и Tracks. `Save & Next Track`
  сохранил прежнее поведение.
- Frontend TypeScript, `git diff --check` и полный Docker production build прошли. В nginx
  развёрнут asset `index-DRzfPNKB.js`, `/releases/new/details` вернул `200`.
  Browser runtime не предоставил браузер (`[]`), визуальный click/screenshot smoke не выполнен.

## 24. Country of Recording picker — нормализован 2026-07-24

- Фактический Broma16 country dictionary содержит 256 строк с русскими названиями, двумя
  дубликатами `CS`, устаревшими `SU`/`YU` и невалидными трёхбуквенными aliases `CDN`/`PLS`.
- `useCatalogOptions("country")` теперь использует Broma как источник доступных ISO-кодов,
  но строит канонические английские названия через `Intl.DisplayNames("en")`, удаляет malformed,
  duplicate и legacy entries и сортирует результат по английскому названию.
- Country options получили флаг и отдельный ISO alpha-2 badge. Общий `DictionaryCombobox`
  поддерживает эти необязательные поля, поиск работает одновременно по English name и ISO code.
  Изменение автоматически применяется в Track Editor, Track Card и Multi-track Edit.
- Frontend TypeScript, `git diff --check` и Docker production build прошли. В nginx развёрнут
  asset `index-gUQH_WOp.js`; `/releases/new/details` вернул `200`.
  Browser runtime не предоставил браузер (`[]`), визуальный screenshot smoke не выполнен.
