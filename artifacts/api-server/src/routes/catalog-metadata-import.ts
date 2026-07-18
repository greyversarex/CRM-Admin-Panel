/**
 * Универсальный импорт каталога из Excel/CSV любого дистрибьютора.
 *
 *   POST /catalog/metadata-import/preview  — разобрать файл, определить колонки
 *        через обучаемый словарь (metadata_field_aliases), проверить
 *        безопасность (дубликаты UPC/ISRC, чужой лейбл, уже доставлено) и
 *        вернуть предпросмотр с картой соответствия и списком неизвестных колонок.
 *   POST /catalog/metadata-import/commit   — создать черновики релизов/треков,
 *        привязать к выбранному лейблу, сохранить подтверждённые новые алиасы.
 *   GET  /catalog/metadata-aliases         — список известных алиасов + каталог
 *        внутренних полей (для ручного сопоставления на фронтенде).
 *
 * Доступ: admin/manager — общий guard /catalog в routes/index.ts.
 *
 * ВАЖНО: все релизы импорта помечаются isTransfer=true. Это включает запрет на
 * генерацию новых UPC/ISRC при отправке в Broma16 (см. release-pusher.ts):
 * при переносе каталога коды пересоздавать нельзя, иначе DSP обнулят стримы.
 */
import { Router, type RequestHandler } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import {
  db,
  releasesTable,
  tracksTable,
  artistsTable,
  labelsTable,
  deliveriesTable,
  metadataFieldAliasesTable,
  releaseArtistsTable,
} from "@workspace/db";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

/** Извлекает 4-значный год из строки pLine/cLine, например «© 2025 Tajik Music» → 2025. */
function yearFromLine(s: string | null | undefined): number | null {
  const m = s?.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

const router = Router();

const MAX_BYTES = 20 * 1024 * 1024; // 20 МБ — файлы держим в памяти для xlsx.
const MAX_ROWS = 10000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

function uploadSingle(field: string): RequestHandler {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: `Файл превышает лимит ${MAX_BYTES / 1024 / 1024} МБ` });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : "Ошибка загрузки файла" });
        return;
      }
      next();
    });
  };
}

// ── Каталог внутренних полей ────────────────────────────────────────────────
type Scope = "release" | "track";
const INTERNAL_FIELDS: { key: string; label: string; scope: Scope }[] = [
  { key: "title",           label: "Название релиза",      scope: "release" },
  { key: "releaseVersion",  label: "Версия релиза",        scope: "release" },
  { key: "upc",             label: "UPC / EAN",            scope: "release" },
  { key: "releaseDate",     label: "Дата релиза",          scope: "release" },
  { key: "genre",           label: "Жанр",                 scope: "release" },
  { key: "subgenre",        label: "Поджанр",              scope: "release" },
  { key: "label",           label: "Лейбл (из файла)",     scope: "release" },
  { key: "pLine",           label: "Копирайт ℗ (P-line)",  scope: "release" },
  { key: "cLine",           label: "Копирайт © (C-line)",  scope: "release" },
  { key: "coverUrl",        label: "Ссылка на обложку",    scope: "release" },
  { key: "language",        label: "Язык",                 scope: "release" },
  { key: "primaryArtist",   label: "Основной артист",      scope: "release" },
  { key: "trackTitle",      label: "Название трека",       scope: "track" },
  { key: "trackVersion",    label: "Версия трека",         scope: "track" },
  { key: "isrc",            label: "ISRC",                 scope: "track" },
  { key: "trackNumber",     label: "Номер трека",          scope: "track" },
  { key: "explicit",        label: "Explicit (да/нет)",    scope: "track" },
  { key: "duration",        label: "Длительность",         scope: "track" },
  { key: "featuredArtists", label: "Приглашённые артисты", scope: "track" },
];
const FIELD_KEYS = new Set<string>(INTERNAL_FIELDS.map((f) => f.key));

