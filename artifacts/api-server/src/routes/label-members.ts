/**
 * Управление участниками команды лейбла + полный сценарий приглашения.
 *
 *   GET    /api/label-members?labelId=… — список участников
 *   POST   /api/label-members/invite — пригласить (создаёт row + token, шлёт email)
 *   PATCH  /api/label-members/:id/role — изменить роль
 *   DELETE /api/label-members/:id — удалить из команды
 *
 * Публичные эндпоинты (без сессии — invite-token достаточно):
 *   GET    /api/label-members/invite/:token — данные приглашения для страницы
 *   POST   /api/label-members/invite/:token/accept — принять и создать аккаунт
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, labelMembersTable, labelsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getDataScope, requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { sendMailAndForget } from "../lib/mail";
import { logger } from "../lib/logger";
import { createNotification } from "../services/notifications";

const router = Router();

const INVITE_TTL_DAYS = 14;

function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function publicInviteLink(token: string): string {
  // BASE_URL берём из env (production ставит реальный домен), иначе локальный fallback.
  const base = process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "") || "http://localhost:5000";
  return `${base}/invite/${token}`;
}

router.get("/label-members", async (req, res): Promise<void> => {
  const scope = getDataScope(req);

  let labelId: number | null = null;
  if (scope.fullAccess && req.query.labelId) {
    labelId = parseInt(req.query.labelId as string, 10);
  } else if (scope.role === "label" && scope.labelId) {
    labelId = scope.labelId;
  }

  if (!labelId) { res.status(400).json({ error: "labelId required" }); return; }

  const rows = await db
    .select()
    .from(labelMembersTable)
    .where(eq(labelMembersTable.labelId, labelId))
    .orderBy(labelMembersTable.invitedAt);

  res.json(rows.map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    status: r.status,
    invitedAt: r.invitedAt.toISOString(),
    joinedAt: r.joinedAt?.toISOString() ?? null,
    inviteExpiresAt: r.inviteExpiresAt?.toISOString() ?? null,
    // Сам токен не возвращаем в списке — только публичная ссылка.
    inviteLink: r.status === "pending" && r.inviteToken ? publicInviteLink(r.inviteToken) : null,
  })));
});

const InviteBody = z.object({
  email: z.string().email("Невалидный email"),
  name:  z.string().min(1, "Имя обязательно").max(120),
  role:  z.enum(["manager", "viewer"]).optional(),
  labelId: z.number().int().positive().optional(),
});

router.post("/label-members/invite", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!req.session?.user?.id) { res.status(401).json({ error: "Unauthorized" }); return; }

  let labelId: number | null = null;
  if (scope.fullAccess && parsed.data.labelId) {
    labelId = parsed.data.labelId;
  } else if (scope.role === "label" && scope.labelId) {
    labelId = scope.labelId;
  }
  if (!labelId) { res.status(400).json({ error: "labelId required" }); return; }

  const email = parsed.data.email.trim().toLowerCase();
  const name  = parsed.data.name.trim();
  const memberRole = parsed.data.role ?? "viewer";

  // Проверка дубля по (labelId, email).
  const existing = await db
    .select({ id: labelMembersTable.id })
    .from(labelMembersTable)
    .where(and(eq(labelMembersTable.labelId, labelId), eq(labelMembersTable.email, email)));
  if (existing.length > 0) {
    res.status(409).json({ error: "Этот email уже добавлен в команду" });
    return;
  }

  // Лейбл нужен для письма.
  const [label] = await db.select().from(labelsTable).where(eq(labelsTable.id, labelId));
  if (!label) { res.status(404).json({ error: "Лейбл не найден" }); return; }

  const inviteToken = generateInviteToken();
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db.insert(labelMembersTable).values({
    labelId,
    email,
    name,
    role: memberRole,
    status: "pending",
    inviteToken,
    inviteExpiresAt,
    invitedById: req.session.user.id,
  }).returning();

  void auditMutation(req, {
    action: "invite", entityType: "label_member", entityId: row.id,
    before: null, after: { id: row.id, email, role: memberRole, labelId },
  });

  const link = publicInviteLink(inviteToken);
  const inviterName = req.session.user.name || req.session.user.email || "коллега";

  // Email-приглашение (best-effort, не блокирует ответ).
  sendMailAndForget({
    to: email,
    subject: `Приглашение в команду «${label.name}» в Tajik Music Distribution`,
    text:
      `Здравствуйте, ${name}!\n\n` +
      `${inviterName} приглашает вас присоединиться к команде лейбла «${label.name}» ` +
      `на платформе Tajik Music Distribution в роли «${memberRole}».\n\n` +
      `Чтобы принять приглашение и создать аккаунт, перейдите по ссылке:\n${link}\n\n` +
      `Ссылка действительна ${INVITE_TTL_DAYS} дней.\n\n` +
      `Если вы не ожидали это приглашение — просто проигнорируйте письмо.`,
  });

  // Если у этого email уже есть пользователь в системе — продублируем in-app.
  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existingUser) {
    void createNotification({
      userId: existingUser.id,
      type: "label_invite",
      title: `Приглашение в команду «${label.name}»`,
      body: `Вас пригласил ${inviterName}. Откройте ссылку и подтвердите.`,
      entityType: "general",
      entityId: row.id,
      link: `/invite/${inviteToken}`,
    });
  }

  logger.info({ labelMemberId: row.id, labelId, email }, "[label-members] invite created");

  res.status(201).json({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    invitedAt: row.invitedAt.toISOString(),
    joinedAt: null,
    inviteExpiresAt: inviteExpiresAt.toISOString(),
    // Возвращаем ссылку приглашающему — он может скопировать её и отправить отдельно.
    inviteLink: link,
  });
});

// Публичные эндпоинты приёма приглашения (без сессии — токен достаточно).
// Регистрируются ниже, в index.ts будут смонтированы как public-роуты.
const publicRouter = Router();

publicRouter.get("/label-members/invite/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token || "").trim();
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const [row] = await db.select().from(labelMembersTable).where(eq(labelMembersTable.inviteToken, token));
  if (!row) { res.status(404).json({ error: "Приглашение не найдено или уже использовано" }); return; }
  if (row.status !== "pending") { res.status(409).json({ error: `Приглашение в статусе ${row.status}` }); return; }
  if (row.inviteExpiresAt && row.inviteExpiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "Срок действия приглашения истёк" });
    return;
  }

  const [label] = await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, row.labelId));

  // Если такой email уже есть в users — фронт попросит просто пароль для подтверждения,
  // вместо полной регистрации.
  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, row.email));

  res.json({
    email: row.email,
    name: row.name,
    role: row.role,
    labelName: label?.name ?? "Лейбл",
    expiresAt: row.inviteExpiresAt?.toISOString() ?? null,
    accountExists: !!existingUser,
  });
});

const AcceptBody = z.object({
  password: z.string().min(8, "Минимум 8 символов").max(200),
  name:     z.string().min(1).max(120).optional(),
});

publicRouter.post("/label-members/invite/:token/accept", async (req, res): Promise<void> => {
  const token = String(req.params.token || "").trim();
  if (!token) { res.status(400).json({ error: "Token required" }); return; }
  const parsed = AcceptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.select().from(labelMembersTable).where(eq(labelMembersTable.inviteToken, token));
  if (!row) { res.status(404).json({ error: "Приглашение не найдено или уже использовано" }); return; }
  if (row.status !== "pending") { res.status(409).json({ error: `Приглашение в статусе ${row.status}` }); return; }
  if (row.inviteExpiresAt && row.inviteExpiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "Срок действия приглашения истёк" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // Транзакция: атомарно «забираем» приглашение условным UPDATE
  // (status='pending' AND invite_token=token), и только при успешном захвате
  // создаём/обновляем user. Это защищает от race-condition при двух
  // параллельных accept-запросах с одним токеном.
  let result: { user: typeof usersTable.$inferSelect; member: typeof labelMembersTable.$inferSelect } | null = null;
  try {
    result = await db.transaction(async (tx) => {
      // Шаг 1. Атомарно забираем pending-инвайт. Если кто-то уже забрал —
      // вернётся пустой массив и мы прерываем транзакцию, не трогая users.
      const claimed = await tx.update(labelMembersTable)
        .set({
          status: "active",
          joinedAt: new Date(),
          inviteToken: null,
          inviteExpiresAt: null,
        })
        .where(and(
          eq(labelMembersTable.id, row.id),
          eq(labelMembersTable.inviteToken, token),
          eq(labelMembersTable.status, "pending"),
        ))
        .returning();
      if (claimed.length === 0) {
        throw new Error("invite_already_accepted");
      }
      let member = claimed[0]!;

      // Шаг 2. Создаём или обновляем пользователя.
      let user = (await tx.select().from(usersTable).where(eq(usersTable.email, row.email)))[0];
      if (!user) {
        // Маппинг роли участника лейбла в роль User: manager → manager, viewer → label.
        const userRole = row.role === "manager" ? "manager" : "label";
        const [created] = await tx.insert(usersTable).values({
          name: parsed.data.name?.trim() || row.name,
          email: row.email,
          role: userRole,
          status: "active",
          passwordHash,
          labelId: row.labelId,
          kycStatus: "not_started",
        }).returning();
        user = created;
      } else {
        // Существующий аккаунт: меняем пароль и привязываем к лейблу (если ещё не привязан).
        const [updated] = await tx.update(usersTable)
          .set({
            passwordHash,
            labelId: user.labelId ?? row.labelId,
          })
          .where(eq(usersTable.id, user.id))
          .returning();
        user = updated;
      }

      // Шаг 3. Привязываем user.id к строке участника (после того как user точно есть).
      const [withUser] = await tx.update(labelMembersTable)
        .set({ userId: user.id })
        .where(eq(labelMembersTable.id, member.id))
        .returning();
      member = withUser;

      return { user, member };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg === "invite_already_accepted") {
      res.status(409).json({ error: "Приглашение уже принято" });
      return;
    }
    throw e;
  }

  // result не может быть null здесь: либо мы вернулись в catch, либо tx прошёл.
  if (!result) {
    res.status(500).json({ error: "internal_error" });
    return;
  }

  logger.info(
    { labelMemberId: result.member.id, userId: result.user.id, labelId: row.labelId },
    "[label-members] invite accepted",
  );

  // Уведомление пригласившему: участник принял.
  if (row.invitedById) {
    void createNotification({
      userId: row.invitedById,
      type: "label_invite_accepted",
      title: `Участник принял приглашение: ${row.name}`,
      body: `Email ${row.email} теперь активный участник вашей команды.`,
      entityType: "general",
      entityId: result.member.id,
      link: "/labels",
    });
  }

  res.json({
    ok: true,
    email: result.user.email,
    message: "Приглашение принято. Войдите в систему с указанным паролем.",
  });
});

router.patch("/label-members/:id/role", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const id = parseInt(req.params.id, 10);
  const { role } = req.body as { role: string };

  const validRoles = ["owner", "manager", "viewer"];
  if (!validRoles.includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }

  const [existing] = await db.select().from(labelMembersTable).where(eq(labelMembersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const isOwner = scope.role === "label" && scope.labelId === existing.labelId;
  if (!isOwner && !scope.fullAccess) { res.status(403).json({ error: "Forbidden" }); return; }

  const [row] = await db.update(labelMembersTable)
    .set({ role })
    .where(eq(labelMembersTable.id, id))
    .returning();

  void auditMutation(req, { action: "update", entityType: "label_member", entityId: id, before: existing, after: row });
  res.json({ id: row.id, role: row.role });
});

router.delete("/label-members/:id", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const id = parseInt(req.params.id, 10);

  const [existing] = await db.select().from(labelMembersTable).where(eq(labelMembersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const isOwner = scope.role === "label" && scope.labelId === existing.labelId;
  if (!isOwner && !scope.fullAccess) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(labelMembersTable).where(eq(labelMembersTable.id, id));
  void auditMutation(req, { action: "delete", entityType: "label_member", entityId: id, before: existing, after: null });
  res.json({ ok: true });
});

export default router;
export { publicRouter as labelMembersPublicRouter };
