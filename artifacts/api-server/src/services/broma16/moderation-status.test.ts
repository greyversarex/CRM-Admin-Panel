import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupBroma16Status, describeBroma16Status, BROMA16_STATUSES } from "./moderation-status";

test("отгруженный и активный релиз считаются одобренными", () => {
  // Именно эти два регулярки раньше не ловили — релиз играл в магазинах,
  // а у нас числился ожидающим модерации.
  assert.equal(lookupBroma16Status("shipped")?.verdict, "approved");
  assert.equal(lookupBroma16Status("active")?.verdict, "approved");
});

test("отклонённый, снятый и истёкший считаются отказом", () => {
  assert.equal(lookupBroma16Status("rejected")?.verdict, "rejected");
  assert.equal(lookupBroma16Status("takendown")?.verdict, "rejected");
  assert.equal(lookupBroma16Status("takedown")?.verdict, "rejected");
  assert.equal(lookupBroma16Status("expired")?.verdict, "rejected");
});

test("рабочие стадии остаются ожиданием", () => {
  for (const code of ["draft_processing", "draft_verify", "not_ready", "ready", "verify", "draft", "disputed"]) {
    assert.equal(lookupBroma16Status(code)?.verdict, "pending", code);
  }
});

test("регистр и пробелы не мешают", () => {
  assert.equal(lookupBroma16Status(" Shipped ")?.verdict, "approved");
  assert.equal(lookupBroma16Status("DRAFT-VERIFY")?.verdict, "pending");
});

test("неизвестный код не опознаётся", () => {
  assert.equal(lookupBroma16Status("что-то новое"), null);
  assert.equal(lookupBroma16Status(""), null);
  assert.equal(lookupBroma16Status(null), null);
});

test("расшифровка читаема, неизвестный код отдаётся как есть", () => {
  assert.equal(describeBroma16Status("shipped"), "shipped — отгружено");
  assert.equal(describeBroma16Status("новый_статус"), "новый_статус");
  assert.equal(describeBroma16Status(null), null);
});

test("в справочнике все 13 статусов из документации", () => {
  // takedown — второе написание takendown, поэтому ключей 14.
  assert.equal(Object.keys(BROMA16_STATUSES).length, 14);
});
