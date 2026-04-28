// ─── KYC документы пользователя (Task #6) ─────────────────────────────────
// User uploads:
//   POST   /users/me/kyc-documents          → multipart upload (фронт KycTab)
//   POST   /users/me/kyc-documents/presign  → presigned PUT URL + objectPath
//   POST   /users/me/kyc-documents/confirm  → создаёт row после успешной загрузки
//   GET    /users/me/kyc-documents          → список своих доков со статусами
//   DELETE /users/me/kyc-documents/:id      → удалить свой pending-документ
//   POST   /users/me/submit-kyc             → отправить набор на ревью (kyc_status=pending)
// Streaming унифицирован с assets-стеком:
//   GET    /api/storage/objects/uploads/:objectId  (см. routes/assets.ts —
//   там добавлен fallback на kyc_documents с owner/admin/manager ACL).
// Admin:
//   GET    /admin/kyc/users                 → список юзеров с pending-доками
//   GET    /admin/kyc/users/:id/documents   → доки конкретного юзера
//   POST   /admin/kyc-documents/:id/approve|reject
//   POST   /admin/users/:id/kyc/approve|reject  → глобальный статус пользователя
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, kycDocumentsTable, usersTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { logger } from "../lib/logger";
import {
  ObjectStorageService, ObjectNotFoundError, objectStorageClient,
} from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
// Память — KYC-документы лимитированы 25МБ, безопасно держать в RAM на время
// апсёрта. Прямая передача в GCS bucket.file().save() через SDK.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

const KYC_KINDS = ["passport", "id_card", "company_reg", "tax_certificate", "bank_statement", "other"] as const;
const ALLOWED_MIME = /^(image\/(png|jpeg|jpg|webp|heic)|application\/pdf)$/i;
const MAX_KYC_BYTES = 25 * 1024 * 1024; // 25 MB на документ

const PresignBody = z.object({
  kind:      z.enum(KYC_KINDS),
  filename:  z.string().min(1).max(255),
  mimeType:  z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(MAX_KYC_BYTES),
}).strict();

const ConfirmBody = z.object({
  kind:        z.enum(KYC_KINDS),
  objectPath:  z.string().startsWith("/objects/"),
  storageKey:  z.string().min(1),
  filename:    z.string().min(1).max(255),
  mimeType:    z.string().min(1).max(255),
}).strict();

const RejectBody = z.object({
  reason: z.string().min(3).max(500),
}).strict();

function serializeDoc(d: typeof kycDocumentsTable.$inferSelect) {
  return {
    id: d.id,
    userId: d.userId,
    kind: d.kind,
    objectPath: d.objectPath,
    originalFilename: d.originalFilename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    rejectionReason: d.rejectionReason,
    reviewedBy: d.reviewedBy,
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    uploadedAt: d.uploadedAt.toISOString(),
  };
}

// ─── User: multipart upload (используется фронтом напрямую) ───────────────
// Помимо presign/confirm flow (для крупных файлов через signed URL), даём
// прямой multipart endpoint: фронт KycTab отправляет field "kind" + "file".
// Файл уходит в тот же бакет под /uploads/<uuid>, что и presign-flow, поэтому
// streaming endpoint /kyc/objects/uploads/:objectId работает одинаково.
type KycKind = (typeof KYC_KINDS)[number];
function isKycKind(v: unknown): v is KycKind {
  return typeof v === "string" && (KYC_KINDS as readonly string[]).includes(v);
}

