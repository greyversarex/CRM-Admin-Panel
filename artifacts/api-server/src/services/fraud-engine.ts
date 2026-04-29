/**
 * Fraud engine — фоновый исполнитель fraud_rules.
 *
 * Каждые FRAUD_INTERVAL_MS читает enabled-правила из fraud_rules.
 * Для каждого rule_type выполняет соответствующий запрос-детектор:
 *
 *   - 'multiple_logins'   — > N успешных логинов одного user_id за window_minutes
 *   - 'payout_velocity'   — > N запросов на выплату от одного artist/label за window_minutes
 *   - 'acrcloud_match'    — N+ matched ACR-проверок (заявка чужого контента)
 *   - 'failed_logins'     — > N подряд неудачных логинов одного email/IP
 *   - 'takedown_burst'    — > N takedown-запросов на одного label/artist
 *
 * Если threshold превышен → создаём fraud_alert (если ещё нет открытого по тому же entity).
 * Дополнительно: emitAlert(severity=high+) → realtime_alerts.
 */
import { db, fraudRulesTable, fraudAlertsTable, auditLogTable, payoutsTable, acrChecksTable, releasesTable, ugcMetricsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { emitAlertAndForget } from "./alerts-emitter";

const FRAUD_INTERVAL_MS = Number(process.env["FRAUD_INTERVAL_MS"] ?? 10 * 60_000); // default 10 min

let timer: NodeJS.Timeout | null = null;
let running = false;

interface FraudRuleRow {
  id: number;
  name: string;
  ruleType: string;
  threshold: number;
  windowMinutes: number;
  severity: string;
  enabled: boolean;
}

async function existsOpenAlert(ruleId: number, entityType: string, entityId: number | null): Promise<boolean> {
  const where = entityType === "user"
    ? and(eq(fraudAlertsTable.ruleId, ruleId), eq(fraudAlertsTable.userId, entityId!), eq(fraudAlertsTable.status, "open"))
    : entityType === "release"
    ? and(eq(fraudAlertsTable.ruleId, ruleId), eq(fraudAlertsTable.releaseId, entityId!), eq(fraudAlertsTable.status, "open"))
    : entityType === "track"
    ? and(eq(fraudAlertsTable.ruleId, ruleId), eq(fraudAlertsTable.trackId, entityId!), eq(fraudAlertsTable.status, "open"))
    : and(eq(fraudAlertsTable.ruleId, ruleId), eq(fraudAlertsTable.status, "open"));
  const [r] = await db.select({ id: fraudAlertsTable.id }).from(fraudAlertsTable).where(where).limit(1);
  return Boolean(r);
}

async function createAlert(rule: FraudRuleRow, entityType: "user" | "release" | "track" | null, entityId: number | null, count: number): Promise<void> {
  const description = `Правило "${rule.name}" сработало: ${count} событий за ${rule.windowMinutes} мин (порог ${rule.threshold})`;
  await db.insert(fraudAlertsTable).values({
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    status: "open",
    userId: entityType === "user" ? entityId : null,
    releaseId: entityType === "release" ? entityId : null,
    trackId: entityType === "track" ? entityId : null,
    description,
    meta: { ruleType: rule.ruleType, count, windowMinutes: rule.windowMinutes, threshold: rule.threshold },
  });
  if (rule.severity === "high" || rule.severity === "critical") {
    emitAlertAndForget({
      kind: "fraud",
      severity: rule.severity as "high" | "critical",
      message: description,
      entityType,
      entityId,
      meta: { ruleId: rule.id, ruleType: rule.ruleType },
    });
  }
}

async function evalMultipleLogins(rule: FraudRuleRow): Promise<void> {
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);
  // audit_log: action='login', after.success = true
  const rows = await db.execute<{ user_id: number; cnt: number }>(sql`
    SELECT user_id, COUNT(*)::int AS cnt
    FROM audit_log
    WHERE action = 'login'
      AND (after->>'success')::boolean IS TRUE
      AND created_at >= ${since}
      AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) > ${rule.threshold}
    LIMIT 50
  `);
  for (const r of rows.rows ?? []) {
    if (await existsOpenAlert(rule.id, "user", r.user_id)) continue;
    await createAlert(rule, "user", r.user_id, r.cnt);
  }
}

// Алерты по IP (брут-форс с непривязанным user_id) — entity_type='ip', entity_id=NULL,
// IP кладём в meta + description. Дедуп через description LIKE %ip%.
async function existsOpenAlertIp(ruleId: number, ip: string): Promise<boolean> {
  const r = await db.execute<{ id: number }>(sql`
    SELECT id FROM fraud_alerts
    WHERE rule_id = ${ruleId}
      AND status = 'open'
      AND meta->>'ip' = ${ip}
    LIMIT 1
  `);
  return (r.rows?.length ?? 0) > 0;
}

