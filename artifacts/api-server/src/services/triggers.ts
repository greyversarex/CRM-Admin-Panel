/**
 * Automation Triggers — runtime engine.
 *
 * fireTrigger(event, context) выполняется fire-and-forget из бизнес-роутов
 * (signup approve, release status change, payout approve и т.д.).
 *
 * Внутри:
 *  1. находит все enabled-триггеры с event = X
 *  2. для каждого: рендерит шаблон с context-переменными,
 *     резолвит получателей по recipient mode, создаёт notification
 *     в колокольчик + кладёт письмо в SMTP-очередь
 *  3. инкрементирует fireCount, обновляет lastFiredAt
 *
 * Никогда не блокирует основной запрос — все ошибки логируются.
 */

import { db, automationTriggersTable, emailTemplatesTable, usersTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { createNotification } from "./notifications";
import { sendMailAndForget } from "../lib/mail";

export type TriggerContext = {
  // Прямой получатель (artist user / label user / requester)
  requesterUserId?: number | null;
  // Связанные сущности — используются при resolve recipients и в переменных шаблона
  artistId?: number | null;
  labelId?: number | null;
  // Переменные для подстановки в шаблон
  vars: Record<string, string>;
  // Ссылка для click-through в нотификации
  link?: string;
  // Тип/ID связанной сущности (для notification.entity_*)
  entityType?: "release" | "payout" | "track" | "general";
  entityId?: number;
};

function interpolate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v ?? "");
  }
  return out;
}

async function resolveRecipients(
  recipient: string,
  ctx: TriggerContext,
): Promise<{ id: number; email: string; name: string }[]> {
  if (recipient === "requester" && ctx.requesterUserId) {
    const rows = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, ctx.requesterUserId));
    return rows;
  }
  if (recipient === "admins") {
    return db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable).where(inArray(usersTable.role, ["admin"]));
  }
  if (recipient === "managers") {
    return db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable).where(inArray(usersTable.role, ["admin", "manager"]));
  }
  if (recipient === "all") {
    return db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.status, "active"));
  }
  // assignee → пока используем requester (нет явного поля assignee у релизов/выплат)
  if (recipient === "assignee" && ctx.requesterUserId) {
    const rows = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, ctx.requesterUserId));
    return rows;
  }
  return [];
}

export async function fireTrigger(event: string, ctx: TriggerContext): Promise<void> {
  try {
    const triggers = await db.select()
      .from(automationTriggersTable)
      .where(and(eq(automationTriggersTable.event, event), eq(automationTriggersTable.enabled, true)));

    if (triggers.length === 0) return;

    for (const trg of triggers) {
      // Подгружаем шаблон (если задан)
      let subject = trg.name;
      let bodyText = "";
      let bodyHtml = "";
      if (trg.templateId) {
        const [tpl] = await db.select().from(emailTemplatesTable)
          .where(eq(emailTemplatesTable.id, trg.templateId));
        if (tpl && tpl.isActive) {
          subject = interpolate(tpl.subject || trg.name, ctx.vars);
          bodyText = interpolate(tpl.bodyText, ctx.vars);
          bodyHtml = interpolate(tpl.bodyHtml, ctx.vars);
        }
      }

      const recipients = await resolveRecipients(trg.recipient, ctx);
      if (recipients.length === 0) {
        logger.warn({ triggerId: trg.id, event, recipient: trg.recipient }, "[trigger] no recipients resolved");
        continue;
      }

      // In-app notifications
      for (const r of recipients) {
        void createNotification({
          userId: r.id,
          type: `automation.${event}`,
          title: subject,
          body: bodyText.slice(0, 500),
          entityType: ctx.entityType,
          entityId: ctx.entityId,
          link: ctx.link,
        }).catch((err) => logger.warn({ err, triggerId: trg.id }, "[trigger] notification create failed"));
      }

      // Email channel (fire-and-forget; mail.ts сам решает, есть ли SMTP)
      for (const r of recipients) {
        sendMailAndForget({
          to: r.email,
          subject,
          text: bodyText || subject,
          html: bodyHtml || undefined,
        });
      }

      // Метрики срабатывания
      await db.update(automationTriggersTable)
        .set({
          fireCount: sql`${automationTriggersTable.fireCount} + 1`,
          lastFiredAt: new Date(),
        })
        .where(eq(automationTriggersTable.id, trg.id));

      logger.info({
        triggerId: trg.id, event, recipientCount: recipients.length, templateId: trg.templateId,
      }, "[trigger] fired");
    }
  } catch (err) {
    logger.warn({ err, event }, "[trigger] fireTrigger failed (non-blocking)");
  }
}

export function fireTriggerAndForget(event: string, ctx: TriggerContext): void {
  void fireTrigger(event, ctx).catch((err) => {
    logger.warn({ err, event }, "[trigger] background fire rejected");
  });
}
