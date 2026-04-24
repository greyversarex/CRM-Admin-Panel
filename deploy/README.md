# Деплой Tajik Music CRM

Два варианта на выбор. Можно держать оба в репо и использовать в зависимости от хостинга.

| Вариант             | Когда юзать                                                  |
| ------------------- | ------------------------------------------------------------ |
| A. Ubuntu + pm2     | Таймвеб, любой VPS/выделенный сервер с Ubuntu 22+/Debian 12  |
| B. Docker Compose   | AWS EC2, Hetzner, любой хостинг с Docker; локальный прод-тест |

## Минимальные требования к серверу

- **CPU:** 2 vCPU (рекомендуется)
- **RAM:** 2 ГБ + **обязательно 4 ГБ swap** (без swap билд фронта падает с `Exit 137 / OOM Killed`)
- **Диск:** 20 ГБ
- **OS:** Ubuntu 22.04 / 24.04 или Debian 12

### Создать 4 ГБ swap-файл (один раз на новом сервере)

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h   # проверить, что swap активен
```

---

## Вариант A — Ubuntu + pm2 + nginx

### 1. Первоначальная настройка сервера (один раз)

На чистом Ubuntu 22.04 или 24.04 под root:

```bash
git clone https://github.com/greyversarex/CRM-Admin-Panel.git /tmp/setup
bash /tmp/setup/deploy/1_setup.sh
```

Скрипт ставит Node.js 20, pnpm, pm2, PostgreSQL 16, nginx, certbot, UFW.
В конце выдаст `DATABASE_URL` — скопируй (или возьми из `/root/db_credentials.txt`).

### 2. Конфиг приложения

```bash
mkdir -p /var/www/tajikmusic
cp /tmp/setup/deploy/.env.example /var/www/tajikmusic/.env
nano /var/www/tajikmusic/.env
```

Заполни:
- `DATABASE_URL` — из шага 1
- `SESSION_SECRET` — `openssl rand -base64 48`
- `DOMAIN` — твой домен (для документации)

### 3. Первый деплой (с засевом БД)

```bash
SEED=1 bash /tmp/setup/deploy/2_deploy.sh
```

Это:
- клонирует репо в `/var/www/tajikmusic`
- ставит зависимости (`pnpm install --frozen-lockfile`)
- накатывает миграции БД (`pnpm --filter @workspace/db run migrate` — drizzle migrations)
- сидит начальные данные (только при `SEED=1`)
- собирает API и фронт (с лимитом памяти Node ~3 ГБ для vite, чтобы не падало с OOM на VPS)
- запускает pm2

### 4. Nginx

```bash
cp /var/www/tajikmusic/deploy/nginx.conf /etc/nginx/sites-available/tajikmusic
nano /etc/nginx/sites-available/tajikmusic   # подставить server_name
ln -sf /etc/nginx/sites-available/tajikmusic /etc/nginx/sites-enabled/tajikmusic
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 5. SSL

```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 6. Последующие обновления

```bash
cd /var/www/tajikmusic && bash deploy/2_deploy.sh
```

(Без `SEED=1` — иначе перепишет реальные данные.)

---

## Вариант B — Docker Compose

### 1. Установка docker (на чистом Ubuntu)

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Клон + .env

```bash
git clone https://github.com/greyversarex/CRM-Admin-Panel.git /opt/tajikmusic
cd /opt/tajikmusic
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
SESSION_SECRET=$(openssl rand -base64 48)
BASE_PATH=/
EOF
```

### 3. Запуск

```bash
docker compose up -d --build
docker compose exec api pnpm --filter @workspace/db run push     # схема
docker compose exec api pnpm --filter @workspace/db run seed     # тестовые данные (один раз)
```

Приложение на `http://<server-ip>/`. Фронт — через nginx-контейнер, API — на `127.0.0.1:3001`.

### 4. Обновление

```bash
cd /opt/tajikmusic
git pull
docker compose up -d --build
docker compose exec api pnpm --filter @workspace/db run push
```

### 5. SSL (вне docker)

Поставь nginx или caddy на хост-машине, проксируй на порт 80 контейнера. Либо замени `nginx` сервис в `docker-compose.yml` на `caddy` с автоматическим Let's Encrypt.

---

## Полезные команды

### pm2

```bash
pm2 list
pm2 logs tajikmusic-api
pm2 restart tajikmusic-api
```

### docker compose

```bash
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose exec postgres psql -U tajikmusic_user tajikmusic
```

### Бэкап БД

```bash
# Ubuntu/pm2
sudo -u postgres pg_dump tajikmusic | gzip > tajikmusic_$(date +%F).sql.gz

# docker
docker compose exec -T postgres pg_dump -U tajikmusic_user tajikmusic | gzip > tajikmusic_$(date +%F).sql.gz
```

---

## Переезд на другой хостинг

1. Бэкап БД: `pg_dump` (см. выше)
2. На новом сервере: повтори шаги установки (Вариант A или B)
3. Восстанови БД: `gunzip -c dump.sql.gz | psql tajikmusic` (или `docker compose exec -T postgres psql -U tajikmusic_user tajikmusic`)
4. Поправь DNS на новый IP

Никаких Replit-зависимостей в коде/конфигах нет.
