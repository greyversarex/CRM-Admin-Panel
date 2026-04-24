import { Router } from "express";
import { createHash } from "crypto";
import { Readable } from "stream";
import * as mm from "music-metadata";
import { db, assetsTable, releasesTable, tracksTable, artistsTable, kycDocumentsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  PresignAssetUploadBody,
  ConfirmAssetUploadBody,
  GetAssetParams,
  DeleteAssetParams,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getDataScope } from "../lib/auth";

const router = Router();
const storage = new ObjectStorageService();

// Hard caps in bytes — see project settings (200 MB audio, 25 MB cover/image).
const MAX_BYTES: Record<string, number> = {
  audio:    200 * 1024 * 1024,
  cover:     25 * 1024 * 1024,
  image:     25 * 1024 * 1024,
  document:  25 * 1024 * 1024,
};

// Validate that the caller can read/write a given release row.
async function assertReleaseInScope(req: any, releaseId: number): Promise<{ artistId: number; labelId: number | null } | null> {
  const [r] = await db.select({ artistId: releasesTable.artistId, labelId: releasesTable.labelId })
    .from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!r) return null;
  const scope = getDataScope(req);
  if (scope.fullAccess) return r;
  if (scope.role === "artist" && scope.artistId === r.artistId) return r;
  if (scope.role === "label"  && scope.labelId  === r.labelId)  return r;
  return null;
}

// Validate that the caller can read/write a given track row.
async function assertTrackInScope(req: any, trackId: number): Promise<{ artistId: number; releaseId: number | null; labelId: number | null } | null> {
  const [t] = await db.select({ artistId: tracksTable.artistId, releaseId: tracksTable.releaseId })
    .from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!t) return null;
  const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, t.artistId));
  const labelId = a?.labelId ?? null;
  const scope = getDataScope(req);
  if (scope.fullAccess) return { ...t, labelId };
  if (scope.role === "artist" && scope.artistId === t.artistId) return { ...t, labelId };
  if (scope.role === "label"  && scope.labelId  === labelId)    return { ...t, labelId };
  return null;
}

