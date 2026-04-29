import { Router } from "express";
import { db, artistsTable, releasesTable, tracksTable, transactionsTable, payoutsTable, deliveriesTable, activityLogTable, usageReportsTable } from "@workspace/db";
import { count, sum, eq, desc, gte, sql, and, inArray, between, isNotNull } from "drizzle-orm";
import { getDataScope, type DataScope } from "../lib/auth";

const router = Router();

// ─── Country code → display name (for Top Territories) ────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  TJ: "Tajikistan", RU: "Russia", UZ: "Uzbekistan", KZ: "Kazakhstan", KG: "Kyrgyzstan",
  DE: "Germany", US: "United States", AF: "Afghanistan", TR: "Turkey",
  GB: "United Kingdom", AE: "UAE", FR: "France", IT: "Italy", ES: "Spain",
  CN: "China", JP: "Japan", KR: "South Korea", IN: "India", BR: "Brazil",
  CA: "Canada", AU: "Australia", MX: "Mexico", PL: "Poland", UA: "Ukraine",
  BY: "Belarus", IL: "Israel", SA: "Saudi Arabia", EG: "Egypt", IR: "Iran",
};

// ─── Date helpers (usage_reports.period is text "YYYY-MM-DD") ─────────────
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return isoDay(d);
}

// ─── Scope helpers ────────────────────────────────────────────────────────
// Each helper returns either a Drizzle condition (or `undefined` for full
// access) for filtering the named table by the current session's scope, or
// the literal `false` to indicate "no rows" (empty result set).
function txScope(scope: DataScope) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "artist") return scope.artistId == null ? false : eq(transactionsTable.artistId, scope.artistId);
  if (scope.role === "label")  return scope.labelId  == null ? false : eq(transactionsTable.labelId,  scope.labelId);
  return false;
}
function releaseScope(scope: DataScope) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "artist") return scope.artistId == null ? false : eq(releasesTable.artistId, scope.artistId);
  if (scope.role === "label")  return scope.labelId  == null ? false : eq(releasesTable.labelId,  scope.labelId);
  return false;
}
function artistScope(scope: DataScope) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "artist") return scope.artistId == null ? false : eq(artistsTable.id,      scope.artistId);
  if (scope.role === "label")  return scope.labelId  == null ? false : eq(artistsTable.labelId, scope.labelId);
  return false;
}
function payoutScope(scope: DataScope) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "artist") return scope.artistId == null ? false : eq(payoutsTable.artistId, scope.artistId);
  if (scope.role === "label")  return scope.labelId  == null ? false : eq(payoutsTable.labelId,  scope.labelId);
  return false;
}
function deliveryScope(scope: DataScope, releaseIds: number[]) {
  if (scope.fullAccess) return undefined;
  if (releaseIds.length === 0) return false;
  return inArray(deliveriesTable.releaseId, releaseIds);
}

/**
 * Resolve label's artistIds for usage_reports filtering. Returns:
 *   - `null` for admin/manager (no filter, full access)
 *   - `[]` if scope is impossible (artist/label without id, or label with no artists)
 *   - `[artistId]` for artist scope
 *   - `[id1,id2,...]` for label scope
 */
async function resolveScopedArtistIds(scope: DataScope): Promise<number[] | null> {
  if (scope.fullAccess) return null;
  if (scope.role === "artist") return scope.artistId == null ? [] : [scope.artistId];
  if (scope.role === "label") {
    if (scope.labelId == null) return [];
    const rows = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, scope.labelId));
    return rows.map((r) => r.id);
  }
  return [];
}

/** usage_reports scope condition. `null` = full access, `false` = no rows. */
function usageScope(scopedArtistIds: number[] | null) {
  if (scopedArtistIds === null) return undefined;
  if (scopedArtistIds.length === 0) return false;
  return inArray(usageReportsTable.artistId, scopedArtistIds);
}