router.post("/users/me/kyc-documents", upload.single("file"), async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const kindRaw: unknown = req.body?.kind;
  if (!isKycKind(kindRaw)) {
    res.status(400).json({ error: "Недопустимый тип документа" });
    return;
  }
  const file = req.file;
  if (!file) { res.status(400).json({ error: "Файл не передан" }); return; }
  if (!ALLOWED_MIME.test(file.mimetype)) {
    res.status(400).json({ error: "Только PDF и изображения (PNG/JPEG/WEBP/HEIC)" });
    return;
  }
  if (file.size > MAX_KYC_BYTES) {
    res.status(413).json({ error: "Файл превышает 25 МБ" });
    return;
  }

  // Загружаем буфер прямо в GCS через SDK (без signed URL — мы и есть бэк).
  let storageKey: string;
  let objectPath: string;
  try {
    const privateObjectDir = storage.getPrivateObjectDir();
    const objectId = randomUUID();
    storageKey = `${privateObjectDir}/uploads/${objectId}`;
    objectPath = `/objects/uploads/${objectId}`;
    const path = storageKey.startsWith("/") ? storageKey.slice(1) : storageKey;
    const [bucketName, ...objectParts] = path.split("/");
    const objectName = objectParts.join("/");
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).save(file.buffer, {
      contentType: file.mimetype,
      resumable: false,
      metadata: { contentType: file.mimetype },
    });
  } catch (err) {
    req.log?.error({ err }, "[kyc] direct upload failed");
    res.status(500).json({ error: "Не удалось сохранить файл" });
    return;
  }

  const [inserted] = await db.insert(kycDocumentsTable).values({
    userId: sessionUser.id,
    kind: kindRaw,
    storageKey,
    objectPath,
    originalFilename: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  }).returning();

  void auditMutation(req, {
    action: "create", entityType: "kyc_document", entityId: inserted.id,
    before: null, after: inserted,
  });

  res.status(201).json(serializeDoc(inserted));
});

// ─── User: presign upload ─────────────────────────────────────────────────
router.post("/users/me/kyc-documents/presign", async (req, res): Promise<void> => {
  const parsed = PresignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!ALLOWED_MIME.test(parsed.data.mimeType)) {
    res.status(400).json({ error: "Только PDF и изображения (PNG/JPEG/WEBP/HEIC)" });
    return;
  }
  try {
    const { uploadURL, objectPath, storageKey } = await storage.createUpload({
      contentType: parsed.data.mimeType,
      ttlSec: 900,
      maxBytes: MAX_KYC_BYTES,
    });
    res.json({ uploadURL, objectPath, storageKey,
      expiresAt: new Date(Date.now() + 900_000).toISOString() });
  } catch (err) {
    req.log?.error({ err }, "[kyc] presign failed");
    res.status(500).json({ error: "Не удалось получить URL для загрузки" });
  }
});

// ─── User: confirm — создаёт kyc_documents row ───────────────────────────
router.post("/users/me/kyc-documents/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!ALLOWED_MIME.test(parsed.data.mimeType)) {
    res.status(400).json({ error: "Недопустимый тип файла" });
    return;
  }

  const sessionUser = req.session.user!;

  // Подтверждаем что объект реально загружен
  let file;
  try {
    file = await storage.getObjectEntityFile(parsed.data.objectPath);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Файл не найден в хранилище — повтори загрузку" });
      return;
    }
    throw err;
  }
  const [meta] = await file.getMetadata();
  const sizeBytes = Number(meta.size ?? 0);
  if (!sizeBytes) { res.status(400).json({ error: "Файл пустой" }); return; }
  if (sizeBytes > MAX_KYC_BYTES) {
    await storage.deleteByObjectPath(parsed.data.objectPath).catch(() => {});
    res.status(413).json({ error: "Файл превышает 25 МБ" });
    return;
  }

  const [inserted] = await db.insert(kycDocumentsTable).values({
    userId: sessionUser.id,
    kind: parsed.data.kind,
    storageKey: parsed.data.storageKey,
    objectPath: parsed.data.objectPath,
    originalFilename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    sizeBytes,
  }).returning();

  void auditMutation(req, {
    action: "create", entityType: "kyc_document", entityId: inserted.id,
    before: null, after: inserted,
  });

  res.status(201).json(serializeDoc(inserted));
});

// ─── User: list own ───────────────────────────────────────────────────────
router.get("/users/me/kyc-documents", async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const docs = await db.select().from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.userId, sessionUser.id))
    .orderBy(desc(kycDocumentsTable.uploadedAt));
  res.json({ data: docs.map(serializeDoc) });
});

