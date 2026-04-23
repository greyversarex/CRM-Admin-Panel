# Tajik Music Distribution CRM

Полнофункциональная CRM для дистрибуции музыки тадж. лейбла. Каталог, релизы, артисты, финансы, роялти, DDEX-доставки.

## Стек

- pnpm-monorepo (Node 20+, TypeScript 5.9)
- API: Express 5 + Drizzle ORM + PostgreSQL 16
- Frontend: React 19 + Vite + Tailwind 4 + shadcn/ui
- Auth: express-session + connect-pg-simple + bcrypt

## Структура

```
artifacts/
  api-server/      Express 5 API (порт 3001 в проде)
  crm-panel/       React + Vite фронт (статика собирается в dist/public)
  mockup-sandbox/  Только для разработки UI-вариантов
lib/
  db/              Drizzle schema, миграции, seed
  api-spec/        OpenAPI спека (orval codegen)
  api-client-react/ Сгенерированные хуки react-query
  api-zod/         Сгенерированные zod-схемы
deploy/            Скрипты + конфиги для прода (Ubuntu+pm2 и Docker)
```

## Локальная разработка

Идёт прямо на Replit — workflow'ы поднимут API/фронт автоматически.
Если запускать локально:
```bash
pnpm install
pnpm --filter @workspace/db run push      # схема БД
pnpm --filter @workspace/db run seed      # тестовые юзеры
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/crm-panel run dev   # в другом терминале
```

Тестовые юзеры: см. `replit.md` (Auth & Data Scoping).

## Прод-деплой

См. `deploy/README.md` — два варианта:
- **Ubuntu + pm2 + nginx** (Таймвеб и любой VPS)
- **Docker Compose** (AWS, Hetzner, локальный прод-тест)

Никаких Replit-зависимостей в боевом коде нет — переезд на любой Linux-хостинг через `git pull && bash deploy/2_deploy.sh` (или `docker compose up -d --build`).

## Команды

| Команда                                         | Что делает                              |
| ----------------------------------------------- | --------------------------------------- |
| `pnpm run typecheck`                            | tsc по всем пакетам                     |
| `pnpm run build`                                | typecheck + сборка всех пакетов         |
| `pnpm --filter @workspace/db run push`          | синхронизация схемы (drizzle-kit push)  |
| `pnpm --filter @workspace/db run seed`          | посеять тестовые данные                 |
| `pnpm --filter @workspace/api-spec run codegen` | пересобрать API-клиента из OpenAPI      |
