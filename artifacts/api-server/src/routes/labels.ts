import { Router } from "express";
import { db, labelsTable, artistsTable, releasesTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
import { CreateLabelBody, UpdateLabelBody, GetLabelParams, UpdateLabelParams, DeleteLabelParams } from "@workspace/api-zod";
import { auditMutation } from "../lib/audit";

const router = Router();

function parseId(raw: string | string[]): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(str, 10);
}

router.get("/labels", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const labels = await db.select().from(labelsTable).limit(limit).offset(offset).orderBy(desc(labelsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(labelsTable);

  const artistCounts = await db.select({ labelId: artistsTable.labelId, count: count() })
    .from(artistsTable).groupBy(artistsTable.labelId);
  const artistCountMap = new Map(artistCounts.map(a => [a.labelId, a.count]));

  const releaseCounts = await db.select({ labelId: releasesTable.labelId, count: count() })
    .from(releasesTable).groupBy(releasesTable.labelId);
  const releaseCountMap = new Map(releaseCounts.map(r => [r.labelId, r.count]));

  const data = labels.map(l => ({
    ...l,
    parentLabelName: null,
    totalArtists: artistCountMap.get(l.id) ?? 0,
    totalReleases: releaseCountMap.get(l.id) ?? 0,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));

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

router.post("/labels", async (req, res): Promise<void> => {
  const parsed = CreateLabelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [label] = await db.insert(labelsTable).values(parsed.data).returning();
  void auditMutation(req, { action: "create", entityType: "label", entityId: label.id, before: null, after: label });

  res.status(201).json({
    ...label,
    parentLabelName: null,
    totalArtists: 0,
    totalReleases: 0,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  });
});

router.get("/labels/:id", async (req, res): Promise<void> => {
  const params = GetLabelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [label] = await db.select().from(labelsTable).where(eq(labelsTable.id, params.data.id));
  if (!label) {
    res.status(404).json({ error: "Label not found" });
    return;
  }

  const [artistCount] = await db.select({ count: count() }).from(artistsTable).where(eq(artistsTable.labelId, label.id));
  const [releaseCount] = await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.labelId, label.id));

  res.json({
    ...label,
    parentLabelName: null,
    totalArtists: artistCount.count,
    totalReleases: releaseCount.count,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  });
});

router.put("/labels/:id", async (req, res): Promise<void> => {
  const params = UpdateLabelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLabelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(labelsTable).where(eq(labelsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Label not found" }); return; }

  const [label] = await db.update(labelsTable).set(parsed.data).where(eq(labelsTable.id, params.data.id)).returning();
  if (!label) {
    res.status(404).json({ error: "Label not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "label", entityId: label.id, before: existing, after: label });

  res.json({
    ...label,
    parentLabelName: null,
    totalArtists: 0,
    totalReleases: 0,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  });
});

router.delete("/labels/:id", async (req, res): Promise<void> => {
  const params = DeleteLabelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [label] = await db.delete(labelsTable).where(eq(labelsTable.id, params.data.id)).returning();
  if (!label) {
    res.status(404).json({ error: "Label not found" });
    return;
  }
  void auditMutation(req, { action: "delete", entityType: "label", entityId: label.id, before: label, after: null });

  res.sendStatus(204);
});

export default router;
