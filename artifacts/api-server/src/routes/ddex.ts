/**
 * DDEX API routes — публичный интерфейс к новому пайплайну.
 *
 * Группы:
 *   GET    /ddex/messages                            — список + фильтры
 *   GET    /ddex/messages/:id                        — детальная карточка (msg + batch + acks)
 *   GET    /ddex/messages/:id/xml                    — отдаёт сырой ERN XML (Content-Type=application/xml)
 *   POST   /ddex/messages                            — создать новое сообщение (Initial/Update/Takedown)
 *   POST   /ddex/messages/:id/send                   — пнуть отправку прямо сейчас
 *   POST   /ddex/messages/:id/cancel                 — отменить queued/validated сообщение
 *   GET    /ddex/batches                             — список batch'ей
 *   GET    /ddex/batches/:id                         — детали batch'а + входящие сообщения
 *   GET    /ddex/acknowledgements                    — журнал ack
 *   POST   /ddex/acknowledgements/inbound            — webhook для приёма ack от партнёра (без auth, HMAC)
 */

import express, { Router } from "express";
import { db, ddexMessagesTable, ddexBatchesTable, ddexAcknowledgementsTable, releasesTable } from "@workspace/db";
import { and, eq, desc, count, type SQL } from "drizzle-orm";
import { z } from "zod";
import { auditMutation } from "../lib/audit";
import { logger } from "../lib/logger";
import { createMessage, processMessage, ingestAck, getMessageDetail } from "../ddex/service";
import { listTransports } from "../ddex/transports";
import { createHmac, timingSafeEqual } from "node:crypto";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toMessageDto(m: typeof ddexMessagesTable.$inferSelect & { releaseTitle?: string | null }) {
  return {
    id: m.id,
    messageRef: m.messageRef,
    messageThreadId: m.messageThreadId,
    releaseId: m.releaseId,
    releaseTitle: m.releaseTitle ?? null,
    deliveryId: m.deliveryId,
    batchId: m.batchId,
    partnerCode: m.partnerCode,
    messageType: m.messageType,
    updateIndicator: m.updateIndicator,
    ernVersion: m.ernVersion,
    profile: m.profile,
    status: m.status,
    xmlSizeBytes: m.xmlSizeBytes,
    validationErrors: m.validationErrors ?? null,
    rejectionReason: m.rejectionReason,
    parentMessageId: m.parentMessageId,
    sentAt: isoOrNull(m.sentAt),
    ackedAt: isoOrNull(m.ackedAt),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function toBatchDto(b: typeof ddexBatchesTable.$inferSelect) {
  return {
    id: b.id,
    batchRef: b.batchRef,
    partnerCode: b.partnerCode,
    partyIdSender: b.partyIdSender,
    partyIdRecipient: b.partyIdRecipient,
    ernVersion: b.ernVersion,
    status: b.status,
    transport: b.transport,
    remotePath: b.remotePath,
    manifestFilename: b.manifestFilename,
    totalBytes: b.totalBytes,
    fileCount: b.fileCount,
    attempts: b.attempts,
    lastError: b.lastError,
    uploadedAt: isoOrNull(b.uploadedAt),
    ackReceivedAt: isoOrNull(b.ackReceivedAt),
    createdAt: b.createdAt.toISOString(),
  };
}

function toAckDto(a: typeof ddexAcknowledgementsTable.$inferSelect) {
  return {
    id: a.id,
    messageId: a.messageId,
    batchId: a.batchId,
    partnerCode: a.partnerCode,
    source: a.source,
    ackType: a.ackType,
    status: a.status,
    parsed: a.parsed ?? {},
    receivedAt: a.receivedAt.toISOString(),
  };
}

// ── GET /ddex/messages ───────────────────────────────────────────────

const ListMessagesQuery = z.object({
  status: z.enum(["draft", "validated", "invalid", "queued", "sent", "acked", "rejected", "cancelled"]).optional(),
  partnerCode: z.string().optional(),
  releaseId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

router.get("/ddex/messages", async (req, res): Promise<void> => {
  const parsed = ListMessagesQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { status, partnerCode, releaseId, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const filters: SQL[] = [];
  if (status) filters.push(eq(ddexMessagesTable.status, status));
  if (partnerCode) filters.push(eq(ddexMessagesTable.partnerCode, partnerCode));
  if (releaseId) filters.push(eq(ddexMessagesTable.releaseId, releaseId));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db.select({
    msg: ddexMessagesTable, releaseTitle: releasesTable.title,
  }).from(ddexMessagesTable)
    .leftJoin(releasesTable, eq(releasesTable.id, ddexMessagesTable.releaseId))
    .where(where).limit(limit).offset(offset)
    .orderBy(desc(ddexMessagesTable.createdAt));
  const [totalRow] = await db.select({ count: count() }).from(ddexMessagesTable).where(where);
  res.json({
    data: rows.map((r) => toMessageDto({ ...r.msg, releaseTitle: r.releaseTitle })),
    pagination: { page, limit, total: totalRow.count, totalPages: Math.ceil(totalRow.count / limit) },
  });
});

router.get("/ddex/messages/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const detail = await getMessageDetail(id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  const [release] = await db.select({ title: releasesTable.title }).from(releasesTable).where(eq(releasesTable.id, detail.message.releaseId));
  res.json({
    message: toMessageDto({ ...detail.message, releaseTitle: release?.title ?? null }),
    batch: detail.batch ? toBatchDto(detail.batch) : null,
    acknowledgements: detail.acknowledgements.map(toAckDto),
  });
});

router.get("/ddex/messages/:id/xml", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [m] = await db.select({ xmlPayload: ddexMessagesTable.xmlPayload, messageRef: ddexMessagesTable.messageRef })
    .from(ddexMessagesTable).where(eq(ddexMessagesTable.id, id)).limit(1);
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${m.messageRef}.xml"`);
  res.send(m.xmlPayload);
});

// ── POST /ddex/messages — создать ────────────────────────────────────

const CreateMessageBody = z.object({
  releaseId: z.number().int().positive(),
  partnerCode: z.string().min(1),
  updateIndicator: z.enum(["OriginalMessage", "UpdateMessage", "TakedownMessage"]).default("OriginalMessage"),
  /** sendNow=true → сразу пнуть transport.upload после создания */
  sendNow: z.boolean().default(false),
});

router.post("/ddex/messages", async (req, res): Promise<void> => {
  const parsed = CreateMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const userId = (req as { user?: { id: number } }).user?.id ?? null;

  try {
    const created = await createMessage({
      releaseId: parsed.data.releaseId,
      partnerCode: parsed.data.partnerCode,
      updateIndicator: parsed.data.updateIndicator,
      userId,
    });

    let sendResult: { ok: boolean; remotePath?: string; error?: string } | null = null;
    if (parsed.data.sendNow && created.status === "validated") {
      const r = await processMessage(created.id);
      sendResult = { ok: r.ok, remotePath: r.remotePath, error: r.error };
    }

    res.status(201).json({
      messageId: created.id,
      messageRef: created.messageRef,
      status: created.status,
      validationErrors: created.validationErrors,
      xmlBytes: created.xmlBytes,
      sendResult,
    });
  } catch (err) {
    logger.warn({ err, body: parsed.data }, "ddex createMessage failed");
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/ddex/messages/:id/send", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [before] = await db.select().from(ddexMessagesTable).where(eq(ddexMessagesTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }
  if (!["validated", "queued", "draft"].includes(before.status)) {
    res.status(409).json({ error: `Нельзя отправить сообщение в статусе ${before.status}` });
    return;
  }
  const result = await processMessage(id);
  await auditMutation(req, {
    action: "update", entityType: "ddex_message", entityId: id,
    before, after: { ...before, status: result.ok ? "sent" : before.status },
  });
  res.json(result);
});

router.post("/ddex/messages/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [before] = await db.select().from(ddexMessagesTable).where(eq(ddexMessagesTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }
  if (["sent", "acked", "rejected", "cancelled"].includes(before.status)) {
    res.status(409).json({ error: `Нельзя отменить сообщение в статусе ${before.status}` });
    return;
  }
  const [after] = await db.update(ddexMessagesTable).set({ status: "cancelled" }).where(eq(ddexMessagesTable.id, id)).returning();
  await auditMutation(req, { action: "update", entityType: "ddex_message", entityId: id, before, after });
  res.json(toMessageDto(after));
});

// ── GET /ddex/batches ────────────────────────────────────────────────

const ListBatchesQuery = z.object({
  status: z.enum(["building", "uploading", "uploaded", "acked", "partial", "rejected", "failed"]).optional(),
  partnerCode: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

router.get("/ddex/batches", async (req, res): Promise<void> => {
  const parsed = ListBatchesQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { status, partnerCode, page, limit } = parsed.data;
  const filters: SQL[] = [];
  if (status) filters.push(eq(ddexBatchesTable.status, status));
  if (partnerCode) filters.push(eq(ddexBatchesTable.partnerCode, partnerCode));
  const where = filters.length ? and(...filters) : undefined;
  const offset = (page - 1) * limit;
  const rows = await db.select().from(ddexBatchesTable).where(where).limit(limit).offset(offset).orderBy(desc(ddexBatchesTable.createdAt));
  const [totalRow] = await db.select({ count: count() }).from(ddexBatchesTable).where(where);
  res.json({
    data: rows.map(toBatchDto),
    pagination: { page, limit, total: totalRow.count, totalPages: Math.ceil(totalRow.count / limit) },
  });
});

router.get("/ddex/batches/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [batch] = await db.select().from(ddexBatchesTable).where(eq(ddexBatchesTable.id, id));
  if (!batch) { res.status(404).json({ error: "Not found" }); return; }
  const messages = await db.select().from(ddexMessagesTable).where(eq(ddexMessagesTable.batchId, id)).orderBy(ddexMessagesTable.createdAt);
  res.json({ batch: toBatchDto(batch), messages: messages.map((m) => toMessageDto(m)) });
});

// ── GET /ddex/acknowledgements ───────────────────────────────────────

const ListAcksQuery = z.object({
  partnerCode: z.string().optional(),
  status: z.enum(["accepted", "rejected", "warning"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

router.get("/ddex/acknowledgements", async (req, res): Promise<void> => {
  const parsed = ListAcksQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { partnerCode, status, page, limit } = parsed.data;
  const filters: SQL[] = [];
  if (partnerCode) filters.push(eq(ddexAcknowledgementsTable.partnerCode, partnerCode));
  if (status) filters.push(eq(ddexAcknowledgementsTable.status, status));
  const where = filters.length ? and(...filters) : undefined;
  const offset = (page - 1) * limit;
  const rows = await db.select().from(ddexAcknowledgementsTable).where(where).limit(limit).offset(offset).orderBy(desc(ddexAcknowledgementsTable.receivedAt));
  const [totalRow] = await db.select({ count: count() }).from(ddexAcknowledgementsTable).where(where);
  res.json({
    data: rows.map(toAckDto),
    pagination: { page, limit, total: totalRow.count, totalPages: Math.ceil(totalRow.count / limit) },
  });
});

// ── POST /ddex/acknowledgements/inbound (без cookie-auth, HMAC) ─────
//
// Партнёр шлёт нам raw XML на этот endpoint. Защита через `X-DDEX-Signature`
// заголовок (HMAC-SHA256 от тела сообщения с общим секретом из env
// DDEX_INBOUND_SECRET). В dev-режиме разрешаем без подписи если env не задана.

const INBOUND_SECRET = process.env.DDEX_INBOUND_SECRET || "";

function verifyInboundSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!INBOUND_SECRET) return true; // dev-режим
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", INBOUND_SECRET).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHeader.replace(/^sha256=/, ""), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch { return false; }
}

router.get("/ddex/transports", (_req, res): void => {
  res.json({ transports: listTransports() });
});

export default router;

/**
 * Inbound webhook монтируется в `routes/index.ts` ДО `requireAuth`.
 * Отдельный экспорт — чтобы держать защиту явной.
 */
export const ddexInboundRouter: Router = Router();
ddexInboundRouter.post(
  "/ddex/acknowledgements/inbound",
  express.raw({ type: ["application/xml", "text/xml", "*/*"], limit: "2mb" }),
  async (req, res): Promise<void> => {
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ error: "Empty body or wrong content-type" });
      return;
    }
    const sig = req.header("x-ddex-signature") ?? undefined;
    if (!verifyInboundSignature(rawBody, sig)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    try {
      const partnerHint = req.header("x-ddex-partner") ?? undefined;
      const result = await ingestAck(rawBody.toString("utf8"), "webhook", partnerHint);
      res.status(202).json(result);
    } catch (err) {
      logger.warn({ err }, "ack inbound parse failed");
      res.status(400).json({ error: (err as Error).message });
    }
  },
);
