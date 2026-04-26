# DDEX-доставка: архитектура

> Документ описывает целевую архитектуру модуля DDEX-доставки релизов
> в DSP-партнёров (Spotify, Apple, Deezer, VK Music, Yandex, Zvuk и т.д.).
> Это **план**, не реализация. Сейчас в коде есть только упрощённый ERN-генератор
> и каркас SFTP-коннектора.

---

## 1. Цели и не-цели

### Цели
- Отгружать релизы в любые DSP по единому DDEX-стандарту (ERN-4.3 / ERN-3.8.1).
- Поддержать все три типа сообщений: **Initial / Update / Takedown**.
- Корректно обрабатывать подтверждения (acknowledgements) от партнёров.
- Хранить полный аудит каждой отправки (XML, файлы, ответ партнёра).
- Делать ретраи и батчинг автоматически, без ручного вмешательства оператора.

### Не-цели (пока)
- Полное соответствие всем профилям ERN-4.3 (AudioBook, Classical, Mechanical Licensing).
- Прямая интеграция с CWR (musical works registration — отдельный модуль publishing).
- DDEX MEAD (Media Enrichment) и PIE (Party Identification Exchange) — позже.

---

## 2. Что уже есть в коде

| Артефакт | Назначение | Статус |
|---|---|---|
| `connectors/base.ts` | `IConnector` интерфейс с `deliverRelease()` | ✅ готово |
| `connectors/ddex-sftp.ts` | SFTP-коннектор + `generateDdexErn()` | ⚠️ упрощён |
| `connectors/registry.ts` | Реестр коннекторов по `code` | ✅ готово |
| `workers/delivery-worker.ts` | Очередь, retry, audit-log | ✅ готово |
| `deliveries` table | Очередь доставок (1 релиз × 1 таргет) | ✅ готово |
| `integrations` + `integration_credentials` | Настройки и креды партнёров (AES-256-GCM) | ✅ готово |

**Чего нет:**
- Отдельной таблицы `ddex_messages` — сейчас XML лежит в `deliveries.xml_payload`,
  что не даёт нормально отслеживать `Update`/`Takedown` как отдельные сообщения.
- Понятия **batch** (один SFTP-аплоад с несколькими релизами).
- ERN-блоков `Deal`, `TerritoryCode`, `UseType`, `RightsController`.
- Парсера ack-сообщений (DDEX MLC / DSR / партнёрские CSV).

---

## 3. Схема БД

Добавляются **две новые таблицы**, существующая `deliveries` остаётся (становится "queue + last state",
а сообщения — отдельная сущность с историей).

### 3.1. `ddex_batches`

Один batch = один физический аплоад на SFTP партнёра. Может содержать 1..N сообщений
(партнёры обычно требуют слать пачками, а не по одному).

```ts
ddexBatchesTable {
  id: serial PK
  batchRef: text unique          // BATCH-2026-04-26-vk_music-001
  partnerCode: text              // 'vk_music' / 'spotify' / 'ddex_main'
  partyIdSender: text            // наш PADPIDA
  partyIdRecipient: text         // PADPIDA партнёра
  ernVersion: text               // '4.3' | '3.8.1'

  // Состояние
  status: text                   // building | uploading | uploaded | acked | rejected | partial
  uploadedAt: timestamp
  ackReceivedAt: timestamp

  // Транспорт
  remotePath: text               // /incoming/2026-04-26/BATCH-001/
  manifestFilename: text         // BatchComplete_xxx.xml (DDEX-сигнал «пакет готов»)
  totalBytes: integer
  fileCount: integer

  // Аудит
  createdBy: integer FK users
  createdAt, updatedAt
  index(partnerCode, status), index(batchRef)
}
```

### 3.2. `ddex_messages`

Одно сообщение = один ERN XML, относящийся к одному релизу.
В одном batch может быть много сообщений (например, 5 новых релизов + 2 апдейта + 1 takedown).

