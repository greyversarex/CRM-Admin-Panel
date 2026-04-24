/**
 * DDEX delivery worker — фоновая обработка очереди deliveries.
 *
 * Жизненный цикл одного job'а:
 *   queued → processing → (sent | failed)
 *   failed (attempts<5) → через 2^attempts мин снова queued (по nextRetryAt)
 *   failed (attempts>=5) → permanent fail; разблокируется только ручным retry
 *
 * Запускается из index.ts после app.listen.
 */
import { db, deliveriesTable, releasesTable, tracksTable, artistsTable, assetsTable, auditLogTable } from "@workspace/db";
import { and, eq, lte, isNull, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getConnector } from "../connectors/registry";
import { createDdexSftpConnector, generateDdexErn } from "../connectors/ddex-sftp";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";
import type { DeliveryPayload } from "../connectors/base";

type DeliveryRow = typeof deliveriesTable.$inferSelect;

/**
 * Лог авто-перехода доставки (queued→processing→sent/failed) воркером.
 * Делается напрямую через INSERT (не через auditMutation, у нас нет HTTP req'а).
 */
async function auditTransition(
  before: DeliveryRow,
  after: DeliveryRow,
  source: "worker",
): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      userId: null, // системный переход, не пользователь
      action: "update",
      entityType: "delivery",
      entityId: after.id,
      diff: {
        source,
        from: { status: before.status, attempts: before.attempts, lastError: before.lastError },
        to:   { status: after.status,  attempts: after.attempts,  lastError: after.lastError  },
      },
    });
  } catch (err) {
    logger.warn({ err, jobId: after.id }, "audit transition failed");
  }
}

const TICK_MS = 30_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;
const PROCESSING_TIMEOUT_MS = 5 * 60_000; // job-и зависшие в processing >5мин — возвращаем

let timer: NodeJS.Timeout | null = null;
let stopping = false;
let activeTick: Promise<void> | null = null;

async function buildPayload(releaseId: number): Promise<DeliveryPayload | null> {
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!release) return null;

  const [artist] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, release.artistId));
  const trackRows = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, releaseId));

  // Подтягиваем audio asset'ы для треков (если есть). Если нет — отгружаем
  // metadata-only XML; это валидный сценарий "pre-release notification".
  const trackAssetMap = new Map<number, string>();
  for (const t of trackRows) {
    const [a] = await db.select({ objectPath: assetsTable.objectPath })
      .from(assetsTable)
      .where(and(eq(assetsTable.trackId, t.id), eq(assetsTable.kind, "audio")))
      .limit(1);
    if (a) trackAssetMap.set(t.id, a.objectPath);
  }

  return {
    releaseId: release.id,
    upc: release.upc ?? `MOCK-${release.id.toString().padStart(13, "0")}`,
    title: release.title,
    artist: artist?.name ?? "Unknown Artist",
    releaseDate: release.releaseDate ?? new Date().toISOString().slice(0, 10),
    artworkUrl: release.coverUrl ?? "",
    tracks: trackRows.map((t) => ({
      isrc: t.isrc ?? `TJM${release.id.toString().padStart(7, "0")}${t.id.toString().padStart(3, "0")}`,
      title: t.title,
      duration: t.durationSeconds ?? 0,
      audioUrl: t.audioUrl ?? trackAssetMap.get(t.id) ?? "",
    })),
  };
}