// Combine an optional base condition with the scope condition.
function withCond(...conds: any[]) {
  const real = conds.filter((c) => c !== undefined && c !== null && c !== false);
  if (real.length === 0) return undefined;
  if (real.length === 1) return real[0];
  return and(...real);
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const txS = txScope(scope);
  const relS = releaseScope(scope);
  const artS = artistScope(scope);
  const payS = payoutScope(scope);
  const scopedArtistIds = await resolveScopedArtistIds(scope);
  const usageS = usageScope(scopedArtistIds);

  // For deliveries we need release ids in scope (no direct fk on the table).
  let scopedReleaseIds: number[] = [];
  if (!scope.fullAccess) {
    const rows = await db.select({ id: releasesTable.id }).from(releasesTable).where(relS === false ? sql`false` : relS);
    scopedReleaseIds = rows.map((r) => r.id);
  }
  const delS = deliveryScope(scope, scopedReleaseIds);

  // For tracks: artist scope direct, label scope via artist ids.
  const trackWhere = scope.fullAccess
    ? undefined
    : scope.role === "artist"
      ? (scope.artistId == null ? sql`false` : eq(tracksTable.artistId, scope.artistId))
      : (scopedArtistIds === null || scopedArtistIds.length === 0 ? sql`false` : inArray(tracksTable.artistId, scopedArtistIds));

  const [artistCount] = await db.select({ count: count() }).from(artistsTable).where(artS === false ? sql`false` : artS);
  const [releaseCount] = await db.select({ count: count() }).from(releasesTable).where(relS === false ? sql`false` : relS);
  const [trackCount] = await db.select({ count: count() }).from(tracksTable).where(trackWhere);

  // Streams + revenue from usage_reports (real ingestion data).
  const [usageTotals] = await db.select({
    streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
  }).from(usageReportsTable).where(usageS === false ? sql`false` : usageS);

  // Revenue growth: last 30d vs prior 30d (from usage_reports).
  const last30Start = daysAgo(29);
  const prior30Start = daysAgo(59);
  const prior30End = daysAgo(30);
  const [last30] = await db.select({
    revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
  }).from(usageReportsTable).where(withCond(
    gte(usageReportsTable.period, last30Start),
    usageS,
  ));
  const [prior30] = await db.select({
    revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
  }).from(usageReportsTable).where(withCond(
    between(usageReportsTable.period, prior30Start, prior30End),
    usageS,
  ));
  const last30Rev = parseFloat(last30.revenue);
  const prior30Rev = parseFloat(prior30.revenue);
  const revenueGrowth = prior30Rev > 0
    ? Math.round(((last30Rev - prior30Rev) / prior30Rev) * 1000) / 10
    : 0;

  const [pendingPayouts] = await db.select({ count: count() }).from(payoutsTable)
    .where(withCond(eq(payoutsTable.status, "pending"), payS === false ? sql`false` : payS));
  const [activeDeliveries] = await db.select({ count: count() }).from(deliveriesTable)
    .where(withCond(eq(deliveriesTable.status, "in_progress"), delS === false ? sql`false` : delS));

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [releasesThisMonth] = await db.select({ count: count() }).from(releasesTable)
    .where(withCond(gte(releasesTable.createdAt, firstOfMonth), relS === false ? sql`false` : relS));

  res.json({
    totalArtists: artistCount.count,
    totalReleases: releaseCount.count,
    totalTracks: trackCount.count,
    totalStreams: Number(usageTotals.streams),
    totalRevenue: parseFloat(parseFloat(usageTotals.revenue).toFixed(2)),
    pendingPayouts: pendingPayouts.count,
    activeDeliveries: activeDeliveries.count,
    revenueGrowth,
    releasesThisMonth: releasesThisMonth.count,
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  // Activity log has no entity-scope columns and arbitrary entityType/entityId values.
  // Until we backfill that, the global feed is admin/manager-only.
  if (!scope.fullAccess) { res.json([]); return; }

  const activities = await db.select().from(activityLogTable)
    .orderBy(desc(activityLogTable.createdAt))
    .limit(20);

  res.json(activities.map(a => ({
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description,
    timestamp: a.createdAt.toISOString(),
    entityType: a.entityType,
    entityId: a.entityId,
  })));
});

/**
 * Top Artists — agregated from usage_reports.
 * Real streams + real revenue. Trend = last 30d vs prior 30d (% change).
 */
router.get("/dashboard/top-artists", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const scopedArtistIds = await resolveScopedArtistIds(scope);
  const usageS = usageScope(scopedArtistIds);
  if (usageS === false) { res.json([]); return; }

  const rows = await db.select({
    id: artistsTable.id,
    name: artistsTable.name,
    imageUrl: artistsTable.imageUrl,
    country: artistsTable.country,
    streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
  })
    .from(usageReportsTable)
    .innerJoin(artistsTable, eq(artistsTable.id, usageReportsTable.artistId))
    .where(withCond(isNotNull(usageReportsTable.artistId), usageS))
    .groupBy(artistsTable.id, artistsTable.name, artistsTable.imageUrl, artistsTable.country)
    .orderBy(desc(sql`sum(${usageReportsTable.streams})`))
    .limit(10);

  // Trend: per-artist last 30d vs prior 30d.
  const ids = rows.map((r) => r.id);
  const last30Start = daysAgo(29);
  const prior30Start = daysAgo(59);
  const prior30End = daysAgo(30);

  const trendMap = new Map<number, number>();
  if (ids.length > 0) {
    const lastRows = await db.select({
      artistId: usageReportsTable.artistId,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    })
      .from(usageReportsTable)
      .where(and(
        inArray(usageReportsTable.artistId, ids),
        gte(usageReportsTable.period, last30Start),
      ))
      .groupBy(usageReportsTable.artistId);
    const priorRows = await db.select({
      artistId: usageReportsTable.artistId,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    })
      .from(usageReportsTable)
      .where(and(
        inArray(usageReportsTable.artistId, ids),
        between(usageReportsTable.period, prior30Start, prior30End),
      ))
      .groupBy(usageReportsTable.artistId);
    const lastMap = new Map(lastRows.map((r) => [r.artistId!, Number(r.streams)]));
    const priorMap = new Map(priorRows.map((r) => [r.artistId!, Number(r.streams)]));
    for (const id of ids) {
      const last = lastMap.get(id) ?? 0;
      const prior = priorMap.get(id) ?? 0;
      const trend = prior > 0 ? Math.round(((last - prior) / prior) * 1000) / 10 : 0;
      trendMap.set(id, trend);
    }
  }

  res.json(rows.map((a) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.imageUrl ?? null,
    country: a.country ?? null,
    totalStreams: Number(a.streams),
    revenue: parseFloat(parseFloat(a.revenue).toFixed(2)),
    trend: trendMap.get(a.id) ?? 0,
  })));
});