function serialize(a: typeof assetsTable.$inferSelect) {
  return {
    id: a.id,
    kind: a.kind,
    objectPath: a.objectPath,
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    sha256: a.sha256,
    durationSeconds: a.durationSeconds,
    releaseId: a.releaseId,
    trackId: a.trackId,
    artistId: a.artistId,
    labelId: a.labelId,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ─── List ────────────────────────────────────────────────────────────────
router.get("/assets", async (req, res): Promise<void> => {
  const releaseId = req.query.release_id ? parseInt(req.query.release_id as string, 10) : undefined;
  const trackId   = req.query.track_id   ? parseInt(req.query.track_id   as string, 10) : undefined;
  const kind      = req.query.kind as string | undefined;

  const conditions: any[] = [];
  if (releaseId) {
    if (!(await assertReleaseInScope(req, releaseId))) { res.status(403).json({ error: "Forbidden" }); return; }
    conditions.push(eq(assetsTable.releaseId, releaseId));
  }
  if (trackId) {
    if (!(await assertTrackInScope(req, trackId))) { res.status(403).json({ error: "Forbidden" }); return; }
    conditions.push(eq(assetsTable.trackId, trackId));
  }
  if (kind) conditions.push(eq(assetsTable.kind, kind));

  // Without a release/track filter, restrict by scope: artist/label only see their own.
  if (!releaseId && !trackId) {
    const scope = getDataScope(req);
    if (!scope.fullAccess) {
      if (scope.role === "artist") {
        if (scope.artistId == null) { res.json([]); return; }
        conditions.push(eq(assetsTable.artistId, scope.artistId));
      } else if (scope.role === "label") {
        if (scope.labelId == null) { res.json([]); return; }
        conditions.push(eq(assetsTable.labelId, scope.labelId));
      }
    }
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(assetsTable).where(where).orderBy(desc(assetsTable.createdAt)).limit(200);
  res.json(rows.map(serialize));
});

// ─── Presign ────────────────────────────────────────────────────────────
router.post("/assets/presign", async (req, res): Promise<void> => {
  const parsed = PresignAssetUploadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { kind, sizeBytes, releaseId, trackId } = parsed.data;

  const cap = MAX_BYTES[kind];
  if (cap && sizeBytes > cap) {
    res.status(413).json({ error: `File too large. Max ${cap} bytes for ${kind}.` });
    return;
  }
  if (releaseId && !(await assertReleaseInScope(req, releaseId))) {
    res.status(403).json({ error: "Forbidden: release not in scope" }); return;
  }
  if (trackId && !(await assertTrackInScope(req, trackId))) {
    res.status(403).json({ error: "Forbidden: track not in scope" }); return;
  }

  try {
    const { uploadURL, objectPath, storageKey } = await storage.createUpload({
      contentType: parsed.data.mimeType,
      ttlSec: 900,
    });
    res.json({
      uploadURL,
      objectPath,
      storageKey,
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
    });
  } catch (err: any) {
    req.log?.error({ err }, "presign failed");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ─── Confirm ────────────────────────────────────────────────────────────
// Streams the just-uploaded GCS object once to compute sha256 + (audio) duration,
// then persists the asset row. If `attach` is true, also writes the resulting
// objectPath into release.coverUrl / track.audioUrl for backward-compat with the
// existing `*Url` columns the UI already reads.
router.post("/assets/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmAssetUploadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const body = parsed.data;
  const attach = body.attach !== false;

  // Enforce kind ↔ MIME consistency (clients can lie via XHR; the GCS object
  // is the source of truth, but we still want a coarse early reject).
  const mimePrefix: Record<string, string> = { audio: "audio/", cover: "image/", image: "image/" };
  const required = mimePrefix[body.kind];
  if (required && !body.mimeType.toLowerCase().startsWith(required)) {
    res.status(400).json({ error: `MIME ${body.mimeType} does not match kind=${body.kind}` });
    return;
  }

  // Resolve scope through release/track so we know who this belongs to.
  let scopedArtistId: number | null = null;
  let scopedLabelId: number | null = null;
  if (body.releaseId) {
    const r = await assertReleaseInScope(req, body.releaseId);
    if (!r) { res.status(403).json({ error: "Forbidden: release not in scope" }); return; }
    scopedArtistId = r.artistId; scopedLabelId = r.labelId;
  }
  if (body.trackId) {
    const t = await assertTrackInScope(req, body.trackId);
    if (!t) { res.status(403).json({ error: "Forbidden: track not in scope" }); return; }
    // Track must belong to the supplied release if both are provided.
    if (body.releaseId && t.releaseId !== body.releaseId) {
      res.status(400).json({ error: "trackId does not belong to releaseId" }); return;
    }
    if (!scopedArtistId) scopedArtistId = t.artistId;
    if (!scopedLabelId)  scopedLabelId  = t.labelId;
  }
  if (!body.releaseId && !body.trackId) {
    const scope = getDataScope(req);
    if (!scope.fullAccess) {
      scopedArtistId = scope.artistId;
      scopedLabelId  = scope.labelId;
    }
  }

  // Confirm the file exists in GCS at the path we presigned, hash it, and
  // (for audio) read duration metadata.
  let file;
  try {
    file = await storage.getObjectEntityFile(body.objectPath);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Uploaded object not found at the given path" });
      return;
    }
    throw err;
  }

  const [meta] = await file.getMetadata();
  const sizeBytes = Number(meta.size ?? 0);
  if (!sizeBytes) {
    res.status(400).json({ error: "Uploaded object is empty or unreadable" });
    return;
  }
  const cap = MAX_BYTES[body.kind];
  if (cap && sizeBytes > cap) {
    // Best-effort cleanup so we don't leak orphaned files past quota.
    await storage.deleteByObjectPath(body.objectPath).catch(() => {});
    res.status(413).json({ error: `File too large. Max ${cap} bytes for ${body.kind}.` });
    return;
  }

  // Compute SHA-256 over the uploaded bytes.
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const s = file.createReadStream();
    s.on("data", (c: Buffer) => hash.update(c));
    s.on("end", () => resolve());
    s.on("error", reject);
  });
  const sha256 = hash.digest("hex");

  // For audio, extract duration in a second pass (music-metadata reads only the
  // header, so this is cheap even for 200 MB files).
  let durationSeconds: number | null = null;
  if (body.kind === "audio") {
    try {
      const stream = file.createReadStream();
      const audioMeta = await mm.parseStream(
        stream as unknown as Readable,
        { mimeType: body.mimeType, size: sizeBytes },
        { duration: true },
      );
      durationSeconds = audioMeta.format.duration ? Math.round(audioMeta.format.duration) : null;
      stream.destroy();
    } catch (err) {
      req.log?.warn({ err }, "music-metadata failed");
    }
  }

  // NOTE: we DO NOT dedup by sha256 across owners. Reusing a row from another
  // scope leaks associations (cross-tenant metadata) and confuses ACL on read.
  // Each confirm creates its own asset row pointing at the freshly-uploaded
  // object; storage-level dedup is a future optimization.

  const sessionUserId = req.session?.user?.id ?? null;

  // storageKey is derived server-side from objectPath. We accept it in the
  // schema for forward compatibility but never trust the client value.
  const computedStorageKey = body.objectPath.startsWith("/objects/")
    ? body.objectPath.slice("/objects/".length)
    : body.storageKey;

  const [inserted] = await db.insert(assetsTable).values({
    kind: body.kind,
    storageKey: computedStorageKey,
    objectPath: body.objectPath,
    filename: body.filename,
    mimeType: body.mimeType,
    sizeBytes,
    sha256,
    durationSeconds,
    releaseId: body.releaseId ?? null,
    trackId: body.trackId ?? null,
    artistId: scopedArtistId,
    labelId: scopedLabelId,
    uploadedBy: sessionUserId,
  }).returning();

  if (attach) {
    await maybeAttach(inserted, body.releaseId ?? null, body.trackId ?? null);
  }

  res.status(201).json(serialize(inserted));
});

// Update release.coverUrl / track.audioUrl + track.durationSeconds so the rest
// of the app keeps working without needing to join through `assets`.
async function maybeAttach(
  asset: typeof assetsTable.$inferSelect,
  releaseId: number | null,
  trackId: number | null,
): Promise<void> {
  if (releaseId && asset.kind === "cover") {
    await db.update(releasesTable).set({ coverUrl: asset.objectPath }).where(eq(releasesTable.id, releaseId));
  }
  if (trackId && asset.kind === "audio") {
    const patch: Partial<typeof tracksTable.$inferInsert> = { audioUrl: asset.objectPath };
    if (asset.durationSeconds != null) patch.durationSeconds = asset.durationSeconds;
    await db.update(tracksTable).set(patch).where(eq(tracksTable.id, trackId));
  }
}

// ─── Get one (with fresh signed download URL) ───────────────────────────
router.get("/assets/:id", async (req, res): Promise<void> => {
  const params = GetAssetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, params.data.id));
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (!(await canAccessAsset(req, asset))) { res.status(403).json({ error: "Forbidden" }); return; }

  let downloadUrl: string;
  try {
    downloadUrl = await storage.getDownloadURL(asset.objectPath, 300);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "Underlying file missing" }); return; }
    throw err;
  }
  res.json({ ...serialize(asset), downloadUrl });
});

