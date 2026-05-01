// ─── Public Signup + Admin Review (Task #6) ───────────────────────────────
// POST /signup-requests — публичный (без auth), rate-limited (3/час/IP).
// GET /signup-requests, POST /:id/approve|reject — admin/manager only.
//
// Approve создаёт User + (Artist|Label) + temp password (bcrypt) и записывает
// созданный user_id в signup_requests.created_user_id.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, signupRequestsTable, usersTable, artistsTable, labelsTable } from "@workspace/db";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { generateTempPassword } from "../lib/kycUtils";
import { logger } from "../lib/logger";
import { sendMailAndForget, getAdminNotificationEmail } from "../lib/mail";
import { fireTriggerAndForget } from "../services/triggers";
import { fireWebhookAndForget } from "../services/webhook-dispatcher";
import { emitAlertAndForget } from "../services/alerts-emitter";
import { createNotification } from "../services/notifications";

const router = Router();

// 3 заявки / IP / час. В dev — мягче (100), чтобы можно было прогонять smoke.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 3 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много заявок с этого IP. Попробуй через час." },
});

const PublicSignupBody = z.object({
  entityType: z.enum(["artist", "label"]),
  name:    z.string().min(2).max(120),
  email:   z.string().email().max(255).transform((s) => s.toLowerCase().trim()),
  phone:   z.string().max(40).optional().nullable(),
  country: z.string().max(8).optional().nullable(),
  legalName: z.string().max(255).optional().nullable(),
  inn:     z.string().max(40).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
}).strict();

const ApproveBody = z.object({
  // Админ может переопределить роль для лейбла на «label» либо на «artist» (для физ.лица).
  role: z.enum(["artist", "label"]).optional(),
  // Опциональный label_id — для привязки нового артиста к существующему лейблу.
  labelId: z.number().int().positive().optional().nullable(),
}).strict();

const RejectBody = z.object({
  reason: z.string().min(3).max(500),
}).strict();

function serializeRequest(r: typeof signupRequestsTable.$inferSelect) {
  return {
    ...r,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// ─── PUBLIC: создать заявку ───────────────────────────────────────────────
router.post("/signup-requests", signupLimiter, async (req, res): Promise<void> => {
  const parsed = PublicSignupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  // Идемпотентность: одну активную (pending) заявку на email — больше не принимаем,
  // чтобы кнопка submit не плодила дубликаты от нетерпеливых пользователей.
  const [existing] = await db.select({ id: signupRequestsTable.id })
    .from(signupRequestsTable)
    .where(and(eq(signupRequestsTable.email, data.email), eq(signupRequestsTable.status, "pending")));
  if (existing) {
    res.status(409).json({ error: "Заявка с этим email уже отправлена и ждёт рассмотрения." });
    return;
  }

  // Email-уникальность среди активных юзеров: если уже есть аккаунт — отправляем на /login.
  const [existingUser] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, data.email));
  if (existingUser) {
    res.status(409).json({ error: "Аккаунт с этим email уже существует. Войди через /login." });
    return;
  }

  const [created] = await db.insert(signupRequestsTable).values({
    entityType: data.entityType,
    name:    data.name,
    email:   data.email,
    phone:   data.phone ?? null,
    country: data.country ?? null,
    legalName: data.legalName ?? null,
    inn:     data.inn ?? null,
    message: data.message ?? null,
  }).returning();

  // fire-and-forget audit (юзер не залогинен — userId/email в audit будут null,
  // но запись сохраняется для отчёта администратору)
  void auditMutation(req, {
    action: "create", entityType: "signup_request", entityId: created.id,
    before: null, after: created,
  });

  // Email-уведомление админу — fire-and-forget. Если SMTP_URL не задан или
  // ADMIN_NOTIFICATION_EMAIL пуст, mail-модуль просто пишет запись в лог
  // (см. lib/mail.ts), чтобы flow никогда не блокировался почтовыми сбоями.
  const adminEmail = getAdminNotificationEmail();
  if (adminEmail) {
    sendMailAndForget({
      to: adminEmail,
      subject: `[Tajik Music CRM] Новая заявка на регистрацию: ${data.name}`,
      text:
        `Поступила новая заявка на регистрацию.\n\n` +
        `Тип: ${data.entityType === "label" ? "Лейбл" : "Артист"}\n` +
        `Имя: ${data.name}\n` +
        `Email: ${data.email}\n` +
        `Телефон: ${data.phone ?? "—"}\n` +
        `Страна: ${data.country ?? "—"}\n` +
        `Юр. название: ${data.legalName ?? "—"}\n` +
        `ИНН: ${data.inn ?? "—"}\n\n` +
        `Сообщение:\n${data.message ?? "—"}\n\n` +
        `Открой /admin/signups для рассмотрения.`,
    });
  }
  logger.info(
    { requestId: created.id, email: data.email, entityType: data.entityType, adminNotified: Boolean(adminEmail) },
    "[signup] new signup request",
  );

  res.status(201).json({ ok: true, requestId: created.id });
});

