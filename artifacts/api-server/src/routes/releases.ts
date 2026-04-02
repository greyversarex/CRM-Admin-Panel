import { Router } from "express";
import { db, releasesTable, tracksTable, artistsTable, labelsTable, activityLogTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
import {
  CreateReleaseBody, UpdateReleaseBody, GetReleaseParams, UpdateReleaseParams,
  DeleteReleaseParams, UpdateReleaseStatusParams, UpdateReleaseStatusBody, ImportReleaseByUpcBody,
} from "@workspace/api-zod";

const router = Router();

async function enrichRelease(r: typeof releasesTable.$inferSelect) {
  let artistName = "Unknown";
  const [artist] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, r.artistId));
  if (artist) artistName = artist.name;

  let labelName = null;
  if (r.labelId) {
    const [label] = await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, r.labelId));
    labelName = label?.name ?? null;
  }

  const [trackCount] = await db.select({ count: count() }).from(tracksTable).where(eq(tracksTable.releaseId, r.id));

  return {
    ...r,
    artistName,
    labelName,
    totalTracks: trackCount.count,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/releases", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const artistId = req.query.artist_id ? parseInt(req.query.artist_id as string, 10) : undefined;
  const labelId = req.query.label_id ? parseInt(req.query.label_id as string, 10) : undefined;
  const releaseType = req.query.release_type as string | undefined;

  const releases = await db.select().from(releasesTable).limit(limit).offset(offset).orderBy(desc(releasesTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(releasesTable);

  const data = await Promise.all(releases.map(enrichRelease));

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

router.post("/releases", async (req, res): Promise<void> => {
  const parsed = CreateReleaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [release] = await db.insert(releasesTable).values(parsed.data).returning();

  await db.insert(activityLogTable).values({
    type: "release_created",
    title: "New Release Created",
    description: `Release "${release.title}" was created`,
    entityType: "release",
    entityId: release.id,
  });

  const enriched = await enrichRelease(release);
  res.status(201).json(enriched);
});

router.get("/releases/:id", async (req, res): Promise<void> => {
  const params = GetReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }

  const tracks = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, release.id));
  const enriched = await enrichRelease(release);

  res.json({
    ...enriched,
    tracks: tracks.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
  });
});

router.put("/releases/:id", async (req, res): Promise<void> => {
  const params = UpdateReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReleaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [release] = await db.update(releasesTable).set(parsed.data).where(eq(releasesTable.id, params.data.id)).returning();
  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

router.delete("/releases/:id", async (req, res): Promise<void> => {
  const params = DeleteReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [release] = await db.delete(releasesTable).where(eq(releasesTable.id, params.data.id)).returning();
  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }

  res.sendStatus(204);
});

router.patch("/releases/:id/status", async (req, res): Promise<void> => {
  const params = UpdateReleaseStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReleaseStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [release] = await db.update(releasesTable)
    .set({ status: parsed.data.status, statusNote: parsed.data.note ?? null })
    .where(eq(releasesTable.id, params.data.id))
    .returning();

  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "release_status_changed",
    title: "Release Status Updated",
    description: `Release "${release.title}" status changed to ${parsed.data.status}`,
    entityType: "release",
    entityId: release.id,
  });

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

router.post("/releases/import-upc", async (req, res): Promise<void> => {
  const parsed = ImportReleaseByUpcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Mock UPC import - in production would call Spotify/Apple/MusicBrainz API
  const mockRelease = {
    title: `Imported Release (UPC: ${parsed.data.upc})`,
    releaseType: "album" as const,
    upc: parsed.data.upc,
    status: "draft",
    artistId: 1,
    isExplicit: false,
    territories: ["WW"],
  };

  const artists = await db.select().from(artistsTable).limit(1);
  if (artists.length === 0) {
    res.status(400).json({ error: "No artists found. Please create an artist first." });
    return;
  }

  const [release] = await db.insert(releasesTable).values({
    ...mockRelease,
    artistId: artists[0].id,
  }).returning();

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

export default router;
