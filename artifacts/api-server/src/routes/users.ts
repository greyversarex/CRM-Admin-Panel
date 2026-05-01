import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db, usersTable } from "@workspace/db";
import { count, eq, desc, ilike, or, and, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { isValidIban, isValidSwift, maskBankInfoFor, generateTempPassword } from "../lib/kycUtils";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import bcrypt from "bcryptjs";
import { sendMailAndForget } from "../lib/mail";

const adminOnly = requireRole("admin", "manager");
// СОЗДАНИЕ юзеров — только настоящий admin. Менеджер не должен создавать
// аккаунты (тем более с ролью admin) — иначе можно через UI / прямой API
// эскалировать привилегии. UI-кнопка тоже скрывается для не-админа, но это
// не security control, реальный гейт — здесь, на бэке.
const adminOnlyStrict = requireRole("admin");

const router = Router();

// ─── Avatar upload (Profile) ──────────────────────────────────────────────
// Юзер сам загружает картинку профиля. Файл уходит в GCS под
// `${PRIVATE_OBJECT_DIR}/uploads/avatars/<uuid>`, в `users.avatarUrl`
// сохраняется относительный путь /api/users/avatars/<uuid> (не публичный URL),
// чтобы файл отдавался только авторизованным юзерам через GET-роут ниже.
const avatarStorage = new ObjectStorageService();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
const ALLOWED_AVATAR_MIME = /^image\/(png|jpe?g|gif|webp)$/i;
const AVATAR_PATH_PREFIX = "/api/users/avatars/";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function avatarStorageRefs(objectId: string): { bucketName: string; objectName: string } {
  const privateDir = avatarStorage.getPrivateObjectDir();
  const storageKey = `${privateDir}/uploads/avatars/${objectId}`;
  const path = storageKey.startsWith("/") ? storageKey.slice(1) : storageKey;
  const [bucketName, ...rest] = path.split("/");
  return { bucketName, objectName: rest.join("/") };
}

// Whitelist of fields a user is allowed to change on their own profile.
// Notably absent: role, status, email, artistId, labelId, passwordHash.
const UpdateMyProfileBody = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  country: z.string().max(8).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  zipCode: z.string().max(20).nullable().optional(),
  about: z.string().max(2000).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  dspProfiles: z.object({
    appleMusic: z.string().max(255).optional(),
    spotify:    z.string().max(255).optional(),
    yandex:     z.string().max(255).optional(),
    youtube:    z.string().max(255).optional(),
  }).strict().optional(),
  socialLinks: z.object({
    facebook:  z.string().max(255).optional(),
    instagram: z.string().max(255).optional(),
    youtube:   z.string().max(255).optional(),
    tiktok:    z.string().max(255).optional(),
    linkedin:  z.string().max(255).optional(),
    x:         z.string().max(255).optional(),
    telegram:  z.string().max(255).optional(),
    vk:        z.string().max(255).optional(),
  }).strict().optional(),
}).strict();

