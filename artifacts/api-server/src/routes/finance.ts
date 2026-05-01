import { Router } from "express";
import { db, transactionsTable, artistsTable, labelsTable, releasesTable, payoutsTable, usersTable, platformSettingsTable } from "@workspace/db";
import { count, eq, desc, and, ne, inArray, sql } from "drizzle-orm";
import {
  CreateTransactionBody,
  CreatePayoutRequestBody,
  RejectPayoutBody,
} from "@workspace/api-zod";
import { getDataScope, requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { PLATFORM_FEE_RATE, PAID_PAYOUT_STATUSES, PENDING_PAYOUT_STATUS } from "../lib/finance";
import { notifyByArtistId, notifyByLabelId, notifyAdmins } from "../services/notifications";
import { fireTriggerAndForget } from "../services/triggers";
import { fireWebhookAndForget } from "../services/webhook-dispatcher";
import { emitAlertAndForget } from "../services/alerts-emitter";

const router = Router();

// Build a scope filter for transactions/payouts tables that have artist_id and label_id
// columns. Returns null if the caller's query asked for something outside their scope.
function scopedArtistLabelFilter(
  req: any,
  artistCol: any,
  labelCol: any,
): any[] | null {
  const scope = getDataScope(req);
  const conditions: any[] = [];

  let qArtist: number | undefined;
  let qLabel: number | undefined;
  if (req.query.artist_id !== undefined) {
    const v = parseInt(req.query.artist_id as string, 10);
    if (!Number.isFinite(v)) return null;
    qArtist = v;
  }
  if (req.query.label_id !== undefined) {
    const v = parseInt(req.query.label_id as string, 10);
    if (!Number.isFinite(v)) return null;
    qLabel = v;
  }

  if (scope.fullAccess) {
    if (qArtist !== undefined) conditions.push(eq(artistCol, qArtist));
    if (qLabel  !== undefined) conditions.push(eq(labelCol,  qLabel));
    return conditions;
  }
  if (scope.role === "artist") {
    if (scope.artistId == null) return null; // signals "no rows"
    if (qArtist !== undefined && qArtist !== scope.artistId) return null;
    conditions.push(eq(artistCol, scope.artistId));
    return conditions;
  }
  if (scope.role === "label") {
    if (scope.labelId == null) return null;
    if (qLabel !== undefined && qLabel !== scope.labelId) return null;
    conditions.push(eq(labelCol, scope.labelId));
    return conditions;
  }
  return null;
}

function formatTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    ...t,
    amount: parseFloat(t.amount),
    createdAt: t.createdAt.toISOString(),
  };
}

