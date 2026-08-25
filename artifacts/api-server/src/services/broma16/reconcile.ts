/**
 * Сверка наших релизов с тем, что о них знает Broma16.
 *
 * До сих пор мы отправляли и забывали: узнать, что там с релизом, можно было
 * только зайдя в их кабинет. Здесь по каждому релизу собирается его состояние
 * с обеих сторон — и расхождения называются словами.
 *
 * Про статусы: у Broma16 их два разных набора. `moderation_status` отвечает на
 * вопрос «прошла ли проверка», а массив `statuses` — на вопрос «где материал
 * сейчас» (см. moderation-status.ts). Смешивать их нельзя: коды вроде
 * `shipped` в moderation_status не появляются никогда.
 */
import { db, releasesTable } from "@workspace/db";
import { desc, isNotNull, or } from "drizzle-orm";
import type { Broma16Client } from "./client";
import { fetchModerationDetails } from "./moderation";
import { fetchAssets } from "./catalog-import";
import { isShipped } from "./moderation-status";
import { logger } from "../../lib/logger";

export type ReconcileRow = {
  releaseId: number;
  title: string;
  /** Наши данные. */
  ourStatus: string;
  ourModeration: string | null;
  ourUpc: string | null;
  ourReleaseDate: string | null;
  /** Идентификаторы на той стороне. */
  bromaReleaseId: number | null;
  bromaAssetId: number | null;
  /** Что ответила Broma16. */
  bromaTitle: string | null;
  bromaStep: string | null;
  bromaStatuses: string[];
  bromaModerationStatus: string | null;
  bromaUpc: string | null;
  bromaSaleStartDate: string | null;
  shipped: boolean;
  reasons: string[];
  notices: string[];
  /** Расхождения человеческим языком. */
  problems: string[];
  /** Не удалось спросить — например, черновик удалён на их стороне. */
  unreachable: string | null;
};

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

function statusList(payload: Record<string, unknown>): string[] {
  const raw = payload.statuses;
  if (Array.isArray(raw)) {
    return raw.map((s) => (typeof s === "string" ? s : String((s as Record<string, unknown>)?.code ?? s)));
  }
  return [];
}

/** Сравнение полей, одинаковое для черновика репертуара и записи каталога. */
function compareFields(
  row: ReconcileRow,
  release: { title: string; upc: string | null; releaseDate: string | null },
): void {
  if (row.bromaTitle && row.bromaTitle !== release.title) {
    row.problems.push(`Название разошлось: у нас «${release.title}», у них «${row.bromaTitle}».`);
  }
  if (release.upc && row.bromaUpc && release.upc !== row.bromaUpc) {
    row.problems.push(`UPC разошёлся: у нас ${release.upc}, у них ${row.bromaUpc}.`);
  }
  if (!release.upc && row.bromaUpc) {
    row.problems.push(`Broma16 присвоила UPC ${row.bromaUpc}, а у нас поле пустое — стоит перенести к себе.`);
  }
  if (release.releaseDate && row.bromaSaleStartDate
      && String(release.releaseDate).slice(0, 10) !== row.bromaSaleStartDate) {
    row.problems.push(
      `Дата продаж разошлась: у нас ${String(release.releaseDate).slice(0, 10)}, у них ${row.bromaSaleStartDate}.`,
    );
  }
}