router.get("/dashboard/revenue-by-month", async (req, res): Promise<void> => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const scope = getDataScope(req);
  const txS = txScope(scope);
  if (txS === false) { res.json([]); return; }

  // Период: последние 12 месяцев
  const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Группировка по period из transactions
  const dspRows = await db.select({
    period: transactionsTable.period,
    total: sum(transactionsTable.amount),
  })
    .from(transactionsTable)
    .where(withCond(
      eq(transactionsTable.type, "dsp_revenue"),
      gte(transactionsTable.createdAt, startDate),
      txS,
    ))
    .groupBy(transactionsTable.period);

  const pubRows = await db.select({
    period: transactionsTable.period,
    total: sum(transactionsTable.amount),
  })
    .from(transactionsTable)
    .where(withCond(
      eq(transactionsTable.type, "publishing_revenue"),
      gte(transactionsTable.createdAt, startDate),
      txS,
    ))
    .groupBy(transactionsTable.period);

  const dspMap = new Map(dspRows.map(r => [r.period, parseFloat(r.total ?? "0")]));
  const pubMap = new Map(pubRows.map(r => [r.period, parseFloat(r.total ?? "0")]));

  const result = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = `${months[date.getMonth()]} '${String(date.getFullYear()).slice(-2)}`;
    const periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const dspRevenue = dspMap.get(periodKey) ?? 0;
    const publishingRevenue = pubMap.get(periodKey) ?? 0;
    result.push({
      month: monthLabel,
      revenue: dspRevenue + publishingRevenue,
      dspRevenue,
      publishingRevenue,
    });
  }
  res.json(result);
});