async function createAlertIp(rule: FraudRuleRow, ip: string, count: number): Promise<void> {
  const description = `Правило "${rule.name}" сработало: ${count} неудачных логинов с IP ${ip} за ${rule.windowMinutes} мин (порог ${rule.threshold})`;
  await db.insert(fraudAlertsTable).values({
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    status: "open",
    description,
    meta: { ruleType: rule.ruleType, count, ip, windowMinutes: rule.windowMinutes, threshold: rule.threshold },
  });
  if (rule.severity === "high" || rule.severity === "critical") {
    emitAlertAndForget({
      kind: "fraud",
      severity: rule.severity as "high" | "critical",
      message: description,
      entityType: "ip",
      entityId: null,
      meta: { ruleId: rule.id, ruleType: rule.ruleType, ip },
    });
  }
}

// Generic alerts по entity, который НЕ имеет колонки в fraud_alerts (artist/label),
// чтобы НЕ пытаться писать artist_id/label_id в user_id (FK→users) — это ломает вставку.
// Хранится в meta + description; дедуп через meta-key.
async function existsOpenAlertEntity(ruleId: number, metaKey: string, entityId: number): Promise<boolean> {
  const r = await db.execute<{ id: number }>(sql`
    SELECT id FROM fraud_alerts
    WHERE rule_id = ${ruleId}
      AND status = 'open'
      AND meta->>${metaKey} = ${String(entityId)}
    LIMIT 1
  `);
  return (r.rows?.length ?? 0) > 0;
}

async function createAlertEntity(rule: FraudRuleRow, entity: "artist" | "label", entityId: number, count: number): Promise<void> {
  const labelRu = entity === "artist" ? "артиста" : "лейбла";
  const description = `Правило "${rule.name}" сработало для ${labelRu} #${entityId}: ${count} событий за ${rule.windowMinutes} мин (порог ${rule.threshold})`;
  const metaKey = `${entity}Id`;
  await db.insert(fraudAlertsTable).values({
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    status: "open",
    description,
    meta: { ruleType: rule.ruleType, count, [metaKey]: entityId, windowMinutes: rule.windowMinutes, threshold: rule.threshold },
  });
  if (rule.severity === "high" || rule.severity === "critical") {
    emitAlertAndForget({
      kind: "fraud",
      severity: rule.severity as "high" | "critical",
      message: description,
      entityType: entity,
      entityId,
      meta: { ruleId: rule.id, ruleType: rule.ruleType },
    });
  }
}

async function evalFailedLogins(rule: FraudRuleRow): Promise<void> {
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);
  // Группируем по user_id — для аутентифицированных попыток.
  const byUser = await db.execute<{ user_id: number; cnt: number }>(sql`
    SELECT user_id, COUNT(*)::int AS cnt
    FROM audit_log
    WHERE action = 'login'
      AND (after->>'success')::boolean IS NOT TRUE
      AND created_at >= ${since}
      AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) > ${rule.threshold}
    LIMIT 50
  `);
  for (const r of byUser.rows ?? []) {
    if (await existsOpenAlert(rule.id, "user", r.user_id)) continue;
    await createAlert(rule, "user", r.user_id, r.cnt);
  }
  // Группируем по IP — ловим брут до аутентификации (user_id IS NULL — пытались несуществующим email-ом).
  const byIp = await db.execute<{ ip: string; cnt: number }>(sql`
    SELECT ip, COUNT(*)::int AS cnt
    FROM audit_log
    WHERE action = 'login'
      AND (after->>'success')::boolean IS NOT TRUE
      AND created_at >= ${since}
      AND ip IS NOT NULL
    GROUP BY ip
    HAVING COUNT(*) > ${rule.threshold}
    LIMIT 50
  `);
  for (const r of byIp.rows ?? []) {
    if (!r.ip) continue;
    // entityId для IP не подходит (число) — используем хэш-сумму первых октетов или 0+meta.
    // Чтобы не ломать схему: пишем entity_type='ip', entity_id=0 и кладём ip в meta через description.
    if (await existsOpenAlertIp(rule.id, r.ip)) continue;
    await createAlertIp(rule, r.ip, r.cnt);
  }
}

async function evalPayoutVelocity(rule: FraudRuleRow): Promise<void> {
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);
  // По артистам — entity='artist', хранится в meta (НЕ в user_id, у которого FK→users)
  const artistRows = await db
    .select({ artistId: payoutsTable.artistId, cnt: sql<number>`count(*)::int` })
    .from(payoutsTable)
    .where(and(gte(payoutsTable.createdAt, since), sql`${payoutsTable.artistId} IS NOT NULL`))
    .groupBy(payoutsTable.artistId)
    .having(sql`count(*) > ${rule.threshold}`);
  for (const r of artistRows) {
    if (r.artistId == null) continue;
    if (await existsOpenAlertEntity(rule.id, "artistId", r.artistId)) continue;
    await createAlertEntity(rule, "artist", r.artistId, r.cnt);
  }
  // По лейблам — отдельная агрегация: лейбл может выводить деньги в обход artist_id (через L1/L2)
  const labelRows = await db
    .select({ labelId: payoutsTable.labelId, cnt: sql<number>`count(*)::int` })
    .from(payoutsTable)
    .where(and(gte(payoutsTable.createdAt, since), sql`${payoutsTable.labelId} IS NOT NULL`))
    .groupBy(payoutsTable.labelId)
    .having(sql`count(*) > ${rule.threshold}`);
  for (const r of labelRows) {
    if (r.labelId == null) continue;
    if (await existsOpenAlertEntity(rule.id, "labelId", r.labelId)) continue;
    await createAlertEntity(rule, "label", r.labelId, r.cnt);
  }
}

