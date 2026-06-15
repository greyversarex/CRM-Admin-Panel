
Ты должен реализовать ПОЛНУЮ интеграцию с Broma16 (ROD API). Это приоритет №1.
Без неё проект не работает. Сейчас интеграции нет вообще — 0 строк кода.

## БАЗОВАЯ ИНФОРМАЦИЯ

- **Base URL:** `https://api-rod.broma16.ru/api`
- **Авторизация:** JWT. POST /auth/login { email, password } → { access_token, refresh_token }
- **Header во всех запросах:** `X-Access-Token: {access_token}`
- **Обновление токена:** POST /auth/refresh { refresh_token } → новые токены. Выполнять автоматически при получении 401.
- **Формат ответа:** `{ status: "ok", data: ... }` или 422 с ошибками валидации.

## ЭТО НУЖНО СДЕЛАТЬ — 6 МОДУЛЕЙ

---

### МОДУЛЬ 1: BROMA16 CLIENT (ядро авторизации)

Создай файл `server/connectors/broma16-client.ts`:

1. Класс `Broma16Client`:
   - Метод `login()` — POST /auth/login, сохранить access_token + refresh_token + expires_in
   - Метод `request(method, path, body?)` — универсальный метод:
     - Добавляет заголовок `X-Access-Token`
     - При получении 401 → автоматически вызывает `refresh()` и повторяет запрос
     - При 422 → возвращает читаемую ошибку валидации
   - Метод `refresh()` — POST /auth/refresh
   - Метод `getAccountId()` — GET /user/ → достаёт account_id из data.accounts[0].id (или data.account_id)
   - Токены хранить в таблице `integration_credentials` (provider='broma16')
   - При старте сервера → проверять валидность токена, если нет — login()
   - Credentials (email/password) брать из .env: `BROMA16_EMAIL`, `BROMA16_PASSWORD`

2. Тестовый роут `/api/broma16/test` — вызывает login() + getAccountId() + возвращает результат.
   Это чтобы мы могли проверить, что авторизация работает.

---

### МОДУЛЬ 2: DICTONARIES SYNC (словари)

Создай `server/connectors/broma16-dictionaries.ts`:

1. Метод `syncAllDictionaries()` — вызывается при первом запуске и по cron (раз в неделю):
   - `GET /dictionaries/genres?object_type=music` → сохраняем в таблицу (или новую `broma16_genres`)
   - `GET /dictionaries/release-types?category=audio&language=ru` → сохраняем типы релизов
   - `GET /dictionaries/outlets` → сохраняем доступные площадки (Spotify, Apple, Yandex, VK, Zvooq...)
   - `GET /dictionaries/languages` → сохраняем языки
   - `GET /dictionaries/country-code/` → сохраняем страны

2. Роуты API (для фронта):
   - `GET /api/broma16/dictionaries/genres`
   - `GET /api/broma16/dictionaries/release-types`
   - `GET /api/broma16/dictionaries/outlets`
   - `GET /api/broma16/dictionaries/languages`

3. ВАЖНО: эти словари используются для маппинга. Например, когда пользователь выбирает
   "Сингл" в нашей форме — мы знаем, что это `release_type_id: 51` в Broma16.
   Когда выбирает площадки для дистрибуции — мы берём outlet коды из словаря.

---

### МОДУЛЬ 3: RELEASE PUSHER (отправка релиза в Broma16)

Создай `server/connectors/broma16-release.ts`:

Это САМЫЙ ВАЖНЫЙ модуль. Метод `pushReleaseToBroma16(releaseId)`:

Он берёт релиз из НАШЕЙ базы и отправляет в Broma16 по полному flow:

