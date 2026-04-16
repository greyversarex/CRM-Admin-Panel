# Деплой Tajik Music CRM на Ubuntu 24.04

## Пошаговая инструкция

### Шаг 1 — На этом Replit
Обнови репозиторий GitHub (push всех изменений).

### Шаг 2 — На сервере (подключился по SSH)

```bash
# Скачай скрипты прямо из репозитория
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /tmp/tajikmusic_setup
cd /tmp/tajikmusic_setup

# Шаг 2а: Первоначальная настройка сервера (один раз)
bash deploy/1_setup.sh
```

> Скрипт установит: Node.js 20, pnpm, PM2, PostgreSQL 16, Nginx, Certbot, UFW  
> В конце выдаст DATABASE_URL — **скопируй его**, он нужен в шаге 3.

---

### Шаг 3 — Создай файл .env

```bash
# Перейди в папку приложения
cd /var/www/tajikmusic

# Скопируй шаблон
cp deploy/.env.example .env

# Открой и заполни
nano .env
```

Заполни:
- `DATABASE_URL` — из вывода шага 2 (или из `/root/db_credentials.txt`)
- `SESSION_SECRET` — сгенерируй: `openssl rand -base64 48`
- `DOMAIN` — твой домен или IP сервера

---

### Шаг 4 — Задеплой приложение

```bash
# Редактируй REPO_URL в файле перед запуском:
nano /var/www/tajikmusic/deploy/2_deploy.sh

# Запусти деплой
bash /var/www/tajikmusic/deploy/2_deploy.sh
```

---

### Шаг 5 — Настрой Nginx

```bash
# Скопируй конфиг Nginx
cp /var/www/tajikmusic/deploy/nginx.conf /etc/nginx/sites-available/tajikmusic

# Открой и замени your-domain.com на свой домен/IP
nano /etc/nginx/sites-available/tajikmusic

# Включи сайт
ln -sf /etc/nginx/sites-available/tajikmusic /etc/nginx/sites-enabled/tajikmusic
rm -f /etc/nginx/sites-enabled/default

# Проверь и перезапусти
nginx -t && systemctl reload nginx
```

---

### Шаг 6 — SSL сертификат (если есть домен)

```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

---

### При обновлении кода

Просто запусти заново:
```bash
cd /var/www/tajikmusic && bash deploy/2_deploy.sh
```

---

## Полезные команды

```bash
# Статус процессов
pm2 list

# Логи API
pm2 logs tajikmusic-api

# Перезапуск API
pm2 restart tajikmusic-api

# Статус Nginx
systemctl status nginx

# Статус PostgreSQL
systemctl status postgresql

# Подключиться к БД
sudo -u postgres psql -d tajikmusic
```