async function processOne(jobId: number): Promise<void> {
  // Сначала читаем состояние ДО — для audit diff queued→processing.
  const [before] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, jobId));
  if (!before) return;

  // Atomic claim: queued → processing. Если кто-то уже забрал — выходим.
  const [claimed] = await db.update(deliveriesTable)
    .set({ status: "processing" })
    .where(and(eq(deliveriesTable.id, jobId), eq(deliveriesTable.status, "queued")))
    .returning();
  if (!claimed) return;
  await auditTransition(before, claimed, "worker");

  const attempts = claimed.attempts + 1;
  // xml поднимаем во внешний scope, чтобы сохранить его и в успехе, и в failed
  // (для дебага без перегенерации). Партийный ID — заглушка для тестового режима;
  // в проде должен браться из integration.config.partyId.
  let xmlPayload: string | null = null;
  try {
    const payload = await buildPayload(claimed.releaseId);
    if (!payload) throw new Error(`Release ${claimed.releaseId} not found`);

    // Spotify не имеет deliverRelease — все DSP уходят через DDEX-SFTP fallback.
    let connector = getConnector(claimed.target);
    if (!connector?.deliverRelease) connector = createDdexSftpConnector(claimed.target);

    // Креды лучше иметь, но допускаем пустые для тестового режима DDEX-SFTP.
    let credentials: Record<string, string> = {};
    const integration = await getIntegrationByCode(claimed.target);
    if (integration) credentials = await loadCredentials(integration.id);

    // Генерируем ERN ДО вызова коннектора, чтобы xml_payload был доступен в БД
    // даже если доставка упадёт. Connector.deliverRelease возвращает только xmlSize,
    // поэтому источник истины для XML — этот вызов.
    const partyId = (integration?.config as Record<string, string> | undefined)?.partyId ?? `PADPIDA-${claimed.target.toUpperCase()}`;
    xmlPayload = generateDdexErn(payload, partyId);

    const result = await connector.deliverRelease!({ credentials, config: {} }, payload);

    if (result.ok) {
      const [sent] = await db.update(deliveriesTable).set({
        status: "sent",
        attempts,
        lastError: null,
        nextRetryAt: null,
        xmlPayload,
        deliveredAt: new Date(), // transport timestamp; partner ack позже → 'delivered'
      }).where(eq(deliveriesTable.id, jobId)).returning();
      await auditTransition(claimed, sent, "worker");
      logger.info({ jobId, target: claimed.target, releaseId: claimed.releaseId, attempts, xmlBytes: xmlPayload.length }, "delivery sent");
    } else {
      throw new Error(result.message ?? "Connector returned ok=false");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const next = attempts < MAX_ATTEMPTS
      ? new Date(Date.now() + Math.pow(2, attempts) * 60_000) // 2,4,8,16 мин
      : null;
    const [failed] = await db.update(deliveriesTable).set({
      status: "failed",
      attempts,
      lastError: msg.slice(0, 1000),
      nextRetryAt: next,
      xmlPayload, // null если упали до generateDdexErn, иначе сгенерированный ERN
    }).where(eq(deliveriesTable.id, jobId)).returning();
    await auditTransition(claimed, failed, "worker");
    logger.warn({ jobId, target: claimed.target, attempts, err: msg, nextRetryAt: next }, "delivery failed");
  }
}

async function processDeliveryQueue(): Promise<void> {
  // Пытаемся выгрести queued + готовые failed (attempts<5, retry-time прошло)
  const candidates = await db.select({ id: deliveriesTable.id }).from(deliveriesTable)
    .where(or(
      eq(deliveriesTable.status, "queued"),
      and(
        eq(deliveriesTable.status, "failed"),
        sql`${deliveriesTable.attempts} < ${MAX_ATTEMPTS}`,
        or(isNull(deliveriesTable.nextRetryAt), lte(deliveriesTable.nextRetryAt, new Date())),
      ),
    ))
    .limit(BATCH_SIZE);

  if (candidates.length === 0) return;

  // Failed jobs нужно сначала вернуть в queued, чтобы processOne смог их claim'нуть атомарно.
  await db.update(deliveriesTable)
    .set({ status: "queued" })
    .where(and(
      sql`${deliveriesTable.id} IN (${sql.join(candidates.map((c) => sql`${c.id}`), sql`, `)})`,
      eq(deliveriesTable.status, "failed"),
    ));

  for (const c of candidates) {
    if (stopping) break;
    await processOne(c.id);
  }
}

async function resetStuckJobs(): Promise<void> {
  // На старте: всё что зависло в processing >5мин (например прошлый процесс убит kill -9)
  // → возвращаем в queued. Не сбрасываем attempts, чтобы не зациклить отказ.
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  const reset = await db.update(deliveriesTable)
    .set({ status: "queued" })
    .where(and(eq(deliveriesTable.status, "processing"), lte(deliveriesTable.updatedAt, cutoff)))
    .returning({ id: deliveriesTable.id });
  if (reset.length > 0) logger.info({ count: reset.length }, "delivery worker: reset stuck processing jobs");
}

export async function startDeliveryWorker(): Promise<void> {
  await resetStuckJobs();
  const tick = async () => {
    if (stopping || activeTick) return;
    activeTick = processDeliveryQueue().catch((err) => {
      logger.error({ err }, "delivery worker tick failed");
    }).finally(() => { activeTick = null; });
  };
  timer = setInterval(tick, TICK_MS);
  logger.info({ intervalMs: TICK_MS, batch: BATCH_SIZE }, "delivery worker started");
  void tick(); // первый прогон сразу
}

export async function stopDeliveryWorker(): Promise<void> {
  stopping = true;
  if (timer) { clearInterval(timer); timer = null; }
  if (activeTick) {
    logger.info("delivery worker: waiting for active tick to drain…");
    await activeTick;
  }
  logger.info("delivery worker stopped");
}
