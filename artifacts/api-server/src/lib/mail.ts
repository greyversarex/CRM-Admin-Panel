import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";
import { decryptSecret } from "./crypto";

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

/** Общие таймауты подключения к SMTP. */
const MAIL_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

type SmtpConfig = {
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  tls?: boolean;
  fromAddress?: string;
};

/**
 * Пароль SMTP хранится зашифрованным (smtpPasswordEnc). Открытый smtpPassword
 * остаётся только у настроек, сохранённых до шифрования, — читаем и его,
 * иначе почта отвалилась бы у тех, кто уже всё настроил.
 */
function readPassword(v: Record<string, unknown>): string | undefined {
  if (typeof v.smtpPasswordEnc === "string" && v.smtpPasswordEnc) {
    try {
      return decryptSecret(v.smtpPasswordEnc);
    } catch (err) {
      logger.error({ err }, "[mail] не удалось расшифровать пароль SMTP — проверьте INTEGRATIONS_ENCRYPTION_KEY");
      return undefined;
    }
  }
  return typeof v.smtpPassword === "string" ? v.smtpPassword : undefined;
}

/**
 * Адрес отправителя из настроек панели, независимо от SMTP.
 *
 * loadDbSettings отдаёт null, когда не заполнен хост или выключен переключатель
 * «Email включён», — а при отправке через Resend ни то, ни другое не нужно.
 * Без отдельного чтения адрес терялся, и письма уходили бы с несуществующего
 * домена по умолчанию.
 */
async function loadFromAddress(): Promise<string | null> {
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "notifications"));
    const v = (row?.value ?? {}) as Record<string, unknown>;
    const from = typeof v.smtpFromAddress === "string" ? v.smtpFromAddress.trim() : "";
    const name = typeof v.smtpFromName === "string" ? v.smtpFromName.trim() : "";
    if (!from) return null;
    // Resend принимает и «Имя <адрес>», и голый адрес.
    return name ? `${name} <${from}>` : from;
  } catch (err) {
    logger.warn({ err }, "[mail] не удалось прочитать адрес отправителя");
    return null;
  }
}

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
      pass: readPassword(v),
      tls: v.smtpTls !== false,
      fromAddress: typeof v.smtpFromAddress === "string" ? v.smtpFromAddress : undefined,
    };
  } catch (err) {
    logger.warn({ err }, "[mail] не удалось прочитать platform_settings — fallback на env");
    return null;
  }
}

/**
 * Отправка через HTTP-интерфейс Resend.
 *
 * Наружу выглядит как обычный transport nodemailer — остальному коду не нужно
 * знать, каким путём ушло письмо.
 *
 * Зачем это вообще: DigitalOcean по умолчанию закрывает исходящие порты 25,
 * 465 и 587, поэтому с нашего сервера недоступен любой SMTP — в том числе
 * smtp.resend.com, которым этот код пользовался раньше. Проверено на месте:
 * почтовые порты закрыты ко всем провайдерам, а api.resend.com по 443 открыт.
 */
function createResendHttpTransport(apiKey: string): Transporter {
  const send = async (msg: {
    from?: string; to?: string | string[]; subject?: string; text?: string; html?: string;
  }) => {
    const to = Array.isArray(msg.to) ? msg.to : [msg.to].filter(Boolean) as string[];
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: msg.from,
        to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      // Текст ошибки отдаём как есть: по нему сразу видно, дело в ключе или
      // в неподтверждённом домене отправителя.
      throw new Error(body.message || body.name || `Resend вернул ${res.status}`);
    }
    return { messageId: body.id ?? "", accepted: to };
  };
  // Приводим к типу nodemailer: снаружи используется только sendMail.
  return { sendMail: send } as unknown as Transporter;
}

