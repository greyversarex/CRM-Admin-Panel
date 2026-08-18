import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupBroma16Status,
  lookupLifecycleStatus,
  isShipped,
  describeBroma16Status,
} from "./moderation-status";

test("вердикт читается из moderation_status", () => {
  assert.equal(lookupBroma16Status("approved")?.verdict, "approved");
  assert.equal(lookupBroma16Status("pending")?.verdict, "pending");
  assert.equal(lookupBroma16Status("rejected")?.verdict, "rejected");
});

test("стадии жизненного цикла не считаются вердиктом модерации", () => {
  // Главное отличие двух наборов: у живого релиза statuses выглядит как
  // ["shipped","approved","ready"], и если пускать эти коды в вердикт, то
  // релиз «на модерации» станет одобренным просто потому, что уже отгружен.
  for (const code of ["shipped", "ready", "not_ready", "active", "takendown"]) {
    assert.equal(lookupBroma16Status(code), null, code);
  }
});

test("те же коды опознаются как стадии", () => {
  assert.equal(lookupLifecycleStatus("shipped")?.label, "отгружено");
  assert.equal(lookupLifecycleStatus("not_ready")?.label, "не готово");
  assert.equal(lookupLifecycleStatus("takedown")?.label, "снято");
  // Вердикты тоже встречаются внутри statuses, поэтому опознаются и там.
  assert.equal(lookupLifecycleStatus("approved")?.verdict, "approved");
});

test("отгрузка определяется по массиву statuses", () => {
  assert.equal(isShipped(["shipped", "approved", "ready"]), true);
  assert.equal(isShipped(["approved", "ready"]), false);
  assert.equal(isShipped([]), false);
  assert.equal(isShipped(null), false);
  assert.equal(isShipped("shipped"), false);
});

test("регистр и пробелы не мешают", () => {
  assert.equal(lookupBroma16Status(" Approved ")?.verdict, "approved");
  assert.equal(lookupLifecycleStatus("DRAFT-VERIFY")?.label, "в обработке");
});

test("неизвестный код не опознаётся", () => {
  assert.equal(lookupBroma16Status("что-то новое"), null);
  assert.equal(lookupLifecycleStatus(""), null);
  assert.equal(lookupBroma16Status(null), null);
});

test("расшифровка читаема, неизвестный код отдаётся как есть", () => {
  assert.equal(describeBroma16Status("shipped"), "shipped — отгружено");
  assert.equal(describeBroma16Status("новый_статус"), "новый_статус");
  assert.equal(describeBroma16Status(null), null);
});
