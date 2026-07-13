/**
 * DDEX-сервис — высокоуровневый API для остального бэкенда.
 *
 *   createMessage(releaseId, partnerCode, type) → собирает контекст из БД,
 *     валидирует, генерирует XML, сохраняет в `ddex_messages` (status=draft|invalid|validated).
 *
 *   processMessage(messageId) → создаёт/находит batch, грузит файлы через transport,
 *     обновляет статусы (sent), пишет audit-log.
 *
 *   ingestAck(rawXml, source) → парсит ack, обновляет message.status=acked|rejected,
 *     создаёт запись в `ddex_acknowledgements`.
 */

import path from "node:path";
import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  releasesTable,
  tracksTable,
  artistsTable,
  labelsTable,
  assetsTable,
  splitsTable,
  ddexMessagesTable,
  ddexBatchesTable,
  ddexAcknowledgementsTable,
  integrationsTable,
  auditLogTable,
  releaseArtistsTable,
  type Release, type Track,
} from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { LOCAL_STORAGE_ROOT } from "../lib/objectStorage";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";
import { buildErn } from "./ern-builder";
import { validateBusinessRules, validateSplits, type ValidationError } from "./business-validator";
import { getTransport, type TransportFile } from "./transports";
import { parseAck } from "./ack-parser";
import type {
  BuildErnInput, ContributingArtist, DealConfig, MessageType,
  PartnerContext, Profile, ReleaseContext, ResourceFile,
  SplitParticipant, TrackContext, UpdateIndicator,
} from "./types";

// ── Конфиг по умолчанию ─────────────────────────────────────────────
const DEFAULT_PARTY_ID_SENDER = process.env.DDEX_SENDER_PARTY_ID || "PADPIDA-2024053004-T";
const DEFAULT_PARTY_NAME_SENDER = process.env.DDEX_SENDER_PARTY_NAME || "Tajik Music Distribution";
const DEFAULT_DEAL_USE_TYPES = ["OnDemandStream", "PermanentDownload"] as const;

/**
 * Фиксированные значения config для партнёров доставки, «зашитые» в код, чтобы
 * оператору не нужно было вручную вводить технические параметры (бакет, регион,
 * DDEX PartyId и т.д.). Значения из таблицы integrations (Настройки → Интеграции)
 * ВСЕГДА переопределяют эти дефолты — см. getEffectiveIntegrationConfig().
 * Секреты (ключи доступа) здесь НЕ хранятся — только зашифрованно в
 * integration_credentials.
 *
 * ACRCloud (direct S3 partnership): мы кладём полный DDEX ERN-4.3 пакет
 * (XML + WAV + cover) в их бакет, ACRCloud добавляет релиз в свою базу
 * отпечатков для проверки на дубликаты.
 */
const PARTNER_DELIVERY_DEFAULTS: Record<string, Record<string, string>> = {
  acrcloud_ddex: {
    transport: "s3",
    region: "us-east-1",
    bucket: "acrcloud-partners",
    prefix: "TajikMusic",
    partyIdSender: "PA-DPIDA-2024053004-T",
    partyNameSender: "Tajik Music",
    partyIdRecipient: "PADPIDA2016110503N",
    partyNameRecipient: "ACRCloud",
  },
};

/**
 * «Эффективный» config интеграции: дефолты из кода (если они есть для данного
 * кода), поверх которых накладывается config из БД. Значения из БД, введённые
 * оператором, имеют приоритет; пустые строки/undefined дефолт НЕ затирают.
 */
export function getEffectiveIntegrationConfig(
  code: string,
  dbConfig: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...(PARTNER_DELIVERY_DEFAULTS[code] ?? {}) };
  for (const [k, v] of Object.entries(dbConfig ?? {})) {
    if (v !== null && v !== undefined && String(v).trim() !== "") out[k] = String(v);
  }
  return out;
}

// ── Контекст из БД ───────────────────────────────────────────────────

/**
 * Преобразует storageKey/objectPath в локальный файловый путь.
 * Для assets.objectPath вида `/objects/uploads/<uuid>` склеиваем с LOCAL_STORAGE_ROOT.
 */