router.get("/dashboard/releases-by-status", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const relS = releaseScope(scope);
  if (relS === false) { res.json([]); return; }

  const statuses = await db.select({
    status: releasesTable.status,
    count: count(),
  }).from(releasesTable).where(relS).groupBy(releasesTable.status);

  res.json(statuses.map(s => ({ status: s.status, count: s.count })));
});

/* ─────────────────────────────────────────
   Dashboard widgets — все из usage_reports
───────────────────────────────────────── */

/**
 * Top DSPs (streams + revenue per platform). Используется для двух donut-чартов
 * (TopDspCard metric=streams и metric=revenue). Данные из usage_reports.
 */
router.get("/dashboard/top-dsp", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const scopedArtistIds = await resolveScopedArtistIds(scope);
  const usageS = usageScope(scopedArtistIds);
  if (usageS === false) { res.json([]); return; }

  const rows = await db.select({
    platform: usageReportsTable.platform,
    streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
  })
    .from(usageReportsTable)
    .where(usageS)
    .groupBy(usageReportsTable.platform)
    .orderBy(desc(sql`sum(${usageReportsTable.streams})`))
    .limit(8);

  const totalStreams = rows.reduce((s, r) => s + Number(r.streams), 0);

  res.json(rows.map((r) => {
    const streams = Number(r.streams);
    const revenue = parseFloat(parseFloat(r.revenue).toFixed(2));
    return {
      platform: r.platform,
      revenue,
      streams,
      share: totalStreams > 0 ? Math.round((streams / totalStreams) * 1000) / 10 : 0,
    };
  }));
});

/**
 * Top Territories — настоящая страна слушателя из usage_reports.countryCode.
 * artistCount — сколько уникальных артистов имеют стримы в этой стране.
 */
router.get("/dashboard/top-territories", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const scopedArtistIds = await resolveScopedArtistIds(scope);
  const usageS = usageScope(scopedArtistIds);
  if (usageS === false) { res.json([]); return; }

  const rows = await db.select({
    code: usageReportsTable.countryCode,
    streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
    artistCount: sql<string>`count(distinct ${usageReportsTable.artistId})`,
  })
    .from(usageReportsTable)
    .where(withCond(isNotNull(usageReportsTable.countryCode), usageS))
    .groupBy(usageReportsTable.countryCode)
    .orderBy(desc(sql`sum(${usageReportsTable.streams})`))
    .limit(10);

  res.json(rows.map((r) => ({
    country: COUNTRY_NAMES[r.code!] ?? r.code!,
    countryCode: r.code!,
    artistCount: Number(r.artistCount),
    revenue: parseFloat(parseFloat(r.revenue).toFixed(2)),
    streams: Number(r.streams),
  })));
});

