import { Router } from "express";
import { db, tracksTable, artistsTable, releasesTable } from "@workspace/db";
import { count, eq, desc, and, inArray, ne } from "drizzle-orm";
import { CreateTrackBody, UpdateTrackBody, GetTrackParams, UpdateTrackParams, DeleteTrackParams } from "@workspace/api-zod";
import { getDataScope, requireRole } from "../lib/auth";
import { releaseInScope } from "../lib/release-scope";
import { auditMutation } from "../lib/audit";
import { releaseEditableReason } from "./releases";
import { ObjectStorageService } from "../lib/objectStorage";
import { queueAudioQc } from "../services/audio-qc";
import OpenAI from "openai";
import { createReadStream } from "node:fs";

const storage = new ObjectStorageService();

const router = Router();

// Tracks have a direct artistId. For label scope we resolve the artist's labelId.
async function trackInScope(scope: ReturnType<typeof getDataScope>, t: { artistId: number }): Promise<boolean> {
  if (scope.fullAccess) return true;
  if (scope.role === "artist") return t.artistId === scope.artistId;
  if (scope.role === "label") {
    if (scope.labelId == null) return false;
    const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, t.artistId));
    return !!a && a.labelId === scope.labelId;
  }
  return false;
}

// Если у трека есть родительский релиз — нельзя править трек, если релиз
// в «закрытом» статусе (всё, кроме draft/rejected). Admin/manager — обходят.
async function releaseLockReasonForTrack(
  scope: ReturnType<typeof getDataScope>,
  releaseId: number | null | undefined,
): Promise<string | null> {
  if (scope.fullAccess) return null;
  if (releaseId == null) return null;
  const [rel] = await db.select({ status: releasesTable.status }).from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!rel) return null;
  return releaseEditableReason(scope, rel.status);
}

