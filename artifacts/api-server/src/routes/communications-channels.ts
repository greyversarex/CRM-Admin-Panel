/**
 * Communications — Multi-channel send (Telegram + WhatsApp + Email + Push)
 *
 * POST /api/communications/send
 *   { channel: 'email'|'push'|'telegram'|'whatsapp', to: string, subject?, body }
 *
 * POST /api/communications/test-channel { channel }   — отправляет тестовое сообщение себе
 *
 * Без credentials в settings.channels.{telegram|whatsapp} — возвращает 503 с понятным сообщением.
 * Email/Push — используют существующие настройки SMTP/VAPID (если уже настроены).
 */
import { Router } from "express";
import { z } from "zod";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

const router = Router();

interface ChannelsConfig {
  telegram?: { enabled?: boolean; botToken?: string; defaultChatId?: string };
  whatsapp?: { enabled?: boolean; provider?: "twilio" | "meta"; accountSid?: string; authToken?: string; fromNumber?: string };
}

async function loadChannels(): Promise<ChannelsConfig> {
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "channels"));
    return (row?.value ?? {}) as ChannelsConfig;
  } catch { return {}; }
}

async function sendTelegram(cfg: ChannelsConfig["telegram"], to: string, body: string) {
  if (!cfg?.botToken) throw new Error("Telegram bot token не настроен (Настройки → Каналы)");
  const chatId = to || cfg.defaultChatId;
  if (!chatId) throw new Error("Не указан chat_id и нет defaultChatId");
  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body, parse_mode: "HTML" }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Telegram API: HTTP ${r.status} ${t.slice(0, 200)}`);
  }
  return await r.json();
}

async function sendWhatsapp(cfg: ChannelsConfig["whatsapp"], to: string, body: string) {
  if (!cfg?.accountSid || !cfg?.authToken || !cfg?.fromNumber) {
    throw new Error("WhatsApp credentials не настроены (Настройки → Каналы → WhatsApp/Twilio)");
  }
  if (!to) throw new Error("Не указан получатель (E.164 формат)");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const auth = "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  const params = new URLSearchParams({
    From: `whatsapp:${cfg.fromNumber}`,
    To: `whatsapp:${to}`,
    Body: body,
  });
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Twilio API: HTTP ${r.status} ${t.slice(0, 200)}`);
  }
  return await r.json();
}

const SendBody = z.object({
  channel: z.enum(["email", "push", "telegram", "whatsapp"]),
  to: z.string().min(1).max(200),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(8000),
});

router.post("/communications/send", async (req, res) => {
  const parsed = SendBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const { channel, to, subject, body } = parsed.data;

  try {
    const channels = await loadChannels();
    if (channel === "telegram") {
      const result = await sendTelegram(channels.telegram, to, body);
      void auditMutation(req, { action: "send", entityType: "comm_message", entityId: 0, before: null, after: { channel, to, subject } });
      res.json({ ok: true, channel, result });
      return;
    }
    if (channel === "whatsapp") {
      const result = await sendWhatsapp(channels.whatsapp, to, body);
      void auditMutation(req, { action: "send", entityType: "comm_message", entityId: 0, before: null, after: { channel, to, subject } });
      res.json({ ok: true, channel, result: { sid: (result as { sid?: string }).sid } });
      return;
    }
    // email/push — делегируем существующему mail/push сервису, если он есть
    res.status(501).json({ error: "not_implemented", message: `Канал ${channel} обрабатывается отдельным сервисом (campaigns/notifications)` });
  } catch (e) {
    res.status(503).json({ error: "send_failed", message: (e as Error).message });
  }
});

router.post("/communications/test-channel", async (req, res) => {
  const body = z.object({ channel: z.enum(["telegram", "whatsapp"]), to: z.string().min(1) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "validation" }); return; }
  try {
    const channels = await loadChannels();
    const text = `Тестовое сообщение от Tajik Music Distribution (${new Date().toISOString()})`;
    if (body.data.channel === "telegram") {
      await sendTelegram(channels.telegram, body.data.to, text);
    } else {
      await sendWhatsapp(channels.whatsapp, body.data.to, text);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ error: "test_failed", message: (e as Error).message });
  }
});

router.get("/communications/channels-status", async (_req, res) => {
  const c = await loadChannels();
  res.json({
    telegram: { configured: Boolean(c.telegram?.botToken), enabled: c.telegram?.enabled ?? false },
    whatsapp: { configured: Boolean(c.whatsapp?.accountSid && c.whatsapp?.authToken && c.whatsapp?.fromNumber), enabled: c.whatsapp?.enabled ?? false },
  });
});

export default router;
