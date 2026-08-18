/**
 * Опрос статуса модерации релизов в Broma16 (ROD).
 *
 * Релизы, отправленные на модерацию, помечаются broma16ModerationStatus =
 * "pending". Эта служба раз в час (см. scheduler.ts) опрашивает Broma16 по
 * каждому такому релизу и, если вердикт получен (approved/rejected), фиксирует
 * его у нас: обновляет статус, пишет в audit_log, уведомляет владельца релиза
 * (артиста/лейбл) и запускает триггеры автоматизации (email через очередь).
 *
 * Статусы Broma16 закреплены справочником (см. moderation-status.ts) — он и
 * решает вердикт. Разбор по ключевым словам остался запасным вариантом на
 * случай кода, которого в справочнике ещё нет: он консервативен, и любой
 * неопознанный ответ оставляет релиз в pending, исключая ложные «одобрения».
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { db, releasesTable, tracksTable, auditLogTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { createBroma16Client, type Broma16Client } from "./client";
import { fetchAssets } from "./catalog-import";
import { isShipped, lookupBroma16Status } from "./moderation-status";
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

  // Известный код справочника решает всё: он точен, а разбор по подстрокам —
  // лишь догадка. Отказ среди кодов важнее одобрения (релиз мог быть отгружен,
  // а затем снят), поэтому сначала ищем отказ по всему списку.
  const known = candidates
    .map((c) => ({ raw: c, info: lookupBroma16Status(c) }))
    .filter((x): x is { raw: string; info: NonNullable<ReturnType<typeof lookupBroma16Status>> } => x.info !== null);
  const rejected = known.find((x) => x.info.verdict === "rejected");
  if (rejected) return { verdict: "rejected", raw: rejected.raw };
  const approved = known.find((x) => x.info.verdict === "approved");
  if (approved) return { verdict: "approved", raw: approved.raw };
  if (known.length > 0) return { verdict: "pending", raw: known[0].raw };

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

/** Достаёт первое строковое значение из объекта по списку вероятных ключей. */
function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Считывает коды, присвоенные Broma16 (ISRC у записей, UPC/каталожный № у релиза),
 * и сохраняет их у нас, НЕ перетирая уже заполненные значения. Broma16 присваивает
 * коды при отправке (generate_isrc/generate_upc/generate_catalog_number), поэтому
 * читаем при каждом успешном опросе — как только код появился, он попадёт в нашу БД.
 * Ошибки парсинга/записи не должны ломать основной цикл модерации — логируем и идём дальше.
 */
