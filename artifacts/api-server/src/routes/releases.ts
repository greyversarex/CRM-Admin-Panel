import { Router } from "express";
import { db, releasesTable, tracksTable, artistsTable, labelsTable, deliveriesTable } from "@workspace/db";
import { count, eq, desc, and, sql, ilike, or, inArray } from "drizzle-orm";
import {
  CreateReleaseBody, UpdateReleaseBody, GetReleaseParams, UpdateReleaseParams,
  DeleteReleaseParams, UpdateReleaseStatusParams, UpdateReleaseStatusBody, ImportReleaseByUpcBody,
  CreateTransferImportBody, SpotifySearchReleasesQueryParams,
  DeliverReleaseParams, DeliverReleaseBody,
} from "@workspace/api-zod";
import { getDataScope, requireRole, resolveScopeFilter } from "../lib/auth";
import { auditMutation } from "../lib/audit";

const router = Router();

// Verifies a release row is visible to the current session user. Fail-closed
// when the session user has no linked artist/label record.
function releaseInScope(scope: ReturnType<typeof getDataScope>, r: { artistId: number; labelId: number | null }): boolean {
  if (scope.fullAccess) return true;
  if (scope.role === "artist") return scope.artistId != null && r.artistId === scope.artistId;
  if (scope.role === "label")  return scope.labelId  != null && r.labelId  === scope.labelId;
  return false;
}