// Latest Releases — карточная сетка с обложками
router.get("/dashboard/latest-releases", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const relS = releaseScope(scope);
  if (relS === false) { res.json([]); return; }

  const rows = await db.select({
    id: releasesTable.id,
    title: releasesTable.title,
    coverUrl: releasesTable.coverUrl,
    status: releasesTable.status,
    releaseType: releasesTable.releaseType,
    releaseDate: releasesTable.releaseDate,
    createdAt: releasesTable.createdAt,
    artistId: releasesTable.artistId,
    artistName: artistsTable.name,
    artistImageUrl: artistsTable.imageUrl,
  })
    .from(releasesTable)
    .leftJoin(artistsTable, eq(releasesTable.artistId, artistsTable.id))
    .where(relS)
    .orderBy(desc(releasesTable.createdAt))
    .limit(10);

  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    coverUrl: r.coverUrl,
    status: r.status,
    releaseType: r.releaseType,
    releaseDate: r.releaseDate,
    createdAt: r.createdAt.toISOString(),
    artist: {
      id: r.artistId,
      name: r.artistName ?? "Unknown Artist",
      imageUrl: r.artistImageUrl,
    },
  })));
});

/**
 * Top Tracks — настоящие streams+revenue из usage_reports.trackId.
 * Trend = (last 30d - prior 30d) / prior 30d  по streams.
 */
router.get("/dashboard/top-tracks", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const scopedArtistIds = await resolveScopedArtistIds(scope);
  const usageS = usageScope(scopedArtistIds);
  if (usageS === false) { res.json([]); return; }

  const rows = await db.select({
    trackId: usageReportsTable.trackId,
    streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
    title: tracksTable.title,
    isrc: tracksTable.isrc,
    durationSeconds: tracksTable.durationSeconds,
    artistId: artistsTable.id,
    artistName: artistsTable.name,
    artistImageUrl: artistsTable.imageUrl,
    releaseId: releasesTable.id,
    releaseTitle: releasesTable.title,
    coverUrl: releasesTable.coverUrl,
  })
    .from(usageReportsTable)
    .innerJoin(tracksTable, eq(tracksTable.id, usageReportsTable.trackId))
    .leftJoin(artistsTable, eq(artistsTable.id, tracksTable.artistId))
    .leftJoin(releasesTable, eq(releasesTable.id, tracksTable.releaseId))
    .where(withCond(isNotNull(usageReportsTable.trackId), usageS))
    .groupBy(
      usageReportsTable.trackId,
      tracksTable.title, tracksTable.isrc, tracksTable.durationSeconds,
      artistsTable.id, artistsTable.name, artistsTable.imageUrl,
      releasesTable.id, releasesTable.title, releasesTable.coverUrl,
    )
    .orderBy(desc(sql`sum(${usageReportsTable.streams})`))
    .limit(10);

  // Trend per track.
  const trackIds = rows.map((r) => r.trackId).filter((x): x is number => x != null);
  const last30Start = daysAgo(29);
  const prior30Start = daysAgo(59);
  const prior30End = daysAgo(30);
  const trendMap = new Map<number, number>();
  if (trackIds.length > 0) {
    const lastRows = await db.select({
      trackId: usageReportsTable.trackId,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    })
      .from(usageReportsTable)
      .where(and(
        inArray(usageReportsTable.trackId, trackIds),
        gte(usageReportsTable.period, last30Start),
      ))
      .groupBy(usageReportsTable.trackId);
    const priorRows = await db.select({
      trackId: usageReportsTable.trackId,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
    })
      .from(usageReportsTable)
      .where(and(
        inArray(usageReportsTable.trackId, trackIds),
        between(usageReportsTable.period, prior30Start, prior30End),
      ))
      .groupBy(usageReportsTable.trackId);
    const lastMap = new Map(lastRows.map((r) => [r.trackId!, Number(r.streams)]));
    const priorMap = new Map(priorRows.map((r) => [r.trackId!, Number(r.streams)]));
    for (const id of trackIds) {
      const last = lastMap.get(id) ?? 0;
      const prior = priorMap.get(id) ?? 0;
      const trend = prior > 0 ? Math.round(((last - prior) / prior) * 1000) / 10 : 0;
      trendMap.set(id, trend);
    }
  }

  res.json(rows.map((t) => ({
    id: t.trackId!,
    title: t.title ?? "Unknown",
    isrc: t.isrc ?? null,
    durationSeconds: t.durationSeconds ?? null,
    coverUrl: t.coverUrl ?? null,
    artist: { id: t.artistId, name: t.artistName ?? "—", imageUrl: t.artistImageUrl ?? null },
    release: { id: t.releaseId, title: t.releaseTitle ?? null },
    streams: Number(t.streams),
    revenue: parseFloat(parseFloat(t.revenue).toFixed(2)),
    trend: trendMap.get(t.trackId!) ?? 0,
  })));
});