/** Нормализуем заголовок для сравнения: нижний регистр, только буквы/цифры, пробелы. */
function normalizeHeader(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Встроенные соответствия — работают даже при пустом словаре в БД. Ключ уже
// нормализован. Пользовательские/сеяные алиасы из БД перекрывают их.
const BUILTIN_ALIASES: Record<string, string> = {
  "album title": "title", "release title": "title", "album name": "title", "album": "title", "release": "title", "product title": "title", "title": "title",
  "release version": "releaseVersion", "version": "releaseVersion",
  "upc": "upc", "ean": "upc", "upc ean": "upc", "barcode": "upc", "upc code": "upc", "grid": "upc",
  "release date": "releaseDate", "digital release date": "releaseDate", "original release date": "releaseDate", "date": "releaseDate",
  "genre": "genre", "primary genre": "genre", "main genre": "genre",
  "subgenre": "subgenre", "sub genre": "subgenre", "secondary genre": "subgenre",
  "label": "label", "label name": "label", "record label": "label",
  "p line": "pLine", "phonographic copyright": "pLine", "c line": "cLine", "copyright": "cLine", "copyright line": "cLine",
  "cover": "coverUrl", "cover url": "coverUrl", "artwork": "coverUrl", "artwork url": "coverUrl", "cover art": "coverUrl", "image": "coverUrl",
  "language": "language", "lyrics language": "language", "audio language": "language",
  "primary artist": "primaryArtist", "artist": "primaryArtist", "main artist": "primaryArtist", "album artist": "primaryArtist", "display artist": "primaryArtist", "artists": "primaryArtist",
  "track title": "trackTitle", "song title": "trackTitle", "track name": "trackTitle", "song": "trackTitle",
  "track version": "trackVersion",
  "isrc": "isrc", "isrc code": "isrc",
  "track number": "trackNumber", "track no": "trackNumber", "track": "trackNumber", "sequence": "trackNumber", "position": "trackNumber", "no": "trackNumber",
  "explicit": "explicit", "parental advisory": "explicit", "explicit content": "explicit", "explicit lyrics": "explicit", "advisory": "explicit",
  "duration": "duration", "length": "duration", "runtime": "duration",
  "featured artists": "featuredArtists", "featuring": "featuredArtists", "feat": "featuredArtists", "featured": "featuredArtists",
};

/** Строит карту normalizedAlias→internalField: builtin < universal < source-specific. */
async function buildAliasMap(source: string): Promise<Map<string, string>> {
  const map = new Map<string, string>(Object.entries(BUILTIN_ALIASES));
  const rows = source
    ? await db.select().from(metadataFieldAliasesTable).where(inArray(metadataFieldAliasesTable.source, ["", source]))
    : await db.select().from(metadataFieldAliasesTable).where(eq(metadataFieldAliasesTable.source, ""));
  for (const r of rows.filter((r) => r.source === "")) map.set(r.alias, r.internalField);
  for (const r of rows.filter((r) => r.source !== "")) map.set(r.alias, r.internalField);
  return map;
}

// ── Разбор файла ────────────────────────────────────────────────────────────
type SheetRow = Record<string, unknown>;
function parseWorkbook(buf: Buffer): { headers: string[]; rows: SheetRow[] } {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim()).filter((h, i, arr) => h !== "" || arr.indexOf(h) === i);
  const rawHeaders = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
  const rows: SheetRow[] = [];
  for (let i = 1; i < aoa.length && rows.length < MAX_ROWS; i++) {
    const arr = aoa[i] as unknown[];
    const obj: SheetRow = {};
    let hasData = false;
    rawHeaders.forEach((h, idx) => {
      if (!h) return;
      const v = arr[idx];
      obj[h] = v;
      if (v !== undefined && v !== null && String(v).trim() !== "") hasData = true;
    });
    if (hasData) rows.push(obj);
  }
  return { headers: rawHeaders.filter((h) => h !== ""), rows };
}

/** Итоговая карта колонок с учётом ручных переопределений. */
function resolveMapping(headers: string[], aliasMap: Map<string, string>, overrides: Record<string, string>) {
  return headers.map((header) => {
    const ov = overrides[header];
    let field: string | null = null;
    if (ov !== undefined) field = ov === "" || ov === "ignore" ? null : (FIELD_KEYS.has(ov) ? ov : null);
    else field = aliasMap.get(normalizeHeader(header)) ?? null;
    return { header, internalField: field, known: field !== null };
  });
}

function rowToFields(row: SheetRow, mapping: { header: string; internalField: string | null }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mapping) {
    if (!m.internalField) continue;
    const v = row[m.header];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== "" && out[m.internalField] === undefined) out[m.internalField] = s;
  }
  return out;
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false;
  return /^(1|true|yes|y|explicit|да|истина)$/i.test(v.trim());
}
function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
/** "3:45" → 225, "225" → 225, "3:45.5" → 225. */
function parseDuration(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(\d+):(\d{1,2})/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return null;
}

