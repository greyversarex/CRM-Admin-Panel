// ─── Проверка ограничений аккаунта ────────────────────────────────────────
// Ограничения хранятся строками в account_restrictions: есть действующая
// строка — функция закрыта, нет — открыта. Здесь только чтение; заводит и
// снимает их routes/accounts.ts.
//
// Ограничения нужны не для украшения интерфейса: requireFeature вешается на
// реальные маршруты (загрузка релиза, перенос каталога, заявка на выплату),
// иначе переключатель в панели ничего не значит.
import type { RequestHandler } from "express";
import { db, accountRestrictionsTable, usersTable, type RestrictionFeature } from "@workspace/db";
import { and, eq, isNull, or, gt, inArray } from "drizzle-orm";
import { getSessionUser } from "./auth";

/** Действующие ограничения пользователя. Просроченные по expires_at не считаются. */
export async function activeRestrictions(userId: number): Promise<RestrictionFeature[]> {
  const rows = await db.select({ feature: accountRestrictionsTable.feature })
    .from(accountRestrictionsTable)
    .where(and(
      eq(accountRestrictionsTable.userId, userId),
      isNull(accountRestrictionsTable.liftedAt),
      or(isNull(accountRestrictionsTable.expiresAt), gt(accountRestrictionsTable.expiresAt, new Date()))!,
    ));
  return rows.map((r) => r.feature as RestrictionFeature);
}

/**
 * Закрыта ли функция. Полная блокировка аккаунта закрывает всё разом —
 * иначе пришлось бы при каждой блокировке заводить два десятка строк.
 */
export async function isRestricted(userId: number, feature: RestrictionFeature): Promise<boolean> {
  const rows = await db.select({ feature: accountRestrictionsTable.feature })
    .from(accountRestrictionsTable)
    .where(and(
      eq(accountRestrictionsTable.userId, userId),
      inArray(accountRestrictionsTable.feature, [feature, "account:full_suspension"]),
      isNull(accountRestrictionsTable.liftedAt),
      or(isNull(accountRestrictionsTable.expiresAt), gt(accountRestrictionsTable.expiresAt, new Date()))!,
    ))
    .limit(1);
  return rows.length > 0;
}

const HUMAN_NAMES: Partial<Record<RestrictionFeature, string>> = {
  "dist:upload": "загрузка релизов",
  "dist:delivery": "отправка на площадки",
  "dist:takedown": "заявки на снятие",
  "dist:transfer": "перенос каталога",
  "dist:publishing": "паблишинг",
  "fin:payout_requests": "заявки на выплату",
  "app:catalog": "каталог",
  "app:analytics": "аналитика",
  "app:royalties": "роялти",
  "app:support": "поддержка",
  "fin:payouts": "выплаты",
  "account:full_suspension": "работа с аккаунтом",
};

/** id пользователей, которым принадлежит каталог — лейбла либо артиста. */
export async function ownerUserIds(labelId: number | null, artistId: number | null): Promise<number[]> {
  const rows = labelId
    ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.labelId, labelId))
    : artistId
      ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.artistId, artistId))
      : [];
  return rows.map((r) => r.id);
}

/**
 * Закрыта ли функция владельцу каталога — лейблу или артисту.
 *
 * Нужна там, где действие выполняет администратор, а ограничение стоит на
 * клиенте: выплата, отправка на площадки. Возвращает текст отказа или null.
 */
export async function ownerRestrictionMessage(
  owner: { labelId?: number | null; artistId?: number | null },
  feature: RestrictionFeature,
  what: string,
): Promise<string | null> {
  const owners = owner.labelId
    ? await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.labelId, owner.labelId))
    : owner.artistId
      ? await db.select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable).where(eq(usersTable.artistId, owner.artistId))
      : [];
  for (const u of owners) {
    if (await isRestricted(u.id, feature)) {
      return `${what} закрыто ограничением для «${u.name}». Снимите ограничение в карточке пользователя.`;
    }
  }
  return null;
}

/**
 * Пока аккаунт не активирован администратором, рабочие действия закрыты.
 *
 * Это девятый этап из ТЗ: доступ к кабинету появляется сразу после одобрения
 * заявки — иначе человеку негде пройти KYC, — а загрузка релизов и деньги
 * открываются только после проверки документов, прав и подписания договора.
 */
export const requireActiveAccount: RequestHandler = async (req, res, next) => {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Требуется вход" }); return; }
  if (user.role === "admin" || user.role === "manager") { next(); return; }

  const [row] = await db.select({ status: usersTable.status })
    .from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (row?.status === "review") {
    res.status(403).json({
      error: "Аккаунт ещё не активирован. Пройдите проверку документов, подтвердите права " +
             "на каталог и подпишите договор — после этого администратор откроет доступ.",
    });
    return;
  }
  next();
};

/**
 * Мидлвара для маршрутов, которые ограничение обязано закрывать.
 * Админов и менеджеров не трогает: ограничения — про клиентов.
 */
export function requireFeature(feature: RestrictionFeature): RequestHandler {
  return async (req, res, next) => {
    const user = getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Требуется вход" }); return; }
    if (user.role === "admin" || user.role === "manager") { next(); return; }
    if (await isRestricted(user.id, feature)) {
      res.status(403).json({
        error: `Доступ ограничен администратором: ${HUMAN_NAMES[feature] ?? feature}. ` +
               `Обратитесь в поддержку.`,
      });
      return;
    }
    next();
  };
}
