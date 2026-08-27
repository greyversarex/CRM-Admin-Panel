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
import { releaseInScope } from "../lib/release-scope";
import { auditMutation } from "../lib/audit";
import { releaseEditableReason } from "./releases";
import { getDictionary } from "../services/broma16/dictionaries";
import { checkBroma16Readiness } from "../services/broma16/readiness";
import { logger } from "../lib/logger";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────
async function loadReleaseInScope(req: any, idRaw: unknown): Promise<{ status: number; release?: typeof releasesTable.$inferSelect }> {
  const params = GetReleaseParams.safeParse({ id: idRaw });
  if (!params.success) return { status: 400 };
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!release) return { status: 404 };
  const scope = getDataScope(req);
  if (!(await releaseInScope(scope, release))) return { status: 403 };
  return { status: 200, release };
}

// ─── DSP catalog ────────────────────────────────────────────────────────────
type DspCategory = "streaming" | "download" | "video" | "social" | "fingerprinting";
const CATEGORY_BY_CODE: Record<string, DspCategory> = {
  // Streaming — музыкальные стриминговые сервисы (вкл. региональные).
  spotify: "streaming", apple_music: "streaming", amazon_music: "streaming",
  youtube_music: "streaming", deezer: "streaming", tidal: "streaming",
  pandora: "streaming", soundcloud: "streaming", napster: "streaming",
  iheartradio: "streaming", yandex_music: "streaming", vk_music: "streaming",
  zvuk: "streaming", jiosaavn: "streaming", gaana: "streaming", resso: "streaming",
  kkbox: "streaming", netease: "streaming", tencent: "streaming", alibaba: "streaming",
  anghami: "streaming", audiomack: "streaming", boom_play: "streaming", mixcloud: "streaming",
  // Download — магазины загрузок.
  beatport: "download",
  // Video — видеоплатформы и Content ID.
  youtube_content: "video",
  // Social & UGC — соцсети и платформы пользовательского контента.
  tiktok: "social", meta: "social", cap_cut: "social",
  // Fingerprinting — распознавание и идентификация контента.
  shazam: "fingerprinting",
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

  // Проверяем что все artist_id существуют (одним запросом) и одновременно
  // забираем их labelId для проверки scope ниже.
  const ids = Array.from(new Set(items.map((a) => a.artistId)));
  const artistRows = await db
    .select({ id: artistsTable.id, labelId: artistsTable.labelId })
    .from(artistsTable)
    .where(inArray(artistsTable.id, ids));
  const byId = new Map(artistRows.map((a) => [a.id, a]));
  for (const id of ids) {
    if (!byId.has(id)) { res.status(400).json({ error: `Artist ${id} not found` }); return; }
  }

  // releasesTable.artistId будет синхронизирован с первым primary — этот артист
  // фактически определяет "владельца" релиза, поэтому именно его проверяем строже.
  const firstPrimary = items.find((a) => a.role === "primary") ?? items[0];

  // ── Авторизация назначаемых артистов ──────────────────────────────────────
  // Без этой проверки artist/label пользователь мог бы подставить чужой artistId
  // (в т.ч. передать релиз другому артисту через первый primary). loadReleaseInScope
  // проверяет только доступ к самому релизу, но не к артистам из тела запроса.
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.status(403).json({ error: "Forbidden" }); return; }
      // Запрещаем "увод" релиза: первый primary обязан остаться самим вызывающим артистом.
      if (firstPrimary.artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      // Соисполнители (featuring/with/remixer) допускаются только из того же лейбла,
      // что и сам артист (или это он сам). Для независимого артиста (labelId = null)
      // — только он сам.
      const ownLabelId = byId.get(scope.artistId)?.labelId ?? null;
      for (const id of ids) {
        if (id === scope.artistId) continue;
        const lbl = byId.get(id)?.labelId ?? null;
        if (ownLabelId == null || lbl !== ownLabelId) {
          res.status(403).json({ error: "Artist outside your scope" }); return;
        }
      }
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.status(403).json({ error: "Forbidden" }); return; }
      // Все назначаемые артисты обязаны принадлежать лейблу вызывающего.
      for (const id of ids) {
        if ((byId.get(id)?.labelId ?? null) !== scope.labelId) {
          res.status(403).json({ error: "Artist does not belong to your label" }); return;
        }
      }
    }
  }

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

// ─── Broma16 distribution outlets (словарь outlet) ───────────────────────────
// Витрины Broma16 (~39 шт, включая локальные площадки вроде TCell). В ОТЛИЧИЕ
// от /dsps (release_dsps → прямая DDEX-доставка) это коды витрин Broma16,
// которые сохраняются в release.broma16DistributionOutlets и передаются в
// Broma16 при пуше (resolveOutletCodes/Шаг 8 в release-pusher.ts). Выбираются
// в мастере создания релиза.
router.get("/releases/:id/distribution-outlets", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  res.json(r.release!.broma16DistributionOutlets ?? []);
});

