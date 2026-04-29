/**
 * Rights Management API
 *
 * GET    /api/rights/holders             — список владельцев прав (фильтры: asset_type, track_id, release_id, rights_type, holder_type)
 * POST   /api/rights/holders             — создать запись
 * GET    /api/rights/holders/:id         — деталь
 * PUT    /api/rights/holders/:id         — полное обновление
 * DELETE /api/rights/holders/:id         — удалить
 *
 * GET    /api/rights/conflicts           — список конфликтов (фильтры: status, priority, conflict_type, asset_type)
 * POST   /api/rights/conflicts           — открыть конфликт
 * GET    /api/rights/conflicts/:id       — деталь
 * PATCH  /api/rights/conflicts/:id       — изменить статус / добавить resolution note
 * DELETE /api/rights/conflicts/:id       — удалить
 *
 * Доступ:
 *   admin / manager  — полный доступ
 *   label            — только свои активы (через labelId)
 *   artist           — только свои треки/релизы (через artistId)
 */

import { Router } from "express";
import { z } from "zod";
import { db, rightsHoldersTable, rightsConflictsTable, releasesTable, tracksTable, artistsTable, labelsTable, usersTable, dspDealsTable, contentIdAssetsTable } from "@workspace/db";
import { eq, and, desc, count, or, inArray, sql } from "drizzle-orm";
import { requireRole, getSessionUser } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import type { Request } from "express";

const router = Router();

// ─── Zod schemas ───────────────────────────────────────────────────────────

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const HolderBody = z.object({
  assetType:      z.enum(["track", "release"]),
  trackId:        z.number().int().positive().optional().nullable(),
  releaseId:      z.number().int().positive().optional().nullable(),
  holderType:     z.enum(["artist", "label", "publisher", "distributor", "other"]),
  holderName:     z.string().min(1).max(200),
  holderArtistId: z.number().int().positive().optional().nullable(),
  holderLabelId:  z.number().int().positive().optional().nullable(),
  rightsType:     z.enum(["master", "sync", "mechanical", "neighboring", "all"]).default("master"),
  sharePct:       z.number().min(0).max(100).default(100),
  territory:      z.string().max(500).default("WW"),
  exclusive:      z.boolean().default(false),
  startsAt:       z.string().datetime({ offset: true }).optional().nullable(),
  endsAt:         z.string().datetime({ offset: true }).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
});

const ConflictBody = z.object({
  assetType:     z.enum(["track", "release"]),
  trackId:       z.number().int().positive().optional().nullable(),
  releaseId:     z.number().int().positive().optional().nullable(),
  conflictType:  z.enum(["dsp_claim", "acr_flag", "manual_dispute", "territorial_overlap"]),
  claimantName:  z.string().min(1).max(200),
  claimantInfo:  z.string().max(1000).optional().nullable(),
  priority:      z.enum(["low", "medium", "high", "critical"]).default("medium"),
  description:   z.string().min(1).max(3000),
});