```
Шаг 1: ПОИСК/СОЗДАНИЕ АРТИСТА
  - Если у артиста уже есть broma16_artist_id → пропускаем
  - Иначе: GET /account/{accountId}/artist/searche?searche={artistName}
  - Если найден → сохраняем broma16_artist_id в artists
  - Если нет → POST /account/{accountId}/artist/ { name: artistName }
    → сохраняем broma16_artist_id

Шаг 2: СОЗДАНИЕ РЕЛИЗА
  - POST /repertoire/release {
      title: release.title,
      subtitle: release.subtitle || "",
      release_type_id: mapReleaseType(release.releaseType),
      performers: [broma16_artist_id],
      genres: mapGenres(release.genres),
      account_id: accountId,
      p_line: release.pLine,
      c_line: release.cLine,
      date_p_line: release.pLineYear,
      date_c_line: release.cLineYear,
      ean: release.upc,
      isTransferRelease: release.isTransfer || false
    }
  - Сохраняем полученный ID в releases.broma16_release_id

Шаг 3: ЗАГРУЗКА ТРЕКОВ (по порядку, trackNumber 1, 2, 3...)
  Для каждого трека:
  - POST /repertoire/release/{releaseId}/recording/upload
    (multipart form-data: file = аудиофайл трака, sort = trackNumber)
  - Сохраняем полученный recordingId в tracks.broma16_recording_id

Шаг 4: МЕТАДАННЫЕ ТРЕКОВ
  Для каждого трека:
  - PUT /repertoire/release/{releaseId}/recording/{recordingId} {
      title: track.title,
      genres: mapGenres(track.genres || release.genres),
      isrc: track.isrc,
      main_performer: [broma16_artist_id],
      featured_artist: mapFeaturedArtists(track),
      created_country_id: 186,  // Таджикистан — проверить точный код из словаря
      created_date: release.releaseDate
    }

Шаг 5: ПРОИЗВЕДЕНИЯ И АВТОРЫ (ОБЯЗАТЕЛЬНО! Без этого модерация не пройдёт)
  Для каждого трека:
  - POST /repertoire/release/{releaseId}/recording/{recordingId}/composition
    → получаем contributorId

  Затем для каждого автора из нашего Publishing/splits:
  - Добавить contributor с ролью и долей:
    roles: "C" (композитор) / "A" (автор текста) / "CA" (оба)
    ownership: доля в % (например "50.00")

  ⚠️ ВАЛИДАЦИЯ: сумма долей всех авторов трека ДОЛЖНА = 100%
  Если у нас нет данных об авторах → создать одного автора "Copyright Control"
  с role "CA" и ownership "100.00" — иначе Broma16 вернёт 422

Шаг 6: ЛИРИКА (если есть)
  Если у трека есть текст:
  - PUT /repertoire/release/{releaseId}/recording/{recordingId}/lyrics {
      parental_warning_type: track.isExplicit ? "explicit" : "not_explicit",
      is_instrumental: track.isInstrumental || false,
      lyrics: track.lyrics,
      language: mapLanguage(track.language || 1)  // 1 = English, проверить коды
    }

Шаг 7: ОБЛОЖКА
  - POST /repertoire/release/{releaseId}/cover/upload
    (multipart: file = coverUrl → скачать файл → отправить)

Шаг 8: ДИСТРИБУЦИЯ (выбор площадок!)
  - POST /repertoire/release/{releaseId}/distribution {
      distribution_outlets: release.selectedOutlets || ["spotify", "apple", "yandex", "vk"],
      sale_start_date: release.releaseDate
    }

Шаг 9: ОТПРАВКА НА МОДЕРАЦИЮ
  - POST /repertoire/release/{releaseId}/send-moderate
  - Обновить статус релиза: "Submitted to Broma16" / broma16_moderation_status = "pending"
```

ВАЖНЫЕ ПРАВИЛА:
- Каждый шаг логировать в deliveries или audit_log
- При ошибке 422 — возвращать ЧИТАЕМЫЙ текст ошибки (не просто статус)
- При ошибке сети — retry с backoff (3 попытки)
- Сохранять broma16_release_id, broma16_recording_id в БД (чтобы не дублировать при повторе)
- Метод должен быть идемпотентным: если broma16_release_id уже есть → обновляем, не создаём заново
- Роут API: POST /api/releases/{id}/push-to-broma16 — запускает pushReleaseToBroma16

---

### МОДУЛЬ 4: STATISTICS PULLER (получение статистики)

Создай `server/connectors/broma16-statistics.ts`:

1. Метод `requestStatisticsReport(dateFrom, dateTo, outletCodes?)`:
   - POST /stat/v1/statistics/accounts/{accountId}/report {
       dateFrom: "2024-06-01",
       dateTo: "2024-06-30",
       outlets: outletCodes ? "[spotify,apple]" : undefined
     }
   - Возвращает reportId

2. Метод `checkReportStatus(reportId)`:
   - GET /stat/v1/statistics/accounts/{accountId}/report/{reportId}
   - Возвращает { status, output_file }
   - Если status === "done" → output_file содержит URL для скачивания

3. Метод `downloadAndParseReport(reportId)`:
   - Дожидается status "done" (poll каждые 30 секунд, максимум 10 минут)
   - Скачивает файл по output_file URL
   - Парсит формат файла (CSV / XLSX)
   - Записывает данные в usage_reports таблицу
   - Матчит по ISRC / recording_id с нашими треками

4. Cron-задача: раз в день в 00:00 → requestStatisticsReport за вчерашний день
   Сохранять отчёт, парсить, обновлять аналитику

5. Роуты API:
   - POST /api/broma16/statistics/request — вручную запросить отчёт
   - GET /api/broma16/statistics/status/{reportId} — проверить статус
   - GET /api/broma16/statistics/outlets — список площадок со статистикой