export function resolveAssetLocalPath(objectPath: string | null, storageKey: string | null): string | null {
  // Защитный fallback для legacy-строк: если storageKey не содержит ожидаемого
  // root-префикса ("private/" или "public/"), доверяем ему меньше и пробуем
  // путь от objectPath (где префикс гарантирован). См. миграцию
  // 0017_assets_storage_key_backfill.sql и комментарий в routes/assets.ts confirm.
  const hasKnownPrefix = (k: string): boolean =>
    k.startsWith("private/") || k.startsWith("public/");
  if (storageKey && hasKnownPrefix(storageKey)) {
    return path.join(LOCAL_STORAGE_ROOT, storageKey);
  }
  if (objectPath?.startsWith("/objects/")) {
    const relative = objectPath.replace(/^\/objects\//, "");
    return path.join(LOCAL_STORAGE_ROOT, "private", relative);
  }
  if (storageKey) return path.join(LOCAL_STORAGE_ROOT, storageKey);
  return null;
}

async function buildReleaseContext(releaseId: number): Promise<ReleaseContext> {
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!release) throw new Error(`Release ${releaseId} не найден`);

  const [artist] = await db.select().from(artistsTable).where(eq(artistsTable.id, release.artistId));
  const label = release.labelId
    ? (await db.select().from(labelsTable).where(eq(labelsTable.id, release.labelId)))[0]
    : null;

  const tracks = await db.select().from(tracksTable)
    .where(eq(tracksTable.releaseId, releaseId))
    .orderBy(tracksTable.trackNumber);

  // ── Артисты релиза из release_artists (feat. и дополнительные primary) ──
  // Запрашиваем все роли, кроме primary (у нас уже есть mainArtist из artistId).
  // Если таблица пустая — featuredArtists остаётся [].
  const releaseArtistRows = await db
    .select({
      artistId: releaseArtistsTable.artistId,
      role: releaseArtistsTable.role,
      position: releaseArtistsTable.position,
    })
    .from(releaseArtistsTable)
    .where(eq(releaseArtistsTable.releaseId, releaseId))
    .orderBy(releaseArtistsTable.position);

  const featuredArtists: ContributingArtist[] = [];
  for (const row of releaseArtistRows) {
    if (row.role === "primary") continue; // primary — это mainArtist, уже добавлен
    const [fa] = await db.select().from(artistsTable).where(eq(artistsTable.id, row.artistId));
    if (!fa) continue;
    const ddexRole: ContributingArtist["role"] =
      row.role === "featuring" || row.role === "with" ? "FeaturedArtist" : "FeaturedArtist";
    featuredArtists.push({
      partyRef: `P_ARTIST_${fa.id}`,
      fullName: fa.name,
      role: ddexRole,
    });
  }

  // Cover asset (kind=cover, releaseId=this).
  // ВАЖНО: assets-таблица использует kind="cover" (см. routes/assets.ts:188 mimePrefix
  // и schema). Раньше здесь ошибочно искался kind="image" — поэтому DDEX-валидатор
  // всегда возвращал COVER_MISSING даже при загруженной обложке.
  // Обложку ищем сначала по releaseId. Если строки нет — обложку загрузили в
  // "пул" ассетов и связали через release.coverUrl (track_id/release_id на самой
  // строке ассета может быть null) — добираем ассет по objectPath из coverUrl.
  let [coverAsset] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.releaseId, releaseId), eq(assetsTable.kind, "cover")))
    .limit(1);
  if (!coverAsset && release.coverUrl) {
    [coverAsset] = await db.select().from(assetsTable)
      .where(and(eq(assetsTable.objectPath, release.coverUrl), eq(assetsTable.kind, "cover")))
      .limit(1);
  }

  const cover: ResourceFile | null = coverAsset
    ? {
        source: resolveAssetLocalPath(coverAsset.objectPath, coverAsset.storageKey) ?? coverAsset.objectPath,
        filename: `cover_${release.upc ?? release.id}.jpg`,
        mimeType: coverAsset.mimeType,
        sizeBytes: coverAsset.sizeBytes,
        sha1: coverAsset.sha256?.slice(0, 40) ?? undefined,
      }
    : null;

  // Audio assets per track
  const trackContexts: TrackContext[] = [];
  for (const t of tracks) {
    // Аудио ищем сначала по trackId. Если ассет загружен в "пул" релиза
    // (track_id=null) и связан с треком только через track.audioUrl (файл выбран
    // из выпадающего списка) — добираем ассет по objectPath. Без этого трек с
    // реально прикреплённым файлом считался бы «без аудио», и ACR/DDEX падали бы.
    let [audioAsset] = await db.select().from(assetsTable)
      .where(and(eq(assetsTable.trackId, t.id), eq(assetsTable.kind, "audio")))
      .limit(1);
    if (!audioAsset && t.audioUrl) {
      [audioAsset] = await db.select().from(assetsTable)
        .where(and(eq(assetsTable.objectPath, t.audioUrl), eq(assetsTable.kind, "audio")))
        .limit(1);
    }

    const audioFile: ResourceFile | null = audioAsset
      ? {
          source: resolveAssetLocalPath(audioAsset.objectPath, audioAsset.storageKey) ?? audioAsset.objectPath,
          filename: `${t.isrc ?? `TJM${t.id}`}.wav`,
          mimeType: audioAsset.mimeType,
          sizeBytes: audioAsset.sizeBytes,
          sha1: audioAsset.sha256?.slice(0, 40) ?? undefined,
          // Реальные технические характеристики из music-metadata (могут быть null
          // для старых ассетов, загруженных до добавления колонок — builder даст fallback).
          codec: audioAsset.codec ?? undefined,
          sampleRateHz: audioAsset.sampleRateHz ?? undefined,
          bitDepth: audioAsset.bitDepth ?? undefined,
          channels: audioAsset.channels ?? undefined,
        }
      : null;

    // ── Contributors трека ─────────────────────────────────────────────
    // Используем displayArtists (jsonb) если они заполнены — там есть роли
    // primary / featuring / with / remixer. Если пусто — fallback на главного
    // артиста релиза (прежнее поведение, совместимость с ранними релизами).
    const contributors: ContributingArtist[] = [];
    const displayArtists = Array.isArray(t.displayArtists) ? t.displayArtists : [];

    if (displayArtists.length > 0) {
      for (let di = 0; di < displayArtists.length; di++) {
        const da = displayArtists[di];
        // Если artistId указан — используем стабильный partyRef P_ARTIST_{id},
        // иначе генерируем уникальный по треку/позиции.
        const pRef = da.artistId ? `P_ARTIST_${da.artistId}` : `P_DA_T${t.id}_${di}`;
        const ddexRole: ContributingArtist["role"] =
          da.role === "featuring" || da.role === "with" ? "FeaturedArtist" : "MainArtist";
        contributors.push({ partyRef: pRef, fullName: da.name, role: ddexRole });
      }
    } else {
      // Fallback: главный артист релиза
      contributors.push({
        partyRef: "P_MAIN_ARTIST",
        fullName: artist?.name ?? "Unknown Artist",
        role: "MainArtist",
      });
    }

    trackContexts.push({
      trackId: t.id,
      resourceRef: `A${t.trackNumber ?? trackContexts.length + 1}`,
      isrc: t.isrc ?? "",
      title: t.title,
      trackVersion: t.trackVersion ?? null,
      durationSeconds: t.durationSeconds ?? 0,
      language: (t.language || release.language || "tg").toLowerCase(),
      isExplicit: t.isExplicit,
      trackNumber: t.trackNumber ?? trackContexts.length + 1,
      genre: t.genre ?? null,
      subgenre: t.subgenre ?? null,
      metadataTranslations: Array.isArray(t.metadataTranslations) ? t.metadataTranslations : [],
      writers: Array.isArray(t.writers) ? t.writers : [],
      performers: Array.isArray(t.performers) ? t.performers : [],
      production: Array.isArray(t.production) ? t.production : [],
      contributors,
      audioFile,
    });
  }

  const profile: Profile = release.releaseType === "single"
    ? "AudioSingle"
    : "AudioAlbum";

  return {
    releaseId: release.id,
    upc: release.upc ?? "",
    title: release.title,
    releaseVersion: release.releaseVersion ?? null,
    releaseType: (release.releaseType as ReleaseContext["releaseType"]) ?? "single",
    profile,
    releaseDate: release.releaseDate ?? new Date().toISOString().slice(0, 10),
    genre: release.genre,
    subgenre: release.subgenre ?? null,
    language: (release.language || "tg").toLowerCase(),
    isExplicit: release.isExplicit,
    territories: release.territories ?? ["WW"],
    pLine: release.pLine,
    cLine: release.cLine,
    metadataTranslations: Array.isArray(release.metadataTranslations) ? release.metadataTranslations : [],
    mainArtist: {
      partyRef: "P_MAIN_ARTIST",
      fullName: artist?.name ?? "Unknown Artist",
      role: "MainArtist",
    },
    featuredArtists,
    label: label
      ? { partyRef: "P_LABEL", name: label.name, partyId: null }
      : null,
    cover,
    tracks: trackContexts,
  };
}

