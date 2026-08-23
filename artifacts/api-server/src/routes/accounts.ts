// ─── Карточка пользователя: доступ, нарушения, права ──────────────────────
// Реализует ТЗ заказчика «Users & Access» и «Access & Restrictions».
//
// Три сущности живут рядом, потому что ими пользуются вместе: админ открывает
// пользователя, видит нарушения, решает, что закрыть, и закрывает.
//
// Все изменения проходят через auditMutation — заказчик отдельно просил, чтобы
// у каждого ограничения остался след «кто, когда, почему».
import { Router } from "express";
import { z } from "zod";
import {
  db, usersTable, labelsTable, artistsTable, releasesTable, tracksTable,
  transactionsTable, payoutsTable, kycDocumentsTable,
  accountRestrictionsTable, accountViolationsTable, contractsTable,
  rightsVerificationsTable, RESTRICTION_FEATURES,
  VIOLATION_KINDS, VIOLATION_SEVERITIES,
} from "@workspace/db";
import { and, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { requireRole, getSessionUser } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { activeRestrictions } from "../lib/account-access";
import { createNotification } from "../services/notifications";

const router = Router();
const adminOnly = requireRole("admin", "manager");

/** Три подтверждённых нарушения — уровень риска high. Блокировок не делаем: их выбирает админ. */
function riskLevelFor(confirmedViolations: number): "low" | "medium" | "high" {
  if (confirmedViolations >= 3) return "high";
  if (confirmedViolations >= 1) return "medium";
  return "low";
}

async function loadUserOr404(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user ?? null;
}

// ─── Обзор пользователя ───────────────────────────────────────────────────
// Один запрос вместо десяти: карточка открывается сразу заполненной.
router.get("/users/:id/overview", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const user = await loadUserOr404(id);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  const [label] = user.labelId
    ? await db.select().from(labelsTable).where(eq(labelsTable.id, user.labelId))
    : [];

  // Каталог считаем по лейблу, если он есть, иначе по артисту — это и есть
  // область видимости пользователя в системе.
  const catalogFilter = user.labelId
    ? eq(releasesTable.labelId, user.labelId)
    : user.artistId ? eq(releasesTable.artistId, user.artistId) : sql`false`;

  const [releaseCount] = await db.select({ n: count() }).from(releasesTable).where(catalogFilter);
  const [trackCount] = await db.select({ n: count() })
    .from(tracksTable)
    .innerJoin(releasesTable, eq(tracksTable.releaseId, releasesTable.id))
    .where(catalogFilter);
  const [artistCount] = user.labelId
    ? await db.select({ n: count() }).from(artistsTable).where(eq(artistsTable.labelId, user.labelId))
    : [{ n: user.artistId ? 1 : 0 }];

  const moneyFilter = user.labelId
    ? eq(transactionsTable.labelId, user.labelId)
    : user.artistId ? eq(transactionsTable.artistId, user.artistId) : sql`false`;
  const [revenue] = await db
    .select({ total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)` })
    .from(transactionsTable).where(moneyFilter);

  const payoutFilter = user.labelId
    ? eq(payoutsTable.labelId, user.labelId)
    : user.artistId ? eq(payoutsTable.artistId, user.artistId) : sql`false`;
  const payoutRows = await db
    .select({ status: payoutsTable.status, total: sql<string>`coalesce(sum(${payoutsTable.amount}), 0)` })
    .from(payoutsTable).where(payoutFilter).groupBy(payoutsTable.status);

  const [kycDocs] = await db.select({ n: count() })
    .from(kycDocumentsTable).where(eq(kycDocumentsTable.userId, id));

  const [contract] = await db.select().from(contractsTable)
    .where(eq(contractsTable.userId, id))
    .orderBy(desc(contractsTable.createdAt)).limit(1);

  const [rights] = await db.select().from(rightsVerificationsTable)
    .where(eq(rightsVerificationsTable.userId, id));

  const [confirmed] = await db.select({ n: count() })
    .from(accountViolationsTable)
    .where(and(eq(accountViolationsTable.userId, id), eq(accountViolationsTable.status, "confirmed")));

  const restrictions = await activeRestrictions(id);

  res.json({
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      status: user.status, blockReason: user.blockReason, avatarUrl: user.avatarUrl,
      phone: user.phone, country: user.country, city: user.city,
      kycStatus: user.kycStatus, lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      labelId: user.labelId, artistId: user.artistId,
    },
    label: label ? { id: label.id, name: label.name, country: label.country, status: label.status } : null,
    catalog: {
      releases: releaseCount?.n ?? 0,
      tracks: trackCount?.n ?? 0,
      artists: artistCount?.n ?? 0,
    },
    finance: {
      revenue: Number(revenue?.total ?? 0),
      payouts: Object.fromEntries(payoutRows.map((r) => [r.status, Number(r.total)])),
    },
    kyc: { status: user.kycStatus, documents: kycDocs?.n ?? 0 },
    contract: contract ? {
      id: contract.id, number: contract.contractNumber, status: contract.status,
      version: contract.version, signedAt: contract.signedAt?.toISOString() ?? null,
      expiryDate: contract.expiryDate,
    } : null,
    rights: rights ? { status: rights.status, reviewedAt: rights.reviewedAt?.toISOString() ?? null } : null,
    violations: { confirmed: confirmed?.n ?? 0 },
    riskLevel: riskLevelFor(confirmed?.n ?? 0),
    restrictions,
  });
});

// ─── Ограничения ──────────────────────────────────────────────────────────
router.get("/users/:id/restrictions", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }

  const rows = await db.select().from(accountRestrictionsTable)
    .where(eq(accountRestrictionsTable.userId, id))
    .orderBy(desc(accountRestrictionsTable.appliedAt)).limit(200);

  // active — то, что действует прямо сейчас; history — вся лента, включая снятое.
  const now = new Date();
  const active = rows
    .filter((r) => !r.liftedAt && (!r.expiresAt || r.expiresAt > now))
    .map((r) => r.feature);

  res.json({
    features: RESTRICTION_FEATURES,
    active,
    history: rows.map((r) => ({
      ...r,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      appliedAt: r.appliedAt.toISOString(),
      liftedAt: r.liftedAt?.toISOString() ?? null,
    })),
  });
});

const ApplyRestrictionBody = z.object({
  feature: z.enum(RESTRICTION_FEATURES),
  reason: z.string().min(3).max(500),
  caseId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  // Срок в днях. Без него ограничение бессрочное — снимать руками.
  durationDays: z.number().int().positive().max(3650).optional().nullable(),
}).strict();

router.post("/users/:id/restrictions", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = ApplyRestrictionBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await loadUserOr404(id);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  const { feature, reason, caseId, note, durationDays } = parsed.data;
  const admin = getSessionUser(req)!;

  // Повторное закрытие уже закрытой функции — не ошибка, просто ничего не делаем.
  const [existing] = await db.select().from(accountRestrictionsTable)
    .where(and(
      eq(accountRestrictionsTable.userId, id),
      eq(accountRestrictionsTable.feature, feature),
      isNull(accountRestrictionsTable.liftedAt),
    )).limit(1);
  if (existing) { res.json({ ok: true, restriction: existing, alreadyActive: true }); return; }

  const [created] = await db.insert(accountRestrictionsTable).values({
    userId: id, feature, reason,
    caseId: caseId ?? null, note: note ?? null,
    expiresAt: durationDays ? new Date(Date.now() + durationDays * 86_400_000) : null,
    appliedBy: admin.id,
  }).returning();

  void auditMutation(req, {
    action: "restrict", entityType: "user", entityId: id,
    before: { feature, restricted: false }, after: { feature, restricted: true, reason, caseId },
  });

  // Полная блокировка меняет и статус аккаунта — иначе в списке он выглядел бы активным.
  if (feature === "account:full_suspension") {
    await db.update(usersTable)
      .set({ status: "suspended", blockReason: reason, updatedAt: new Date() })
      .where(eq(usersTable.id, id));
  }

  void createNotification({
    userId: id,
    type: "account_restricted",
    title: "Ограничен доступ",
    body: `Администратор ограничил доступ: ${feature}. Причина: ${reason}`,
    entityType: "general",
    link: "/profile",
  });

  res.status(201).json({ ok: true, restriction: created });
});

const ApplyManyBody = z.object({
  features: z.array(z.enum(RESTRICTION_FEATURES)).min(1).max(RESTRICTION_FEATURES.length),
  reason: z.string().min(3).max(500),
  caseId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  durationDays: z.number().int().positive().max(3650).optional().nullable(),
}).strict();

// «Apply Restriction» из ТЗ: админ отмечает галочками сразу несколько запретов
// и пишет одну причину на всех. Уже действующие пропускаем без ошибки —
// иначе половина списка ломала бы отправку целиком.
router.post("/users/:id/restrictions/batch", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = ApplyManyBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await loadUserOr404(id);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  const { features, reason, caseId, note, durationDays } = parsed.data;
  const admin = getSessionUser(req)!;
  const expiresAt = durationDays ? new Date(Date.now() + durationDays * 86_400_000) : null;

  const already = new Set((await db.select({ feature: accountRestrictionsTable.feature })
    .from(accountRestrictionsTable)
    .where(and(eq(accountRestrictionsTable.userId, id), isNull(accountRestrictionsTable.liftedAt))))
    .map((r) => r.feature));

  const toApply = features.filter((f) => !already.has(f));
  if (toApply.length > 0) {
    await db.insert(accountRestrictionsTable).values(toApply.map((feature) => ({
      userId: id, feature, reason,
      caseId: caseId ?? null, note: note ?? null,
      expiresAt, appliedBy: admin.id,
    })));
  }

  void auditMutation(req, {
    action: "restrict", entityType: "user", entityId: id,
    before: { restricted: [...already] },
    after: { restricted: [...already, ...toApply], reason, caseId },
  });

  if (toApply.includes("account:full_suspension")) {
    await db.update(usersTable)
      .set({ status: "suspended", blockReason: reason, updatedAt: new Date() })
      .where(eq(usersTable.id, id));
  }

  if (toApply.length > 0) {
    void createNotification({
      userId: id,
      type: "account_restricted",
      title: "Ограничен доступ",
      body: `Администратор ограничил доступ (${toApply.length}). Причина: ${reason}`,
      entityType: "general",
      link: "/profile",
    });
  }

  res.status(201).json({ ok: true, applied: toApply, skipped: features.filter((f) => already.has(f)) });
});

const LiftBody = z.object({
  feature: z.enum(RESTRICTION_FEATURES),
  note: z.string().max(2000).optional().nullable(),
}).strict();

router.post("/users/:id/restrictions/lift", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = LiftBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const admin = getSessionUser(req)!;

  const [lifted] = await db.update(accountRestrictionsTable)
    .set({ liftedAt: new Date(), liftedBy: admin.id, note: parsed.data.note ?? undefined })
    .where(and(
      eq(accountRestrictionsTable.userId, id),
      eq(accountRestrictionsTable.feature, parsed.data.feature),
      isNull(accountRestrictionsTable.liftedAt),
    ))
    .returning();
  if (!lifted) { res.status(404).json({ error: "Действующего ограничения нет" }); return; }

  void auditMutation(req, {
    action: "unrestrict", entityType: "user", entityId: id,
    before: { feature: parsed.data.feature, restricted: true },
    after: { feature: parsed.data.feature, restricted: false },
  });

  if (parsed.data.feature === "account:full_suspension") {
    await db.update(usersTable)
      .set({ status: "active", blockReason: null, updatedAt: new Date() })
      .where(eq(usersTable.id, id));
  }

  res.json({ ok: true, restriction: lifted });
});

// ─── Нарушения ────────────────────────────────────────────────────────────
router.get("/users/:id/violations", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const rows = await db.select().from(accountViolationsTable)
    .where(eq(accountViolationsTable.userId, id))
    .orderBy(desc(accountViolationsTable.createdAt)).limit(200);
  const confirmed = rows.filter((r) => r.status === "confirmed").length;
  res.json({
    data: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
    confirmed,
    riskLevel: riskLevelFor(confirmed),
  });
});

const ViolationBody = z.object({
  kind: z.enum(VIOLATION_KINDS),
  severity: z.enum(VIOLATION_SEVERITIES).default("warning"),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional().nullable(),
  caseId: z.string().max(80).optional().nullable(),
  evidenceUrl: z.string().max(500).optional().nullable(),
}).strict();

router.post("/users/:id/violations", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = ViolationBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await loadUserOr404(id);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  const [created] = await db.insert(accountViolationsTable).values({
    userId: id,
    kind: parsed.data.kind,
    severity: parsed.data.severity,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    caseId: parsed.data.caseId ?? null,
    evidenceUrl: parsed.data.evidenceUrl ?? null,
    createdBy: getSessionUser(req)!.id,
  }).returning();

  void auditMutation(req, {
    action: "create", entityType: "account_violation", entityId: created.id,
    before: null, after: created,
  });
  res.status(201).json({ ok: true, violation: created });
});

const ViolationStatusBody = z.object({
  status: z.enum(["open", "confirmed", "dismissed"]),
}).strict();

router.patch("/violations/:vid", adminOnly, async (req, res): Promise<void> => {
  const vid = parseInt(String(req.params.vid), 10);
  if (!Number.isFinite(vid)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = ViolationStatusBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(accountViolationsTable).where(eq(accountViolationsTable.id, vid));
  if (!before) { res.status(404).json({ error: "Нарушение не найдено" }); return; }

  const resolved = parsed.data.status !== "open";
  const [updated] = await db.update(accountViolationsTable)
    .set({
      status: parsed.data.status,
      resolvedBy: resolved ? getSessionUser(req)!.id : null,
      resolvedAt: resolved ? new Date() : null,
    })
    .where(eq(accountViolationsTable.id, vid)).returning();

  void auditMutation(req, {
    action: "update", entityType: "account_violation", entityId: vid,
    before, after: updated,
  });

  const [confirmed] = await db.select({ n: count() })
    .from(accountViolationsTable)
    .where(and(eq(accountViolationsTable.userId, before.userId), eq(accountViolationsTable.status, "confirmed")));

  res.json({
    ok: true, violation: updated,
    confirmed: confirmed?.n ?? 0,
    riskLevel: riskLevelFor(confirmed?.n ?? 0),
  });
});

// ─── Проверка прав ────────────────────────────────────────────────────────
// Свою заявку клиент читает по /me: адрес с :id закрыт админским гардом,
// и без этого маршрута кабинет всегда показывал бы пустую форму.
router.get("/users/me/rights-verification", async (req, res): Promise<void> => {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Требуется вход" }); return; }
  const [row] = await db.select().from(rightsVerificationsTable)
    .where(eq(rightsVerificationsTable.userId, user.id));
  res.json({ data: row ? {
    ...row,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt.toISOString(),
  } : null });
});

router.get("/users/:id/rights-verification", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const [row] = await db.select().from(rightsVerificationsTable)
    .where(eq(rightsVerificationsTable.userId, id));
  res.json({ data: row ? {
    ...row,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt.toISOString(),
  } : null });
});

const RightsSubmitBody = z.object({
  ownsRights: z.boolean(),
  authorizedToDistribute: z.boolean(),
  acceptsCopyrightResponsibility: z.boolean(),
  territories: z.string().max(1000).optional().nullable(),
  distributionRights: z.string().max(1000).optional().nullable(),
  documentPath: z.string().max(500).optional().nullable(),
  documentFilename: z.string().max(255).optional().nullable(),
}).strict();

// Подаёт сам пользователь. Повторная подача переписывает ту же строку и
// возвращает её на проверку — отдельной истории здесь не нужно.
router.put("/users/me/rights-verification", async (req, res): Promise<void> => {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Требуется вход" }); return; }
  const parsed = RightsSubmitBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const values = {
    userId: user.id,
    ownsRights: parsed.data.ownsRights,
    authorizedToDistribute: parsed.data.authorizedToDistribute,
    acceptsCopyrightResponsibility: parsed.data.acceptsCopyrightResponsibility,
    territories: parsed.data.territories ?? null,
    distributionRights: parsed.data.distributionRights ?? null,
    documentPath: parsed.data.documentPath ?? null,
    documentFilename: parsed.data.documentFilename ?? null,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    submittedAt: new Date(),
  };
  const [row] = await db.insert(rightsVerificationsTable).values(values)
    .onConflictDoUpdate({ target: rightsVerificationsTable.userId, set: values })
    .returning();

  void auditMutation(req, {
    action: "submit", entityType: "rights_verification", entityId: row.id,
    before: null, after: row,
  });
  res.json({ ok: true, data: row });
});

const RightsReviewBody = z.object({
  status: z.enum(["verified", "rejected", "info_requested"]),
  note: z.string().max(2000).optional().nullable(),
}).strict();

router.post("/users/:id/rights-verification/review", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  const parsed = RightsReviewBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(rightsVerificationsTable)
    .where(eq(rightsVerificationsTable.userId, id));
  if (!before) { res.status(404).json({ error: "Заявка на проверку прав не подана" }); return; }

  const [updated] = await db.update(rightsVerificationsTable)
    .set({
      status: parsed.data.status,
      reviewNote: parsed.data.note ?? null,
      reviewedBy: getSessionUser(req)!.id,
      reviewedAt: new Date(),
    })
    .where(eq(rightsVerificationsTable.userId, id)).returning();

  void auditMutation(req, {
    action: "review", entityType: "rights_verification", entityId: updated.id,
    before, after: updated,
  });

  void createNotification({
    userId: id,
    type: "rights_reviewed",
    title: parsed.data.status === "verified" ? "Права подтверждены" : "Проверка прав: нужны действия",
    body: parsed.data.note ?? "Статус проверки прав обновлён.",
    entityType: "general",
    link: "/profile",
  });

  res.json({ ok: true, data: updated });
});

// ─── Сводка по всем пользователям для списка «Users & Access» ─────────────
// Список пользователей отдаёт routes/users.ts; здесь только те поля, которых
// там нет: договор, права, риск и ограничения. Фронт склеивает по id.
router.get("/users-access-summary", adminOnly, async (_req, res): Promise<void> => {
  const contractRows = await db.select({
    userId: contractsTable.userId,
    status: contractsTable.status,
  }).from(contractsTable).orderBy(desc(contractsTable.createdAt));

  const rightsRows = await db.select({
    userId: rightsVerificationsTable.userId,
    status: rightsVerificationsTable.status,
  }).from(rightsVerificationsTable);

  const violationRows = await db.select({
    userId: accountViolationsTable.userId,
    n: count(),
  }).from(accountViolationsTable)
    .where(eq(accountViolationsTable.status, "confirmed"))
    .groupBy(accountViolationsTable.userId);

  const restrictionRows = await db.select({
    userId: accountRestrictionsTable.userId,
    feature: accountRestrictionsTable.feature,
  }).from(accountRestrictionsTable)
    .where(and(
      isNull(accountRestrictionsTable.liftedAt),
      or(isNull(accountRestrictionsTable.expiresAt), gt(accountRestrictionsTable.expiresAt, new Date()))!,
    ));

  type Summary = {
    contractStatus: string | null; rightsStatus: string | null;
    confirmedViolations: number; restrictions: string[]; riskLevel: string;
  };
  const byUser = new Map<number, Summary>();
  const touch = (id: number): Summary => {
    let entry = byUser.get(id);
    if (!entry) {
      entry = { contractStatus: null, rightsStatus: null, confirmedViolations: 0, restrictions: [], riskLevel: "low" };
      byUser.set(id, entry);
    }
    return entry;
  };
  // Договоров у пользователя может быть несколько — берём самый свежий,
  // строки уже отсортированы по дате создания вниз.
  for (const r of contractRows) {
    const entry = touch(r.userId);
    if (entry.contractStatus === null) entry.contractStatus = r.status;
  }
  for (const r of rightsRows) touch(r.userId).rightsStatus = r.status;
  for (const r of violationRows) {
    const entry = touch(r.userId);
    entry.confirmedViolations = r.n;
    entry.riskLevel = riskLevelFor(r.n);
  }
  for (const r of restrictionRows) touch(r.userId).restrictions.push(r.feature);

  res.json({ data: Object.fromEntries(byUser) });
});


// ─── Готовность к активации и сама активация ──────────────────────────────
// Девятый этап из ТЗ: администратор видит галочки по всем шагам и включает
// аккаунт. Пропустить незакрытый шаг нельзя — иначе проверка теряет смысл.
router.get("/users/:id/onboarding", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }
  res.json(await onboardingState(id));
});

async function onboardingState(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) return null;

  const [rights] = await db.select().from(rightsVerificationsTable)
    .where(eq(rightsVerificationsTable.userId, id));
  const [contract] = await db.select().from(contractsTable)
    .where(and(eq(contractsTable.userId, id), eq(contractsTable.status, "signed")))
    .orderBy(desc(contractsTable.signedAt)).limit(1);

  const steps = [
    // В базе исторически «approved»; «verified» пишут более новые куски кода —
    // принимаем оба, иначе галочка не загорится никогда.
    { key: "kyc", label: "Проверка документов (KYC)", done: ["approved", "verified"].includes(user.kycStatus) },
    { key: "rights", label: "Права на каталог подтверждены", done: rights?.status === "verified" },
    { key: "contract", label: "Договор подписан", done: Boolean(contract) },
  ];
  return {
    status: user.status,
    steps,
    ready: steps.every((s) => s.done),
    activated: user.status === "active",
  };
}

router.post("/users/:id/activate", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Неверный id" }); return; }

  const state = await onboardingState(id);
  if (!state) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  if (!state.ready) {
    const missing = state.steps.filter((s) => !s.done).map((s) => s.label).join(", ");
    res.status(409).json({ error: `Не пройдены шаги: ${missing}` });
    return;
  }

  const [before] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  const [updated] = await db.update(usersTable)
    .set({ status: "active", blockReason: null, updatedAt: new Date() })
    .where(eq(usersTable.id, id)).returning();

  void auditMutation(req, {
    action: "approve", entityType: "user", entityId: id, before, after: updated,
  });
  void createNotification({
    userId: id,
    type: "account_activated",
    title: "Аккаунт активирован",
    body: "Проверка пройдена. Загрузка релизов и отправка на площадки открыты.",
    entityType: "general",
    link: "/dashboard",
  });

  res.json({ ok: true, status: updated.status });
});

export default router;
