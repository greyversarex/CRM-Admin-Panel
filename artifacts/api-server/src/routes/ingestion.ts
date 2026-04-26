import { Router, type RequestHandler, type Response } from "express";
import multer from "multer";
import * as os from "os";
import {
  db,
  ingestionUnmatchedTable,
  ingestionImportsTable,
  tracksTable,
  releasesTable,
  artistsTable,
  transactionsTable,
  usageReportsTable,
} from "@workspace/db";
import { and, eq, desc, sql, ilike, or, inArray } from "drizzle-orm";
import { previewImport, commitImport, listImports, ExistingTransactionsError } from "../services/ingestion/service";
import { TooManyRowsError } from "../services/ingestion/utils";
import { safeUnlink } from "../services/ingestion/streaming";
import { auditMutation } from "../lib/audit";

const router = Router();

// Disk storage: файлы >10МБ НЕ загружаются в RAM целиком — multer пишет на диск
// чанками, парсер потом стримит обратно с диска (см. services/ingestion/streaming.ts).
// Это критично для больших CSV (50МБ × 200K rows): peak-RAM остаётся predictable.
const MAX_BYTES = 50 * 1024 * 1024;
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      // Уникальное имя чтобы concurrent-uploads не пересеклись.
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      cb(null, `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`);
    },
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/** Извлекает текст ошибки безопасно из unknown-значения. */
function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

/** Обёртка над `upload.single` чтобы multer-ошибки (LIMIT_FILE_SIZE и др.) НЕ
 * проваливались в глобальный error-handler Express, а попадали в наш доменный
 * маппер 4xx. Multer-middleware вызывает `next(err)` ДО входа в async-handler,
 * поэтому try/catch внутри handler'а не помогает. */
function uploadSingle(field: string): RequestHandler {
  const middleware = upload.single(field);
  return (req, res, next) => {
    middleware(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({
            error: `Файл превышает лимит ${MAX_BYTES / 1024 / 1024}МБ`,
            code: "file_too_large",
          });
          return;
        }
        if (err instanceof multer.MulterError) {
          res.status(400).json({ error: err.message, code: err.code });
          return;
        }
        // Сторонние ошибки multer (например LIMIT_UNEXPECTED_FILE) — 400.
        res.status(400).json({ error: errMsg(err) });
        return;
      }
      next();
    });
  };
}

/** Маппинг доменных ошибок ingestion-сервиса в HTTP-коды.
 * Возвращает true если ошибка обработана (response отправлен), иначе false. */
function handleIngestionError(err: unknown, res: Response): boolean {
  if (err instanceof TooManyRowsError) {
    res.status(413).json({ error: err.message, code: "too_many_rows", totalRows: err.totalRows });
    return true;
  }
  if (err instanceof ExistingTransactionsError) {
    res.status(409).json({
      error: err.message,
      code: "existing_transactions",
      dsp: err.dsp,
      period: err.period,
      existingTransactions: err.count,
    });
    return true;
  }
  return false;
}

/** Валидирует client-provided idempotencyKey: 8..200 символов, только safe-charset. */
function validateClientIdempotencyKey(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw);
  if (s.length < 8 || s.length > 200) {
    throw new Error("idempotencyKey must be 8..200 chars");
  }
  if (!/^[A-Za-z0-9._:\-]+$/.test(s)) {
    throw new Error("idempotencyKey contains invalid characters");
  }
  return s;
}

router.post("/finance/ingest/preview", uploadSingle("file"), async (req, res): Promise<void> => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file || !tmpPath) { res.status(400).json({ error: "Missing file (multipart field 'file')" }); return; }
    const dsp = String(req.body.dsp ?? "");
    if (!dsp) { res.status(400).json({ error: "Missing 'dsp' field" }); return; }

    const result = await previewImport(tmpPath, dsp);
    res.json(result);
  } catch (err: unknown) {
    req.log?.warn({ err: errMsg(err) }, "ingest preview failed");
    if (handleIngestionError(err, res)) return;
    res.status(400).json({ error: errMsg(err) });
  } finally {
    if (tmpPath) await safeUnlink(tmpPath);
  }
});

