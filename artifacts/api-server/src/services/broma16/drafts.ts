/**
 * Черновики в кабинете Broma16.
 *
 * Каждая неудачная отправка оставляет там недоделанный черновик: релиз
 * создаётся первым шагом, а на модерацию уходит девятым. У заказчика их
 * накопилось семь — часть от наших сбоев, часть от ручных проб.
 *
 * Метод удаления прислала поддержка Broma16 (в открытой документации он есть,
 * но в разделе «Черновики»): DELETE /assets/draft/{draftType}/{draftId}/remove,
 * где draftType — release или composition.
 *
 * Удаление не автоматизируем: черновик может принадлежать релизу, который
 * оператор как раз доделывает. Наше дело — показать список и пометить, какой
 * черновик чей.
 */
import { db, releasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Broma16Client } from "./client";
import { fetchAccountDrafts } from "./moderation";
import { logger } from "../../lib/logger";

export type DraftType = "release" | "composition";

export type Broma16Draft = {
  id: number;
  type: DraftType;
  title: string;
  /** Шаг, на котором черновик остановился: file, tracks, check, confirm… */
  step: string | null;
  /** Наш релиз, если черновик принадлежит ему. */
  ourReleaseId: number | null;
  ourReleaseTitle: string | null;
  /** Можно ли удалять без опаски: чужие пробы — да, наши релизы — нет. */
  safeToRemove: boolean;
};

function asDraftType(value: unknown): DraftType {
  return String(value ?? "").toLowerCase() === "composition" ? "composition" : "release";
}

/** Список черновиков со ссылкой на наши релизы. */
export async function listDrafts(client: Broma16Client): Promise<Broma16Draft[]> {
  const raw = await fetchAccountDrafts(client);
  const ours = await db
    .select({ id: releasesTable.id, title: releasesTable.title, bromaId: releasesTable.broma16ReleaseId })
    .from(releasesTable);
  const byBromaId = new Map<number, { id: number; title: string }>();
  for (const r of ours) {
    if (r.bromaId) byBromaId.set(r.bromaId, { id: r.id, title: r.title });
  }

  return raw.map((d) => {
    const id = Number(d.id ?? d.draft_id ?? 0);
    const mine = byBromaId.get(id) ?? null;
    return {
      id,
      type: asDraftType(d.draft_type ?? d.type),
      title: String(d.title ?? d.name ?? "без названия"),
      step: d.step ? String(d.step) : null,
      ourReleaseId: mine?.id ?? null,
      ourReleaseTitle: mine?.title ?? null,
      // Черновик, за которым стоит наш релиз, удалять нельзя: следующая
      // отправка продолжит именно его, а не начнёт всё заново.
      safeToRemove: mine === null,
    };
  });
}

/** Удаляет черновик. Связь с нашим релизом снимается, чтобы не остался мёртвый id. */
export async function removeDraft(
  client: Broma16Client,
  draftType: DraftType,
  draftId: number,
): Promise<void> {
  await client.request("DELETE", `/assets/draft/${draftType}/${draftId}/remove`, {});
  logger.info({ draftType, draftId }, "[broma16] черновик удалён");

  if (draftType === "release") {
    await db
      .update(releasesTable)
      .set({ broma16ReleaseId: null, broma16PushedAt: null })
      .where(eq(releasesTable.broma16ReleaseId, draftId));
  }
}
