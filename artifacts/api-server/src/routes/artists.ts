import { Router } from "express";
import { db, artistsTable, releasesTable, tracksTable, labelsTable } from "@workspace/db";
import { count, eq, ilike, and, desc } from "drizzle-orm";
import { CreateArtistBody, UpdateArtistBody, GetArtistParams, UpdateArtistParams, DeleteArtistParams, GetArtistStatsParams } from "@workspace/api-zod";
import { getDataScope, requireRole } from "../lib/auth";

const router = Router();

function parseId(raw: string | string[]): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(str, 10);
}

router.get("/artists", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const search = req.query.search as string | undefined;
  const queryLabelId = req.query.label_id ? parseInt(req.query.label_id as string, 10) : undefined;
  const offset = (page - 1) * limit;
  const scope = getDataScope(req);

  // Scoping: admin/manager honor query; label sees only own labelId; artist sees only own artist.
  const conditions: any[] = [];
  if (scope.fullAccess) {
    if (queryLabelId && Number.isFinite(queryLabelId)) conditions.push(eq(artistsTable.labelId, queryLabelId));
  } else if (scope.role === "label") {
    if (scope.labelId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
    if (queryLabelId !== undefined && queryLabelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
    conditions.push(eq(artistsTable.labelId, scope.labelId));
  } else if (scope.role === "artist") {
    if (scope.artistId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
    conditions.push(eq(artistsTable.id, scope.artistId));
  }
  if (search) conditions.push(ilike(artistsTable.name, `%${search}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const artists = await db.select({
    id: artistsTable.id,
    name: artistsTable.name,
    slug: artistsTable.slug,
    imageUrl: artistsTable.imageUrl,
    genre: artistsTable.genre,
    bio: artistsTable.bio,
    country: artistsTable.country,
    labelId: artistsTable.labelId,
    spotifyId: artistsTable.spotifyId,
    appleId: artistsTable.appleId,
    socialLinks: artistsTable.socialLinks,
    status: artistsTable.status,
    createdAt: artistsTable.createdAt,
    updatedAt: artistsTable.updatedAt,
  }).from(artistsTable).where(where).limit(limit).offset(offset).orderBy(desc(artistsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(artistsTable).where(where);

  const labelIds = artists.map(a => a.labelId).filter(Boolean) as number[];
  const labels = labelIds.length > 0 ? await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable) : [];
  const labelMap = new Map(labels.map(l => [l.id, l.name]));

  const releaseCounts = await db.select({ artistId: releasesTable.artistId, count: count() })
    .from(releasesTable).groupBy(releasesTable.artistId);
  const releaseCountMap = new Map(releaseCounts.map(r => [r.artistId, r.count]));

  const data = artists.map(a => ({
    ...a,
    labelName: a.labelId ? (labelMap.get(a.labelId) ?? null) : null,
    totalReleases: releaseCountMap.get(a.id) ?? 0,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  res.json({
    data,
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/artists", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const parsed = CreateArtistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const slug = parsed.data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const [artist] = await db.insert(artistsTable).values({ ...parsed.data, slug }).returning();

  const [totalReleases] = await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.artistId, artist.id));

  res.status(201).json({
    ...artist,
    labelName: null,
    totalReleases: totalReleases.count,
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
  });
});

router.get("/artists/:id", async (req, res): Promise<void> => {
  const params = GetArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [artist] = await db.select().from(artistsTable).where(eq(artistsTable.id, params.data.id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  // Scope check: artist sees only own; label sees only own-label artists.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist" && artist.id !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (scope.role === "label"  && (scope.labelId == null || artist.labelId !== scope.labelId)) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const releases = await db.select().from(releasesTable).where(eq(releasesTable.artistId, artist.id)).limit(10);
  const recentTracks = await db.select().from(tracksTable).where(eq(tracksTable.artistId, artist.id)).limit(10);

  let labelName = null;
  if (artist.labelId) {
    const [label] = await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, artist.labelId));
    labelName = label?.name ?? null;
  }

  res.json({
    ...artist,
    labelName,
    totalReleases: releases.length,
    releases: releases.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
    recentTracks: recentTracks.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
  });
});

router.put("/artists/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = UpdateArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateArtistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [artist] = await db.update(artistsTable).set(parsed.data).where(eq(artistsTable.id, params.data.id)).returning();
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  const [totalReleases] = await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.artistId, artist.id));

  res.json({
    ...artist,
    labelName: null,
    totalReleases: totalReleases.count,
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
  });
});

router.delete("/artists/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = DeleteArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [artist] = await db.delete(artistsTable).where(eq(artistsTable.id, params.data.id)).returning();
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/artists/:id/stats", async (req, res): Promise<void> => {
  const params = GetArtistStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Scope: artist may only read own stats; label only stats of artists in their label.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null || params.data.id !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.status(403).json({ error: "Forbidden" }); return; }
      const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, params.data.id));
      if (!a || a.labelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
    } else {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const platforms = ["Spotify", "Apple Music", "YouTube", "Yandex Music", "VK Music", "Tidal"];
  const total = Math.floor(Math.random() * 10000000) + 100000;
  const streamsByPlatform = platforms.map((p, i) => {
    const streams = Math.floor(Math.random() * (total / 2)) + 10000;
    return {
      platform: p,
      streams,
      revenue: parseFloat((streams * 0.004).toFixed(2)),
      percentage: parseFloat(((streams / total) * 100).toFixed(1)),
    };
  });

  res.json({
    totalStreams: total,
    totalRevenue: parseFloat((total * 0.004).toFixed(2)),
    monthlyListeners: Math.floor(total / 12),
    topPlatform: "Spotify",
    streamsByPlatform,
  });
});

export default router;
