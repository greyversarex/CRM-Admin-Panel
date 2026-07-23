import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDdexInboundSignature,
  getDdexInboundAuthConfig,
  verifyDdexInboundRequest,
} from "./ddex-inbound-auth";

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW_MS = 1_785_200_000_000;
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));
const BODY = Buffer.from("<Acknowledgement><Status>Accepted</Status></Acknowledgement>");

test("production refuses to start without a strong inbound secret", () => {
  assert.throws(
    () => getDdexInboundAuthConfig({ NODE_ENV: "production" }),
    /DDEX_INBOUND_SECRET.*required/,
  );
  assert.throws(
    () => getDdexInboundAuthConfig({ NODE_ENV: "production", DDEX_INBOUND_SECRET: "short" }),
    /at least 32 bytes/,
  );
});

test("development can explicitly run unsigned when no secret is configured", () => {
  const config = getDdexInboundAuthConfig({ NODE_ENV: "development" });
  assert.deepEqual(verifyDdexInboundRequest({ rawBody: BODY, config }), {
    ok: true,
    unsignedDevelopmentMode: true,
  });
});

test("accepts a timestamp-bound signature inside the replay window", () => {
  const config = getDdexInboundAuthConfig({
    NODE_ENV: "production",
    DDEX_INBOUND_SECRET: SECRET,
    DDEX_INBOUND_MAX_SKEW_SECONDS: "300",
  });
  const signatureHeader = buildDdexInboundSignature(SECRET, TIMESTAMP, BODY);
  assert.deepEqual(verifyDdexInboundRequest({
    rawBody: BODY,
    signatureHeader,
    timestampHeader: TIMESTAMP,
    config,
    nowMs: NOW_MS,
  }), { ok: true, unsignedDevelopmentMode: false });
});

test("rejects missing, stale and malformed timestamps", () => {
  const config = getDdexInboundAuthConfig({ NODE_ENV: "production", DDEX_INBOUND_SECRET: SECRET });
  const signatureHeader = buildDdexInboundSignature(SECRET, TIMESTAMP, BODY);
  assert.deepEqual(verifyDdexInboundRequest({ rawBody: BODY, signatureHeader, config, nowMs: NOW_MS }), {
    ok: false,
    reason: "missing_timestamp",
  });
  assert.deepEqual(verifyDdexInboundRequest({
    rawBody: BODY,
    signatureHeader,
    timestampHeader: String(Number(TIMESTAMP) - 301),
    config,
    nowMs: NOW_MS,
  }), { ok: false, reason: "stale_timestamp" });
  assert.deepEqual(verifyDdexInboundRequest({
    rawBody: BODY,
    signatureHeader,
    timestampHeader: "not-a-timestamp",
    config,
    nowMs: NOW_MS,
  }), { ok: false, reason: "invalid_timestamp" });
});

test("rejects body or timestamp tampering", () => {
  const config = getDdexInboundAuthConfig({ NODE_ENV: "production", DDEX_INBOUND_SECRET: SECRET });
  const signatureHeader = buildDdexInboundSignature(SECRET, TIMESTAMP, BODY);
  assert.equal(verifyDdexInboundRequest({
    rawBody: Buffer.from(`${BODY.toString("utf8")} `),
    signatureHeader,
    timestampHeader: TIMESTAMP,
    config,
    nowMs: NOW_MS,
  }).ok, false);
  assert.equal(verifyDdexInboundRequest({
    rawBody: BODY,
    signatureHeader,
    timestampHeader: String(Number(TIMESTAMP) + 1),
    config,
    nowMs: NOW_MS,
  }).ok, false);
});

test("validates the configured replay window", () => {
  assert.throws(
    () => getDdexInboundAuthConfig({
      NODE_ENV: "production",
      DDEX_INBOUND_SECRET: SECRET,
      DDEX_INBOUND_MAX_SKEW_SECONDS: "5",
    }),
    /between 30 and 3600/,
  );
});