function formatUser(u: typeof usersTable.$inferSelect, viewerRole: "admin" | "manager" | "label" | "artist" = "admin") {
  // Strip server-internal fields so they never leak via /users responses:
  //  - passwordHash             — secret
  //  - failedLoginAttempts      — internal lockout counter
  //  - lockedUntil              — internal lockout window
  const {
    passwordHash: _hash,
    failedLoginAttempts: _attempts,
    lockedUntil: _locked,
    ...rest
  } = u;
  // Bank info: для не-админов account_number / iban маскируются.
  // Tax info: tax_id всегда возвращается только самому юзеру или admin/manager.
  const masked = maskBankInfoFor({
    bankName: u.bankName,
    bankAccountNumber: u.bankAccountNumber,
    bankSwift: u.bankSwift,
    bankIban: u.bankIban,
    bankHolderName: u.bankHolderName,
    bankCountry: u.bankCountry,
  }, viewerRole);
  return {
    ...rest,
    ...masked,
    kycCompletedAt: u.kycCompletedAt?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

router.get("/users", adminOnly, async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const filters: SQL[] = [];
  if (role)   filters.push(eq(usersTable.role, role));
  if (status) filters.push(eq(usersTable.status, status));
  if (search) {
    const expr = or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`));
    if (expr) filters.push(expr);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const users = await db.select().from(usersTable).where(where).limit(limit).offset(offset).orderBy(desc(usersTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(usersTable).where(where);

  res.json({
    // viewerRole hardcoded "admin": endpoint защищён adminOnly.
    data: users.map((u) => formatUser(u, "admin")),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/users", adminOnlyStrict, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Email должен быть уникальным. Pre-check + case-insensitive (legacy строки
  // могут быть смешанного регистра). Сравниваем через lower(email), чтобы
  // существующая запись «John@Mail.ru» не ускользнула, когда админ вводит
  // «john@mail.ru». Раса между check и insert закрыта catch ниже.
  const emailNorm = parsed.data.email.trim().toLowerCase();
  const [existing] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${emailNorm}`);
  if (existing) {
    res.status(409).json({
      error: "email_taken",
      message: "Этот email уже зарегистрирован. Найдите пользователя в списке или используйте другой адрес.",
    });
    return;
  }

  // Генерим временный пароль и хэшируем (тот же путь, что в signup approve).
  // Без passwordHash юзер не сможет войти — текущая старая версия create
  // фактически создавала «мёртвых» пользователей.
  const tempPassword = generateTempPassword(12);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  let user: typeof usersTable.$inferSelect;
  try {
    [user] = await db.insert(usersTable).values({
      ...parsed.data,
      email: emailNorm,
      passwordHash,
      kycStatus: "not_started",
    }).returning();
  } catch (err: unknown) {
    // Postgres unique_violation = 23505. Если pre-check проиграл гонку с
    // параллельным insert'ом — отдаём тот же 409 без 500.
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      res.status(409).json({
        error: "email_taken",
        message: "Этот email уже зарегистрирован. Найдите пользователя в списке или используйте другой адрес.",
      });
      return;
    }
    throw err;
  }
  void auditMutation(req, {
    action: "create", entityType: "user", entityId: user.id, before: null, after: user,
  });

  // Best-effort приглашение на email с временным паролем. Если SMTP не
  // сконфигурирован — sendMail тихо вернёт {sent:false}, админ всё равно
  // увидит tempPassword в response и сможет передать вручную.
  sendMailAndForget({
    to: user.email,
    subject: "Tajik Music CRM — ваш аккаунт создан",
    text:
      `Здравствуйте, ${user.name}.\n\n` +
      `Администратор создал для вас аккаунт в Tajik Music CRM.\n\n` +
      `Email: ${user.email}\n` +
      `Временный пароль: ${tempPassword}\n\n` +
      `Войдите по ссылке и смените пароль в профиле.\n`,
    html:
      `<p>Здравствуйте, ${user.name}.</p>` +
      `<p>Администратор создал для вас аккаунт в Tajik Music CRM.</p>` +
      `<p><b>Email:</b> ${user.email}<br/>` +
      `<b>Временный пароль:</b> <code>${tempPassword}</code></p>` +
      `<p>Войдите и смените пароль в профиле.</p>`,
  });

  // tempPassword отдаём одноразово — этот response админ показывает в UI.
  // Сам tempPassword больше нигде не хранится в открытом виде (в БД только bcrypt-хэш).
  res.status(201).json({ ...formatUser(user), tempPassword });
});

// ─── Bank Info (Task #6) ─────────────────────────────────────────────────
// Юзер сам редактирует свои банковские реквизиты. Аудит пишет ТОЛЬКО
// нечувствительные поля (см. ENTITY_ALLOWLIST.profile_bank). После apply
// возвращаем masked-вариант (для самого юзера тоже маскируем номер счёта,
// чтобы в логах браузера не светилось).
const UpdateBankInfoBody = z.object({
  bankName:         z.string().max(120).nullable().optional(),
  bankAccountNumber: z.string().max(64).nullable().optional(),
  bankSwift:        z.string().max(32).nullable().optional(),
  bankIban:         z.string().max(64).nullable().optional(),
  bankHolderName:   z.string().max(180).nullable().optional(),
  bankCountry:      z.string().max(8).nullable().optional(),
}).strict();

router.patch("/users/me/bank-info", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const parsed = UpdateBankInfoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  if (Object.keys(data).length === 0) { res.status(400).json({ error: "Нечего обновлять" }); return; }

  if (typeof data.bankAccountNumber === "string" && data.bankAccountNumber.includes("*")) {
    res.status(400).json({ error: "Похоже, отправлено маскированное значение — введите номер счёта заново" });
    return;
  }
  if (typeof data.bankIban === "string" && data.bankIban.includes("*")) {
    res.status(400).json({ error: "Похоже, отправлено маскированное значение IBAN — введите заново" });
    return;
  }
  if (data.bankIban && !isValidIban(data.bankIban)) {
    res.status(400).json({ error: "Невалидный IBAN" }); return;
  }
  if (data.bankSwift && !isValidSwift(data.bankSwift)) {
    res.status(400).json({ error: "Невалидный SWIFT/BIC" }); return;
  }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser.id));
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  // Если KYC уже approved — bank info менять можно, но это вернёт kyc в pending
  // (compliance: новые реквизиты должен заново проверить админ).
  const patch: Partial<typeof usersTable.$inferInsert> = { ...data };
  if (me.kycStatus === "approved") {
    patch.kycStatus = "pending";
    patch.kycCompletedAt = null;
  }
  const [updated] = await db.update(usersTable)
    .set(patch)
    .where(eq(usersTable.id, sessionUser.id))
    .returning();

  // Audit пишет только non-PII поля профиля (см. profile_bank allowlist)
  void auditMutation(req, {
    action: "update", entityType: "profile_bank", entityId: sessionUser.id,
    before: { id: me.id, bankName: me.bankName, bankHolderName: me.bankHolderName, bankCountry: me.bankCountry },
    after:  { id: updated.id, bankName: updated.bankName, bankHolderName: updated.bankHolderName, bankCountry: updated.bankCountry },
  });

  res.json(formatUser(updated, sessionUser.role));
});

