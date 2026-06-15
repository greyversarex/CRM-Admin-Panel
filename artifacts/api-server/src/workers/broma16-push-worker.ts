/**
 * Broma16 push worker — фоновая обработка очереди `broma16_push_jobs`.
 *
 * Каждый job:
 *   1. claim'ится атомарно (queued → processing)
 *   2. прогоняется через release-pusher.pushReleaseToBroma16() (9-шаговый flow)
 *   3. прогресс (result) и текущий шаг (step) персистятся, чтобы ретрай
 *      продолжал с места, а не дублировал неидемпотентные шаги
 *   4. success | failed (с экспоненциальным backoff, до 5 попыток)
 *
 * Запускается из index.ts после app.listen.
 */

import { db, broma16PushJobsTable, releasesTable } from "@workspace/db";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { notifyByReleaseId } from "../services/notifications";
import { pushReleaseToBroma16, type PushProgress } from "../services/broma16/release-pusher";

const TICK_MS = 30_000;
const BATCH_SIZE = 3;
const MAX_ATTEMPTS = 5;
const PROCESSING_TIMEOUT_MS = 15 * 60_000;

let timer: NodeJS.Timeout | null = null;
let stopping = false;
let activeTick: Promise<void> | null = null;

async function processOne(jobId: number): Promise<void> {
  const [claimed] = await db
    .update(broma16PushJobsTable)
    .set({ status: "processing" })
    .where(and(eq(broma16PushJobsTable.id, jobId), eq(broma16PushJobsTable.status, "queued")))
    .returning();
  if (!claimed) return;

  const attempts = claimed.attempts + 1;
  const progress = (claimed.result ?? {}) as PushProgress;

  const save = async (p: PushProgress) => {
    await db
      .update(broma16PushJobsTable)
      .set({ result: p as Record<string, unknown> })
      .where(eq(broma16PushJobsTable.id, jobId));
  };
  const onStep = async (step: string) => {
    await db.update(broma16PushJobsTable).set({ step }).where(eq(broma16PushJobsTable.id, jobId));
  };

  try {
    const result = await pushReleaseToBroma16(claimed.releaseId, {
      progress,
      save,
      onStep,
      requestedBy: claimed.requestedBy,
    });

    await db
      .update(broma16PushJobsTable)
      .set({ status: "success", step: "done", attempts, lastError: null, nextRetryAt: null })
      .where(eq(broma16PushJobsTable.id, jobId));
    logger.info({ jobId, ...result }, "[broma16] push job success");

    void notifyByReleaseId(claimed.releaseId, {
      type: "delivery_sent",
      title: "Релиз отправлен в Broma16",
      body: "Релиз ушёл на модерацию. После проверки он появится на площадках.",
      entityType: "release",
      entityId: claimed.releaseId,
      link: `/releases/${claimed.releaseId}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const next = attempts < MAX_ATTEMPTS ? new Date(Date.now() + Math.pow(2, attempts) * 60_000) : null;
    await db
      .update(broma16PushJobsTable)
      .set({ status: "failed", attempts, lastError: msg.slice(0, 1000), nextRetryAt: next })
      .where(eq(broma16PushJobsTable.id, jobId));
    await db
      .update(releasesTable)
      .set({ broma16LastError: msg.slice(0, 1000) })
      .where(eq(releasesTable.id, claimed.releaseId));
    logger.warn({ jobId, releaseId: claimed.releaseId, attempts, err: msg, nextRetryAt: next }, "[broma16] push job failed");

    if (next === null) {
      void notifyByReleaseId(claimed.releaseId, {
        type: "delivery_failed",
        title: "Не удалось отправить релиз в Broma16",
        body: `После ${attempts} попыток отправка не удалась. Ошибка: ${msg.slice(0, 200)}`,
        entityType: "release",
        entityId: claimed.releaseId,
        link: `/releases/${claimed.releaseId}`,
      });
    }
  }
}

async function processQueue(): Promise<void> {
  const candidates = await db
    .select({ id: broma16PushJobsTable.id })
    .from(broma16PushJobsTable)
    .where(
      or(
        eq(broma16PushJobsTable.status, "queued"),
        and(
          eq(broma16PushJobsTable.status, "failed"),
          sql`${broma16PushJobsTable.attempts} < ${MAX_ATTEMPTS}`,
          or(isNull(broma16PushJobsTable.nextRetryAt), lte(broma16PushJobsTable.nextRetryAt, new Date())),
        ),
      ),
    )
    .limit(BATCH_SIZE);
  if (candidates.length === 0) return;

  await db
    .update(broma16PushJobsTable)
    .set({ status: "queued" })
    .where(
      and(
        sql`${broma16PushJobsTable.id} IN (${sql.join(candidates.map((c) => sql`${c.id}`), sql`, `)})`,
        eq(broma16PushJobsTable.status, "failed"),
      ),
    );

  for (const c of candidates) {
    if (stopping) break;
    await processOne(c.id);
  }
}

async function resetStuckJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  const reset = await db
    .update(broma16PushJobsTable)
    .set({ status: "queued" })
    .where(and(eq(broma16PushJobsTable.status, "processing"), lte(broma16PushJobsTable.updatedAt, cutoff)))
    .returning({ id: broma16PushJobsTable.id });
  if (reset.length > 0) logger.info({ count: reset.length }, "[broma16] push worker: reset stuck jobs");
}

export async function startBroma16PushWorker(): Promise<void> {
  await resetStuckJobs();
  const tick = async () => {
    if (stopping || activeTick) return;
    activeTick = processQueue()
      .catch((err) => logger.error({ err }, "[broma16] push worker tick failed"))
      .finally(() => {
        activeTick = null;
      });
  };
  timer = setInterval(tick, TICK_MS);
  logger.info({ intervalMs: TICK_MS, batch: BATCH_SIZE }, "[broma16] push worker started");
  void tick();
}

export async function stopBroma16PushWorker(): Promise<void> {
  stopping = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (activeTick) await activeTick;
  logger.info("[broma16] push worker stopped");
}

/** Ставит релиз в очередь на пуш (используется роутом). Возвращает id job-а. */
export async function enqueueBroma16Push(releaseId: number, requestedBy: number | null): Promise<number> {
  // Сериализуем постановку в очередь для одного релиза через транзакционный
  // advisory-lock: два одновременных запроса не пройдут проверку «нет активного
  // job» оба сразу (иначе была бы гонка check-then-insert и дубль-задача).
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(4242043, ${releaseId})`);

    // Если уже есть незавершённый job — возвращаем его (не плодим дубликаты).
    const [existing] = await tx
      .select({ id: broma16PushJobsTable.id })
      .from(broma16PushJobsTable)
      .where(
        and(
          eq(broma16PushJobsTable.releaseId, releaseId),
          or(eq(broma16PushJobsTable.status, "queued"), eq(broma16PushJobsTable.status, "processing")),
        ),
      )
      .limit(1);
    if (existing) return existing.id;

    const [job] = await tx
      .insert(broma16PushJobsTable)
      .values({ releaseId, status: "queued", step: "queued", requestedBy })
      .returning({ id: broma16PushJobsTable.id });
    return job.id;
  });
}
