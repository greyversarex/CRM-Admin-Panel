import { Router } from "express";
import {
  db, releasesTable, tracksTable, artistsTable,
  releaseArtistsTable, releaseDspsTable, dspCatalogTable,
} from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  GetReleaseParams,
  UpdateReleaseArtistsBody, UpdateReleaseDspsBody,
} from "@workspace/api-zod";
import { getDataScope } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { releaseEditableReason } from "./releases";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────
async function loadReleaseInScope(req: any, idRaw: unknown): Promise<{ status: number; release?: typeof releasesTable.$inferSelect }> {
  const params = GetReleaseParams.safeParse({ id: idRaw });
  if (!params.success) return { status: 400 };
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!release) return { status: 404 };
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist" && release.artistId !== scope.artistId) return { status: 403 };
    if (scope.role === "label"  && release.labelId  !== scope.labelId)  return { status: 403 };
  }
  return { status: 200, release };
}

// ─── DSP catalog ────────────────────────────────────────────────────────────
const CATEGORY_BY_CODE: Record<string, "streaming" | "download" | "social" | "video" | "regional"> = {
  spotify: "streaming", apple_music: "streaming", amazon_music: "streaming",
  deezer: "streaming", tidal: "streaming", pandora: "streaming",
  napster: "streaming", soundcloud: "streaming", iheartradio: "streaming",
  youtube_music: "streaming", youtube_content: "video",
  tiktok: "social", meta: "social", cap_cut: "social", shazam: "social", mixcloud: "social",
  beatport: "download",
  yandex_music: "regional", vk_music: "regional", zvuk: "regional",
  jiosaavn: "regional", gaana: "regional", resso: "regional",
  kkbox: "regional", netease: "regional", tencent: "regional",
  alibaba: "regional", anghami: "regional", boom_play: "regional",
  audiomack: "regional",
};

router.get("/dsp-catalog", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dspCatalogTable)
    .where(eq(dspCatalogTable.isActive, true))
    .orderBy(asc(dspCatalogTable.sortOrder), asc(dspCatalogTable.name));
  res.json(rows.map((d) => ({
    code: d.code,
    name: d.name,
    logoUrl: d.logoUrl,
    ddexPartyId: d.ddexPartyId,
    category: CATEGORY_BY_CODE[d.code] ?? "streaming",
    isActive: d.isActive,
    position: d.sortOrder,
  })));
});

// ─── Release artists (multi-primary) ────────────────────────────────────────
router.get("/releases/:id/artists", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  const rows = await db.select({
    artistId: releaseArtistsTable.artistId,
    role: releaseArtistsTable.role,
    position: releaseArtistsTable.position,
    name: artistsTable.name,
  }).from(releaseArtistsTable)
    .innerJoin(artistsTable, eq(artistsTable.id, releaseArtistsTable.artistId))
    .where(eq(releaseArtistsTable.releaseId, r.release!.id))
    .orderBy(asc(releaseArtistsTable.position), asc(releaseArtistsTable.id));
  res.json(rows);
});

router.put("/releases/:id/artists", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  const release = r.release!;

  // Replace целиком — это PUT, поэтому old wins on lock.
  const scope = getDataScope(req);
  const lockReason = releaseEditableReason(scope, release.status);
  if (lockReason) { res.status(409).json({ error: lockReason }); return; }

  const parsed = UpdateReleaseArtistsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const items = parsed.data.artists;
  if (items.length === 0) { res.status(400).json({ error: "Must have at least one artist" }); return; }
  if (!items.some((a) => a.role === "primary")) { res.status(400).json({ error: "Must have at least one primary artist" }); return; }

  // Проверяем что все artist_id существуют (дешевле сделать одним запросом).
  const ids = Array.from(new Set(items.map((a) => a.artistId)));
  const existing = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.id, ids[0]));
  // Простая проверка по первому — Drizzle inArray уже использовался выше; но для безопасности проверяем каждого:
  for (const id of ids) {
    const [a] = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.id, id));
    if (!a) { res.status(400).json({ error: `Artist ${id} not found` }); return; }
  }
  void existing;

  await db.transaction(async (tx) => {
    await tx.delete(releaseArtistsTable).where(eq(releaseArtistsTable.releaseId, release.id));
    await tx.insert(releaseArtistsTable).values(items.map((a, idx) => ({
      releaseId: release.id,
      artistId: a.artistId,
      role: a.role,
      position: idx,
    })));
    // releasesTable.artistId синхронизируем с первым primary — чтобы scope-фильтры
    // и enrichment продолжали работать как раньше.
    const firstPrimary = items.find((a) => a.role === "primary") ?? items[0];
    if (firstPrimary && firstPrimary.artistId !== release.artistId) {
      await tx.update(releasesTable)
        .set({ artistId: firstPrimary.artistId })
        .where(eq(releasesTable.id, release.id));
    }
  });

  void auditMutation(req, {
    action: "update", entityType: "release", entityId: release.id,
    before: { artists: "previous list" }, after: { artists: items },
  });

  const rows = await db.select({
    artistId: releaseArtistsTable.artistId,
    role: releaseArtistsTable.role,
    position: releaseArtistsTable.position,
    name: artistsTable.name,
  }).from(releaseArtistsTable)
    .innerJoin(artistsTable, eq(artistsTable.id, releaseArtistsTable.artistId))
    .where(eq(releaseArtistsTable.releaseId, release.id))
    .orderBy(asc(releaseArtistsTable.position), asc(releaseArtistsTable.id));
  res.json(rows);
});