type TrackFields = {
  trackTitle?: string; trackVersion?: string; isrc?: string;
  trackNumber?: string; explicit?: string; duration?: string;
  language?: string; featuredArtists?: string;
};
type ReleaseGroup = {
  upc: string; title: string; primaryArtist: string;
  label?: string; releaseDate?: string; genre?: string; subgenre?: string;
  pLine?: string; cLine?: string; coverUrl?: string; language?: string;
  releaseVersion?: string;
  tracks: TrackFields[];
};

/** Группирует построчные (трек-уровневые) записи в релизы по UPC либо title+artist. */
function groupReleases(fieldRows: Record<string, string>[]): ReleaseGroup[] {
  const groups = new Map<string, ReleaseGroup>();
  for (const r of fieldRows) {
    const upc = (r.upc ?? "").trim();
    const title = (r.title ?? "").trim();
    const primaryArtist = (r.primaryArtist ?? "").trim();
    if (!title && !upc) continue; // строка без опознавательных полей — пропускаем
    const key = upc ? `upc:${upc}` : `ta:${normalizeHeader(title)}|${normalizeHeader(primaryArtist)}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        upc, title, primaryArtist,
        label: r.label, releaseDate: r.releaseDate, genre: r.genre, subgenre: r.subgenre,
        pLine: r.pLine, cLine: r.cLine, coverUrl: r.coverUrl, language: r.language,
        releaseVersion: r.releaseVersion,
        tracks: [],
      };
      groups.set(key, g);
    }
    g.tracks.push({
      trackTitle: r.trackTitle ?? r.title,
      trackVersion: r.trackVersion,
      isrc: r.isrc,
      trackNumber: r.trackNumber,
      explicit: r.explicit,
      duration: r.duration,
      language: r.language,
      featuredArtists: r.featuredArtists,
    });
  }
  return [...groups.values()];
}

type Flag = { code: string; severity: "error" | "warning"; message: string };

/** Прогоняет проверки безопасности по всем группам. Возвращает флаги по индексу группы. */
async function runSafetyChecks(groups: ReleaseGroup[], labelId: number): Promise<Flag[][]> {
  const upcs = groups.map((g) => g.upc).filter((u) => !!u);
  const isrcs = groups.flatMap((g) => g.tracks.map((t) => (t.isrc ?? "").trim()).filter(Boolean));

  const existingByUpc = new Map<string, { id: number; labelId: number | null }>();
  if (upcs.length > 0) {
    const rows = await db.select({ id: releasesTable.id, upc: releasesTable.upc, labelId: releasesTable.labelId })
      .from(releasesTable).where(inArray(releasesTable.upc, upcs));
    for (const row of rows) if (row.upc) existingByUpc.set(row.upc, { id: row.id, labelId: row.labelId });
  }
  const deliveredReleaseIds = new Set<number>();
  const existingReleaseIds = [...existingByUpc.values()].map((v) => v.id);
  if (existingReleaseIds.length > 0) {
    const drows = await db.select({ releaseId: deliveriesTable.releaseId })
      .from(deliveriesTable).where(inArray(deliveriesTable.releaseId, existingReleaseIds));
    for (const d of drows) if (d.releaseId != null) deliveredReleaseIds.add(d.releaseId);
  }
  const existingIsrcs = new Set<string>();
  if (isrcs.length > 0) {
    const trows = await db.select({ isrc: tracksTable.isrc }).from(tracksTable).where(inArray(tracksTable.isrc, isrcs));
    for (const t of trows) if (t.isrc) existingIsrcs.add(t.isrc);
  }

  return groups.map((g) => {
    const flags: Flag[] = [];
    if (!g.upc) {
      flags.push({ code: "missing_upc", severity: "error", message: "Нет оригинального UPC — при переносе каталога код обязателен (создавать новый нельзя)." });
    } else {
      const ex = existingByUpc.get(g.upc);
      if (ex) {
        flags.push({ code: "upc_exists", severity: "error", message: `Релиз с UPC ${g.upc} уже есть в каталоге — повторный перенос заблокирован.` });
        if (deliveredReleaseIds.has(ex.id)) flags.push({ code: "already_delivered", severity: "error", message: "Этот релиз уже был доставлен на площадки." });
        if (ex.labelId != null && ex.labelId !== labelId) flags.push({ code: "other_label", severity: "error", message: "Релиз принадлежит другому лейблу-аккаунту." });
      }
    }
    // Перенос каталога → у каждого трека обязан быть оригинальный ISRC (создавать новый нельзя).
    const missingIsrc = g.tracks.filter((t) => !t.isrc || !t.isrc.trim()).length;
    if (missingIsrc > 0) flags.push({ code: "missing_isrc", severity: "error", message: `Треков без оригинального ISRC: ${missingIsrc} — при переносе ISRC обязателен (новый код создавать нельзя).` });
    const dupIsrc = g.tracks.filter((t) => t.isrc && existingIsrcs.has(t.isrc.trim())).length;
    if (dupIsrc > 0) flags.push({ code: "isrc_exists", severity: "error", message: `Треков с уже существующим в каталоге ISRC: ${dupIsrc} — повторный импорт заблокирован (дубликат записи).` });
    if (!g.primaryArtist) flags.push({ code: "missing_artist", severity: "warning", message: "Не указан основной артист — будет создан «Unknown Artist»." });
    if (g.tracks.length === 0) flags.push({ code: "no_tracks", severity: "error", message: "У релиза нет треков." });
    return flags;
  });
}

const isBlocking = (flags: Flag[]) => flags.some((f) => f.severity === "error");

// ── Endpoints ───────────────────────────────────────────────────────────────

router.get("/catalog/metadata-aliases", async (_req, res): Promise<void> => {
  const rows = await db.select().from(metadataFieldAliasesTable).orderBy(metadataFieldAliasesTable.internalField);
  res.json({ internalFields: INTERNAL_FIELDS, aliases: rows });
});

router.post("/catalog/metadata-import/preview", uploadSingle("file"), async (req, res): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: "Файл не загружен (поле 'file')" }); return; }
    const source = String(req.body.source ?? "").trim();
    const sourceKey = source === "auto" ? "" : source;
    const labelId = parseInt(String(req.body.labelId ?? ""), 10);
    const overrides: Record<string, string> = safeJson(req.body.mapping);

    const { headers, rows } = parseWorkbook(req.file.buffer);
    if (headers.length === 0 || rows.length === 0) { res.status(400).json({ error: "Файл пуст или не содержит строк данных." }); return; }

    const aliasMap = await buildAliasMap(sourceKey);
    const mapping = resolveMapping(headers, aliasMap, overrides);
    const fieldRows = rows.map((r) => rowToFields(r, mapping));
    const groups = groupReleases(fieldRows);

    const flagsByGroup = Number.isFinite(labelId)
      ? await runSafetyChecks(groups, labelId)
      : groups.map(() => [] as Flag[]);

    const releases = groups.map((g, i) => ({
      upc: g.upc || null,
      title: g.title,
      primaryArtist: g.primaryArtist || null,
      trackCount: g.tracks.length,
      flags: flagsByGroup[i],
      willImport: Number.isFinite(labelId) && !isBlocking(flagsByGroup[i]),
    }));

    res.json({
      fileName: req.file.originalname,
      source,
      totalRows: rows.length,
      totalReleases: groups.length,
      importable: releases.filter((r) => r.willImport).length,
      skipped: releases.filter((r) => !r.willImport).length,
      needsLabel: !Number.isFinite(labelId),
      columns: mapping,
      unknownColumns: mapping.filter((m) => !m.known).map((m) => m.header),
      internalFields: INTERNAL_FIELDS,
      releases,
    });
  } catch (e: any) {
    req.log?.warn({ err: e?.message }, "metadata-import preview failed");
    res.status(400).json({ error: e?.message ?? "Не удалось разобрать файл" });
  }
});

router.post("/catalog/metadata-import/commit", uploadSingle("file"), async (req, res): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: "Файл не загружен (поле 'file')" }); return; }
    const source = String(req.body.source ?? "").trim();
    const sourceKey = source === "auto" ? "" : source;
    const labelId = parseInt(String(req.body.labelId ?? ""), 10);
    if (!Number.isFinite(labelId)) { res.status(400).json({ error: "Не выбран лейбл-аккаунт для импорта." }); return; }
    const overrides: Record<string, string> = safeJson(req.body.mapping);
    const saveAliases = String(req.body.saveAliases ?? "").toLowerCase() === "true";
    const sessionUserId = req.session?.user?.id ?? null;

    const [label] = await db.select().from(labelsTable).where(eq(labelsTable.id, labelId));
    if (!label) { res.status(404).json({ error: "Лейбл-аккаунт не найден." }); return; }

    const { headers, rows } = parseWorkbook(req.file.buffer);
    if (headers.length === 0 || rows.length === 0) { res.status(400).json({ error: "Файл пуст или не содержит строк данных." }); return; }

    const aliasMap = await buildAliasMap(sourceKey);
    const mapping = resolveMapping(headers, aliasMap, overrides);
    const fieldRows = rows.map((r) => rowToFields(r, mapping));
    const groups = groupReleases(fieldRows);
    const flagsByGroup = await runSafetyChecks(groups, labelId);

    // Сохраняем подтверждённые новые алиасы (ручное сопоставление) — навсегда.
    let savedAliases = 0;
    if (saveAliases) {
      const toSave = Object.entries(overrides)
        .filter(([, field]) => field && field !== "ignore" && FIELD_KEYS.has(field))
        .map(([header, field]) => ({ alias: normalizeHeader(header), internalField: field, source: sourceKey, createdById: sessionUserId }))
        .filter((a) => a.alias !== "");
      if (toSave.length > 0) {
        const r = await db.insert(metadataFieldAliasesTable).values(toSave).onConflictDoNothing().returning({ id: metadataFieldAliasesTable.id });
        savedAliases = r.length;
      }
    }

    let imported = 0, skipped = 0, createdTracks = 0;
    const errors: { title: string; reason: string }[] = [];

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (isBlocking(flagsByGroup[i])) {
        skipped++;
        continue;
      }
      try {
        const anyExplicit = g.tracks.some((t) => parseBool(t.explicit));
        const created = await db.transaction(async (tx) => {
          const artistName = g.primaryArtist || "Unknown Artist";
          // Ищем артиста ТОЛЬКО в пределах выбранного лейбла — иначе имя-однофамилец
          // из чужого лейбла привяжет релиз к чужому артисту (нарушение изоляции данных).
          const [existingArtist] = await tx.select().from(artistsTable)
            .where(and(ilike(artistsTable.name, artistName), eq(artistsTable.labelId, labelId))).limit(1);
          let artistId: number;
          if (existingArtist) {
            artistId = existingArtist.id;
          } else {
            const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `artist-${Date.now()}`;
            const [a] = await tx.insert(artistsTable).values({ name: artistName, slug, labelId, status: "active" }).returning();
            artistId = a.id;
          }

          const [release] = await tx.insert(releasesTable).values({
            title: g.title || "Untitled",
            releaseVersion: g.releaseVersion ?? null,
            releaseType: g.tracks.length > 1 ? "album" : "single",
            status: "draft",
            upc: g.upc || null,
            artistId,
            labelId,
            coverUrl: g.coverUrl ?? null,
            genre: g.genre ?? null,
            subgenre: g.subgenre ?? null,
            releaseDate: g.releaseDate ?? null,
            language: g.language ?? null,
            isExplicit: anyExplicit,
            pLine: g.pLine ?? null,
            pLineYear: yearFromLine(g.pLine),
            cLine: g.cLine ?? null,
            cLineYear: yearFromLine(g.cLine ?? g.pLine),
            // Перенос каталога → в Broma16 уйдёт isTransferRelease=true и сработает
            // запрет на генерацию новых UPC/ISRC.
            isTransfer: true,
            statusNote: `Массовый импорт каталога${source && source !== "auto" ? ` (${source})` : ""}`,
          }).returning();

          // Заносим главного артиста в release_artists — без этого MultiArtistPicker пуст.
          await tx.insert(releaseArtistsTable).values({
            releaseId: release.id,
            artistId,
            role: "primary",
            position: 0,
          }).onConflictDoNothing();

          const trackRows = g.tracks.slice(0, 100).map((t, idx) => ({
            title: t.trackTitle || g.title || "Untitled",
            trackVersion: t.trackVersion ?? null,
            releaseId: release.id,
            artistId,
            trackNumber: parseIntOrNull(t.trackNumber) ?? idx + 1,
            isrc: t.isrc ?? null,
            isExplicit: parseBool(t.explicit),
            language: t.language ?? g.language ?? null,
            durationSeconds: parseDuration(t.duration),
          }));
          await tx.insert(tracksTable).values(trackRows);
          return { release, trackCount: trackRows.length };
        });

        void auditMutation(req, { action: "create", entityType: "release", entityId: created.release.id, before: null, after: created.release });
        imported++;
        createdTracks += created.trackCount;
      } catch (e: any) {
        skipped++;
        errors.push({ title: g.title || g.upc || "—", reason: /23505|duplicate/i.test(String(e?.message)) ? "Дубликат (UPC уже существует)" : (e?.message ?? "Ошибка вставки") });
      }
    }

    res.status(201).json({ imported, skipped, createdTracks, savedAliases, labelName: label.name, errors });
  } catch (e: any) {
    req.log?.warn({ err: e?.message }, "metadata-import commit failed");
    res.status(400).json({ error: e?.message ?? "Не удалось выполнить импорт" });
  }
});

function safeJson(raw: unknown): Record<string, string> {
  if (!raw) return {};
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export default router;
