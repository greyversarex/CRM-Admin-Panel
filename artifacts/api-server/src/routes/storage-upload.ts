// ─── Streaming PUT endpoint for presigned uploads ──────────────────────────
//
// Принимает PUT, выданный через ObjectStorageService.createUpload().
// Аутентификация — HMAC-токен в query (?exp=&max=&sig=), без cookie/сессии.
// Hard cap по байтам зашит в подпись, поэтому клиент не может его подделать.
// Тело пишется потоком в `<LOCAL_STORAGE_ROOT>/<PRIVATE_OBJECT_DIR>/uploads/<uuid>`
// с настоящим backpressure через stream.pipeline().

import { Router } from "express";
import {
  streamUploadToObject,
  verifyUploadToken,
  PayloadTooLargeError,
} from "../lib/objectStorage";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABSOLUTE_MAX_BYTES = 250 * 1024 * 1024; // самый верхний потолок (audio = 200 МБ)

router.put("/storage/upload/:objectId", async (req, res): Promise<void> => {
  const objectId = String(req.params.objectId ?? "");
  if (!UUID_RE.test(objectId)) {
    res.status(400).json({ error: "Invalid object id" });
    return;
  }

  const expMs = Number(req.query.exp ?? "");
  const maxBytes = Number(req.query.max ?? "");
  const sig = String(req.query.sig ?? "");
  if (!Number.isFinite(expMs) || !Number.isFinite(maxBytes) || !sig) {
    res.status(400).json({ error: "Missing or invalid signature" });
    return;
  }
  if (maxBytes <= 0 || maxBytes > ABSOLUTE_MAX_BYTES) {
    res.status(400).json({ error: "Invalid size cap" });
    return;
  }
  if (!verifyUploadToken(objectId, expMs, maxBytes, sig)) {
    res.status(403).json({ error: "Invalid or expired upload token" });
    return;
  }

  // Pre-check Content-Length, если клиент его прислал — отрезаем заведомо
  // большие запросы до открытия write-стрима.
  const lenHeader = req.headers["content-length"];
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > maxBytes) {
      res.status(413).json({ error: "Payload too large" });
      return;
    }
  }

  const contentType =
    typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : null;

  try {
    const { size } = await streamUploadToObject(objectId, req, maxBytes, contentType);
    if (!size) {
      res.status(400).json({ error: "Empty upload" });
      return;
    }
    res.status(200).json({ ok: true, size });
  } catch (err: any) {
    if (err instanceof PayloadTooLargeError) {
      if (!res.headersSent) res.status(413).json({ error: "Payload too large" });
      return;
    }
    req.log?.error({ err }, "[storage-upload] save failed");
    if (!res.headersSent) res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
