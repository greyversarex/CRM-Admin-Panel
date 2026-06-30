/**
 * Опрос статуса модерации релизов в Broma16 (ROD).
 *
 * Релизы, отправленные на модерацию, помечаются broma16ModerationStatus =
 * "pending". Эта служба раз в час (см. scheduler.ts) опрашивает Broma16 по
 * каждому такому релизу и, если вердикт получен (approved/rejected), фиксирует
 * его у нас: обновляет статус, пишет в audit_log, уведомляет владельца релиза
 * (артиста/лейбл) и запускает триггеры автоматизации (email через очередь).
 *
 * Поле статуса модерации в ответе Broma16 документально не закреплено, поэтому
 * вердикт извлекается консервативно: только при явных ключевых словах
 * «approve/reject» (и их синонимах). Любой неопознанный ответ оставляет релиз в
 * статусе pending и логируется — это исключает ложные «одобрения».
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { db, releasesTable, auditLogTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { createBroma16Client } from "./client";
import { fireTriggerAndForget } from "../triggers";
import { notifyByArtistId, notifyByLabelId } from "../notifications";

export type ModerationVerdict = "approved" | "rejected" | "pending";

/** Достаёт строковые значения из вероятных полей модерации (рекурсивно, неглубоко),
 *  плюс верхнеуровневый `status` объекта релиза. */
function collectStatusStrings(release: unknown): string[] {
  const out: string[] = [];
  const visit = (o: unknown, depth: number): void => {
    if (depth > 3 || !o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string") {
        if (/moder|verdict/i.test(k)) out.push(v);
      } else if (v && typeof v === "object") {
        visit(v, depth + 1);
      }
    }
  };
  visit(release, 0);
  if (release && typeof release === "object") {
    const top = (release as { status?: unknown }).status;
    if (typeof top === "string") out.push(top);
  }
  return out;
}

// Отрицательные/отказные вердикты (в т.ч. отрицания одобрения вроде
// "unapproved" / "not approved"). Проверяются ПЕРВЫМИ и имеют приоритет, чтобы
// исключить ложное «одобрение».
const REJECT_RE =
  /(reject|declin|deny|denied|refus|failed?|not[_ \-]?(approv|accept)|un[_ \-]?(approv|accept)|dis[_ \-]?(approv|accept)|отклон|отказ|не\s*(одобр|принят))/;
// Положительные вердикты. Токен одобрения должен стоять в начале строки или
// после не-буквы — иначе "unapproved"/"unpublished" не считаются одобрением.
const APPROVE_RE =
  /(^|[^a-zа-я])(approv|accept|moderated|published?|on[_ \-]?platform|одобр|принят)/;

/** Консервативно маппит ответ Broma16 в наш вердикт. Любое неоднозначное или
 *  неопознанное значение остаётся "pending" — ложное «одобрение» исключено. */
export function deriveModerationVerdict(release: unknown): { verdict: ModerationVerdict; raw: string | null } {
  const candidates = collectStatusStrings(release);
  let approveRaw: string | null = null;
  for (const c of candidates) {
    const s = c.toLowerCase();
    // Отказ (и отрицание одобрения) имеет глобальный приоритет.
    if (REJECT_RE.test(s)) return { verdict: "rejected", raw: c };
    if (approveRaw === null && APPROVE_RE.test(s)) approveRaw = c;
  }
  if (approveRaw !== null) return { verdict: "approved", raw: approveRaw };
  return { verdict: "pending", raw: candidates[0] ?? null };
}

type PendingRelease = {
  id: number;
  title: string;
  status: string;
  artistId: number;
  labelId: number | null;
  broma16ReleaseId: number | null;
  broma16ModerationStatus: string | null;
};

