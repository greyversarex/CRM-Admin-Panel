/**
 * Analytics — Playlists & TikTok Stats
 *
 * GET /api/analytics/playlists
 * GET /api/analytics/tiktok
 *
 * Access scoped: admin/manager see all, label/artist see their own.
 *
 * Никаких автосидов с Math.random — если данных в таблице нет, возвращаем
 * пустой массив. Любой посев демо-данных делается отдельным скриптом seed.ts.
 */
import { Router } from "express";
import { z } from "zod";
import {
  db, playlistStatsTable, tiktokStatsTable, ugcMetricsTable,
  tracksTable, artistsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";
import { getDataScope, requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";

const router = Router();

function scopeFilter(scope: ReturnType<typeof getDataScope>, table: { labelId: any; artistId: any; id: any }) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "label"  && scope.labelId)  return eq(table.labelId,  scope.labelId);
  if (scope.role === "artist" && scope.artistId) return eq(table.artistId, scope.artistId);
  return eq(table.id, -1);
}

// Возвращает список artistId, которые входят в скоуп текущей сессии.
// admin/manager → null (без ограничения). label → артисты лейбла. artist → [self].
async function scopedArtistIds(scope: ReturnType<typeof getDataScope>): Promise<number[] | null> {
  if (scope.fullAccess) return null;
  if (scope.role === "artist") return scope.artistId == null ? [] : [scope.artistId];
  if (scope.role === "label") {
    if (scope.labelId == null) return [];
    const rows = await db.select({ id: artistsTable.id }).from(artistsTable)
      .where(eq(artistsTable.labelId, scope.labelId));
    return rows.map(r => r.id);
  }
  return [];
}

router.get("/analytics/playlists", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const where = scopeFilter(scope, playlistStatsTable);
  const rows = await db.select().from(playlistStatsTable)
    .where(where)
    .orderBy(desc(playlistStatsTable.followers));

  res.json(rows.map(r => ({
    id: r.id,
    playlistName: r.playlistName,
    dsp: r.dsp,
    followers: r.followers,
    streams: r.streams,
    trendPct: r.trendPct,
    lastUpdated: r.lastUpdated.toISOString(),
  })));
});

router.get("/analytics/tiktok", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const where = scopeFilter(scope, tiktokStatsTable);
  const rows = await db.select().from(tiktokStatsTable)
    .where(where)
    .orderBy(desc(tiktokStatsTable.videoViews));

  res.json(rows.map(r => ({
    id: r.id,
    trackTitle: r.trackTitle,
    artistName: r.artistName,
    uses: r.uses,
    videoViews: r.videoViews,
    likes: r.likes,
    reposts: r.reposts,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
  })));
});

// ─── Playlists CRUD ─────────────────────────────────────────────────────────
// Чтения скоупятся, как и GET /analytics/playlists выше; writes — только admin/manager.

const PlaylistBody = z.object({
  playlistName: z.string().min(1).max(200),
  dsp: z.string().min(1).max(60),
  followers: z.number().int().nonnegative().default(0),
  streams: z.number().int().nonnegative().default(0),
  trendPct: z.number().default(0),
  artistId: z.number().int().positive().nullish(),
  labelId: z.number().int().positive().nullish(),
});