async function evalAcrCloudMatch(rule: FraudRuleRow): Promise<void> {
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);
  const rows = await db
    .select({ releaseId: acrChecksTable.releaseId, cnt: sql<number>`count(*)::int` })
    .from(acrChecksTable)
    .where(and(gte(acrChecksTable.scannedAt, since), eq(acrChecksTable.status, "matched")))
    .groupBy(acrChecksTable.releaseId)
    .having(sql`count(*) >= ${rule.threshold}`);
  for (const r of rows) {
    if (r.releaseId == null) continue;
    if (await existsOpenAlert(rule.id, "release", r.releaseId)) continue;
    await createAlert(rule, "release", r.releaseId, r.cnt);
  }
}

async function evalSpikeStreams(rule: FraudRuleRow): Promise<void> {
  // Используем ugc_metrics как proxy: суммарные views по треку в окне > threshold.
  // Источник реальных stream_metrics ещё не подключён — спайк по UGC ловит вирусные ситуации.
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);
  const rows = await db
    .select({ trackId: ugcMetricsTable.trackId, total: sql<number>`coalesce(sum(${ugcMetricsTable.views}), 0)::bigint` })
    .from(ugcMetricsTable)
    .where(and(gte(ugcMetricsTable.recordedAt, since), sql`${ugcMetricsTable.trackId} IS NOT NULL`))
    .groupBy(ugcMetricsTable.trackId)
    .having(sql`coalesce(sum(${ugcMetricsTable.views}), 0) > ${rule.threshold}`);
  for (const r of rows) {
    if (r.trackId == null) continue;
    if (await existsOpenAlert(rule.id, "track", r.trackId)) continue;
    await createAlert(rule, "track", r.trackId, Number(r.total));
  }
}

async function evalTakedownBurst(rule: FraudRuleRow): Promise<void> {
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);
  const rows = await db
    .select({ labelId: releasesTable.labelId, cnt: sql<number>`count(*)::int` })
    .from(releasesTable)
    .where(and(gte(releasesTable.updatedAt, since), eq(releasesTable.status, "takedown_requested")))
    .groupBy(releasesTable.labelId)
    .having(sql`count(*) >= ${rule.threshold}`);
  for (const r of rows) {
    if (r.labelId == null) continue;
    if (await existsOpenAlertEntity(rule.id, "labelId", r.labelId)) continue;
    await createAlertEntity(rule, "label", r.labelId, r.cnt);
  }
}

async function tick(): Promise<void> {
  if (running) return; // защита от перекрывающихся тиков
  running = true;
  try {
    const rules = await db.select().from(fraudRulesTable).where(eq(fraudRulesTable.enabled, true));
    if (rules.length === 0) return;
    for (const r of rules) {
      try {
        switch (r.ruleType) {
          case "multiple_logins": await evalMultipleLogins(r); break;
          case "failed_logins":   await evalFailedLogins(r);   break;
          case "payout_velocity": await evalPayoutVelocity(r); break;
          case "acrcloud_match":  await evalAcrCloudMatch(r);  break;
          case "spike_streams":   await evalSpikeStreams(r);   break;
          case "takedown_burst":  await evalTakedownBurst(r);  break;
          default:
            logger.warn({ ruleId: r.id, ruleType: r.ruleType }, "[fraud-engine] unknown rule_type");
        }
      } catch (err) {
        logger.warn({ err, ruleId: r.id }, "[fraud-engine] rule eval failed");
      }
    }
  } catch (err) {
    logger.warn({ err }, "[fraud-engine] tick failed");
  } finally {
    running = false;
  }
}

export function startFraudEngine(): void {
  if (timer) return;
  // Запускаем первый тик с задержкой, чтобы не блокировать стартап.
  setTimeout(() => { void tick(); }, 30_000);
  timer = setInterval(() => { void tick(); }, FRAUD_INTERVAL_MS);
  logger.info({ intervalMs: FRAUD_INTERVAL_MS }, "[fraud-engine] started");
}

export function stopFraudEngine(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

// Тест-хук для ручного триггера
export async function fraudEngineTickNow(): Promise<void> {
  await tick();
}
