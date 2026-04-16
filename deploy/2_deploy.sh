#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Tajik Music CRM — Деплой / Обновление приложения
#  Запускать при каждом обновлении кода
#  Команда: bash 2_deploy.sh
# ═══════════════════════════════════════════════════════
set -e

APP_DIR="/var/www/tajikmusic"
REPO_URL="https://github.com/YOUR_USERNAME/YOUR_REPO.git"  # <-- замени на свой репо

# ── Загружаем переменные окружения ──────────────────────
if [ -f "$APP_DIR/.env" ]; then
  export $(grep -v '^#' "$APP_DIR/.env" | xargs) 2>/dev/null || true
fi

# ── Клонируем или обновляем репозиторий ─────────────────
if [ ! -d "$APP_DIR" ]; then
  echo "▶ Клонируем репозиторий..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
else
  echo "▶ Обновляем код из репозитория..."
  cd "$APP_DIR"
  git pull origin main
fi

# ── Проверяем .env ──────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "⚠️  Файл .env не найден!"
  echo "   Скопируй .env.example в .env и заполни переменные:"
  echo "   cp $APP_DIR/.env.example $APP_DIR/.env"
  echo "   nano $APP_DIR/.env"
  exit 1
fi

echo "▶ Создаём папки..."
mkdir -p /var/log/tajikmusic

echo "▶ Устанавливаем зависимости..."
pnpm install --frozen-lockfile

echo "▶ Собираем API-сервер..."
pnpm --filter @workspace/api-server run build

echo "▶ Собираем фронтенд..."
export BASE_PATH="/"
export PORT=3001
export NODE_ENV=production
pnpm --filter @workspace/crm-panel run build

echo "▶ Запускаем / перезапускаем PM2..."
pm2 startOrReload "$APP_DIR/deploy/pm2.config.js" --env production

echo "▶ Сохраняем список процессов PM2 (автозапуск)..."
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo "▶ Перезагружаем Nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "✅ Деплой завершён!"
echo "   API:      http://localhost:3001"
echo "   Фронт:    /var/www/tajikmusic/artifacts/crm-panel/dist/public"
pm2 list