router.post("/finance/ingest/commit", uploadSingle("file"), async (req, res): Promise<void> => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file || !tmpPath) { res.status(400).json({ error: "Missing file (multipart field 'file')" }); return; }
    const dsp = String(req.body.dsp ?? "");
    const period = String(req.body.period ?? "");
    if (!dsp || !period) { res.status(400).json({ error: "Missing 'dsp' or 'period' field" }); return; }
    // Сознательное подтверждение «correction import» при наличии уже существующих
    // transactions — иначе commitImport бросит ExistingTransactionsError → 409.
    const force = String(req.body.force ?? "").toLowerCase() === "true";
    // Опциональный client-provided idempotencyKey (контракт OpenAPI). Если не
    // передан — service.ts вычислит server-side из sha256(file)+dsp+period.
    const clientIdempotencyKey = validateClientIdempotencyKey(req.body.idempotencyKey);

    const sessionUserId = req.session?.user?.id ?? null;
    const result = await commitImport({
      filePath: tmpPath,
      dsp,
      period,
      filename: req.file.originalname || "upload.csv",
      uploadedBy: sessionUserId,
      force,
      idempotencyKey: clientIdempotencyKey,
    });

    if (!result.duplicate) {
      void auditMutation(req, {
        action: "create",
        entityType: "ingestion",
        entityId: result.importId,
        before: null,
        after: {
          id: result.importId,
          dsp,
          period: result.period,
          filename: req.file.originalname,
          uploadedBy: sessionUserId,
          totalRows: result.inserted + result.unmatched,
          insertedRows: result.inserted,
          unmatchedRows: result.unmatched,
          totalRevenue: result.totalRevenue.toFixed(4),
          currency: result.currency,
          idempotencyKey: clientIdempotencyKey ? "[client-provided]" : "[redacted-hash]",
          createdAt: new Date().toISOString(),
        },
      });
    }

    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err: unknown) {
    req.log?.warn({ err: errMsg(err) }, "ingest commit failed");
    if (handleIngestionError(err, res)) return;
    res.status(400).json({ error: errMsg(err) });
  } finally {
    if (tmpPath) await safeUnlink(tmpPath);
  }
});

router.get("/finance/imports", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 100);
  const rows = await listImports(limit);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// Unmatched rows: ручное сопоставление "потерянных" строк CSV с треком в БД.
// Доступ — только admin/manager (router.use("/finance/ingest", adminOnly) выше).
//
// Жизненный цикл строки:
//   ingest commit  →  ISRC не найден  →  INSERT в ingestion_unmatched (resolved=false)
//                                           ↓
//                               GET /finance/ingest/unmatched (status=pending)
//                                           ↓
//                              POST /finance/ingest/unmatched/:id/resolve { trackId }
//                                           ↓
//             tx: + usage_reports (ON CONFLICT DO NOTHING) + transactions + resolved=true
//                  + bump parent ingestion_imports counters (insertedRows / unmatchedRows / totalRevenue)
// ─────────────────────────────────────────────────────────────────────────────

interface UnmatchedListRow {
  id: number;
  importId: number;
  dsp: string;
  period: string;
  rawIsrc: string | null;
  rawTitle: string | null;
  rawArtist: string | null;
  revenue: number;
  currency: string;
  countryCode: string | null;
  streams: number;
  resolved: boolean;
  createdAt: string;
  filename: string | null; // из родительского импорта — UI показывает откуда строка
}

