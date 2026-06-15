/**
 * Хранилище учётных данных и токенов Broma16.
 *
 * Креды (email/password) и токены (access/refresh) лежат в зашифрованном
 * виде в таблице integration_credentials (code='broma16'). Если в БД нет
 * email/password — берём BROMA16_EMAIL / BROMA16_PASSWORD из окружения.
 *
 * account_id (не секрет) хранится в integrations.config.account_id.
 *
 * ВАЖНО: токены никогда не логируются.
 */

import { db } from "@workspace/db";
import { integrationsTable, integrationCredentialsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "../../lib/crypto";

export const BROMA16_CODE = "broma16";

type FieldValue = { value: string; expiresAt: Date | null };

async function getIntegrationRow() {
  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.code, BROMA16_CODE))
    .limit(1);
  return row ?? null;
}

/** Гарантирует наличие строки интеграции и возвращает её id. */
export async function ensureIntegrationId(): Promise<number> {
  const existing = await getIntegrationRow();
  if (existing) return existing.id;
  await db
    .insert(integrationsTable)
    .values({
      code: BROMA16_CODE,
      name: "Broma16 (ROD)",
      category: "delivery",
      authType: "api_key",
    })
    .onConflictDoNothing({ target: integrationsTable.code });
  const row = await getIntegrationRow();
  if (!row) throw new Error("Broma16: не удалось создать запись интеграции");
  return row.id;
}

async function upsertField(
  integrationId: number,
  fieldKey: string,
  value: string,
  expiresAt: Date | null = null,
): Promise<void> {
  const cipherText = encryptSecret(value);
  await db
    .delete(integrationCredentialsTable)
    .where(
      and(
        eq(integrationCredentialsTable.integrationId, integrationId),
        eq(integrationCredentialsTable.fieldKey, fieldKey),
      ),
    );
  await db.insert(integrationCredentialsTable).values({ integrationId, fieldKey, cipherText, expiresAt });
}

async function readField(integrationId: number, fieldKey: string): Promise<FieldValue | null> {
  const [row] = await db
    .select()
    .from(integrationCredentialsTable)
    .where(
      and(
        eq(integrationCredentialsTable.integrationId, integrationId),
        eq(integrationCredentialsTable.fieldKey, fieldKey),
      ),
    )
    .limit(1);
  if (!row) return null;
  try {
    return { value: decryptSecret(row.cipherText), expiresAt: row.expiresAt ?? null };
  } catch {
    return null;
  }
}

export type Broma16Credentials = { email: string; password: string; source: "db" | "env" };

/** Возвращает email/password из БД, либо из окружения, либо null. */
export async function getBroma16Credentials(): Promise<Broma16Credentials | null> {
  const id = await ensureIntegrationId();
  const email = await readField(id, "email");
  const password = await readField(id, "password");
  if (email?.value && password?.value) {
    return { email: email.value, password: password.value, source: "db" };
  }
  const envEmail = process.env.BROMA16_EMAIL?.trim();
  const envPassword = process.env.BROMA16_PASSWORD?.trim();
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword, source: "env" };
  }
  return null;
}

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
};

export async function getStoredTokens(): Promise<StoredTokens> {
  const id = await ensureIntegrationId();
  const access = await readField(id, "access_token");
  const refresh = await readField(id, "refresh_token");
  return {
    accessToken: access?.value ?? null,
    refreshToken: refresh?.value ?? null,
    expiresAt: access?.expiresAt ?? null,
  };
}

export async function saveTokens(t: {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}): Promise<void> {
  const id = await ensureIntegrationId();
  await upsertField(id, "access_token", t.accessToken, t.expiresAt ?? null);
  if (t.refreshToken) {
    await upsertField(id, "refresh_token", t.refreshToken);
  }
}

export async function clearTokens(): Promise<void> {
  const id = await ensureIntegrationId();
  await db
    .delete(integrationCredentialsTable)
    .where(
      and(
        eq(integrationCredentialsTable.integrationId, id),
        inArray(integrationCredentialsTable.fieldKey, ["access_token", "refresh_token"]),
      ),
    );
}

export async function getStoredAccountId(): Promise<string | null> {
  const row = await getIntegrationRow();
  const cfg = (row?.config ?? {}) as Record<string, unknown>;
  const v = cfg.account_id;
  return v != null ? String(v) : null;
}

export async function setStoredAccountId(accountId: string | number): Promise<void> {
  const id = await ensureIntegrationId();
  const row = await getIntegrationRow();
  const cfg = { ...((row?.config ?? {}) as Record<string, unknown>), account_id: String(accountId) };
  await db.update(integrationsTable).set({ config: cfg }).where(eq(integrationsTable.id, id));
}

/** Обновляет статус интеграции (для плашки в UI). */
export async function markIntegrationStatus(
  status: "connected" | "error" | "pending" | "disconnected",
  lastError: string | null = null,
): Promise<void> {
  const id = await ensureIntegrationId();
  await db
    .update(integrationsTable)
    .set({ status, lastError, lastSyncAt: new Date() })
    .where(eq(integrationsTable.id, id));
}
