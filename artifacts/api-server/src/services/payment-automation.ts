/**
 * Payment automation scheduler — выполняет payment_automation_rules по cron-расписаниям.
 *
 * Поддерживаемые kinds:
 *   - 'auto_approve_below'    — авто-одобряет все pending payouts < threshold_cents (как single-step)
 *   - 'scheduled_payout'      — групповая обработка одобренных payouts (помечает paid)
 *   - 'min_payout_threshold'  — отклоняет pending payouts < threshold_cents с понятной причиной
 *   - 'auto_reject_failed_kyc'— отклоняет pending payouts от пользователей с kyc_status != 'approved'
 *
 * Cron: использует node-cron. Каждое правило живёт как отдельный schedule, при изменении
 * scheduleCron/kind/thresholdCents/enabled — пересоздаётся. Reload раз в минуту.
 */
import cron, { type ScheduledTask } from "node-cron";
import { db, paymentAutomationRulesTable, payoutsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { emitAlertAndForget } from "./alerts-emitter";

const RELOAD_INTERVAL_MS = 60_000;
let reloadTimer: NodeJS.Timeout | null = null;

interface AutomationRule {
  id: number;
  name: string;
  kind: string;
  thresholdCents: number;
  scheduleCron: string | null;
  enabled: boolean;
}

// Сигнатура правила — для определения "правило изменилось → пересоздать schedule".
function ruleSignature(r: AutomationRule): string {
  return `${r.kind}|${r.thresholdCents}|${r.scheduleCron ?? ""}`;
}

const scheduledTasks = new Map<number, { task: ScheduledTask; signature: string }>();

async function runRule(rule: AutomationRule): Promise<void> {
  logger.info({ ruleId: rule.id, kind: rule.kind }, "[payment-automation] firing");
  try {
    let affected = 0;
    if (rule.kind === "auto_approve_below" && rule.thresholdCents > 0) {
      const r = await db.execute(sql`
        UPDATE payouts
        SET status = 'approved',
            approval_stage = 'approved_l2',
            processed_at = NOW()
        WHERE status = 'pending'
          AND (amount * 100)::int < ${rule.thresholdCents}
          AND two_step_required = false
        RETURNING id
      `);
      affected = r.rows?.length ?? 0;
    } else if (rule.kind === "min_payout_threshold" && rule.thresholdCents > 0) {
      const r = await db.execute(sql`
        UPDATE payouts
        SET status = 'rejected',
            rejection_reason = ${'Сумма ниже минимального порога автоматизации (' + rule.thresholdCents + ' центов)'},
            processed_at = NOW()
        WHERE status = 'pending'
          AND (amount * 100)::int < ${rule.thresholdCents}
        RETURNING id
      `);
      affected = r.rows?.length ?? 0;
    } else if (rule.kind === "scheduled_payout") {
      const r = await db.update(payoutsTable)
        .set({ status: "paid", processedAt: new Date() })
        .where(eq(payoutsTable.status, "approved"))
        .returning({ id: payoutsTable.id });
      affected = r.length;
    } else if (rule.kind === "auto_reject_failed_kyc") {
      // Связь payout → user идёт через artists.id или labels.id (payouts.artist_id → artists.id; users.artist_id → artists.id).
      // Блокируем, если КАК МИНИМУМ ОДИН связанный с payout user имеет kyc != approved.
      const r = await db.execute(sql`
        UPDATE payouts p
        SET status = 'rejected',
            rejection_reason = 'KYC не пройден — выплата заблокирована автоматизацией',
            processed_at = NOW()
        WHERE p.status = 'pending'
          AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.kyc_status != 'approved'
              AND (
                (p.artist_id IS NOT NULL AND u.artist_id = p.artist_id)
                OR (p.label_id IS NOT NULL AND u.label_id = p.label_id)
              )
          )
        RETURNING p.id
      `);
      affected = r.rows?.length ?? 0;
    } else {
      logger.warn({ ruleId: rule.id, kind: rule.kind }, "[payment-automation] unknown kind, skipping");
    }

    await db.update(paymentAutomationRulesTable).set({ lastRunAt: new Date() }).where(eq(paymentAutomationRulesTable.id, rule.id));

    if (affected > 0) {
      emitAlertAndForget({
        kind: "payment_failed",
        severity: "low",
        message: `Автоматизация "${rule.name}" сработала: затронуто ${affected} выплат`,
        entityType: "payment_automation",
        entityId: rule.id,
        meta: { kind: rule.kind, affected },
      });
    }
    logger.info({ ruleId: rule.id, affected }, "[payment-automation] done");
  } catch (err) {
    logger.warn({ err, ruleId: rule.id }, "[payment-automation] rule failed");
  }
}

function scheduleRule(rule: AutomationRule): void {
  if (!rule.scheduleCron || !cron.validate(rule.scheduleCron)) {
    logger.warn({ ruleId: rule.id, cron: rule.scheduleCron }, "[payment-automation] invalid cron, skipping");
    return;
  }
  const task = cron.schedule(rule.scheduleCron, () => { void runRule(rule); }, {
    name: `payment_automation_${rule.id}`,
    noOverlap: true,
  });
  scheduledTasks.set(rule.id, { task, signature: ruleSignature(rule) });
}

async function reload(): Promise<void> {
  try {
    const rules = await db.select().from(paymentAutomationRulesTable).where(eq(paymentAutomationRulesTable.enabled, true));
    const wantedIds = new Set(rules.map((r) => r.id));

    // Снимаем те, которые больше не нужны (disabled / удалены)
    for (const [id, entry] of scheduledTasks.entries()) {
      if (!wantedIds.has(id)) {
        try { await entry.task.stop(); } catch { /* ignore */ }
        try { await entry.task.destroy(); } catch { /* ignore */ }
        scheduledTasks.delete(id);
      }
    }
    // Добавляем новые / пересоздаём изменившиеся
    for (const r of rules) {
      const sig = ruleSignature(r);
      const existing = scheduledTasks.get(r.id);
      if (existing && existing.signature === sig) continue; // не изменилось
      if (existing) {
        try { await existing.task.stop(); } catch { /* ignore */ }
        try { await existing.task.destroy(); } catch { /* ignore */ }
        scheduledTasks.delete(r.id);
        logger.info({ ruleId: r.id, oldSig: existing.signature, newSig: sig }, "[payment-automation] rule changed, rescheduling");
      }
      scheduleRule(r);
    }
  } catch (err) {
    logger.warn({ err }, "[payment-automation] reload failed");
  }
}

export function startPaymentAutomation(): void {
  if (reloadTimer) return;
  setTimeout(() => { void reload(); }, 30_000);
  reloadTimer = setInterval(() => { void reload(); }, RELOAD_INTERVAL_MS);
  logger.info({ reloadMs: RELOAD_INTERVAL_MS }, "[payment-automation] scheduler started");
}

export async function stopPaymentAutomation(): Promise<void> {
  if (reloadTimer) { clearInterval(reloadTimer); reloadTimer = null; }
  for (const entry of scheduledTasks.values()) {
    try { await entry.task.stop(); } catch { /* ignore */ }
    try { await entry.task.destroy(); } catch { /* ignore */ }
  }
  scheduledTasks.clear();
}
