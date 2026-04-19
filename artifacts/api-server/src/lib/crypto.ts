/**
 * AES-256-GCM шифрование/дешифрование для секретов интеграций.
 *
 * Ключ берётся из env INTEGRATIONS_ENCRYPTION_KEY (32 байта в hex или base64).
 * Если ключ не задан — генерируется временный (только для dev),
 * с предупреждением в лог.
 *
 * Формат cipher_text: base64( iv(12) || authTag(16) || ciphertext(N) )
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (raw) {
    // Принимаем hex (64 символа) или base64
    let buf: Buffer;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      buf = Buffer.from(raw, "hex");
    } else {
      buf = Buffer.from(raw, "base64");
    }
    if (buf.length !== 32) {
      throw new Error(`INTEGRATIONS_ENCRYPTION_KEY должен быть 32 байта (получено ${buf.length}). Сгенерируйте: openssl rand -hex 32`);
    }
    cachedKey = buf;
    return buf;
  }

  // Dev-фоллбек — детерминистический ключ из имени машины (НЕ для прода!)
  console.warn(
    "[crypto] INTEGRATIONS_ENCRYPTION_KEY не задан. " +
    "Использую dev-ключ — НЕ ИСПОЛЬЗОВАТЬ В ПРОДЕ! " +
    "Сгенерируйте: openssl rand -hex 32 → положите в .env",
  );
  cachedKey = crypto
    .createHash("sha256")
    .update("tajikmusic-dev-fallback-key-do-not-use-in-prod")
    .digest();
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(cipherText: string): string {
  const key = getKey();
  const buf = Buffer.from(cipherText, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Невалидный cipher_text — слишком короткий");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/** Маска для отображения в UI: показываем только последние 4 символа. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 4) return "••••";
  return "•".repeat(Math.max(4, plain.length - 4)) + plain.slice(-4);
}
