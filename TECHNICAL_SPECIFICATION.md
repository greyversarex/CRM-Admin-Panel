# Техническое задание (ТЗ)
## Tajik Music — Music Distribution CRM + Admin Panel + Publishing Management

**Версия:** 1.0  
**Дата:** Апрель 2026  
**DDEX Party ID:** PA-DPIDA-2024053004-T  
**Статус:** Первая версия (без внешних API, с архитектурой под будущую интеграцию)

---

## Оглавление

1. [Цель проекта](#1-цель-проекта)
2. [Общая архитектура](#2-общая-архитектура)
3. [Роли пользователей](#3-роли-пользователей)
4. [Admin Panel — 12 разделов](#4-admin-panel)
5. [Label Dashboard — Кабинет лейбла](#5-label-dashboard)
6. [CRM-модуль](#6-crm-модуль)
7. [Publishing-модуль](#7-publishing-модуль)
8. [DDEX и Delivery](#8-ddex-и-delivery)
9. [Финансы и Split-система](#9-финансы-и-split-система)
10. [Аналитика](#10-аналитика)
11. [Интеграции и API](#11-интеграции-и-api)
12. [Хранилище и файлы](#12-хранилище-и-файлы)
13. [Статусы объектов](#13-статусы-объектов)
14. [Что важно не пропустить](#14-что-важно-не-пропустить)

---

## 1. Цель проекта

Создать единую профессиональную платформу для управления музыкальным каталогом, артистами, релизами, метаданными, аналитикой и авторскими правами (паблишингом) для компании **Tajik Music**.

Система объединяет три продукта в одном:

| Продукт | Для кого | Назначение |
|---|---|---|
| Admin Panel | Дистрибьютор (Super Admin, Admin, Moderator) | Управление всей системой, модерация, финансы, DDEX |
| Label Dashboard | Лейблы и артисты | Управление своими релизами, аналитика, роялти |
| CRM-модуль | Внутренняя команда | Управление контактами, задачами, коммуникациями |

---

## 2. Общая архитектура

### Технологический стек

| Слой | Технология |
|---|---|
| Frontend | React (Next.js), тёмная тема, адаптивный дизайн |
| Backend | Node.js (Express / Fastify) |
| База данных | PostgreSQL |
| Хранилище файлов | AWS S3 / Google Cloud Storage |
| Аутентификация | JWT + Role-based Access Control (RBAC) |
| Очереди задач | Redis + Bull (для фоновых задач: генерация DDEX, отправка уведомлений) |
| Email / Push | Mailer API (SMTP или SendGrid) |
| Мессенджеры | Telegram Bot API, WhatsApp API |

### Дизайн-ориентиры

- Стиль UI: тёмная тема, профессиональная, как у **Symphonic / Reprtoir / Revelator / Metronic**
- Референс интерфейса: https://keenthemes.com/metronic/tailwind/demo4/
- Figma-референс: https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme

---

## 3. Роли пользователей

Система поддерживает полноценный RBAC. Каждая роль имеет строго ограниченный доступ к разделам.

| Роль | Описание | Доступ |
|---|---|---|
| **Super Admin** | Владелец системы | Полный доступ ко всему без ограничений |
| **Admin** | Администратор компании | Управление системой, релизами, пользователями |
| **Moderator** | Контент-модератор | Модерация релизов, проверка метаданных |
| **Finance** | Финансовый менеджер | Финансы, выплаты, роялти, отчёты |
| **Support** | Служба поддержки | Тикеты, пользователи, коммуникации |
| **Publishing Manager** | Менеджер паблишинга | Авторские права, произведения, PRO/CMO |
| **Rights Manager** | Менеджер прав | Content ID, споры по правам, DSP Deals |
| **Marketing / Growth** | Маркетолог | Аналитика, pre-save, smart links, кампании |
| **Developer / Tech Admin** | Технический специалист | API, DDEX, системные настройки |
| **Label** | Лейбл (клиент) | Только свои артисты, релизы, роялти |
| **Artist** | Артист (клиент) | Только свои релизы, аналитика, запрос выплаты |

---

## 4. Admin Panel

Главный интерфейс управления всей платформой. Содержит **12 разделов**.

---

### 4.1 Dashboard (Overview)

Главный экран администратора. Максимум 8–12 виджетов.

**Блок CORE (основные KPI):**
- Total Users (всего пользователей)
- Total Releases (всего релизов)
- Total Works / Publishing (произведений в паблишинге)
- Total Streams (суммарные прослушивания)
- Total Royalties — Distribution
- Total Royalties — Publishing

**Блок OPERATIONS (контроль работы):**
- Releases in Moderation (ожидают проверки)
- Approved Releases (одобрено за период)
- Rejected Releases (отклонено)
- Takedowns (снято с публикации)
- QC Status (OK / Issues — контроль качества)
- Delivery Status: Delivered / Pending / Failed

**Блок FINANCE:**
- Revenue Today / This Month
- Pending Payments (количество + сумма)
- Ready to Pay (готово к выплате)

**Блок ALERTS:**
- Fraud / Risk Alerts (подозрительная активность)
- Claims / Conflicts (споры по правам)
- System Errors

**Блок ANALYTICS (быстрый обзор):**
- Top Tracks / Artists
- Top Countries
- Growth (Users / Streams динамика)

**Блок ACTIVITY (последние действия):**
- Новые релизы на модерации
- Последние выплаты
- Новые регистрации
- Последние изменения в системе

**Блок QC — Контроль качества:**
- Проверка аудио (ACRCloud)
- Проверка метаданных (обязательные поля)
- Проверка обложки (размер, формат)

---

### 4.2 Distribution

Управление процессом дистрибуции релизов.

**Подразделы:**

| Подраздел | Функции |
|---|---|
| Release Moderation | Очередь релизов: Pending / Approved / Rejected. Просмотр метаданных, аудио, обложки. Кнопки: Одобрить / Отклонить с комментарием |
| ACRCloud Check | Fingerprint-проверка аудио на дубликаты. Отображение конфликтов |
| DDEX Delivery | Генерация DDEX XML-пакетов. Логи отправки. Статус доставки по DSP |
| DSP Delivery Status | Статус по каждой платформе: Spotify, Apple Music, Yandex, VK, Zvooq и др. |
| Takedowns | Список снятых релизов. Причина. Возможность восстановления |
| Scheduling | Релизы с заданной датой публикации |
| Disputes | Споры по правам. Статус. История переписки |

---

### 4.3 Catalog

Весь каталог контента. Главный раздел системы.

**Подразделы:**

| Подраздел | Описание |
|---|---|
| **Releases** | Контейнер (Альбом / EP / Сингл). Связан с треками и артистом. Статус, UPC, обложка, дата |
| **Tracks** | Отдельные треки. ISRC, автор музыки, автор текста, жанр, язык, длительность. Самый важный уровень |
| **Artists** | Карточка: фото, биография, жанр, соцсети, лейбл. Связь с релизами по ISRC/UPC |
| **Labels** | Лейблы и сублейблы. Список артистов и релизов лейбла |
| **Assets** | Файловое хранилище: аудио (WAV/FLAC/MP3), обложки (JPG/PNG), документы |
| **Videos** | Видео-релизы: YouTube, VEVO, Apple Music Video, Tidal, Yandex Video |
| **Duplicate Detection** | Поиск одинаковых артистов и треков (по названию, ISRC, fingerprint) |
| **Bulk Edit** | Массовое редактирование метаданных для нескольких релизов/треков |
| **ISRC / UPC Generator** | Авто-генерация кодов по заданному префиксу (для российских DSP — отдельный префикс) |

**Метаданные трека (обязательные поля):**
- Название трека
- Исполнитель (Display Artist)
- Автор музыки (Composer)
- Автор текста (Lyricist)
- ISRC
- Жанр
- Язык
- Длительность
- Страна происхождения
- Дата записи
- Права (Copyright)

**Метаданные релиза (обязательные поля):**
- Название релиза
- Тип (Album / EP / Single)
- Артист
- Лейбл
- UPC / EAN
- Обложка (3000x3000 JPG)
- Дата релиза
- Жанр
- Территория дистрибуции
- Язык

---

### 4.4 Users

Управление пользователями и доступом.

| Подраздел | Функции |
|---|---|
| Users | Список всех пользователей. Фильтр по роли, статусу, лейблу |
| Sign Up Requests | Новые заявки на регистрацию. Одобрение / отклонение |
| Roles & Permissions | Настройка ролей: Admin, Moderator, Finance, Support, Publishing Manager, Super Admin |
| KYC / Verification | Проверка личности и бизнеса. Документы (паспорт / компания). Проверка платёжных данных |
| Contract Type | Тип контракта: Distribution / Publishing |
| Account Activity Log | Журнал входов и действий пользователя |
| Blacklist / Risk Flag | Подозрительные пользователи. Блокировка аккаунта |

---

### 4.5 Analytics

Аналитика и статистика всей платформы.

| Подраздел | Метрики |
|---|---|
| Overview | Total Streams, Total Revenue, Growth день/месяц, Top DSP, Top Countries, Trend Charts |
| Streaming Analytics | Потоки по DSP, по трекам, по артистам, по периодам |
| Revenue Analytics | Доход по DSP, по релизам, по артистам, по периодам |
| Content Performance | Эффективность каждого релиза (CTR, плейлисты, skip rate) |
| Geo Analytics | Карта прослушиваний по странам |
| UGC / Social Analytics | YouTube UGC, TikTok, Meta |
| Real-time Alerts | Резкий рост или падение стримов (аномалии) |
| Export | Выгрузка отчётов CSV / PDF |

---

### 4.6 Finance

Все финансовые операции платформы.

| Подраздел | Описание |
|---|---|
| Revenue Ingestion | Импорт доходов от DSP (Spotify, Apple, TikTok и т.д.) через CSV-отчёты |
| Royalty Engine | Расчёт дохода между участниками по правилам Split: Artist % / Label % / Distributor % |
| Royalty Summary | Сводка по роялти за выбранный период |
| Statements | Ежемесячные отчёты для артистов и лейблов. Формат PDF / CSV |
| Earnings by Release | Доход по каждому релизу |
| Earnings by DSP | Доход по каждой платформе |
| Payment Requests | Заявки на выплату от артистов и лейблов |
| Payment Approval | Одобрение выплат финансовым менеджером |
| Payment History | История всех транзакций |
| Multi-currency | Поддержка: USD, EUR, RUB, TJS |

**Split-система (подробно):**

Для каждого трека / релиза устанавливается правило распределения:

```
Distributor (Tajik Music) — X%
Label                     — Y%
Artist                    — Z%
Co-author / Publisher     — W%
```

- Split настраивается на уровне релиза или трека
- Может быть переопределён для конкретного артиста
- При наличии нескольких авторов — Split делится между ними пропорционально
- Отчёт по Split генерируется ежемесячно
- Выплата производится только после одобрения Finance-менеджером

---

### 4.7 Rights Management

| Подраздел | Описание |
|---|---|
| DSP Deals | Договоры с платформами (Spotify, Apple и т.д.) |
| Content ID | Управление Content ID на YouTube |
| Disputes | Споры по правам. Статус: Open / In Review / Resolved |
| Territory Rights | Территориальные ограничения прав |

---

### 4.8 Publishing

Отдельный модуль для авторских прав (подробно — см. раздел 7).

---

### 4.9 CRM

Внутренняя CRM команды (подробно — см. раздел 6).

---

### 4.10 Communications

| Подраздел | Описание |
|---|---|
| Email Campaigns | Рассылки артистам и лейблам (шаблоны, история) |
| Push Notifications | Push-уведомления о релизах, выплатах, одобрениях |
| Telegram / WhatsApp | Встроенные каналы коммуникации |
| SMS | SMS-уведомления |
| Notification Templates | Редактор шаблонов уведомлений |

---

### 4.11 Automation

| Подраздел | Описание |
|---|---|
| Fraud Detection | Автоматическое обнаружение подозрительных стримов |
| Content Moderation | Авто-проверка метаданных и обложки при загрузке |
| Scheduled Tasks | Авто-рассылки, авто-генерация отчётов |
| Workflow Rules | Настраиваемые правила: «если релиз одобрен → запустить DDEX-генерацию» |

---

### 4.12 Settings

| Подраздел | Описание |
|---|---|
| API Keys | Управление API-ключами для интеграций |
| DDEX Config | Настройки DDEX: версия схемы, партнёрский ID |
| DSP Connections | Подключение DSP-платформ |
| System Config | Общие настройки системы |
| Audit Logs | Кто что изменил (финансы, релизы) — критически важно для бизнеса |
| Backup | Резервное копирование базы данных и файлов |

---

## 5. Label Dashboard

Личный кабинет для лейблов и артистов. Каждый видит только свои данные.

---

### 5.1 Dashboard (Overview)

| Виджет | Описание |
|---|---|
| Total Streams | Суммарные прослушивания (Spotify, Apple, TikTok, YouTube) |
| Revenue | Estimated Earnings за период |
| Top Artists | Топ артистов по стримам |
| Top Tracks | Топ треков по стримам |
| Top Platforms | Доля каждого DSP |
| Latest Releases | Последние загруженные релизы |
| Playlist Placements | В каких плейлистах размещены треки |
| Notifications | Уведомления: релиз одобрен / отклонён / выплата отправлена |

---

### 5.2 Releases

| Подраздел | Описание |
|---|---|
| All Releases | Полный список: Albums / Singles |
| Drafts | Черновики (не отправленные на модерацию) |
| Scheduled | Запланированные (одобрены, ждут даты) |
| Live | Активные (доставлены на DSP) |
| Takedown / Removed | Снятые с публикации |
| Create Release | Форма создания нового релиза с загрузкой аудио, обложки, метаданных |
| Transfer Track | Импорт существующего релиза по UPC/ISRC. Выбор DSP. Верификация владения. Отслеживание статуса |

**Процесс создания релиза:**
1. Заполнение метаданных (релиз + треки)
2. Загрузка аудиофайлов (WAV / FLAC)
3. Загрузка обложки (JPG 3000x3000)
4. Выбор дат и территорий
5. Отправка на модерацию → статус: **Pending**
6. Модератор проверяет → **Approved** / **Rejected**
7. При одобрении → генерация DDEX → доставка на DSP → **Live**

---

### 5.3 Publishing

| Подраздел | Описание |
|---|---|
| Publishing Works | Список зарегистрированных произведений |
| Writers | Авторы (композитор, лирик) с долями |
| Splits (Ownership) | Разделение авторских прав |
| Registration | Регистрация в PRO/CMO |
| Partners | Партнёры: Songtrust, ASCAP, BMI, The MLC |
| Reports | Отчёты по паблишинг-доходу |
| Conflict Detection | Обнаружение конфликтов прав |

---

### 5.4 Analytics

| Подраздел | Фигма-референс |
|---|---|
| Streams Analytics | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2250-37786) |
| YouTube UGC Analytics | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2258-53263) |
| TikTok Analytics | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2267-45405) |
| Playlist Analytics | Позиции в плейлистах, история |
| Social Insights (Meta) | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2255-42108) |

---

### 5.5 Royalties

| Подраздел | Описание |
|---|---|
| Royalty Summary | Сводка по заработку за месяц / квартал / год |
| Statements | Ежемесячные выписки PDF / CSV |
| Earnings by Release | Доход по каждому релизу |
| Earnings by DSP | Доход по каждой платформе |
| Request Payment | Форма запроса выплаты |
| Payment History | История всех выплат |

---

### 5.6 Marketing

| Подраздел | Описание |
|---|---|
| Pre-save Campaigns | Создание pre-save ссылок перед релизом |
| Smart Links | Универсальные ссылки на релиз по всем DSP |
| Pitch to Spotify Editorial | Форма заявки в редакцию Spotify |
| Ads Tools | (Будущий раздел) Платная реклама |
| Promo Assets | Авто-генерация промо-материалов (обложки для соцсетей) |

---

### 5.7 Music Video Distribution

| Подраздел | Описание |
|---|---|
| Upload Video | Загрузка видеофайла + метаданные |
| YouTube Delivery | Доставка на YouTube Art Tracks / Official |
| VEVO | Интеграция с VEVO |
| Content ID Management | Управление Content ID монетизацией |
| Video Analytics | Просмотры, вовлечённость, доход с видео |

---

### 5.8 Support

| Подраздел | Описание |
|---|---|
| Inbox / Tickets | Создание тикетов и переписка с поддержкой |
| Help Center / FAQ | База знаний |
| Contact Support | Форма обращения |

---

### 5.9 Profile / Settings

| Подраздел | Фигма-референс |
|---|---|
| Profile / Settings | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2296-45496) |
| Artist & Label Profile | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2324-39023) |
| Social Links | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2333-54829) |
| Bank / Payment Info | Реквизиты для выплат |
| Tax Info | Налоговая информация |
| Change Password | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2335-38884) |
| Account Members | [Figma](https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme--Community-?node-id=2338-40078) |
| Notification Settings | Настройка уведомлений по каналам |

---

## 6. CRM-Модуль

Внутренняя CRM-система для команды Tajik Music. Доступна из Admin Panel.

### Контакты

- Артисты, авторы, лейблы, менеджеры, партнёры
- Поля: имя, фото, контакты, жанр, теги, прикреплённые релизы
- История всех взаимодействий

### Коммуникации

- История переписки (чат, письма, push)
- Встроенные каналы: Telegram, WhatsApp, SMS, Email
- Лента активности по каждому контакту

### Music Library (Каталог CRM)

- Все треки с авторами музыки и текста
- Поиск и фильтрация
- Привязка к контракту и артисту

### Хранилище документов

- Договоры, лицензии, права
- Привязка к артисту / лейблу

### Задачи и заметки

- Внутренние задачи команды
- Напоминания
- Прикрепление к контакту или релизу

### Рассылки

- Push и email-рассылки по группам артистов или релизам

### Интеграция с Publishing

- Прямая связь с паблишинг-модулем
- Видно, какие произведения зарегистрированы, какие ещё нет

---

## 7. Publishing-Модуль

Система учёта и передачи авторских прав.

### Произведения (Works)

| Поле | Описание |
|---|---|
| Название | Название произведения |
| ISWC | Международный код произведения |
| ISRC | Коды связанных записей |
| Авторы | Composer / Lyricist с долями в % |
| PRO / CMO | Организация (ASCAP, BMI, SESAC, SOCAN и т.д.) |
| Статус | Not Registered / Pending / Registered |
| Территория | Где зарегистрировано |

### Paблишинг-партнёры

- **Songtrust** — глобальная регистрация
- **ASCAP** — США
- **BMI** — США
- **The MLC** — США (механические права), API: https://public-api.themlc.com/public-api/
- Экспорт данных в форматах CSV / XML для каждого партнёра

### Publishing Sync

После одобрения релиза в Admin Panel:
1. Метаданные синхронизируются с Publishing-модулем
2. Из Publishing можно напрямую экспортировать данные в партнёрские системы
3. Конфликт-детекция по ISWC / ISRC

### Отчёты

- Ежемесячный отчёт по паблишинг-доходу
- Детализация по произведению / автору / платформе
- Выплаты авторам (интегрировано с Finance-модулем)

---

## 8. DDEX и Delivery

**DDEX Party ID Tajik Music:** `PA-DPIDA-2024053004-T`

### Поддерживаемые DDEX-профили

| Профиль | Назначение |
|---|---|
| **ERN** (Electronic Release Notification) | Доставка релизов, аудио, метаданных и обложек на DSP. Версия: v4.3 / v4.2 / v3.8 |
| **DSR** (Sales Report Message) | Получение отчётов о продажах и стримах от DSP |
| **MWN** (Media Work Notification) | Паблишинг — отправка данных о музыкальных произведениях |
| **RIN** (Recording Information Notification) | Авторские и студийные метаданные (Master + Publishing) |

> **Приоритет для первой версии:** ERN + DSR

### Структура DDEX-пакета (ERN)

Каждый релиз должен содержать:

```
ReleaseID (UPC/EAN)
RecordingID (ISRC)
ArtistName / DisplayArtist
LabelName
ReleaseTitle / TrackTitle
Genre / Language / Rights / Territory
Files: audio (WAV/FLAC/MP3), cover (JPG/PNG 3000x3000)
DeliveryType: Full / Update / Takedown
```

### Генератор DDEX в Admin Panel

Кнопка **"Generate DDEX Package"** в карточке релиза.

Алгоритм:
1. Модератор проверяет релиз и нажимает "Approve"
2. Система авто-генерирует DDEX XML по выбранной схеме
3. XML + аудио + обложка упаковываются в ZIP
4. ZIP помещается в папку доставки (SFTP / S3)
5. Логи доставки сохраняются с отметкой времени
6. Статус релиза меняется на "Delivered"

### Поддерживаемые DSP

| Глобальные | Российские |
|---|---|
| Spotify | Yandex Music |
| Apple Music | VK Music |
| Amazon Music | Zvooq |
| Tidal | |
| Deezer | |
| YouTube Music | |

> **Важно:** Для российских DSP генерируются ISRC/UPC с уникальным префиксом, чтобы избежать конфликта с глобальными DSP.

### Transfer Track (Импорт с другого дистрибьютора)

1. Вводишь UPC / ISRC / ссылку Spotify / Apple / YouTube
2. Система автоматически подтягивает метаданные через API
3. Если аудио и обложка недоступны — добавляются вручную
4. Верификация владения (подтверждение прав)
5. Новый релиз создаётся в каталоге CRM
6. Отслеживание статуса переноса

---

## 9. Финансы и Split-система

### Импорт доходов (Revenue Ingestion)

- Загрузка CSV-отчётов от DSP (Spotify, Apple, TikTok и др.)
- Авто-разбор отчёта и привязка строк к трекам/релизам
- Поддержка разных форматов отчётов от разных DSP

### Royalty Engine

Автоматический расчёт дохода по правилам Split.

**Пример Split-правила:**

```
Distributor (Tajik Music): 15%
Label:                      35%
Artist:                     50%
```

**Расчёт:**
- Доход от DSP импортируется → система разбивает на доли
- Каждая сторона видит свою долю в личном кабинете
- Ежемесячно генерируется Statement (выписка)

**Особенности:**
- Split настраивается на уровне релиза или отдельного трека
- При нескольких авторах — доля автора делится между ними пропорционально
- Выплата производится только после одобрения Finance-менеджером

### Статусы выплат

```
Pending → Processing → Completed
                    ↓
                 Failed (с причиной)
```

### Мультивалютность

Поддержка: **USD, EUR, RUB, TJS**

---

## 10. Аналитика

### Потоки аналитики

| Источник | Данные |
|---|---|
| Spotify for Artists | Стримы, слушатели, плейлисты, демография |
| Apple Music | Прослушивания, Shazam, покупки |
| YouTube | Просмотры видео, UGC-использование треков |
| TikTok | Использование звуков в видео |
| Meta / Instagram | Reels с треком, вовлечённость |

### Ключевые метрики

- Total Streams по периодам (день / неделя / месяц / год)
- Revenue по DSP и по периодам
- Top Tracks / Top Artists
- Top Countries / Regions
- Playlist Placements
- UGC Usage (сколько раз трек использован в UGC-контенте)
- Growth Rate (% роста стримов)

### Экспорт

- CSV — для внутреннего использования
- PDF — для отправки артистам и лейблам

---

## 11. Интеграции и API

### Внешние API (архитектура готова, подключение поэтапное)

| API | Назначение | Тип |
|---|---|---|
| Spotify Web API | Поиск релизов, треков, артистов, обложек по UPC/ISRC | Public |
| Apple Music API | Импорт альбомов, метаданных, дат релиза | Partner |
| YouTube Data API | Импорт видео, аналитика, Content ID | Public |
| ACRCloud API | Fingerprint-проверка дубликатов | Partner |
| MusicBrainz API | Авторские метаданные, композиторы | Public |
| Discogs API | Жанры, лейблы, издатели | Public |
| The MLC API | Регистрация произведений (механические права) | Partner |
| DDEX ERN | Доставка релизов на DSP | Industry |
| Mailer API | Отправка email (SendGrid / SMTP) | Public |
| Telegram Bot API | Уведомления в Telegram | Public |
| WhatsApp API | Уведомления в WhatsApp | Partner |
| Broma16 API | Статистика партнёрского DSP | Partner (doc: https://broma16.com/partner-api/) |

### Импорт релизов (алгоритм)

1. Пользователь вводит UPC / ISRC / Spotify-ссылку
2. Система обращается к Spotify API / Apple Music API
3. Получает JSON с метаданными (название, артист, треки, обложка, жанр, ISRC, дата)
4. Авто-создаётся карточка релиза и артиста
5. Пользователь проверяет и сохраняет

---

## 12. Хранилище и файлы

### Типы файлов

| Тип | Формат | Требования |
|---|---|---|
| Аудио | WAV, FLAC, MP3 | WAV 16-bit 44.1kHz минимум |
| Обложка | JPG, PNG | 3000x3000 px, RGB, не менее 72 DPI |
| Видео | MP4, MOV | 1080p минимум |
| Документы | PDF | Договоры, лицензии |

### Организация хранилища

```
/storage
  /releases
    /{release_id}
      /audio
      /cover
      /ddex
  /artists
    /{artist_id}
      /photos
  /contracts
  /statements
```

### Особенности

- Один аудиофайл может быть привязан к нескольким релизам (разные коды ISRC для разных DSP)
- Резервное копирование — ежедневно
- Доступ к файлам — по роли (артист видит только свои файлы)

---

## 13. Статусы объектов

### Релиз (Release Status)

```
draft → pending → approved → delivered → live
                ↓
             rejected (с комментарием)
live → takedown → removed
```

### Выплата (Payment Status)

```
pending → processing → completed
               ↓
            failed (с причиной)
```

### Паблишинг (Publishing Work Status)

```
not_registered → pending_registration → registered → conflict
```

### Пользователь (User Status)

```
signup_request → active → suspended → blacklisted
```

---

## 14. Что важно не пропустить

Критически важные вещи, которые легко забыть при разработке:

| # | Что | Почему важно |
|---|---|---|
| 1 | **Audit Logs** | Кто что изменил (финансы, релизы) — бизнес-безопасность |
| 2 | **Moderation Workflow** | Релиз не может попасть на DSP без одобрения модератора |
| 3 | **Asset Library** | Все загруженные файлы хранятся централизованно и доступны для повторного использования |
| 4 | **Rights Management** | Контроль прав по территориям и DSP |
| 5 | **Revenue Ingestion System** | Без импорта CSV-отчётов финансы не работают |
| 6 | **Payment Approval System** | Выплата без одобрения Finance — недопустима |
| 7 | **Contracts + Splits** | Без Split-правил роялти невозможно рассчитать |
| 8 | **Dispute Management** | Споры по правам и выплатам — обязательный раздел |
| 9 | **Analytics (расширенная)** | Очень важный блок — артисты принимают решения на основе данных |
| 10 | **DDEX SFTP/FTP сервер** | Подключается позже, но структура XML готовится с первой версии |
| 11 | **Российский ISRC-префикс** | Отдельный префикс кодов для избежания конфликтов с глобальными DSP |
| 12 | **KYC / Верификация** | Без проверки личности — выплата не производится |
| 13 | **Duplicate Detection** | ACRCloud + внутренний поиск по названию/ISRC |
| 14 | **Multi-currency** | USD, EUR, RUB, TJS — все четыре валюты |
| 15 | **Notification System** | Email + Push + Telegram для всех ключевых событий |

---

## Ссылки и референсы

| Назначение | Ссылка |
|---|---|
| Referens UI (Admin) | https://keenthemes.com/metronic/tailwind/demo4/ |
| Референс видео (Admin UI) | https://www.youtube.com/watch?v=6a3jqk3_teY |
| Figma Dashboard | https://www.figma.com/proto/yHOElIYVw3eYZoC6eVCCbY/music-dashboard-light---dark-theme |
| Broma16 API Docs | https://broma16.com/partner-api/partner-api.statistics.html |
| The MLC Public API | https://public-api.themlc.com/public-api/ |
| The MLC OpenAPI JSON | https://public-api.themlc.com/api/doc |
| DDEX Official | https://ddex.net/ |
| Audicient (Rights Ref) | https://audicient.com/features/rights-management |
| Spotify API Docs | https://developer.spotify.com/documentation/web-api |

---

*Документ подготовлен на основе технического задания Tajik Music. Версия 1.0.*