async function readBackAssignedCodes(releaseId: number, data: unknown): Promise<void> {
  try {
    if (!data || typeof data !== "object") return;
    const rel = data as Record<string, unknown>;
    // Иногда payload может быть завёрнут в { release: {...} } / { data: {...} }.
    const relObj =
      (rel.release && typeof rel.release === "object" ? (rel.release as Record<string, unknown>) : null) ??
      (rel.data && typeof rel.data === "object" ? (rel.data as Record<string, unknown>) : null) ??
      rel;

    // ── Коды уровня релиза: UPC и каталожный номер ──
    const upc = pickString(relObj, ["upc", "ean", "barcode"]);
    const catalog = pickString(relObj, ["catalog_number", "catalogNumber"]);
    const relPatch: Record<string, string> = {};
    if (upc) relPatch.upc = upc;
    if (catalog) relPatch.catalogNumber = catalog;
    if (Object.keys(relPatch).length > 0) {
      // Обновляем только пустые поля, чтобы не перетереть введённые вручную коды.
      const [cur] = await db
        .select({ upc: releasesTable.upc, catalogNumber: releasesTable.catalogNumber })
        .from(releasesTable)
        .where(eq(releasesTable.id, releaseId))
        .limit(1);
      const finalPatch: Record<string, string> = {};
      if (relPatch.upc && !cur?.upc?.trim()) finalPatch.upc = relPatch.upc;
      if (relPatch.catalogNumber && !cur?.catalogNumber?.trim()) finalPatch.catalogNumber = relPatch.catalogNumber;
      if (Object.keys(finalPatch).length > 0) {
        await db.update(releasesTable).set(finalPatch).where(eq(releasesTable.id, releaseId));
        logger.info({ releaseId, ...finalPatch }, "[broma16] read-back: сохранены коды релиза");
      }
    }

    // ── ISRC уровня записи: сопоставляем по broma16RecordingId ──
    const recs = relObj.recordings;
    if (Array.isArray(recs) && recs.length > 0) {
      // Карта broma16RecordingId → isrc из ответа Broma16.
      const isrcByRecId = new Map<number, string>();
      for (const r of recs) {
        if (!r || typeof r !== "object") continue;
        const ro = r as Record<string, unknown>;
        const recId = typeof ro.id === "number" ? ro.id : Number(ro.id);
        const isrc = pickString(ro, ["isrc"]);
        if (Number.isFinite(recId) && isrc) isrcByRecId.set(recId, isrc);
      }
      if (isrcByRecId.size > 0) {
        const ourTracks = await db
          .select({ id: tracksTable.id, isrc: tracksTable.isrc, recId: tracksTable.broma16RecordingId })
          .from(tracksTable)
          .where(eq(tracksTable.releaseId, releaseId));
        for (const t of ourTracks) {
          if (t.recId == null) continue;
          if (t.isrc && t.isrc.trim()) continue; // не перетираем существующий ISRC
          const assigned = isrcByRecId.get(t.recId);
          if (assigned) {
            await db.update(tracksTable).set({ isrc: assigned }).where(eq(tracksTable.id, t.id));
            logger.info({ releaseId, trackId: t.id, isrc: assigned }, "[broma16] read-back: сохранён ISRC трека");
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err, releaseId }, "[broma16] read-back кодов не удался (не критично)");
  }
}

/**
 * Снимок каталога Broma16: релизы по их id и все фонограммы аккаунта.
 *
 * Читаем именно списком, потому что поштучный `GET /repertoire/release/{id}`
 * Broma16 не поддерживает — отвечает 405, и почасовая проверка модерации из-за
 * этого падала на каждом релизе, ничего не обновляя.
 */
export type ModerationSource = {
  releases: Map<number, Record<string, unknown>>;
  recordings: { id: number; isrc?: string }[];
};

/**
 * Карточка одного релиза — вместо перебора всего каталога.
 *
 * Broma16 отдаёт по нему больше, чем список: копирайты, обложку, признаки
 * незавершённого обновления. Раньше такого метода мы не знали и на каждую
 * проверку тянули весь каталог постранично.
 *
 * `null` — релиза среди импортированных нет (скорее всего застрял черновиком).
 */
export async function fetchReleaseCard(
  client: Broma16Client,
  bromaReleaseId: number,
): Promise<Record<string, unknown> | null> {
  const accountId = await client.getAccountId();
  try {
    const res = await client.request<{ data?: Record<string, unknown> }>(
      "GET",
      `/accounts/${accountId}/assets/releases/${bromaReleaseId}`,
    );
    return res?.data ?? null;
  } catch (e) {
    logger.warn({ bromaReleaseId, err: String(e) }, "[broma16] карточка релиза недоступна");
    return null;
  }
}

/**
 * Заглядывает в незавершённый черновик: на каком шаге он остался.
 *
 * До сих пор мы могли сказать только «релиза нет в каталоге», и почему —
 * приходилось выяснять в кабинете руками. Этот метод показан разработчиком
 * Broma16 как штатный способ смотреть ещё не импортированный материал.
 */
export async function fetchDraftData(
  client: Broma16Client,
  bromaReleaseId: number,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await client.request<{ data?: Record<string, unknown> }>(
      "GET",
      `/repertoire/release/${bromaReleaseId}/data`,
    );
    return res?.data ?? null;
  } catch (e) {
    logger.warn({ bromaReleaseId, err: String(e) }, "[broma16] черновик недоступен");
    return null;
  }
}

export async function fetchModerationSource(client: Broma16Client): Promise<ModerationSource> {
  const accountId = await client.getAccountId();
  const [releases, recordings] = await Promise.all([
    fetchAssets<Record<string, unknown>>(client, accountId, "releases"),
    fetchAssets<{ id: number; isrc?: string }>(client, accountId, "recordings"),
  ]);
  return {
    releases: new Map(releases.map((r) => [Number(r.id), r])),
    recordings,
  };
}

/**
 * Приводит запись из списка активов к форме, которую понимают
 * deriveModerationVerdict и readBackAssignedCodes: у списка свои имена полей
 * (ean, catalogue_number), а фонограммы лежат отдельным разделом.
 */
function toReleasePayload(rel: Record<string, unknown>, source: ModerationSource): Record<string, unknown> {
  return {
    ...rel,
    upc: rel.ean,
    catalog_number: rel.catalogue_number,
    // Передаём все фонограммы аккаунта: read-back сам выбирает нужные по
    // broma16RecordingId наших треков, лишние он просто не найдёт.
    recordings: source.recordings,
  };
}

/**
 * Проверяет модерацию одного релиза. Возвращает результат проверки.
 * Бросает при сетевых/конфигурационных ошибках Broma16 (для ручного эндпоинта).
 *
 * `source` — заранее загруженный снимок каталога: при обходе десятков релизов
 * незачем тянуть список для каждого.
 */
export async function checkReleaseModeration(
  releaseId: number,
  opts: { userId?: number | null; source?: ModerationSource } = {},
): Promise<{
  checked: boolean;
  changed: boolean;
  verdict: ModerationVerdict;
  raw: string | null;
  reason?: string;
  /** Сырые данные незавершённого черновика — чтобы показать, где он застрял. */
  draft?: Record<string, unknown>;
  /** Доехал ли релиз до площадок. Одобрение и отгрузка — разные события. */
  shipped?: boolean;
}> {
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
  const source = opts.source ?? (await fetchModerationSource(client));
  const bromaRelease = source.releases.get(rel.broma16ReleaseId);

  // Релиза нет в каталоге — значит отправка не дошла до конца и в Broma16 он
  // остался черновиком. Это не ошибка связи, а незавершённая доставка, и
  // оператору надо сказать именно так.
  if (!bromaRelease) {
    // Заглядываем в черновик: раньше здесь путь заканчивался словами «остался
    // черновиком», и выяснять причину приходилось руками в кабинете Broma16.
    const draft = await fetchDraftData(client, rel.broma16ReleaseId);
    const draftStatus = draft ? pickString(draft, ["moderation_status", "status"]) : null;
    logger.info(
      { releaseId: rel.id, broma16ReleaseId: rel.broma16ReleaseId, draftStatus, draftFound: !!draft },
      "[broma16] модерация: релиза нет среди импортированных — смотрим черновик",
    );
    return {
      checked: false,
      changed: false,
      verdict: "pending",
      raw: draftStatus,
      reason: "draft",
      draft: draft ?? undefined,
    };
  }

  const data = toReleasePayload(bromaRelease, source);

  // Считываем коды, присвоенные Broma16 (ISRC/UPC/каталожный №), при каждом успешном
  // опросе — независимо от вердикта модерации. Не критично для основного цикла.
  await readBackAssignedCodes(rel.id, data);

  const { verdict, raw } = deriveModerationVerdict(data);
  // Отгрузка живёт в отдельном массиве statuses: релиз может быть одобрен и
  // при этом ещё не доехать до магазинов, и оператору важно видеть разницу.
  const shipped = isShipped(bromaRelease.statuses);

  if (verdict === "pending") {
    logger.info({ releaseId: rel.id, broma16ReleaseId: rel.broma16ReleaseId, raw, shipped }, "[broma16] модерация: ещё в обработке");
    return { checked: true, changed: false, verdict, raw, shipped };
  }

  if (rel.broma16ModerationStatus === verdict) {
    return { checked: true, changed: false, verdict, raw, shipped };
  }

  await applyVerdict(rel, verdict, raw, opts.userId ?? null);
  return { checked: true, changed: true, verdict, raw, shipped };
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

  if (pending.length === 0) return { total: 0, changed: 0, errors: 0 };

  // Каталог тянем один раз на весь обход, а не на каждый релиз.
  let source: ModerationSource;
  try {
    source = await fetchModerationSource(await createBroma16Client());
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[broma16] модерация: не удалось получить каталог");
    return { total: pending.length, changed: 0, errors: pending.length };
  }

  let changed = 0;
  let errors = 0;
  for (const { id } of pending) {
    try {
      const r = await checkReleaseModeration(id, { source });
      if (r.changed) changed += 1;
    } catch (e) {
      errors += 1;
      logger.warn({ err: (e as Error).message, releaseId: id }, "[broma16] модерация: ошибка проверки релиза");
    }
  }
  return { total: pending.length, changed, errors };
}
