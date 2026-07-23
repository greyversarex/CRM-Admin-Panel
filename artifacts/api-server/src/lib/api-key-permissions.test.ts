import assert from "node:assert/strict";
import test from "node:test";
import {
  canApiKeyAccess,
  getRequiredApiKeyPermission,
  sanitizeApiKeyPermissions,
} from "./api-key-permissions";

test("maps safe and mutating methods to separate permissions", () => {
  assert.equal(getRequiredApiKeyPermission("GET", "/api/releases?limit=20"), "read:releases");
  assert.equal(getRequiredApiKeyPermission("HEAD", "/api/releases/1"), "read:releases");
  assert.equal(getRequiredApiKeyPermission("POST", "/api/releases"), "write:releases");
  assert.equal(getRequiredApiKeyPermission("DELETE", "/api/releases/1"), "write:releases");
});

test("requires the delivery capability for the release delivery command", () => {
  assert.equal(
    getRequiredApiKeyPermission("POST", "/api/releases/42/deliver"),
    "write:deliveries",
  );
  assert.equal(
    canApiKeyAccess(["write:releases"], "POST", "/api/releases/42/deliver").allowed,
    false,
  );
});

test("maps route aliases to their business capability", () => {
  assert.equal(getRequiredApiKeyPermission("GET", "/api/payouts"), "read:finance");
  assert.equal(getRequiredApiKeyPermission("POST", "/api/ddex/messages"), "write:distribution");
  assert.equal(getRequiredApiKeyPermission("GET", "/api/contacts"), "read:crm");
  assert.equal(getRequiredApiKeyPermission("GET", "/dsp-catalog"), "read:releases");
  assert.equal(getRequiredApiKeyPermission("GET", "/api/admin/kyc/users"), "read:kyc");
  assert.equal(getRequiredApiKeyPermission("POST", "/api/admin/users/9/kyc/approve"), "write:kyc");
});

test("fails closed for system and unknown routes", () => {
  for (const path of [
    "/api/auth/me",
    "/api/api-keys",
    "/api/settings/security",
    "/api/integrations",
    "/api/webhooks",
    "/api/manager-permissions",
    "/api/a-brand-new-route",
  ]) {
    assert.equal(getRequiredApiKeyPermission("GET", path), null, path);
  }
});

test("does not let write imply read or read imply write", () => {
  assert.deepEqual(canApiKeyAccess(["write:artists"], "GET", "/api/artists"), {
    allowed: false,
    requiredPermission: "read:artists",
  });
  assert.deepEqual(canApiKeyAccess(["read:artists"], "POST", "/api/artists"), {
    allowed: false,
    requiredPermission: "write:artists",
  });
});

test("drops unknown stored permissions and removes duplicates", () => {
  assert.deepEqual(
    sanitizeApiKeyPermissions(["read:artists", "admin:*", "read:artists", "write:finance"]),
    ["read:artists", "write:finance"],
  );
});
