// ─── Подтверждение почты и телефона ───────────────────────────────────────
// Почта подтверждается ссылкой из письма. Ссылка одноразовая: после перехода
// токен стирается, повторный переход вернёт «ссылка устарела».
//
// Телефон честно не работает: подтверждать его нечем, пока у заказчика нет
// SMS-шлюза. Маршрут заведён и отвечает 501 с прямым объяснением, чтобы это
// не выглядело сломанной кнопкой и чтобы потом хватило вписать отправку кода.
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSessionUser } from "../lib/auth";
import { isMailConfigured, sendMailAndForget } from "../lib/mail";
import { auditMutation } from "../lib/audit";
import { logger } from "../lib/logger";

const router = Router();

// Подтверждение по ссылке из письма — публичное: человек мог открыть письмо на
// телефоне, где он не залогинен. Поэтому оно живёт в отдельном роутере,
// который подключается ДО проверки входа.
export const verificationPublicRouter = Router();

/** Ссылка живёт сутки: дольше держать одноразовый доступ к аккаунту незачем. */
const TOKEN_TTL_MS = 24 * 3600 * 1000;

router.get("/users/me/verification", async (req, res): Promise<void> => {
  const session = getSessionUser(req);
  if (!session) { res.status(401).json({ error: "Требуется вход" }); return; }

  const [user] = await db.select({
    email: usersTable.email,
    phone: usersTable.phone,
    emailVerifiedAt: usersTable.emailVerifiedAt,
    emailVerifySentAt: usersTable.emailVerifySentAt,
    phoneVerifiedAt: usersTable.phoneVerifiedAt,
  }).from(usersTable).where(eq(usersTable.id, session.id));
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  res.json({
    email: user.email,
    phone: user.phone,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailSentAt: user.emailVerifySentAt?.toISOString() ?? null,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    // Пусть интерфейс сразу знает, что кнопки для телефона не будет.
    phoneVerificationAvailable: false,
  });
});

router.post("/users/me/verify-email/send", async (req, res): Promise<void> => {
  const session = getSessionUser(req);
  if (!session) { res.status(401).json({ error: "Требуется вход" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  if (user.emailVerifiedAt) { res.json({ ok: true, alreadyVerified: true }); return; }

  // Не даём засыпать себя письмами: одно в минуту достаточно.
  if (user.emailVerifySentAt && Date.now() - user.emailVerifySentAt.getTime() < 60_000) {
    res.status(429).json({ error: "Письмо уже отправлено. Проверьте почту или попробуйте через минуту." });
    return;
  }

  // Подтвердить адрес можно только письмом. Если почта не настроена, кнопка
  // не должна молча «срабатывать» — иначе человек ждёт письмо, которого нет.
  if (!await isMailConfigured()) {
    res.status(503).json({
      error: "Отправка почты не настроена — подтвердить адрес сейчас нельзя. " +
             "Администратор задаёт SMTP в разделе «Настройки → Email / SMTP».",
    });
    return;
  }

  const token = randomUUID();
  await db.update(usersTable)
    .set({ emailVerifyToken: token, emailVerifySentAt: new Date(), updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const link = `${process.env.PUBLIC_APP_URL ?? ""}/verify-email/${token}`;
  sendMailAndForget({
    to: user.email,
    subject: "Подтвердите адрес почты — Tajik Music",
    text:
      `Здравствуйте, ${user.name}!\n\n` +
      `Подтвердите адрес почты по ссылке:\n${link}\n\n` +
      `Ссылка действует сутки. Если вы её не запрашивали — просто не переходите.`,
  });
  logger.info({ userId: user.id }, "[verification] отправлено письмо подтверждения");

  res.json({ ok: true });
});

const ConfirmBody = z.object({ token: z.string().min(10).max(200) }).strict();

// Публичный: человек переходит по ссылке из письма, и он может быть не в сессии
// (открыл на другом устройстве). Токен сам по себе доказывает доступ к почте.
verificationPublicRouter.post("/verify-email/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.emailVerifyToken, parsed.data.token));
  if (!user) { res.status(404).json({ error: "Ссылка недействительна или уже использована" }); return; }

  if (user.emailVerifySentAt && Date.now() - user.emailVerifySentAt.getTime() > TOKEN_TTL_MS) {
    res.status(410).json({ error: "Ссылка устарела — запросите новую в кабинете" });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ emailVerifiedAt: new Date(), emailVerifyToken: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id)).returning();

  void auditMutation(req, {
    action: "update", entityType: "user", entityId: user.id,
    before: { emailVerified: false }, after: { emailVerified: true },
  });

  res.json({ ok: true, email: updated.email });
});

router.post("/users/me/verify-phone/send", async (req, res): Promise<void> => {
  const session = getSessionUser(req);
  if (!session) { res.status(401).json({ error: "Требуется вход" }); return; }
  res.status(501).json({
    error: "Подтверждение телефона пока недоступно: не подключён SMS-шлюз. " +
           "Телефон проверяет менеджер при разговоре.",
  });
});

export default router;
