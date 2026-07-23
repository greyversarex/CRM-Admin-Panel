import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_SKEW_SECONDS = 5 * 60;
const MIN_SECRET_BYTES = 32;

export interface DdexInboundAuthConfig {
  secret: string | null;
  maxSkewSeconds: number;
  unsignedDevelopmentMode: boolean;
}

export type DdexInboundAuthFailure =
  | "missing_signature"
  | "invalid_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "stale_timestamp";

export type DdexInboundAuthResult =
  | { ok: true; unsignedDevelopmentMode: boolean }
  | { ok: false; reason: DdexInboundAuthFailure };

export function getDdexInboundAuthConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DdexInboundAuthConfig {
  const isProduction = env.NODE_ENV === "production";
  const secret = env.DDEX_INBOUND_SECRET?.trim() || null;
  // Do not crash the whole API when the webhook secret is missing.
  // Production without a secret simply rejects inbound webhooks (see verify + route).
  if (secret && Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error(`DDEX_INBOUND_SECRET must contain at least ${MIN_SECRET_BYTES} bytes`);
  }

  const rawSkew = env.DDEX_INBOUND_MAX_SKEW_SECONDS?.trim();
  const maxSkewSeconds = rawSkew ? Number(rawSkew) : DEFAULT_MAX_SKEW_SECONDS;
  if (!Number.isInteger(maxSkewSeconds) || maxSkewSeconds < 30 || maxSkewSeconds > 3600) {
    throw new Error("DDEX_INBOUND_MAX_SKEW_SECONDS must be an integer between 30 and 3600");
  }

  return {
    secret,
    maxSkewSeconds,
    unsignedDevelopmentMode: !secret && !isProduction,
  };
}

/**
 * Partner signing contract:
 *   X-DDEX-Timestamp: Unix epoch seconds
 *   X-DDEX-Signature: sha256=HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
 */
export function buildDdexInboundSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
): string {
  const digest = createHmac("sha256", secret)
    .update(timestamp, "utf8")
    .update(".", "utf8")
    .update(rawBody)
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyDdexInboundRequest(args: {
  rawBody: Buffer;
  signatureHeader?: string;
  timestampHeader?: string;
  config: DdexInboundAuthConfig;
  nowMs?: number;
}): DdexInboundAuthResult {
  const { rawBody, signatureHeader, timestampHeader, config } = args;
  if (!config.secret) {
    // Dev-only open mode. In production a missing secret must not accept payloads.
    if (config.unsignedDevelopmentMode) {
      return { ok: true, unsignedDevelopmentMode: true };
    }
    return { ok: false, reason: "missing_signature" };
  }
  if (!timestampHeader) return { ok: false, reason: "missing_timestamp" };
  if (!/^\d{10}$/.test(timestampHeader)) return { ok: false, reason: "invalid_timestamp" };

  const timestampMs = Number(timestampHeader) * 1000;
  const nowMs = args.nowMs ?? Date.now();
  if (!Number.isSafeInteger(timestampMs)) return { ok: false, reason: "invalid_timestamp" };
  if (Math.abs(nowMs - timestampMs) > config.maxSkewSeconds * 1000) {
    return { ok: false, reason: "stale_timestamp" };
  }

  if (!signatureHeader) return { ok: false, reason: "missing_signature" };
  const match = /^(?:sha256=)?([a-f0-9]{64})$/i.exec(signatureHeader.trim());
  if (!match) return { ok: false, reason: "invalid_signature" };

  const expected = buildDdexInboundSignature(config.secret, timestampHeader, rawBody)
    .slice("sha256=".length);
  const actualBuffer = Buffer.from(match[1], "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer)
    ? { ok: true, unsignedDevelopmentMode: false }
    : { ok: false, reason: "invalid_signature" };
}
