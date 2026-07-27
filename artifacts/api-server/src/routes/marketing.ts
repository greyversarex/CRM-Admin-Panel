import { Router } from "express";
import { db, presaveCampaignsTable, smartLinksTable, promoAssetsTable, releasesTable, artistsTable } from "@workspace/db";
import type { SmartLinkDsp, SmartLinkSocial } from "@workspace/db";
import { eq, desc, and, or, ilike, ne } from "drizzle-orm";
import { getDataScope } from "../lib/auth";
import { defaultOutlets, outletInfo, SMARTLINK_OUTLETS } from "../lib/smartlink-outlets";

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

/** Кириллица → латиница, чтобы slug русского названия оставался читаемым. */
const TRANSLIT: Record<string, string> = {
  а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"e", ж:"zh", з:"z", и:"i", й:"y",
  к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f",
  х:"h", ц:"c", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya",
  ғ:"g", ӣ:"i", қ:"q", ӯ:"u", ҳ:"h", ҷ:"j",
};

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "link";
}

/**
 * Свободный slug.
 *
 * Ссылка уходит в соцсети и должна быть короткой и читаемой, поэтому суффикс
 * добавляем только при реальном конфликте, а не «на всякий случай».
 */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [taken] = await db.select({ id: smartLinksTable.id })
      .from(smartLinksTable).where(eq(smartLinksTable.slug, candidate));
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Нормализует площадки из тела запроса: пустые URL и мусорные записи выкидываем. */
function normalizeDsps(input: unknown): SmartLinkDsp[] {
  if (!Array.isArray(input)) return [];
  const out: SmartLinkDsp[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!name) continue;
    // На публичной странице показываем только http(s) — иначе это вектор для
    // javascript:-ссылок в чужом браузере.
    const safeUrl = /^https?:\/\//i.test(url) ? url : "";
    const action = r.action === "buy" ? "buy" : outletInfo(name).action;
    out.push({ name, url: safeUrl, active: safeUrl !== "" && r.active !== false, action });
  }
  return out;
}

function normalizeSocials(input: unknown): SmartLinkSocial[] {
  if (!Array.isArray(input)) return [];
  const out: SmartLinkSocial[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!name || !/^https?:\/\//i.test(url)) continue;
    out.push({ name, url });
  }
  return out;
}

