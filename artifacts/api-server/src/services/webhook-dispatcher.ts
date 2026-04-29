/**
 * Webhook dispatcher — отправка outbound webhooks подписчикам.
 *
 * fireWebhook(event, payload) вызывается fire-and-forget из бизнес-роутов.
 * Находит все enabled-webhooks подписанные на event (или на "*"),
 * шлёт POST с заголовками:
 *   Content-Type: application/json
 *   X-Tajik-Event: <event>
 *   X-Tajik-Signature: sha256=<hmac of body using secret>  (если есть secretHash)
 * Обновляет lastTriggeredAt / lastStatus / lastError.
 */

import { db, webhooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { logger } from "../lib/logger";

export async function fireWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const all = await db.select().from(webhooksTable).where(eq(webhooksTable.enabled, true));
    const subs = all.filter((w) => {
      const events = Array.isArray(w.events) ? w.events : [];
      return events.includes("*") || events.includes(event);
    });
    if (subs.length === 0) return;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

    for (const sub of subs) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Tajik-Event": event,
        "User-Agent": "TajikMusicCRM-Webhook/1.0",
      };
      if (sub.secret) {
        // Подписываем тем же секретом, который админ задал в UI.
        // Получатель верифицирует: hmac_sha256(secret, raw_body) == header.replace("sha256=","")
        const sig = createHmac("sha256", sub.secret).update(body).digest("hex");
        headers["X-Tajik-Signature"] = `sha256=${sig}`;
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), sub.timeoutMs ?? 5000);
      let status = 0;
      let errMsg: string | null = null;

      try {
        const resp = await fetch(sub.url, { method: "POST", headers, body, signal: ctrl.signal });
        status = resp.status;
        if (!resp.ok) errMsg = `HTTP ${resp.status}`;
      } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
      } finally {
        clearTimeout(timer);
      }

      await db.update(webhooksTable).set({
        lastTriggeredAt: new Date(),
        lastStatus: status || null,
        lastError: errMsg,
      }).where(eq(webhooksTable.id, sub.id));

      logger.info({
        webhookId: sub.id, event, url: sub.url, status, errMsg,
      }, errMsg ? "[webhook] delivery failed" : "[webhook] delivered");
    }
  } catch (err) {
    logger.warn({ err, event }, "[webhook] fireWebhook failed (non-blocking)");
  }
}

export function fireWebhookAndForget(event: string, payload: Record<string, unknown>): void {
  void fireWebhook(event, payload).catch((err) => {
    logger.warn({ err, event }, "[webhook] background fire rejected");
  });
}