// ─── Delete ─────────────────────────────────────────────────────────────
router.delete("/assets/:id", async (req, res): Promise<void> => {
  const params = DeleteAssetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, params.data.id));
  if (!asset) { res.sendStatus(204); return; }
  if (!(await canAccessAsset(req, asset))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Detach from release/track first so we don't leave dangling URLs.
  if (asset.releaseId && asset.kind === "cover") {
    await db.update(releasesTable).set({ coverUrl: null })
      .where(and(eq(releasesTable.id, asset.releaseId), eq(releasesTable.coverUrl, asset.objectPath)));
  }
  if (asset.trackId && asset.kind === "audio") {
    await db.update(tracksTable).set({ audioUrl: null })
      .where(and(eq(tracksTable.id, asset.trackId), eq(tracksTable.audioUrl, asset.objectPath)));
  }

  await storage.deleteByObjectPath(asset.objectPath).catch(() => {});
  await db.delete(assetsTable).where(eq(assetsTable.id, asset.id));
  res.sendStatus(204);
});

async function canAccessAsset(req: any, a: typeof assetsTable.$inferSelect): Promise<boolean> {
  const scope = getDataScope(req);
  if (scope.fullAccess) return true;
  if (scope.role === "artist") return a.artistId != null && a.artistId === scope.artistId;
  if (scope.role === "label")  return a.labelId  != null && a.labelId  === scope.labelId;
  return false;
}