```ts
ddexMessagesTable {
  id: serial PK
  messageRef: text unique        // MSG-vk_music-2026-04-26-0001
  batchId: integer FK ddex_batches (nullable — пока not assigned)
  releaseId: integer FK releases
  deliveryId: integer FK deliveries (nullable — связь с очередью)

  // Тип сообщения (DDEX MessageControlType)
  messageType: text              // 'NewReleaseMessage' | 'UpdateReleaseMessage' | 'TakedownReleaseMessage'
  updateIndicator: text          // 'OriginalMessage' | 'UpdateMessage' | 'TakedownMessage'

  // Версия + профиль
  ernVersion: text               // '4.3'
  profile: text                  // 'AudioAlbum' | 'AudioSingle' | 'Video' | 'AudioBook'

  // XML
  xmlPayload: text               // полный сгенерированный XML
  xmlHash: text                  // sha256 — для дедупликации
  xmlSizeBytes: integer

  // Состояние
  status: text                   // draft | validated | queued | sent | acked | rejected
  validationErrors: jsonb        // массив ошибок XSD/бизнес-валидации
  sentAt: timestamp
  ackedAt: timestamp
  ackPayload: jsonb              // распарсенный ответ партнёра (см. §6)
  rejectionReason: text

  // Связи между сообщениями (для Update/Takedown — ссылка на оригинал)
  parentMessageId: integer FK self (nullable)

  createdAt, updatedAt
  index(releaseId), index(batchId), index(status), index(messageType)
}
```

### 3.3. `ddex_message_resources` (опционально, на этап 2)

Каждый файл (audio WAV + cover JPG + опционально video MP4), приложенный к ERN.
Нужно, если хотим отслеживать, какие файлы реально загрузились на SFTP, а какие — нет.

```ts
ddexMessageResourcesTable {
  id, messageId FK, kind (audio|image|video),
  fileName, fileSize, sha1, sourceAssetId FK assets,
  uploadStatus (pending|uploaded|failed), uploadedAt
}
```

### 3.4. Что меняется в `deliveries`
- Поле `xml_payload` **депрекейтится** (остаётся для бэк-совместимости, новых записей не пишет).
- Появляется внешний ключ `currentMessageId → ddex_messages.id`, чтобы из очереди
  можно было прыгнуть к актуальному сообщению.
- Статусы `deliveries.status` остаются как есть (queued/processing/sent/delivered/failed/cancelled),
  но семантика «delivered» = пришёл ack по `ddex_messages.acked_at`.

---

## 4. ERN-4.3 профиль (полный)

Сейчас `generateDdexErn()` генерирует **минимальный валидный** ERN. Этого хватит, чтобы
XML прошёл синтаксическую проверку, но партнёры будут отбивать сообщения, если нет
обязательных бизнес-блоков (Deal, TerritoryCode, UseType).

Полный ERN-4.3 для `AudioAlbum` profile должен содержать:

### 4.1. MessageHeader (есть, но неполный)
- `MessageId` ✅
- `MessageThreadId` — тот же для всех сообщений по одному релизу (Initial→Update→Takedown)
- `MessageSender` — наш `PartyId` (PADPIDA-2024XXXXXXX-T) + `PartyName`
- `MessageRecipient` — `PartyId` партнёра (у каждого DSP свой PADPIDA)
- `MessageCreatedDateTime`
- `MessageControlType` — **Initial / Update / Takedown** (вот где живёт суть)
- `MessageAuditTrail` — (опционально) цепочка прошлых сообщений

### 4.2. PartyList
Должен содержать всех артистов и правообладателей с их ролями:
- `Party` для главного артиста (`MainArtist`)
- `Party` для feat-артистов (`FeaturedArtist`)
- `Party` для лейбла (`Label` / `RightsController`)
- `Party` для композиторов и авторов (`Composer`, `Lyricist`) — обязательно для PRO/MLC

### 4.3. ResourceList (есть, но неполный)
Каждая `<SoundRecording>`:
- `ResourceReference` ✅
- `Type` ✅
- `ResourceId/ISRC` ✅
- `DisplayTitleText` ✅
- `Duration` ✅
- **+ ContributorList** — список Party-ссылок с ролями (нужен для распределения роялти)
- **+ PLine** + **CLine** — копирайт (есть только PLine на лейбл, нужны на композицию)
- **+ TechnicalDetails** — sample rate, bit depth, channels, кодек (текущий placeholder)
- **+ ParentalWarningType** — `Explicit` / `NotExplicit` / `Unknown`
- **+ LanguageOfPerformance** — ISO 639-1 (`tg`, `ru`, `en`)