async function buildPartnerContext(partnerCode: string): Promise<PartnerContext> {
  const integration = await getIntegrationByCode(partnerCode);
  const cfg = getEffectiveIntegrationConfig(partnerCode, integration?.config as Record<string, unknown> | null);
  return {
    code: partnerCode,
    partyIdSender: cfg.partyIdSender || DEFAULT_PARTY_ID_SENDER,
    partyNameSender: cfg.partyNameSender || DEFAULT_PARTY_NAME_SENDER,
    partyIdRecipient: cfg.partyIdRecipient || `PADPIDA-${partnerCode.toUpperCase().replace(/_/g, "-")}`,
    partyNameRecipient: cfg.partyNameRecipient || (integration?.name ?? partnerCode),
  };
}

function buildDefaultDeal(release: ReleaseContext, isTakedown: boolean): DealConfig {
  return {
    commercialModel: "SubscriptionModel",
    useTypes: [...DEFAULT_DEAL_USE_TYPES],
    territories: release.territories,
    startDate: release.releaseDate,
    isTakedown,
  };
}

// ── Splits-валидация ─────────────────────────────────────────────────

async function loadSplitErrors(releaseId: number): Promise<ValidationError[]> {
  const rows = await db.select().from(splitsTable).where(eq(splitsTable.releaseId, releaseId));
  const errors: ValidationError[] = [];
  for (const s of rows) {
    const participants = (s.participants as SplitParticipant[]) ?? [];
    const e = validateSplits(participants);
    for (const err of e) errors.push({ ...err, field: `split.${s.id}.${err.field ?? "participants"}` });
  }
  return errors;
}

