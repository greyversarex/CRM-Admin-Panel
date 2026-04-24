import { Router, type RequestHandler, type Response } from "express";
import multer from "multer";
import * as os from "os";
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

export default router;
