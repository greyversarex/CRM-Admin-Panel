import { Router } from "express";
import { db, presaveCampaignsTable, smartLinksTable, promoAssetsTable, releasesTable, artistsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { getDataScope } from "../lib/auth";

const router = Router();

function scopeWhere<T extends { labelId: number | null; artistId: number | null }>(
  scope: ReturnType<typeof getDataScope>,
  table: { labelId: any; artistId: any; id: any },
) {
  if (scope.fullAccess) return undefined;
  if (scope.role === "label"   && scope.labelId)   return eq(table.labelId,  scope.labelId);
  if (scope.role === "artist"  && scope.artistId)  return eq(table.artistId, scope.artistId);
  return eq(table.id, -1);
}

// ─── Pre-save Campaigns ─────────────────────────────────────────────────────

router.get("/marketing/presave", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const where = scopeWhere(scope, presaveCampaignsTable);
  const rows = await db.select().from(presaveCampaignsTable)
    .where(where).orderBy(desc(presaveCampaignsTable.createdAt));

  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    artist: r.artistName,
    releaseDate: r.releaseDate,
    platforms: r.platforms,
    slug: r.slug,
    saves: r.saves,
    clicks: r.clicks,
    status: r.status,
    link: r.slug ? `presave.tajikmusic.com/${r.slug}` : "",
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/marketing/presave", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!req.session?.user?.id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { title, artist, releaseDate, platforms } = req.body as {
    title: string; artist: string; releaseDate: string; platforms?: string;
  };

  if (!title || !artist || !releaseDate) {
    res.status(400).json({ error: "title, artist and releaseDate required" });
    return;
  }

  const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now().toString(36);

  const [row] = await db.insert(presaveCampaignsTable).values({
    title,
    artistName: artist,
    releaseDate,
    platforms: platforms ?? "all",
    slug,
    saves: 0,
    clicks: 0,
    status: "draft",
    labelId: scope.labelId ?? null,
    artistId: scope.artistId ?? null,
    createdById: req.session?.user?.id,
  }).returning();

  res.status(201).json({
    id: row.id,
    title: row.title,
    artist: row.artistName,
    releaseDate: row.releaseDate,
    platforms: row.platforms,
    slug: row.slug,
    saves: row.saves,
    clicks: row.clicks,
    status: row.status,
    link: `presave.tajikmusic.com/${row.slug}`,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/marketing/presave/:id/status", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const id = parseInt(req.params.id, 10);
  const { status } = req.body as { status: string };
  const allowed = ["draft", "active", "ended"];
  if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }

  const [row] = await db.update(presaveCampaignsTable)
    .set({ status })
    .where(eq(presaveCampaignsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: row.id, status: row.status });
});

// ─── Smart Links ────────────────────────────────────────────────────────────

router.get("/marketing/links", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const where = scopeWhere(scope, smartLinksTable);
  const rows = await db.select().from(smartLinksTable)
    .where(where).orderBy(desc(smartLinksTable.createdAt));

  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    artist: r.artistName,
    slug: r.slug,
    clicks: r.clicks,
    topPlatform: r.topPlatform ?? "—",
    dsps: (r.dsps as { name: string; url: string; active: boolean }[]) ?? [],
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/marketing/links", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!req.session?.user?.id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { title, artist } = req.body as { title: string; artist: string };
  if (!title || !artist) {
    res.status(400).json({ error: "title and artist required" });
    return;
  }

  const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now().toString(36);

  const defaultDsps = [
    { name: "Spotify",      url: "", active: false },
    { name: "Apple Music",  url: "", active: false },
    { name: "YouTube Music",url: "", active: false },
    { name: "Яндекс Музыка",url: "", active: false },
  ];

  const [row] = await db.insert(smartLinksTable).values({
    title,
    artistName: artist,
    slug,
    clicks: 0,
    topPlatform: null,
    dsps: defaultDsps,
    labelId: scope.labelId ?? null,
    artistId: scope.artistId ?? null,
    createdById: req.session?.user?.id,
  }).returning();

  res.status(201).json({
    id: row.id,
    title: row.title,
    artist: row.artistName,
    slug: row.slug,
    clicks: row.clicks,
    topPlatform: row.topPlatform ?? "—",
    dsps: row.dsps,
    createdAt: row.createdAt.toISOString(),
  });
});

