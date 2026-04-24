#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Tajik Music CRM — Деплой / Обновление приложения
#  Запускать при каждом обновлении кода
#  Команда: bash 2_deploy.sh           — обычный апдейт
#           SEED=1 bash 2_deploy.sh    — с засевом БД (только первый раз!)
# ═══════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tajikmusic}"
REPO_URL="${REPO_URL:-https://github.com/greyversarex/CRM-Admin-Panel.git}"
BRANCH="${BRANCH:-main}"

# ── Клонируем или обновляем репозиторий ─────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  echo "▶ Клонируем репозиторий в $APP_DIR..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "▶ Обновляем код из репозитория..."
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR"

# ── Проверяем .env ──────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "⚠️  Файл $APP_DIR/.env не найден!"
  echo "   Скопируй шаблон и заполни:"
  echo "     cp $APP_DIR/deploy/.env.example $APP_DIR/.env"
  echo "     nano $APP_DIR/.env"
  exit 1
fi

# ── Загружаем переменные из .env (безопасно) ────────────
set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

: "${DATABASE_URL:?DATABASE_URL отсутствует в .env}"
: "${SESSION_SECRET:?SESSION_SECRET отсутствует в .env}"
: "${PORT:=3001}"
export PORT

echo "▶ Создаём папки..."
mkdir -p /var/log/tajikmusic

echo "▶ Устанавливаем зависимости (frozen-lockfile)..."
pnpm install --frozen-lockfile

echo "▶ Применяем миграции БД (drizzle migrate)..."
pnpm --filter @workspace/db run migrate

if [ "${SEED:-0}" = "1" ]; then
  echo "▶ Сидим начальные данные (SEED=1)..."
  pnpm --filter @workspace/db run seed
fi

echo "▶ Собираем API-сервер..."
pnpm --filter @workspace/api-server run build

echo "▶ Собираем фронтенд..."
export BASE_PATH="${BASE_PATH:-/}"
export NODE_ENV=production
pnpm --filter @workspace/crm-panel run build

echo "▶ Запускаем / перезапускаем PM2 (с подхватом новых env)..."
pm2 startOrReload "$APP_DIR/deploy/pm2.config.js" --env production --update-env

echo "▶ Сохраняем список процессов PM2 (автозапуск)..."
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo "▶ Проверяем и перезагружаем Nginx..."
nginx -t && systemctl reload nginx || echo "⚠️  Nginx не настроен — выполни шаг 5 из deploy/README.md"

echo ""
echo "✅ Деплой завершён!"
echo "   API:     http://127.0.0.1:${PORT}"
echo "   Фронт:   $APP_DIR/artifacts/crm-panel/dist/public (отдаётся через Nginx)"
pm2 list
