import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createIntegrationCrypto, getIntegrationCryptoConfig } from "./crypto";

const OLD_KEY = Buffer.from("11".repeat(32), "hex");
const NEW_KEY = Buffer.from("22".repeat(32), "hex");

function legacyEncrypt(plaintext: string, key: Buffer): string {
  const iv = Buffer.alloc(12, 7);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

test("production requires a valid current encryption key", () => {
  assert.throws(
    () => getIntegrationCryptoConfig({ NODE_ENV: "production" }),
    /INTEGRATIONS_ENCRYPTION_KEY.*required/,
  );
  assert.throws(
    () => getIntegrationCryptoConfig({ NODE_ENV: "production", INTEGRATIONS_ENCRYPTION_KEY: "bad" }),
    /32 bytes/,
  );
});

test("encrypts with a versioned key id and authenticates the payload", () => {
  const integrationCrypto = createIntegrationCrypto({ currentKey: NEW_KEY, previousKeys: [], developmentFallback: false });
  const first = integrationCrypto.encrypt("client-secret-value");
  const second = integrationCrypto.encrypt("client-secret-value");
  assert.match(first, /^v1:[a-f0-9]{16}:/);
  assert.notEqual(first, second);
  assert.equal(integrationCrypto.decrypt(first), "client-secret-value");

  const tampered = `${first.slice(0, -1)}${first.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => integrationCrypto.decrypt(tampered));
});

test("decrypts previous-key ciphertext and marks it for rotation", () => {
  const oldCrypto = createIntegrationCrypto({ currentKey: OLD_KEY, previousKeys: [], developmentFallback: false });
  const newCrypto = createIntegrationCrypto({ currentKey: NEW_KEY, previousKeys: [OLD_KEY], developmentFallback: false });
  const oldCipherText = oldCrypto.encrypt("refresh-token");
  assert.equal(newCrypto.decrypt(oldCipherText), "refresh-token");
  assert.equal(newCrypto.needsReEncryption(oldCipherText), true);

  const rotated = newCrypto.encrypt(newCrypto.decrypt(oldCipherText));
  assert.equal(newCrypto.decrypt(rotated), "refresh-token");
  assert.equal(newCrypto.needsReEncryption(rotated), false);
});

test("supports legacy unversioned ciphertext during explicit rotation", () => {
  const integrationCrypto = createIntegrationCrypto({ currentKey: NEW_KEY, previousKeys: [OLD_KEY], developmentFallback: false });
  const legacy = legacyEncrypt("legacy-password", OLD_KEY);
  assert.equal(integrationCrypto.decrypt(legacy), "legacy-password");
  assert.equal(integrationCrypto.needsReEncryption(legacy), true);
});

test("does not decrypt previous-key data unless that key is explicitly configured", () => {
  const oldCipherText = createIntegrationCrypto({ currentKey: OLD_KEY, previousKeys: [], developmentFallback: false })
    .encrypt("private-key");
  const newCrypto = createIntegrationCrypto({ currentKey: NEW_KEY, previousKeys: [], developmentFallback: false });
  assert.throws(() => newCrypto.decrypt(oldCipherText), /unavailable encryption key/);
});

test("accepts hex/base64 keys and deduplicates the previous ring", () => {
  const config = getIntegrationCryptoConfig({
    NODE_ENV: "production",
    INTEGRATIONS_ENCRYPTION_KEY: NEW_KEY.toString("base64"),
    INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS: `${OLD_KEY.toString("hex")},${OLD_KEY.toString("base64")},${NEW_KEY.toString("hex")}`,
  });
  assert.equal(config.currentKey.equals(NEW_KEY), true);
  assert.equal(config.previousKeys.length, 1);
  assert.equal(config.previousKeys[0].equals(OLD_KEY), true);
});