function formatPayout(p: typeof payoutsTable.$inferSelect) {
  return {
    ...p,
    amount: parseFloat(p.amount),
    processedAt: p.processedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// Transactions
router.get("/finance/transactions", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const scoped = scopedArtistLabelFilter(req, transactionsTable.artistId, transactionsTable.labelId);
  if (scoped === null) {
    // Either an out-of-scope query or a non-privileged user with no entity assignment.
    // Return empty page rather than 403 — keeps the UI clean for the user's own view.
    res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    return;
  }
  const filters: any[] = [...scoped];
  if (req.query.type !== undefined) {
    filters.push(eq(transactionsTable.type, req.query.type as string));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const transactions = await db.select().from(transactionsTable).where(where).limit(limit).offset(offset).orderBy(desc(transactionsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(transactionsTable).where(where);

  const artistIds = transactions.map(t => t.artistId).filter(Boolean) as number[];
  const labelIds = transactions.map(t => t.labelId).filter(Boolean) as number[];
  const releaseIds = transactions.map(t => t.releaseId).filter(Boolean) as number[];

  const artists = artistIds.length > 0 ? await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable) : [];
  const labels = labelIds.length > 0 ? await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable) : [];
  const releases = releaseIds.length > 0 ? await db.select({ id: releasesTable.id, title: releasesTable.title }).from(releasesTable) : [];

  const artistMap = new Map(artists.map(a => [a.id, a.name]));
  const labelMap = new Map(labels.map(l => [l.id, l.name]));
  const releaseMap = new Map(releases.map(r => [r.id, r.title]));

  res.json({
    data: transactions.map(t => ({
      ...formatTransaction(t),
      artistName: t.artistId ? (artistMap.get(t.artistId) ?? null) : null,
      labelName: t.labelId ? (labelMap.get(t.labelId) ?? null) : null,
      releaseName: t.releaseId ? (releaseMap.get(t.releaseId) ?? null) : null,
    })),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/finance/transactions", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [transaction] = await db.insert(transactionsTable).values({
    ...parsed.data,
    amount: parsed.data.amount.toString(),
  }).returning();
  void auditMutation(req, { action: "create", entityType: "transaction", entityId: transaction.id, before: null, after: transaction });
  res.status(201).json({
    ...formatTransaction(transaction),
    artistName: null,
    labelName: null,
    releaseName: null,
  });
});

// ─── Balances ────────────────────────────────────────────────────────────
// Реальный расчёт (был fake Math.random).
// Формула per entity (artist|label, currency=USD):
//   gross           = Σ transactions.amount WHERE type != 'payout'
//   net             = gross × (1 − PLATFORM_FEE_RATE)
//   paidOut         = Σ payouts.amount WHERE status ∈ PAID_PAYOUT_STATUSES
//   balance         = max(0, net − paidOut)        ← available для нового запроса payout
//   pendingPayout   = Σ payouts.amount WHERE status='pending'
//
// Артистам возвращаем только свой artist-баланс; лейблам — только свой
// label-баланс (индивидуальные артисты лейбла не раскрываются). Админ/менеджер
// видит и тех, и других. Валюта пока зашита USD — multi-currency-balances
// потребует отдельного аккумулятора per currency и слайдер на фронте.
interface BalanceRow {
  entityType: "artist" | "label";
  entityId: number;
  entityName: string;
  balance: number;
  currency: string;
  pendingPayout: number;
}

router.get("/finance/balances", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  let artistIdFilter = req.query.artist_id !== undefined ? parseInt(req.query.artist_id as string, 10) : undefined;
  let labelIdFilter  = req.query.label_id  !== undefined ? parseInt(req.query.label_id  as string, 10) : undefined;
  if (req.query.artist_id !== undefined && !Number.isFinite(artistIdFilter)) {
    res.status(400).json({ error: "Invalid artist_id" }); return;
  }
  if (req.query.label_id !== undefined && !Number.isFinite(labelIdFilter)) {
    res.status(400).json({ error: "Invalid label_id" }); return;
  }

  // Скоуп: для не-привилегированных ролей принудительно подменяем фильтры
  // на свой artistId/labelId; одновременно отключаем «чужие» секции в ответе.
  let returnArtists = true;
  let returnLabels = true;
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json([]); return; }
      if (artistIdFilter !== undefined && artistIdFilter !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      artistIdFilter = scope.artistId; labelIdFilter = undefined;
      returnLabels = false;
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json([]); return; }
      if (labelIdFilter !== undefined && labelIdFilter !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
      labelIdFilter = scope.labelId; artistIdFilter = undefined;
      returnArtists = false;
    }
  }

  const balances: BalanceRow[] = [];

  // ─── Artist balances ───────────────────────────────────────────────────
  if (returnArtists) {
    const artistConds: any[] = [eq(artistsTable.status, "active")];
    if (artistIdFilter !== undefined) artistConds.push(eq(artistsTable.id, artistIdFilter));
    if (labelIdFilter  !== undefined) artistConds.push(eq(artistsTable.labelId, labelIdFilter));

    const artists = await db.select({ id: artistsTable.id, name: artistsTable.name })
      .from(artistsTable).where(and(...artistConds));

    if (artists.length > 0) {
      const ids = artists.map(a => a.id);

      // Один SQL-запрос на агрегат — не тянем строки в JS-память.
      const revRows = await db
        .select({
          artistId: transactionsTable.artistId,
          gross: sql<string>`COALESCE(SUM(${transactionsTable.amount}), 0)::text`,
        })
        .from(transactionsTable)
        .where(and(
          inArray(transactionsTable.artistId, ids),
          eq(transactionsTable.currency, "USD"),
          ne(transactionsTable.type, "payout"),
        ))
        .groupBy(transactionsTable.artistId);
      const grossMap = new Map(revRows.filter(r => r.artistId != null).map(r => [r.artistId!, parseFloat(r.gross)]));

      const paidRows = await db
        .select({
          artistId: payoutsTable.artistId,
          amount: sql<string>`COALESCE(SUM(${payoutsTable.amount}), 0)::text`,
        })
        .from(payoutsTable)
        .where(and(
          inArray(payoutsTable.artistId, ids),
          eq(payoutsTable.currency, "USD"),
          inArray(payoutsTable.status, [...PAID_PAYOUT_STATUSES]),
        ))
        .groupBy(payoutsTable.artistId);
      const paidMap = new Map(paidRows.filter(r => r.artistId != null).map(r => [r.artistId!, parseFloat(r.amount)]));

      const pendingRows = await db
        .select({
          artistId: payoutsTable.artistId,
          amount: sql<string>`COALESCE(SUM(${payoutsTable.amount}), 0)::text`,
        })
        .from(payoutsTable)
        .where(and(
          inArray(payoutsTable.artistId, ids),
          eq(payoutsTable.currency, "USD"),
          eq(payoutsTable.status, PENDING_PAYOUT_STATUS),
        ))
        .groupBy(payoutsTable.artistId);
      const pendingMap = new Map(pendingRows.filter(r => r.artistId != null).map(r => [r.artistId!, parseFloat(r.amount)]));

      for (const a of artists) {
        const gross = grossMap.get(a.id) ?? 0;
        const net = gross * (1 - PLATFORM_FEE_RATE);
        const paid = paidMap.get(a.id) ?? 0;
        const pending = pendingMap.get(a.id) ?? 0;
        balances.push({
          entityType: "artist",
          entityId: a.id,
          entityName: a.name,
          balance: Math.round(Math.max(0, net - paid) * 100) / 100,
          currency: "USD",
          pendingPayout: Math.round(pending * 100) / 100,
        });
      }
    }
  }

  // ─── Label balances ────────────────────────────────────────────────────
  // ВАЖНО: одна и та же транзакция учитывается и для artistId, и для labelId,
  // если оба заполнены (см. ingestion/service.ts). Это интенционально: лейбл
  // и артист видят свой собственный «pool of money», и payouts учитываются
  // независимо (artist-payout не уменьшает label-баланс и наоборот).
  if (returnLabels) {
    const labelConds: any[] = [eq(labelsTable.status, "active")];
    if (labelIdFilter !== undefined) labelConds.push(eq(labelsTable.id, labelIdFilter));

    const labels = await db.select({ id: labelsTable.id, name: labelsTable.name })
      .from(labelsTable).where(and(...labelConds));

    if (labels.length > 0) {
      const ids = labels.map(l => l.id);

      const revRows = await db
        .select({
          labelId: transactionsTable.labelId,
          gross: sql<string>`COALESCE(SUM(${transactionsTable.amount}), 0)::text`,
        })
        .from(transactionsTable)
        .where(and(
          inArray(transactionsTable.labelId, ids),
          eq(transactionsTable.currency, "USD"),
          ne(transactionsTable.type, "payout"),
        ))
        .groupBy(transactionsTable.labelId);
      const grossMap = new Map(revRows.filter(r => r.labelId != null).map(r => [r.labelId!, parseFloat(r.gross)]));

      const paidRows = await db
        .select({
          labelId: payoutsTable.labelId,
          amount: sql<string>`COALESCE(SUM(${payoutsTable.amount}), 0)::text`,
        })
        .from(payoutsTable)
        .where(and(
          inArray(payoutsTable.labelId, ids),
          eq(payoutsTable.currency, "USD"),
          inArray(payoutsTable.status, [...PAID_PAYOUT_STATUSES]),
        ))
        .groupBy(payoutsTable.labelId);
      const paidMap = new Map(paidRows.filter(r => r.labelId != null).map(r => [r.labelId!, parseFloat(r.amount)]));

      const pendingRows = await db
        .select({
          labelId: payoutsTable.labelId,
          amount: sql<string>`COALESCE(SUM(${payoutsTable.amount}), 0)::text`,
        })
        .from(payoutsTable)
        .where(and(
          inArray(payoutsTable.labelId, ids),
          eq(payoutsTable.currency, "USD"),
          eq(payoutsTable.status, PENDING_PAYOUT_STATUS),
        ))
        .groupBy(payoutsTable.labelId);
      const pendingMap = new Map(pendingRows.filter(r => r.labelId != null).map(r => [r.labelId!, parseFloat(r.amount)]));

      for (const l of labels) {
        const gross = grossMap.get(l.id) ?? 0;
        const net = gross * (1 - PLATFORM_FEE_RATE);
        const paid = paidMap.get(l.id) ?? 0;
        const pending = pendingMap.get(l.id) ?? 0;
        balances.push({
          entityType: "label",
          entityId: l.id,
          entityName: l.name,
          balance: Math.round(Math.max(0, net - paid) * 100) / 100,
          currency: "USD",
          pendingPayout: Math.round(pending * 100) / 100,
        });
      }
    }
  }

  res.json(balances);
});

