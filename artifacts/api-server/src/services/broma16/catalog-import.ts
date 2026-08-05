/**
 * Импорт каталога из кабинета Broma16 в нашу CRM.
 *
 * Зачем: часть каталога заказчика заводилась напрямую в кабинете Broma16, минуя
 * CRM. Статистика прослушиваний сопоставляется с треками ТОЛЬКО по ISRC, поэтому
 * без этих релизов отчёты не к чему привязать — 71 тысяча строк уходит в
 * «unmatched». Импорт создаёт недостающие релизы и треки с их родными кодами,
 * после чего статистика цепляется сама, задним числом.
 *
 * Источники (обнаружены на живом аккаунте, в BROMA16_API_MAP их нет):
 *   GET /accounts/{id}/assets?type=releases    — релизы: ean, catalogue_number, artists
 *   GET /accounts/{id}/assets?type=recordings  — фонограммы: ISRC, performers
 * Связи «релиз → фонограмма» API не отдаёт, поэтому сопоставляем по названию.
 *
 * Импорт консервативен: никогда не перетирает заполненные поля и не создаёт
 * второй релиз на тот же UPC.
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { artistsTable, releasesTable, tracksTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { createBroma16Client, type Broma16Client } from "./client";
import { getDictionary } from "./dictionaries";
import {
  mapReleaseType,
  mapStatus,
  normalize,
  pickBromaDuplicate,
  primaryPerformer,
  SECONDARY_RELEASE_TYPE_IDS,
  type BromaComposition,
  type BromaDuplicate,
  type BromaRecording,
  type BromaRelease,
} from "./catalog-match";

type AssetPage<T> = { total?: number; data?: T[] };

const PAGE_LIMIT = 200;

async function fetchAssets<T>(c: Broma16Client, accountId: string, type: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await c.request<AssetPage<T>>("GET", `/accounts/${accountId}/assets`, {
      query: { type, page, limit: PAGE_LIMIT },
    });
    const chunk = res.data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE_LIMIT) break;
  }
  return out;
}

// ── Защита от дублей перед отправкой ────────────────────────────────

/** Загружает каталог Broma16 и ищет в нём дубль нашего релиза. */
export async function findBromaDuplicate(
  target: { upc?: string | null; title: string; performer?: string | null },
  client?: Broma16Client,
): Promise<BromaDuplicate | null> {
  const c = client ?? (await createBroma16Client());
  const accountId = await c.getAccountId();
  const releases = await fetchAssets<BromaRelease>(c, accountId, "releases");
  return pickBromaDuplicate(releases, target);
}

// ── Результат ───────────────────────────────────────────────────────

export type CatalogImportResult = {
  dryRun: boolean;
  bromaReleases: number;
  bromaRecordings: number;
  artistsCreated: string[];
  releasesCreated: { id: number | null; title: string; upc: string | null }[];
  releasesLinked: { id: number; title: string }[];
  /** TikTok/рингтон-версии: та же песня, отдельным релизом не заводим. */
  secondarySkipped: { title: string; typeId: number; upc: string | null }[];
  /**
   * Авторы, которых Broma16 знает по произведению. Доли (share) она не отдаёт,
   * а выдумывать их нельзя — это данные о правах. Поэтому только показываем,
   * чтобы оператор внёс проценты руками.
   */
  authorsToFill: { track: string; authors: string[] }[];
  tracksCreated: { id: number | null; title: string; isrc: string | null }[];
  tracksLinked: { id: number; isrc: string | null }[];
  warnings: string[];
};

/**
 * Переносит релизы и фонограммы Broma16 в нашу базу.
 *
 * @param dryRun только посчитать, ничего не записывая.
 */