router.put("/releases/:id/distribution-outlets", async (req, res): Promise<void> => {
  const r = await loadReleaseInScope(req, req.params.id);
  if (r.status !== 200) { res.status(r.status).json({ error: "Forbidden or not found" }); return; }
  const release = r.release!;

  const scope = getDataScope(req);
  const lockReason = releaseEditableReason(scope, release.status);
  if (lockReason) { res.status(409).json({ error: lockReason }); return; }

  const parsed = z.object({ outlets: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const codes = Array.from(new Set(parsed.data.outlets.map((s) => s.trim()).filter(Boolean)));

  // Валидируем против словаря Broma16 outlet: нельзя сохранять код, которого нет
  // в справочнике, иначе Broma16 отвергнет distribution при пуше.
  if (codes.length > 0) {
    const dict = await getDictionary("outlet");
    if (dict.length > 0) {
      const valid = new Set<string>();
      for (const d of dict) { if (d.code) valid.add(d.code); valid.add(d.externalId); }
      const unknown = codes.filter((c) => !valid.has(c));
      if (unknown.length > 0) {
        res.status(400).json({ error: `Неизвестные коды витрин Broma16: ${unknown.join(", ")}` });
        return;
      }
    }
  }

  await db.update(releasesTable)
    .set({ broma16DistributionOutlets: codes })
    .where(eq(releasesTable.id, release.id));

  void auditMutation(req, {
    action: "update", entityType: "release", entityId: release.id,
    before: { broma16DistributionOutlets: "previous list" }, after: { broma16DistributionOutlets: codes },
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
  let [coverAsset] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.releaseId, release.id), eq(assetsTable.kind, "cover")))
    .limit(1);
  // Fallback: обложка может лежать в "пуле" ассетов (release_id=null) и быть
  // связана через release.coverUrl — добираем по objectPath.
  if (!coverAsset && release.coverUrl) {
    [coverAsset] = await db.select().from(assetsTable)
      .where(and(eq(assetsTable.objectPath, release.coverUrl), eq(assetsTable.kind, "cover")))
      .limit(1);
  }
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
    // Fallback: аудио может быть связано с треком через track.audioUrl (файл из
    // "пула" ассетов с track_id=null). Проверяем наличие ассета по objectPath.
    const fallbackAudioUrls = tracks.filter((t) => !tracksWithAudio.has(t.id) && t.audioUrl).map((t) => t.audioUrl as string);
    if (fallbackAudioUrls.length > 0) {
      const poolAudio = await db.select({ objectPath: assetsTable.objectPath }).from(assetsTable)
        .where(and(inArray(assetsTable.objectPath, fallbackAudioUrls), eq(assetsTable.kind, "audio")));
      const poolPaths = new Set(poolAudio.map((a) => a.objectPath));
      for (const t of tracks) {
        if (!tracksWithAudio.has(t.id) && t.audioUrl && poolPaths.has(t.audioUrl)) tracksWithAudio.add(t.id);
      }
    }

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
  // Витрины выбираются в мастере и хранятся в release.broma16DistributionOutlets
  // (Broma16 = единственный канал доставки в этом продукте). Раньше проверялся
  // release_dsps (прямая DDEX-доставка) — но мастер туда больше не пишет.
  const outlets = (release.broma16DistributionOutlets as string[] | null) ?? [];
  if (outlets.length === 0) {
    issues.push({ section: "delivery", message: "Выберите хотя бы одну витрину для дистрибуции", severity: "error" });
  }
  if (!release.territories || (release.territories as string[]).length === 0) {
    issues.push({ section: "delivery", field: "territories", message: "Выберите территории распространения", severity: "error" });
  }

  // Требования Broma16 — часть той же проверки, а не отдельная история.
  // Раньше мастер проверял релиз по своему списку, ничего не зная про правила
  // дистрибьютора: оператор проходил проверку, отправлял — и упирался в отказ
  // уже на модерации, после девяти выполненных шагов. Список правил один и тот
  // же и здесь, и в отчёте на странице релиза, и в самом пушере.
  // «distribution» у проверки Broma16 отображаем в «delivery»: в мастере
  // раздела с таким названием нет, и замечание иначе не к чему привязать.
  // Проверка ходит в Broma16 за словарями и меряет обложку. Если она недоступна,
  // мастер не должен падать целиком: показываем это отдельным предупреждением,
  // а остальные замечания остаются на месте.
  try {
    for (const i of await checkBroma16Readiness(release.id)) {
      issues.push({
        ...i,
        section: i.section === "distribution" ? "delivery" : i.section,
      } as Issue);
    }
  } catch (err) {
    logger.warn({ err, releaseId: release.id }, "[validate] проверка требований Broma16 недоступна");
    issues.push({
      section: "delivery",
      field: "broma16",
      message: "Не удалось проверить требования Broma16 — сервис недоступен. Отправка может упереться в его правила.",
      severity: "warning",
    });
  }

  const ok = !issues.some((i) => i.severity === "error");
  res.json({ ok, issues });
});

export default router;
