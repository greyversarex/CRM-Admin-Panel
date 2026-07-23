import assert from "node:assert/strict";
import test from "node:test";
import {
  equivalentUpcValues,
  normalizeUpcInput,
  validateUpc,
} from "./upc";

test("normalizes common UPC presentation separators", () => {
  assert.equal(normalizeUpcInput(" 5063-4545 57181 "), "5063454557181");
});

test("accepts valid EAN-13 and UPC-A codes", () => {
  assert.deepEqual(validateUpc("5063454557181"), {
    ok: true,
    value: "5063454557181",
  });
  assert.deepEqual(validateUpc("036000291452"), {
    ok: true,
    value: "036000291452",
  });
});

test("rejects unsupported lengths, non-digits and invalid check digits", () => {
  assert.deepEqual(validateUpc("123456789"), {
    ok: false,
    code: "invalid_length",
  });
  assert.deepEqual(validateUpc("50634545571X1"), {
    ok: false,
    code: "invalid_format",
  });
  assert.deepEqual(validateUpc("5063454557180"), {
    ok: false,
    code: "invalid_check_digit",
  });
  assert.deepEqual(validateUpc("0000000000000"), {
    ok: false,
    code: "invalid_format",
  });
});

test("treats UPC-A and leading-zero EAN-13 as equivalent", () => {
  assert.deepEqual(
    equivalentUpcValues("036000291452").sort(),
    ["0036000291452", "036000291452"].sort(),
  );
  assert.deepEqual(
    equivalentUpcValues("0036000291452").sort(),
    ["0036000291452", "036000291452"].sort(),
  );
});
