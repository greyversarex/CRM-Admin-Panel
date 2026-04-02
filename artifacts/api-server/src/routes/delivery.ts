import { Router } from "express";
import { db, deliveriesTable, releasesTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
import { CreateDeliveryBody, GetDeliveryParams } from "@workspace/api-zod";

const router = Router();

async function enrichDelivery(d: typeof deliveriesTable.$inferSelect) {
  let releaseName = "Unknown";
  const [release] = await db.select({ title: releasesTable.title }).from(releasesTable).where(eq(releasesTable.id, d.releaseId));
  if (release) releaseName = release.title;

  return {
    ...d,
    releaseName,
    acknowledgedAt: d.acknowledgedAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/delivery", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const deliveries = await db.select().from(deliveriesTable).limit(limit).offset(offset).orderBy(desc(deliveriesTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(deliveriesTable);

  const data = await Promise.all(deliveries.map(enrichDelivery));

  res.json({
    data,
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/delivery", async (req, res): Promise<void> => {
  const parsed = CreateDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Create one delivery per target
  const created = [];
  for (const target of parsed.data.targets) {
    const [delivery] = await db.insert(deliveriesTable).values({
      releaseId: parsed.data.releaseId,
      target,
      status: "pending",
      ddexVersion: parsed.data.ddexVersion ?? "4.0",
    }).returning();
    const enriched = await enrichDelivery(delivery);
    created.push(enriched);
  }

  res.status(201).json(created[0]);
});

router.get("/delivery/:id", async (req, res): Promise<void> => {
  const params = GetDeliveryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, params.data.id));
  if (!delivery) {
    res.status(404).json({ error: "Delivery not found" });
    return;
  }

  const enriched = await enrichDelivery(delivery);
  res.json(enriched);
});

export default router;
