#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  Tajik Music CRM — Однократная настройка локального хранилища файлов
#
#  Что делает:
#    1. Создаёт каталог для загрузок ВНЕ каталога деплоя (по умолчанию
#       /var/lib/tajikmusic/uploads) с правильными правами.
#    2. Прописывает LOCAL_STORAGE_ROOT в .env приложения, если его там нет.
#    3. Поднимает client_max_body_size в nginx до 250M (audio до 200 МБ + запас).
#    4. Проверяет конфиг nginx и аккуратно перечитывает его (reload, не restart).
#    5. Перезапускает API через pm2, чтобы он подхватил новую env-переменную.
#
#  Безопасность:
#    • Скрипт идемпотентен — можно запускать повторно без вреда.
#    • Все правки в .env / nginx делаются через бэкап с меткой времени.
#    • Если каталог уже есть и непустой — права меняем, файлы НЕ трогаем.
#
#  Запуск (под root):
#    bash /var/www/tajikmusic/deploy/setup_storage.sh
#
#  Если у вас docker-вариант (docker-compose) — этот скрипт НЕ нужен,
#  всё уже описано в docker-compose.yml. Перезапустите контейнеры:
#    cd /opt/tajikmusic && docker compose up -d --build
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tajikmusic}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
STORAGE_ROOT="${LOCAL_STORAGE_ROOT:-/var/lib/tajikmusic/uploads}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/tajikmusic}"
NGINX_OWNER="${NGINX_OWNER:-root}"   # пользователь, под которым работает pm2/API

ts() { date +%Y%m%d_%H%M%S; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "✗ Запускайте через sudo / под root." >&2
    exit 1
  fi
}

step() { echo ""; echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }

require_root

echo "═══════════════════════════════════════════════════════════════"
echo "  Tajik Music CRM — настройка локального хранилища файлов"
echo "═══════════════════════════════════════════════════════════════"
echo "  APP_DIR       = $APP_DIR"
echo "  ENV_FILE      = $ENV_FILE"
echo "  STORAGE_ROOT  = $STORAGE_ROOT"
echo "  NGINX_SITE    = $NGINX_SITE"
echo "  NGINX_OWNER   = $NGINX_OWNER"
echo "═══════════════════════════════════════════════════════════════"

# ─── 1. Каталог хранилища ──────────────────────────────────────────────
step "1/5  Создаю каталог для загрузок: $STORAGE_ROOT"
mkdir -p "$STORAGE_ROOT"
chown -R "$NGINX_OWNER:$NGINX_OWNER" "$STORAGE_ROOT"
chmod 750 "$STORAGE_ROOT"
ok "Готово (права: 750, владелец: $NGINX_OWNER)"

# ─── 2. .env приложения ────────────────────────────────────────────────
step "2/5  Прописываю LOCAL_STORAGE_ROOT в $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  warn "Файл $ENV_FILE не найден. Сначала разверните приложение (deploy/2_deploy.sh)."
  warn "Шаги 3-5 пропускаю."
  exit 1
fi

if grep -qE '^[[:space:]]*LOCAL_STORAGE_ROOT=' "$ENV_FILE"; then
  CURRENT=$(grep -E '^[[:space:]]*LOCAL_STORAGE_ROOT=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
  if [ "$CURRENT" = "$STORAGE_ROOT" ]; then
    ok "Уже задано: LOCAL_STORAGE_ROOT=$CURRENT — не трогаю."
  else
    BAK="$ENV_FILE.bak.$(ts)"
    cp "$ENV_FILE" "$BAK"
    sed -i -E "s|^[[:space:]]*LOCAL_STORAGE_ROOT=.*|LOCAL_STORAGE_ROOT=$STORAGE_ROOT|" "$ENV_FILE"
    ok "Обновлено (старая копия: $BAK)"
  fi
else
  printf '\n# Локальное хранилище загруженных файлов (см. deploy/setup_storage.sh)\nLOCAL_STORAGE_ROOT=%s\n' "$STORAGE_ROOT" >> "$ENV_FILE"
  ok "Добавлено в конец файла."
fi

# ─── 3. nginx — поднимаем client_max_body_size ────────────────────────
step "3/5  Проверяю nginx-конфиг: $NGINX_SITE"
if [ ! -f "$NGINX_SITE" ]; then
  warn "Файл $NGINX_SITE не найден."
  warn "Пропускаю шаг nginx. Если у вас другой путь — задайте: NGINX_SITE=/путь bash $0"
  SKIP_NGINX=1
else
  SKIP_NGINX=0
  BAK="$NGINX_SITE.bak.$(ts)"
  cp "$NGINX_SITE" "$BAK"

  if grep -qE '^[[:space:]]*client_max_body_size[[:space:]]+' "$NGINX_SITE"; then
    sed -i -E 's|^([[:space:]]*)client_max_body_size[[:space:]]+[^;]+;|\1client_max_body_size 250M;|' "$NGINX_SITE"
    ok "client_max_body_size заменён на 250M (бэкап: $BAK)"
  else
    # вставляем перед последней закрывающей скобкой блока server { ... }
    awk '
      { lines[NR] = $0 }
      END {
        last_brace = 0
        for (i = NR; i >= 1; i--) {
          if (lines[i] ~ /^\}[[:space:]]*$/) { last_brace = i; break }
        }
        for (i = 1; i <= NR; i++) {
          if (i == last_brace) {
            print "    # Добавлено deploy/setup_storage.sh — лимит на загрузку файлов"
            print "    client_max_body_size 250M;"
            print "    client_body_timeout    300s;"
            print "    proxy_request_buffering off;"
          }
          print lines[i]
        }
      }
    ' "$BAK" > "$NGINX_SITE"
    ok "Директивы добавлены в server-блок (бэкап: $BAK)"
  fi

  if nginx -t >/dev/null 2>&1; then
    ok "nginx -t: ОК"
  else
    warn "nginx -t упал — откатываю $NGINX_SITE из $BAK"
    cp "$BAK" "$NGINX_SITE"
    nginx -t
    exit 1
  fi
fi

# ─── 4. reload nginx ───────────────────────────────────────────────────
step "4/5  Перечитываю nginx (reload, без перерыва соединений)"
if [ "${SKIP_NGINX:-0}" = "0" ]; then
  systemctl reload nginx
  ok "nginx перезагружен."
else
  warn "Пропущено."
fi

# ─── 5. Перезапуск API ─────────────────────────────────────────────────
step "5/5  Перезапускаю API (pm2 delete + start, чтобы подхватить новый env)"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe tajikmusic-api >/dev/null 2>&1; then
    pm2 delete tajikmusic-api
  fi
  # Поднимаем env из .env, как это делает 2_deploy.sh
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  pm2 start "$APP_DIR/deploy/pm2.config.js" --env production
  pm2 save
  ok "API перезапущен."
else
  warn "pm2 не найден. Если у вас docker — выполните вручную:"
  warn "  cd /opt/tajikmusic && docker compose up -d --build"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Готово!"
echo ""
echo "  Файлы будут лежать в: $STORAGE_ROOT/private/uploads/"
echo "  Бэкапы старых конфигов остались в каталогах рядом с оригиналами"
echo "  с расширением .bak.<дата_время>."
echo ""
echo "  Проверьте загрузку обложки/трека в админке. Если что-то не так —"
echo "  смотрите логи:   pm2 logs tajikmusic-api --lines 100"
echo "═══════════════════════════════════════════════════════════════"
