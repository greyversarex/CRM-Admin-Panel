import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_ROLES,
  getDemoAccountEmail,
  isDemoLoginEnabled,
  isDemoRole,
} from "./demo-login";

test("demo login is disabled by default and accepts only explicit enable values", () => {
  assert.equal(isDemoLoginEnabled({}), false);
  assert.equal(isDemoLoginEnabled({ DEMO_LOGIN_ENABLED: "false" }), false);
  assert.equal(isDemoLoginEnabled({ DEMO_LOGIN_ENABLED: "yes" }), false);
  assert.equal(isDemoLoginEnabled({ DEMO_LOGIN_ENABLED: "1" }), true);
  assert.equal(isDemoLoginEnabled({ DEMO_LOGIN_ENABLED: " TRUE " }), true);
});

test("accepts only the four supported demo roles", () => {
  assert.deepEqual(DEMO_ROLES, ["admin", "manager", "label", "artist"]);
  for (const role of DEMO_ROLES) assert.equal(isDemoRole(role), true);
  assert.equal(isDemoRole("system"), false);
  assert.equal(isDemoRole(""), false);
  assert.equal(isDemoRole(null), false);
});

test("server-side demo account mapping is complete", () => {
  for (const role of DEMO_ROLES) {
    assert.match(getDemoAccountEmail(role), /^[^@]+@tajikmusic\.com$/);
  }
});

