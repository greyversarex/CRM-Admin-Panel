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
 *
 * All endpoints in this router require admin/manager role. The router-level
 * `requireRole` below is defence-in-depth: routes/index.ts already mounts this
 * router behind `adminOnly`, but if that prefix middleware ever gets removed
 * or refactored, the guard here keeps the integration management closed.
 */

import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import {
  listIntegrations,
  upsertIntegration,
  saveCredentials,
  setEnabled,
  updateIntegrationConfig,
  disconnectIntegration,
  testConnection,
  getSyncJobs,
  pollIntegrationAcks,
} from "../services/integrations-service";

const router = Router();

// Defence-in-depth — same guard as in routes/index.ts.
// Scoped to /integrations path so the middleware doesn't fire as a catch-all
// on unrelated routes when this router is mounted without a path prefix.
router.use("/integrations", requireRole("admin", "manager"));

// :code is used in DB lookups (integrations.code, an arbitrary text PK from the
// caller's perspective). We restrict it to a safe alphabet so it can never be a
// SQL-fragment payload and so we get clean error messages instead of cryptic
// drizzle errors deep inside the service layer.
const CodeParam = z.object({
  code: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, "code must match /^[a-z0-9_-]+$/"),
});

const RegisterBody = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(["dsp", "delivery", "publishing", "social", "analytics", "payments", "storage", "email", "communications", "other"]),
  authType: z.enum(["api_key", "oauth2", "basic", "bearer", "none"]),
}).strict();

const CredentialsBody = z.object({
  // Each value is a free-form string secret (api_key, client_secret, etc.).
  // The service encrypts them with AES-256-GCM before persisting.
  fields: z.record(z.string(), z.string()),
}).strict();

const EnableBody = z.object({
  enabled: z.boolean(),
}).strict();

// Конфиг интеграции (transport, host, port, username, remotePath, partyIds, …)
// Значения — string|number|boolean. Пустая строка / null трактуются как сброс ключа.
const ConfigBody = z.object({
  config: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
}).strict();

// Some "test" connectors take optional probe parameters; we accept an empty body
// as well as a dict of strings for forward-compatibility.
const TestBody = z.object({}).catchall(z.string()).optional();

const JobsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function badRequest(res: import("express").Response, error: z.ZodError): void {
  res.status(400).json({ error: error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") });
}

router.get("/integrations", async (req, res): Promise<void> => {
  const all = await listIntegrations();
  const cat = typeof req.query.category === "string" ? req.query.category : undefined;
  const data = cat ? all.filter((i) => i.category === cat) : all;
  res.json({ data });
});

router.post("/integrations/:code/register", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = RegisterBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  const integration = await upsertIntegration({ code: params.data.code, ...body.data });
  res.status(201).json(integration);
});

router.post("/integrations/:code/credentials", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = CredentialsBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  try {
    await saveCredentials(params.data.code, body.data.fields);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

router.delete("/integrations/:code", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);

  await disconnectIntegration(params.data.code);
  res.json({ ok: true });
});

router.patch("/integrations/:code/config", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = ConfigBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  try {
    const updated = await updateIntegrationConfig(params.data.code, body.data.config);
    res.json({ ok: true, config: updated.config ?? {} });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

router.post("/integrations/:code/enable", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = EnableBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  try {
    await setEnabled(params.data.code, body.data.enabled);
    res.json({ ok: true, enabled: body.data.enabled });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

router.post("/integrations/:code/test", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  // Body is optional — accept either missing/empty or a dict of strings.
  const bodyParse = TestBody.safeParse(req.body);
  if (!bodyParse.success) return badRequest(res, bodyParse.error);

  const result = await testConnection(params.data.code);
  res.status(result.ok ? 200 : 400).json(result);
});

router.post("/integrations/:code/poll-acks", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);

  try {
    const result = await pollIntegrationAcks(params.data.code);
    res.json(result);
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

router.get("/integrations/:code/jobs", async (req, res): Promise<void> => {
  const params = CodeParam.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const query = JobsQuery.safeParse(req.query);
  if (!query.success) return badRequest(res, query.error);

  const limit = query.data.limit ?? 20;
  const jobs = await getSyncJobs(params.data.code, limit);
  res.json({ data: jobs });
});

export default router;