// ─── In-memory transfer import storage (mock) ──────────────────────────────
type TransferImportItem = {
  upc: string; title: string; artist: string; label: string | null;
  tracks: number; coverUrl: string | null; success: boolean;
};
type TransferImport = {
  id: number; status: "in_progress" | "complete" | "error";
  spotifyArtistId: string | null; spotifyArtistName: string | null;
  importedCount: number; failedCount: number; createdAt: string;
  items: TransferImportItem[];
};
const transferImports: TransferImport[] = [
  { id: 6, status: "complete", spotifyArtistId: "0DIrXZNXxnYl3xrtoLvInd", spotifyArtistName: "Yosamin Davlatova",
    importedCount: 2, failedCount: 0, createdAt: new Date(Date.now() - 1 * 86400_000).toISOString(),
    items: [
      { upc: "199502855390", title: "Bacha Amujon", artist: "Yosamin Davlatova", label: "Tajik Music", tracks: 1, coverUrl: null, success: true },
      { upc: "859715954814", title: "Dilm",          artist: "Umedjoni Burhon",  label: "Tajik Music", tracks: 4, coverUrl: null, success: true },
    ] },
  { id: 5, status: "complete", spotifyArtistId: null, spotifyArtistName: "Sarvinoz Yusufi",
    importedCount: 7, failedCount: 0, createdAt: new Date(Date.now() - 3 * 86400_000).toISOString(), items: [] },
  { id: 4, status: "error",    spotifyArtistId: null, spotifyArtistName: "Mixed batch",
    importedCount: 0, failedCount: 18, createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(), items: [] },
  { id: 3, status: "complete", spotifyArtistId: null, spotifyArtistName: "Yasmina",
    importedCount: 4, failedCount: 0, createdAt: new Date(Date.now() - 7 * 86400_000).toISOString(), items: [] },
  { id: 2, status: "complete", spotifyArtistId: null, spotifyArtistName: "Marjon",
    importedCount: 5, failedCount: 0, createdAt: new Date(Date.now() - 11 * 86400_000).toISOString(), items: [] },
  { id: 1, status: "complete", spotifyArtistId: null, spotifyArtistName: "Initial sync",
    importedCount: 3, failedCount: 0, createdAt: new Date(Date.now() - 14 * 86400_000).toISOString(), items: [] },
];
let nextImportId = 7;

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
  let artistId = req.query.artist_id ? parseInt(req.query.artist_id as string, 10) : undefined;
  let labelId = req.query.label_id ? parseInt(req.query.label_id as string, 10) : undefined;
  const releaseType = req.query.release_type as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  // Override scope: artist/label users may only see their own data; query overrides ignored.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      if (artistId !== undefined && artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      artistId = scope.artistId; labelId = undefined;
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      if (labelId !== undefined && labelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
      labelId = scope.labelId; artistId = undefined;
    }
  }

  const conditions: any[] = [];
  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(releasesTable.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(releasesTable.status, statuses));
  }
  if (releaseType) conditions.push(eq(releasesTable.releaseType, releaseType));
  if (artistId) conditions.push(eq(releasesTable.artistId, artistId));
  if (labelId) conditions.push(eq(releasesTable.labelId, labelId));
  if (search) {
    const pattern = `%${search}%`;
    // Match against title, UPC, and joined artist/label names
    const matchingArtistIds = (
      await db.select({ id: artistsTable.id }).from(artistsTable).where(ilike(artistsTable.name, pattern))
    ).map((r) => r.id);
    const matchingLabelIds = (
      await db.select({ id: labelsTable.id }).from(labelsTable).where(ilike(labelsTable.name, pattern))
    ).map((r) => r.id);

    const orParts: any[] = [
      ilike(releasesTable.title, pattern),
      ilike(releasesTable.upc, pattern),
    ];
    if (matchingArtistIds.length > 0) orParts.push(inArray(releasesTable.artistId, matchingArtistIds));
    if (matchingLabelIds.length > 0) orParts.push(inArray(releasesTable.labelId, matchingLabelIds));
    const orCond = or(...orParts);
    if (orCond) conditions.push(orCond);
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const releases = await db.select().from(releasesTable)
    .where(whereClause)
    .limit(limit).offset(offset).orderBy(desc(releasesTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(releasesTable).where(whereClause);

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

// Counts grouped by status (must be declared before /:id)
router.get("/releases/counts", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  let where: any = undefined;
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) {
        res.json({ all: 0, draft: 0, pending_review: 0, approved: 0, scheduled: 0, live: 0, takedown: 0, unfinished: 0, readyToSubmit: 0 });
        return;
      }
      where = eq(releasesTable.artistId, scope.artistId);
    } else if (scope.role === "label") {
      if (scope.labelId == null) {
        res.json({ all: 0, draft: 0, pending_review: 0, approved: 0, scheduled: 0, live: 0, takedown: 0, unfinished: 0, readyToSubmit: 0 });
        return;
      }
      where = eq(releasesTable.labelId, scope.labelId);
    }
  }

  const rows = await db
    .select({ status: releasesTable.status, c: count() })
    .from(releasesTable)
    .where(where)
    .groupBy(releasesTable.status);

  const byStatus: Record<string, number> = {};
  let all = 0;
  for (const r of rows) {
    byStatus[r.status] = r.c;
    all += r.c;
  }

  const draft = byStatus["draft"] ?? 0;
  const pending_review = byStatus["pending_review"] ?? 0;
  const approved = byStatus["approved"] ?? 0;
  const delivering = byStatus["delivering"] ?? 0;
  const delivered = byStatus["delivered"] ?? 0;
  const live = byStatus["live"] ?? 0;
  const takedown = (byStatus["takedown_requested"] ?? 0) + (byStatus["removed"] ?? 0);

  res.json({
    all,
    draft,
    pending_review,
    approved,
    scheduled: approved + delivering + delivered,
    live,
    takedown,
    unfinished: draft,
    readyToSubmit: pending_review + approved,
  });
});

// ─── Transfer Imports (mock) ────────────────────────────────────────────────
// Global catalog-import jobs (manual back-catalog ingestion). Admin/manager only.
router.get("/releases/transfer-imports", requireRole("admin", "manager"), (_req, res): void => {
  res.json([...transferImports].sort((a, b) => b.id - a.id));
});

router.post("/releases/transfer-imports", requireRole("admin", "manager"), (req, res): void => {
  const parsed = CreateTransferImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const items = parsed.data.items.map((i) => ({
    upc: i.upc, title: i.title, artist: i.artist,
    label: i.label ?? parsed.data.labelName ?? null,
    tracks: i.tracks, coverUrl: i.coverUrl ?? null,
    success: i.success ?? true,
  }));
  const importedCount = items.filter((i) => i.success).length;
  const failedCount = items.length - importedCount;
  const job: TransferImport = {
    id: nextImportId++,
    status: failedCount > 0 && importedCount === 0 ? "error" : "complete",
    spotifyArtistId: parsed.data.spotifyArtistId ?? null,
    spotifyArtistName: parsed.data.spotifyArtistName ?? null,
    importedCount, failedCount,
    createdAt: new Date().toISOString(),
    items,
  };
  transferImports.unshift(job);
  res.status(201).json(job);
});