async function enrichTrack(t: typeof tracksTable.$inferSelect) {
  let artistName = "Unknown";
  const [artist] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, t.artistId));
  if (artist) artistName = artist.name;

  let releaseName = null;
  if (t.releaseId) {
    const [release] = await db.select({ title: releasesTable.title }).from(releasesTable).where(eq(releasesTable.id, t.releaseId));
    releaseName = release?.title ?? null;
  }

  return {
    ...t,
    artistName,
    releaseName,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/tracks", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  // Scope: artist sees only own tracks; label sees tracks of their label's artists.
  const scope = getDataScope(req);
  const releaseIdParam = req.query.release_id ? parseInt(req.query.release_id as string, 10) : undefined;
  const conditions: any[] = [];
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      conditions.push(eq(tracksTable.artistId, scope.artistId));
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      const labelArtists = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, scope.labelId));
      const ids = labelArtists.map(a => a.id);
      if (ids.length === 0) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      conditions.push(inArray(tracksTable.artistId, ids));
    }
  }
  // Фильтр по релизу: раньше query-параметр release_id игнорировался, поэтому
  // страница трека получала неполный/чужой список треков. Теперь учитываем его.
  if (releaseIdParam !== undefined && !Number.isNaN(releaseIdParam)) {
    conditions.push(eq(tracksTable.releaseId, releaseIdParam));
  }
  const where: any = conditions.length ? and(...conditions) : undefined;

  const tracks = await db.select().from(tracksTable).where(where).limit(limit).offset(offset).orderBy(desc(tracksTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(tracksTable).where(where);

  const data = await Promise.all(tracks.map(enrichTrack));

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

/** Есть ли среди вкладчиков (production/performers) хотя бы один продюсер
 *  с непустым именем. Роль «producer» либо «music_producer» (regex /producer/i)
 *  — зеркалит buildProducer в release-pusher.ts. */
function hasNamedContributor(arr: unknown): boolean {
  return Array.isArray(arr) && arr.some((m) => {
    if (!m || typeof m !== "object") return false;
    const name = (m as { name?: unknown }).name;
    return typeof name === "string" && name.trim() !== "";
  });
}
function trackHasProducer(production: unknown, performers: unknown): boolean {
  const hasProducerIn = (arr: unknown): boolean =>
    Array.isArray(arr) && arr.some((m) => {
      if (!m || typeof m !== "object") return false;
      const name = (m as { name?: unknown }).name;
      const role = (m as { role?: unknown }).role;
      return typeof name === "string" && name.trim() !== "" &&
        typeof role === "string" && /producer/i.test(role);
    });
  return hasProducerIn(production) || hasProducerIn(performers);
}
const PRODUCER_REQUIRED_MSG =
  "Укажите хотя бы одного продюсера (роль «Producer») в разделе Production. Без продюсера релиз не пройдёт модерацию в Broma16.";

router.post("/tracks", async (req, res): Promise<void> => {
  const parsed = CreateTrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Если при создании трека переданы именованные вкладчики, среди них обязан быть
  // продюсер. Скелеты (мастер заливки аудио, CSV-импорт, «добавить трек») шлют
  // пустые/отсутствующие production/performers — их не блокируем, продюсер
  // добавляется позже при редактировании метаданных.
  const created = parsed.data as Record<string, unknown>;
  if (
    (hasNamedContributor(created.production) || hasNamedContributor(created.performers)) &&
    !trackHasProducer(created.production, created.performers)
  ) {
    res.status(400).json({ error: PRODUCER_REQUIRED_MSG });
    return;
  }

  const scope = getDataScope(req);
  if (!(await trackInScope(scope, { artistId: parsed.data.artistId }))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  // Validate referential ownership: releaseId (if present) must be in scope and
  // must belong to the same artistId being assigned.
  if (parsed.data.releaseId != null) {
    const [rel] = await db.select({
      artistId: releasesTable.artistId, labelId: releasesTable.labelId, status: releasesTable.status,
    }).from(releasesTable).where(eq(releasesTable.id, parsed.data.releaseId));
    if (!rel) { res.status(400).json({ error: "Release not found" }); return; }
    if (rel.artistId !== parsed.data.artistId) {
      res.status(403).json({ error: "Release does not belong to artist" }); return;
    }
    if (!scope.fullAccess) {
      if (!(await releaseInScope(scope, rel))) { res.status(403).json({ error: "Forbidden" }); return; }
      // Релиз в закрытом статусе — добавлять треки нельзя.
      const lockReason = releaseEditableReason(scope, rel.status);
      if (lockReason) { res.status(409).json({ error: lockReason }); return; }
    }
  }

  // The generated Zod schema applies OpenAPI `default:` values for explicitStatus,
  // aiUsage, and audioStyle when those keys are absent from the request. We want
  // them to stay NULL in the DB so the UI can distinguish "user chose X" from
  // "user hasn't chosen yet". Strip the Zod-applied defaults when the client
  // didn't provide the fields.
  const insertData = {
    ...parsed.data,
    explicitStatus: ("explicitStatus" in req.body) ? parsed.data.explicitStatus : undefined,
    aiUsage:        ("aiUsage"        in req.body) ? parsed.data.aiUsage        : undefined,
    audioStyle:     ("audioStyle"     in req.body) ? parsed.data.audioStyle     : undefined,
  };

  const [track] = await db.insert(tracksTable).values(insertData).returning();
  void auditMutation(req, { action: "create", entityType: "track", entityId: track.id, before: null, after: track });
  const enriched = await enrichTrack(track);
  res.status(201).json(enriched);
});

router.get("/tracks/:id", async (req, res): Promise<void> => {
  const params = GetTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, params.data.id));
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  if (!(await trackInScope(getDataScope(req), track))) { res.status(403).json({ error: "Forbidden" }); return; }

  const enriched = await enrichTrack(track);
  res.json(enriched);
});

router.put("/tracks/:id", async (req, res): Promise<void> => {
  const params = UpdateTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Pre-flight scope check
  const [existing] = await db.select().from(tracksTable).where(eq(tracksTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Track not found" }); return; }
  const scope = getDataScope(req);
  if (!(await trackInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Релиз в закрытом статусе — править треки нельзя.
  const lockReason = await releaseLockReasonForTrack(scope, existing.releaseId);
  if (lockReason) { res.status(409).json({ error: lockReason }); return; }

  // Non-privileged users cannot reassign ownership (artistId/releaseId).
  if (!scope.fullAccess) {
    const body = parsed.data as Record<string, unknown>;
    if (body.artistId !== undefined && body.artistId !== existing.artistId) {
      res.status(403).json({ error: "Cannot change artistId" }); return;
    }
    if (body.releaseId !== undefined && body.releaseId !== existing.releaseId) {
      res.status(403).json({ error: "Cannot change releaseId" }); return;
    }
  }

  // Продюсер обязателен. Если запрос редактирует вкладчиков (в теле присутствует
  // ключ production или performers — это делает только редактор метаданных трека),
  // среди них обязан быть продюсер. Частичные обновления без этих ключей (заливка
  // аудио, массовое изменение жанра/explicit и т.п.) не блокируем.
  const reqBody = (req.body ?? {}) as Record<string, unknown>;
  const editsContributors =
    Object.prototype.hasOwnProperty.call(reqBody, "production") ||
    Object.prototype.hasOwnProperty.call(reqBody, "performers");
  if (editsContributors) {
    const pd = parsed.data as Record<string, unknown>;
    const production = pd.production ?? existing.production;
    const performers = pd.performers ?? existing.performers;
    if (!trackHasProducer(production, performers)) {
      res.status(400).json({ error: PRODUCER_REQUIRED_MSG });
      return;
    }
  }

  // Инвариант «один аудиофайл = один трек»: нельзя привязать файл, уже
  // используемый другим треком этого же релиза. Проверяем только при смене
  // audioUrl, чтобы не блокировать сохранение легаси-дубликатов без изменений.
  const nextAudioUrl = (parsed.data as Record<string, unknown>).audioUrl;
  if (
    typeof nextAudioUrl === "string" && nextAudioUrl &&
    nextAudioUrl !== existing.audioUrl && existing.releaseId != null
  ) {
    const [clash] = await db.select({ id: tracksTable.id })
      .from(tracksTable)
      .where(and(
        eq(tracksTable.releaseId, existing.releaseId),
        eq(tracksTable.audioUrl, nextAudioUrl),
        ne(tracksTable.id, existing.id),
      ));
    if (clash) {
      res.status(409).json({ error: "Этот аудиофайл уже привязан к другому треку релиза." });
      return;
    }
  }

  // Если клиент очищает spatial-файл (spatialAudioUrl=null), синхронно
  // сбрасываем биллинг-статус Atmos в "none", иначе остаётся "pending"/"charged"
  // от прошлой загрузки и пользователь повторно платит.
  // Same as CREATE: strip Zod-applied defaults for nullable enum fields when the
  // client didn't send those keys, so DB retains NULL instead of getting forced
  // back to "non_explicit" / "none" / "vocal" on every save.
  const patch: Record<string, unknown> = {
    ...parsed.data,
    explicitStatus: ("explicitStatus" in req.body) ? parsed.data.explicitStatus : undefined,
    aiUsage:        ("aiUsage"        in req.body) ? parsed.data.aiUsage        : undefined,
    audioStyle:     ("audioStyle"     in req.body) ? parsed.data.audioStyle     : undefined,
  };
  if (
    Object.prototype.hasOwnProperty.call(parsed.data, "spatialAudioUrl") &&
    (parsed.data as any).spatialAudioUrl == null
  ) {
    patch.spatialBillingStatus = "none";
  }

  const [track] = await db.update(tracksTable).set(patch).where(eq(tracksTable.id, params.data.id)).returning();
  // Смена аудиофайла → автоматический Audio QC (fire-and-forget).
  if (typeof nextAudioUrl === "string" && nextAudioUrl && nextAudioUrl !== existing.audioUrl) {
    queueAudioQc(track.id);
  }
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "track", entityId: track.id, before: existing, after: track });

  const enriched = await enrichTrack(track);
  res.json(enriched);
});

router.delete("/tracks/:id", async (req, res): Promise<void> => {
  const params = DeleteTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(tracksTable).where(eq(tracksTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Track not found" }); return; }
  const scope = getDataScope(req);
  if (!(await trackInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Релиз в закрытом статусе — удалять треки нельзя.
  const lockReason = await releaseLockReasonForTrack(scope, existing.releaseId);
  if (lockReason) { res.status(409).json({ error: lockReason }); return; }

  const [track] = await db.delete(tracksTable).where(eq(tracksTable.id, params.data.id)).returning();
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  void auditMutation(req, { action: "delete", entityType: "track", entityId: track.id, before: existing, after: null });

  res.sendStatus(204);
});

// ─── Transcribe lyrics via OpenAI Whisper ───────────────────────────────────
router.post("/tracks/:id/transcribe-lyrics", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid track id" }); return; }

  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, id));
  if (!track) { res.status(404).json({ error: "Track not found" }); return; }

  const scope = getDataScope(req);
  if (!(await trackInScope(scope, track))) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!track.audioUrl) {
    res.status(422).json({ error: "No audio file linked to this track." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OPENAI_API_KEY is not configured. Add it to the server secrets and restart." });
    return;
  }

  let file;
  try {
    file = await storage.getObjectEntityFile(track.audioUrl);
  } catch {
    res.status(404).json({ error: "Audio file not found in storage." });
    return;
  }

  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ error: "Audio file not found on disk." });
    return;
  }

  const openai = new OpenAI({ apiKey });

  const stream = createReadStream(file.fullPath());
  const filename = track.audioUrl.split("/").pop() ?? "audio.mp3";

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: await OpenAI.toFile(stream, filename),
    language: track.vocalLanguage ? track.vocalLanguage.slice(0, 2).toLowerCase() : undefined,
    response_format: "text",
  });

  res.json({ text: typeof transcription === "string" ? transcription : (transcription as any).text ?? "" });
});

export default router;
