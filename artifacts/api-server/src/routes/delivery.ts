import { Router } from "express";
import { db, deliveriesTable, releasesTable } from "@workspace/db";
import { count, eq, desc, and, gte, lte, type SQL } from "drizzle-orm";
import {
  ListDeliveriesQueryParams,
  GetDeliveryParams,
  RetryDeliveryParams,
} from "@workspace/api-zod";
import { z } from "zod";
import { auditMutation } from "../lib/audit";

const router = Router();

// Route-local schema: orval генерирует date_from/date_to как `zod.date()`
// (требует Date-инстанс), но из URL приходят строки. Парсим как YYYY-MM-DD ISO.
const ListDeliveriesQuery = ListDeliveriesQueryParams.extend({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
  date_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
});

async function enrichDelivery(d: typeof deliveriesTable.$inferSelect) {
  let releaseName = "Unknown";
  const [release] = await db.select({ title: releasesTable.title }).from(releasesTable).where(eq(releasesTable.id, d.releaseId));
  if (release) releaseName = release.title;

  // xmlPayload намеренно НЕ отдаём в API — это служебное поле воркера для дебага
  // и потенциального retry без перегенерации. На фронт идут только метаданные.
  const { xmlPayload: _omit, ...rest } = d;
  return {
    ...rest,
    releaseName,
    nextRetryAt: d.nextRetryAt?.toISOString() ?? null,
    acknowledgedAt: d.acknowledgedAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/deliveries", async (req, res): Promise<void> => {
  const parsed = ListDeliveriesQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { status, target, release_id: releaseId, date_from, date_to, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const filters: SQL[] = [];
  if (status) filters.push(eq(deliveriesTable.status, status));
  if (target) filters.push(eq(deliveriesTable.target, target));
  if (releaseId !== undefined) filters.push(eq(deliveriesTable.releaseId, releaseId));
  // Диапазон по createdAt (inclusive). date_to + 1 день — чтобы захватить весь день.
  if (date_from) filters.push(gte(deliveriesTable.createdAt, new Date(`${date_from}T00:00:00.000Z`)));
  if (date_to)   filters.push(lte(deliveriesTable.createdAt, new Date(`${date_to}T23:59:59.999Z`)));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db.select().from(deliveriesTable)
    .where(where)
    .limit(limit).offset(offset)
    .orderBy(desc(deliveriesTable.createdAt));
  const [totalRow] = await db.select({ count: count() }).from(deliveriesTable).where(where);

  const data = await Promise.all(rows.map(enrichDelivery));
  res.json({
    data,
    pagination: { page, limit, total: totalRow.count, totalPages: Math.ceil(totalRow.count / limit) },
  });
});

router.get("/deliveries/:id", async (req, res): Promise<void> => {
  const params = GetDeliveryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, params.data.id));
  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }

  res.json(await enrichDelivery(delivery));
});

router.post("/deliveries/:id/retry", async (req, res): Promise<void> => {
  const params = RetryDeliveryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Delivery not found" }); return; }
  // Retry разрешён только для failed: иначе можно случайно сбросить queued/processing/sent
  // и получить дубль доставки (контракт OpenAPI: "retry a failed delivery job").
  if (existing.status !== "failed") {
    res.status(409).json({ error: `Cannot retry delivery in status '${existing.status}' — only 'failed' allowed` });
    return;
  }

  const [updated] = await db.update(deliveriesTable).set({
    status: "queued",
    attempts: 0,
    nextRetryAt: new Date(),
    lastError: null,
  }).where(eq(deliveriesTable.id, params.data.id)).returning();

  void auditMutation(req, {
    action: "update",
    entityType: "delivery",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  res.json(await enrichDelivery(updated));
});

export default router;
