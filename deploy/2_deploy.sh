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
: "${LOCAL_STORAGE_ROOT:=/var/lib/tajikmusic/uploads}"

# ── Новые обязательные секреты (после обновления безопасности) ──
# Если ключей нет — генерируем один раз и дописываем в .env, чтобы API не падал.
ensure_env_secret() {
  local key="$1"
  local current="${!key:-}"
  if [ -n "$current" ] && [ "$current" != "replace_with_64_hex_characters" ] && [ "$current" != "replace_with_long_random_string_here" ]; then
    return 0
  fi
  local value
  value="$(openssl rand -hex 32)"
  if grep -qE "^${key}=" "$APP_DIR/.env"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$APP_DIR/.env"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$APP_DIR/.env"
  fi
  export "$key=$value"
  echo "  • сгенерирован и записан в .env: $key"
}

echo "▶ Проверяем секреты production..."
ensure_env_secret INTEGRATIONS_ENCRYPTION_KEY
ensure_env_secret DDEX_INBOUND_SECRET

# Если раньше credentials шифровались dev-ключом (когда INTEGRATIONS_ENCRYPTION_KEY
# не был задан), оставим его как previous — иначе старые интеграции не расшифруются.
if [ -z "${INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS:-}" ]; then
  DEV_FALLBACK_HEX="$(printf '%s' 'tajikmusic-dev-fallback-key-do-not-use-in-prod' | openssl dgst -sha256 | awk '{print $2}')"
  # Только если текущий ключ НЕ совпадает с dev-fallback
  if [ "${INTEGRATIONS_ENCRYPTION_KEY}" != "${DEV_FALLBACK_HEX}" ]; then
    if grep -qE "^INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS=" "$APP_DIR/.env"; then
      sed -i "s|^INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS=.*|INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS=${DEV_FALLBACK_HEX}|" "$APP_DIR/.env"
    else
      printf 'INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS=%s\n' "$DEV_FALLBACK_HEX" >> "$APP_DIR/.env"
    fi
    export INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS="$DEV_FALLBACK_HEX"
    echo "  • добавлен INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS (миграция со старого dev-ключа)"
  fi
fi

# Перечитываем .env после правок
set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

export PORT LOCAL_STORAGE_ROOT

# ── ffmpeg нужен для Audio QC (анализ аудиофайлов) ──────
if ! command -v ffprobe >/dev/null 2>&1; then
  echo "▶ Устанавливаем ffmpeg (нужен для Audio QC)..."
  apt-get update -y && apt-get install -y --no-install-recommends ffmpeg
fi

echo "▶ Создаём папки..."
mkdir -p /var/log/tajikmusic
mkdir -p "$LOCAL_STORAGE_ROOT"
# pm2 запускается под root (см. `pm2 startup systemd -u root`), так что
# владелец каталога — root. Если перенесёте pm2 на другого юзера — поменяйте здесь.
chown -R root:root "$LOCAL_STORAGE_ROOT"
chmod 750 "$LOCAL_STORAGE_ROOT"

# ── Проверяем память (билд фронта требует ~3 ГБ) ────────
TOTAL_MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
TOTAL_SWAP_KB=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
TOTAL_AVAIL_MB=$(( (TOTAL_MEM_KB + TOTAL_SWAP_KB) / 1024 ))
if [ "$TOTAL_AVAIL_MB" -lt 3500 ]; then
  echo ""
  echo "⚠️  Доступно памяти (RAM + swap): ${TOTAL_AVAIL_MB} МБ. Билд фронта может упасть с Exit 137 (OOM Killed)."
  echo "   Рекомендуем создать 4 ГБ swap-файл:"
  echo "     sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile"
  echo "     sudo mkswap /swapfile && sudo swapon /swapfile"
  echo "     echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
  echo ""
fi

echo "▶ Устанавливаем зависимости (frozen-lockfile)..."
pnpm install --frozen-lockfile

echo "▶ Применяем миграции БД (drizzle migrate)..."
pnpm --filter @workspace/db run migrate

if [ "${SEED:-0}" = "1" ]; then
  echo "▶ Сидим начальные данные (SEED=1)..."
  pnpm --filter @workspace/db run seed
fi

echo "▶ Собираем API-сервер..."
NODE_OPTIONS="--max-old-space-size=2048" pnpm --filter @workspace/api-server run build

echo "▶ Собираем фронтенд..."
export BASE_PATH="${BASE_PATH:-/}"
export NODE_ENV=production
NODE_OPTIONS="--max-old-space-size=3072" pnpm --filter @workspace/crm-panel run build

echo "▶ Запускаем / перезапускаем PM2 (с подхватом новых env)..."
# pm2 reload не всегда подхватывает изменения .env (известный баг с кэшем daemon).
# Если процесс уже есть — удаляем и стартуем заново, гарантируя свежий env.
if pm2 describe tajikmusic-api >/dev/null 2>&1; then
  echo "  • найден старый процесс — удаляем и стартуем заново для гарантии свежего env"
  pm2 delete tajikmusic-api
fi
pm2 start "$APP_DIR/deploy/pm2.config.js" --env production

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