И отдельный `<Image>` для обложки + `<Video>` если video-релиз.

### 4.4. ReleaseList (есть, но неполный)
- `ReleaseId/ICPN` (UPC) ✅
- `DisplayTitleText` ✅
- `DisplayArtist` ✅
- `ReleaseType` ✅ (нужно вычислять: 1 трек = `Single`, 2-6 = `EP`, 7+ = `Album`)
- **+ Genre** — DDEX GenreCode (`Pop`, `WorldMusic`, `Folk`)
- **+ ReleaseLabelReference** — ссылка на лейбл из PartyList
- **+ OriginalReleaseDate** ✅ + **OriginalDigitalReleaseDate** + **GlobalReleaseDate**
- **+ PLine** + **CLine** на сам релиз
- **+ ResourceGroupContentItem** — порядок треков (есть, но плоский, без `SequenceNumber`)
- **+ Marketing/Promotional info** — (опционально) booklet, lyrics

### 4.5. DealList (нет — критично!)
Без этого блока **ни один партнёр не примет релиз**. Указывает:
- На какой территории релиз доступен (`TerritoryCode` — `Worldwide` / список ISO-стран).
- Какие виды использования разрешены (`UseType` — `Stream`, `PermanentDownload`, `OnDemandStream`, `NonInteractiveStream`).
- Цена (`PriceInformation` — `WholesalePricePerUnit`) — для downloads.
- Окно действия (`ValidityPeriod` — startDate/endDate).
- Эксклюзивы и пре-релиз (`PreOrderReleaseDate`, `InstantGratificationResource`).

Структура:
```xml
<DealList>
  <ReleaseDeal>
    <DealReleaseReference>R0</DealReleaseReference>
    <Deal>
      <DealTerms>
        <CommercialModelType>SubscriptionModel</CommercialModelType>
        <Usage><UseType>OnDemandStream</UseType></Usage>
        <TerritoryCode>Worldwide</TerritoryCode>
        <ValidityPeriod><StartDate>2026-04-26</StartDate></ValidityPeriod>
      </DealTerms>
    </Deal>
  </ReleaseDeal>
</DealList>
```

### 4.6. Различия по профилям
- **AudioSingle** — то же, но `ReleaseType=Single`, ровно одна `SoundRecording`.
- **AudioAlbum** — N `SoundRecording`, `<ResourceGroup>` с `<SequenceNumber>`.
- **Video** — `<Video>` ресурс вместо/вместе с `<SoundRecording>`, `Profile=VideoAlbum`.
- **Mixed** — для альбомов с видеоклипами.

---

## 5. Жизненный цикл сообщения

```
                ┌────────────┐
оператор жмёт   │            │
"Отгрузить" ───►│   draft    │
                └─────┬──────┘
                      │ generate ERN
                      ▼
                ┌────────────┐
                │ validated  │ ← XSD + бизнес-валидация
                └─────┬──────┘
                      │ assign to batch
                      ▼
                ┌────────────┐
                │   queued   │ ← воркер видит в БД
                └─────┬──────┘
                      │ batch upload to SFTP
                      ▼
                ┌────────────┐
                │    sent    │ ← XML и файлы залиты, BatchComplete отправлен
                └─────┬──────┘
                      │ partner ack (часы/дни)
              ┌───────┴────────┐
              ▼                ▼
        ┌─────────┐     ┌──────────┐
        │  acked  │     │ rejected │ ← партнёр вернул error CDF/DSR
        └─────────┘     └──────────┘
```

### Подробно по этапам:

**1. generate**
- Воркер собирает данные из `releases` + `tracks` + `assets` + `splits` + `artists`.
- Вызывает `ernBuilder.build(release, partner)` → возвращает XML + список приложенных файлов.
- Создаётся запись в `ddex_messages` со статусом `draft`.

**2. validate**
- XSD-валидация против официальных схем DDEX (`http://ddex.net/xml/ern/43`).
- Бизнес-валидация: UPC заполнен, у каждого трека есть ISRC, аудио-файлы существуют в S3, splits = 100%.
- Если ошибки → `status=draft`, `validation_errors=[...]`, оператор увидит в UI.
- Если ОК → `status=validated`.

