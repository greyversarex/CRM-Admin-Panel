import { Router } from "express";
import { db, tracksTable, artistsTable, releasesTable } from "@workspace/db";
import { count, eq, desc, and, inArray } from "drizzle-orm";
import { CreateTrackBody, UpdateTrackBody, GetTrackParams, UpdateTrackParams, DeleteTrackParams } from "@workspace/api-zod";
import { getDataScope, requireRole } from "../lib/auth";

const router = Router();

// Tracks have a direct artistId. For label scope we resolve the artist's labelId.
async function trackInScope(scope: ReturnType<typeof getDataScope>, t: { artistId: number }): Promise<boolean> {
  if (scope.fullAccess) return true;
  if (scope.role === "artist") return t.artistId === scope.artistId;
  if (scope.role === "label") {
    if (scope.labelId == null) return false;
    const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, t.artistId));
    return !!a && a.labelId === scope.labelId;
  }
  return false;
}

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

  // Scope: artist sees only own tracks; label sees tracks of their label's artists.
  const scope = getDataScope(req);
  let where: any = undefined;
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      where = eq(tracksTable.artistId, scope.artistId);
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      const labelArtists = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, scope.labelId));
      const ids = labelArtists.map(a => a.id);
      if (ids.length === 0) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      where = inArray(tracksTable.artistId, ids);
    }
  }

  const tracks = await db.select().from(tracksTable).where(where).limit(limit).offset(offset).orderBy(desc(tracksTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(tracksTable).where(where);

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

  const scope = getDataScope(req);
  if (!(await trackInScope(scope, { artistId: parsed.data.artistId }))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  // Validate referential ownership: releaseId (if present) must be in scope and
  // must belong to the same artistId being assigned.
  if (parsed.data.releaseId != null) {
    const [rel] = await db.select({ artistId: releasesTable.artistId, labelId: releasesTable.labelId })
      .from(releasesTable).where(eq(releasesTable.id, parsed.data.releaseId));
    if (!rel) { res.status(400).json({ error: "Release not found" }); return; }
    if (rel.artistId !== parsed.data.artistId) {
      res.status(403).json({ error: "Release does not belong to artist" }); return;
    }
    if (!scope.fullAccess) {
      if (scope.role === "artist" && rel.artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      if (scope.role === "label"  && rel.labelId  !== scope.labelId)  { res.status(403).json({ error: "Forbidden" }); return; }
    }
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
  if (!(await trackInScope(getDataScope(req), track))) { res.status(403).json({ error: "Forbidden" }); return; }

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

  // Pre-flight scope check
  const [existing] = await db.select().from(tracksTable).where(eq(tracksTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Track not found" }); return; }
  const scope = getDataScope(req);
  if (!(await trackInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Non-privileged users cannot reassign ownership (artistId/releaseId).
  if (!scope.fullAccess) {
    const body = parsed.data as Record<string, unknown>;
    if (body.artistId !== undefined && body.artistId !== existing.artistId) {
      res.status(403).json({ error: "Cannot change artistId" }); return;
    }
    if (body.releaseId !== undefined && body.releaseId !== existing.releaseId) {
      res.status(403).json({ error: "Cannot change releaseId" }); return;
    }
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

  const [existing] = await db.select().from(tracksTable).where(eq(tracksTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Track not found" }); return; }
  if (!(await trackInScope(getDataScope(req), existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  const [track] = await db.delete(tracksTable).where(eq(tracksTable.id, params.data.id)).returning();
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