router.get("/finance/ingest/unmatched", async (req, res): Promise<void> => {
  const status = String(req.query.status ?? "pending"); // pending | resolved | all
  const importIdRaw = req.query.import_id;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10) || 100, 500);
  const offset = Math.max(parseInt((req.query.offset as string) ?? "0", 10) || 0, 0);

  const conds: any[] = [];
  if (status === "pending")  conds.push(eq(ingestionUnmatchedTable.resolved, false));
  if (status === "resolved") conds.push(eq(ingestionUnmatchedTable.resolved, true));
  if (importIdRaw !== undefined) {
    const n = parseInt(String(importIdRaw), 10);
    if (!Number.isFinite(n)) { res.status(400).json({ error: "Invalid import_id" }); return; }
    conds.push(eq(ingestionUnmatchedTable.importId, n));
  }
  if (q) {
    const like = `%${q}%`;
    // ISRC хранится как заглавные → ищем case-insensitive по любым трём колонкам.
    conds.push(or(
      ilike(ingestionUnmatchedTable.rawIsrc, like),
      ilike(ingestionUnmatchedTable.rawTitle, like),
      ilike(ingestionUnmatchedTable.rawArtist, like),
    ));
  }

  // Считаем total отдельным запросом — pagination в UI.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ingestionUnmatchedTable)
    .where(conds.length > 0 ? and(...conds) : undefined);

  // Aggregate: суммарный «потерянный» доход среди pending — для KPI-карточки.
  const [{ pendingRevenue }] = await db
    .select({ pendingRevenue: sql<string>`COALESCE(SUM(${ingestionUnmatchedTable.revenue}), 0)::text` })
    .from(ingestionUnmatchedTable)
    .where(eq(ingestionUnmatchedTable.resolved, false));

  const rows = await db
    .select({
      id: ingestionUnmatchedTable.id,
      importId: ingestionUnmatchedTable.importId,
      dsp: ingestionUnmatchedTable.dsp,
      period: ingestionUnmatchedTable.period,
      rawIsrc: ingestionUnmatchedTable.rawIsrc,
      rawTitle: ingestionUnmatchedTable.rawTitle,
      rawArtist: ingestionUnmatchedTable.rawArtist,
      revenue: ingestionUnmatchedTable.revenue,
      currency: ingestionUnmatchedTable.currency,
      countryCode: ingestionUnmatchedTable.countryCode,
      streams: ingestionUnmatchedTable.streams,
      resolved: ingestionUnmatchedTable.resolved,
      createdAt: ingestionUnmatchedTable.createdAt,
      filename: ingestionImportsTable.filename,
    })
    .from(ingestionUnmatchedTable)
    .leftJoin(ingestionImportsTable, eq(ingestionImportsTable.id, ingestionUnmatchedTable.importId))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(ingestionUnmatchedTable.createdAt), desc(ingestionUnmatchedTable.id))
    .limit(limit)
    .offset(offset);

  const data: UnmatchedListRow[] = rows.map(r => ({
    id: r.id,
    importId: r.importId,
    dsp: r.dsp,
    period: r.period,
    rawIsrc: r.rawIsrc,
    rawTitle: r.rawTitle,
    rawArtist: r.rawArtist,
    revenue: parseFloat(r.revenue),
    currency: r.currency,
    countryCode: r.countryCode,
    streams: r.streams,
    resolved: r.resolved,
    createdAt: r.createdAt.toISOString(),
    filename: r.filename ?? null,
  }));

  res.json({
    data,
    pagination: { total: Number(total), limit, offset },
    pendingRevenue: parseFloat(pendingRevenue),
  });
});

// Поиск треков для пикера в диалоге сопоставления.
// Ищем по ISRC (точно/часть), названию трека и имени артиста.
router.get("/finance/ingest/track-search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) { res.json([]); return; }
  const like = `%${q}%`;
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 50);

  const rows = await db
    .select({
      id: tracksTable.id,
      title: tracksTable.title,
      isrc: tracksTable.isrc,
      releaseId: tracksTable.releaseId,
      releaseTitle: releasesTable.title,
      artistId: tracksTable.artistId,
      artistName: artistsTable.name,
    })
    .from(tracksTable)
    .leftJoin(releasesTable, eq(releasesTable.id, tracksTable.releaseId))
    .leftJoin(artistsTable, eq(artistsTable.id, tracksTable.artistId))
    .where(or(
      ilike(tracksTable.isrc, like),
      ilike(tracksTable.title, like),
      ilike(artistsTable.name, like),
    ))
    .orderBy(desc(tracksTable.id))
    .limit(limit);

  res.json(rows);
});