// User: delete own pending doc (заблокировано после submit)
router.delete("/users/me/kyc-documents/:id", async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [doc] = await db.select().from(kycDocumentsTable).where(eq(kycDocumentsTable.id, id));
  if (!doc) { res.sendStatus(204); return; }
  if (doc.userId !== sessionUser.id) { res.status(403).json({ error: "Forbidden" }); return; }
  if (doc.status !== "pending") {
    res.status(409).json({ error: "Нельзя удалять одобренные/отклонённые документы" });
    return;
  }
  const [me] = await db.select({ kycStatus: usersTable.kycStatus })
    .from(usersTable).where(eq(usersTable.id, sessionUser.id));
  if (me && (me.kycStatus === "pending" || me.kycStatus === "approved")) {
    res.status(409).json({
      error: "Документы отправлены на проверку — удаление запрещено. Дождись решения админа.",
    });
    return;
  }
  await storage.deleteByObjectPath(doc.objectPath).catch(() => {});
  await db.delete(kycDocumentsTable).where(eq(kycDocumentsTable.id, id));
  void auditMutation(req, {
    action: "delete", entityType: "kyc_document", entityId: id,
    before: doc, after: null,
  });
  res.sendStatus(204);
});

// ─── User: submit для ревью ───────────────────────────────────────────────
router.post("/users/me/submit-kyc", async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const docs = await db.select({ id: kycDocumentsTable.id })
    .from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.userId, sessionUser.id));
  if (docs.length === 0) {
    res.status(400).json({ error: "Сначала загрузи хотя бы один документ" });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser.id));
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (me.kycStatus === "approved") {
    res.status(409).json({ error: "KYC уже одобрен" });
    return;
  }
  const [updated] = await db.update(usersTable)
    .set({ kycStatus: "pending" })
    .where(eq(usersTable.id, sessionUser.id))
    .returning();
  void auditMutation(req, {
    action: "submit", entityType: "user_kyc", entityId: sessionUser.id,
    before: { id: me.id, kycStatus: me.kycStatus, kycCompletedAt: me.kycCompletedAt },
    after:  { id: updated.id, kycStatus: updated.kycStatus, kycCompletedAt: updated.kycCompletedAt },
  });
  res.json({ ok: true, kycStatus: updated.kycStatus });
});

// NOTE: streaming KYC файлов выполняется единым роутом /storage/objects/uploads/:objectId
// в routes/assets.ts (там же где cover/audio assets) — он определяет тип записи
// по objectPath и применяет нужный ACL (owner OR admin/manager для KYC).

// ─── ADMIN: список юзеров на ревью ────────────────────────────────────────
router.get("/admin/kyc/users", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const status = (req.query.status as string | undefined) ?? "pending";
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    kycStatus: usersTable.kycStatus,
    kycCompletedAt: usersTable.kycCompletedAt,
    country: usersTable.country,
  }).from(usersTable).where(eq(usersTable.kycStatus, status))
    .orderBy(desc(usersTable.updatedAt)).limit(200);

  // Для каждого юзера — счётчики документов
  const ids = users.map((u) => u.id);
  const docs = ids.length
    ? await db.select({ userId: kycDocumentsTable.userId, status: kycDocumentsTable.status })
        .from(kycDocumentsTable).where(inArray(kycDocumentsTable.userId, ids))
    : [];
  const counts = new Map<number, { total: number; pending: number; approved: number; rejected: number }>();
  for (const u of users) counts.set(u.id, { total: 0, pending: 0, approved: 0, rejected: 0 });
  for (const d of docs) {
    const c = counts.get(d.userId);
    if (!c) continue;
    c.total += 1;
    if (d.status === "pending")  c.pending += 1;
    if (d.status === "approved") c.approved += 1;
    if (d.status === "rejected") c.rejected += 1;
  }
  res.json({
    data: users.map((u) => ({
      ...u,
      kycCompletedAt: u.kycCompletedAt?.toISOString() ?? null,
      docs: counts.get(u.id) ?? { total: 0, pending: 0, approved: 0, rejected: 0 },
    })),
  });
});

