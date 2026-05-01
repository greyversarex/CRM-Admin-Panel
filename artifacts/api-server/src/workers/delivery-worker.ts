/**
 * DDEX delivery worker — фоновая обработка очереди `deliveries`.
 *
 * После рефакторинга T6 каждый job из `deliveries` теперь:
 *   1. claim'ится атомарно (queued → processing)
 *   2. порождает `ddex_message` через `ddex/service.createMessage()`
 *   3. отправляется через `ddex/service.processMessage()` (transport.upload + batch)
 *   4. результат проецируется обратно на `deliveries.status`:
 *        validated→sent      → deliveries.status = sent
 *        invalid             → deliveries.status = failed (validation errors)
 *        upload error        → deliveries.status = failed (с retry exp-backoff)
 *
 * Жизненный цикл `deliveries`:
 *   queued → processing → (sent | failed)
 *   failed (attempts<5) → через 2^attempts мин снова queued (по nextRetryAt)
 *   failed (attempts>=5) → permanent fail; разблокируется только ручным retry
 *
 * Запускается из `index.ts` после `app.listen`.
 */
import { db, deliveriesTable, ddexMessagesTable, auditLogTable, releasesTable } from "@workspace/db";
import { notifyByReleaseId } from "../services/notifications";
import { and, eq, lte, isNull, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { createMessage, processMessage } from "../ddex/service";
import { emitAlertAndForget } from "../services/alerts-emitter";
import { incrementLabelStrike, isCopyrightFailure } from "../services/risk-engine";

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
  let xmlPayload: string | null = null;

  try {
    // 1. Если для этого delivery уже создано ddex_message в прошлой попытке —
    //    переиспользуем его. Иначе создаём новое.
    let messageId: number;
    const [existingMsg] = await db.select({ id: ddexMessagesTable.id, status: ddexMessagesTable.status, xmlPayload: ddexMessagesTable.xmlPayload, validationErrors: ddexMessagesTable.validationErrors })
      .from(ddexMessagesTable)
      .where(eq(ddexMessagesTable.deliveryId, claimed.id))
      .limit(1);

    if (existingMsg) {
      messageId = existingMsg.id;
      xmlPayload = existingMsg.xmlPayload;
      if (existingMsg.status === "invalid") {
        const errs = (existingMsg.validationErrors as Array<{ message: string }>) ?? [];
        throw new Error(`Сообщение invalid: ${errs.map((e) => e.message).join("; ").slice(0, 800)}`);
      }
    } else {
      const created = await createMessage({
        releaseId: claimed.releaseId,
        partnerCode: claimed.target,
        updateIndicator: "OriginalMessage",
        deliveryId: claimed.id,
      });
      messageId = created.id;
      // подгружаем сгенерированный XML для записи в delivery (для дебага)
      const [m] = await db.select({ xmlPayload: ddexMessagesTable.xmlPayload }).from(ddexMessagesTable).where(eq(ddexMessagesTable.id, messageId));
      xmlPayload = m?.xmlPayload ?? null;
      if (created.status === "invalid") {
        throw new Error(`Бизнес-валидация не прошла (${created.validationErrors.length} ошибок): ${created.validationErrors.slice(0, 3).map((e) => e.message).join("; ")}`);
      }
    }

    // 2. Отправка через transport
    const upload = await processMessage(messageId);
    if (!upload.ok) throw new Error(upload.error ?? "transport upload failed");

    const [sent] = await db.update(deliveriesTable).set({
      status: "sent",
      attempts,
      lastError: null,
      nextRetryAt: null,
      xmlPayload,
      deliveredAt: new Date(),
    }).where(eq(deliveriesTable.id, jobId)).returning();
    await auditTransition(claimed, sent, "worker");
    logger.info({
      jobId, target: claimed.target, releaseId: claimed.releaseId,
      attempts, messageId, batchId: upload.batchId, remotePath: upload.remotePath,
      xmlBytes: xmlPayload?.length ?? 0,
    }, "delivery sent");

    void notifyByReleaseId(claimed.releaseId, {
      type: "delivery_sent",
      title: `Релиз отправлен: ${claimed.target}`,
      body: `Доставка завершена. Релиз появится на платформе в течение нескольких дней.`,
      entityType: "release",
      entityId: claimed.releaseId,
      link: `/releases/${claimed.releaseId}`,
    });
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
      xmlPayload,
    }).where(eq(deliveriesTable.id, jobId)).returning();
    await auditTransition(claimed, failed, "worker");
    logger.warn({ jobId, target: claimed.target, attempts, err: msg, nextRetryAt: next }, "delivery failed");

    if (next === null) {
      void notifyByReleaseId(claimed.releaseId, {
        type: "delivery_failed",
        title: `Доставка на ${claimed.target} не удалась`,
        body: `После ${attempts} попыток релиз не был доставлен. Ошибка: ${msg.slice(0, 200)}`,
        entityType: "release",
        entityId: claimed.releaseId,
        link: `/releases/${claimed.releaseId}`,
      });
      emitAlertAndForget({
        kind: "ddex_failed",
        severity: "high",
        message: `Доставка релиза #${claimed.releaseId} на ${claimed.target} провалилась после ${attempts} попыток: ${msg.slice(0, 200)}`,
        entityType: "delivery",
        entityId: jobId,
        meta: { releaseId: claimed.releaseId, target: claimed.target, attempts, error: msg.slice(0, 1000) },
      });

      // ── Risk engine: страйк лейблу при копирайт-причине ──────────────
      // DSP может вернуть DDEX ack с rejection reason 'CopyrightInfringement',
      // 'WorkAlreadyExists', 'IsrcConflict' и т.п. Если в lastError видна такая
      // причина — поднимаем счётчик страйков лейбла. После threshold (3 страйка)
      // следующая отгрузка потребует force=true.
      if (isCopyrightFailure(msg)) {
        try {
          const [rel] = await db.select({ labelId: releasesTable.labelId })
            .from(releasesTable).where(eq(releasesTable.id, claimed.releaseId));
          if (rel?.labelId) {
            await incrementLabelStrike(rel.labelId, msg.slice(0, 200));
          }
        } catch (e) {
          logger.error({ err: e, jobId }, "[worker] strike-increment failed");
        }
      }
    }
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
