import { Router } from "express";
import { db, splitsTable, releasesTable, tracksTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
import { CreateSplitBody, UpdateSplitBody, GetSplitParams, UpdateSplitParams, DeleteSplitParams } from "@workspace/api-zod";

const router = Router();

async function enrichSplit(s: typeof splitsTable.$inferSelect) {
  let releaseName = null;
  if (s.releaseId) {
    const [release] = await db.select({ title: releasesTable.title }).from(releasesTable).where(eq(releasesTable.id, s.releaseId));
    releaseName = release?.title ?? null;
  }

  let trackName = null;
  if (s.trackId) {
    const [track] = await db.select({ title: tracksTable.title }).from(tracksTable).where(eq(tracksTable.id, s.trackId));
    trackName = track?.title ?? null;
  }

  return {
    ...s,
    releaseName,
    trackName,
    participants: (s.participants as any[]) ?? [],
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/splits", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const splits = await db.select().from(splitsTable).limit(limit).offset(offset).orderBy(desc(splitsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(splitsTable);

  const data = await Promise.all(splits.map(enrichSplit));

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

router.post("/splits", async (req, res): Promise<void> => {
  const parsed = CreateSplitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const total = parsed.data.participants.reduce((sum, p) => sum + p.percentage, 0);
  if (Math.abs(total - 100) > 0.01) {
    res.status(400).json({ error: "Split percentages must sum to 100%" });
    return;
  }

  const [split] = await db.insert(splitsTable).values({
    ...parsed.data,
    participants: parsed.data.participants as any,
  }).returning();
  const enriched = await enrichSplit(split);
  res.status(201).json(enriched);
});

router.get("/splits/:id", async (req, res): Promise<void> => {
  const params = GetSplitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [split] = await db.select().from(splitsTable).where(eq(splitsTable.id, params.data.id));
  if (!split) {
    res.status(404).json({ error: "Split not found" });
    return;
  }

  const enriched = await enrichSplit(split);
  res.json(enriched);
});

router.put("/splits/:id", async (req, res): Promise<void> => {
  const params = UpdateSplitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSplitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const total = parsed.data.participants.reduce((sum, p) => sum + p.percentage, 0);
  if (Math.abs(total - 100) > 0.01) {
    res.status(400).json({ error: "Split percentages must sum to 100%" });
    return;
  }

  const [split] = await db.update(splitsTable)
    .set({ ...parsed.data, participants: parsed.data.participants as any })
    .where(eq(splitsTable.id, params.data.id))
    .returning();
  if (!split) {
    res.status(404).json({ error: "Split not found" });
    return;
  }

  const enriched = await enrichSplit(split);
  res.json(enriched);
});

router.delete("/splits/:id", async (req, res): Promise<void> => {
  const params = DeleteSplitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [split] = await db.delete(splitsTable).where(eq(splitsTable.id, params.data.id)).returning();
  if (!split) {
    res.status(404).json({ error: "Split not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