**3. assign to batch**
- Группируем по `(partnerCode, ernVersion, validityWindow)`.
- Если есть `building` batch для этого партнёра — добавляем туда.
- Иначе создаём новый batch.
- Триггер на отправку: либо `BATCH_SIZE_THRESHOLD` (например 50 сообщений), либо
  `BATCH_FLUSH_INTERVAL` (например, каждые 30 минут все building → uploading).

**4. deliver (upload)**
- Воркер берёт `ddex_batches` со статусом `uploading`.
- Подключается по SFTP/SSH к `ctx.credentials.host:port`.
- Заливает в `/incoming/{batchRef}/`:
  - Один XML на сообщение: `MSG-xxx.xml`.
  - Аудио: `{ISRC}.wav` (24-bit/44.1kHz или выше).
  - Обложка: `{UPC}.jpg` (3000×3000 RGB).
- Последним заливает `BatchComplete_{batchRef}.xml` — это сигнал партнёру «пакет готов».
- При успехе: `batch.status=uploaded`, все вложенные `messages.status=sent`.

**5. ack**
Партнёры подтверждают по-разному (см. §6). Парсер ack-файлов:
- Скачивает с SFTP `/outbox/` или принимает webhook.
- Парсит `MessageAcknowledgement` или `DealAcknowledgement` (DDEX) или партнёрский CSV.
- Находит `ddex_messages` по `messageRef` → пишет `acked_at` или `rejected_at + reason`.
- Если ack-OK для всех сообщений в batch → `batch.status=acked`.
- Если есть rejection → `batch.status=partial`, оператор видит детали в UI.

---

## 6. Сценарии: Update / Takedown

### 6.1. Initial release (Original)
- Первая отправка релиза в DSP.
- `messageType=NewReleaseMessage`, `updateIndicator=OriginalMessage`.
- `parent_message_id=null`.
- Создаёт у партнёра запись о релизе.

### 6.2. Update — что-то поменялось
**Когда вызывается:** оператор поправил метаданные (название трека, исполнитель, обложка).

- `messageType=NewReleaseMessage` (DDEX так требует — UpdateReleaseMessage в 4.3 deprecated)
- `updateIndicator=UpdateMessage`
- В `MessageHeader/MessageThreadId` тот же ID, что и у Initial.
- `parent_message_id` = ID последнего успешного сообщения по этому релизу.
- Партнёр **полностью заменяет** свою запись содержимым этого XML — нельзя слать «дельту».
- ICPN/UPC и большинство ISRC должны совпадать с оригиналом, иначе партнёр может потребовать takedown+new.

**Что можно безопасно менять:**
- Метаданные (`DisplayTitleText`, `Genre`, `ParentalWarningType`).
- Обложку (новый `<Image>` файл).
- Список деалов (расширить территории, продлить `ValidityPeriod`).

**Что НЕЛЬЗЯ менять Update'ом:**
- UPC релиза → требует takedown + новый релиз.
- ISRC треков → то же.
- Состав треков (добавить/удалить track) → большинство партнёров требуют takedown + new.

### 6.3. Takedown — снять с продажи
**Когда:** жалоба на права, артист просит убрать, лейбл расторг договор.

- `messageType=NewReleaseMessage`, `updateIndicator=TakedownMessage`.
- В `DealList` каждого Deal указывается `<TakeDown>true</TakeDown>` или
  `ValidityPeriod/EndDate` = вчера.
- После ack от партнёра: `releases.status='takedown'`, нотификация артисту/лейблу.

### 6.4. Edge cases (отдельная логика)
- **Re-delivery после rejection** — повторный Initial с новым `messageRef`, но тот же `messageThreadId`.
- **Takedown + Re-release** — два сообщения подряд: takedown + new (с новым UPC).
- **Partial takedown** — снять только в одной территории: Update с `Deal/TerritoryCode` exclusion list.

---

## 7. Acknowledgements: что слушать

DDEX определяет **MessageAcknowledgement**, но почти каждый партнёр имеет свой формат.

