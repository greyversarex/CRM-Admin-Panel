/**
 * Analytics — Playlists & TikTok Stats
 *
 * GET /api/analytics/playlists
 * GET /api/analytics/tiktok
 *
 * Access scoped: admin/manager see all, label/artist see their own.
 */
import { Router } from "express";
import { db, playlistStatsTable, tiktokStatsTable, tracksTable, artistsTable, releasesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getDataScope } from "../lib/auth";

const router = Router();

function scopeFilter(scope: ReturnType<typeof getDataScope>, table: { labelId: any; artistId: any; id: any }) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "label"  && scope.labelId)  return eq(table.labelId,  scope.labelId);
  if (scope.role === "artist" && scope.artistId) return eq(table.artistId, scope.artistId);
  return eq(table.id, -1);
}

async function ensurePlaylistSeedData(scope: ReturnType<typeof getDataScope>) {
  const where = scopeFilter(scope, playlistStatsTable);
  const existing = await db.select({ id: playlistStatsTable.id }).from(playlistStatsTable).where(where).limit(1);
  if (existing.length > 0) return;

  const PLAYLISTS = [
    { playlistName: "Hot Hits Central Asia", dsp: "Spotify",       followers: 142000, streams: 89000, trendPct: 12.4 },
    { playlistName: "Tajik Music Top 50",    dsp: "Яндекс Музыка", followers: 38500,  streams: 52000, trendPct: 7.2  },
    { playlistName: "Silk Road Vibes",       dsp: "Apple Music",   followers: 22000,  streams: 31000, trendPct: -2.1 },
    { playlistName: "Global Beats",          dsp: "Spotify",       followers: 310000, streams: 204000,trendPct: 4.8  },
    { playlistName: "New in Deezer",         dsp: "Deezer",        followers: 9500,   streams: 12000, trendPct: 18.3 },
  ];

  for (const p of PLAYLISTS) {
    await db.insert(playlistStatsTable).values({
      ...p,
      labelId:  scope.labelId  ?? null,
      artistId: scope.artistId ?? null,
    });
  }
}

async function ensureTiktokSeedData(scope: ReturnType<typeof getDataScope>) {
  const where = scopeFilter(scope, tiktokStatsTable);
  const existing = await db.select({ id: tiktokStatsTable.id }).from(tiktokStatsTable).where(where).limit(1);
  if (existing.length > 0) return;

  const tracks = await db
    .select({ id: tracksTable.id, title: tracksTable.title, artistId: tracksTable.artistId })
    .from(tracksTable)
    .limit(6);

  for (const t of tracks) {
    const [art] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, t.artistId));
    const uses       = Math.floor(Math.random() * 50000) + 500;
    const videoViews = uses * (Math.floor(Math.random() * 30) + 10);
    await db.insert(tiktokStatsTable).values({
      trackId:    t.id,
      trackTitle: t.title,
      artistName: art?.name ?? "Unknown",
      uses,
      videoViews,
      likes:   Math.floor(videoViews * 0.12),
      reposts: Math.floor(videoViews * 0.03),
      labelId:     scope.labelId  ?? null,
      artistId:    scope.artistId ?? null,
      periodStart: "2025-01-01",
      periodEnd:   "2025-04-30",
    });
  }
}

router.get("/analytics/playlists", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  await ensurePlaylistSeedData(scope);

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
  await ensureTiktokSeedData(scope);

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
