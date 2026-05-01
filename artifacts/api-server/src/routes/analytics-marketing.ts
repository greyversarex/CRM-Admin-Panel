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
import { db, playlistStatsTable, tiktokStatsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getDataScope } from "../lib/auth";

const router = Router();

function scopeFilter(scope: ReturnType<typeof getDataScope>, table: { labelId: any; artistId: any; id: any }) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "label"  && scope.labelId)  return eq(table.labelId,  scope.labelId);
  if (scope.role === "artist" && scope.artistId) return eq(table.artistId, scope.artistId);
  return eq(table.id, -1);
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

export default router;