// ─── Tax Info (Task #6) ───────────────────────────────────────────────────
const UpdateTaxInfoBody = z.object({
  taxId:       z.string().max(64).nullable().optional(),
  taxCountry:  z.string().max(8).nullable().optional(),
  taxFormType: z.enum(["w8", "w9", "self_employed", "individual_entrepreneur"]).nullable().optional(),
}).strict();

router.patch("/users/me/tax-info", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const parsed = UpdateTaxInfoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: "Нечего обновлять" }); return; }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser.id));
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db.update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, sessionUser.id))
    .returning();

  void auditMutation(req, {
    action: "update", entityType: "profile_tax", entityId: sessionUser.id,
    before: { id: me.id, taxCountry: me.taxCountry, taxFormType: me.taxFormType },
    after:  { id: updated.id, taxCountry: updated.taxCountry, taxFormType: updated.taxFormType },
  });

  res.json(formatUser(updated, sessionUser.role));
});

router.patch("/users/me", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Нечего обновлять" });
    return;
  }
  const [existingMe] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser.id));
  const [user] = await db.update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, sessionUser.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "user", entityId: user.id, before: existingMe, after: user });
  // Keep session in sync if name changed (used for header / sidebar).
  if (parsed.data.name && req.session.user) {
    req.session.user.name = parsed.data.name;
  }
  res.json(formatUser(user, sessionUser.role));
});

router.get("/users/:id", adminOnly, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

router.put("/users/:id", adminOnly, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  // Anti-privilege-escalation. Менеджер может править свои/чужие профили,
  // НО:
  //   1) не имеет права менять `role` никому (иначе self-promotes до admin
  //      и обходит строгий гейт на POST /users);
  //   2) не имеет права менять `status` админам (иначе suspends других
  //      админов и захватывает контроль);
  //   3) не имеет права редактировать самих админов вообще (имена/email).
  // Реальный admin — без ограничений.
  const callerRole = req.session.user?.role;
  const payload = { ...parsed.data };
  if (callerRole !== "admin") {
    if (existing.role === "admin") {
      res.status(403).json({ error: "Forbidden: only admin can edit admin users" });
      return;
    }
    if (payload.role !== existing.role) {
      res.status(403).json({ error: "Forbidden: only admin can change user role" });
      return;
    }
  }

  const [user] = await db.update(usersTable).set(payload).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "user", entityId: user.id, before: existing, after: user });

  res.json(formatUser(user));
});

// ─── Avatar: GET (любой авторизованный) ──────────────────────────────────
// Регистрируем ДО /users/:id, чтобы express не пытался парсить "avatars"
// как числовой :id (он бы вернул 400 от Zod).
router.get("/users/avatars/:objectId", requireAuth, async (req, res): Promise<void> => {
  const objectId = String(req.params.objectId ?? "");
  if (!UUID_RE.test(objectId)) { res.status(400).json({ error: "Invalid avatar id" }); return; }
  try {
    const { bucketName, objectName } = avatarStorageRefs(objectId);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) { res.status(404).json({ error: "Avatar not found" }); return; }
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=300");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    file.createReadStream()
      .on("error", (err) => {
        req.log?.error({ err }, "[avatar] stream error");
        if (!res.headersSent) res.sendStatus(500);
      })
      .pipe(res);
  } catch (err) {
    req.log?.error({ err }, "[avatar] download failed");
    res.status(500).json({ error: "Не удалось получить аватар" });
  }
});

