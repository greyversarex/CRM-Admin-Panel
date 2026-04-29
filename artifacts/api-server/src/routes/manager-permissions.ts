/**
 * Manager permissions API
 *
 * GET   /api/manager-permissions       — admin + manager: список всех ключей с флагами enabled
 *                                         (manager должен знать свои права чтобы фронт скрыл пункты меню)
 * PATCH /api/manager-permissions/:key  — admin-only: { enabled: boolean }
 *
 * Серверная защита эндпоинтов — через requireManagerPermission middleware (последняя линия).
 */
import { Router } from "express";
import { z } from "zod";
import { db, managerPermissionsTable, MANAGER_PERMISSION_KEYS } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { invalidateManagerPermissions } from "../lib/manager-permissions";
import { auditMutation } from "../lib/audit";

const router = Router();

const adminOnly = requireRole("admin");
const KEY_SET = new Set<string>(MANAGER_PERMISSION_KEYS);

router.get("/manager-permissions", requireAuth, async (req, res) => {
  const role = req.session?.user?.role;
  if (role !== "admin" && role !== "manager") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const rows = await db.select().from(managerPermissionsTable);
  const map = new Map(rows.map((r) => [r.key, r]));
  // Возвращаем строго в порядке канонического enum'а — UI рассчитывает на стабильный порядок.
  const items = MANAGER_PERMISSION_KEYS.map((k) => {
    const r = map.get(k);
    return {
      key: k,
      enabled: r?.enabled ?? true,
      updatedAt: r?.updatedAt ?? null,
      updatedBy: r?.updatedBy ?? null,
    };
  });
  res.json({ items });
});

const PatchBody = z.object({ enabled: z.boolean() });

router.patch("/manager-permissions/:key", adminOnly, async (req, res) => {
  const key = String(req.params["key"] ?? "");
  if (!KEY_SET.has(key)) {
    res.status(400).json({ error: "unknown_permission_key", key });
    return;
  }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.issues });
    return;
  }
  const u = req.session!.user!;
  // UPSERT: если строки нет — создаст; если есть — обновит.
  const [before] = await db.select().from(managerPermissionsTable).where(eq(managerPermissionsTable.key, key));
  const [after] = await db
    .insert(managerPermissionsTable)
    .values({ key, enabled: parsed.data.enabled, updatedBy: u.id })
    .onConflictDoUpdate({
      target: managerPermissionsTable.key,
      set: { enabled: parsed.data.enabled, updatedBy: u.id, updatedAt: new Date() },
    })
    .returning();

  invalidateManagerPermissions(key);

  await auditMutation(req, {
    action: "update",
    entityType: "manager_permission",
    entityId: null,
    before: before ?? null,
    after: after ?? null,
  });

  res.json({ ok: true, item: after });
});

export default router;