async function resolveTransport(): Promise<{ transport: Transporter | null; fromOverride: string | null }> {
  const now = Date.now();
  if (cachedTransporter && now - lastResolveAt < RESOLVE_TTL_MS) {
    // Кэш-хит: возвращаем и transport, и сохранённый fromOverride.
    return { transport: cachedTransporter, fromOverride: cachedFromOverride };
  }

  // 0) Проверяем Resend — сначала ENV (RESEND_API_KEY надёжнее, не слетит
  // если кто-то случайно отключит интеграцию в UI), потом UI-интеграцию.
  try {
    const envApiKey = process.env.RESEND_API_KEY?.trim();
    let apiKey = envApiKey || "";
    let source = envApiKey ? "env" : "";
    if (!apiKey) {
      const resendIntegration = await getIntegrationByCode("resend");
      if (resendIntegration && resendIntegration.status !== "disconnected") {
        const creds = await loadCredentials(resendIntegration.id);
        apiKey = creds["api_key"] || "";
        source = "integration";
      }
    }
    if (apiKey) {
      const fingerprint = `resend:${source}:${apiKey.slice(0, 8)}`;
      if (fingerprint !== cachedFingerprint) {
        // Через HTTPS, а не через smtp.resend.com: на этом сервере почтовые
        // порты закрыты хостингом, и SMTP-канал Resend упирался в тот же
        // запрет. HTTP-канал работает поверх обычного 443.
        cachedTransporter = createResendHttpTransport(apiKey);
        cachedFingerprint = fingerprint;
        // Адрес отправителя берём из настроек панели. Прежде здесь стоял null,
        // и письмо уходило с умолчания no-reply@tajikmusic.local — такой домен
        // Resend отвергает, то есть не ушло бы ни одно письмо.
        cachedFromOverride = await loadFromAddress();
        logger.info({ source, from: cachedFromOverride }, "[mail] Resend готов (HTTP)");
      }
      lastResolveAt = now;
      return { transport: cachedTransporter, fromOverride: cachedFromOverride };
    }
  } catch (err) {
    logger.warn({ err }, "[mail] не удалось инициализировать Resend, пробуем SMTP/env");
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
          // Без таймаутов попытка достучаться до закрытого порта висит минутами:
          // запрос успевал упереться в таймаут nginx, и вместо понятной ошибки
          // пользователь получал «504». Десяти секунд хватает любому SMTP.
          ...MAIL_TIMEOUTS,
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

/**
 * Настроена ли отправка почты вообще.
 *
 * Нужна там, где письмо — единственный способ доставить код или ссылку: если
 * почты нет, честнее сказать об этом сразу и дать администратору передать код
 * вручную, чем отвечать «письмо отправлено» и оставить человека ждать.
 */
/**
 * Забыть подобранный transport.
 *
 * Настройки кэшируются на минуту, и без сброса «Отправить тестовое письмо»
 * сразу после сохранения отвечало «почта не настроена» — по старому кэшу.
 */
export function invalidateMailCache(): void {
  cachedTransporter = null;
  cachedFingerprint = null;
  cachedFromOverride = null;
  lastResolveAt = 0;
}

export async function isMailConfigured(): Promise<boolean> {
  const resolved = await resolveTransport();
  return Boolean(resolved.transport);
}

/**
 * Отправляет письмо.
 *
 * Обычные вызовы ошибку не поднимают: письмо — сопутствующее действие, и
 * падать из-за него нельзя. Проверке отправки нужна ровно обратная логика,
 * поэтому у неё есть `rethrow`: без него кнопка «Отправить тестовое письмо»
 * показывала бы «почта не настроена» вместо настоящей причины отказа.
 */
export async function sendMail(
  msg: MailMessage,
  opts: { rethrow?: boolean } = {},
): Promise<{ sent: boolean; configured: boolean }> {
  const { transport, fromOverride } = await resolveTransport();
  if (!transport) {
    logger.info(
      { to: msg.to, subject: msg.subject },
      "[mail] SMTP не настроен (ни в platform_settings, ни в SMTP_URL) — письмо записано в лог вместо отправки",
    );
    return { sent: false, configured: false };
  }
  try {
    await transport.sendMail({
      from: fromOverride ?? getMailFrom(),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? `<pre style="font-family:system-ui">${escapeHtml(msg.text)}</pre>`,
    });
    return { sent: true, configured: true };
  } catch (err) {
    if (opts.rethrow) throw err;
    logger.warn({ err, to: msg.to, subject: msg.subject }, "[mail] sendMail failed (non-blocking)");
    return { sent: false, configured: true };
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