// ─── Promo Assets ───────────────────────────────────────────────────────────

router.get("/marketing/assets", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const where = scopeWhere(scope, promoAssetsTable);
  const rows = await db.select().from(promoAssetsTable)
    .where(where).orderBy(desc(promoAssetsTable.generatedAt));

  res.json(rows.map(r => ({
    id: r.id,
    releaseId: r.releaseId,
    release: r.releaseTitle,
    artist: r.artistName,
    type: r.assetType,
    format: r.format,
    size: r.dimensions,
    fileUrl: r.fileUrl ?? null,
    generatedAt: r.generatedAt.toISOString().slice(0, 10),
  })));
});

router.post("/marketing/assets/generate", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!req.session?.user?.id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { releaseId } = req.body as { releaseId?: number };

  let releases: { id: number; title: string; artistName: string }[] = [];

  if (releaseId) {
    const [rel] = await db
      .select({ id: releasesTable.id, title: releasesTable.title, artistId: releasesTable.artistId })
      .from(releasesTable)
      .where(eq(releasesTable.id, releaseId));
    if (rel) {
      const [art] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, rel.artistId));
      releases = [{ id: rel.id, title: rel.title, artistName: art?.name ?? "Unknown" }];
    }
  } else {
    const scopeWhere2 = scope.fullAccess
      ? undefined
      : scope.role === "label" && scope.labelId
        ? eq(releasesTable.labelId, scope.labelId)
        : scope.role === "artist" && scope.artistId
          ? eq(releasesTable.artistId, scope.artistId)
          : eq(releasesTable.id, -1);

    const rels = await db
      .select({ id: releasesTable.id, title: releasesTable.title, artistId: releasesTable.artistId })
      .from(releasesTable)
      .where(scopeWhere2)
      .limit(3);

    for (const rel of rels) {
      const [art] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, rel.artistId));
      releases.push({ id: rel.id, title: rel.title, artistName: art?.name ?? "Unknown" });
    }
  }

  const ASSET_TYPES = [
    { type: "instagram_square", format: "JPG", dimensions: "1080×1080" },
    { type: "instagram_story",  format: "JPG", dimensions: "1080×1920" },
    { type: "youtube_banner",   format: "PNG", dimensions: "2560×1440" },
    { type: "press_kit",        format: "PDF", dimensions: "A4"        },
  ];

  const created: typeof promoAssetsTable.$inferSelect[] = [];
  for (const rel of releases) {
    for (const at of ASSET_TYPES) {
      const existing = await db.select({ id: promoAssetsTable.id })
        .from(promoAssetsTable)
        .where(and(
          eq(promoAssetsTable.releaseId, rel.id),
          eq(promoAssetsTable.assetType, at.type),
        ));
      if (existing.length === 0) {
        const [row] = await db.insert(promoAssetsTable).values({
          releaseId: rel.id,
          releaseTitle: rel.title,
          artistName: rel.artistName,
          assetType: at.type,
          format: at.format,
          dimensions: at.dimensions,
          labelId: scope.labelId ?? null,
          artistId: scope.artistId ?? null,
          createdById: req.session?.user?.id,
        }).returning();
        created.push(row);
      }
    }
  }

  res.json({
    generated: created.length,
    assets: created.map(r => ({
      id: r.id,
      release: r.releaseTitle,
      artist: r.artistName,
      type: r.assetType,
      format: r.format,
      size: r.dimensions,
      generatedAt: r.generatedAt.toISOString().slice(0, 10),
    })),
  });
});

export default router;