---

### МОДУЛЬ 5: ARTIST SYNC (синхронизация артистов)

Создай `server/connectors/broma16-artists.ts`:

1. Метод `syncArtist(artistId)`:
   - Сначала поиск: GET /account/{accountId}/artist/searche?searche={name}
   - Если найден с artist_id → сохраняем в artists.broma16_artist_id
   - Если нет → создаём: POST /account/{accountId}/artist/ {
       name: artist.name,
       first_name: artist.firstName,
       last_name: artist.lastName,
       ipi_name_number: artist.ipi,
       isni: artist.isni
     }
   - Сохраняем broma16_artist_id

2. Добавить миграцию: поля в artists:
   - broma16_artist_id (varchar, nullable)
   - artist_h11 (integer, nullable)
   - ipi_name_number (varchar, nullable)
   - ipn (varchar, nullable)
   - isni (varchar, nullable)

---

### МОДУЛЬ 6: UI ИНТЕГРАЦИЯ

1. В форме создания релиза:
   - После сохранения релиза в Draft → кнопка "Submit to Broma16"
   - Или: при смене статуса на Approved → автоматический push в Broma16

2. В карточке релиза:
   - Показать статус в Broma16 (Draft / Pending Moderation / Approved / On Platforms)
   - Показать выбранные витрины (площадки)
   - Кнопка "Retry Push" если была ошибка

3. В админ-панели → Settings:
   - Поля для Broma16 credentials (email, password) — сохранять в integration_credentials
   - Кнопка "Test Connection"
   - Показать account_id после успешного подключения

4. В Analytics:
   - Кнопка "Sync Statistics" → запрашивает отчёт из Broma16
   - Показать последние отчёты и их статус

---

## МИГРАЦИИ БД

Создай миграцию, добавляющую поля:

```sql
ALTER TABLE releases ADD COLUMN broma16_release_id INTEGER;
ALTER TABLE releases ADD COLUMN broma16_moderation_status VARCHAR DEFAULT NULL;
ALTER TABLE releases ADD COLUMN broma16_distribution_outlets JSONB DEFAULT NULL;
ALTER TABLE releases ADD COLUMN broma16_pushed_at TIMESTAMP DEFAULT NULL;

ALTER TABLE tracks ADD COLUMN broma16_recording_id INTEGER;

ALTER TABLE artists ADD COLUMN broma16_artist_id VARCHAR DEFAULT NULL;
ALTER TABLE artists ADD COLUMN artist_h11 INTEGER DEFAULT NULL;
ALTER TABLE artists ADD COLUMN ipi_name_number VARCHAR DEFAULT NULL;
ALTER TABLE artists ADD COLUMN ipn VARCHAR DEFAULT NULL;
ALTER TABLE artists ADD COLUMN isni VARCHAR DEFAULT NULL;
```

---

## ПОРЯДОК ВЫПОЛНЕНИЯ (СТРОГО!)

1. Сначала МОДУЛЬ 1 (клиент + авторизация) — и СРАЗУ проверь, что логин работает
2. Затем МОДУЛЬ 2 (словари) — проверь, что словари загружены
3. Затем МОДУЛЬ 5 (артисты) — проверь синхронизацию
4. Затем МОДУЛЬ 3 (релизы) — САМОЕ СЛОЖНОЕ, делай по шагам
5. Затем МОДУЛЬ 4 (статистика)
6. Затем МОДУЛЬ 6 (UI)

После каждого модуля проверяй, что он работает, прежде чем переходить к следующему.

---

## .ENV ПЕРЕМЕННЫЕ

```
BROMA16_EMAIL=...  (получим от заказчика)
BROMA16_PASSWORD=...  (получим от заказчика)
BROMA16_API_URL=https://api-rod.broma16.ru/api
```

Пока credentials нет — используй заглушки и проверяй что код хотябы компилируется
и корректно обрабатывает отсутствие credentials (не крашится, выдаёт понятную ошибку).

---

## ЧЕГО НЕ ДЕЛАТЬ

- НЕ пиши свой DDEX delivery на DSP — это работа Broma16
- НЕ пиши SFTP-транспорт для отправки на площадки — Broma16 делает это
- НЕ дублируй DDEX генератор — оставь существующий для ACRCloud
- Оставь существующий DDEX/SFTP код для ACRCloud, но не используй его для доставки на DSP

---

## ФОРМАТ ОТВЕТА

После реализации — для каждого модуля сообщи:
1. Какие файлы созданы/изменены
2. Какие миграции добавлены
3. Работает ли модуль (тест)
4. Что нужно для тестирования на реальных данных (credentials)
