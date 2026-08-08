/**
 * Импорт произведений (паблишинг) из кабинета Broma16.
 *
 * Произведение и фонограмма — разные объекты права: у фонограммы ISRC и деньги
 * за прослушивания, у произведения ISWC и авторские отчисления. В кабинете
 * заказчика 115 произведений с авторами, у нас в publishing_works — почти
 * ничего, поэтому вторая половина каталога живёт только на стороне
 * дистрибьютора.
 *
 * Источник: GET /accounts/{id}/assets?type=compositions
 * Поля: id, title, iswc, authors[], lyrics, genres, languages, statuses.
 *
 * ВАЖНО про доли: Broma16 отдаёт только имена авторов, без процентов. Доли —
 * это данные о правах, их нельзя ни выдумать, ни поделить поровну «на глаз»,
 * поэтому импортируем имена с долей 0 и статусом draft. Существующая проверка
 * (validateWriters в routes/publishing.ts требует суммы 100%) не даст провести
 * такое произведение дальше, пока человек не впишет реальные проценты — это
 * ровно то поведение, которое нужно.
 */

import { eq, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { publishingWorksTable, tracksTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { createBroma16Client, type Broma16Client } from "./client";
import { normalize, type BromaComposition } from "./catalog-match";

const PAGE_LIMIT = 200;

async function fetchCompositions(c: Broma16Client, accountId: string): Promise<BromaComposition[]> {
  const out: BromaComposition[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await c.request<{ data?: BromaComposition[] }>("GET", `/accounts/${accountId}/assets`, {
      query: { type: "compositions", page, limit: PAGE_LIMIT },
    });
    const chunk = res.data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE_LIMIT) break;
  }
  return out;
}

export type PublishingImportResult = {
  dryRun: boolean;
  bromaCompositions: number;
  created: { id: number | null; title: string; authors: string[]; linkedTrack: boolean }[];
  linked: { id: number; title: string }[];
  /** Произведения без авторов — регистрировать нечего, пропускаем. */
  skippedNoAuthors: string[];
  /** Сколько удалось привязать к нашим трекам по названию. */
  matchedTracks: number;
  /** Треки, которым проставили текст песни из произведения. */
  lyricsFilled: string[];
};

/**
 * Переносит произведения Broma16 в publishing_works.
 *
 * Консервативен: существующие произведения не перезаписывает, только
 * доставляет связь с Broma16 и трек, если их не было.
 */
export async function importBromaPublishing(dryRun = true): Promise<PublishingImportResult> {
  const c = await createBroma16Client();
  const accountId = await c.getAccountId();
  const compositions = await fetchCompositions(c, accountId);

  const result: PublishingImportResult = {
    dryRun,
    bromaCompositions: compositions.length,
    created: [],
    linked: [],
    skippedNoAuthors: [],
    matchedTracks: 0,
    lyricsFilled: [],
  };

  // Наши треки — для привязки произведения к записи по названию.
  const trackRows = await db
    .select({
      id: tracksTable.id,
      title: tracksTable.title,
      isrc: tracksTable.isrc,
      lyrics: tracksTable.lyrics,
    })
    .from(tracksTable);
  const trackByTitle = new Map<string, { id: number; isrc: string | null; lyrics: string | null }>();
  for (const t of trackRows) {
    const key = normalize(t.title);
    if (key && !trackByTitle.has(key)) {
      trackByTitle.set(key, { id: t.id, isrc: t.isrc, lyrics: t.lyrics });
    }
  }

  // Уже существующие произведения: по id в Broma16 и по названию.
  const existing = await db
    .select({
      id: publishingWorksTable.id,
      title: publishingWorksTable.title,
      bromaId: publishingWorksTable.broma16CompositionId,
      trackId: publishingWorksTable.trackId,
    })
    .from(publishingWorksTable);
  const byBromaId = new Map<string, { id: number; trackId: number | null }>();
  const byTitle = new Map<string, { id: number; trackId: number | null }>();
  for (const w of existing) {
    if (w.bromaId) byBromaId.set(String(w.bromaId), { id: w.id, trackId: w.trackId });
    const key = normalize(w.title);
    if (key && !byTitle.has(key)) byTitle.set(key, { id: w.id, trackId: w.trackId });
  }

  for (const comp of compositions) {
    const title = (comp.title ?? "").trim();
    if (!title) continue;
    const authors = (comp.authors ?? []).map((a) => String(a).trim()).filter(Boolean);
    if (authors.length === 0) {
      result.skippedNoAuthors.push(title);
      continue;
    }

    const key = normalize(title);
    const track = trackByTitle.get(key) ?? null;
    if (track) result.matchedTracks++;

    // Текст песни Broma16 отдаёт прямо в списке произведений, а площадкам он
    // нужен для караоке и подсветки строк. Заполняем только пустое — свой текст
    // мог быть выверен вручную.
    const lyrics = comp.lyrics?.trim();
    if (track && lyrics && !track.lyrics?.trim()) {
      result.lyricsFilled.push(title);
      if (!dryRun) {
        await db.update(tracksTable).set({ lyrics }).where(eq(tracksTable.id, track.id));
        track.lyrics = lyrics;
      }
    }

    const already = byBromaId.get(String(comp.id)) ?? byTitle.get(key);
    if (already) {
      result.linked.push({ id: already.id, title });
      if (!dryRun) {
        // Дозаполняем только пустое: связь с Broma16 и трек.
        const patch: Record<string, unknown> = { broma16CompositionId: String(comp.id) };
        if (already.trackId == null && track) patch.trackId = track.id;
        await db.update(publishingWorksTable).set(patch).where(eq(publishingWorksTable.id, already.id));
      }
      continue;
    }

    result.created.push({ id: null, title, authors, linkedTrack: track != null });
    if (dryRun) continue;

    const [created] = await db
      .insert(publishingWorksTable)
      .values({
        title,
        // Broma16 отдаёт iswc пустой строкой, когда его нет.
        iswc: comp.iswc?.trim() || null,
        isrc: track?.isrc ?? null,
        trackId: track?.id ?? null,
        status: "draft",
        // Роль «songwriter» — нейтральная: Broma16 не разделяет композитора и
        // автора текста, а приписывать человеку чужую роль нельзя.
        writers: authors.map((name) => ({ name, role: "songwriter", share: 0 })),
        broma16CompositionId: String(comp.id),
        broma16Status: (comp as { statuses?: string[] }).statuses?.[0] ?? null,
      })
      .returning({ id: publishingWorksTable.id });
    result.created[result.created.length - 1].id = created.id;
    byBromaId.set(String(comp.id), { id: created.id, trackId: track?.id ?? null });
    byTitle.set(key, { id: created.id, trackId: track?.id ?? null });
  }

  logger.info(
    {
      dryRun,
      created: result.created.length,
      linked: result.linked.length,
      matchedTracks: result.matchedTracks,
      lyricsFilled: result.lyricsFilled.length,
    },
    "[broma16] импорт произведений завершён",
  );
  return result;
}

/** Сколько произведений ещё ждут проставления долей. */
export async function countWorksNeedingShares(): Promise<number> {
  const rows = await db
    .select({ writers: publishingWorksTable.writers })
    .from(publishingWorksTable)
    .where(isNotNull(publishingWorksTable.writers));
  let n = 0;
  for (const r of rows) {
    const writers = (r.writers as { share?: number }[] | null) ?? [];
    if (writers.length === 0) continue;
    const total = writers.reduce((sum, w) => sum + (Number(w.share) || 0), 0);
    if (Math.round(total) !== 100) n++;
  }
  return n;
}