// ─── ADMIN: список заявок ─────────────────────────────────────────────────
router.get("/signup-requests", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const status = (req.query.status as string | undefined) ?? undefined;
  const search = (req.query.search as string | undefined) ?? undefined;
  const filters: SQL[] = [];
  if (status) filters.push(eq(signupRequestsTable.status, status));
  if (search) {
    const expr = or(
      ilike(signupRequestsTable.name, `%${search}%`),
      ilike(signupRequestsTable.email, `%${search}%`),
    );
    if (expr) filters.push(expr);
  }
  const where = filters.length ? and(...filters) : undefined;
  const rows = await db.select().from(signupRequestsTable).where(where)
    .orderBy(desc(signupRequestsTable.createdAt)).limit(200);
  res.json({ data: rows.map(serializeRequest) });
});

// ─── ADMIN: approve ───────────────────────────────────────────────────────
// Создаём User + (Artist|Label), сохраняем temp password в audit нельзя,
// поэтому возвращаем его 1 раз в ответе → админ передаёт юзеру out-of-band.
router.post("/signup-requests/:id/approve", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ApproveBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [request] = await db.select().from(signupRequestsTable).where(eq(signupRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Заявка не найдена" }); return; }
  if (request.status !== "pending") {
    res.status(409).json({ error: `Заявка уже в статусе ${request.status}` });
    return;
  }

  // Если за время ожидания кто-то занял email через админский /users — отказ.
  const [conflictUser] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, request.email));
  if (conflictUser) {
    res.status(409).json({ error: "Email уже занят другим пользователем" });
    return;
  }

  const role = parsed.data.role ?? request.entityType;
  const tempPassword = generateTempPassword(12);
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const reviewer = req.session.user!;

  let createdArtistId: number | null = null;
  let createdLabelId: number | null = null;
  let user: typeof usersTable.$inferSelect;
  let updatedRequest: typeof signupRequestsTable.$inferSelect;

  try {
    const result = await db.transaction(async (tx) => {
      let aId: number | null = null;
      let lId: number | null = null;
      if (role === "label") {
        const [lab] = await tx.insert(labelsTable).values({
          name: request.legalName || request.name,
          country: request.country,
          status: "active",
        }).returning();
        lId = lab.id;
      } else {
        const [art] = await tx.insert(artistsTable).values({
          name: request.name,
          slug: request.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `artist-${Date.now()}`,
          country: request.country,
          labelId: parsed.data.labelId ?? null,
          status: "active",
        }).returning();
        aId = art.id;
        if (parsed.data.labelId) lId = parsed.data.labelId;
      }
      const [u] = await tx.insert(usersTable).values({
        name: request.name,
        email: request.email,
        role,
        status: "active",
        passwordHash,
        phone: request.phone,
        country: request.country,
        artistId: aId,
        labelId: lId,
        kycStatus: "not_started",
      }).returning();
      const [r] = await tx.update(signupRequestsTable)
        .set({
          status: "approved",
          reviewedBy: reviewer.id,
          reviewedAt: new Date(),
          createdUserId: u.id,
        })
        .where(eq(signupRequestsTable.id, id))
        .returning();
      return { aId, lId, u, r };
    });
    createdArtistId = result.aId;
    createdLabelId  = result.lId;
    user            = result.u;
    updatedRequest  = result.r;
  } catch (err) {
    logger.error({ err, requestId: id }, "[signup] approve transaction failed");
    res.status(500).json({ error: "Не удалось одобрить заявку — изменения откачены" });
    return;
  }
  void createdArtistId; void createdLabelId;

  void auditMutation(req, {
    action: "approve", entityType: "signup_request", entityId: id,
    before: request, after: updatedRequest,
  });
  void auditMutation(req, {
    action: "create", entityType: "user", entityId: user.id,
    before: null, after: user,
  });
  emitAlertAndForget({
    kind: "signup",
    severity: "low",
    message: `Новый пользователь создан: ${user.name} (${user.email}, роль ${user.role})`,
    entityType: "user",
    entityId: user.id,
    meta: { signupRequestId: id, role: user.role, country: user.country },
  });

  // Письмо новому пользователю с временным паролем — fire-and-forget. Если
  // SMTP не настроен, mail-модуль логирует факт без падения, и админ всё ещё
  // получает tempPassword в JSON-ответе (out-of-band fallback).
  sendMailAndForget({
    to: user.email,
    subject: "Ваша заявка одобрена — Tajik Music CRM",
    text:
      `Здравствуйте, ${user.name}!\n\n` +
      `Ваша заявка на регистрацию в Tajik Music CRM одобрена.\n\n` +
      `Данные для входа:\n` +
      `Логин (email): ${user.email}\n` +
      `Временный пароль: ${tempPassword}\n\n` +
      `Войдите по адресу: ${process.env.PUBLIC_APP_URL ?? "/login"}\n` +
      `Сразу после входа смените пароль в разделе «Профиль → Безопасность».\n\n` +
      `Следующий шаг — пройти KYC-верификацию (загрузить документы) и заполнить ` +
      `банковские/налоговые реквизиты, чтобы получать выплаты роялти.`,
  });
  logger.info(
    { requestId: id, userId: user.id, email: user.email },
    "[signup] approved — onboarding email queued (SMTP_URL=" +
      (process.env.SMTP_URL ? "set" : "noop") + ")",
  );

  // Запускаем настроенные триггеры автоматизации (signup_approved) и outbound webhooks
  fireTriggerAndForget("signup_approved", {
    requesterUserId: user.id,
    artistId: createdArtistId,
    labelId: createdLabelId,
    vars: {
      user_name: user.name,
      user_email: user.email,
      platform_name: "Tajik Music Distribution",
    },
    link: "/dashboard",
    entityType: "general",
  });
  fireWebhookAndForget("user.signup_approved", {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    artistId: createdArtistId,
    labelId: createdLabelId,
  });

  // In-app приветствие — увидит при первом входе
  void createNotification({
    userId: user.id,
    type: "signup_approved",
    title: "🎉 Добро пожаловать в Tajik Music CRM",
    body: "Заявка одобрена. Следующий шаг — пройти KYC-верификацию и заполнить банковские/налоговые реквизиты.",
    entityType: "general",
    link: "/kyc",
  });

  // ВНИМАНИЕ: tempPassword возвращается ТОЛЬКО в этом ответе и нигде не логируется.
  // Это out-of-band страховка на случай, если у юзера нет доступа к почте.
  res.status(201).json({
    ok: true,
    request: serializeRequest(updatedRequest),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tempPassword,
  });
});

// ─── ADMIN: reject ────────────────────────────────────────────────────────
router.post("/signup-requests/:id/reject", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = RejectBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [request] = await db.select().from(signupRequestsTable).where(eq(signupRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Заявка не найдена" }); return; }
  if (request.status !== "pending") {
    res.status(409).json({ error: `Заявка уже в статусе ${request.status}` });
    return;
  }

  const reviewer = req.session.user!;
  const [updated] = await db.update(signupRequestsTable)
    .set({
      status: "rejected",
      reviewedBy: reviewer.id,
      reviewedAt: new Date(),
      rejectionReason: parsed.data.reason,
    })
    .where(eq(signupRequestsTable.id, id))
    .returning();

  void auditMutation(req, {
    action: "reject", entityType: "signup_request", entityId: id,
    before: request, after: updated,
  });

  res.json({ ok: true, request: serializeRequest(updated) });
});

export default router;