router.get("/releases/transfer-imports/spotify-search", requireRole("admin", "manager"), (req, res): void => {
  const parsed = SpotifySearchReleasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data.query.trim();
  const artistIdMatch = query.match(/artist\/([A-Za-z0-9]+)/);
  const artistId = artistIdMatch ? artistIdMatch[1] : query;
  // Mock dataset that mirrors the screenshot
  res.json({
    artistId,
    artistName: "Yosamin Davlatova",
    artistImage: null,
    releases: [
      { upc: "199502855390", title: "Bacha Amujon",     artist: "Yosamin Davlatova", label: "Tajik Music",     tracks: 1,  coverUrl: null, releaseDate: "2024-08-06" },
      { upc: "859715954814", title: "Dilm",             artist: "Umedjoni Burhon",  label: "Label Music",     tracks: 4,  coverUrl: null, releaseDate: "2024-04-21" },
      { upc: "859714516167", title: "Tu Maro Love",     artist: "Sarvinoz Yusufi",  label: "T Media",         tracks: 2,  coverUrl: null, releaseDate: "2024-03-14" },
      { upc: "859714586238", title: "Popuri",           artist: "Yasmina Davlatova", label: "Yasmina Davlatova", tracks: 20, coverUrl: null, releaseDate: "2024-04-20" },
      { upc: "859714635790", title: "Dil Kandam",       artist: "Zaynura Pulodova", label: "ASC Media",       tracks: 29, coverUrl: null, releaseDate: "2024-01-29" },
      { upc: "761861522192", title: "Marjon",           artist: "Yasmina",          label: "Capron +",        tracks: 7,  coverUrl: null, releaseDate: "2024-03-17" },
      { upc: "713312710511", title: "Shamolak",         artist: "Yasmina",          label: "Tajik Music",     tracks: 1,  coverUrl: null, releaseDate: "2024-07-20" },
      { upc: "8720765873405", title: "Ruymoli Zargaroni", artist: "Mino",          label: "Aftab Media",     tracks: 1,  coverUrl: null, releaseDate: "2024-05-06" },
      { upc: "792268701859", title: "Hayot Arkadayim",  artist: "Zakiya",           label: "T Music",         tracks: 16, coverUrl: null, releaseDate: "2024-04-16" },
      { upc: "789294621213", title: "Anar Anar",        artist: "Yasmina",          label: "Sabo Music",      tracks: 15, coverUrl: null, releaseDate: "2024-06-15" },
    ],
  });
});

router.post("/releases", async (req, res): Promise<void> => {
  const parsed = CreateReleaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Scope: artist can only create releases under their own artistId; label only under their labelId.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null || parsed.data.artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      // If a labelId is supplied by an artist user, it must equal their artist's actual label.
      // Otherwise, derive labelId server-side to prevent cross-tenant pollution.
      const [own] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, scope.artistId));
      const ownLabelId = own?.labelId ?? null;
      if (parsed.data.labelId != null && parsed.data.labelId !== ownLabelId) {
        res.status(403).json({ error: "labelId mismatch" }); return;
      }
      parsed.data.labelId = ownLabelId ?? undefined;
    } else if (scope.role === "label") {
      if (scope.labelId == null || parsed.data.labelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
      // Label users must also assign an artist that belongs to their label.
      const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, parsed.data.artistId));
      if (!a || a.labelId !== scope.labelId) { res.status(403).json({ error: "Artist does not belong to your label" }); return; }
    }
  }

  const [release] = await db.insert(releasesTable).values(parsed.data).returning();

  // Task #3: пишем только в audit_log, в activity_log больше не дублируем.
  // Старые записи activity_log остаются для дашборд-виджета «Recent activity».
  void auditMutation(req, { action: "create", entityType: "release", entityId: release.id, before: null, after: release });

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
  if (!releaseInScope(getDataScope(req), release)) { res.status(403).json({ error: "Forbidden" }); return; }

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

  // Pre-flight scope check: load existing row before mutating.
  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
  const scope = getDataScope(req);
  if (!releaseInScope(scope, existing)) { res.status(403).json({ error: "Forbidden" }); return; }

  // Non-privileged users cannot reassign ownership (artistId/labelId).
  if (!scope.fullAccess) {
    const body = parsed.data as Record<string, unknown>;
    if (body.artistId !== undefined && body.artistId !== existing.artistId) {
      res.status(403).json({ error: "Cannot change artistId" }); return;
    }
    if (body.labelId !== undefined && body.labelId !== existing.labelId) {
      res.status(403).json({ error: "Cannot change labelId" }); return;
    }
  }

  const [release] = await db.update(releasesTable).set(parsed.data).where(eq(releasesTable.id, params.data.id)).returning();
  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "release", entityId: release.id, before: existing, after: release });

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