router.post("/finance/ingest/unmatched/:id/resolve", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const trackId = Number(req.body?.trackId);
  if (!Number.isFinite(trackId)) { res.status(400).json({ error: "trackId required (number)" }); return; }

  // Загружаем сразу всё, что нужно ДО транзакции — чтобы внутри tx не было лишних round-trip.
  const [unmatched] = await db.select().from(ingestionUnmatchedTable).where(eq(ingestionUnmatchedTable.id, id));
  if (!unmatched) { res.status(404).json({ error: "Unmatched row not found" }); return; }
  if (unmatched.resolved) { res.status(409).json({ error: "Уже сопоставлено", code: "already_resolved" }); return; }

  const [track] = await db
    .select({
      id: tracksTable.id,
      title: tracksTable.title,
      releaseId: tracksTable.releaseId,
      artistId: tracksTable.artistId,
    })
    .from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!track) { res.status(400).json({ error: "Трек не найден", code: "track_not_found" }); return; }

  // labelId берём из релиза (single source of truth для belonging-к-лейблу).
  let labelId: number | null = null;
  if (track.releaseId) {
    const [rel] = await db.select({ labelId: releasesTable.labelId }).from(releasesTable).where(eq(releasesTable.id, track.releaseId));
    labelId = rel?.labelId ?? null;
  }

  const revenue = parseFloat(unmatched.revenue);
  let transactionId: number | null = null;
  let usageInserted = false;
  let alreadyAccounted = false;
  let raceLost = false;

  // Sentinel-ошибка для отката транзакции при проигранной гонке.
  class RaceLostError extends Error { constructor() { super("race_lost"); } }

  try {
    await db.transaction(async (tx) => {
      // АТОМИЧНЫЙ CLAIM: ровно один параллельный запрос «захватывает» строку.
      // Условный UPDATE ... WHERE resolved=false RETURNING заменяет SELECT-then-UPDATE,
      // исключая TOCTOU-гонку без явного SELECT FOR UPDATE. Если RETURNING пусто —
      // нас опередил другой запрос; бросаем sentinel чтобы откатить ВСЁ
      // (counters/usage_reports/transactions) — никаких побочных эффектов.
      const claimed = await tx
        .update(ingestionUnmatchedTable)
        .set({ resolved: true })
        .where(and(
          eq(ingestionUnmatchedTable.id, unmatched.id),
          eq(ingestionUnmatchedTable.resolved, false),
        ))
        .returning({ id: ingestionUnmatchedTable.id });

      if (claimed.length === 0) {
        raceLost = true;
        throw new RaceLostError();
      }

      // ИДЕМПОТЕНТНОСТЬ revenue: usage_reports имеет UNIQUE (platform, period, trackId, country).
      // Если такая строка УЖЕ есть (например, в этот же период за тот же трек уже
      // прошёл импорт через mainline-путь), ON CONFLICT DO NOTHING вернёт пустоту →
      // НЕ создаём transactions (иначе двойной учёт). Строка всё равно помечена resolved=true.
      const insertedUsage = await tx
        .insert(usageReportsTable)
        .values({
          artistId: track.artistId,
          releaseId: track.releaseId,
          trackId: track.id,
          platform: unmatched.dsp,
          period: unmatched.period,
          streams: unmatched.streams,
          revenue: unmatched.revenue,
          countryCode: unmatched.countryCode,
        })
        .onConflictDoNothing()
        .returning({ id: usageReportsTable.id });

      usageInserted = insertedUsage.length > 0;
      alreadyAccounted = !usageInserted;

      if (usageInserted && track.releaseId && revenue > 0) {
        // Создаём отдельную транзакцию-проводку. Помечаем source='ingestion' +
        // importId родительского импорта — для трассируемости в /finance.
        const [insertedTx] = await tx.insert(transactionsTable).values({
          type: "dsp_revenue",
          amount: unmatched.revenue,
          currency: unmatched.currency,
          artistId: track.artistId,
          labelId,
          releaseId: track.releaseId,
          platform: unmatched.dsp,
          description: `Manual match: unmatched #${unmatched.id} → track #${track.id}`,
          period: unmatched.period,
          source: "ingestion",
          importId: unmatched.importId,
        }).returning({ id: transactionsTable.id });
        transactionId = insertedTx?.id ?? null;
      }

      // Обновляем счётчики родительского импорта ТОЛЬКО в claimer-пути (мы внутри tx после успешного claim):
      //   - unmatched_rows -1 (строка ушла из pending-очереди)
      //   - inserted_rows  +1 и total_revenue +revenue ТОЛЬКО если реально создали usage(+transaction)
      if (usageInserted) {
        await tx.update(ingestionImportsTable).set({
          unmatchedRows: sql`GREATEST(${ingestionImportsTable.unmatchedRows} - 1, 0)`,
          insertedRows:  sql`${ingestionImportsTable.insertedRows} + 1`,
          totalRevenue:  sql`${ingestionImportsTable.totalRevenue} + ${unmatched.revenue}::numeric`,
        }).where(eq(ingestionImportsTable.id, unmatched.importId));
      } else {
        await tx.update(ingestionImportsTable).set({
          unmatchedRows: sql`GREATEST(${ingestionImportsTable.unmatchedRows} - 1, 0)`,
        }).where(eq(ingestionImportsTable.id, unmatched.importId));
      }
    });
  } catch (err) {
    if (err instanceof RaceLostError || raceLost) {
      res.status(409).json({ error: "Уже сопоставлено", code: "already_resolved" });
      return;
    }
    throw err;
  }

  void auditMutation(req, {
    action: "update",
    entityType: "ingestion_unmatched",
    entityId: unmatched.id,
    before: { resolved: false, trackId: null },
    after:  { resolved: true, trackId: track.id, transactionId, alreadyAccounted },
  });

  res.json({
    ok: true,
    unmatchedId: unmatched.id,
    trackId: track.id,
    transactionId,
    alreadyAccounted,  // true = usage за тот же период/трек уже был, новой транзакции НЕ создано
    revenue,
    currency: unmatched.currency,
  });
});

export default router;