| Партнёр | Формат ack | Транспорт |
|---|---|---|
| Spotify (для агрегаторов) | DDEX `FileType=Acknowledgement` XML | SFTP `/outbox/` |
| Apple Music | Apple-specific `Status.xml` | SFTP `/outbox/` |
| Deezer | DDEX `MessageAcknowledgement` | SFTP |
| YouTube CMS | JSON через REST API + SNS | API/Webhook |
| VK Music / Yandex / Zvuk | CSV отчёт раз в день | SFTP / Email |
| TikTok | JSON webhook | HTTPS POST |

**Парсер должен:**
1. Каждые N минут (или по webhook) забирать ack-файлы из `/outbox/{partner}/`.
2. По типу файла — выбирать парсер (`AckParser` интерфейс).
3. Извлекать `messageRef` (или `partnerInternalId`, который мы сохранили).
4. Обновлять `ddex_messages.status` + `acked_at` / `rejected_at` + `ackPayload`.
5. После полного ack по batch → `releases.status='live'` + нотификация.

---

## 8. Библиотеки

### 8.1. Что уже стоит
- `ssh2-sftp-client` — **НЕ установлено**, добавить (см. ниже).
- Express, Drizzle, zod — есть.

### 8.2. Что добавить (продакшн)

| Пакет | Зачем | Альтернативы |
|---|---|---|
| `ssh2-sftp-client` | SFTP upload/download | `node-ssh` |
| `xmlbuilder2` | Безопасная генерация XML с namespaces | ручная конкатенация (хрупко) |
| `libxmljs2` или `xsd-schema-validator` | XSD-валидация ERN-XML | без валидации = слать вслепую |
| `fast-xml-parser` | Парсинг входящих ack | `xml2js` |
| `mime-types` | MIME для аудио/изображений | вручную |

### 8.3. Что НЕ нужно ставить
- Полные DDEX SDK от вендоров (DDEX Workbench и т.п.) — закрыты или платные.
- Java-инструменты (DDEX Reference Implementation на Java) — не стыкуется с Node.

### 8.4. Официальные XSD-схемы DDEX
- ERN-4.3: `http://ddex.net/xml/ern/43/release-notification.xsd`
- ERN-3.8.1: `http://ddex.net/xml/ern/381/release-notification.xsd`
- Скачать локально (в `lib/ddex-schemas/`) и валидировать оффлайн — DDEX-схемы не меняются часто.

---

## 9. Файловая структура (целевая)

```
artifacts/api-server/src/
├── ddex/
│   ├── ern-builder/
│   │   ├── index.ts                  // главный entry: build(release, partner) → {xml, files}
│   │   ├── builders/
│   │   │   ├── audio-album.ts        // AudioAlbum profile
│   │   │   ├── audio-single.ts
│   │   │   └── video-album.ts
│   │   ├── parts/                    // переиспользуемые блоки
│   │   │   ├── message-header.ts
│   │   │   ├── party-list.ts
│   │   │   ├── resource-list.ts
│   │   │   ├── release-list.ts
│   │   │   └── deal-list.ts
│   │   └── escape.ts
│   ├── validators/
│   │   ├── xsd-validator.ts          // libxmljs2 + локальные XSD
│   │   └── business-validator.ts     // UPC/ISRC/splits/assets
│   ├── ack-parsers/
│   │   ├── ddex-standard.ts          // <MessageAcknowledgement>
│   │   ├── apple-status.ts
│   │   ├── youtube-cms.ts
│   │   └── csv-vk.ts
│   ├── batching/
│   │   ├── batcher.ts                // assign messages → batches
│   │   └── flush-policy.ts           // size/time triggers
│   ├── transports/
│   │   ├── sftp.ts                   // ssh2-sftp-client wrapper
│   │   └── webhook.ts                // для DSP с REST API
│   └── service.ts                    // высокоуровневое API: queueRelease(release, partner)
├── workers/
│   ├── delivery-worker.ts            // существует; мигрирует на ddex/service.ts
│   └── ack-poller.ts                 // НОВЫЙ: периодически тянет /outbox/
└── routes/
    ├── delivery.ts                   // существует; UI для оператора
    └── ddex.ts                       // НОВЫЙ: батчи, сообщения, ack-логи

lib/db/src/schema/
├── deliveries.ts                     // существует; добавить currentMessageId FK
├── ddex-messages.ts                  // НОВЫЙ
├── ddex-batches.ts                   // НОВЫЙ
└── ddex-message-resources.ts         // НОВЫЙ (фаза 2)

lib/ddex-schemas/                     // НОВЫЙ — оффлайн XSD
├── ern43/release-notification.xsd
└── ern381/release-notification.xsd
```

