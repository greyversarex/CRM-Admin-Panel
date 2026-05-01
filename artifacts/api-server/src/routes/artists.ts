import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { db, artistsTable, releasesTable, tracksTable, labelsTable, usersTable, transactionsTable, usageReportsTable } from "@workspace/db";
import { count, eq, ilike, and, desc, sql } from "drizzle-orm";
import { CreateArtistBody, UpdateArtistBody, GetArtistParams, UpdateArtistParams, DeleteArtistParams, GetArtistStatsParams } from "@workspace/api-zod";
import { getDataScope, requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { generateTempPassword } from "../lib/kycUtils";
import { sendMailAndForget } from "../lib/mail";
import { logger } from "../lib/logger";
import { createNotification } from "../services/notifications";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";

const router = Router();

// Загрузка фото артиста из формы. Файл уходит в GCS под
// `${PRIVATE_OBJECT_DIR}/uploads/avatars/<uuid>` и отдаётся через тот же
// GET /api/users/avatars/:objectId, что и юзер-аватары — он гейтит выдачу
// через requireAuth, так что любой залогиненный пользователь увидит фото
// (для публичных страниц — то, что нам и нужно для UI).
const artistImageStorage = new ObjectStorageService();
const artistImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
const ALLOWED_IMAGE_MIME = /^image\/(png|jpe?g|gif|webp)$/i;
const IMAGE_PATH_PREFIX = "/api/users/avatars/";

// Чистая обёртка над multer: переводим LIMIT_FILE_SIZE в 413, остальные multer-ошибки
// → 400 с понятным русскоязычным текстом, а не дефолтная HTML-страница 500.
function handleArtistImageUpload(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  artistImageUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Файл превышает 5 МБ" }); return;
      }
      res.status(400).json({ error: `Ошибка загрузки: ${err.message}` }); return;
    }
    next(err);
  });
}

router.post(
  "/artists/upload-image",
  requireRole("admin", "manager", "label"),
  handleArtistImageUpload,
  async (req, res): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Файл не передан" }); return; }
    if (!ALLOWED_IMAGE_MIME.test(file.mimetype)) {
      res.status(400).json({ error: "Только PNG, JPEG, GIF, WEBP" }); return;
    }

    const objectId = randomUUID();
    const privateDir = artistImageStorage.getPrivateObjectDir();
    const storageKey = `${privateDir}/uploads/avatars/${objectId}`;
    const path = storageKey.startsWith("/") ? storageKey.slice(1) : storageKey;
    const [bucketName, ...rest] = path.split("/");
    const objectName = rest.join("/");

    try {
      await objectStorageClient.bucket(bucketName).file(objectName).save(file.buffer, {
        contentType: file.mimetype,
        resumable: false,
        metadata: { contentType: file.mimetype },
      });
    } catch (err) {
      req.log?.error({ err }, "[artist-image] upload failed");
      res.status(500).json({ error: "Не удалось сохранить файл" });
      return;
    }

    res.status(201).json({ imageUrl: `${IMAGE_PATH_PREFIX}${objectId}` });
  },
);

function parseId(raw: string | string[]): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(str, 10);
}