router.post("/playlists", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
  const parsed = PlaylistBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const scope = getDataScope(req);

  // Лейбл может создавать плейлисты только в своей области:
  // labelId фиксируем по сессии, чужие artist/label игнорируем.
  let labelId  = parsed.data.labelId  ?? null;
  let artistId = parsed.data.artistId ?? null;
  if (scope.role === "label") {
    if (!scope.labelId) { res.status(403).json({ error: "Forbidden: no label scope" }); return; }
    labelId  = scope.labelId;
    artistId = null;
  }

  const [row] = await db.insert(playlistStatsTable).values({
    ...parsed.data,
    artistId,
    labelId,
    lastUpdated: new Date(),
  }).returning();
  void auditMutation(req, { action: "create", entityType: "playlist_stat", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

router.put("/playlists/:id", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PlaylistBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }

  const [before] = await db.select().from(playlistStatsTable).where(eq(playlistStatsTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  const scope = getDataScope(req);
  if (scope.role === "label") {
    if (!scope.labelId || before.labelId !== scope.labelId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  // Никогда не позволяем лейблу переназначить плейлист другому лейблу.
  const patch: Record<string, unknown> = { ...parsed.data, lastUpdated: new Date() };
  if (scope.role === "label") {
    delete patch.labelId;
    delete patch.artistId;
  }

  const [row] = await db.update(playlistStatsTable).set(patch)
    .where(eq(playlistStatsTable.id, id)).returning();

  void auditMutation(req, { action: "update", entityType: "playlist_stat", entityId: id, before, after: row });
  res.json(row);
});

router.delete("/playlists/:id", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [before] = await db.select().from(playlistStatsTable).where(eq(playlistStatsTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  const scope = getDataScope(req);
  if (scope.role === "label") {
    if (!scope.labelId || before.labelId !== scope.labelId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  await db.delete(playlistStatsTable).where(eq(playlistStatsTable.id, id));
  void auditMutation(req, { action: "delete", entityType: "playlist_stat", entityId: id, before, after: null });
  res.status(204).end();
});

// ─── UGC summary для дашборда ───────────────────────────────────────────────
// Агрегирует ugc_metrics по платформе и сумме, фильтруя по треков-владению (scope).
// admin/manager — без ограничения; label/artist — только их треки.

router.get("/dashboard/ugc-summary", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const artistIds = await scopedArtistIds(scope);

  // Опциональный диапазон дат (по recordedAt).
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to   = typeof req.query.to   === "string" ? new Date(req.query.to)   : null;

  const conds: any[] = [];
  if (from && !Number.isNaN(from.getTime())) conds.push(gte(ugcMetricsTable.recordedAt, from));
  if (to   && !Number.isNaN(to.getTime()))   conds.push(lte(ugcMetricsTable.recordedAt, to));

  // Scope: если не fullAccess — фильтруем по trackId IN (треки наших артистов).
  // Пустой scope → возвращаем нули (НЕ показываем чужие данные).
  if (artistIds !== null) {
    if (artistIds.length === 0) {
      res.json({ totals: { views: 0, likes: 0, shares: 0, videos: 0, revenueCents: 0 }, byPlatform: [] });
      return;
    }
    const trackRows = await db.select({ id: tracksTable.id }).from(tracksTable)
      .where(inArray(tracksTable.artistId, artistIds));
    const trackIds = trackRows.map(r => r.id);
    if (trackIds.length === 0) {
      res.json({ totals: { views: 0, likes: 0, shares: 0, videos: 0, revenueCents: 0 }, byPlatform: [] });
      return;
    }
    conds.push(inArray(ugcMetricsTable.trackId, trackIds));
  }

  const where = conds.length ? and(...conds) : undefined;

  const [totals] = await db.select({
    views:        sql<number>`coalesce(sum(${ugcMetricsTable.views}), 0)::bigint`,
    likes:        sql<number>`coalesce(sum(${ugcMetricsTable.likes}), 0)::bigint`,
    shares:       sql<number>`coalesce(sum(${ugcMetricsTable.shares}), 0)::bigint`,
    videos:       sql<number>`coalesce(sum(${ugcMetricsTable.videosCount}), 0)::bigint`,
    revenueCents: sql<number>`coalesce(sum(${ugcMetricsTable.revenueCents}), 0)::bigint`,
  }).from(ugcMetricsTable).where(where);

  const byPlatform = await db.select({
    platform:     ugcMetricsTable.platform,
    views:        sql<number>`coalesce(sum(${ugcMetricsTable.views}), 0)::bigint`,
    likes:        sql<number>`coalesce(sum(${ugcMetricsTable.likes}), 0)::bigint`,
    shares:       sql<number>`coalesce(sum(${ugcMetricsTable.shares}), 0)::bigint`,
    videos:       sql<number>`coalesce(sum(${ugcMetricsTable.videosCount}), 0)::bigint`,
    revenueCents: sql<number>`coalesce(sum(${ugcMetricsTable.revenueCents}), 0)::bigint`,
  }).from(ugcMetricsTable).where(where).groupBy(ugcMetricsTable.platform);

  res.json({
    totals: {
      views: Number(totals?.views ?? 0),
      likes: Number(totals?.likes ?? 0),
      shares: Number(totals?.shares ?? 0),
      videos: Number(totals?.videos ?? 0),
      revenueCents: Number(totals?.revenueCents ?? 0),
    },
    byPlatform: byPlatform.map(p => ({
      platform: p.platform,
      views: Number(p.views),
      likes: Number(p.likes),
      shares: Number(p.shares),
      videos: Number(p.videos),
      revenueCents: Number(p.revenueCents),
    })),
  });
});

export default router;
