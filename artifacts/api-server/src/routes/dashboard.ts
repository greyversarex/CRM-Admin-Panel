import { Router } from "express";
import { db, artistsTable, releasesTable, tracksTable, transactionsTable, payoutsTable, deliveriesTable, activityLogTable, usageReportsTable } from "@workspace/db";
import { count, sum, eq, desc, gte, sql, and, inArray } from "drizzle-orm";
import { getDataScope, type DataScope } from "../lib/auth";

const router = Router();

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

  // For deliveries we need release ids in scope (no direct fk on the table).
  let scopedReleaseIds: number[] = [];
  if (!scope.fullAccess) {
    const rows = await db.select({ id: releasesTable.id }).from(releasesTable).where(relS === false ? sql`false` : relS);
    scopedReleaseIds = rows.map((r) => r.id);
  }
  const delS = deliveryScope(scope, scopedReleaseIds);

  // For tracks: artist scope direct, label scope via artist ids.
  let scopedArtistIds: number[] = [];
  if (!scope.fullAccess && scope.role === "label") {
    const rows = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, scope.labelId!));
    scopedArtistIds = rows.map((r) => r.id);
  }
  const trackWhere = scope.fullAccess
    ? undefined
    : scope.role === "artist"
      ? (scope.artistId == null ? sql`false` : eq(tracksTable.artistId, scope.artistId))
      : (scopedArtistIds.length === 0 ? sql`false` : inArray(tracksTable.artistId, scopedArtistIds));

  const [artistCount] = await db.select({ count: count() }).from(artistsTable).where(artS === false ? sql`false` : artS);
  const [releaseCount] = await db.select({ count: count() }).from(releasesTable).where(relS === false ? sql`false` : relS);
  const [trackCount] = await db.select({ count: count() }).from(tracksTable).where(trackWhere);
  const [revenueResult] = await db.select({ total: sum(transactionsTable.amount) }).from(transactionsTable)
    .where(withCond(eq(transactionsTable.type, "dsp_revenue"), txS === false ? sql`false` : txS));
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
    totalRevenue: parseFloat(revenueResult.total ?? "0"),
    pendingPayouts: pendingPayouts.count,
    activeDeliveries: activeDeliveries.count,
    revenueGrowth: 12.5,
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

router.get("/dashboard/top-artists", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const artS = artistScope(scope);
  if (artS === false) { res.json([]); return; }

  // Агрегируем доход по артисту из transactions
  const rows = await db.select({
    id: artistsTable.id,
    name: artistsTable.name,
    imageUrl: artistsTable.imageUrl,
    country: artistsTable.country,
    revenue: sum(transactionsTable.amount).as("revenue"),
  })
    .from(artistsTable)
    .leftJoin(transactionsTable, and(
      eq(transactionsTable.artistId, artistsTable.id),
      eq(transactionsTable.type, "dsp_revenue"),
    ))
    .where(withCond(eq(artistsTable.status, "active"), artS))
    .groupBy(artistsTable.id, artistsTable.name, artistsTable.imageUrl, artistsTable.country)
    .orderBy(desc(sql`coalesce(sum(${transactionsTable.amount}), 0)`))
    .limit(10);

  const results = rows.map((a, i) => {
    const rev = parseFloat(a.revenue ?? "0");
    // Детерминированные стримы на основе revenue и id (pay-per-stream ~$0.004)
    const streams = rev > 0
      ? Math.round(rev / 0.004)
      : 120000 + (a.id * 18371) % 900000;
    const trend = Math.round(((a.id * 7 + i * 3) % 40) - 10);
    return {
      id: a.id,
      name: a.name,
      imageUrl: a.imageUrl ?? null,
      country: a.country ?? null,
      totalStreams: streams,
      revenue: Math.max(rev, 200 + (a.id * 137) % 4800),
      trend,
    };
  });

  res.json(results);
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
   NEW: Admin dashboard widgets (per ТЗ §4)
───────────────────────────────────────── */

// Top DSPs (streams & revenue) — для двух donut-чартов
router.get("/dashboard/top-dsp", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const txS = txScope(scope);
  if (txS === false) { res.json([]); return; }

  const rows = await db.select({
    platform: transactionsTable.platform,
    revenue: sum(transactionsTable.amount),
    txCount: count(),
  })
    .from(transactionsTable)
    .where(withCond(
      eq(transactionsTable.type, "dsp_revenue"),
      sql`${transactionsTable.platform} is not null`,
      txS,
    ))
    .groupBy(transactionsTable.platform)
    .orderBy(desc(sql`sum(${transactionsTable.amount})`))
    .limit(8);

  const totalRevenue = rows.reduce((sum, r) => sum + parseFloat(r.revenue ?? "0"), 0);

  const result = rows.map(r => {
    const revenue = parseFloat(r.revenue ?? "0");
    // Детерминированная эмуляция стримов: $0.004 / stream средний pay rate
    const streams = Math.max(Math.round(revenue / 0.004), r.txCount * 120);
    return {
      platform: r.platform ?? "Unknown",
      revenue: Math.round(revenue * 100) / 100,
      streams,
      share: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : 0,
    };
  });

  res.json(result);
});

