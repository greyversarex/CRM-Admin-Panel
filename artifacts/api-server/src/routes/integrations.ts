/**
 * REST API для управления интеграциями.
 *
 * GET    /api/integrations                        список + статусы
 * POST   /api/integrations/:code/register         зарегистрировать (upsert) интеграцию
 * POST   /api/integrations/:code/credentials      сохранить креды (шифруются AES-256-GCM)
 * DELETE /api/integrations/:code                  отключить и удалить креды
 * POST   /api/integrations/:code/enable           вкл/выкл
 * POST   /api/integrations/:code/test             тест соединения
 * GET    /api/integrations/:code/jobs             журнал sync'ов
 */

import { Router } from "express";
import {
  listIntegrations,
  upsertIntegration,
  saveCredentials,
  setEnabled,
  disconnectIntegration,
  testConnection,
  getSyncJobs,
} from "../services/integrations-service";

const router = Router();

router.get("/integrations", async (_req, res): Promise<void> => {
  const data = await listIntegrations();
  res.json({ data });
});

router.post("/integrations/:code/register", async (req, res): Promise<void> => {
  const { code } = req.params;
  const { name, category, authType } = req.body ?? {};
  if (!name || !category || !authType) {
    res.status(400).json({ error: "Нужны поля: name, category, authType" });
    return;
  }
  const integration = await upsertIntegration({ code, name, category, authType });
  res.status(201).json(integration);
});

router.post("/integrations/:code/credentials", async (req, res): Promise<void> => {
  const { code } = req.params;
  const fields = req.body?.fields ?? {};
  if (typeof fields !== "object" || Array.isArray(fields)) {
    res.status(400).json({ error: "fields должен быть объектом { fieldKey: value }" });
    return;
  }
  try {
    await saveCredentials(code, fields);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

router.delete("/integrations/:code", async (req, res): Promise<void> => {
  await disconnectIntegration(req.params.code);
  res.json({ ok: true });
});

router.post("/integrations/:code/enable", async (req, res): Promise<void> => {
  const enabled = req.body?.enabled === true;
  try {
    await setEnabled(req.params.code, enabled);
    res.json({ ok: true, enabled });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

router.post("/integrations/:code/test", async (req, res): Promise<void> => {
  const result = await testConnection(req.params.code);
  res.status(result.ok ? 200 : 400).json(result);
});

router.get("/integrations/:code/jobs", async (req, res): Promise<void> => {
  const limit = parseInt((req.query.limit as string) ?? "20", 10) || 20;
  const jobs = await getSyncJobs(req.params.code, limit);
  res.json({ data: jobs });
});

export default router;