// ─── Release DSP destinations ────────────────────────────────────────────────
router.get("/releases/:id/dsps", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  const rows = await db.select({ code: releaseDspsTable.dspCode })
    .from(releaseDspsTable)
    .where(eq(releaseDspsTable.releaseId, r.release!.id))
    .orderBy(asc(releaseDspsTable.id));
  res.json(rows.map((d) => d.code));
});

router.put("/releases/:id/dsps", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  const release = r.release!;

  const scope = getDataScope(req);
  const lockReason = releaseEditableReason(scope, release.status);
  if (lockReason) { res.status(409).json({ error: lockReason }); return; }

  const parsed = UpdateReleaseDspsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const codes = Array.from(new Set(parsed.data.dsps.map((s) => s.trim()).filter(Boolean)));

  // Validate коды против каталога.
  if (codes.length > 0) {
    const known = await db.select({ code: dspCatalogTable.code }).from(dspCatalogTable);
    const knownSet = new Set(known.map((k) => k.code));
    const unknown = codes.filter((c) => !knownSet.has(c));
    if (unknown.length > 0) {
      res.status(400).json({ error: `Unknown DSP codes: ${unknown.join(", ")}` });
      return;
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(releaseDspsTable).where(eq(releaseDspsTable.releaseId, release.id));
    if (codes.length > 0) {
      await tx.insert(releaseDspsTable).values(codes.map((c) => ({
        releaseId: release.id,
        dspCode: c,
      })));
    }
  });

  void auditMutation(req, {
    action: "update", entityType: "release", entityId: release.id,
    before: { dsps: "previous list" }, after: { dsps: codes },
  });

  res.json(codes);
});

// ─── Submission validation (dry-run) ────────────────────────────────────────
type Issue = { section: "release" | "tracks" | "delivery" | "contributors"; field?: string | null; message: string; severity: "error" | "warning" };

router.post("/releases/:id/validate", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  const release = r.release!;

  const issues: Issue[] = [];
  const nonBlank = (s: string | null | undefined): boolean => !!(s && s.trim().length > 0);

  // ── Release-level ──
  if (!nonBlank(release.title))       issues.push({ section: "release", field: "title",       message: "Название релиза обязательно", severity: "error" });
  if (!nonBlank(release.coverUrl))    issues.push({ section: "release", field: "coverUrl",    message: "Загрузите обложку", severity: "error" });
  if (!nonBlank(release.releaseDate)) issues.push({ section: "release", field: "releaseDate", message: "Укажите дату релиза", severity: "error" });
  if (!nonBlank(release.genre))       issues.push({ section: "release", field: "genre",       message: "Выберите жанр", severity: "error" });
  if (!nonBlank(release.language))    issues.push({ section: "release", field: "language",    message: "Укажите язык метаданных", severity: "warning" });
  if (!nonBlank(release.pLine))       issues.push({ section: "release", field: "pLine",       message: "Укажите ℗ Line (правообладатель записи)", severity: "warning" });
  if (!nonBlank(release.cLine))       issues.push({ section: "release", field: "cLine",       message: "Укажите © Line (правообладатель композиции)", severity: "warning" });

  // ── Contributors ──
  const releaseArtists = await db.select().from(releaseArtistsTable).where(eq(releaseArtistsTable.releaseId, release.id));
  if (releaseArtists.length === 0) {
    issues.push({ section: "contributors", message: "Нужен минимум один артист на релизе", severity: "error" });
  } else if (!releaseArtists.some((a) => a.role === "primary")) {
    issues.push({ section: "contributors", message: "Нужен минимум один Primary артист", severity: "error" });
  }

  // ── Tracks ──
  const tracks = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, release.id));
  if (tracks.length === 0) {
    issues.push({ section: "tracks", message: "Добавьте хотя бы один трек", severity: "error" });
  } else {
    for (const t of tracks) {
      const label = `Трек ${t.trackNumber ?? "?"}: ${t.title}`;
      if (!nonBlank(t.audioUrl))       issues.push({ section: "tracks", field: `track:${t.id}:audioUrl`,    message: `${label} — нет аудио-файла`, severity: "error" });
      if (!nonBlank(t.title))          issues.push({ section: "tracks", field: `track:${t.id}:title`,       message: `${label} — нет названия`, severity: "error" });
      const writers = (t.writers as Array<{ name: string; share: number }> | null) ?? [];
      if (writers.length === 0) {
        issues.push({ section: "tracks", field: `track:${t.id}:writers`, message: `${label} — нужен минимум один автор (Writer)`, severity: "error" });
      } else {
        const totalShare = writers.reduce((s, w) => s + (Number(w.share) || 0), 0);
        if (Math.abs(totalShare - 100) > 0.01) {
          issues.push({ section: "tracks", field: `track:${t.id}:writers`, message: `${label} — сумма долей writers должна быть 100% (сейчас ${totalShare}%)`, severity: "error" });
        }
      }
      if (!nonBlank(t.aiUsage))        issues.push({ section: "tracks", field: `track:${t.id}:aiUsage`, message: `${label} — укажите использование AI`, severity: "warning" });
    }
  }

  // ── Delivery ──
  const dsps = await db.select().from(releaseDspsTable).where(eq(releaseDspsTable.releaseId, release.id));
  if (dsps.length === 0) {
    issues.push({ section: "delivery", message: "Выберите хотя бы одну DSP-площадку", severity: "error" });
  }
  if (!release.territories || (release.territories as string[]).length === 0) {
    issues.push({ section: "delivery", field: "territories", message: "Выберите территории распространения", severity: "error" });
  }

  const ok = !issues.some((i) => i.severity === "error");
  res.json({ ok, issues });
});

export default router;
