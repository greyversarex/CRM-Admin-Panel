import { Router } from "express";
import { db, labelsTable, artistsTable, releasesTable } from "@workspace/db";
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { CreateLabelBody, UpdateLabelBody, GetLabelParams, UpdateLabelParams, DeleteLabelParams } from "@workspace/api-zod";
import { requireAuth, requireRole, getDataScope, type DataScope } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { resolveLabelTreeIds } from "../lib/label-scope";

const router = Router();

function parseId(raw: string | string[]): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(str, 10);
}

/** null means unrestricted staff access; [] means no catalog ownership. */
async function scopedLabelIds(scope: DataScope): Promise<number[] | null> {
  if (scope.fullAccess) return null;
  if (scope.role === "label") {
    return scope.labelId == null ? [] : resolveLabelTreeIds(scope.labelId);
  }
  if (scope.role === "artist" && scope.artistId != null) {
    const [artist] = await db
      .select({ labelId: artistsTable.labelId })
      .from(artistsTable)
      .where(eq(artistsTable.id, scope.artistId));
    return artist?.labelId == null ? [] : [artist.labelId];
  }
  return [];
}

router.get("/labels", requireAuth, async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const search = String(req.query.search ?? "").trim();
  const offset = (page - 1) * limit;

  // Staff sees the full catalog. A label sees its root label and descendants;
  // an artist sees only the label attached to their artist profile.
  const allowedIds = await scopedLabelIds(scope);
  const conditions = [];
  if (allowedIds !== null) {
    conditions.push(allowedIds.length > 0 ? inArray(labelsTable.id, allowedIds) : sql`false`);
  }
  if (search) conditions.push(ilike(labelsTable.name, `%${search}%`));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const labels = await db.select().from(labelsTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(labelsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(labelsTable).where(whereClause);

  const visibleIds = labels.map((label) => label.id);
  const artistCounts = visibleIds.length > 0
    ? await db.select({ labelId: artistsTable.labelId, count: count() })
      .from(artistsTable).where(inArray(artistsTable.labelId, visibleIds)).groupBy(artistsTable.labelId)
    : [];
  const artistCountMap = new Map(artistCounts.map(a => [a.labelId, a.count]));

  const releaseCounts = visibleIds.length > 0
    ? await db.select({ labelId: releasesTable.labelId, count: count() })
      .from(releasesTable).where(inArray(releasesTable.labelId, visibleIds)).groupBy(releasesTable.labelId)
    : [];
  const releaseCountMap = new Map(releaseCounts.map(r => [r.labelId, r.count]));
  const parentIds = Array.from(new Set(labels.flatMap((label) => label.parentLabelId == null ? [] : [label.parentLabelId])));
  const parents = parentIds.length > 0
    ? await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable).where(inArray(labelsTable.id, parentIds))
    : [];
  const nameMap = new Map(parents.map((label) => [label.id, label.name]));

  const data = labels.map(l => ({
    ...l,
    parentLabelName: l.parentLabelId ? (nameMap.get(l.parentLabelId) ?? null) : null,
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

router.post("/labels", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
  const parsed = CreateLabelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scope = getDataScope(req);
  const data = { ...parsed.data };
  if (scope.role === "label") {
    if (scope.labelId == null) { res.status(403).json({ error: "Label scope missing" }); return; }
    const allowedIds = await resolveLabelTreeIds(scope.labelId);
    const parentLabelId = data.parentLabelId ?? scope.labelId;
    if (!allowedIds.includes(parentLabelId)) {
      res.status(403).json({ error: "Parent label is outside your catalog" });
      return;
    }
    data.parentLabelId = parentLabelId;
  }

  const [label] = await db.insert(labelsTable).values(data).returning();
  void auditMutation(req, { action: "create", entityType: "label", entityId: label.id, before: null, after: label });
  const [parentLabel] = label.parentLabelId == null
    ? []
    : await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, label.parentLabelId));

  res.status(201).json({
    ...label,
    parentLabelName: parentLabel?.name ?? null,
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
  const allowedIds = await scopedLabelIds(getDataScope(req));
  if (allowedIds !== null && !allowedIds.includes(label.id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [artistCount] = await db.select({ count: count() }).from(artistsTable).where(eq(artistsTable.labelId, label.id));
  const [releaseCount] = await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.labelId, label.id));
  const [parentLabel] = label.parentLabelId == null
    ? []
    : await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, label.parentLabelId));

  res.json({
    ...label,
    parentLabelName: parentLabel?.name ?? null,
    totalArtists: artistCount.count,
    totalReleases: releaseCount.count,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  });
});

router.put("/labels/:id", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
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

  const scope = getDataScope(req);
  const data = { ...parsed.data };
  if (scope.role === "label") {
    if (scope.labelId == null) { res.status(403).json({ error: "Label scope missing" }); return; }
    const allowedIds = await resolveLabelTreeIds(scope.labelId);
    if (!allowedIds.includes(existing.id)) { res.status(403).json({ error: "Forbidden" }); return; }

    if (existing.id === scope.labelId) {
      // Editing branding of the root label is allowed; moving the ownership root is not.
      data.parentLabelId = existing.parentLabelId;
    } else {
      const parentLabelId = data.parentLabelId ?? scope.labelId;
      const descendantIds = await resolveLabelTreeIds(existing.id);
      if (!allowedIds.includes(parentLabelId)) {
        res.status(403).json({ error: "Parent label is outside your catalog" }); return;
      }
      if (parentLabelId === existing.id || descendantIds.includes(parentLabelId)) {
        res.status(400).json({ error: "Circular label hierarchy" }); return;
      }
      data.parentLabelId = parentLabelId;
    }
  }

  const [label] = await db.update(labelsTable).set(data).where(eq(labelsTable.id, params.data.id)).returning();
  if (!label) {
    res.status(404).json({ error: "Label not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "label", entityId: label.id, before: existing, after: label });
  const [parentLabel] = label.parentLabelId == null
    ? []
    : await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, label.parentLabelId));

  res.json({
    ...label,
    parentLabelName: parentLabel?.name ?? null,
    totalArtists: (await db.select({ count: count() }).from(artistsTable).where(eq(artistsTable.labelId, label.id)))[0]?.count ?? 0,
    totalReleases: (await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.labelId, label.id)))[0]?.count ?? 0,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  });
});

router.delete("/labels/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
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