export async function importBromaCatalog(dryRun = true): Promise<CatalogImportResult> {
  const c = await createBroma16Client();
  const accountId = await c.getAccountId();

  const [bromaReleases, bromaRecordings, bromaCompositions, genreDict] = await Promise.all([
    fetchAssets<BromaRelease>(c, accountId, "releases"),
    fetchAssets<BromaRecording>(c, accountId, "recordings"),
    fetchAssets<BromaComposition>(c, accountId, "compositions"),
    getDictionary("genre"),
  ]);

  // id жанра Broma16 → человекочитаемое название из нашего кэша словарей.
  const genreNameById = new Map<string, string>();
  for (const g of genreDict) genreNameById.set(g.externalId, g.name);
  const genreNames = (ids: number[] | undefined): { genre: string | null; subgenre: string | null } => {
    const names = (ids ?? []).map((id) => genreNameById.get(String(id))).filter((n): n is string => !!n);
    return { genre: names[0] ?? null, subgenre: names[1] ?? null };
  };

  // Произведения дают ISWC и авторов; связи с фонограммой в API нет — по названию.
  const compositionByTitle = new Map<string, BromaComposition>();
  for (const comp of bromaCompositions) {
    const key = normalize(comp.title ?? "");
    if (key && !compositionByTitle.has(key)) compositionByTitle.set(key, comp);
  }

  const result: CatalogImportResult = {
    dryRun,
    bromaReleases: bromaReleases.length,
    bromaRecordings: bromaRecordings.length,
    artistsCreated: [],
    releasesCreated: [],
    releasesLinked: [],
    secondarySkipped: [],
    authorsToFill: [],
    tracksCreated: [],
    tracksLinked: [],
    warnings: [],
  };

  // ── Артисты: индекс по нормализованному имени ──
  const artistRows = await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable);
  const artistByName = new Map<string, number>();
  for (const a of artistRows) artistByName.set(normalize(a.name), a.id);

  // В предпросмотре записи не происходит, поэтому уже «запланированных» артистов
  // помним отдельно — иначе один и тот же человек попадёт в отчёт по разу на
  // каждый свой релиз.
  const plannedArtists = new Set<string>();

  async function resolveArtist(name: string): Promise<number | null> {
    const key = normalize(name);
    const existing = artistByName.get(key);
    if (existing != null) return existing;
    if (dryRun) {
      if (!plannedArtists.has(key)) {
        plannedArtists.add(key);
        result.artistsCreated.push(name);
      }
      return null;
    }
    result.artistsCreated.push(name);
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const [created] = await db.insert(artistsTable).values({ name, slug }).returning({ id: artistsTable.id });
    artistByName.set(key, created.id);
    return created.id;
  }

  // ── Релизы ──
  const ourReleases = await db
    .select({
      id: releasesTable.id,
      title: releasesTable.title,
      upc: releasesTable.upc,
      bromaId: releasesTable.broma16ReleaseId,
      catalogNumber: releasesTable.catalogNumber,
    })
    .from(releasesTable);
  const releaseByUpc = new Map<string, number>();
  const releaseByBromaId = new Map<number, number>();
  const takenCatalogNumbers = new Set<string>();
  for (const r of ourReleases) {
    if (r.upc) releaseByUpc.set(r.upc, r.id);
    if (r.bromaId != null) releaseByBromaId.set(r.bromaId, r.id);
    if (r.catalogNumber) takenCatalogNumbers.add(r.catalogNumber);
  }

  /**
   * Название релиза → наш release.id (для привязки фонограмм). В предпросмотре
   * настоящего id ещё нет, поэтому кладём PLANNED_ID: важно лишь то, что релиз
   * с таким названием будет существовать, иначе отчёт наврёт про «не нашла свой
   * релиз» на каждой фонограмме.
   */
  const PLANNED_ID = -1;
  const releaseIdByTitle = new Map<string, number>();

  for (const rel of bromaReleases) {
    if (SECONDARY_RELEASE_TYPE_IDS.has(rel.release_type_id ?? 0)) {
      result.secondarySkipped.push({ title: rel.title, typeId: rel.release_type_id ?? 0, upc: rel.ean ?? null });
      continue;
    }
    const performer = primaryPerformer(rel);
    if (!performer) {
      result.warnings.push(`Релиз «${rel.title}» (${rel.id}) без исполнителя — пропущен`);
      continue;
    }
    const artistId = await resolveArtist(performer);

    const existingId = releaseByBromaId.get(rel.id) ?? (rel.ean ? releaseByUpc.get(rel.ean) : undefined);
    if (existingId != null) {
      result.releasesLinked.push({ id: existingId, title: rel.title });
      if (!dryRun) {
        // Заполняем только пустое: связь с Broma16 и статус модерации.
        await db
          .update(releasesTable)
          .set({ broma16ReleaseId: rel.id, broma16ModerationStatus: rel.moderation_status ?? null })
          .where(eq(releasesTable.id, existingId));
      }
      if (!releaseIdByTitle.has(normalize(rel.title))) releaseIdByTitle.set(normalize(rel.title), existingId);
      continue;
    }

    // Каталожный номер уникален в нашей БД — при конфликте оставляем пустым,
    // сервер проставит собственный CAT{id}.
    const catalogNumber =
      rel.catalogue_number && !takenCatalogNumbers.has(rel.catalogue_number) ? rel.catalogue_number : null;
    if (catalogNumber) takenCatalogNumbers.add(catalogNumber);

    result.releasesCreated.push({ id: null, title: rel.title, upc: rel.ean ?? null });
    if (!releaseIdByTitle.has(normalize(rel.title))) releaseIdByTitle.set(normalize(rel.title), PLANNED_ID);
    if (dryRun || artistId == null) continue;

    const [created] = await db
      .insert(releasesTable)
      .values({
        title: rel.title,
        artistId,
        releaseType: mapReleaseType(rel),
        status: mapStatus(rel),
        upc: rel.ean || null,
        catalogNumber,
        releaseDate: rel.release_date ?? null,
        originalReleaseDate: rel.release_original_date ?? null,
        ...genreNames(rel.genres),
        broma16ReleaseId: rel.id,
        broma16ModerationStatus: rel.moderation_status ?? null,
      })
      .returning({ id: releasesTable.id });
    if (rel.ean) releaseByUpc.set(rel.ean, created.id);
    releaseByBromaId.set(rel.id, created.id);
    // Заготовку PLANNED_ID заменяем настоящим id первого созданного релиза.
    const titleKey = normalize(rel.title);
    if ((releaseIdByTitle.get(titleKey) ?? PLANNED_ID) === PLANNED_ID) releaseIdByTitle.set(titleKey, created.id);
    result.releasesCreated[result.releasesCreated.length - 1].id = created.id;
  }

  // ── Фонограммы → треки ──
  const ourTracks = await db
    .select({ id: tracksTable.id, isrc: tracksTable.isrc, recId: tracksTable.broma16RecordingId })
    .from(tracksTable)
    .where(isNotNull(tracksTable.isrc));
  const trackByIsrc = new Map<string, { id: number; recId: number | null }>();
  for (const t of ourTracks) {
    if (t.isrc) trackByIsrc.set(t.isrc.trim().toUpperCase(), { id: t.id, recId: t.recId });
  }

  for (const rec of bromaRecordings) {
    const isrc = rec.isrc?.trim().toUpperCase() || null;
    if (!isrc) {
      result.warnings.push(`Фонограмма «${rec.title}» (${rec.id}) без ISRC — пропущена`);
      continue;
    }

    const existing = trackByIsrc.get(isrc);
    if (existing) {
      result.tracksLinked.push({ id: existing.id, isrc });
      if (!dryRun && existing.recId == null) {
        await db
          .update(tracksTable)
          .set({ broma16RecordingId: rec.id })
          .where(eq(tracksTable.id, existing.id));
      }
      continue;
    }

    const performer = primaryPerformer(rec);
    if (!performer) {
      result.warnings.push(`Фонограмма «${rec.title}» (${rec.id}) без исполнителя — пропущена`);
      continue;
    }
    const artistId = await resolveArtist(performer);
    const releaseId = releaseIdByTitle.get(normalize(rec.title)) ?? null;
    if (releaseId == null) {
      result.warnings.push(`Фонограмма «${rec.title}» (ISRC ${isrc}) не нашла свой релиз по названию`);
    }

    // Произведение даёт ISWC (факт) и имена авторов. Доли Broma16 не отдаёт,
    // поэтому writers не заполняем — это данные о правах, их нельзя угадывать.
    const composition = compositionByTitle.get(normalize(rec.title));
    if (composition?.authors?.length) {
      result.authorsToFill.push({ track: rec.title, authors: composition.authors });
    }

    result.tracksCreated.push({ id: null, title: rec.title, isrc });
    if (dryRun || artistId == null) continue;

    const [created] = await db
      .insert(tracksTable)
      .values({
        title: rec.title,
        isrc,
        releaseId,
        artistId,
        trackNumber: 1,
        isExplicit: rec.parental_warning_type === "explicit",
        audioStyle: rec.is_instrumental ? "instrumental" : null,
        iswc: composition?.iswc?.trim() || null,
        ...genreNames(rec.genres),
        broma16RecordingId: rec.id,
      })
      .returning({ id: tracksTable.id });
    trackByIsrc.set(isrc, { id: created.id, recId: rec.id });
    result.tracksCreated[result.tracksCreated.length - 1].id = created.id;
  }

  logger.info(
    {
      dryRun,
      releasesCreated: result.releasesCreated.length,
      tracksCreated: result.tracksCreated.length,
      artistsCreated: result.artistsCreated.length,
      warnings: result.warnings.length,
    },
    "[broma16] импорт каталога завершён",
  );
  return result;
}

/**
 * Сколько строк статистики останется без пары — считается по ISRC,
 * чтобы после импорта можно было честно показать эффект.
 */
export async function countUnmatchedIsrc(): Promise<{ tracksWithIsrc: number }> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tracksTable)
    .where(and(isNotNull(tracksTable.isrc), sql`${tracksTable.isrc} <> ''`));
  return { tracksWithIsrc: row?.n ?? 0 };
}