/** Самая кликаемая площадка — считаем из разреза, а не храним отдельно. */
function topPlatformOf(clicksByDsp: Record<string, number> | null): string | null {
  const entries = Object.entries(clicksByDsp ?? {});
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

type SmartLinkRow = typeof smartLinksTable.$inferSelect;

function toDto(r: SmartLinkRow) {
  const clicksByDsp = (r.clicksByDsp ?? {}) as Record<string, number>;
  return {
    id: r.id,
    title: r.title,
    artist: r.artistName,
    slug: r.slug,
    clicks: r.clicks,
    views: r.views,
    clicksByDsp,
    topPlatform: topPlatformOf(clicksByDsp) ?? r.topPlatform ?? "—",
    dsps: (r.dsps ?? []) as SmartLinkDsp[],
    socials: (r.socials ?? []) as SmartLinkSocial[],
    socialsEnabled: r.socialsEnabled,
    theme: r.theme,
    isActive: r.isActive,
    releaseId: r.releaseId,
    coverUrl: r.coverUrl,
    releaseDate: r.releaseDate,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Строка смартлинка с проверкой, что она попадает в скоуп пользователя. */
async function findInScope(req: Parameters<typeof getDataScope>[0], id: number): Promise<SmartLinkRow | null> {
  const scope = getDataScope(req);
  const [row] = await db.select().from(smartLinksTable).where(eq(smartLinksTable.id, id));
  if (!row) return null;
  if (scope.fullAccess) return row;
  if (scope.role === "label"  && scope.labelId  && row.labelId  === scope.labelId)  return row;
  if (scope.role === "artist" && scope.artistId && row.artistId === scope.artistId) return row;
  return null;
}

/**
 * Справочник витрин для редактора.
 *
 * Отдаём его с сервера, а не дублируем таблицу брендов во фронтенде: подписи,
 * цвета и домены нужны и публичной странице, и редактору, и разъезжаются они
 * незаметно.
 */
router.get("/marketing/smartlink-outlets", (_req, res): void => {
  res.set("Cache-Control", "private, max-age=3600");
  res.json(SMARTLINK_OUTLETS);
});

router.get("/marketing/links", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const scoped = scopeWhere(scope, smartLinksTable);

  // Поиск по названию релиза и по имени артиста — как в референсе.
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const search = q
    ? or(ilike(smartLinksTable.title, `%${q}%`), ilike(smartLinksTable.artistName, `%${q}%`))
    : undefined;

  const where = scoped && search ? and(scoped, search) : (scoped ?? search);

  const rows = await db.select().from(smartLinksTable)
    .where(where).orderBy(desc(smartLinksTable.createdAt));

  res.json(rows.map(toDto));
});

router.get("/marketing/links/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const row = await findInScope(req, id);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

/** Смартлинк релиза — по нему кнопка на карточке релиза решает «создать» или «открыть». */
router.get("/marketing/links/by-release/:releaseId", async (req, res): Promise<void> => {
  const releaseId = parseInt(req.params.releaseId, 10);
  if (!Number.isFinite(releaseId)) { res.status(400).json({ error: "Bad releaseId" }); return; }

  const scope = getDataScope(req);
  const scoped = scopeWhere(scope, smartLinksTable);
  const byRelease = eq(smartLinksTable.releaseId, releaseId);

  const [row] = await db.select().from(smartLinksTable)
    .where(scoped ? and(scoped, byRelease) : byRelease)
    .orderBy(desc(smartLinksTable.createdAt));

  res.json(row ? toDto(row) : null);
});

router.post("/marketing/links", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!req.session?.user?.id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as {
    releaseId?: number;
    title?: string;
    artist?: string;
  };

  let title = typeof body.title === "string" ? body.title.trim() : "";
  let artist = typeof body.artist === "string" ? body.artist.trim() : "";
  let coverUrl: string | null = null;
  let releaseDate: string | null = null;
  let releaseId: number | null = null;
  let artistId: number | null = scope.artistId ?? null;
  let labelId: number | null = scope.labelId ?? null;

  // Создание из релиза — основной сценарий: всё, что нужно странице,
  // уже лежит в каталоге, руками вводить нечего.
  if (typeof body.releaseId === "number" && Number.isFinite(body.releaseId)) {
    const [rel] = await db.select().from(releasesTable).where(eq(releasesTable.id, body.releaseId));
    if (!rel) { res.status(404).json({ error: "Release not found" }); return; }

    const inScope = scope.fullAccess
      || (scope.role === "label"  && scope.labelId  === rel.labelId)
      || (scope.role === "artist" && scope.artistId === rel.artistId);
    if (!inScope) { res.status(403).json({ error: "Forbidden" }); return; }

    const [art] = await db.select({ name: artistsTable.name })
      .from(artistsTable).where(eq(artistsTable.id, rel.artistId));

    releaseId = rel.id;
    title = title || rel.title;
    artist = artist || art?.name || "";
    coverUrl = rel.coverUrl ?? null;
    releaseDate = rel.releaseDate ?? null;
    artistId = rel.artistId;
    labelId = rel.labelId ?? labelId;
  }

  if (!title || !artist) {
    res.status(400).json({ error: "Нужны название и артист (или releaseId существующего релиза)" });
    return;
  }

  const [row] = await db.insert(smartLinksTable).values({
    title,
    artistName: artist,
    slug: await uniqueSlug(title),
    dsps: defaultOutlets(),
    releaseId,
    coverUrl,
    releaseDate,
    labelId,
    artistId,
    createdById: req.session.user.id,
  }).returning();

  res.status(201).json(toDto(row));
});

router.put("/marketing/links/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }

  const existing = await findInScope(req, id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof smartLinksTable.$inferInsert> = {};

  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.artist === "string" && body.artist.trim()) patch.artistName = body.artist.trim();
  if (body.dsps !== undefined) patch.dsps = normalizeDsps(body.dsps);
  if (body.socials !== undefined) patch.socials = normalizeSocials(body.socials);
  if (typeof body.socialsEnabled === "boolean") patch.socialsEnabled = body.socialsEnabled;
  if (body.theme === "light" || body.theme === "dark") patch.theme = body.theme;
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

  // Свой slug разрешаем, но следим за уникальностью: чужая занятая ссылка
  // молча увела бы трафик на другой релиз.
  if (typeof body.slug === "string" && body.slug.trim()) {
    const wanted = slugify(body.slug);
    if (wanted !== existing.slug) {
      const [taken] = await db.select({ id: smartLinksTable.id }).from(smartLinksTable)
        .where(and(eq(smartLinksTable.slug, wanted), ne(smartLinksTable.id, id)));
      if (taken) { res.status(409).json({ error: `Ссылка /${wanted} уже занята` }); return; }
      patch.slug = wanted;
    }
  }

  if (Object.keys(patch).length === 0) { res.json(toDto(existing)); return; }

  const [row] = await db.update(smartLinksTable).set(patch)
    .where(eq(smartLinksTable.id, id)).returning();
  res.json(toDto(row));
});

router.delete("/marketing/links/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }

  const existing = await findInScope(req, id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(smartLinksTable).where(eq(smartLinksTable.id, id));
  res.json({ ok: true, id });
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
