/**
 * Сервисный слой для интеграций — оборачивает работу с БД, шифрование
 * и вызовы коннекторов.
 */

import { db } from "@workspace/db";
import {
  integrationsTable,
  integrationCredentialsTable,
  integrationSyncJobsTable,
  type Integration,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { encryptSecret, decryptSecret, maskSecret } from "../lib/crypto";
import { getConnector } from "../connectors/registry";
import type { ConnectorContext } from "../connectors/base";

export type IntegrationView = {
  id: number;
  code: string;
  name: string;
  category: string;
  authType: string;
  enabled: boolean;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  hasCredentials: boolean;
  credentialFields: { fieldKey: string; masked: string }[];
  config: Record<string, unknown>;
};

export async function listIntegrations(): Promise<IntegrationView[]> {
  const rows = await db.select().from(integrationsTable).orderBy(integrationsTable.category, integrationsTable.name);
  if (rows.length === 0) return [];

  const credRows = await db.select().from(integrationCredentialsTable);
  const byIntegration = new Map<number, typeof credRows>();
  for (const c of credRows) {
    if (!byIntegration.has(c.integrationId)) byIntegration.set(c.integrationId, []);
    byIntegration.get(c.integrationId)!.push(c);
  }

  return rows.map((r) => {
    const creds = byIntegration.get(r.id) ?? [];
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      authType: r.authType,
      enabled: r.enabled,
      status: r.status,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      lastError: r.lastError,
      hasCredentials: creds.length > 0,
      credentialFields: creds.map((c) => {
        try {
          return { fieldKey: c.fieldKey, masked: maskSecret(decryptSecret(c.cipherText)) };
        } catch {
          return { fieldKey: c.fieldKey, masked: "•••• (decrypt error)" };
        }
      }),
      config: (r.config ?? {}) as Record<string, unknown>,
    };
  });
}

export async function getIntegrationByCode(code: string): Promise<Integration | null> {
  const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.code, code));
  return row ?? null;
}

export async function upsertIntegration(input: {
  code: string;
  name: string;
  category: string;
  authType: string;
}): Promise<Integration> {
  const existing = await getIntegrationByCode(input.code);
  if (existing) return existing;
  const [created] = await db.insert(integrationsTable).values({
    code: input.code,
    name: input.name,
    category: input.category,
    authType: input.authType,
  }).returning();
  return created;
}

export async function saveCredentials(
  integrationCode: string,
  fields: Record<string, string>,
): Promise<void> {
  const integration = await getIntegrationByCode(integrationCode);
  if (!integration) throw new Error(`Интеграция ${integrationCode} не зарегистрирована`);

  // Удаляем старые креды и сохраняем новые
  await db.delete(integrationCredentialsTable).where(eq(integrationCredentialsTable.integrationId, integration.id));
  const inserts = Object.entries(fields)
    .filter(([, v]) => v && v.length > 0)
    .map(([fieldKey, value]) => ({
      integrationId: integration.id,
      fieldKey,
      cipherText: encryptSecret(value),
    }));
  if (inserts.length > 0) {
    await db.insert(integrationCredentialsTable).values(inserts);
  }
  await db.update(integrationsTable)
    .set({ status: "pending", lastError: null })
    .where(eq(integrationsTable.id, integration.id));
}

export async function loadCredentials(integrationId: number): Promise<Record<string, string>> {
  const rows = await db.select().from(integrationCredentialsTable).where(eq(integrationCredentialsTable.integrationId, integrationId));
  const out: Record<string, string> = {};
  for (const r of rows) {
    try {
      out[r.fieldKey] = decryptSecret(r.cipherText);
    } catch {
      // skip broken
    }
  }
  return out;
}

export async function setEnabled(integrationCode: string, enabled: boolean): Promise<void> {
  const integration = await getIntegrationByCode(integrationCode);
  if (!integration) throw new Error(`Интеграция ${integrationCode} не найдена`);
  await db.update(integrationsTable)
    .set({ enabled })
    .where(eq(integrationsTable.id, integration.id));
}

export async function disconnectIntegration(integrationCode: string): Promise<void> {
  const integration = await getIntegrationByCode(integrationCode);
  if (!integration) return;
  await db.delete(integrationCredentialsTable).where(eq(integrationCredentialsTable.integrationId, integration.id));
  await db.update(integrationsTable)
    .set({ status: "disconnected", enabled: false, lastSyncAt: null, lastError: null })
    .where(eq(integrationsTable.id, integration.id));
}

export async function testConnection(integrationCode: string): Promise<{ ok: boolean; message?: string }> {
  const integration = await getIntegrationByCode(integrationCode);
  if (!integration) return { ok: false, message: "Интеграция не зарегистрирована" };

  const connector = getConnector(integrationCode);
  if (!connector) {
    return { ok: false, message: `Коннектор для ${integrationCode} ещё не реализован` };
  }

  const credentials = await loadCredentials(integration.id);
  const ctx: ConnectorContext = { credentials, config: (integration.config ?? {}) as Record<string, unknown> };

  // Создаём sync_job запись
  const [job] = await db.insert(integrationSyncJobsTable).values({
    integrationId: integration.id,
    jobType: "test",
    status: "running",
  }).returning();

  const startTime = Date.now();
  try {
    const result = await connector.testConnection(ctx);
    const duration = Date.now() - startTime;
    await db.update(integrationSyncJobsTable).set({
      status: result.ok ? "success" : "error",
      finishedAt: new Date(),
      durationMs: duration,
      result: result.data,
      errorMessage: result.ok ? null : result.message,
    }).where(eq(integrationSyncJobsTable.id, job.id));

    await db.update(integrationsTable).set({
      status: result.ok ? "connected" : "error",
      lastSyncAt: new Date(),
      lastError: result.ok ? null : result.message,
    }).where(eq(integrationsTable.id, integration.id));

    return { ok: result.ok, message: result.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const duration = Date.now() - startTime;
    await db.update(integrationSyncJobsTable).set({
      status: "error",
      finishedAt: new Date(),
      durationMs: duration,
      errorMessage: message,
    }).where(eq(integrationSyncJobsTable.id, job.id));
    await db.update(integrationsTable).set({
      status: "error", lastError: message,
    }).where(eq(integrationsTable.id, integration.id));
    return { ok: false, message };
  }
}

export async function getSyncJobs(integrationCode: string, limit = 20) {
  const integration = await getIntegrationByCode(integrationCode);
  if (!integration) return [];
  return await db.select()
    .from(integrationSyncJobsTable)
    .where(eq(integrationSyncJobsTable.integrationId, integration.id))
    .orderBy(desc(integrationSyncJobsTable.startedAt))
    .limit(limit);
}