const ConflictPatch = z.object({
  status:         z.enum(["open", "investigating", "resolved", "dismissed", "escalated"]).optional(),
  priority:       z.enum(["low", "medium", "high", "critical"]).optional(),
  resolutionNote: z.string().max(3000).optional().nullable(),
  claimantInfo:   z.string().max(1000).optional().nullable(),
  description:    z.string().max(3000).optional(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function badRequest(res: import("express").Response, msg: string): void {
  res.status(400).json({ error: msg });
}

/**
 * Собирает ограничение по asset-id для label/artist ролей.
 * Возвращает массив WHERE-условий или null (без ограничений).
 */
async function assetScope(req: Request): Promise<
  | { allowed: true; trackIds?: number[]; releaseIds?: number[] }
  | { allowed: false }
> {
  const user = getSessionUser(req);
  if (!user) return { allowed: false };

  if (user.role === "admin" || user.role === "manager") return { allowed: true };

  if (user.role === "label" && user.labelId) {
    const releases = await db
      .select({ id: releasesTable.id })
      .from(releasesTable)
      .where(eq(releasesTable.labelId, user.labelId));
    const releaseIds = releases.map((r) => r.id);
    const tracks = releaseIds.length > 0
      ? await db.select({ id: tracksTable.id }).from(tracksTable).where(inArray(tracksTable.releaseId, releaseIds))
      : [];
    return { allowed: true, releaseIds, trackIds: tracks.map((t) => t.id) };
  }

  if (user.role === "artist" && user.artistId) {
    const releases = await db
      .select({ id: releasesTable.id })
      .from(releasesTable)
      .where(eq(releasesTable.artistId, user.artistId));
    const releaseIds = releases.map((r) => r.id);
    const tracks = await db
      .select({ id: tracksTable.id })
      .from(tracksTable)
      .where(eq(tracksTable.artistId, user.artistId));
    return { allowed: true, releaseIds, trackIds: tracks.map((t) => t.id) };
  }

  return { allowed: false };
}

async function enrichHolder(h: typeof rightsHoldersTable.$inferSelect) {
  let assetTitle: string | null = null;
  if (h.assetType === "track" && h.trackId) {
    const [t] = await db.select({ title: tracksTable.title, isrc: tracksTable.isrc })
      .from(tracksTable).where(eq(tracksTable.id, h.trackId));
    assetTitle = t ? `${t.title}${t.isrc ? ` (${t.isrc})` : ""}` : null;
  } else if (h.assetType === "release" && h.releaseId) {
    const [r] = await db.select({ title: releasesTable.title, upc: releasesTable.upc })
      .from(releasesTable).where(eq(releasesTable.id, h.releaseId));
    assetTitle = r ? `${r.title}${r.upc ? ` (${r.upc})` : ""}` : null;
  }
  return {
    ...h,
    sharePct: Number(h.sharePct),
    assetTitle,
    startsAt: h.startsAt?.toISOString() ?? null,
    endsAt: h.endsAt?.toISOString() ?? null,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

async function enrichConflict(c: typeof rightsConflictsTable.$inferSelect) {
  let assetTitle: string | null = null;
  if (c.assetType === "track" && c.trackId) {
    const [t] = await db.select({ title: tracksTable.title, isrc: tracksTable.isrc })
      .from(tracksTable).where(eq(tracksTable.id, c.trackId));
    assetTitle = t ? `${t.title}${t.isrc ? ` (${t.isrc})` : ""}` : null;
  } else if (c.assetType === "release" && c.releaseId) {
    const [r] = await db.select({ title: releasesTable.title, upc: releasesTable.upc })
      .from(releasesTable).where(eq(releasesTable.id, c.releaseId));
    assetTitle = r ? `${r.title}${r.upc ? ` (${r.upc})` : ""}` : null;
  }
  let openedByName: string | null = null;
  if (c.openedBy) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, c.openedBy));
    openedByName = u?.name ?? null;
  }
  let resolvedByName: string | null = null;
  if (c.resolvedBy) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, c.resolvedBy));
    resolvedByName = u?.name ?? null;
  }
  return {
    ...c,
    assetTitle,
    openedByName,
    resolvedByName,
    openedAt: c.openedAt.toISOString(),
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ─── Rights Holders ────────────────────────────────────────────────────────

router.get("/rights/holders", async (req, res): Promise<void> => {
  const scope = await assetScope(req);
  if (!scope.allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const page  = Math.max(1, parseInt(req.query.page  as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "25", 10)));
  const offset = (page - 1) * limit;

  const where: ReturnType<typeof and>[] = [];

  if (req.query.asset_type)  where.push(eq(rightsHoldersTable.assetType, req.query.asset_type as string));
  if (req.query.rights_type) where.push(eq(rightsHoldersTable.rightsType, req.query.rights_type as string));
  if (req.query.holder_type) where.push(eq(rightsHoldersTable.holderType, req.query.holder_type as string));
  if (req.query.track_id)    where.push(eq(rightsHoldersTable.trackId, parseInt(req.query.track_id as string, 10)));
  if (req.query.release_id)  where.push(eq(rightsHoldersTable.releaseId, parseInt(req.query.release_id as string, 10)));

  // Scope по роли: label/artist видят только свои активы
  if (scope.trackIds !== undefined || scope.releaseIds !== undefined) {
    const trackIds   = scope.trackIds   ?? [];
    const releaseIds = scope.releaseIds ?? [];
    const parts: ReturnType<typeof eq>[] = [];
    if (trackIds.length > 0)   parts.push(...trackIds.map((id) => eq(rightsHoldersTable.trackId, id)));
    if (releaseIds.length > 0) parts.push(...releaseIds.map((id) => eq(rightsHoldersTable.releaseId, id)));
    if (parts.length === 0) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
    where.push(or(...parts) as any);
  }

  const condition = where.length > 0 ? and(...where) : undefined;
  const rows = await db.select().from(rightsHoldersTable).where(condition)
    .orderBy(desc(rightsHoldersTable.createdAt)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(rightsHoldersTable).where(condition);

  const data = await Promise.all(rows.map(enrichHolder));
  res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.post("/rights/holders", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const parsed = HolderBody.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues.map((i) => i.message).join("; ")); return; }
  const d = parsed.data;

  if (d.assetType === "track" && !d.trackId)    { badRequest(res, "trackId required for assetType=track"); return; }
  if (d.assetType === "release" && !d.releaseId) { badRequest(res, "releaseId required for assetType=release"); return; }

  const user = getSessionUser(req);
  const [row] = await db.insert(rightsHoldersTable).values({
    assetType: d.assetType,
    trackId: d.trackId ?? null,
    releaseId: d.releaseId ?? null,
    holderType: d.holderType,
    holderName: d.holderName,
    holderArtistId: d.holderArtistId ?? null,
    holderLabelId: d.holderLabelId ?? null,
    rightsType: d.rightsType,
    sharePct: String(d.sharePct),
    territory: d.territory,
    exclusive: d.exclusive,
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    notes: d.notes ?? null,
    createdBy: user!.id,
  }).returning();

  void auditMutation(req, { action: "create", entityType: "rights_holder", entityId: row.id, before: null, after: row });
  res.status(201).json(await enrichHolder(row));
});

router.get("/rights/holders/:id", async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) { badRequest(res, "Invalid id"); return; }
  const [row] = await db.select().from(rightsHoldersTable).where(eq(rightsHoldersTable.id, p.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichHolder(row));
});