// ── Сервис: Create Message ───────────────────────────────────────────

export type CreateMessageInput = {
  releaseId: number;
  partnerCode: string;
  updateIndicator: UpdateIndicator;     // OriginalMessage | UpdateMessage | TakedownMessage
  /** Кто инициировал (для audit; null = system) */
  userId?: number | null;
  /** Связать с существующим deliveryId (когда вызывается из старого worker'а) */
  deliveryId?: number | null;
};

export type CreatedMessage = {
  id: number;
  messageRef: string;
  status: "draft" | "validated" | "invalid";
  validationErrors: ValidationError[];
  xmlBytes: number;
};

export async function createMessage(input: CreateMessageInput): Promise<CreatedMessage> {
  const release = await buildReleaseContext(input.releaseId);
  const partner = await buildPartnerContext(input.partnerCode);
  const isTakedown = input.updateIndicator === "TakedownMessage";
  const messageType: MessageType = isTakedown ? "PurgeReleaseMessage" : "NewReleaseMessage";
  const deal = buildDefaultDeal(release, isTakedown);

  // Валидация (для Takedown — мягче: достаточно UPC и partner)
  const businessErrors = isTakedown
    ? validateBusinessRules(release, partner, deal).filter((e) => e.code === "UPC_MISSING" || e.code === "UPC_INVALID" || e.code.startsWith("RECIPIENT_") || e.code.startsWith("SENDER_"))
    : validateBusinessRules(release, partner, deal);
  const splitErrors = isTakedown ? [] : await loadSplitErrors(input.releaseId);
  const allErrors = [...businessErrors, ...splitErrors];

  // Генерация XML (даже если есть ошибки — чтобы оператор мог посмотреть результат).
  const messageRef = `MSG-${input.partnerCode}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`;
  const messageThreadId = await pickMessageThreadId(input.releaseId, input.partnerCode);
  const buildInput: BuildErnInput = {
    release, partner, deal,
    ernVersion: "4.3",
    messageType, updateIndicator: input.updateIndicator,
    messageId: messageRef, messageThreadId,
    createdAt: new Date(),
  };
  const { xml } = buildErn(buildInput);
  const xmlHash = createHash("sha256").update(xml).digest("hex");

  // Парент-сообщение для Update/Takedown — последнее acked Initial по этому release+partner.
  const parentId = input.updateIndicator === "OriginalMessage"
    ? null
    : (await db.select({ id: ddexMessagesTable.id })
        .from(ddexMessagesTable)
        .where(and(eq(ddexMessagesTable.releaseId, input.releaseId), eq(ddexMessagesTable.partnerCode, input.partnerCode)))
        .orderBy(desc(ddexMessagesTable.createdAt))
        .limit(1))[0]?.id ?? null;

  const initialStatus = allErrors.length > 0 ? "invalid" : "validated";

  // Атомарно: создание ddex_message + audit в одной транзакции,
  // чтобы не было «есть сообщение, но нет audit-записи» при сбое второго insert'а.
  const msg = await db.transaction(async (tx) => {
    const [m] = await tx.insert(ddexMessagesTable).values({
      messageRef, messageThreadId,
      releaseId: input.releaseId,
      deliveryId: input.deliveryId ?? null,
      partnerCode: input.partnerCode,
      messageType, updateIndicator: input.updateIndicator,
      ernVersion: "4.3",
      profile: release.profile,
      xmlPayload: xml,
      xmlHash,
      xmlSizeBytes: Buffer.byteLength(xml, "utf8"),
      status: initialStatus,
      validationErrors: allErrors.length > 0 ? allErrors : null,
      parentMessageId: parentId,
    }).returning();

    await tx.insert(auditLogTable).values({
      userId: input.userId ?? null,
      action: "create",
      entityType: "ddex_message",
      entityId: m.id,
      diff: { messageRef, partnerCode: input.partnerCode, updateIndicator: input.updateIndicator, status: initialStatus, errorCount: allErrors.length },
    });
    return m;
  });

  return {
    id: msg.id,
    messageRef,
    status: initialStatus,
    validationErrors: allErrors,
    xmlBytes: msg.xmlSizeBytes,
  };
}

