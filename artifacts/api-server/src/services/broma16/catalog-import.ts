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

// ── Формы данных Broma16 ────────────────────────────────────────────

type BromaArtistRef = { id?: number; title?: string };

type BromaRelease = {
  id: number;
  title: string;
  performers?: string[];
  artists?: BromaArtistRef[];
  ean?: string;
  catalogue_number?: string;
  release_date?: string;
  release_original_date?: string;
  moderation_status?: string;
  statuses?: string[];
  release_type_id?: number;
};

type BromaRecording = {
  id: number;
  title: string;
  isrc?: string;
  performers?: string[];
  artists?: BromaArtistRef[];
  published_date?: string | null;
  is_instrumental?: number;
  parental_warning_type?: string;
};

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

// ── Нормализация и сопоставление ────────────────────────────────────

/** Ключ для сравнения названий/имён: без регистра, диакритики и пунктуации. */
function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

/** Первое имя исполнителя: Broma16 кладёт их и в performers, и в artists. */
function primaryPerformer(item: { performers?: string[]; artists?: BromaArtistRef[] }): string | null {
  const raw = item.performers?.[0] ?? item.artists?.[0]?.title ?? null;
  if (!raw) return null;
  // «Qobiljon Zaripov; Komiljon Zaripov» — берём первого как главного.
  const first = raw.split(";")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/** Наш статус релиза по статусам Broma16. */
function mapStatus(rel: BromaRelease): string {
  const moderation = (rel.moderation_status ?? "").toLowerCase();
  const statuses = (rel.statuses ?? []).map((s) => s.toLowerCase());
  if (statuses.includes("shipped")) return "live";
  if (moderation === "approved") return "approved";
  if (moderation === "rejected") return "rejected";
  return "pending_review";
}

/**
 * Типы релиза Broma16 (/dictionaries/release-types):
 * 2 Альбом · 42 Рингбэктон · 43 Рингтон · 51 Сингл · 64 EP · 69 Компиляция · 70 TikTok.
 */
const RELEASE_TYPE_BY_ID: Record<number, string> = {
  2: "album",
  51: "single",
  64: "ep",
  69: "compilation",
};

/**
 * Типы, которые не заводим отдельным релизом: это дополнительные доставки уже
 * существующей песни (та же фонограмма и тот же ISRC, отличается лишь
 * штрихкод). В CRM они выглядели бы дублями каталога, а статистика всё равно
 * приходит по ISRC основного сингла.
 */
const SECONDARY_RELEASE_TYPE_IDS = new Set([42, 43, 70]);

function mapReleaseType(rel: BromaRelease): string {
  return RELEASE_TYPE_BY_ID[rel.release_type_id ?? 51] ?? "single";
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

  const [bromaReleases, bromaRecordings] = await Promise.all([
    fetchAssets<BromaRelease>(c, accountId, "releases"),
    fetchAssets<BromaRecording>(c, accountId, "recordings"),
  ]);

  const result: CatalogImportResult = {
    dryRun,
    bromaReleases: bromaReleases.length,
    bromaRecordings: bromaRecordings.length,
    artistsCreated: [],
    releasesCreated: [],
    releasesLinked: [],
    secondarySkipped: [],
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
