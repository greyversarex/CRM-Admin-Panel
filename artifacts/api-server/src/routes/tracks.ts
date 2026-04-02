import { Router } from "express";
import { db, tracksTable, artistsTable, releasesTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
import { CreateTrackBody, UpdateTrackBody, GetTrackParams, UpdateTrackParams, DeleteTrackParams } from "@workspace/api-zod";

const router = Router();

async function enrichTrack(t: typeof tracksTable.$inferSelect) {
  let artistName = "Unknown";
  const [artist] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, t.artistId));
  if (artist) artistName = artist.name;

  let releaseName = null;
  if (t.releaseId) {
    const [release] = await db.select({ title: releasesTable.title }).from(releasesTable).where(eq(releasesTable.id, t.releaseId));
    releaseName = release?.title ?? null;
  }

  return {
    ...t,
    artistName,
    releaseName,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/tracks", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const tracks = await db.select().from(tracksTable).limit(limit).offset(offset).orderBy(desc(tracksTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(tracksTable);

  const data = await Promise.all(tracks.map(enrichTrack));

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

router.post("/tracks", async (req, res): Promise<void> => {
  const parsed = CreateTrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [track] = await db.insert(tracksTable).values(parsed.data).returning();
  const enriched = await enrichTrack(track);
  res.status(201).json(enriched);
});

router.get("/tracks/:id", async (req, res): Promise<void> => {
  const params = GetTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, params.data.id));
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  const enriched = await enrichTrack(track);
  res.json(enriched);
});

router.put("/tracks/:id", async (req, res): Promise<void> => {
  const params = UpdateTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [track] = await db.update(tracksTable).set(parsed.data).where(eq(tracksTable.id, params.data.id)).returning();
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  const enriched = await enrichTrack(track);
  res.json(enriched);
});

router.delete("/tracks/:id", async (req, res): Promise<void> => {
  const params = DeleteTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [track] = await db.delete(tracksTable).where(eq(tracksTable.id, params.data.id)).returning();
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