/** Сверяет один релиз. Ошибку не поднимаем: недоступный релиз — тоже результат. */
async function reconcileOne(
  client: Broma16Client,
  catalog: Map<number, Record<string, unknown>>,
  release: {
    id: number; title: string; status: string; upc: string | null;
    releaseDate: string | null; moderation: string | null;
    bromaReleaseId: number | null; bromaAssetId: number | null;
  },
): Promise<ReconcileRow> {
  const row: ReconcileRow = {
    releaseId: release.id,
    title: release.title,
    ourStatus: release.status,
    ourModeration: release.moderation,
    ourUpc: release.upc,
    ourReleaseDate: release.releaseDate,
    bromaReleaseId: release.bromaReleaseId,
    bromaAssetId: release.bromaAssetId,
    bromaTitle: null,
    bromaStep: null,
    bromaStatuses: [],
    bromaModerationStatus: null,
    bromaUpc: null,
    bromaSaleStartDate: null,
    shipped: false,
    reasons: [],
    notices: [],
    problems: [],
    unreachable: null,
  };

  if (!release.bromaReleaseId) {
    if (!release.bromaAssetId) {
      row.problems.push("В Broma16 не отправлялся.");
      return row;
    }
    // Релиз заведён в их кабинете напрямую: черновика репертуара у него нет,
    // зато он есть в каталоге аккаунта — оттуда и берём состояние.
    const asset = catalog.get(release.bromaAssetId);
    if (!asset) {
      row.unreachable = "не найден в каталоге аккаунта";
      row.problems.push("Числится записью каталога Broma16, но в самом каталоге его нет — связь устарела.");
      return row;
    }
    row.bromaTitle = asString(asset.title);
    row.bromaStatuses = statusList(asset);
    row.bromaModerationStatus = asString(asset.moderation_status);
    row.bromaUpc = asString(asset.ean);
    row.bromaSaleStartDate = asString(asset.release_date)?.slice(0, 10) ?? null;
    row.shipped = isShipped(row.bromaStatuses);
    compareFields(row, release);
    return row;
  }

  let payload: Record<string, unknown>;
  try {
    const res = await client.request<unknown>("GET", `/repertoire/release/${release.bromaReleaseId}/data`, {});
    payload = ((res as { data?: unknown })?.data ?? res) as Record<string, unknown>;
  } catch (e) {
    row.unreachable = e instanceof Error ? e.message : String(e);
    row.problems.push(`Broma16 не отдала релиз: ${row.unreachable}. Возможно, черновик там удалён.`);
    return row;
  }

  row.bromaTitle = asString(payload.title);
  row.bromaStep = asString(payload.step);
  row.bromaStatuses = statusList(payload);
  row.bromaModerationStatus = asString(payload.moderation_status);
  row.bromaUpc = asString(payload.ean);
  row.bromaSaleStartDate = asString(payload.sale_start_date)?.slice(0, 10) ?? null;
  row.shipped = isShipped(row.bromaStatuses);

  // Черновик, не дошедший до модерации, — самый частый и самый незаметный
  // случай: у нас релиз «одобрен», а там он так и лежит недоделанным.
  if (row.bromaStep && !row.shipped && row.bromaStatuses.length === 0) {
    row.problems.push(`У Broma16 это черновик, остановившийся на шаге «${row.bromaStep}» — на модерацию не отправлен.`);
  }
  compareFields(row, release);

  // Причины отказа и недостающие метаданные лежат в закрытых методах — они
  // и объясняют, почему релиз стоит.
  try {
    const details = await fetchModerationDetails(client, release.bromaReleaseId);
    row.reasons = details.reasons;
    row.notices = details.notices;
    if (details.status && details.status !== release.moderation) {
      row.problems.push(`Статус модерации разошёлся: у нас «${release.moderation ?? "нет"}», у них «${details.status}».`);
    }
  } catch (e) {
    logger.warn({ releaseId: release.id, err: String(e) }, "[broma16] замечания при сверке недоступны");
  }

  return row;
}

/** Сверяет все релизы, у которых есть хоть какая-то связь с Broma16. */
export async function reconcileWithBroma16(client: Broma16Client): Promise<ReconcileRow[]> {
  const releases = await db
    .select({
      id: releasesTable.id,
      title: releasesTable.title,
      status: releasesTable.status,
      upc: releasesTable.upc,
      releaseDate: releasesTable.releaseDate,
      moderation: releasesTable.broma16ModerationStatus,
      bromaReleaseId: releasesTable.broma16ReleaseId,
      bromaAssetId: releasesTable.broma16AssetId,
    })
    .from(releasesTable)
    .where(or(isNotNull(releasesTable.broma16ReleaseId), isNotNull(releasesTable.broma16AssetId)))
    .orderBy(desc(releasesTable.id));

  // Каталог аккаунта тянем один раз: он нужен всем релизам, заведённым в
  // кабинете Broma16 напрямую.
  const catalog = new Map<number, Record<string, unknown>>();
  try {
    const accountId = await client.getAccountId();
    for (const a of await fetchAssets<Record<string, unknown>>(client, accountId, "releases")) {
      const id = Number(a.id);
      if (Number.isFinite(id)) catalog.set(id, a);
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "[broma16] каталог для сверки недоступен");
  }

  const rows: ReconcileRow[] = [];
  // Последовательно, а не пачкой: у Broma16 стоит ограничение частоты, и
  // двадцать параллельных запросов упираются в него.
  for (const r of releases) {
    rows.push(await reconcileOne(client, catalog, { ...r, releaseDate: r.releaseDate ? String(r.releaseDate) : null }));
  }
  return rows;
}
