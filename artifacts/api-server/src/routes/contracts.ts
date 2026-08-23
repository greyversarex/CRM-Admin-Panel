// ─── Договоры на дистрибуцию ──────────────────────────────────────────────
// Путь договора: черновик → отправлен на подпись → подписан. Подписывает сам
// лейбл кодом из письма; подписанный договор дальше не редактируется.
//
// Почему код из письма, а не «настоящая» электронная подпись: у заказчика нет
// ни удостоверяющего центра, ни требования к квалифицированной подписи, а код
// на почту — то, чем пользуются дистрибьюторы такого размера. Мы фиксируем
// время, IP и имя подписавшего — этого достаточно, чтобы показать согласие.
import { Router } from "express";
import { z } from "zod";
import { db, contractsTable, usersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireRole, getSessionUser } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { sendMailAndForget } from "../lib/mail";
import { createNotification } from "../services/notifications";
import { logger } from "../lib/logger";

const router = Router();
const adminOnly = requireRole("admin", "manager");

function serialize(c: typeof contractsTable.$inferSelect) {
  // signOtp наружу не отдаём никогда — иначе подписать смог бы кто угодно,
  // кто открыл карточку договора в панели.
  const { signOtp: _omit, ...rest } = c;
  return {
    ...rest,
    signOtpExpiresAt: c.signOtpExpiresAt?.toISOString() ?? null,
    signedAt: c.signedAt?.toISOString() ?? null,
    terminatedAt: c.terminatedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    awaitingSignature: c.status === "sent",
  };
}

/** Просроченный договор показываем просроченным, даже если статус не переписали. */
function withExpiry(c: typeof contractsTable.$inferSelect) {
  if (c.status === "signed" && c.expiryDate && new Date(c.expiryDate) < new Date()) {
    return { ...c, status: "expired" };
  }
  return c;
}

// ─── Список ───────────────────────────────────────────────────────────────
// Без userId — все договоры (раздел «Договоры»); с userId — вкладка в карточке.
router.get("/contracts", adminOnly, async (req, res): Promise<void> => {
  const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : null;
  const status = req.query.status ? String(req.query.status) : null;

  const filters = [];
  if (userId && Number.isFinite(userId)) filters.push(eq(contractsTable.userId, userId));
  if (status) filters.push(eq(contractsTable.status, status));

  const rows = await db.select({
    contract: contractsTable,
    userName: usersTable.name,
    userEmail: usersTable.email,
  })
    .from(contractsTable)
    .leftJoin(usersTable, eq(contractsTable.userId, usersTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(contractsTable.createdAt))
    .limit(300);

  res.json({
    data: rows.map((r) => ({
      ...serialize(withExpiry(r.contract)),
      userName: r.userName,
      userEmail: r.userEmail,
    })),
  });
});

// ─── Свои договоры (для лейбла/артиста) ───────────────────────────────────
router.get("/contracts/mine", async (req, res): Promise<void> => {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Требуется вход" }); return; }
  const rows = await db.select().from(contractsTable)
    .where(eq(contractsTable.userId, user.id))
    .orderBy(desc(contractsTable.createdAt));
  res.json({ data: rows.map((c) => serialize(withExpiry(c))) });
});

const CreateBody = z.object({
  userId: z.number().int().positive(),
  title: z.string().min(3).max(200),
  kind: z.enum(["distribution", "publishing", "amendment"]).default("distribution"),
  body: z.string().max(200_000).optional().nullable(),
  objectPath: z.string().max(500).optional().nullable(),
  originalFilename: z.string().max(255).optional().nullable(),
  effectiveDate: z.string().max(10).optional().nullable(),
  expiryDate: z.string().max(10).optional().nullable(),
  contractNumber: z.string().max(60).optional().nullable(),
}).strict();

router.post("/contracts", adminOnly, async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, d.userId));
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  // Новая версия — это отдельный договор с тем же номером и версией +1.
  const [previous] = await db.select().from(contractsTable)
    .where(eq(contractsTable.userId, d.userId))
    .orderBy(desc(contractsTable.version)).limit(1);

  const number = d.contractNumber
    ?? previous?.contractNumber
    ?? `TM-${new Date().getFullYear()}-${String(d.userId).padStart(4, "0")}`;

  const [created] = await db.insert(contractsTable).values({
    userId: d.userId,
    contractNumber: number,
    kind: d.kind,
    version: (previous?.version ?? 0) + 1,
    title: d.title,
    body: d.body ?? null,
    objectPath: d.objectPath ?? null,
    originalFilename: d.originalFilename ?? null,
    effectiveDate: d.effectiveDate ?? null,
    expiryDate: d.expiryDate ?? null,
    createdBy: getSessionUser(req)!.id,
  }).returning();

  void auditMutation(req, {
    action: "create", entityType: "contract", entityId: created.id,
    before: null, after: created,
  });
  res.status(201).json({ ok: true, contract: serialize(created) });
});

const UpdateBody = CreateBody.partial().omit({ userId: true });

/** Убираем ключи со значением undefined: drizzle не должен получать «ничего». */
function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

