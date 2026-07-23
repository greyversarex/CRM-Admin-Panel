import assert from "node:assert/strict";
import test from "node:test";
import { isCorsOriginAllowed } from "./cors-origin";

test("allows a production same-origin request without a configured allowlist", () => {
  assert.equal(isCorsOriginAllowed({
    origin: "http://localhost",
    requestOrigin: "http://localhost",
    configuredOrigins: [],
    isProduction: true,
  }), true);
});

test("rejects an unlisted cross-origin production request", () => {
  assert.equal(isCorsOriginAllowed({
    origin: "https://attacker.example",
    requestOrigin: "https://crm.example",
    configuredOrigins: [],
    isProduction: true,
  }), false);
});

test("allows an explicitly configured cross-origin production frontend", () => {
  assert.equal(isCorsOriginAllowed({
    origin: "https://app.example",
    requestOrigin: "https://api.example",
    configuredOrigins: ["https://app.example"],
    isProduction: true,
  }), true);
});

test("keeps non-CORS and development requests available", () => {
  assert.equal(isCorsOriginAllowed({
    origin: undefined,
    requestOrigin: null,
    configuredOrigins: [],
    isProduction: true,
  }), true);
  assert.equal(isCorsOriginAllowed({
    origin: "https://preview.example",
    requestOrigin: "http://localhost:5173",
    configuredOrigins: [],
    isProduction: false,
  }), true);
});