router.get("/artists", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const search = req.query.search as string | undefined;
  const queryLabelId = req.query.label_id ? parseInt(req.query.label_id as string, 10) : undefined;
  const offset = (page - 1) * limit;
  const scope = getDataScope(req);

  // Scoping: admin/manager honor query; label sees only own labelId; artist sees only own artist.
  const conditions: any[] = [];
  if (scope.fullAccess) {
    if (queryLabelId && Number.isFinite(queryLabelId)) conditions.push(eq(artistsTable.labelId, queryLabelId));
  } else if (scope.role === "label") {
    if (scope.labelId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
    if (queryLabelId !== undefined && queryLabelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
    conditions.push(eq(artistsTable.labelId, scope.labelId));
  } else if (scope.role === "artist") {
    if (scope.artistId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
    conditions.push(eq(artistsTable.id, scope.artistId));
  }
  if (search) conditions.push(ilike(artistsTable.name, `%${search}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const artists = await db.select({
    id: artistsTable.id,
    name: artistsTable.name,
    slug: artistsTable.slug,
    imageUrl: artistsTable.imageUrl,
    genre: artistsTable.genre,
    bio: artistsTable.bio,
    country: artistsTable.country,
    phone: artistsTable.phone,
    labelId: artistsTable.labelId,
    spotifyId: artistsTable.spotifyId,
    appleId: artistsTable.appleId,
    socialLinks: artistsTable.socialLinks,
    status: artistsTable.status,
    createdAt: artistsTable.createdAt,
    updatedAt: artistsTable.updatedAt,
  }).from(artistsTable).where(where).limit(limit).offset(offset).orderBy(desc(artistsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(artistsTable).where(where);

  const labelIds = artists.map(a => a.labelId).filter(Boolean) as number[];
  const labels = labelIds.length > 0 ? await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable) : [];
  const labelMap = new Map(labels.map(l => [l.id, l.name]));

  const releaseCounts = await db.select({ artistId: releasesTable.artistId, count: count() })
    .from(releasesTable).groupBy(releasesTable.artistId);
  const releaseCountMap = new Map(releaseCounts.map(r => [r.artistId, r.count]));

  const data = artists.map(a => ({
    ...a,
    labelName: a.labelId ? (labelMap.get(a.labelId) ?? null) : null,
    totalReleases: releaseCountMap.get(a.id) ?? 0,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
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

router.post("/artists", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
  const parsed = CreateArtistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Label users can sign artists only under their own label.
  const scope = getDataScope(req);
  const data = { ...parsed.data };
  if (scope.role === "label") {
    if (scope.labelId == null) { res.status(403).json({ error: "Label scope missing" }); return; }
    data.labelId = scope.labelId;
  }

  const slug = data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const [artist] = await db.insert(artistsTable).values({ ...data, slug }).returning();
  void auditMutation(req, { action: "create", entityType: "artist", entityId: artist.id, before: null, after: artist });

  const [totalReleases] = await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.artistId, artist.id));

  res.status(201).json({
    ...artist,
    labelName: null,
    totalReleases: totalReleases.count,
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
  });
});

router.get("/artists/:id", async (req, res): Promise<void> => {
  const params = GetArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [artist] = await db.select().from(artistsTable).where(eq(artistsTable.id, params.data.id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  // Scope check: artist sees only own; label sees only own-label artists.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist" && artist.id !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (scope.role === "label"  && (scope.labelId == null || artist.labelId !== scope.labelId)) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const releases = await db.select().from(releasesTable).where(eq(releasesTable.artistId, artist.id)).limit(10);
  const recentTracks = await db.select().from(tracksTable).where(eq(tracksTable.artistId, artist.id)).limit(10);

  let labelName = null;
  if (artist.labelId) {
    const [label] = await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, artist.labelId));
    labelName = label?.name ?? null;
  }

  res.json({
    ...artist,
    labelName,
    totalReleases: releases.length,
    releases: releases.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
    recentTracks: recentTracks.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
  });
});

router.put("/artists/:id", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
  const params = UpdateArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateArtistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(artistsTable).where(eq(artistsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Artist not found" }); return; }

  // Label users can edit only artists under their label, and cannot move artist to another label.
  const scope = getDataScope(req);
  const updateData = { ...parsed.data };
  if (scope.role === "label") {
    if (scope.labelId == null || existing.labelId !== scope.labelId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    updateData.labelId = scope.labelId;
  }

  const [artist] = await db.update(artistsTable).set(updateData).where(eq(artistsTable.id, params.data.id)).returning();
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "artist", entityId: artist.id, before: existing, after: artist });

  const [totalReleases] = await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.artistId, artist.id));

  res.json({
    ...artist,
    labelName: null,
    totalReleases: totalReleases.count,
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
  });
});

router.delete("/artists/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = DeleteArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [artist] = await db.delete(artistsTable).where(eq(artistsTable.id, params.data.id)).returning();
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  void auditMutation(req, { action: "delete", entityType: "artist", entityId: artist.id, before: artist, after: null });

  res.sendStatus(204);
});

router.get("/artists/:id/stats", async (req, res): Promise<void> => {
  const params = GetArtistStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Scope: artist may only read own stats; label only stats of artists in their label.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null || params.data.id !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.status(403).json({ error: "Forbidden" }); return; }
      const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, params.data.id));
      if (!a || a.labelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
    } else {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  // Реальная статистика из БД: usage_reports (стримы по платформам) + transactions (выручка).
  // Если данных нет — отдаём честные нули, без выдуманных миллионов.
  const platformRows = await db
    .select({
      platform: usageReportsTable.platform,
      streams:  sql<number>`coalesce(sum(${usageReportsTable.streams}), 0)::int`,
      revenue:  sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)::text`,
    })
    .from(usageReportsTable)
    .where(eq(usageReportsTable.artistId, params.data.id))
    .groupBy(usageReportsTable.platform);

  const totalStreams = platformRows.reduce((acc, r) => acc + Number(r.streams || 0), 0);

  // Доход берём из transactions (источник правды по деньгам), а не из revenue в usage_reports.
  const [txAgg] = await db
    .select({
      revenue: sql<string>`coalesce(sum(case when ${transactionsTable.type} = 'dsp_revenue' then ${transactionsTable.amount} else 0 end), 0)::text`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.artistId, params.data.id));
  const totalRevenue = parseFloat(txAgg?.revenue ?? "0");

  // Monthly listeners — из последнего отчёта по периодам. Если нет данных — 0.
  // (Точное значение требует отдельного отчёта DSP; пока используем стримы / 30 как приближение.)
  const monthlyListeners = totalStreams > 0 ? Math.round(totalStreams / 30) : 0;

  const streamsByPlatform = platformRows
    .map((r) => {
      const streams = Number(r.streams || 0);
      const revenue = parseFloat(r.revenue || "0");
      const percentage = totalStreams > 0 ? parseFloat(((streams / totalStreams) * 100).toFixed(1)) : 0;
      return { platform: r.platform, streams, revenue, percentage };
    })
    .sort((a, b) => b.streams - a.streams);

  const topPlatform = streamsByPlatform[0]?.platform ?? null;

  res.json({
    totalStreams,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    monthlyListeners,
    topPlatform,
    streamsByPlatform,
  });
});

// ─── POST /artists/:id/invite-user ─────────────────────────────────────────
// Лейбл (или admin/manager) создаёт User с ролью artist, привязанный к
// существующему артисту, и отправляет на email временный пароль.
const InviteBody = z.object({
  email: z.string().email("Невалидный email"),
  name: z.string().min(1).max(120).optional(),
});

router.post("/artists/:id/invite-user", requireRole("admin", "manager", "label"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [artist] = await db.select().from(artistsTable).where(eq(artistsTable.id, id));
  if (!artist) { res.status(404).json({ error: "Артист не найден" }); return; }

  const scope = getDataScope(req);
  // Лейбл может приглашать только своих артистов.
  if (scope.role === "label") {
    if (scope.labelId == null || artist.labelId !== scope.labelId) {
      res.status(403).json({ error: "Артист не принадлежит вашему лейблу" });
      return;
    }
  }

  // Email уникален. Если уже занят — 409.
  const email = parsed.data.email.trim().toLowerCase();
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(409).json({ error: "Пользователь с таким email уже существует" }); return; }

  const tempPassword = generateTempPassword(12);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [user] = await db.insert(usersTable).values({
    name: parsed.data.name?.trim() || artist.name,
    email,
    passwordHash,
    role: "artist",
    status: "active",
    artistId: artist.id,
    labelId: artist.labelId,
    country: artist.country,
  }).returning();

  void auditMutation(req, { action: "invite", entityType: "user", entityId: user.id, before: null, after: user });

  sendMailAndForget({
    to: user.email,
    subject: "Приглашение в Tajik Music CRM",
    text:
      `Здравствуйте, ${user.name}!\n\n` +
      `Лейбл пригласил вас в Tajik Music CRM в роли артиста.\n\n` +
      `Логин (email): ${user.email}\n` +
      `Временный пароль: ${tempPassword}\n\n` +
      `Войдите по адресу: ${process.env.PUBLIC_APP_URL ?? "/login"}\n` +
      `После входа смените пароль в разделе «Профиль → Безопасность».`,
  });
  logger.info({ artistId: id, userId: user.id, email: user.email }, "[artists] invite-user — onboarding email queued");

  void createNotification({
    userId: user.id,
    type: "artist_invited",
    title: "🎉 Добро пожаловать в Tajik Music CRM",
    body: "Лейбл пригласил вас. Заполните профиль и пройдите KYC, чтобы получать выплаты.",
    entityType: "general",
    link: "/profile",
  });

  // tempPassword отдаём ТОЛЬКО в этом ответе (out-of-band страховка).
  res.status(201).json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, artistId: user.artistId },
    tempPassword,
  });
});

export default router;