/**
 * Берём messageThreadId из последнего сообщения по этому (release, partner)
 * либо генерируем новый. Это критично для Update/Takedown — партнёр сшивает
 * сообщения в одну "историю релиза" по threadId.
 */
async function pickMessageThreadId(releaseId: number, partnerCode: string): Promise<string> {
  const [last] = await db.select({ messageThreadId: ddexMessagesTable.messageThreadId })
    .from(ddexMessagesTable)
    .where(and(eq(ddexMessagesTable.releaseId, releaseId), eq(ddexMessagesTable.partnerCode, partnerCode)))
    .orderBy(desc(ddexMessagesTable.createdAt))
    .limit(1);
  if (last?.messageThreadId) return last.messageThreadId;
  return `THREAD-${partnerCode}-R${releaseId}-${Date.now().toString(36)}`;
}

// ── Сервис: Process Message (= upload через transport) ───────────────

export type ProcessMessageResult = {
  ok: boolean;
  messageId: number;
  batchId: number;
  remotePath?: string;
  error?: string;
};

export async function processMessage(messageId: number): Promise<ProcessMessageResult> {
  const [msg] = await db.select().from(ddexMessagesTable).where(eq(ddexMessagesTable.id, messageId));
  if (!msg) throw new Error(`Message ${messageId} не найдено`);
  if (msg.status === "sent" || msg.status === "acked") {
    return { ok: true, messageId, batchId: msg.batchId ?? 0, remotePath: undefined };
  }
  if (msg.status === "invalid") {
    return { ok: false, messageId, batchId: msg.batchId ?? 0, error: "Сообщение в статусе invalid — устраните ошибки валидации перед отправкой" };
  }

  const integration = await getIntegrationByCode(msg.partnerCode);
  const cfg = getEffectiveIntegrationConfig(msg.partnerCode, integration?.config as Record<string, unknown> | null);

  // SAFETY: больше никаких "silent local-fs success".
  // Если интеграция вообще не настроена — fail с понятной ошибкой, чтобы
  // лейбл не думал, что релиз ушёл в DSP, когда на самом деле XML лежит
  // на VPS в .ddex-out. local-fs допустим ТОЛЬКО как явный выбор оператора
  // (например, для тестов или дев-окружения), либо если включён DDEX_ALLOW_LOCAL_FS.
  const explicitTransport = cfg.transport;
  const allowLocalFs = process.env.DDEX_ALLOW_LOCAL_FS === "1" || process.env.NODE_ENV !== "production";
  if (!integration && !allowLocalFs) {
    const errMsg = `DSP "${msg.partnerCode}" не подключена. Откройте Настройки → Интеграции и подключите коннектор перед отправкой релизов.`;
    await db.update(ddexMessagesTable).set({ status: "invalid" }).where(eq(ddexMessagesTable.id, messageId));
    return { ok: false, messageId, batchId: 0, error: errMsg };
  }
  if (!explicitTransport && !allowLocalFs) {
    const errMsg = `DSP "${msg.partnerCode}": не указан транспорт (поле config.transport). Настройте SFTP или другой транспорт в интеграции, чтобы релиз действительно был доставлен в DSP.`;
    await db.update(ddexMessagesTable).set({ status: "invalid" }).where(eq(ddexMessagesTable.id, messageId));
    return { ok: false, messageId, batchId: 0, error: errMsg };
  }
  const transportName = explicitTransport || "local-fs";
  const transport = getTransport(transportName);
  const partner = await buildPartnerContext(msg.partnerCode);

  // Создаём свой batch на каждое сообщение — простой режим.
  // (Группировку нескольких messages в один batch добавим во вторую итерацию через
  //  явный flushBatch(partnerCode) — для пилотных партнёров не нужно.)
  const batchRef = `BATCH-${msg.partnerCode}-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const [batch] = await db.insert(ddexBatchesTable).values({
    batchRef,
    partnerCode: msg.partnerCode,
    partyIdSender: partner.partyIdSender,
    partyIdRecipient: partner.partyIdRecipient,
    ernVersion: msg.ernVersion,
    status: "uploading",
    transport: transportName,
  }).returning();
  await db.update(ddexMessagesTable).set({ batchId: batch.id, status: "queued" }).where(eq(ddexMessagesTable.id, messageId));

  // Собираем файлы для transport: XML + audio (для каждого трека) + cover.
  const release = await buildReleaseContext(msg.releaseId);
  const xmlFilename = `${msg.messageRef}.xml`;
  const files: TransportFile[] = [
    { filename: xmlFilename, content: { type: "buffer", data: Buffer.from(msg.xmlPayload, "utf8") } },
  ];
  for (const t of release.tracks) {
    if (t.audioFile) files.push({
      filename: t.audioFile.filename,
      content: { type: "path", localPath: t.audioFile.source },
    });
  }
  if (release.cover) files.push({
    filename: release.cover.filename,
    content: { type: "path", localPath: release.cover.source },
  });

  let credentials: Record<string, string> = {};
  if (integration) credentials = await loadCredentials(integration.id);

  const transportCtx = {
    config: {
      ...cfg,
      partnerCode: msg.partnerCode,
      partyIdSender: partner.partyIdSender,
      partyIdRecipient: partner.partyIdRecipient,
    },
    credentials,
  };

  try {
    const upload = await transport.upload(transportCtx, batchRef, files);
    await db.update(ddexBatchesTable).set({
      status: "uploaded",
      uploadedAt: new Date(),
      remotePath: upload.remotePath,
      manifestFilename: upload.manifestFilename,
      totalBytes: upload.totalBytes,
      fileCount: upload.fileCount,
      lastError: null,
    }).where(eq(ddexBatchesTable.id, batch.id));
    await db.update(ddexMessagesTable).set({
      status: "sent", sentAt: new Date(),
    }).where(eq(ddexMessagesTable.id, messageId));

    await db.insert(auditLogTable).values({
      userId: null, action: "update", entityType: "ddex_message", entityId: messageId,
      diff: { transition: "queued→sent", transport: transportName, remotePath: upload.remotePath },
    });

    logger.info({ messageId, batchId: batch.id, batchRef, remotePath: upload.remotePath, totalBytes: upload.totalBytes }, "ddex message uploaded");
    return { ok: true, messageId, batchId: batch.id, remotePath: upload.remotePath };
  } catch (e) {
    const errorMsg = (e as Error).message;
    await db.update(ddexBatchesTable).set({
      status: "failed", lastError: errorMsg.slice(0, 1000), attempts: (batch.attempts ?? 0) + 1,
    }).where(eq(ddexBatchesTable.id, batch.id));
    await db.update(ddexMessagesTable).set({
      status: "validated", // возвращаем в очередь, retry на уровне worker
      rejectionReason: errorMsg.slice(0, 500),
    }).where(eq(ddexMessagesTable.id, messageId));
    logger.warn({ messageId, batchId: batch.id, err: errorMsg }, "ddex upload failed");
    return { ok: false, messageId, batchId: batch.id, error: errorMsg };
  }
}

// ── Сервис: ACRCloud Drop (проверка на дубликаты через S3) ───────────
//
// Отдельный путь от DSP-доставки: ACRCloud — не магазин, а сервис проверки
// авторских прав. Мы выкладываем полный DDEX ERN-4.3 пакет (XML + WAV + cover)
// в их S3-бакет, ACRCloud добавляет релиз в свою базу отпечатков. Поэтому
// здесь НЕ нужна splits/deal-валидация уровня магазина, НЕ создаются
// ddex_messages/deliveries и НЕ меняется бизнес-статус релиза. Вердикт
// («уникально/дубликат») фиксируется отдельно в acr_checks.

export type AcrDropResult = {
  messageRef: string;
  batchRef: string;
  remotePath?: string;
  uploadedFiles?: string[];
  fileCount?: number;
  totalBytes?: number;
  xmlHash: string;
};

export async function dropToAcrCloud(releaseId: number): Promise<AcrDropResult> {
  const PARTNER = "acrcloud_ddex";

  const integration = await getIntegrationByCode(PARTNER);
  if (!integration) {
    throw new Error("Интеграция «ACRCloud (DDEX)» не зарегистрирована. Обратитесь к администратору.");
  }
  const cfg = getEffectiveIntegrationConfig(PARTNER, integration.config as Record<string, unknown> | null);
  const credentials = await loadCredentials(integration.id);
  if (!credentials.access_key_id || !credentials.secret_access_key) {
    throw new Error("ACRCloud не подключён: введите Access Key ID и Secret Access Key в Настройки → Интеграции.");
  }

  const release = await buildReleaseContext(releaseId);
  const partner = await buildPartnerContext(PARTNER);

  // Базовая валидация (без splits): нужен UPC, аудиофайл у КАЖДОГО трека, обложка
  // и корректные PartyId отправителя/получателя — иначе ACRCloud отклонит пакет.
  const cover = release.cover;
  const problems: string[] = [];
  if (!release.upc) problems.push("у релиза нет UPC");
  // ACRCloud сверяет каждый трек, а ERN ссылается на ВСЕ треки релиза — поэтому
  // аудиофайл обязателен у каждого, иначе пакет будет неполным (ResourceList без
  // соответствующего файла) и проверка на дубли станет недостоверной.
  if (release.tracks.length === 0) {
    problems.push("в релизе нет треков");
  } else {
    const noAudio = release.tracks.filter((t) => !t.audioFile);
    if (noAudio.length > 0) {
      const names = noAudio.map((t) => t.title || `трек №${t.trackNumber}`).join(", ");
      problems.push(`не ко всем трекам прикреплён аудиофайл (${names})`);
    }
  }
  if (!cover) problems.push("не загружена обложка");
  if (!partner.partyIdSender) problems.push("не настроен PartyId отправителя");
  if (!partner.partyIdRecipient) problems.push("не настроен PartyId получателя (ACRCloud)");
  if (problems.length > 0) {
    throw new Error(`Релиз не готов к отправке в ACRCloud: ${problems.join("; ")}.`);
  }

  // Полный ERN 4.3 с дефолтным deal'ом — ACRCloud ожидает структурно полный
  // NewReleaseMessage, но не коммерчески точные splits.
  const deal = buildDefaultDeal(release, false);
  const messageRef = `ACR-${PARTNER}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`;
  const buildInput: BuildErnInput = {
    release, partner, deal,
    ernVersion: "4.3",
    messageType: "NewReleaseMessage",
    updateIndicator: "OriginalMessage",
    messageId: messageRef,
    messageThreadId: messageRef,
    createdAt: new Date(),
  };
  const { xml } = buildErn(buildInput);
  const xmlHash = createHash("sha256").update(xml).digest("hex");

  const files: TransportFile[] = [
    { filename: `${messageRef}.xml`, content: { type: "buffer", data: Buffer.from(xml, "utf8") } },
  ];
  for (const t of release.tracks) {
    if (!t.audioFile) continue;
    files.push({
      filename: t.audioFile.filename,
      content: { type: "path", localPath: t.audioFile.source },
    });
  }
  if (cover) {
    files.push({
      filename: cover.filename,
      content: { type: "path", localPath: cover.source },
    });
  }

  const transport = getTransport(cfg.transport || "s3");
  const batchRef = `ACRDROP-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const transportCtx = {
    config: {
      ...cfg,
      partnerCode: PARTNER,
      partyIdSender: partner.partyIdSender,
      partyIdRecipient: partner.partyIdRecipient,
    },
    credentials,
  };

  const upload = await transport.upload(transportCtx, batchRef, files);
  logger.info(
    { releaseId, batchRef, remotePath: upload.remotePath, fileCount: upload.fileCount, totalBytes: upload.totalBytes },
    "acrcloud drop uploaded",
  );

  return {
    messageRef,
    batchRef,
    remotePath: upload.remotePath,
    uploadedFiles: upload.uploadedFiles,
    fileCount: upload.fileCount,
    totalBytes: upload.totalBytes,
    xmlHash,
  };
}