router.delete("/releases/:id", async (req, res): Promise<void> => {
  const params = DeleteReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
  if (!releaseInScope(getDataScope(req), existing)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [release] = await db.delete(releasesTable).where(eq(releasesTable.id, params.data.id)).returning();
  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }
  void auditMutation(req, { action: "delete", entityType: "release", entityId: release.id, before: existing, after: null });

  res.sendStatus(204);
});

router.patch("/releases/:id/status", requireRole("admin", "manager"), async (req, res): Promise<void> => {
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

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }

  const [release] = await db.update(releasesTable)
    .set({ status: parsed.data.status, statusNote: parsed.data.note ?? null })
    .where(eq(releasesTable.id, params.data.id))
    .returning();

  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }

  // Task #3: пишем только в audit_log, в activity_log больше не дублируем.
  void auditMutation(req, { action: "update", entityType: "release", entityId: release.id, before: existing, after: release });

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

// POST /releases/:id/deliver — поставить релиз в очередь на отгрузку в DSP.
// Требования: admin/manager + релиз прошёл модерацию (approved/delivering/live).
// Тело: { targets: ['spotify','vk_music',...], ddexVersion: '4.3' }
// Ответ: { releaseId, jobs: [Delivery,...] } — по одному job'у на target.
router.post("/releases/:id/deliver", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = DeliverReleaseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = DeliverReleaseBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }

  const DELIVERABLE = new Set(["approved", "delivering", "live"]);
  if (!DELIVERABLE.has(release.status)) {
    res.status(409).json({
      error: `Release must be approved before delivery. Current status: '${release.status}'.`,
    });
    return;
  }

  // De-dup: ['spotify','spotify','vk_music'] → ['spotify','vk_music']
  const uniqueTargets = Array.from(new Set(body.data.targets));

  const created: typeof deliveriesTable.$inferSelect[] = [];
  for (const target of uniqueTargets) {
    const [job] = await db.insert(deliveriesTable).values({
      releaseId: release.id,
      target,
      status: "queued",
      ddexVersion: body.data.ddexVersion ?? "4.3",
      nextRetryAt: new Date(), // воркер заберёт на ближайшем тике
    }).returning();
    created.push(job);
    void auditMutation(req, {
      action: "create",
      entityType: "delivery",
      entityId: job.id,
      before: null,
      after: job,
    });
  }

  // Перевод релиза в 'delivering' если был 'approved' (визуально показать прогресс)
  if (release.status === "approved") {
    await db.update(releasesTable).set({ status: "delivering" }).where(eq(releasesTable.id, release.id));
  }

  res.status(201).json({
    releaseId: release.id,
    jobs: created.map((j) => ({
      ...j,
      releaseName: release.title,
      nextRetryAt: j.nextRetryAt?.toISOString() ?? null,
      acknowledgedAt: j.acknowledgedAt?.toISOString() ?? null,
      deliveredAt: j.deliveredAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      xmlPayload: undefined, // не светим в API
    })),
  });
});

router.post("/releases/import-upc", requireRole("admin", "manager"), async (req, res): Promise<void> => {
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
  void auditMutation(req, { action: "create", entityType: "release", entityId: release.id, before: null, after: release });

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

export default router;