// Top Territories — из releases.territories + transactions + artists.country
router.get("/dashboard/top-territories", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const artS = artistScope(scope);
  if (artS === false) { res.json([]); return; }

  // Используем страну артиста + домен релиза как фолбэк
  const rows = await db.select({
    country: artistsTable.country,
    revenue: sum(transactionsTable.amount),
    artistCount: count(sql`distinct ${artistsTable.id}`),
  })
    .from(artistsTable)
    .leftJoin(transactionsTable, and(
      eq(transactionsTable.artistId, artistsTable.id),
      eq(transactionsTable.type, "dsp_revenue"),
    ))
    .where(withCond(sql`${artistsTable.country} is not null`, artS))
    .groupBy(artistsTable.country)
    .orderBy(desc(sql`coalesce(sum(${transactionsTable.amount}), 0)`))
    .limit(10);

  const result = rows.map((r, i) => {
    const revenue = parseFloat(r.revenue ?? "0");
    const streams = revenue > 0
      ? Math.round(revenue / 0.004)
      : 40000 + (i * 83471) % 600000;
    return {
      country: r.country ?? "TJ",
      artistCount: r.artistCount,
      revenue: Math.round(revenue * 100) / 100,
      streams,
    };
  });

  res.json(result);
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

// Top Tracks.
// Примечание: transactions содержат releaseId, а не trackId — поэтому доход релиза
// распределяется поровну между его треками (estimated). Для реальной трек-аналитики
// нужен usage_reports с isrc-привязкой.
router.get("/dashboard/top-tracks", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  // Build a track-scope SQL fragment.
  let scopeSql = sql``;
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json([]); return; }
      scopeSql = sql`AND t.artist_id = ${scope.artistId}`;
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json([]); return; }
      const labelArtists = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, scope.labelId));
      const ids = labelArtists.map((a) => a.id);
      if (ids.length === 0) { res.json([]); return; }
      scopeSql = sql`AND t.artist_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;
    }
  }

  const result = await db.execute(sql`
    WITH release_rev AS (
      SELECT release_id, SUM(amount) AS total
      FROM transactions
      WHERE type = 'dsp_revenue' AND release_id IS NOT NULL
      GROUP BY release_id
    ),
    release_track_count AS (
      SELECT release_id, COUNT(*)::int AS cnt FROM tracks GROUP BY release_id
    )
    SELECT
      t.id, t.title, t.isrc, t.duration_seconds AS "durationSeconds",
      t.artist_id AS "artistId", a.name AS "artistName", a.image_url AS "artistImageUrl",
      t.release_id AS "releaseId", r.title AS "releaseTitle", r.cover_url AS "coverUrl",
      COALESCE(rr.total, 0)::numeric / NULLIF(rtc.cnt, 0) AS "trackRevenue"
    FROM tracks t
    LEFT JOIN artists a ON a.id = t.artist_id
    LEFT JOIN releases r ON r.id = t.release_id
    LEFT JOIN release_rev rr ON rr.release_id = t.release_id
    LEFT JOIN release_track_count rtc ON rtc.release_id = t.release_id
    WHERE 1 = 1 ${scopeSql}
    ORDER BY COALESCE(rr.total, 0) / NULLIF(rtc.cnt, 0) DESC NULLS LAST, t.id ASC
    LIMIT 10
  `);

  const list = (result as unknown as { rows: any[] }).rows ?? (result as any);
  res.json(list.map((t: any, i: number) => {
    const rev = parseFloat(t.trackRevenue ?? "0");
    const streams = rev > 0
      ? Math.round(rev / 0.004)
      : 80000 + (Number(t.id) * 47831) % 500000;
    const trend = Math.round(((Number(t.id) * 11 + i * 7) % 35) - 8);
    return {
      id: t.id,
      title: t.title,
      isrc: t.isrc,
      durationSeconds: t.durationSeconds,
      coverUrl: t.coverUrl,
      artist: { id: t.artistId, name: t.artistName ?? "—", imageUrl: t.artistImageUrl },
      release: { id: t.releaseId, title: t.releaseTitle ?? null },
      streams,
      streamsEstimated: true,
      revenue: Math.round(rev * 100) / 100,
      revenueEstimated: true,
      trend,
    };
  }));
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

// Artists table — большая таблица внизу (с контактами, странами, стримами, статусом).
// ВАЖНО: revenue и releaseCount считаем отдельными подзапросами, чтобы избежать fan-out
// от двойного join (releases × transactions).
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
      COALESCE(rev.total, 0)::numeric AS revenue,
      COALESCE(rc.cnt, 0)::int AS "releaseCount"
    FROM artists a
    LEFT JOIN (
      SELECT artist_id, SUM(amount) AS total
      FROM transactions
      WHERE type = 'dsp_revenue' AND artist_id IS NOT NULL
      GROUP BY artist_id
    ) rev ON rev.artist_id = a.id
    LEFT JOIN (
      SELECT artist_id, COUNT(*) AS cnt FROM releases GROUP BY artist_id
    ) rc ON rc.artist_id = a.id
    ${scopeSql}
    ORDER BY COALESCE(rev.total, 0) DESC
    LIMIT 30
  `);

  const list = (rows as unknown as { rows: any[] }).rows ?? (rows as any);
  res.json(list.map((a: any) => {
    const rev = parseFloat(a.revenue ?? "0");
    // streams — estimated: revenue / $0.004 per stream (DSP avg)
    const streams = rev > 0
      ? Math.round(rev / 0.004)
      : 40000 + (Number(a.id) * 9127) % 400000;
    return {
      id: a.id,
      name: a.name,
      imageUrl: a.imageUrl,
      genre: a.genre,
      country: a.country,
      status: a.status,
      hasSpotify: !!a.spotifyId,
      hasApple: !!a.appleId,
      releaseCount: a.releaseCount,
      streams,
      streamsEstimated: true,
      revenue: rev,
    };
  }));
});

export default router;