// Royalty Summary — общий + Top Earner + breakdown по артистам/релизам
router.get("/dashboard/royalty-summary", async (req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const scope = getDataScope(req);
  const txS = txScope(scope);
  if (txS === false) {
    res.json({ totalRoyalties: 0, dspRoyalties: 0, publishingRoyalties: 0, mtd: 0, topArtists: [], topReleases: [] });
    return;
  }

  const [totalResult] = await db.select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(withCond(eq(transactionsTable.type, "dsp_revenue"), txS));

  const [mtdResult] = await db.select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(withCond(
      eq(transactionsTable.type, "dsp_revenue"),
      gte(transactionsTable.createdAt, startOfMonth),
      txS,
    ));

  const [pubTotal] = await db.select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(withCond(eq(transactionsTable.type, "publishing_revenue"), txS));

  // Top earners by artist
  const topArtists = await db.select({
    id: artistsTable.id,
    name: artistsTable.name,
    revenue: sum(transactionsTable.amount),
  })
    .from(transactionsTable)
    .leftJoin(artistsTable, eq(transactionsTable.artistId, artistsTable.id))
    .where(withCond(
      eq(transactionsTable.type, "dsp_revenue"),
      sql`${transactionsTable.artistId} is not null`,
      txS,
    ))
    .groupBy(artistsTable.id, artistsTable.name)
    .orderBy(desc(sql`sum(${transactionsTable.amount})`))
    .limit(5);

  // Top earners by release
  const topReleases = await db.select({
    id: releasesTable.id,
    title: releasesTable.title,
    coverUrl: releasesTable.coverUrl,
    revenue: sum(transactionsTable.amount),
  })
    .from(transactionsTable)
    .leftJoin(releasesTable, eq(transactionsTable.releaseId, releasesTable.id))
    .where(withCond(
      eq(transactionsTable.type, "dsp_revenue"),
      sql`${transactionsTable.releaseId} is not null`,
      txS,
    ))
    .groupBy(releasesTable.id, releasesTable.title, releasesTable.coverUrl)
    .orderBy(desc(sql`sum(${transactionsTable.amount})`))
    .limit(5);

  const totalDsp = parseFloat(totalResult.total ?? "0");

  res.json({
    totalRoyalties: totalDsp + parseFloat(pubTotal.total ?? "0"),
    dspRoyalties: totalDsp,
    publishingRoyalties: parseFloat(pubTotal.total ?? "0"),
    mtd: parseFloat(mtdResult.total ?? "0"),
    topArtists: topArtists.map(a => ({
      id: a.id,
      name: a.name ?? "Unknown",
      revenue: parseFloat(a.revenue ?? "0"),
      share: totalDsp > 0 ? Math.round((parseFloat(a.revenue ?? "0") / totalDsp) * 1000) / 10 : 0,
    })),
    topReleases: topReleases.map(r => ({
      id: r.id,
      title: r.title ?? "Unknown",
      coverUrl: r.coverUrl,
      revenue: parseFloat(r.revenue ?? "0"),
      share: totalDsp > 0 ? Math.round((parseFloat(r.revenue ?? "0") / totalDsp) * 1000) / 10 : 0,
    })),
  });
});

/**
 * Artists table — большая таблица внизу.
 * streams/revenue — настоящие из usage_reports (LEFT JOIN aggregate, чтобы артисты
 * без стримов тоже попадали с 0). releaseCount — отдельный подзапрос (без fan-out).
 */
