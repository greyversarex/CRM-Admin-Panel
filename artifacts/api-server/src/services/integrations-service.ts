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
import { getTransport } from "../ddex/transports";
import { ingestAck } from "../ddex/service";

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

export async function updateIntegrationConfig(
  integrationCode: string,
  config: Record<string, unknown>,
): Promise<Integration> {
  const integration = await getIntegrationByCode(integrationCode);
  if (!integration) throw new Error(`Интеграция ${integrationCode} не найдена`);
  // merge с существующим config (партиальный апдейт)
  const merged = { ...((integration.config ?? {}) as Record<string, unknown>), ...config };
  // null-значения убираем (фронт может явно сбросить поле)
  for (const k of Object.keys(merged)) if (merged[k] === null || merged[k] === "") delete merged[k];
  const [updated] = await db.update(integrationsTable)
    .set({ config: merged })
    .where(eq(integrationsTable.id, integration.id))
    .returning();
  return updated;
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

export async function testConnection(integrationCode: string): Promise<{ ok: boolean; message?: string; unverified?: boolean }> {
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

    // Маппинг результата коннектора в статус интеграции:
    //   ok=true                     → "connected" (зелёный, реально проверено)
    //   ok=true, unverified=true    → "unverified" (жёлтый, креды сохранены,
    //                                  но end-to-end тест невозможен — например,
    //                                  OAuth требует браузерного редиректа)
    //   ok=false                    → "error" (красный)
    let nextStatus: "connected" | "unverified" | "error";
    if (!result.ok) nextStatus = "error";
    else if (result.unverified) nextStatus = "unverified";
    else nextStatus = "connected";

    await db.update(integrationSyncJobsTable).set({
      status: result.ok ? "success" : "error",
      finishedAt: new Date(),
      durationMs: duration,
      result: result.data,
      errorMessage: result.ok ? null : result.message,
    }).where(eq(integrationSyncJobsTable.id, job.id));

    await db.update(integrationsTable).set({
      status: nextStatus,
      lastSyncAt: new Date(),
      lastError: result.ok ? null : result.message,
    }).where(eq(integrationsTable.id, integration.id));

    return { ok: result.ok, message: result.message, unverified: result.unverified };
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

export type AckPollFileResult = {
  filename: string;
  preview: string;       // первые 600 символов тела
  status: "ingested" | "duplicate" | "error";
  ackId?: string;
  messageStatus?: string;
  errorMessage?: string;
};

export type AckPollResult = {
  transport: string;
  found: number;
  files: AckPollFileResult[];
  error?: string;
};

/**
 * Разовый ручной опрос SFTP outbox: читает XML-ack'и, удаляет их (как автополлер),
 * вызывает ingestAck для каждого. Возвращает список файлов с предпросмотром и статусом.
 * Работает без DDEX_ACK_POLLER_ENABLED=1.
 */
export async function pollIntegrationAcks(integrationCode: string): Promise<AckPollResult> {
  const integration = await getIntegrationByCode(integrationCode);
  if (!integration) throw new Error(`Интеграция ${integrationCode} не найдена`);

  const cfg = (integration.config ?? {}) as Record<string, string>;
  const transportName = cfg.transport ?? "local-fs";

  if (transportName !== "sftp") {
    return {
      transport: transportName,
      found: 0,
      files: [],
      error: `Опрос outbox доступен только для SFTP-транспорта (текущий: ${transportName})`,
    };
  }

  let transport;
  try { transport = getTransport(transportName); } catch (e) {
    return { transport: transportName, found: 0, files: [], error: (e as Error).message };
  }
  if (!transport.pollAcks) {
    return { transport: transportName, found: 0, files: [], error: "Транспорт не поддерживает pollAcks" };
  }

  const credentials = await loadCredentials(integration.id);
  const ctx = { config: { ...cfg, partnerCode: integrationCode }, credentials };

  let rawFiles: { filename: string; body: string }[];
  try {
    rawFiles = await transport.pollAcks(ctx);
  } catch (e) {
    return { transport: transportName, found: 0, files: [], error: `SFTP ошибка: ${(e as Error).message}` };
  }

  const results: AckPollFileResult[] = [];
  for (const f of rawFiles) {
    const preview = f.body.slice(0, 600).replace(/\r\n/g, "\n");
    try {
      const r = await ingestAck(f.body, "manual", integrationCode);
      results.push({ filename: f.filename, preview, status: "ingested", ackId: r.ackId != null ? String(r.ackId) : undefined, messageStatus: r.status });
    } catch (err) {
      const msg = (err as Error).message;
      const isDuplicate = msg.includes("duplicate") || msg.includes("уже") || msg.includes("already");
      results.push({ filename: f.filename, preview, status: isDuplicate ? "duplicate" : "error", errorMessage: msg });
    }
  }

  return { transport: transportName, found: rawFiles.length, files: results };
}