// ─── In-browser proxy: stream an asset/KYC doc by its objectPath ────────
// Used by <img src> for covers and by the in-app audio player so the browser
// can fetch the file with its session cookie attached (no signed URL needed).
// Scope is enforced per-record:
//   • assets row → release/artist/label scope (canAccessAsset)
//   • kyc_documents row → owner OR admin/manager (KYC sensitive PII)
router.get("/storage/objects/uploads/:objectId", async (req, res): Promise<void> => {
  const objectPath = `/objects/uploads/${req.params.objectId}`;

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.objectPath, objectPath));
  let mimeType: string | null = null;
  let cacheControl = "private, max-age=300";
  let dispositionFilename: string | null = null;
  let acceptRanges = true;

  if (asset) {
    if (!(await canAccessAsset(req, asset))) { res.status(403).json({ error: "Forbidden" }); return; }
    mimeType = asset.mimeType;
  } else {
    // KYC document fallback: same /objects/uploads/ namespace, отдельный ACL.
    const [doc] = await db.select().from(kycDocumentsTable)
      .where(eq(kycDocumentsTable.objectPath, objectPath));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    const sessionUser = req.session.user;
    if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }
    const isOwner = doc.userId === sessionUser.id;
    const isReviewer = sessionUser.role === "admin" || sessionUser.role === "manager";
    if (!isOwner && !isReviewer) { res.status(403).json({ error: "Forbidden" }); return; }
    mimeType = doc.mimeType;
    cacheControl = "private, no-store"; // sensitive PII — браузер не кэширует
    dispositionFilename = doc.originalFilename;
    acceptRanges = false; // KYC мелкие — диапазоны не нужны
  }

  let file;
  try {
    file = await storage.getObjectEntityFile(objectPath);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "Underlying file missing" }); return; }
    throw err;
  }
  const [meta] = await file.getMetadata();
  const totalSize = Number(meta.size ?? 0);
  res.setHeader("Content-Type", (meta.contentType as string) || mimeType || "application/octet-stream");
  res.setHeader("Cache-Control", cacheControl);
  if (acceptRanges) res.setHeader("Accept-Ranges", "bytes");
  if (dispositionFilename) {
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(dispositionFilename)}"`);
  }

  // ─── Range support (HTML5 audio seek for large files) ────────────────
  const rangeHeader = acceptRanges ? req.headers.range : undefined;
  let start = 0;
  let end = totalSize ? totalSize - 1 : 0;
  let isPartial = false;

  if (rangeHeader && totalSize) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!m) {
      res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
      return;
    }
    const reqStart = m[1] === "" ? null : Number(m[1]);
    const reqEnd   = m[2] === "" ? null : Number(m[2]);
    if (reqStart === null && reqEnd !== null) {
      // suffix range: last N bytes
      start = Math.max(0, totalSize - reqEnd);
      end = totalSize - 1;
    } else {
      start = reqStart ?? 0;
      end   = reqEnd ?? totalSize - 1;
    }
    if (start > end || start < 0 || end >= totalSize) {
      res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
      return;
    }
    isPartial = true;
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
  }

  const length = end - start + 1;
  if (totalSize) res.setHeader("Content-Length", String(length));

  const stream = file.createReadStream(isPartial ? { start, end } : undefined);
  stream.on("error", (err) => {
    req.log?.error({ err }, "stream error");
    if (!res.headersSent) res.sendStatus(500);
    else res.end();
  });
  stream.pipe(res);
});

export default router;
