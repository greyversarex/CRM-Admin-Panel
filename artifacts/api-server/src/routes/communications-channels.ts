/**
 * Communications — Multi-channel send (Email + Web Push)
 *
 * POST /api/communications/send
 *   { channel: 'email'|'push', to: string, subject?, body }
 *
 * POST /api/communications/test-channel { channel }   — отправляет тестовое сообщение себе
 *
 * Email — использует SMTP-настройки из platform_settings.notifications.
 * Push — использует VAPID-ключи из platform_settings.notifications.
 */
import { Router } from "express";
import { z } from "zod";
import { db, platformSettingsTable, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { auditMutation } from "../lib/audit";
import { sendMail } from "../lib/mail";
import { logger } from "../lib/logger";

const router = Router();

interface NotificationsConfig {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  pushVapidPublicKey?: string;
  pushVapidPrivateKey?: string;
  pushSubject?: string;
}

async function loadNotifications(): Promise<NotificationsConfig> {
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "notifications"));
    return (row?.value ?? {}) as NotificationsConfig;
  } catch { return {}; }
}

/**
 * Email-канал — реальная отправка через nodemailer (SMTP-настройки из platform_settings.notifications).
 * to: email-адрес. subject: Subject. body: text/HTML.
 */
async function sendEmail(to: string, subject: string | undefined, body: string): Promise<{ sent: boolean }> {
  if (!to.includes("@")) throw new Error("Невалидный email-адрес");
  const result = await sendMail({
    to,
    subject: subject ?? "Сообщение от Tajik Music Distribution",
    html: body,
    text: body.replace(/<[^>]+>/g, ""),
  });
  if (!result.sent) {
    throw new Error("SMTP не настроен (Настройки → Уведомления → SMTP)");
  }
  return result;
}

/**
 * Push-канал — реальная отправка через web-push (VAPID-ключи из platform_settings.notifications).
 * to: либо userId (число) → шлём всем подпискам пользователя, либо email пользователя.
 */
async function sendPush(to: string, subject: string | undefined, body: string): Promise<{ sent: number; failed: number }> {
  const cfg = await loadNotifications();
  if (!cfg.pushEnabled || !cfg.pushVapidPublicKey || !cfg.pushVapidPrivateKey) {
    throw new Error("Push не настроен (Настройки → Уведомления → VAPID-ключи)");
  }
  webpush.setVapidDetails(
    cfg.pushSubject ?? "mailto:noreply@tajikmusic.com",
    cfg.pushVapidPublicKey,
    cfg.pushVapidPrivateKey,
  );

  let subs: Array<typeof pushSubscriptionsTable.$inferSelect> = [];
  const asNum = Number(to);
  if (Number.isFinite(asNum) && asNum > 0) {
    subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, asNum));
  } else if (to.includes("@")) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.email, to));
    if (u) subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, u.id));
  }
  if (subs.length === 0) {
    throw new Error(`Нет push-подписок для ${to}`);
  }

  const payload = JSON.stringify({
    title: subject ?? "Tajik Music Distribution",
    body,
    timestamp: Date.now(),
  });

  let sent = 0, failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }, payload);
      sent++;
    } catch (e) {
      logger.warn({ err: e, subId: s.id }, "[push] sendNotification failed");
      failed++;
      if ((e as { statusCode?: number }).statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, s.id)).catch(() => undefined);
      }
    }
  }
  if (sent === 0) throw new Error(`Все ${failed} push-доставок провалились`);
  return { sent, failed };
}

const SendBody = z.object({
  channel: z.enum(["email", "push"]),
  to: z.string().min(1).max(200),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(8000),
});

router.post("/communications/send", async (req, res) => {
  const parsed = SendBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const { channel, to, subject, body } = parsed.data;

  try {
    if (channel === "email") {
      const result = await sendEmail(to, subject, body);
      void auditMutation(req, { action: "send", entityType: "comm_message", entityId: 0, before: null, after: { channel, to, subject } });
      res.json({ ok: true, channel, result });
      return;
    }
    if (channel === "push") {
      const result = await sendPush(to, subject, body);
      void auditMutation(req, { action: "send", entityType: "comm_message", entityId: 0, before: null, after: { channel, to, subject, ...result } });
      res.json({ ok: true, channel, result });
      return;
    }
    res.status(400).json({ error: "unknown_channel", message: `Неизвестный канал: ${channel}` });
  } catch (e) {
    res.status(503).json({ error: "send_failed", message: (e as Error).message });
  }
});

router.post("/communications/test-channel", async (req, res) => {
  const body = z.object({ channel: z.enum(["email", "push"]), to: z.string().min(1) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "validation" }); return; }
  try {
    const text = `Тестовое сообщение от Tajik Music Distribution (${new Date().toISOString()})`;
    if (body.data.channel === "email") {
      await sendEmail(body.data.to, "Тестовое сообщение", text);
    } else {
      await sendPush(body.data.to, "Тестовое сообщение", text);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ error: "test_failed", message: (e as Error).message });
  }
});

router.get("/communications/channels-status", async (_req, res) => {
  const cfg = await loadNotifications();
  res.json({
    email: { enabled: cfg.emailEnabled ?? false },
    push: { configured: Boolean(cfg.pushVapidPublicKey && cfg.pushVapidPrivateKey), enabled: cfg.pushEnabled ?? false },
  });
});

export default router;