router.put("/rights/holders/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) { badRequest(res, "Invalid id"); return; }
  const parsed = HolderBody.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues.map((i) => i.message).join("; ")); return; }
  const d = parsed.data;

  const [existing] = await db.select().from(rightsHoldersTable).where(eq(rightsHoldersTable.id, p.data.id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const [row] = await db.update(rightsHoldersTable).set({
    assetType: d.assetType,
    trackId: d.trackId ?? null,
    releaseId: d.releaseId ?? null,
    holderType: d.holderType,
    holderName: d.holderName,
    holderArtistId: d.holderArtistId ?? null,
    holderLabelId: d.holderLabelId ?? null,
    rightsType: d.rightsType,
    sharePct: String(d.sharePct),
    territory: d.territory,
    exclusive: d.exclusive,
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    notes: d.notes ?? null,
  }).where(eq(rightsHoldersTable.id, p.data.id)).returning();

  void auditMutation(req, { action: "update", entityType: "rights_holder", entityId: row.id, before: existing, after: row });
  res.json(await enrichHolder(row));
});

router.delete("/rights/holders/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) { badRequest(res, "Invalid id"); return; }
  const [row] = await db.delete(rightsHoldersTable).where(eq(rightsHoldersTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "delete", entityType: "rights_holder", entityId: row.id, before: row, after: null });
  res.sendStatus(204);
});

// ─── Rights Conflicts ──────────────────────────────────────────────────────

