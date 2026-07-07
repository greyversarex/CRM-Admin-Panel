/**
 * Издательский режим (publishing-only) отправки в Broma16 (ROD).
 *
 * В отличие от полного релиза (см. release-pusher.ts) здесь регистрируется ТОЛЬКО
 * произведение (composition) с авторами и долями — без фонограмм (аудио), обложки
 * и площадок. Используется для издательских прав, когда трек уже дистрибутируется
 * где-то ещё, а нам нужно зарегистрировать авторские доли.
 *
 * Шаги (см. BROMA16_API_MAP, раздел 8):
 *   1. POST /repertoire/composition                    → создаём произведение, id
 *   2. POST /repertoire/composition/{id}/contributors  → авторы + доли (сумма 100%)
 *   3. POST /repertoire/composition/{id}/step          → step: "completed"
 *
 * Идемпотентность: если у произведения уже сохранён broma16CompositionId — второй
 * запуск не создаёт дубликат, а лишь обновляет авторов и повторяет step.
 */

import { and, eq } from "drizzle-orm";
import { db, publishingWorksTable, type PublishingWork } from "@workspace/db";
import { logger } from "../../lib/logger";
import { Broma16ApiError } from "./errors";
import { createBroma16Client } from "./client";

type PublishingWriter = {
  name: string;
  role: "composer" | "lyricist" | "songwriter" | "arranger";
  share: number;
  caeIpi?: string | null;
};

type Contributor = {
  title: string;
  ownership: string;
  roles: string[];
  controlled_by_submitter: number;
  ipi?: string;
  publisher?: string;
};

const WRITER_ROLE_MAP: Record<PublishingWriter["role"], string[]> = {
  composer: ["C"],
  lyricist: ["A"],
  songwriter: ["C", "A"],
  arranger: ["A"],
};

function extractId(data: unknown): number | null {
  if (typeof data === "number") return data;
  if (typeof data === "string" && /^\d+$/.test(data)) return Number(data);
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const id = obj.id ?? obj.composition_id ?? obj.compositionId;
    if (typeof id === "number") return id;
    if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  }
  return null;
}

/** Строит список авторов произведения с гарантией суммы долей = 100%. */
function buildContributors(work: PublishingWork): Contributor[] {
  const writers = ((work.writers ?? []) as PublishingWriter[]).filter((w) => (w.name ?? "").trim());
  if (writers.length > 0) {
    const sum = writers.reduce((s, w) => s + (Number(w.share) || 0), 0);
    if (Math.abs(sum - 100) < 0.01) {
      return writers.map((w) => ({
        title: w.name.trim(),
        ownership: (Number(w.share) || 0).toFixed(2),
        roles: WRITER_ROLE_MAP[w.role] ?? ["C", "A"],
        controlled_by_submitter: 1,
        ...(w.caeIpi ? { ipi: w.caeIpi } : {}),
        ...(work.publisher ? { publisher: work.publisher } : {}),
      }));
    }
    logger.warn({ workId: work.id, sum }, "[broma16] сумма долей авторов произведения != 100% — Copyright Control");
  }
  // Фоллбэк: без корректных авторов Broma16 вернёт 422.
  return [{ title: "Copyright Control", ownership: "100.00", roles: ["C", "A"], controlled_by_submitter: 1 }];
}

export type CompositionPushResult = {
  workId: number;
  broma16CompositionId: string;
};

/**
 * Регистрирует произведение (publishing work) в Broma16 в издательском режиме.
 * Бросает Broma16ApiError при сетевых/валидационных ошибках Broma16.
 */
export async function pushCompositionToBroma16(workId: number): Promise<CompositionPushResult> {
  const [work] = await db.select().from(publishingWorksTable).where(eq(publishingWorksTable.id, workId)).limit(1);
  if (!work) throw new Broma16ApiError(404, `Произведение #${workId} не найдено`);

  const client = await createBroma16Client();
  const accountId = await client.getAccountId();

  const contributors = buildContributors(work);

  // ── Шаг 1: создаём (или переиспользуем) произведение ──
  let compositionId = work.broma16CompositionId ?? null;
  if (!compositionId) {
    const createBody: Record<string, unknown> = {
      title: work.title,
      account_id: Number(accountId),
    };
    if (work.iswc) createBody.iswc = work.iswc;
    const data = await client.request<unknown>("POST", "/repertoire/composition", { body: createBody });
    const id = extractId(data);
    if (!id) throw new Broma16ApiError(0, "Broma16: не удалось получить id созданного произведения");
    compositionId = String(id);
    await db
      .update(publishingWorksTable)
      .set({ broma16CompositionId: compositionId, broma16Status: "pending" })
      .where(eq(publishingWorksTable.id, workId));
  }

  // ── Шаг 2: авторы с долями ──
  await client.request("POST", `/repertoire/composition/${compositionId}/contributors`, { body: { contributors } });

  // ── Шаг 3: завершаем оформление (step → completed) ──
  await client.request("POST", `/repertoire/composition/${compositionId}/step`, { body: { step: "completed" } });

  await db
    .update(publishingWorksTable)
    .set({ broma16Status: "submitted", status: work.status === "draft" ? "pending" : work.status })
    .where(and(eq(publishingWorksTable.id, workId)));

  logger.info({ workId, compositionId }, "[broma16] произведение отправлено (издательский режим)");
  return { workId, broma16CompositionId: compositionId };
}
