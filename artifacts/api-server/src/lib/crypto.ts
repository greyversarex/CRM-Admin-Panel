/**
 * Versioned AES-256-GCM encryption for integration credentials.
 *
 * Current format: v1:<key-id>:base64(iv(12) || authTag(16) || ciphertext)
 * Legacy unversioned base64 payloads remain decryptable during key rotation.
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const FORMAT_VERSION = "v1";
const KEY_ID_HEX_LEN = 16;
const DEV_FALLBACK_PHRASE = "tajikmusic-dev-fallback-key-do-not-use-in-prod";

export interface IntegrationCryptoConfig {
  currentKey: Buffer;
  previousKeys: Buffer[];
  developmentFallback: boolean;
}

type KeyMaterial = { id: string; key: Buffer };

function parseKey(raw: string, variableName: string): Buffer {
  const value = raw.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      throw new Error(`${variableName} must be 32 bytes encoded as 64-char hex or base64`);
    }
    key = Buffer.from(value, "base64");
  }
  if (key.length !== 32) {
    throw new Error(`${variableName} must decode to exactly 32 bytes (received ${key.length})`);
  }
  return key;
}

export function getIntegrationCryptoConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): IntegrationCryptoConfig {
  const rawCurrent = env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  const isProduction = env.NODE_ENV === "production";
  let currentKey: Buffer;
  let developmentFallback = false;

  if (!rawCurrent) {
    if (isProduction) {
      throw new Error("INTEGRATIONS_ENCRYPTION_KEY environment variable is required in production");
    }
    developmentFallback = true;
    currentKey = crypto.createHash("sha256").update(DEV_FALLBACK_PHRASE).digest();
  } else {
    currentKey = parseKey(rawCurrent, "INTEGRATIONS_ENCRYPTION_KEY");
  }

  const previousKeys = (env.INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value, index) => parseKey(value, `INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS[${index}]`));

  const currentHex = currentKey.toString("hex");
  const deduplicatedPrevious = previousKeys.filter((key, index, all) => {
    const hex = key.toString("hex");
    return hex !== currentHex && all.findIndex((candidate) => candidate.toString("hex") === hex) === index;
  });

  return { currentKey, previousKeys: deduplicatedPrevious, developmentFallback };
}

function toKeyMaterial(key: Buffer): KeyMaterial {
  return {
    id: crypto.createHash("sha256").update(key).digest("hex").slice(0, KEY_ID_HEX_LEN),
    key: Buffer.from(key),
  };
}

function decryptPayload(payload: string, material: KeyMaterial, aad?: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid integration credential ciphertext");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, material.key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function createIntegrationCrypto(config: IntegrationCryptoConfig) {
  const current = toKeyMaterial(config.currentKey);
  const allMaterials = [current, ...config.previousKeys.map(toKeyMaterial)];
  const byId = new Map(allMaterials.map((material) => [material.id, material]));
  if (byId.size !== allMaterials.length) {
    throw new Error("Integration encryption key-id collision or duplicate key");
  }

  return {
    currentKeyId: current.id,
    developmentFallback: config.developmentFallback,

    encrypt(plaintext: string): string {
      const iv = crypto.randomBytes(IV_LEN);
      const aad = `${FORMAT_VERSION}:${current.id}`;
      const cipher = crypto.createCipheriv(ALGO, current.key, iv);
      cipher.setAAD(Buffer.from(aad, "utf8"));
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
      return `${FORMAT_VERSION}:${current.id}:${payload}`;
    },

    decrypt(cipherText: string): string {
      const versioned = /^v1:([a-f0-9]{16}):([A-Za-z0-9+/]+={0,2})$/i.exec(cipherText);
      if (versioned) {
        const material = byId.get(versioned[1].toLowerCase());
        if (!material) throw new Error("Integration credential uses an unavailable encryption key");
        return decryptPayload(versioned[2], material, `${FORMAT_VERSION}:${material.id}`);
      }
      if (cipherText.startsWith(`${FORMAT_VERSION}:`)) {
        throw new Error("Invalid versioned integration credential ciphertext");
      }

      // Legacy format had no version/key id/AAD. Try current first, followed by
      // explicitly configured previous keys. Never silently add the known dev
      // fallback in production; it must be supplied as a previous key to rotate.
      for (const material of allMaterials) {
        try { return decryptPayload(cipherText, material); } catch { /* try next key */ }
      }
      throw new Error("Integration credential cannot be decrypted with configured keys");
    },

    needsReEncryption(cipherText: string): boolean {
      const match = /^v1:([a-f0-9]{16}):/i.exec(cipherText);
      return !match || match[1].toLowerCase() !== current.id;
    },
  };
}

let defaultCrypto: ReturnType<typeof createIntegrationCrypto> | null = null;

function getDefaultCrypto() {
  if (!defaultCrypto) {
    defaultCrypto = createIntegrationCrypto(getIntegrationCryptoConfig());
    if (defaultCrypto.developmentFallback) {
      console.warn(
        "[crypto] INTEGRATIONS_ENCRYPTION_KEY is not set; using the deterministic development fallback only",
      );
    }
  }
  return defaultCrypto;
}

export function assertIntegrationEncryptionConfigured(): void {
  void getDefaultCrypto();
}

export function encryptSecret(plaintext: string): string {
  return getDefaultCrypto().encrypt(plaintext);
}

export function decryptSecret(cipherText: string): string {
  return getDefaultCrypto().decrypt(cipherText);
}

export function secretNeedsReEncryption(cipherText: string): boolean {
  return getDefaultCrypto().needsReEncryption(cipherText);
}

export function getIntegrationEncryptionStatus(): {
  currentKeyId: string;
  developmentFallback: boolean;
} {
  const integrationCrypto = getDefaultCrypto();
  return {
    currentKeyId: integrationCrypto.currentKeyId,
    developmentFallback: integrationCrypto.developmentFallback,
  };
}

/** Маска для отображения в UI: показываем только последние 4 символа. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 4) return "••••";
  return "•".repeat(Math.max(4, plain.length - 4)) + plain.slice(-4);
}
