import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let cachedTransporter: Transporter | null = null;
let initialized = false;

function getTransporter(): Transporter | null {
  if (initialized) return cachedTransporter;
  initialized = true;
  const url = process.env.SMTP_URL;
  if (!url) {
    cachedTransporter = null;
    return null;
  }
  try {
    cachedTransporter = nodemailer.createTransport(url);
    logger.info("[mail] SMTP transport initialized from SMTP_URL");
  } catch (err) {
    logger.warn({ err }, "[mail] failed to init SMTP transport — emails будут пропускаться");
    cachedTransporter = null;
  }
  return cachedTransporter;
}

export function getAdminNotificationEmail(): string | null {
  return process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || null;
}

export function getMailFrom(): string {
  return process.env.MAIL_FROM?.trim() || "no-reply@tajikmusic.local";
}

export async function sendMail(msg: MailMessage): Promise<{ sent: boolean }> {
  const transporter = getTransporter();
  if (!transporter) {
    logger.info(
      { to: msg.to, subject: msg.subject },
      "[mail] SMTP_URL не задан — письмо записано в лог вместо отправки",
    );
    return { sent: false };
  }
  try {
    await transporter.sendMail({
      from: getMailFrom(),
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