// Payouts
router.get("/payouts", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const scoped = scopedArtistLabelFilter(req, payoutsTable.artistId, payoutsTable.labelId);
  if (scoped === null) {
    res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    return;
  }
  const filters: any[] = [...scoped];
  if (req.query.status !== undefined) {
    filters.push(eq(payoutsTable.status, req.query.status as string));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const payouts = await db.select().from(payoutsTable).where(where).limit(limit).offset(offset).orderBy(desc(payoutsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(payoutsTable).where(where);

  const artists = await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable);
  const labels = await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable);
  const artistMap = new Map(artists.map(a => [a.id, a.name]));
  const labelMap = new Map(labels.map(l => [l.id, l.name]));

  res.json({
    data: payouts.map(p => ({
      ...formatPayout(p),
      artistName: p.artistId ? (artistMap.get(p.artistId) ?? null) : null,
      labelName: p.labelId ? (labelMap.get(p.labelId) ?? null) : null,
    })),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/payouts", async (req, res): Promise<void> => {
  const parsed = CreatePayoutRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Scope: artist may only request payout for own artistId; label only own labelId.
  // Also enforce pair consistency: if both artistId and labelId are present,
  // they must reference the same tenant subtree.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null || parsed.data.artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      // If a labelId is also passed in by an artist user, it must match their artist's label.
      if (parsed.data.labelId != null) {
        const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, scope.artistId));
        if (!a || a.labelId !== parsed.data.labelId) { res.status(403).json({ error: "labelId mismatch" }); return; }
      }
    } else if (scope.role === "label") {
      if (scope.labelId == null || parsed.data.labelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
      // If an artistId is supplied, it must belong to this label.
      if (parsed.data.artistId != null) {
        const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, parsed.data.artistId));
        if (!a || a.labelId !== scope.labelId) { res.status(403).json({ error: "Artist does not belong to your label" }); return; }
      }
    }
  }

  // ─── KYC + bank-info guard (Task #6, ТЗ §4.4) ────────────────────────────
  // Без подтверждённого KYC и заполненных банк-реквизитов выплата не оформляется.
  // admin/manager пропускаем — они инициируют выплаты от имени артиста/лейбла,
  // и у них может быть свой процесс верификации.
  const sessionUser = req.session.user!;
  if (sessionUser.role === "artist" || sessionUser.role === "label") {
    const [me] = await db.select({
      kycStatus: usersTable.kycStatus,
      bankAccountNumber: usersTable.bankAccountNumber,
      bankSwift: usersTable.bankSwift,
      bankHolderName: usersTable.bankHolderName,
    }).from(usersTable).where(eq(usersTable.id, sessionUser.id));
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (me.kycStatus !== "approved") {
      res.status(400).json({
        error: "Сначала пройди KYC-верификацию в профиле",
        code: "kyc_not_approved",
        kycStatus: me.kycStatus,
      });
      return;
    }
    if (!me.bankAccountNumber || !me.bankSwift || !me.bankHolderName) {
      res.status(400).json({
        error: "Заполни банковские реквизиты в профиле перед запросом выплаты",
        code: "bank_info_missing",
      });
      return;
    }
  }

  // Two-step approval: если сумма >= порога из settings.finance.twoStepThresholdCents → требуется L1+L2.
  let twoStepRequired = false;
  try {
    const [s] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "finance"));
    const v = (s?.value ?? {}) as { twoStepThresholdCents?: number };
    const thresholdCents = typeof v.twoStepThresholdCents === "number" ? v.twoStepThresholdCents : 0;
    if (thresholdCents > 0) {
      const amountCents = Math.round(parsed.data.amount * 100);
      twoStepRequired = amountCents >= thresholdCents;
    }
  } catch { /* без настроек — обычный single-step */ }

  const [payout] = await db.insert(payoutsTable).values({
    ...parsed.data,
    amount: parsed.data.amount.toString(),
    twoStepRequired,
  }).returning();
  void auditMutation(req, { action: "create", entityType: "payout", entityId: payout.id, before: null, after: payout });

  // Уведомляем всех администраторов и менеджеров о новом запросе на выплату.
  const requesterName = req.session.user!.name;
  void notifyAdmins({
    type: "payout_requested",
    title: `💰 Новый запрос на выплату: ${payout.amount} ${payout.currency}`,
    body: `От: ${requesterName}. Метод: ${payout.method ?? "—"}.`,
    entityType: "payout",
    entityId: payout.id,
    link: "/payouts",
  });

  // Подтверждение самому заявителю — артисту и/или лейблу — что заявка принята.
  const ackTitle = `Заявка на выплату принята: ${payout.amount} ${payout.currency}`;
  const ackBody  = payout.twoStepRequired
    ? "Сумма требует двухступенчатого согласования. Мы уведомим вас о решении."
    : "Заявка передана администратору на рассмотрение.";
  if (payout.artistId) {
    void notifyByArtistId(payout.artistId, {
      type: "payout_requested_ack",
      title: ackTitle,
      body: ackBody,
      entityType: "payout",
      entityId: payout.id,
      link: "/payouts",
    });
  }
  if (payout.labelId) {
    void notifyByLabelId(payout.labelId, {
      type: "payout_requested_ack",
      title: ackTitle,
      body: ackBody,
      entityType: "payout",
      entityId: payout.id,
      link: "/payouts",
    });
  }

  res.status(201).json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

