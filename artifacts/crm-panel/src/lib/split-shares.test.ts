import assert from "node:assert/strict";
import test from "node:test";
import {
  addShareRow,
  redistribute,
  removeShareRow,
  setShare,
  splitEvenly,
  sumShares,
  type ShareRow,
} from "./split-shares";

const row = (percentage: number, locked = false): ShareRow => ({ percentage, locked });
const shares = (rows: ShareRow[]) => rows.map((r) => r.percentage);

test("добавление второго участника делит поровну", () => {
  const start = [row(100)];
  assert.deepEqual(shares(addShareRow(start, row(0))), [50, 50]);
});

test("ручная доля фиксируется, остаток уходит второму", () => {
  const two = addShareRow([row(100)], row(0));
  const after = setShare(two, 0, 70);
  assert.deepEqual(shares(after), [70, 30]);
  assert.deepEqual(after.map((r) => r.locked), [true, false]);
});

test("остаток делится поровну между всеми незафиксированными", () => {
  const three = addShareRow(addShareRow([row(100)], row(0)), row(0));
  const after = setShare(three, 0, 70);
  assert.deepEqual(shares(after), [70, 15, 15]);
});

test("заданное вручную не трогается при правке другой строки", () => {
  // Сценарий из жизни: второму выставили 40 руками, потом меняем первого.
  let rows = [row(50), row(40), row(10)];
  rows = setShare(rows, 1, 40); // второй зафиксирован
  rows = setShare(rows, 0, 60); // первый тоже
  assert.equal(rows[1].percentage, 40, "ручные 40% должны остаться");
  assert.deepEqual(shares(rows), [60, 40, 0]);
});

test("сумма всегда ровно 100 даже при неделимых долях", () => {
  const three = addShareRow(addShareRow([row(100)], row(0)), row(0));
  assert.equal(sumShares(three), 100);
  assert.deepEqual(shares(three), [33.34, 33.33, 33.33]);

  const seven = Array.from({ length: 7 }).reduce<ShareRow[]>(
    (acc) => addShareRow(acc, row(0)),
    [row(100)],
  );
  assert.equal(sumShares(seven), 100);
});

test("перебор по ручным долям обнуляет автоматические, а не уводит в минус", () => {
  let rows = [row(0), row(0)];
  rows = setShare(rows, 0, 80);
  rows = setShare(rows, 1, 40);
  assert.deepEqual(shares(rows), [80, 40]);
  assert.equal(sumShares(rows), 120, "перебор виден в сумме, а не прячется");

  const withAuto = addShareRow(rows, row(0));
  assert.equal(withAuto[2].percentage, 0, "автоматическая доля не может стать отрицательной");
});

test("удаление возвращает долю автоматическим строкам", () => {
  let rows = [row(100)];
  rows = addShareRow(rows, row(0));
  rows = setShare(rows, 0, 70);
  rows = addShareRow(rows, row(0));
  assert.deepEqual(shares(rows), [70, 15, 15]);
  assert.deepEqual(shares(removeShareRow(rows, 2)), [70, 30]);
});

test("удаление среди полностью ручных строк не оставляет сумму меньше 100", () => {
  const rows = [row(60, true), row(30, true), row(10, true)];
  const after = removeShareRow(rows, 2);
  assert.equal(sumShares(after), 100);
});

test("когда все доли заданы вручную, пересчёт ничего не меняет", () => {
  const rows = [row(70, true), row(30, true)];
  assert.deepEqual(shares(redistribute(rows)), [70, 30]);
});

test("разделить поровну снимает все фиксации", () => {
  const rows = [row(70, true), row(20, true), row(10, true)];
  const even = splitEvenly(rows);
  assert.equal(sumShares(even), 100);
  assert.deepEqual(even.map((r) => r.locked), [false, false, false]);
});

test("единственный участник получает всё", () => {
  assert.deepEqual(shares(redistribute([row(0)])), [100]);
});
