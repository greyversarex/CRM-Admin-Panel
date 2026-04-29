/**
 * Catalog — Bulk Edit
 *
 * POST /api/catalog/bulk-edit
 *   { entity: 'release'|'track'|'artist', ids: number[], patch: {...} }
 *
 * Доступ: admin/manager (общий guard в routes/index.ts на /catalog).
 */
import { Router } from "express";
import { z } from "zod";
import { db, releasesTable, tracksTable, artistsTable, labelsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

const router = Router();

const ReleasePatch = z.object({
  status: z.enum(["draft", "pending", "approved", "rejected", "scheduled", "live", "takedown_requested", "takedown"]).optional(),
  primaryGenre: z.string().max(80).optional(),
  secondaryGenre: z.string().max(80).optional(),
  language: z.string().max(20).optional(),
  isExplicit: z.boolean().optional(),
  labelId: z.number().int().nullable().optional(),
  releaseDate: z.string().datetime().optional(),
}).strict();

const TrackPatch = z.object({
  isExplicit: z.boolean().optional(),
  language: z.string().max(20).optional(),
  primaryGenre: z.string().max(80).optional(),
  secondaryGenre: z.string().max(80).optional(),
}).strict();

const ArtistPatch = z.object({
  genre: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
}).strict();

const LabelPatch = z.object({
  status: z.enum(["active", "inactive", "blocked"]).optional(),
  country: z.string().max(80).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
}).strict();

const BulkBody = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("release"), ids: z.array(z.number().int().positive()).min(1).max(500), patch: ReleasePatch }),
  z.object({ entity: z.literal("track"),   ids: z.array(z.number().int().positive()).min(1).max(500), patch: TrackPatch   }),
  z.object({ entity: z.literal("artist"),  ids: z.array(z.number().int().positive()).min(1).max(500), patch: ArtistPatch  }),
  z.object({ entity: z.literal("label"),   ids: z.array(z.number().int().positive()).min(1).max(500), patch: LabelPatch   }),
]);

router.post("/catalog/bulk-edit", async (req, res) => {
  const parsed = BulkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const { entity, ids, patch } = parsed.data;

  const patchAny = { ...patch, updatedAt: new Date() } as Record<string, unknown>;
  if ("releaseDate" in patchAny && typeof patchAny.releaseDate === "string") {
    patchAny.releaseDate = new Date(patchAny.releaseDate);
  }
  if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Пустой patch" }); return; }

  let affected: Array<{ id: number }> = [];
  if (entity === "release") {
    affected = await db.update(releasesTable).set(patchAny).where(inArray(releasesTable.id, ids)).returning({ id: releasesTable.id });
  } else if (entity === "track") {
    affected = await db.update(tracksTable).set(patchAny).where(inArray(tracksTable.id, ids)).returning({ id: tracksTable.id });
  } else if (entity === "artist") {
    affected = await db.update(artistsTable).set(patchAny).where(inArray(artistsTable.id, ids)).returning({ id: artistsTable.id });
  } else {
    affected = await db.update(labelsTable).set(patchAny).where(inArray(labelsTable.id, ids)).returning({ id: labelsTable.id });
  }

  void auditMutation(req, {
    action: "bulk_edit", entityType: entity, entityId: 0,
    before: { ids }, after: { patch, affectedCount: affected.length },
  });
  res.json({ ok: true, entity, affectedCount: affected.length, ids: affected.map((r) => r.id) });
});

export default router;