async function applyVerdict(rel: PendingRelease, verdict: "approved" | "rejected", raw: string | null, userId: number | null): Promise<void> {
  // Обновляем основной статус релиза консервативно: только из ожидаемого
  // предмодерационного состояния, чтобы не перетереть ручные переходы.
  const nextStatus =
    verdict === "approved"
      ? (rel.status === "approved" ? "live" : rel.status)
      : (rel.status === "approved" || rel.status === "live" ? "rejected" : rel.status);

  await db
    .update(releasesTable)
    .set({ broma16ModerationStatus: verdict, status: nextStatus })
    .where(eq(releasesTable.id, rel.id));

  try {
    await db.insert(auditLogTable).values({
      userId: userId ?? null,
      action: "update",
      entityType: "broma16_moderation",
      entityId: rel.id,
      diff: {
        moderationStatus: { from: rel.broma16ModerationStatus, to: verdict },
        releaseStatus: { from: rel.status, to: nextStatus },
        raw,
      },
    });
  } catch (err) {
    logger.warn({ err, releaseId: rel.id }, "[broma16] не удалось записать audit модерации");
  }

  // Уведомление в колокольчик владельцу релиза (артист + лейбл).
  const title =
    verdict === "approved"
      ? `✅ Релиз «${rel.title}» одобрен модерацией Broma16`
      : `❌ Релиз «${rel.title}» отклонён модерацией Broma16`;
  const body = raw ? `Статус Broma16: ${raw}` : "";
  const notif = {
    type: `broma16_moderation_${verdict}`,
    title,
    body,
    entityType: "release" as const,
    entityId: rel.id,
    link: `/releases/${rel.id}`,
  };
  void notifyByArtistId(rel.artistId, notif).catch((err) =>
    logger.warn({ err, releaseId: rel.id }, "[broma16] notify artist failed"),
  );
  if (rel.labelId) {
    void notifyByLabelId(rel.labelId, notif).catch((err) =>
      logger.warn({ err, releaseId: rel.id }, "[broma16] notify label failed"),
    );
  }

  // Триггеры автоматизации (email через очередь, если настроен триггер).
  fireTriggerAndForget(`broma16_moderation_${verdict}`, {
    artistId: rel.artistId,
    labelId: rel.labelId ?? null,
    vars: {
      release_title: rel.title,
      release_id: String(rel.id),
      status: verdict,
      platform_name: "Tajik Music Distribution",
    },
    link: `/releases/${rel.id}`,
    entityType: "release",
    entityId: rel.id,
  });

  logger.info({ releaseId: rel.id, verdict, raw, nextStatus }, "[broma16] модерация: получен вердикт");
}

/**
 * Проверяет модерацию одного релиза. Возвращает результат проверки.
 * Бросает при сетевых/конфигурационных ошибках Broma16 (для ручного эндпоинта).
 */
export async function checkReleaseModeration(
  releaseId: number,
  opts: { userId?: number | null } = {},
): Promise<{ checked: boolean; changed: boolean; verdict: ModerationVerdict; raw: string | null; reason?: string }> {
  const [rel] = await db
    .select({
      id: releasesTable.id,
      title: releasesTable.title,
      status: releasesTable.status,
      artistId: releasesTable.artistId,
      labelId: releasesTable.labelId,
      broma16ReleaseId: releasesTable.broma16ReleaseId,
      broma16ModerationStatus: releasesTable.broma16ModerationStatus,
    })
    .from(releasesTable)
    .where(eq(releasesTable.id, releaseId))
    .limit(1);

  if (!rel) return { checked: false, changed: false, verdict: "pending", raw: null, reason: "not_found" };
  if (!rel.broma16ReleaseId) {
    return { checked: false, changed: false, verdict: "pending", raw: null, reason: "not_pushed" };
  }

  const client = await createBroma16Client();
  const data = await client.request<unknown>("GET", `/repertoire/release/${rel.broma16ReleaseId}`);
  const { verdict, raw } = deriveModerationVerdict(data);

  if (verdict === "pending") {
    logger.info({ releaseId: rel.id, broma16ReleaseId: rel.broma16ReleaseId, raw }, "[broma16] модерация: ещё в обработке");
    return { checked: true, changed: false, verdict, raw };
  }

  if (rel.broma16ModerationStatus === verdict) {
    return { checked: true, changed: false, verdict, raw };
  }

  await applyVerdict(rel, verdict, raw, opts.userId ?? null);
  return { checked: true, changed: true, verdict, raw };
}

/**
 * Опрашивает модерацию по всем релизам в статусе pending.
 * Устойчива к ошибкам отдельных релизов — продолжает остальные.
 */
export async function pollPendingModeration(): Promise<{ total: number; changed: number; errors: number }> {
  const pending = await db
    .select({ id: releasesTable.id })
    .from(releasesTable)
    .where(and(eq(releasesTable.broma16ModerationStatus, "pending"), isNotNull(releasesTable.broma16ReleaseId)));

  let changed = 0;
  let errors = 0;
  for (const { id } of pending) {
    try {
      const r = await checkReleaseModeration(id);
      if (r.changed) changed += 1;
    } catch (e) {
      errors += 1;
      logger.warn({ err: (e as Error).message, releaseId: id }, "[broma16] модерация: ошибка проверки релиза");
    }
  }
  return { total: pending.length, changed, errors };
}
