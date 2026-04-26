import { Router } from "express";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { and, eq, desc, gte, lte, count, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../lib/auth";

const router = Router();

// audit-log читают только admin/manager. Артисты/лейблы видеть чужие действия
// не должны (даже свои не нужны им в UI — у них есть activity_log на дашборде).
router.use("/audit", requireRole("admin", "manager"));

const ListQuery = z.object({
  entity_type: z.string().min(1).max(50).optional(),
  // CSV-список: позволяет фильтровать по нескольким сущностям сразу (UI-пресет
  // «только финансы» = transaction,payout,ingestion,ingestion_unmatched). Если
  // указан и entity_type, и entity_types — entity_type имеет приоритет (single wins).
  entity_types: z.string().min(1).max(500).optional(),
  entity_id: z.coerce.number().int().positive().optional(),
  user_id: z.coerce.number().int().positive().optional(),
  action: z.enum(["create", "update", "delete", "login", "approve", "reject", "deliver"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/audit", async (req, res): Promise<void> => {
  const parsed = ListQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;

  const conditions = [];
  if (q.entity_type) {
    conditions.push(eq(auditLogTable.entityType, q.entity_type));
  } else if (q.entity_types) {
    // Парсим CSV, фильтруем пустые/слишком длинные значения. Лимит 20 типов —
    // защита от запроса со списком на тысячу элементов.
    const list = q.entity_types
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 50)
      .slice(0, 20);
    if (list.length > 0) conditions.push(inArray(auditLogTable.entityType, list));
  }
  if (q.entity_id !== undefined) conditions.push(eq(auditLogTable.entityId, q.entity_id));
  if (q.user_id !== undefined) conditions.push(eq(auditLogTable.userId, q.user_id));
  if (q.action) conditions.push(eq(auditLogTable.action, q.action));
  if (q.from) conditions.push(gte(auditLogTable.createdAt, new Date(q.from)));
  if (q.to) conditions.push(lte(auditLogTable.createdAt, new Date(q.to)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(auditLogTable)
    .where(where)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(q.limit)
    .offset(q.offset);
  const [{ total }] = await db
    .select({ total: count() })
    .from(auditLogTable)
    .where(where);

  res.json({
    data: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: {
      limit: q.limit,
      offset: q.offset,
      total,
    },
  });
});

// Helper для UI: список distinct entity_type / action для фильтров.
// In-memory кеш на 60 секунд: при росте audit_log selectDistinct без LIMIT
// дороговат, а данные для фильтров меняются редко (новый entityType появляется
// только при добавлении новой роуты — раз в спринт).
let facetsCache: { at: number; payload: unknown } | null = null;
const FACETS_TTL_MS = 60_000;

router.get("/audit/facets", async (_req, res): Promise<void> => {
  if (facetsCache && Date.now() - facetsCache.at < FACETS_TTL_MS) {
    res.json(facetsCache.payload);
    return;
  }
  const entityTypes = await db
    .selectDistinct({ entityType: auditLogTable.entityType })
    .from(auditLogTable);
  const actions = await db
    .selectDistinct({ action: auditLogTable.action })
    .from(auditLogTable);
  // Список юзеров, ограничен 200 — для фильтра «кто» этого с запасом.
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .orderBy(usersTable.name)
    .limit(200);
  const payload = {
    entityTypes: entityTypes.map((r) => r.entityType),
    actions: actions.map((r) => r.action),
    users,
  };
  facetsCache = { at: Date.now(), payload };
  res.json(payload);
});

export default router;
