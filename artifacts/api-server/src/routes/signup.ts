// ─── Public Signup + Admin Review (Task #6) ───────────────────────────────
// POST /signup-requests — публичный (без auth), rate-limited (3/час/IP).
// GET /signup-requests, POST /:id/approve|reject — admin/manager only.
//
// Approve создаёт User + (Artist|Label) + temp password (bcrypt) и записывает
// созданный user_id в signup_requests.created_user_id.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, signupRequestsTable, usersTable, artistsTable, labelsTable } from "@workspace/db";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { generateTempPassword } from "../lib/kycUtils";
import { logger } from "../lib/logger";
import { isMailConfigured, sendMailAndForget, getAdminNotificationEmail } from "../lib/mail";
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

  // Анкета лейбла. Всё необязательное: артист-одиночка заполняет три поля,
  // лейбл с каталогом — всё, и заявка от этого не ломается.
  website: z.string().max(255).optional().nullable(),
  socialMedia: z.string().max(500).optional().nullable(),
  contactPerson: z.string().max(160).optional().nullable(),
  contactPosition: z.string().max(120).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  artistCount: z.number().int().min(0).max(100_000).optional().nullable(),
  releaseCount: z.number().int().min(0).max(1_000_000).optional().nullable(),
  trackCount: z.number().int().min(0).max(10_000_000).optional().nullable(),
  genres: z.string().max(300).optional().nullable(),
  currentDistributor: z.string().max(200).optional().nullable(),
  reasonForMoving: z.string().max(2000).optional().nullable(),
  mainDsps: z.string().max(300).optional().nullable(),
  territories: z.string().max(300).optional().nullable(),
  monthlyReleases: z.string().max(60).optional().nullable(),
  catalogSize: z.string().max(60).optional().nullable(),
  hearAbout: z.string().max(200).optional().nullable(),

  // Два раздельных согласия, как в ТЗ. Старые клиенты формы могли не прислать
  // ничего — тогда считаем, что согласия дано не было, и просто не пишем дату.
  acceptedTerms: z.boolean().optional(),
  acceptedPrivacy: z.boolean().optional(),
}).strict();


const ApproveBody = z.object({
  // Админ может переопределить роль для лейбла на «label» либо на «artist» (для физ.лица).
  role: z.enum(["artist", "label"]).optional(),
  // Опциональный label_id — для привязки нового артиста к существующему лейблу.
  labelId: z.number().int().positive().optional().nullable(),
}).strict();

// Пока заявка в одном из этих статусов, её ещё можно одобрить или отклонить.
const OPEN_STATUSES = ["pending", "under_review", "info_requested"];

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
    .where(and(eq(signupRequestsTable.email, data.email), inArray(signupRequestsTable.status, OPEN_STATUSES)));
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
    website: data.website ?? null,
    socialMedia: data.socialMedia ?? null,
    contactPerson: data.contactPerson ?? null,
    contactPosition: data.contactPosition ?? null,
    whatsapp: data.whatsapp ?? null,
    artistCount: data.artistCount ?? null,
    releaseCount: data.releaseCount ?? null,
    trackCount: data.trackCount ?? null,
    genres: data.genres ?? null,
    currentDistributor: data.currentDistributor ?? null,
    reasonForMoving: data.reasonForMoving ?? null,
    mainDsps: data.mainDsps ?? null,
    territories: data.territories ?? null,
    monthlyReleases: data.monthlyReleases ?? null,
    catalogSize: data.catalogSize ?? null,
    hearAbout: data.hearAbout ?? null,
    // IP и браузер — чтобы админ видел, откуда пришла заявка, как просил заказчик.
    sourceIp: req.ip ?? null,
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 500) || null,
    // Токен даёт заявителю доступ к своей заявке без пароля: по нему он
    // дошлёт данные, если админ их запросит.
    accessToken: randomUUID(),
    acceptedTermsAt: data.acceptedTerms ? new Date() : null,
    acceptedPrivacyAt: data.acceptedPrivacy ? new Date() : null,
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
  if (!OPEN_STATUSES.includes(request.status)) {
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
        // Одобренная заявка ещё не даёт права работать: сначала KYC, права и
        // договор, потом администратор активирует аккаунт (этап 9 из ТЗ).
        // Войти в кабинет при этом можно — иначе онбординг негде проходить.
        status: "review",
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
  if (!OPEN_STATUSES.includes(request.status)) {
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

  // Отказ без письма — это молчание в ответ на заявку. Пишем причину так же,
  // как её увидит админ: придумывать смягчённую формулировку не наше дело.
  sendMailAndForget({
    to: request.email,
    subject: "Ваша заявка в Tajik Music отклонена",
    text:
      `Здравствуйте, ${request.name}!

` +
      `К сожалению, ваша заявка на подключение к Tajik Music отклонена.

` +
      `Причина: ${parsed.data.reason}

` +
      `Если ситуация изменится, вы можете подать заявку заново.`,
  });

  res.json({ ok: true, request: serializeRequest(updated) });
});


// ─── ADMIN: взять в работу / запросить данные / заметка ───────────────────
const StatusBody = z.object({
  status: z.enum(["pending", "under_review"]),
}).strict();