// ─── ADMIN: документы конкретного юзера ───────────────────────────────────
router.get("/admin/kyc/users/:id/documents", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const docs = await db.select().from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.userId, userId))
    .orderBy(desc(kycDocumentsTable.uploadedAt));
  res.json({ data: docs.map(serializeDoc) });
});

// ─── ADMIN: approve/reject отдельный документ ─────────────────────────────
router.post("/admin/kyc-documents/:id/approve", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [doc] = await db.select().from(kycDocumentsTable).where(eq(kycDocumentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Документ не найден" }); return; }
  const reviewer = req.session.user!;
  const [updated] = await db.update(kycDocumentsTable)
    .set({ status: "approved", reviewedBy: reviewer.id, reviewedAt: new Date(), rejectionReason: null })
    .where(eq(kycDocumentsTable.id, id)).returning();
  void auditMutation(req, {
    action: "approve", entityType: "kyc_document", entityId: id,
    before: doc, after: updated,
  });
  res.json(serializeDoc(updated));
});

router.post("/admin/kyc-documents/:id/reject", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = RejectBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [doc] = await db.select().from(kycDocumentsTable).where(eq(kycDocumentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Документ не найден" }); return; }
  const reviewer = req.session.user!;
  const [updated] = await db.update(kycDocumentsTable)
    .set({ status: "rejected", reviewedBy: reviewer.id, reviewedAt: new Date(), rejectionReason: parsed.data.reason })
    .where(eq(kycDocumentsTable.id, id)).returning();
  void auditMutation(req, {
    action: "reject", entityType: "kyc_document", entityId: id,
    before: doc, after: updated,
  });
  res.json(serializeDoc(updated));
});

// ─── ADMIN: глобальный approve/reject юзера ───────────────────────────────
router.post("/admin/users/:id/kyc/approve", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  // Min-evidence: ≥1 doc, no pending, no rejected.
  const allDocs = await db.select({ status: kycDocumentsTable.status })
    .from(kycDocumentsTable).where(eq(kycDocumentsTable.userId, userId));
  if (allDocs.length === 0) {
    res.status(409).json({ error: "У пользователя нет загруженных документов — невозможно одобрить KYC" });
    return;
  }
  const pendingCount  = allDocs.filter((d) => d.status === "pending").length;
  const rejectedCount = allDocs.filter((d) => d.status === "rejected").length;
  if (pendingCount > 0) {
    res.status(409).json({ error: `Сначала разреши ${pendingCount} pending-документ(ов) индивидуально (approve/reject)` });
    return;
  }
  if (rejectedCount > 0) {
    res.status(409).json({ error: "У пользователя есть отклонённые документы — их нужно разрешить отдельно" });
    return;
  }
  const [updated] = await db.update(usersTable)
    .set({ kycStatus: "approved", kycCompletedAt: new Date() })
    .where(eq(usersTable.id, userId)).returning();
  void auditMutation(req, {
    action: "approve", entityType: "user_kyc", entityId: userId,
    before: { id: user.id, kycStatus: user.kycStatus, kycCompletedAt: user.kycCompletedAt },
    after:  { id: updated.id, kycStatus: updated.kycStatus, kycCompletedAt: updated.kycCompletedAt },
  });
  logger.info({ userId, by: req.session.user!.id }, "[kyc] user globally approved");
  res.json({ ok: true, kycStatus: updated.kycStatus, kycCompletedAt: updated.kycCompletedAt?.toISOString() ?? null });
});

router.post("/admin/users/:id/kyc/reject", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = RejectBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ kycStatus: "rejected", kycCompletedAt: null })
    .where(eq(usersTable.id, userId)).returning();
  void auditMutation(req, {
    action: "reject", entityType: "user_kyc", entityId: userId,
    before: { id: user.id, kycStatus: user.kycStatus, kycCompletedAt: user.kycCompletedAt },
    after:  { id: updated.id, kycStatus: updated.kycStatus, kycCompletedAt: updated.kycCompletedAt },
  });
  logger.info({ userId, reason: parsed.data.reason }, "[kyc] user globally rejected");
  res.json({ ok: true, kycStatus: updated.kycStatus });
});

export default router;
