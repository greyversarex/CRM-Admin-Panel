import { Router } from "express";
import multer from "multer";
import { previewImport, commitImport, listImports, ExistingTransactionsError } from "../services/ingestion/service";
import { TooManyRowsError } from "../services/ingestion/utils";
import { auditMutation } from "../lib/audit";

const router = Router();

// memoryStorage достаточно: max 50MB, csv-parse/sync парсит из буфера за O(n).
// Для файлов >10MB это всё ещё быстрее чем диск + не оставляет tmp-файлов.
const MAX_BYTES = 50 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/** Обёртка над `upload.single` чтобы multer-ошибки (LIMIT_FILE_SIZE и др.) НЕ
 * проваливались в глобальный error-handler Express, а попадали в наш доменный
 * маппер 4xx. Multer-middleware вызывает `next(err)` ДО входа в async-handler,
 * поэтому try/catch внутри handler'а не помогает. */
function uploadSingle(field: string): import("express").RequestHandler {
  const middleware = upload.single(field);
  return (req, res, next) => {
    middleware(req, res, (err: any) => {
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
        res.status(400).json({ error: err?.message ?? "Upload failed" });
        return;
      }
      next();
    });
  };
}

/** Маппинг доменных ошибок ingestion-сервиса в HTTP-коды.
 * Возвращает true если ошибка обработана (response отправлен), иначе false. */
function handleIngestionError(err: any, res: import("express").Response): boolean {
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

router.post("/finance/ingest/preview", uploadSingle("file"), async (req, res): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: "Missing file (multipart field 'file')" }); return; }
    const dsp = String(req.body.dsp ?? "");
    if (!dsp) { res.status(400).json({ error: "Missing 'dsp' field" }); return; }

    const result = await previewImport(req.file.buffer, dsp);
    res.json(result);
  } catch (err: any) {
    req.log?.warn({ err: err?.message }, "ingest preview failed");
    if (handleIngestionError(err, res)) return;
    res.status(400).json({ error: err?.message ?? "Preview failed" });
  }
});

router.post("/finance/ingest/commit", uploadSingle("file"), async (req, res): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: "Missing file (multipart field 'file')" }); return; }
    const dsp = String(req.body.dsp ?? "");
    const period = String(req.body.period ?? "");
    if (!dsp || !period) { res.status(400).json({ error: "Missing 'dsp' or 'period' field" }); return; }
    // Сознательное подтверждение «correction import» при наличии уже существующих
    // transactions — иначе commitImport бросит ExistingTransactionsError → 409.
    const force = String(req.body.force ?? "").toLowerCase() === "true";

    const sessionUserId = (req as any).session?.user?.id ?? null;
    const result = await commitImport({
      buffer: req.file.buffer,
      dsp,
      period,
      filename: req.file.originalname || "upload.csv",
      uploadedBy: sessionUserId,
      force,
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
          idempotencyKey: "[redacted-hash]",
          createdAt: new Date().toISOString(),
        },
      });
    }

    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err: any) {
    req.log?.warn({ err: err?.message }, "ingest commit failed");
    if (handleIngestionError(err, res)) return;
    res.status(400).json({ error: err?.message ?? "Commit failed" });
  }
});

router.get("/finance/imports", async (_req, res): Promise<void> => {
  const limit = Math.min(parseInt((_req.query.limit as string) ?? "20", 10) || 20, 100);
  const rows = await listImports(limit);
  res.json(rows);
});

export default router;