router.patch("/contracts/:id", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = UpdateBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!before) { res.status(404).json({ error: "Договор не найден" }); return; }
  if (before.status === "signed") {
    res.status(409).json({ error: "Подписанный договор не редактируется — создайте новую версию" });
    return;
  }

  const [updated] = await db.update(contractsTable)
    .set({ ...definedOnly(parsed.data), contractNumber: parsed.data.contractNumber ?? undefined, updatedAt: new Date() })
    .where(eq(contractsTable.id, id)).returning();

  void auditMutation(req, {
    action: "update", entityType: "contract", entityId: id, before, after: updated,
  });
  res.json({ ok: true, contract: serialize(updated) });
});

// ─── Отправить на подпись ─────────────────────────────────────────────────
router.post("/contracts/:id/send", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }

  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!contract) { res.status(404).json({ error: "Договор не найден" }); return; }
  if (contract.status === "signed") { res.status(409).json({ error: "Договор уже подписан" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, contract.userId));
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  // Шестизначный код на 24 часа: подписывают не сразу, тянуть с этим нормально.
  const otp = String(Math.floor(100_000 + Math.random() * 900_000));
  const [updated] = await db.update(contractsTable)
    .set({
      status: "sent",
      signOtp: otp,
      signOtpExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      updatedAt: new Date(),
    })
    .where(eq(contractsTable.id, id)).returning();

  sendMailAndForget({
    to: user.email,
    subject: `Договор на дистрибуцию ${contract.contractNumber} — подпишите`,
    text:
      `Здравствуйте, ${user.name}!\n\n` +
      `Вам направлен договор «${contract.title}» (№ ${contract.contractNumber}, версия ${contract.version}).\n\n` +
      `Откройте раздел «Договоры» в личном кабинете, прочитайте документ и подтвердите ` +
      `подписание кодом:\n\n    ${otp}\n\n` +
      `Код действует 24 часа.\n\n` +
      `${process.env.PUBLIC_APP_URL ?? ""}/contracts`,
  });

  void createNotification({
    userId: user.id,
    type: "contract_sent",
    title: "Договор ждёт подписания",
    body: `${contract.title} (№ ${contract.contractNumber}). Код подтверждения отправлен на почту.`,
    entityType: "general",
    link: "/contracts",
  });

  void auditMutation(req, {
    action: "send", entityType: "contract", entityId: id, before: contract, after: updated,
  });
  logger.info({ contractId: id, userId: user.id }, "[contracts] отправлен на подпись");

  res.json({ ok: true, contract: serialize(updated) });
});

// ─── Подписать ────────────────────────────────────────────────────────────
const SignBody = z.object({
  otp: z.string().min(4).max(10),
  signedByName: z.string().min(2).max(200),
}).strict();

router.post("/contracts/:id/sign", async (req, res): Promise<void> => {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Требуется вход" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = SignBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!contract) { res.status(404).json({ error: "Договор не найден" }); return; }
  // Подписать может только тот, кому договор адресован.
  if (contract.userId !== user.id) { res.status(403).json({ error: "Это не ваш договор" }); return; }
  if (contract.status === "signed") { res.status(409).json({ error: "Договор уже подписан" }); return; }
  if (contract.status !== "sent") { res.status(409).json({ error: "Договор ещё не отправлен на подпись" }); return; }
  if (!contract.signOtp || contract.signOtp !== parsed.data.otp) {
    res.status(400).json({ error: "Неверный код подтверждения" });
    return;
  }
  if (contract.signOtpExpiresAt && contract.signOtpExpiresAt < new Date()) {
    res.status(400).json({ error: "Код истёк — попросите администратора отправить договор заново" });
    return;
  }

  const [updated] = await db.update(contractsTable)
    .set({
      status: "signed",
      signedAt: new Date(),
      signedByName: parsed.data.signedByName,
      signedIp: req.ip ?? null,
      // Код обесцениваем сразу: повторно им воспользоваться нельзя.
      signOtp: null,
      signOtpExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(contractsTable.id, id)).returning();

  void auditMutation(req, {
    action: "sign", entityType: "contract", entityId: id, before: contract, after: updated,
  });
  logger.info({ contractId: id, userId: user.id }, "[contracts] подписан");

  res.json({ ok: true, contract: serialize(updated) });
});

// ─── Расторгнуть ──────────────────────────────────────────────────────────
const TerminateBody = z.object({
  reason: z.string().min(3).max(500),
}).strict();

router.post("/contracts/:id/terminate", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = TerminateBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!before) { res.status(404).json({ error: "Договор не найден" }); return; }

  const [updated] = await db.update(contractsTable)
    .set({
      status: "terminated",
      terminatedAt: new Date(),
      terminationReason: parsed.data.reason,
      updatedAt: new Date(),
    })
    .where(eq(contractsTable.id, id)).returning();

  void auditMutation(req, {
    action: "terminate", entityType: "contract", entityId: id, before, after: updated,
  });
  res.json({ ok: true, contract: serialize(updated) });
});

export default router;
