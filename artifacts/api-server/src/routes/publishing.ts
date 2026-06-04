import { Router } from "express";
import { db, publishingWorksTable, tracksTable, releasesTable, artistsTable } from "@workspace/db";
import { count, eq, desc, and, or, ilike, inArray, type SQL } from "drizzle-orm";
import { CreatePublishingWorkBody, UpdatePublishingWorkBody, GetPublishingWorkParams, UpdatePublishingWorkParams } from "@workspace/api-zod";
import { getDataScope } from "../lib/auth";

const router = Router();

// Server-side guard: zod schemas are codegen'd from OpenAPI and don't enforce
// share bounds or duplicate-writer rules, so we re-validate here.
function validateWriters(writers: { name: string; share: number; caeIpi?: string | null }[]):
  string | null {
  if (!Array.isArray(writers) || writers.length === 0) return "Need at least one writer";
  const seen = new Set<string>();
  let total = 0;
  for (const w of writers) {
    const name = (w.name ?? "").trim();
    if (!name) return "Writer name is required";
    const share = Number(w.share);
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      return `Writer "${name}" has invalid share (must be 0–100)`;
    }
    const key = `${name.toLowerCase()}|${(w.caeIpi ?? "").trim()}`;
    if (seen.has(key)) return `Writer "${name}" is duplicated`;
    seen.add(key);
    total += share;
  }
  if (Math.round(total) !== 100) return `Writer shares must sum to 100% (got ${total}%)`;
  return null;
}

// Проверяет, доступно ли произведение пользователю с ограниченным доступом.
// Произведение привязано к scope через track→release.labelId ИЛИ track.artistId
// в ростере лейбла (та же логика, что и в списке выше). Admin/manager видят всё.
// Fail-closed: если track не задан или scope не label — доступа нет.
async function trackInScope(
  scope: ReturnType<typeof getDataScope>,
  trackId: number | null,
): Promise<boolean> {
  if (scope.fullAccess) return true;
  if (scope.role !== "label" || scope.labelId == null) return false;
  if (trackId == null) return false;
  const [row] = await db
    .select({
      releaseLabelId: releasesTable.labelId,
      artistLabelId: artistsTable.labelId,
    })
    .from(tracksTable)
    .leftJoin(releasesTable, eq(releasesTable.id, tracksTable.releaseId))
    .leftJoin(artistsTable, eq(artistsTable.id, tracksTable.artistId))
    .where(eq(tracksTable.id, trackId));
  if (!row) return false;
  return row.releaseLabelId === scope.labelId || row.artistLabelId === scope.labelId;
}

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

  const scope = getDataScope(req);
  const q = ((req.query.q as string) ?? "").trim();
  const statusParam = ((req.query.status as string) ?? "").trim().toLowerCase();

  const conds: SQL[] = [];
  // Label scoping: works are tied via track→release→{labelId, artistId}.
  // A label sees works whose release.labelId matches OR whose track.artistId
  // belongs to their roster. Admin/manager see all.
  if (!scope.fullAccess) {
    if (scope.role === "label" && scope.labelId != null) {
      const lid = scope.labelId;
      const labelArtistIds = await db
        .select({ id: artistsTable.id })
        .from(artistsTable)
        .where(eq(artistsTable.labelId, lid));
      const artistIds = labelArtistIds.map((r) => r.id);
      const orParts: SQL[] = [eq(releasesTable.labelId, lid)];
      if (artistIds.length > 0) orParts.push(inArray(tracksTable.artistId, artistIds));
      conds.push(or(...orParts)!);
    } else {
      // any other non-privileged role: no access
      res.json({ data: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
      return;
    }
  }

  if (q.length > 0) {
    const like = `%${q}%`;
    conds.push(or(
      ilike(publishingWorksTable.title, like),
      ilike(artistsTable.name, like),
      ilike(publishingWorksTable.isrc, like),
      ilike(publishingWorksTable.iswc, like),
    )!);
  }

  if (statusParam && statusParam !== "all") {
    // "active" filter from UI must include both `active` and `registered`
    const map: Record<string, string[]> = {
      active: ["active", "registered"],
      accepted: ["active", "registered"],
      pending: ["pending"],
      rejected: ["rejected"],
      draft: ["draft"],
    };
    const list = map[statusParam] ?? [statusParam];
    conds.push(inArray(publishingWorksTable.status, list as any));
  }

  const whereClause = conds.length > 0 ? and(...conds) : undefined;

  const rowsQuery = db
    .select({
      work: publishingWorksTable,
      artistName: artistsTable.name,
      artistImageUrl: artistsTable.imageUrl,
      coverUrl: releasesTable.coverUrl,
    })
    .from(publishingWorksTable)
    .leftJoin(tracksTable, eq(tracksTable.id, publishingWorksTable.trackId))
    .leftJoin(releasesTable, eq(releasesTable.id, tracksTable.releaseId))
    .leftJoin(artistsTable, eq(artistsTable.id, tracksTable.artistId));

  const rows = await (whereClause ? rowsQuery.where(whereClause) : rowsQuery)
    .limit(limit).offset(offset).orderBy(desc(publishingWorksTable.createdAt));

  const totalQuery = db
    .select({ count: count() })
    .from(publishingWorksTable)
    .leftJoin(tracksTable, eq(tracksTable.id, publishingWorksTable.trackId))
    .leftJoin(releasesTable, eq(releasesTable.id, tracksTable.releaseId))
    .leftJoin(artistsTable, eq(artistsTable.id, tracksTable.artistId));
  const [totalResult] = await (whereClause ? totalQuery.where(whereClause) : totalQuery);

  res.json({
    data: rows.map((r) => ({
      ...formatWork(r.work),
      artistName: r.artistName,
      artistImageUrl: r.artistImageUrl,
      coverUrl: r.coverUrl,
    })),
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
  const writersError = validateWriters(parsed.data.writers);
  if (writersError) {
    res.status(400).json({ error: writersError });
    return;
  }

  // Scope: лейбл может создавать произведения только для своих треков.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    const allowed = await trackInScope(scope, parsed.data.trackId ?? null);
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
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

  // Scope: не раскрываем существование чужих произведений — отдаём 404.
  const scope = getDataScope(req);
  if (!(await trackInScope(scope, work.trackId))) {
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
  const writersError = validateWriters(parsed.data.writers);
  if (writersError) {
    res.status(400).json({ error: writersError });
    return;
  }

  // Scope: проверяем доступ к существующему произведению до обновления, чтобы
  // лейбл не мог редактировать чужое. Также не даём «увести» произведение на
  // чужой трек, подменив trackId.
  const [existing] = await db.select().from(publishingWorksTable).where(eq(publishingWorksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Publishing work not found" });
    return;
  }
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (!(await trackInScope(scope, existing.trackId))) {
      res.status(404).json({ error: "Publishing work not found" });
      return;
    }
    if (parsed.data.trackId !== undefined && !(await trackInScope(scope, parsed.data.trackId ?? null))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
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
