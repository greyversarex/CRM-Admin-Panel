/**
 * Realtime alerts emitter — централизованный helper для записи в realtime_alerts.
 *
 * Зачем: автоматическая генерация системных алертов из бизнес-событий
 * (KYC отказ, fraud, провал DDEX-доставки, провал payout, signup и т.д.).
 *
 * Все вызовы fire-and-forget — никогда не блокируют основной запрос.
 */
import { db, realtimeAlertsTable } from "@workspace/db";
import { logger } from "../lib/logger";

export type AlertKind = "spike" | "drop" | "fraud" | "takedown" | "system_error" | "payment_failed" | "kyc_rejected" | "signup" | "ddex_failed";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface EmitAlertParams {
  kind: AlertKind;
  severity?: AlertSeverity;
  message: string;
  entityType?: string | null;
  entityId?: number | null;
  meta?: Record<string, unknown>;
}

export async function emitAlert(p: EmitAlertParams): Promise<void> {
  try {
    await db.insert(realtimeAlertsTable).values({
      kind: p.kind,
      severity: p.severity ?? "medium",
      message: p.message,
      entityType: p.entityType ?? null,
      entityId: p.entityId ?? null,
      meta: p.meta ?? {},
    });
  } catch (err) {
    logger.warn({ err, kind: p.kind }, "[alerts-emitter] failed to insert");
  }
}

export function emitAlertAndForget(p: EmitAlertParams): void {
  void emitAlert(p);
}
