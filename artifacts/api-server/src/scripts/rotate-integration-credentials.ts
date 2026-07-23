/**
 * Re-encrypt integration_credentials with INTEGRATIONS_ENCRYPTION_KEY.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server rotate:integration-credentials
 * Apply:             pnpm --filter @workspace/api-server rotate:integration-credentials -- --apply
 */
import {
  auditLogTable,
  db,
  integrationCredentialsTable,
  pool,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  assertIntegrationEncryptionConfigured,
  decryptSecret,
  encryptSecret,
  getIntegrationEncryptionStatus,
  secretNeedsReEncryption,
} from "../lib/crypto";

async function main(): Promise<void> {
  assertIntegrationEncryptionConfigured();
  const apply = process.argv.includes("--apply");
  const rows = await db.select({
    id: integrationCredentialsTable.id,
    cipherText: integrationCredentialsTable.cipherText,
  }).from(integrationCredentialsTable).orderBy(integrationCredentialsTable.id);

  const pending: Array<{ id: number; cipherText: string; previousFormat: "legacy" | "versioned" }> = [];
  const failedIds: number[] = [];
  for (const row of rows) {
    try {
      const plaintext = decryptSecret(row.cipherText);
      if (!secretNeedsReEncryption(row.cipherText)) continue;
      const rotatedCipherText = encryptSecret(plaintext);
      if (decryptSecret(rotatedCipherText) !== plaintext) {
        throw new Error("Post-encryption verification failed");
      }
      pending.push({
        id: row.id,
        cipherText: rotatedCipherText,
        previousFormat: row.cipherText.startsWith("v1:") ? "versioned" : "legacy",
      });
    } catch {
      failedIds.push(row.id);
    }
  }

  if (failedIds.length > 0) {
    throw new Error(`Rotation aborted: ${failedIds.length} credential(s) cannot be decrypted (ids: ${failedIds.join(",")})`);
  }

  const status = getIntegrationEncryptionStatus();
  if (apply && pending.length > 0) {
    await db.transaction(async (tx) => {
      for (const item of pending) {
        await tx.update(integrationCredentialsTable)
          .set({ cipherText: item.cipherText, updatedAt: new Date() })
          .where(eq(integrationCredentialsTable.id, item.id));
        await tx.insert(auditLogTable).values({
          userId: null,
          userEmail: "system@integration-key-rotation.local",
          userRole: "system",
          action: "update",
          entityType: "integration_credential",
          entityId: item.id,
          before: { encryptionFormat: item.previousFormat },
          after: { encryptionFormat: "v1", keyId: status.currentKeyId },
          diff: null,
        });
      }
    });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    total: rows.length,
    pending: pending.length,
    rotated: apply ? pending.length : 0,
    failed: 0,
    currentKeyId: status.currentKeyId,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Integration credential rotation failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
