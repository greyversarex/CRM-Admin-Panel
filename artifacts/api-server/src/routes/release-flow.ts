import { Router } from "express";
import {
  db, releasesTable, tracksTable, artistsTable, releaseArtistsTable,
  releaseDspsTable, splitsTable,
} from "@workspace/db";
import { eq, and, ilike, ne, or, inArray, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getDataScope } from "../lib/auth";
import { releaseInScope } from "../lib/release-scope";
import { auditMutation } from "../lib/audit";
import { releaseEditableReason } from "./releases";

const router = Router();

// ─── GET /releases/check-upc?upc=... ─────────────────────────────────────────
// Проверяет, занят ли UPC в нашем каталоге. Используется UPC Gate (Шаг 1).
router.get("/releases/check-upc", async (req, res): Promise<void> => {
  const upc = String(req.query.upc ?? "").trim();
  if (!upc) { res.status(400).json({ error: "upc required" }); return; }
  if (!/^\d{8,14}$/.test(upc)) {
    res.json({ available: false, reason: "Неверный формат UPC (нужно 8–14 цифр)." });
    return;
  }
  const [existing] = await db.select({
    id: releasesTable.id, title: releasesTable.title, artistId: releasesTable.artistId,
    status: releasesTable.status,
  }).from(releasesTable).where(eq(releasesTable.upc, upc));
  if (!existing) { res.json({ available: true }); return; }
  res.json({
    available: false,
    reason: "Этот UPC уже используется в каталоге.",
    conflictRelease: { id: existing.id, title: existing.title, status: existing.status },
  });
});

// ─── GET /tracks/reusable?q=&excludeReleaseId= ───────────────────────────────
// Каталог ранее одобренных треков (status IN approved/delivered/live) внутри scope.
// Используется в модалке «Reuse Existing Track» на странице Release Hub.
router.get("/tracks/reusable", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const q = String(req.query.q ?? "").trim();
  const excludeReleaseId = req.query.excludeReleaseId
    ? Number(req.query.excludeReleaseId) : null;

  const conds: any[] = [
    inArray(releasesTable.status, ["approved", "delivered", "live"]),
  ];
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json({ data: [] }); return; }
      conds.push(eq(tracksTable.artistId, scope.artistId));
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json({ data: [] }); return; }
      const labelArtists = await db.select({ id: artistsTable.id })
        .from(artistsTable).where(eq(artistsTable.labelId, scope.labelId));
      const ids = labelArtists.map(a => a.id);
      if (ids.length === 0) { res.json({ data: [] }); return; }
      conds.push(inArray(tracksTable.artistId, ids));
    }
  }
  if (excludeReleaseId) conds.push(ne(tracksTable.releaseId, excludeReleaseId));
  if (q) {
    conds.push(or(
      ilike(tracksTable.title, `%${q}%`),
      ilike(tracksTable.isrc, `%${q}%`),
    )!);
  }

  const rows = await db
    .select({
      id: tracksTable.id,
      title: tracksTable.title,
      isrc: tracksTable.isrc,
      durationSeconds: tracksTable.durationSeconds,
      audioUrl: tracksTable.audioUrl,
      releaseId: tracksTable.releaseId,
      releaseTitle: releasesTable.title,
      artistId: tracksTable.artistId,
      artistName: artistsTable.name,
    })
    .from(tracksTable)
    .innerJoin(releasesTable, eq(releasesTable.id, tracksTable.releaseId))
    .innerJoin(artistsTable, eq(artistsTable.id, tracksTable.artistId))
    .where(and(...conds))
    .orderBy(asc(tracksTable.title))
    .limit(50);

  res.json({ data: rows });
});

// ─── POST /releases/:id/tracks/reorder ───────────────────────────────────────
// Body: { order: number[] } — массив trackId в желаемом порядке.
const ReorderBody = z.object({ order: z.array(z.number().int().positive()).min(1) });

router.post("/releases/:id/tracks/reorder", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = ReorderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, id));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (!(await releaseInScope(scope, release))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const lock = releaseEditableReason(scope, release.status);
    if (lock) { res.status(409).json({ error: lock }); return; }
  }

  const tracks = await db.select({ id: tracksTable.id })
    .from(tracksTable).where(eq(tracksTable.releaseId, id));
  const existingIds = new Set(tracks.map(t => t.id));
  if (parsed.data.order.length !== existingIds.size
      || !parsed.data.order.every(tid => existingIds.has(tid))) {
    res.status(400).json({ error: "Список треков не совпадает с релизом" }); return;
  }

  // Two-pass UPDATE: сначала сдвигаем номера в отрицательную зону, чтобы не нарушить unique-constraint.
  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.data.order.length; i++) {
      await tx.update(tracksTable)
        .set({ trackNumber: -(i + 1) })
        .where(eq(tracksTable.id, parsed.data.order[i]));
    }
    for (let i = 0; i < parsed.data.order.length; i++) {
      await tx.update(tracksTable)
        .set({ trackNumber: i + 1 })
        .where(eq(tracksTable.id, parsed.data.order[i]));
    }
  });

  void auditMutation(req, {
    action: "update", entityType: "release", entityId: id,
    before: { trackOrder: tracks.map(t => t.id) },
    after: { trackOrder: parsed.data.order },
  });
  res.json({ ok: true, order: parsed.data.order });
});