// ─── Avatar: POST upload ──────────────────────────────────────────────────
router.post("/users/me/avatar", requireAuth, avatarUpload.single("file"), async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const file = req.file;
  if (!file) { res.status(400).json({ error: "Файл не передан" }); return; }
  if (!ALLOWED_AVATAR_MIME.test(file.mimetype)) {
    res.status(400).json({ error: "Только PNG, JPEG, GIF, WEBP" }); return;
  }
  if (file.size > 5 * 1024 * 1024) {
    res.status(413).json({ error: "Файл превышает 5 МБ" }); return;
  }

  const objectId = randomUUID();
  const { bucketName, objectName } = avatarStorageRefs(objectId);
  const newFileRef = objectStorageClient.bucket(bucketName).file(objectName);

  // 1) Загружаем новый файл в GCS.
  try {
    await newFileRef.save(file.buffer, {
      contentType: file.mimetype,
      resumable: false,
      metadata: { contentType: file.mimetype },
    });
  } catch (err) {
    req.log?.error({ err }, "[avatar] upload failed");
    res.status(500).json({ error: "Не удалось сохранить файл" });
    return;
  }

  // 2) Обновляем БД. На любую ошибку/«пустой» результат — компенсация:
  //    удаляем только что загруженный файл, чтобы не оставлять orphan.
  const newUrl = `${AVATAR_PATH_PREFIX}${objectId}`;
  let oldAvatarUrl: string | null = null;
  let updated: typeof usersTable.$inferSelect | undefined;
  try {
    const [existingMe] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser.id));
    if (!existingMe) {
      throw new Error("USER_GONE");
    }
    oldAvatarUrl = existingMe.avatarUrl ?? null;
    [updated] = await db.update(usersTable)
      .set({ avatarUrl: newUrl })
      .where(eq(usersTable.id, sessionUser.id))
      .returning();
    if (!updated) {
      throw new Error("USER_GONE");
    }
  } catch (err) {
    // Компенсация: удаляем свежезагруженный объект, БД-состояние не менялось.
    try { await newFileRef.delete({ ignoreNotFound: true }); } catch (cleanupErr) {
      req.log?.warn({ err: cleanupErr, objectId }, "[avatar] compensation cleanup failed");
    }
    const isUserGone = err instanceof Error && err.message === "USER_GONE";
    if (isUserGone) {
      req.log?.warn({ userId: sessionUser.id }, "[avatar] user vanished mid-upload");
      res.status(404).json({ error: "User not found" });
    } else {
      req.log?.error({ err }, "[avatar] DB update failed");
      res.status(500).json({ error: "Не удалось сохранить аватар" });
    }
    return;
  }

  // 3) Best-effort удаляем старый файл (только если он наш).
  if (oldAvatarUrl && oldAvatarUrl.startsWith(AVATAR_PATH_PREFIX)) {
    const oldId = oldAvatarUrl.slice(AVATAR_PATH_PREFIX.length);
    if (UUID_RE.test(oldId) && oldId !== objectId) {
      try {
        const refs = avatarStorageRefs(oldId);
        await objectStorageClient.bucket(refs.bucketName).file(refs.objectName).delete({ ignoreNotFound: true });
      } catch (err) {
        req.log?.warn({ err, oldId }, "[avatar] cleanup of previous avatar failed");
      }
    }
  }

  void auditMutation(req, {
    action: "update", entityType: "user", entityId: sessionUser.id,
    before: { id: sessionUser.id, avatarUrl: oldAvatarUrl },
    after:  { id: updated.id,    avatarUrl: updated.avatarUrl },
  });

  res.status(201).json(formatUser(updated, sessionUser.role));
});

// ─── Avatar: DELETE ───────────────────────────────────────────────────────
router.delete("/users/me/avatar", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser.id));
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  const oldUrl = me.avatarUrl;
  const [updated] = await db.update(usersTable)
    .set({ avatarUrl: null })
    .where(eq(usersTable.id, sessionUser.id))
    .returning();

  if (oldUrl && oldUrl.startsWith(AVATAR_PATH_PREFIX)) {
    const oldId = oldUrl.slice(AVATAR_PATH_PREFIX.length);
    if (UUID_RE.test(oldId)) {
      try {
        const { bucketName, objectName } = avatarStorageRefs(oldId);
        await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
      } catch (err) {
        req.log?.warn({ err, oldId }, "[avatar] delete cleanup failed");
      }
    }
  }

  void auditMutation(req, {
    action: "update", entityType: "user", entityId: sessionUser.id,
    before: { id: sessionUser.id, avatarUrl: oldUrl },
    after:  { id: updated.id,   avatarUrl: null },
  });

  res.json(formatUser(updated, sessionUser.role));
});

router.delete("/users/:id", adminOnly, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  void auditMutation(req, { action: "delete", entityType: "user", entityId: user.id, before: user, after: null });

  res.sendStatus(204);
});

export default router;