---

## 10. Безопасность и операционка

### 10.1. Секреты
- SFTP-логины партнёров — `integration_credentials` (AES-256-GCM, как сейчас).
- SSH private keys — `cipher_text` той же таблицы, поле `field_key='ssh_private_key'`.
- Никогда не логировать XML целиком в plaintext-логи (контрактные данные).

### 10.2. Идемпотентность
- `messageRef` уникален → повторная генерация того же сообщения не приведёт к дубликату на стороне партнёра.
- `batch.status` через атомарные `UPDATE ... WHERE status=...RETURNING` (как в текущем `delivery-worker`).

### 10.3. Наблюдаемость
- Все переходы статусов → `audit_log` (есть инфраструктура).
- Метрики: `ddex_messages_total{status}`, `ddex_batch_size`, `ddex_upload_duration_seconds`,
  `ddex_ack_lag_hours{partner}`.
- Алерты: batch висит в `uploading` >1 ч; rejection rate >5% за сутки; нет ack >7 дней.

### 10.4. Ретраи и idempotency партнёра
- На уровне batch: max 5 попыток upload, экспоненциальный backoff (как в текущем worker).
- На уровне сообщения: если партнёр rejected — оператор смотрит, правит данные, жмёт «Re-deliver» → новое сообщение с тем же `MessageThreadId`.
- При SFTP-обрыве посередине загрузки: удалить недозалитые файлы и `BatchComplete*.xml` НЕ слать → партнёр batch не подхватит, повторная попытка через retry.

---

## 11. План миграции (фазы)

| Фаза | Что делаем | Результат |
|---|---|---|
| **0** (сейчас) | Этот документ + согласование с пользователем | Договорились |
| **1** | Миграция БД: `ddex_messages` + `ddex_batches`, FK от `deliveries.current_message_id` | Можем хранить полную историю сообщений |
| **2** | `ern-builder` с `AudioAlbum`/`AudioSingle` profiles + DealList | XML принимается XSD-валидатором |
| **3** | `xsd-validator` + `business-validator` + UI «ошибки валидации» | Никакой мусор в SFTP не уйдёт |
| **4** | `transports/sftp.ts` (`ssh2-sftp-client`) + один пилотный партнёр (например, `vk_music`) | Реальная отгрузка одного релиза |
| **5** | `batching` + `ack-poller` для DDEX-стандартных ack | Конвейер замкнут |
| **6** | `Update` + `Takedown` сценарии в UI | Полный CRUD по релизам в DSP |
| **7** | Партнёр-специфичные ack-парсеры (Apple, YouTube, VK CSV) | Каждый DSP подтверждает корректно |
| **8** | Метрики, алерты, дашборд DDEX-операций | Production-ready |

---

## 12. Открытые вопросы (решаем при имплементации)

1. **Хранилище XML** — текстом в БД (как сейчас) или объектным хранилищем (S3/replit object-storage)?
   Рекомендация: до 100 KB — БД; больше — S3 + ссылка в `xml_payload_url`.
2. **Multi-tenant** — у каждого лейбла свой PADPIDA или один общий? Сейчас `partyId`
   захардкожен; в БД нужно поле `labels.party_id`.
3. **Audio transcoding** — у нас в `assets` лежит исходник (WAV/FLAC). Партнёрам обычно
   нужен 24/44.1 WAV. Делать transcode на лету или требовать соответствующий upload?
4. **Видео** — отгружать одновременно с аудио (`Mixed` profile) или отдельной доставкой
   на YouTube/Vevo?
5. **CWR / publishing** — отдельный модуль или интегрировать через DDEX-MWN
   (Musical Work Notification)? CWR требует регистрации в CISAC, что отдельный процесс.

---

**Итого:** документ описывает 8-фазный план перехода от текущего «MVP-каркас» к полноценному
DDEX-конвейеру. Каждая фаза — изолированный кусок работы (1-3 дня), который можно делать
отдельной задачей. Параллелить можно фазы 2-3 (XML + валидаторы) и 4 (транспорт).