router.post("/signup-requests/:id/status", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = StatusBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(signupRequestsTable).where(eq(signupRequestsTable.id, id));
  if (!before) { res.status(404).json({ error: "Заявка не найдена" }); return; }
  if (!OPEN_STATUSES.includes(before.status)) {
    res.status(409).json({ error: `Заявка уже в статусе ${before.status}` });
    return;
  }

  const [updated] = await db.update(signupRequestsTable)
    .set({ status: parsed.data.status })
    .where(eq(signupRequestsTable.id, id)).returning();

  void auditMutation(req, {
    action: "update", entityType: "signup_request", entityId: id, before, after: updated,
  });
  res.json({ ok: true, request: serializeRequest(updated) });
});

const NoteBody = z.object({
  note: z.string().max(4000),
}).strict();

router.post("/signup-requests/:id/note", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = NoteBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(signupRequestsTable)
    .set({ internalNote: parsed.data.note })
    .where(eq(signupRequestsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Заявка не найдена" }); return; }
  res.json({ ok: true, request: serializeRequest(updated) });
});

const RequestInfoBody = z.object({
  message: z.string().min(3).max(2000),
}).strict();

// Просим заявителя дослать данные. Ссылка в письме ведёт на страницу заявки,
// открывающуюся по токену — аккаунта у человека ещё нет, входить ему некуда.
router.post("/signup-requests/:id/request-info", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = RequestInfoBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(signupRequestsTable).where(eq(signupRequestsTable.id, id));
  if (!before) { res.status(404).json({ error: "Заявка не найдена" }); return; }
  if (!OPEN_STATUSES.includes(before.status)) {
    res.status(409).json({ error: `Заявка уже в статусе ${before.status}` });
    return;
  }

  // У старых заявок токена нет — заводим при первом запросе данных.
  const token = before.accessToken ?? randomUUID();
  const [updated] = await db.update(signupRequestsTable)
    .set({
      status: "info_requested",
      infoRequest: parsed.data.message,
      infoRequestedAt: new Date(),
      accessToken: token,
    })
    .where(eq(signupRequestsTable.id, id)).returning();

  const link = `${process.env.PUBLIC_APP_URL ?? ""}/signup/request/${token}`;
  const mailReady = await isMailConfigured();
  sendMailAndForget({
    to: before.email,
    subject: "Нужны дополнительные данные по вашей заявке — Tajik Music",
    text:
      `Здравствуйте, ${before.name}!

` +
      `По вашей заявке на подключение к Tajik Music нужны дополнительные данные:

` +
      `${parsed.data.message}

` +
      `Ответьте по ссылке: ${link}
`,
  });

  void auditMutation(req, {
    action: "update", entityType: "signup_request", entityId: id, before, after: updated,
  });
  // Без настроенной почты ссылку нужно передать заявителю самому — отдаём её.
  res.json({
    ok: true,
    request: serializeRequest(updated),
    mailSent: mailReady,
    ...(mailReady ? {} : { link }),
  });
});

// ─── PUBLIC: заявитель смотрит свою заявку и досылает данные ──────────────
router.get("/signup-requests/by-token/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token);
  const [row] = await db.select().from(signupRequestsTable)
    .where(eq(signupRequestsTable.accessToken, token));
  if (!row) { res.status(404).json({ error: "Заявка не найдена" }); return; }
  // Наружу отдаём только то, что человек и так про себя знает: внутренние
  // заметки и данные проверяющего остаются в панели.
  res.json({
    data: {
      id: row.id, name: row.name, email: row.email, status: row.status,
      createdAt: row.createdAt.toISOString(),
      infoRequest: row.infoRequest,
      infoResponse: row.infoResponse,
      rejectionReason: row.status === "rejected" ? row.rejectionReason : null,
    },
  });
});

const InfoResponseBody = z.object({
  response: z.string().min(2).max(4000),
}).strict();

router.post("/signup-requests/by-token/:token/respond", signupLimiter, async (req, res): Promise<void> => {
  const token = String(req.params.token);
  const parsed = InfoResponseBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.select().from(signupRequestsTable)
    .where(eq(signupRequestsTable.accessToken, token));
  if (!row) { res.status(404).json({ error: "Заявка не найдена" }); return; }
  if (row.status !== "info_requested") {
    res.status(409).json({ error: "По этой заявке дополнительные данные не запрашивались" });
    return;
  }

  const [updated] = await db.update(signupRequestsTable)
    .set({
      infoResponse: parsed.data.response,
      infoRespondedAt: new Date(),
      // Ответ вернул заявку в работу — админ увидит её среди активных.
      status: "under_review",
    })
    .where(eq(signupRequestsTable.id, row.id)).returning();

  const adminEmail = getAdminNotificationEmail();
  if (adminEmail) {
    sendMailAndForget({
      to: adminEmail,
      subject: `[Tajik Music CRM] Ответ по заявке №${row.id}: ${row.name}`,
      text: `${row.name} (${row.email}) прислал дополнительные данные:

${parsed.data.response}
`,
    });
  }

  res.json({ ok: true, status: updated.status });
});

export default router;