router.get("/dashboard/artists-table", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  let scopeSql = sql``;
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json([]); return; }
      scopeSql = sql`WHERE a.id = ${scope.artistId}`;
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json([]); return; }
      scopeSql = sql`WHERE a.label_id = ${scope.labelId}`;
    }
  }

  const rows = await db.execute(sql`
    SELECT
      a.id, a.name, a.image_url AS "imageUrl", a.genre, a.country, a.status,
      a.spotify_id AS "spotifyId", a.apple_id AS "appleId", a.created_at AS "createdAt",
      COALESCE(usg.streams, 0)::bigint AS streams,
      COALESCE(usg.revenue, 0)::numeric AS revenue,
      COALESCE(rc.cnt, 0)::int AS "releaseCount"
    FROM artists a
    LEFT JOIN (
      SELECT artist_id, SUM(streams)::bigint AS streams, SUM(revenue) AS revenue
      FROM usage_reports
      WHERE artist_id IS NOT NULL
      GROUP BY artist_id
    ) usg ON usg.artist_id = a.id
    LEFT JOIN (
      SELECT artist_id, COUNT(*) AS cnt FROM releases GROUP BY artist_id
    ) rc ON rc.artist_id = a.id
    ${scopeSql}
    ORDER BY COALESCE(usg.streams, 0) DESC, a.id ASC
    LIMIT 30
  `);

  const list = (rows as unknown as { rows: any[] }).rows ?? (rows as any);
  res.json(list.map((a: any) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.imageUrl,
    genre: a.genre,
    country: a.country,
    status: a.status,
    hasSpotify: !!a.spotifyId,
    hasApple: !!a.appleId,
    releaseCount: a.releaseCount,
    streams: Number(a.streams ?? 0),
    revenue: parseFloat(parseFloat(a.revenue ?? "0").toFixed(2)),
  })));
});

// ─── Finance KPI cards (admin/manager only — guarded in routes/index.ts? Нет — /dashboard открыт всем.
// Но эта ручка для admin: возвращаем 403 для остальных. Считаем по всему org.) ──
router.get("/dashboard/finance-kpis", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!scope.fullAccess) { res.status(403).json({ error: "admin_only" }); return; }

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [revToday] = await db
    .select({ s: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)::text` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, "credit"), gte(transactionsTable.createdAt, startOfDay)));

  const [revMonth] = await db
    .select({ s: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)::text` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, "credit"), gte(transactionsTable.createdAt, startOfMonth)));

  const [pending] = await db
    .select({
      cnt: sql<number>`count(*)::int`,
      sum: sql<string>`coalesce(sum(${payoutsTable.amount}), 0)::text`,
    })
    .from(payoutsTable)
    .where(eq(payoutsTable.status, "pending"));

  const [readyToPay] = await db
    .select({
      cnt: sql<number>`count(*)::int`,
      sum: sql<string>`coalesce(sum(${payoutsTable.amount}), 0)::text`,
    })
    .from(payoutsTable)
    .where(eq(payoutsTable.status, "approved"));

  let openFraudAlerts = 0;
  let openClaims = 0;
  try {
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM fraud_alerts WHERE status = 'open'`);
    openFraudAlerts = Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
  } catch { /* table might be empty */ }
  try {
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM ownership_claims WHERE status IN ('pending','disputed')`);
    openClaims = Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
  } catch { /* table might be empty */ }

  res.json({
    revenueToday: parseFloat(revToday?.s ?? "0"),
    revenueThisMonth: parseFloat(revMonth?.s ?? "0"),
    pendingPayouts: { count: pending?.cnt ?? 0, sum: parseFloat(pending?.sum ?? "0") },
    readyToPay: { count: readyToPay?.cnt ?? 0, sum: parseFloat(readyToPay?.sum ?? "0") },
    openFraudAlerts,
    openClaims,
  });
});

export default router;
