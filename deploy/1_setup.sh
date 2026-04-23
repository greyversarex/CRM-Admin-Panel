#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Tajik Music CRM — Первоначальная настройка сервера
#  Запускать один раз на чистом Ubuntu 24.04
#  Команда: bash 1_setup.sh
# ═══════════════════════════════════════════════════════
set -e

echo "▶ Обновляем пакеты..."
apt-get update -y && apt-get upgrade -y

echo "▶ Устанавливаем базовые утилиты..."
apt-get install -y curl wget git unzip ufw build-essential

# ── Node.js 20 LTS ──────────────────────────────────────
echo "▶ Устанавливаем Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "   Node.js: $(node -v)"
echo "   npm:     $(npm -v)"

# ── pnpm ────────────────────────────────────────────────
echo "▶ Устанавливаем pnpm..."
npm install -g pnpm pm2
echo "   pnpm: $(pnpm -v)"
echo "   pm2:  $(pm2 -v)"

# ── PostgreSQL 16 ───────────────────────────────────────
echo "▶ Устанавливаем PostgreSQL 16..."
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# ── Nginx ───────────────────────────────────────────────
echo "▶ Устанавливаем Nginx..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# ── Certbot (SSL) ───────────────────────────────────────
echo "▶ Устанавливаем Certbot..."
apt-get install -y certbot python3-certbot-nginx

# ── Файрволл ────────────────────────────────────────────
echo "▶ Настраиваем UFW (файрволл)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── PostgreSQL: создаём БД и пользователя ───────────────
echo "▶ Создаём базу данных..."
DB_NAME="tajikmusic"
DB_USER="tajikmusic_user"
DB_PASS="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)"

sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

echo ""
echo "═══════════════════════════════════════════════════"
echo "  БД создана. СОХРАНИ ДАННЫЕ:"
echo "  DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
echo "═══════════════════════════════════════════════════"
echo ""

# Сохраняем DATABASE_URL в файл
echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" > /root/db_credentials.txt
echo "   Данные сохранены в /root/db_credentials.txt"

echo ""
echo "✅ Сервер готов! Теперь запусти: bash 2_deploy.sh"