router.get("/rights/conflicts", async (req, res): Promise<void> => {
  const scope = await assetScope(req);
  if (!scope.allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const page  = Math.max(1, parseInt(req.query.page  as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "25", 10)));
  const offset = (page - 1) * limit;

  const where: ReturnType<typeof and>[] = [];
  if (req.query.status)        where.push(eq(rightsConflictsTable.status, req.query.status as string));
  if (req.query.priority)      where.push(eq(rightsConflictsTable.priority, req.query.priority as string));
  if (req.query.conflict_type) where.push(eq(rightsConflictsTable.conflictType, req.query.conflict_type as string));
  if (req.query.asset_type)    where.push(eq(rightsConflictsTable.assetType, req.query.asset_type as string));
  if (req.query.track_id)      where.push(eq(rightsConflictsTable.trackId, parseInt(req.query.track_id as string, 10)));
  if (req.query.release_id)    where.push(eq(rightsConflictsTable.releaseId, parseInt(req.query.release_id as string, 10)));

  if (scope.trackIds !== undefined || scope.releaseIds !== undefined) {
    const trackIds   = scope.trackIds   ?? [];
    const releaseIds = scope.releaseIds ?? [];
    const parts: ReturnType<typeof eq>[] = [];
    if (trackIds.length > 0)   parts.push(...trackIds.map((id) => eq(rightsConflictsTable.trackId, id)));
    if (releaseIds.length > 0) parts.push(...releaseIds.map((id) => eq(rightsConflictsTable.releaseId, id)));
    if (parts.length === 0) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
    where.push(or(...parts) as any);
  }

  const condition = where.length > 0 ? and(...where) : undefined;
  const rows = await db.select().from(rightsConflictsTable).where(condition)
    .orderBy(desc(rightsConflictsTable.openedAt)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(rightsConflictsTable).where(condition);

  const data = await Promise.all(rows.map(enrichConflict));
  res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.post("/rights/conflicts", async (req, res): Promise<void> => {
  const parsed = ConflictBody.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues.map((i) => i.message).join("; ")); return; }
  const d = parsed.data;

  if (d.assetType === "track" && !d.trackId)    { badRequest(res, "trackId required for assetType=track"); return; }
  if (d.assetType === "release" && !d.releaseId) { badRequest(res, "releaseId required for assetType=release"); return; }

  const user = getSessionUser(req);
  const [row] = await db.insert(rightsConflictsTable).values({
    assetType: d.assetType,
    trackId: d.trackId ?? null,
    releaseId: d.releaseId ?? null,
    conflictType: d.conflictType,
    claimantName: d.claimantName,
    claimantInfo: d.claimantInfo ?? null,
    status: "open",
    priority: d.priority,
    description: d.description,
    openedBy: user!.id,
  }).returning();

  void auditMutation(req, { action: "create", entityType: "rights_conflict", entityId: row.id, before: null, after: row });
  res.status(201).json(await enrichConflict(row));
});

router.get("/rights/conflicts/:id", async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) { badRequest(res, "Invalid id"); return; }
  const [row] = await db.select().from(rightsConflictsTable).where(eq(rightsConflictsTable.id, p.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichConflict(row));
});

router.patch("/rights/conflicts/:id", async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) { badRequest(res, "Invalid id"); return; }
  const parsed = ConflictPatch.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues.map((i) => i.message).join("; ")); return; }

  const [existing] = await db.select().from(rightsConflictsTable).where(eq(rightsConflictsTable.id, p.data.id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const user = getSessionUser(req);
  const patch = parsed.data;
  const isClosing = patch.status === "resolved" || patch.status === "dismissed";

  const [row] = await db.update(rightsConflictsTable).set({
    ...(patch.status         !== undefined ? { status: patch.status } : {}),
    ...(patch.priority       !== undefined ? { priority: patch.priority } : {}),
    ...(patch.resolutionNote !== undefined ? { resolutionNote: patch.resolutionNote } : {}),
    ...(patch.claimantInfo   !== undefined ? { claimantInfo: patch.claimantInfo } : {}),
    ...(patch.description    !== undefined ? { description: patch.description } : {}),
    ...(isClosing ? { resolvedBy: user!.id, resolvedAt: new Date() } : {}),
  }).where(eq(rightsConflictsTable.id, p.data.id)).returning();

  void auditMutation(req, { action: "update", entityType: "rights_conflict", entityId: row.id, before: existing, after: row });
  res.json(await enrichConflict(row));
});

router.delete("/rights/conflicts/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) { badRequest(res, "Invalid id"); return; }
  const [row] = await db.delete(rightsConflictsTable).where(eq(rightsConflictsTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "delete", entityType: "rights_conflict", entityId: row.id, before: row, after: null });
  res.sendStatus(204);
});

// ─── DSP Deals (договоры с DSP) ─────────────────────────────────────────────

const DspDealBody = z.object({
  dspName:      z.string().min(1).max(120),
  dealType:     z.enum(["distribution", "publishing", "neighbouring", "sync", "other"]).default("distribution"),
  status:       z.enum(["draft", "active", "expired", "terminated"]).default("active"),
  startsAt:     z.string().datetime().nullish(),
  endsAt:       z.string().datetime().nullish(),
  revenueShare: z.string().max(40).nullish(),
  territory:    z.string().max(160).default("WW"),
  contractRef:  z.string().max(200).nullish(),
  notes:        z.string().max(4000).nullish(),
});

router.get("/rights/dsp-deals", requireRole("admin", "manager"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(dspDealsTable).orderBy(desc(dspDealsTable.createdAt));
  res.json({ deals: rows });
});

