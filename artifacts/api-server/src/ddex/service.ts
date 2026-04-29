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

// ── Контекст из БД ───────────────────────────────────────────────────

/**
 * Преобразует storageKey/objectPath в локальный файловый путь.
 * Для assets.objectPath вида `/objects/uploads/<uuid>` склеиваем с LOCAL_STORAGE_ROOT.
 */
function resolveAssetLocalPath(objectPath: string | null, storageKey: string | null): string | null {
  if (storageKey) return path.join(LOCAL_STORAGE_ROOT, storageKey);
  if (objectPath?.startsWith("/objects/")) {
    const relative = objectPath.replace(/^\/objects\//, "");
    return path.join(LOCAL_STORAGE_ROOT, "private", relative);
  }
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

  // Cover asset (kind=image, releaseId=this)
  const [coverAsset] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.releaseId, releaseId), eq(assetsTable.kind, "image")))
    .limit(1);

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
    const [audioAsset] = await db.select().from(assetsTable)
      .where(and(eq(assetsTable.trackId, t.id), eq(assetsTable.kind, "audio")))
      .limit(1);
    const audioFile: ResourceFile | null = audioAsset
      ? {
          source: resolveAssetLocalPath(audioAsset.objectPath, audioAsset.storageKey) ?? audioAsset.objectPath,
          filename: `${t.isrc ?? `TJM${t.id}`}.wav`,
          mimeType: audioAsset.mimeType,
          sizeBytes: audioAsset.sizeBytes,
          sha1: audioAsset.sha256?.slice(0, 40) ?? undefined,
        }
      : null;

    trackContexts.push({
      trackId: t.id,
      resourceRef: `A${t.trackNumber ?? trackContexts.length + 1}`,
      isrc: t.isrc ?? "",
      title: t.title,
      durationSeconds: t.durationSeconds ?? 0,
      language: (t.language || release.language || "tg").toLowerCase(),
      isExplicit: t.isExplicit,
      trackNumber: t.trackNumber ?? trackContexts.length + 1,
      composerName: t.composerName,
      lyricistName: t.lyricistName,
      // На простом этапе — главный артист релиза как единственный contributor.
      // Featured-роли для отдельных треков в текущей схеме не моделируются; добавится
      // когда появится `track_artists` join-table.
      contributors: [{
        partyRef: "P_MAIN_ARTIST",
        fullName: artist?.name ?? "Unknown Artist",
        role: "MainArtist",
      }],
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
    releaseType: (release.releaseType as ReleaseContext["releaseType"]) ?? "single",
    profile,
    releaseDate: release.releaseDate ?? new Date().toISOString().slice(0, 10),
    genre: release.genre,
    language: (release.language || "tg").toLowerCase(),
    isExplicit: release.isExplicit,
    territories: release.territories ?? ["WW"],
    pLine: release.pLine,
    cLine: release.cLine,
    mainArtist: {
      partyRef: "P_MAIN_ARTIST",
      fullName: artist?.name ?? "Unknown Artist",
      role: "MainArtist",
    },
    featuredArtists: [], // будущее: parsing "feat." из title
    label: label
      ? { partyRef: "P_LABEL", name: label.name, partyId: null }
      : null,
    cover,
    tracks: trackContexts,
  };
}

async function buildPartnerContext(partnerCode: string): Promise<PartnerContext> {
  const integration = await getIntegrationByCode(partnerCode);
  const cfg = (integration?.config ?? {}) as Record<string, string>;
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
  const cfg = (integration?.config ?? {}) as Record<string, string>;
  const transportName = cfg.transport || "local-fs";
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

// ── Сервис: Ingest Ack ───────────────────────────────────────────────

export type IngestAckResult = {
  ok: boolean;
  ackId: number;
  matchedMessageId?: number;
  matchedBatchId?: number;
  status: "accepted" | "rejected" | "warning";
  reason?: string;
};

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
          rejectionReason: parsed.rejectionReason?.slice(0, 500) ?? "Partner rejected",
        }).where(eq(ddexMessagesTable.id, matchedMessageId));
      }
    }
    if (matchedBatchId) {
      await tx.update(ddexBatchesTable).set({
        status: parsed.status === "accepted" ? "acked" : (parsed.status === "rejected" ? "rejected" : "uploaded"),
        ackReceivedAt: new Date(),
      }).where(eq(ddexBatchesTable.id, matchedBatchId));
    }
    return a;
  });

  return {
    ok: true, ackId: ack.id,
    matchedMessageId, matchedBatchId,
    status: parsed.status, reason: parsed.rejectionReason,
  };
}

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