// ── Сервис: Ingest Ack ───────────────────────────────────────────────

export type IngestAckResult = {
  ok: boolean;
  ackId: number;
  matchedMessageId?: number;
  matchedBatchId?: number;
  status: "accepted" | "rejected" | "warning";
  reason?: string;
};

// ── Удобные геттеры для UI ───────────────────────────────────────────

export async function getMessageDetail(id: number) {
  const [msg] = await db.select().from(ddexMessagesTable).where(eq(ddexMessagesTable.id, id));
  if (!msg) return null;
  const acks = await db.select().from(ddexAcknowledgementsTable)
    .where(eq(ddexAcknowledgementsTable.messageId, id))
    .orderBy(desc(ddexAcknowledgementsTable.receivedAt));
  const batch = msg.batchId
    ? (await db.select().from(ddexBatchesTable).where(eq(ddexBatchesTable.id, msg.batchId)))[0]
    : null;
  return { message: msg, batch, acknowledgements: acks };
}

/** Минимальный union-import для типов, чтобы lint/tsc не тёрли неиспользуемые. */
export type _ServiceTypes = { Release: Release; Track: Track };

export async function ingestAck(rawXml: string, source: "webhook" | "sftp-poll" | "manual" = "webhook", partnerCodeHint?: string): Promise<IngestAckResult> {
  const parsed = parseAck(rawXml, source);

  // Найти исходное сообщение/batch
  let matchedMessageId: number | undefined;
  let matchedBatchId: number | undefined;
  let partnerCode = partnerCodeHint ?? "unknown";

  if (parsed.messageRef) {
    const [m] = await db.select().from(ddexMessagesTable).where(eq(ddexMessagesTable.messageRef, parsed.messageRef)).limit(1);
    if (m) { matchedMessageId = m.id; partnerCode = m.partnerCode; matchedBatchId = m.batchId ?? undefined; }
  }
  // Fallback: связка по messageThreadId — берём последнее отправленное сообщение треда.
  if (!matchedMessageId && parsed.messageThreadId) {
    const [m] = await db.select().from(ddexMessagesTable)
      .where(eq(ddexMessagesTable.messageThreadId, parsed.messageThreadId))
      .orderBy(desc(ddexMessagesTable.createdAt))
      .limit(1);
    if (m) { matchedMessageId = m.id; partnerCode = m.partnerCode; matchedBatchId = m.batchId ?? undefined; }
  }
  if (!matchedMessageId && parsed.batchRef) {
    const [b] = await db.select().from(ddexBatchesTable).where(eq(ddexBatchesTable.batchRef, parsed.batchRef)).limit(1);
    if (b) { matchedBatchId = b.id; partnerCode = b.partnerCode; }
  }

  // Атомарно: insert ack + update message + update batch — чтобы не было
  // «принят ack, но статус сообщения не сдвинулся» (orphan) при сбое посередине.
  const ack = await db.transaction(async (tx) => {
    const [a] = await tx.insert(ddexAcknowledgementsTable).values({
      messageId: matchedMessageId ?? null,
      batchId: matchedBatchId ?? null,
      partnerCode,
      source,
      ackType: parsed.ackType,
      status: parsed.status,
      rawPayload: rawXml.slice(0, 200_000), // cap
      parsed: parsed.parsed,
    }).returning();

    if (matchedMessageId) {
      if (parsed.status === "accepted") {
        await tx.update(ddexMessagesTable).set({
          status: "acked", ackedAt: new Date(), ackPayload: parsed.parsed, rejectionReason: null,
        }).where(eq(ddexMessagesTable.id, matchedMessageId));
      } else if (parsed.status === "rejected") {
        await tx.update(ddexMessagesTable).set({
          status: "rejected", ackedAt: new Date(), ackPayload: parsed.parsed,
          rejectionReason: parsed.rejectionReason?.slice(0, 500) ?? null,
        }).where(eq(ddexMessagesTable.id, matchedMessageId));
      }
    }
    if (matchedBatchId && parsed.status === "accepted") {
      await tx.update(ddexBatchesTable).set({ status: "acked" }).where(eq(ddexBatchesTable.id, matchedBatchId));
    }
    return a;
  });

  logger.info({
    ackId: ack.id, matchedMessageId, matchedBatchId, partnerCode, status: parsed.status,
  }, "ddex ack ingested");

  return {
    ok: true,
    ackId: ack.id,
    matchedMessageId,
    matchedBatchId,
    status: parsed.status,
    reason: parsed.rejectionReason,
  };
}