router.patch("/payouts/:id/approve", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Payout not found" }); return; }

  const approverId = req.session.user!.id;
  const now = new Date();

  // Two-step routing:
  //   - twoStepRequired=false → одно нажатие → status='approved' (single-step).
  //   - twoStepRequired=true:
  //       стадия pending → 'approved_l1' (status остаётся 'pending', не финал).
  //       стадия approved_l1 → 'approved' (другим юзером).
  //   - Защита: один и тот же юзер не может одновременно L1+L2.
  const isTwoStep = existing.twoStepRequired === true;
  const stage = existing.approvalStage ?? "pending";

  let updateSet: Record<string, unknown>;
  let isFinal = false;

  // Атомарное conditional update: WHERE включает ожидаемую stage+status, чтобы
  // конкурентные approve не могли финализировать payout дважды и продублировать side-effects.
  let updateWhere: any;
  if (!isTwoStep) {
    updateSet = { status: "approved", approvalStage: "approved_l2", approvedL1By: approverId, approvedL1At: now, approvedL2By: approverId, approvedL2At: now, processedAt: now };
    isFinal = true;
    updateWhere = and(eq(payoutsTable.id, id), eq(payoutsTable.status, "pending"));
  } else if (stage === "pending") {
    updateSet = { approvalStage: "approved_l1", approvedL1By: approverId, approvedL1At: now };
    isFinal = false;
    updateWhere = and(eq(payoutsTable.id, id), eq(payoutsTable.status, "pending"), sql`coalesce(${payoutsTable.approvalStage}, 'pending') = 'pending'`);
  } else if (stage === "approved_l1") {
    if (existing.approvedL1By === approverId) {
      res.status(403).json({
        error: "two_step_same_user",
        message: "L2-одобрение должен сделать другой администратор/менеджер",
      });
      return;
    }
    updateSet = { status: "approved", approvalStage: "approved_l2", approvedL2By: approverId, approvedL2At: now, processedAt: now };
    isFinal = true;
    updateWhere = and(eq(payoutsTable.id, id), eq(payoutsTable.status, "pending"), eq(payoutsTable.approvalStage, "approved_l1"));
  } else {
    res.status(409).json({ error: "invalid_stage", message: `Текущая стадия: ${stage}, одобрение невозможно` });
    return;
  }

  const [payout] = await db.update(payoutsTable)
    .set(updateSet)
    .where(updateWhere)
    .returning();

  if (!payout) {
    // Конкурентный approve уже изменил state — отдаём 409, чтобы клиент перечитал.
    res.status(409).json({ error: "stale_state", message: "Состояние выплаты изменилось — обновите страницу" });
    return;
  }
  void auditMutation(req, {
    action: isFinal ? "approve" : "approve_l1",
    entityType: "payout", entityId: payout.id, before: existing, after: payout,
  });

  // Уведомления и триггеры — только при финальном одобрении (L2 / single).
  if (isFinal) {
    const approveTitle = `💸 Выплата на ${payout.amount} ${payout.currency} одобрена`;
    const approveBody = "Средства будут переведены в ближайшее время.";
    if (payout.artistId) void notifyByArtistId(payout.artistId, { type: "payout_approved", title: approveTitle, body: approveBody, entityType: "payout", entityId: payout.id, link: "/payouts" });
    if (payout.labelId)  void notifyByLabelId(payout.labelId,   { type: "payout_approved", title: approveTitle, body: approveBody, entityType: "payout", entityId: payout.id, link: "/payouts" });

    fireTriggerAndForget("payout_approved", {
      artistId: payout.artistId ?? null,
      labelId: payout.labelId ?? null,
      vars: { amount: String(payout.amount), currency: payout.currency, payout_id: String(payout.id) },
      link: "/payouts",
      entityType: "payout",
      entityId: payout.id,
    });
    fireWebhookAndForget("payout.approved", {
      payoutId: payout.id, amount: payout.amount, currency: payout.currency,
      artistId: payout.artistId, labelId: payout.labelId,
    });
  } else {
    // L1 одобрено — нотифицируем admin'ов о том, что нужен L2
    void notifyAdmins({
      type: "payout_l1_approved",
      title: `Выплата ${payout.amount} ${payout.currency}: нужен L2-одобрение`,
      body: `L1 уже одобрено. Требуется второй администратор для финализации.`,
      entityType: "payout",
      entityId: payout.id,
      link: "/payouts",
    });
  }

  res.json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

router.patch("/payouts/:id/reject", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = RejectPayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Payout not found" }); return; }

  const [payout] = await db.update(payoutsTable)
    .set({ status: "rejected", rejectionReason: parsed.data.reason, processedAt: new Date() })
    .where(eq(payoutsTable.id, id))
    .returning();

  if (!payout) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  void auditMutation(req, { action: "reject", entityType: "payout", entityId: payout.id, before: existing, after: payout });

  // Уведомляем получателя об отклонении выплаты.
  const rejectTitle = `🚫 Выплата на ${payout.amount} ${payout.currency} отклонена`;
  const rejectBody = parsed.data.reason ? `Причина: ${parsed.data.reason}` : "";
  if (payout.artistId) void notifyByArtistId(payout.artistId, { type: "payout_rejected", title: rejectTitle, body: rejectBody, entityType: "payout", entityId: payout.id, link: "/payouts" });
  if (payout.labelId)  void notifyByLabelId(payout.labelId,   { type: "payout_rejected", title: rejectTitle, body: rejectBody, entityType: "payout", entityId: payout.id, link: "/payouts" });

  fireTriggerAndForget("payout_rejected", {
    artistId: payout.artistId ?? null,
    labelId: payout.labelId ?? null,
    vars: {
      amount: String(payout.amount), currency: payout.currency, payout_id: String(payout.id),
      reason: parsed.data.reason ?? "",
    },
    link: "/payouts",
    entityType: "payout",
    entityId: payout.id,
  });
  fireWebhookAndForget("payout.rejected", {
    payoutId: payout.id, amount: payout.amount, currency: payout.currency,
    artistId: payout.artistId, labelId: payout.labelId, reason: parsed.data.reason,
  });

  emitAlertAndForget({
    kind: "payment_failed",
    severity: "medium",
    message: `Выплата #${payout.id} на ${payout.amount} ${payout.currency} отклонена${parsed.data.reason ? `: ${parsed.data.reason}` : ""}`,
    entityType: "payout",
    entityId: payout.id,
    meta: { artistId: payout.artistId, labelId: payout.labelId, reason: parsed.data.reason ?? null },
  });

  res.json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

export default router;