// ─── GET /releases/:id/issues ────────────────────────────────────────────────
// Полный «Show Issues» отчёт перед сабмитом. Возвращает массив проблем по секциям.
type Issue = { section: string; field: string | null; message: string; severity: "error" | "warning" };

router.get("/releases/:id/issues", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, id));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (!(await releaseInScope(scope, release))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const issues: Issue[] = [];

  // Release-level
  if (!release.title?.trim())
    issues.push({ section: "release", field: "title", message: "Не указано название релиза.", severity: "error" });
  if (!release.coverUrl)
    issues.push({ section: "release", field: "coverUrl", message: "Загрузите обложку релиза (минимум 3000×3000 px).", severity: "error" });
  if (!release.genre)
    issues.push({ section: "release", field: "genre", message: "Выберите основной жанр.", severity: "error" });
  if (!release.releaseDate)
    issues.push({ section: "release", field: "releaseDate", message: "Укажите дату релиза.", severity: "error" });
  else {
    const rd = new Date(release.releaseDate);
    const minDate = new Date(); minDate.setDate(minDate.getDate() + 7);
    if (rd < minDate)
      issues.push({ section: "release", field: "releaseDate", message: "Большинство DSP требуют минимум 7 дней между сабмитом и релизом.", severity: "warning" });
  }
  if (!release.language)
    issues.push({ section: "release", field: "language", message: "Выберите язык метаданных.", severity: "error" });
  // Год может быть указан отдельным полем (pLineYear) ИЛИ прямо в строке
  // («℗ 2025 Tajik Music») — старые релизы сохраняли только строку. Не блокируем,
  // если год читается из текста.
  const lineHasYear = (s: string | null) => !!s && /\b(19|20)\d{2}\b/.test(s);
  if (!release.pLine || (!release.pLineYear && !lineHasYear(release.pLine)))
    issues.push({ section: "release", field: "pLine", message: "Укажите ℗ Line (год + правообладатель).", severity: "error" });
  if (!release.cLine || (!release.cLineYear && !lineHasYear(release.cLine)))
    issues.push({ section: "release", field: "cLine", message: "Укажите © Line (год + правообладатель).", severity: "error" });
  if ((release as any).coverAiUsage == null)
    issues.push({ section: "release", field: "coverAiUsage", message: "Раскройте использование AI при создании обложки (требование DSP).", severity: "error" });

  // Tracks
  const tracks = await db.select().from(tracksTable)
    .where(eq(tracksTable.releaseId, id))
    .orderBy(asc(tracksTable.trackNumber), asc(tracksTable.id));
  if (tracks.length === 0) {
    issues.push({ section: "tracks", field: null, message: "В релизе нет треков. Добавьте минимум один трек.", severity: "error" });
  }
  for (const t of tracks) {
    const prefix = `Трек «${t.title || `#${t.id}`}»`;
    if (!t.title?.trim())
      issues.push({ section: "tracks", field: `track:${t.id}:title`, message: `${prefix}: не указано название.`, severity: "error" });
    if (!t.audioUrl)
      issues.push({ section: "tracks", field: `track:${t.id}:audioUrl`, message: `${prefix}: не загружен аудиофайл (WAV/FLAC, 16/24-bit, 44.1+ kHz).`, severity: "error" });
    if (!t.durationSeconds || t.durationSeconds < 30)
      issues.push({ section: "tracks", field: `track:${t.id}:duration`, message: `${prefix}: длительность меньше 30 сек или не определена.`, severity: "warning" });
    if (!t.displayArtists || (Array.isArray(t.displayArtists) && t.displayArtists.length === 0))
      issues.push({ section: "tracks", field: `track:${t.id}:displayArtists`, message: `${prefix}: укажите хотя бы одного исполнителя.`, severity: "error" });
    if (!t.writers || (Array.isArray(t.writers) && t.writers.length === 0))
      issues.push({ section: "tracks", field: `track:${t.id}:writers`, message: `${prefix}: укажите авторов (требование PRO/CMO).`, severity: "error" });
    else if (Array.isArray(t.writers)) {
      const total = (t.writers as any[]).reduce((s, w) => s + (Number(w?.share) || 0), 0);
      if (Math.abs(total - 100) > 0.01)
        issues.push({ section: "tracks", field: `track:${t.id}:writers`, message: `${prefix}: сумма долей авторов = ${total}% (должна быть 100%).`, severity: "error" });
    }
    // Язык вокала: достаточно указанного «языка вокала» ЛИБО языка метаданных трека.
    // Доставка в DSP (DDEX) всё равно использует язык метаданных (t.language || release.language),
    // поэтому требовать отдельно заполненный vocalLanguage — ложная блокировка.
    if (t.audioStyle === "vocal" && !t.vocalLanguage && !t.language)
      issues.push({ section: "tracks", field: `track:${t.id}:vocalLanguage`, message: `${prefix}: вокальный трек — укажите язык вокала.`, severity: "error" });
    if (t.audioStyle === "vocal" && !t.lyrics)
      issues.push({ section: "tracks", field: `track:${t.id}:lyrics`, message: `${prefix}: вокальный трек — приложите текст (повышает шансы попасть в редакторские плейлисты).`, severity: "warning" });
    if (t.clipStartSeconds != null && t.durationSeconds && t.clipStartSeconds + 30 > t.durationSeconds)
      issues.push({ section: "tracks", field: `track:${t.id}:clipStart`, message: `${prefix}: точка превью + 30 сек выходит за длительность трека.`, severity: "warning" });
    const ta = t as any;
    if (ta.spatialAudioUrl && !ta.spatialIsrc)
      issues.push({ section: "tracks", field: `track:${t.id}:spatialIsrc`, message: `${prefix}: для Spatial-версии нужен отдельный ISRC.`, severity: "warning" });
  }

  // Delivery
  // Площадки выбираются либо через классический release_dsps (устаревший пикер),
  // либо через мастер Broma16 (release.broma16DistributionOutlets) — второй способ
  // сейчас единственный доступный в UI, поэтому обязательно учитываем его здесь,
  // иначе релиз с выбранными витринами Broma16 будет ложно блокироваться.
  const dsps = await db.select({ code: releaseDspsTable.dspCode })
    .from(releaseDspsTable).where(eq(releaseDspsTable.releaseId, id));
  const broma16Outlets = (release as any).broma16DistributionOutlets as string[] | null;
  if (dsps.length === 0 && (!broma16Outlets || broma16Outlets.length === 0))
    issues.push({ section: "delivery", field: "dsps", message: "Не выбрано ни одной DSP-площадки.", severity: "error" });
  if (!release.territories || (Array.isArray(release.territories) && release.territories.length === 0))
    issues.push({ section: "delivery", field: "territories", message: "Не выбрана ни одна территория релиза.", severity: "error" });

  // Contributors / Splits
  const releaseArtists = await db.select().from(releaseArtistsTable)
    .where(eq(releaseArtistsTable.releaseId, id));
  if (releaseArtists.length === 0)
    issues.push({ section: "contributors", field: "artists", message: "Не указаны исполнители релиза.", severity: "error" });

  const splits = await db.select().from(splitsTable).where(eq(splitsTable.releaseId, id));
  if (splits.length === 0 && tracks.length > 0)
    issues.push({ section: "contributors", field: "splits", message: "Не настроены доли (SplitShare). Без них роялти распределяются 100% владельцу релиза.", severity: "warning" });
  for (const s of splits) {
    if (Array.isArray(s.participants)) {
      // Участники сплита хранятся с полем percentage (в устаревших записях
      // могло встречаться share) — учитываем оба, иначе сумма всегда 0%.
      const total = (s.participants as any[]).reduce((sum, p) => sum + (Number(p?.percentage ?? p?.share) || 0), 0);
      if (total === 0) {
        // Сплит создан, но доли не заданы — трактуем как «не настроено»:
        // роялти уходят владельцу релиза 100% (как и при полном отсутствии
        // сплитов). Не блокируем отправку, только предупреждаем.
        issues.push({ section: "contributors", field: `split:${s.id}`, message: `Доли для split #${s.id} не заданы — по умолчанию роялти уйдут владельцу релиза на 100%. Настройте SplitShare, если доход нужно разделить.`, severity: "warning" });
      } else if (Math.abs(total - 100) > 0.01) {
        issues.push({ section: "contributors", field: `split:${s.id}`, message: `Сумма долей в split #${s.id} = ${total}% (должна быть 100%).`, severity: "error" });
      }
    }
  }

  const ok = !issues.some(i => i.severity === "error");
  res.json({ ok, issues });
});

export default router;
