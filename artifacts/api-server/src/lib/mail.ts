import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let cachedTransporter: Transporter | null = null;
let cachedFromOverride: string | null = null;
let cachedFingerprint: string | null = null;
let lastResolveAt = 0;

const RESOLVE_TTL_MS = 60_000; // пере-проверка настроек раз в минуту

type SmtpConfig = {
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  tls?: boolean;
  fromAddress?: string;
};

async function loadDbSettings(): Promise<SmtpConfig | null> {
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "notifications"));
    if (!row) return null;
    const v = row.value as Record<string, unknown>;
    if (!v.emailEnabled) return null;
    const host = typeof v.smtpHost === "string" ? v.smtpHost.trim() : "";
    if (!host) return null;
    return {
      host,
      port: Number(v.smtpPort) || 587,
      user: typeof v.smtpUser === "string" ? v.smtpUser : undefined,
      pass: typeof v.smtpPassword === "string" ? v.smtpPassword : undefined,
      tls: v.smtpTls !== false,
      fromAddress: typeof v.smtpFromAddress === "string" ? v.smtpFromAddress : undefined,
    };
  } catch (err) {
    logger.warn({ err }, "[mail] не удалось прочитать platform_settings — fallback на env");
    return null;
  }
}

async function resolveTransport(): Promise<{ transport: Transporter | null; fromOverride: string | null }> {
  const now = Date.now();
  if (cachedTransporter && now - lastResolveAt < RESOLVE_TTL_MS) {
    // Кэш-хит: возвращаем и transport, и сохранённый fromOverride.
    return { transport: cachedTransporter, fromOverride: cachedFromOverride };
  }

  // 0) Проверяем Resend-интеграцию (Настройки → Интеграции → Resend)
  try {
    const resendIntegration = await getIntegrationByCode("resend");
    if (resendIntegration && resendIntegration.status !== "disconnected") {
      const creds = await loadCredentials(resendIntegration.id);
      const apiKey = creds["api_key"];
      if (apiKey) {
        const fingerprint = `resend:${apiKey.slice(0, 8)}`;
        if (fingerprint !== cachedFingerprint) {
          // Resend предоставляет SMTP-relay: smtp.resend.com:465, user="resend", pass=api_key
          cachedTransporter = nodemailer.createTransport({
            host: "smtp.resend.com",
            port: 465,
            secure: true,
            auth: { user: "resend", pass: apiKey },
          });
          cachedFingerprint = fingerprint;
          cachedFromOverride = null;
          logger.info("[mail] SMTP transport инициализирован через Resend-интеграцию");
        }
        lastResolveAt = now;
        return { transport: cachedTransporter, fromOverride: cachedFromOverride };
      }
    }
  } catch (err) {
    logger.warn({ err }, "[mail] ошибка при загрузке Resend-интеграции, пробуем другие источники");
  }

  // 1) Сначала проверяем БД-настройки (приоритет — UI важнее env)
  const dbCfg = await loadDbSettings();
  let fingerprint = "";

  if (dbCfg && dbCfg.host) {
    fingerprint = `db:${dbCfg.host}:${dbCfg.port}:${dbCfg.user ?? ""}:${dbCfg.tls}`;
    if (fingerprint !== cachedFingerprint) {
      try {
        cachedTransporter = nodemailer.createTransport({
          host: dbCfg.host,
          port: dbCfg.port,
          secure: dbCfg.port === 465,
          requireTLS: dbCfg.tls && dbCfg.port !== 465,
          auth: dbCfg.user ? { user: dbCfg.user, pass: dbCfg.pass ?? "" } : undefined,
        });
        cachedFingerprint = fingerprint;
        logger.info({ host: dbCfg.host, port: dbCfg.port }, "[mail] SMTP transport инициализирован из platform_settings");
      } catch (err) {
        logger.warn({ err }, "[mail] не удалось создать transport по DB-настройкам — fallback на env");
        cachedTransporter = null;
        cachedFingerprint = null;
      }
    }
    if (cachedTransporter) {
      cachedFromOverride = dbCfg.fromAddress ?? null;
      lastResolveAt = now;
      return { transport: cachedTransporter, fromOverride: cachedFromOverride };
    }
  }

  // 2) Fallback на ENV
  const url = process.env.SMTP_URL;
  if (!url) {
    cachedTransporter = null;
    cachedFingerprint = null;
    cachedFromOverride = null;
    lastResolveAt = now;
    return { transport: null, fromOverride: null };
  }
  fingerprint = `env:${url}`;
  if (fingerprint !== cachedFingerprint) {
    try {
      cachedTransporter = nodemailer.createTransport(url);
      cachedFingerprint = fingerprint;
      logger.info("[mail] SMTP transport initialized from SMTP_URL");
    } catch (err) {
      logger.warn({ err }, "[mail] failed to init SMTP transport — emails будут пропускаться");
      cachedTransporter = null;
      cachedFingerprint = null;
    }
  }
  cachedFromOverride = null; // env-режим использует MAIL_FROM из env
  lastResolveAt = now;
  return { transport: cachedTransporter, fromOverride: null };
}

export function getAdminNotificationEmail(): string | null {
  return process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || null;
}

export function getMailFrom(): string {
  return process.env.MAIL_FROM?.trim() || "no-reply@tajikmusic.local";
}

export async function sendMail(msg: MailMessage): Promise<{ sent: boolean }> {
  const { transport, fromOverride } = await resolveTransport();
  if (!transport) {
    logger.info(
      { to: msg.to, subject: msg.subject },
      "[mail] SMTP не настроен (ни в platform_settings, ни в SMTP_URL) — письмо записано в лог вместо отправки",
    );
    return { sent: false };
  }
  try {
    await transport.sendMail({
      from: fromOverride ?? getMailFrom(),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? `<pre style="font-family:system-ui">${escapeHtml(msg.text)}</pre>`,
    });
    return { sent: true };
  } catch (err) {
    logger.warn({ err, to: msg.to, subject: msg.subject }, "[mail] sendMail failed (non-blocking)");
    return { sent: false };
  }
}

export function sendMailAndForget(msg: MailMessage): void {
  void sendMail(msg).catch((err) => {
    logger.warn({ err, to: msg.to }, "[mail] background sendMail rejected");
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