router.post("/rights/dsp-deals", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const parsed = DspDealBody.safeParse(req.body);
  if (!parsed.success) { badRequest(res, "validation"); return; }
  const user = getSessionUser(req);
  const [row] = await db.insert(dspDealsTable).values({
    ...parsed.data,
    startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
    endsAt:   parsed.data.endsAt   ? new Date(parsed.data.endsAt)   : null,
    createdBy: user?.id ?? null,
  }).returning();
  void auditMutation(req, { action: "create", entityType: "dsp_deal", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

router.patch("/rights/dsp-deals/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params); if (!p.success) { badRequest(res, "Bad id"); return; }
  const parsed = DspDealBody.partial().safeParse(req.body);
  if (!parsed.success) { badRequest(res, "validation"); return; }
  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.startsAt !== undefined) patch.startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  if (parsed.data.endsAt !== undefined)   patch.endsAt   = parsed.data.endsAt   ? new Date(parsed.data.endsAt)   : null;
  const [row] = await db.update(dspDealsTable).set(patch).where(eq(dspDealsTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "update", entityType: "dsp_deal", entityId: row.id, before: null, after: row });
  res.json(row);
});

router.delete("/rights/dsp-deals/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params); if (!p.success) { badRequest(res, "Bad id"); return; }
  const [del] = await db.delete(dspDealsTable).where(eq(dspDealsTable.id, p.data.id)).returning();
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "delete", entityType: "dsp_deal", entityId: del.id, before: del, after: null });
  res.sendStatus(204);
});

// ─── Content ID assets (YouTube/UGC) ────────────────────────────────────────

const ContentIdBody = z.object({
  assetType:    z.enum(["track", "release"]),
  trackId:      z.number().int().positive().nullish(),
  releaseId:    z.number().int().positive().nullish(),
  ytAssetId:    z.string().max(120).nullish(),
  status:       z.enum(["pending", "registered", "claimed", "released", "rejected"]).default("pending"),
  claimPolicy:  z.enum(["monetize", "track", "block"]).default("monetize"),
  ownership:    z.string().max(160).default("WW"),
  notes:        z.string().max(4000).nullish(),
});

router.get("/rights/content-id", requireRole("admin", "manager"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(contentIdAssetsTable).orderBy(desc(contentIdAssetsTable.createdAt));
  res.json({ items: rows });
});

router.post("/rights/content-id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const parsed = ContentIdBody.safeParse(req.body);
  if (!parsed.success) { badRequest(res, "validation"); return; }
  if (parsed.data.assetType === "track" && !parsed.data.trackId)     { badRequest(res, "trackId required");   return; }
  if (parsed.data.assetType === "release" && !parsed.data.releaseId) { badRequest(res, "releaseId required"); return; }
  const user = getSessionUser(req);
  const [row] = await db.insert(contentIdAssetsTable).values({
    ...parsed.data,
    registeredBy: user?.id ?? null,
    registeredAt: parsed.data.status === "registered" ? new Date() : null,
  }).returning();
  void auditMutation(req, { action: "create", entityType: "content_id_asset", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

router.patch("/rights/content-id/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params); if (!p.success) { badRequest(res, "Bad id"); return; }
  const parsed = ContentIdBody.partial().safeParse(req.body);
  if (!parsed.success) { badRequest(res, "validation"); return; }
  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "registered") patch.registeredAt = new Date();
  const [row] = await db.update(contentIdAssetsTable).set(patch).where(eq(contentIdAssetsTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "update", entityType: "content_id_asset", entityId: row.id, before: null, after: row });
  res.json(row);
});

router.delete("/rights/content-id/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const p = IdParam.safeParse(req.params); if (!p.success) { badRequest(res, "Bad id"); return; }
  const [del] = await db.delete(contentIdAssetsTable).where(eq(contentIdAssetsTable.id, p.data.id)).returning();
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "delete", entityType: "content_id_asset", entityId: del.id, before: del, after: null });
  res.sendStatus(204);
});

// ─── Territory rights overview ─────────────────────────────────────────────

router.get("/rights/territories", requireRole("admin", "manager"), async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT territory, count(*)::int AS holders_count,
           sum(CASE WHEN exclusive THEN 1 ELSE 0 END)::int AS exclusive_count,
           array_agg(DISTINCT rights_type) AS rights_types
    FROM rights_holders
    GROUP BY territory
    ORDER BY holders_count DESC
  `);
  res.json({ territories: rows.rows });
});

export default router;
