import { Router } from "express";
import {
  db, releasesTable, tracksTable, artistsTable,
  releaseArtistsTable, releaseDspsTable, dspCatalogTable,
  assetsTable,
} from "@workspace/db";
import { eq, asc, and, inArray } from "drizzle-orm";
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

  // Validate коды против каталога + проверяем deliverability.
  // Без ddexPartyId DSP не доставляется по DDEX (Yandex/VK/Звук и т.п.) —
  // их нельзя сохранять в release_dsps, иначе delivery-worker не сможет
  // отгрузить релиз и пользователь увидит постоянный failed.
  if (codes.length > 0) {
    const known = await db.select({ code: dspCatalogTable.code, ddexPartyId: dspCatalogTable.ddexPartyId, isActive: dspCatalogTable.isActive })
      .from(dspCatalogTable);
    const byCode = new Map(known.map((k) => [k.code, k]));
    const unknown = codes.filter((c) => !byCode.has(c));
    if (unknown.length > 0) {
      res.status(400).json({ error: `Unknown DSP codes: ${unknown.join(", ")}` });
      return;
    }
    const inactive = codes.filter((c) => byCode.get(c)?.isActive === false);
    if (inactive.length > 0) {
      res.status(400).json({ error: `Площадки отключены: ${inactive.join(", ")}` });
      return;
    }
    const undeliverable = codes.filter((c) => !byCode.get(c)?.ddexPartyId);
    if (undeliverable.length > 0) {
      res.status(400).json({
        error: `Эти площадки ещё не подключены по DDEX и не могут быть выбраны: ${undeliverable.join(", ")}. Свяжитесь с администратором.`,
      });
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

// Регулярки соответствуют ddex/business-validator.ts — это критично, чтобы
// wizard и DDEX-валидатор не расходились. Если правила меняются — менять в обоих.
const UPC_REGEX  = /^\d{12,13}$/;                       // EAN-13 / UPC-A
const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;   // CC-XXX-YY-NNNNN

router.post("/releases/:id/validate", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  const release = r.release!;

  const issues: Issue[] = [];
  const nonBlank = (s: string | null | undefined): boolean => !!(s && s.trim().length > 0);

  // ── Release-level ──
  if (!nonBlank(release.title))       issues.push({ section: "release", field: "title",       message: "Название релиза обязательно", severity: "error" });
  if (!nonBlank(release.releaseDate)) issues.push({ section: "release", field: "releaseDate", message: "Укажите дату релиза", severity: "error" });
  if (!nonBlank(release.genre))       issues.push({ section: "release", field: "genre",       message: "Выберите жанр", severity: "error" });
  if (!nonBlank(release.language))    issues.push({ section: "release", field: "language",    message: "Укажите язык метаданных", severity: "warning" });
  if (!nonBlank(release.pLine))       issues.push({ section: "release", field: "pLine",       message: "Укажите ℗ Line (правообладатель записи)", severity: "warning" });
  if (!nonBlank(release.cLine))       issues.push({ section: "release", field: "cLine",       message: "Укажите © Line (правообладатель композиции)", severity: "warning" });

  // UPC: warning если не задан (бэкенд может сгенерировать через MusicBrainz/auto),
  // но обязательная error если задан в неправильном формате — лучше поймать здесь,
  // чем уже на этапе доставки в DSP.
  if (!nonBlank(release.upc)) {
    issues.push({ section: "release", field: "upc", message: "UPC/ICPN не заполнен — без него релиз не уйдёт в DSP", severity: "error" });
  } else if (!UPC_REGEX.test(release.upc!.trim())) {
    issues.push({ section: "release", field: "upc", message: `UPC «${release.upc}» должен быть 12-13 цифр (EAN-13/UPC-A)`, severity: "error" });
  }

  // Cover: проверяем что обложка реально загружена в storage (asset row),
  // а не просто что URL-строка непустая. Это синхронно с DDEX-валидатором.
  const [coverAsset] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.releaseId, release.id), eq(assetsTable.kind, "cover")))
    .limit(1);
  if (!coverAsset) {
    issues.push({ section: "release", field: "coverUrl", message: "Загрузите обложку (jpg/png, минимум 3000×3000)", severity: "error" });
  }

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
    // Один SQL вместо N+1 — берём все audio-assets для этих треков.
    const trackIds = tracks.map((t) => t.id);
    const audioAssets = trackIds.length > 0
      ? await db.select({ trackId: assetsTable.trackId }).from(assetsTable)
          .where(and(inArray(assetsTable.trackId, trackIds), eq(assetsTable.kind, "audio")))
      : [];
    const tracksWithAudio = new Set(audioAssets.map((a) => a.trackId).filter((x): x is number => x != null));

    const isrcSeen = new Map<string, number>(); // isrc → first track id, для детекта дублей
    for (const t of tracks) {
      const label = `Трек ${t.trackNumber ?? "?"}: ${t.title || "(без названия)"}`;
      if (!nonBlank(t.title)) {
        issues.push({ section: "tracks", field: `track:${t.id}:title`, message: `${label} — нет названия`, severity: "error" });
      }
      // Аудио: проверяем реальное наличие в storage, а не просто audioUrl.
      if (!tracksWithAudio.has(t.id)) {
        issues.push({ section: "tracks", field: `track:${t.id}:audioUrl`, message: `${label} — нет аудио-файла в хранилище`, severity: "error" });
      }
      if (!t.durationSeconds || t.durationSeconds <= 0) {
        issues.push({ section: "tracks", field: `track:${t.id}:duration`, message: `${label} — не определена длительность (загрузите аудио)`, severity: "error" });
      }
      // ISRC: формат + дубли
      if (!nonBlank(t.isrc)) {
        issues.push({ section: "tracks", field: `track:${t.id}:isrc`, message: `${label} — нет ISRC (нажмите «Сгенерировать» или впишите свой)`, severity: "error" });
      } else {
        const isrc = t.isrc!.trim().toUpperCase();
        if (!ISRC_REGEX.test(isrc)) {
          issues.push({ section: "tracks", field: `track:${t.id}:isrc`, message: `${label} — ISRC «${isrc}» должен быть в формате CC-XXX-YY-NNNNN`, severity: "error" });
        } else if (isrcSeen.has(isrc)) {
          issues.push({ section: "tracks", field: `track:${t.id}:isrc`, message: `${label} — ISRC ${isrc} уже использован в другом треке`, severity: "error" });
        } else {
          isrcSeen.set(isrc, t.id);
        }
      }
      // Writers + сумма долей = 100%
      const writers = (t.writers as Array<{ name: string; share: number }> | null) ?? [];
      if (writers.length === 0) {
        issues.push({ section: "tracks", field: `track:${t.id}:writers`, message: `${label} — нужен минимум один автор (Writer)`, severity: "error" });
      } else {
        const totalShare = writers.reduce((s, w) => s + (Number(w.share) || 0), 0);
        if (Math.abs(totalShare - 100) > 0.01) {
          issues.push({ section: "tracks", field: `track:${t.id}:writers`, message: `${label} — сумма долей writers должна быть 100% (сейчас ${totalShare}%)`, severity: "error" });
        }
      }
      if (!nonBlank(t.aiUsage)) {
        issues.push({ section: "tracks", field: `track:${t.id}:aiUsage`, message: `${label} — укажите использование AI`, severity: "warning" });
      }
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
