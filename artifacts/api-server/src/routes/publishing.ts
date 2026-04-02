import { Router } from "express";
import { db, publishingWorksTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
import { CreatePublishingWorkBody, UpdatePublishingWorkBody, GetPublishingWorkParams, UpdatePublishingWorkParams } from "@workspace/api-zod";

const router = Router();

function formatWork(w: typeof publishingWorksTable.$inferSelect) {
  return {
    ...w,
    writers: (w.writers as any[]) ?? [],
    registeredWith: (w.registeredWith as string[]) ?? [],
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

router.get("/publishing/works", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const works = await db.select().from(publishingWorksTable).limit(limit).offset(offset).orderBy(desc(publishingWorksTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(publishingWorksTable);

  res.json({
    data: works.map(formatWork),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/publishing/works", async (req, res): Promise<void> => {
  const parsed = CreatePublishingWorkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [work] = await db.insert(publishingWorksTable).values({
    ...parsed.data,
    writers: parsed.data.writers as any,
  }).returning();
  res.status(201).json(formatWork(work));
});

router.get("/publishing/works/:id", async (req, res): Promise<void> => {
  const params = GetPublishingWorkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [work] = await db.select().from(publishingWorksTable).where(eq(publishingWorksTable.id, params.data.id));
  if (!work) {
    res.status(404).json({ error: "Publishing work not found" });
    return;
  }

  res.json(formatWork(work));
});

router.put("/publishing/works/:id", async (req, res): Promise<void> => {
  const params = UpdatePublishingWorkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePublishingWorkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [work] = await db.update(publishingWorksTable)
    .set({ ...parsed.data, writers: parsed.data.writers as any })
    .where(eq(publishingWorksTable.id, params.data.id))
    .returning();
  if (!work) {
    res.status(404).json({ error: "Publishing work not found" });
    return;
  }

  res.json(formatWork(work));
});

export default router;
