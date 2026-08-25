import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseDistributionType, daysFromToday } from "./distribution-type";

const today = new Date("2026-08-25T12:00:00Z");

test("считает сутки от сегодняшнего дня без оглядки на время", () => {
  assert.equal(daysFromToday("2026-08-25", today), 0);
  assert.equal(daysFromToday("2026-09-01", today), 7);
  assert.equal(daysFromToday("2026-08-20", today), -5);
});

test("новый релиз с запасом в неделю уходит обычной публикацией", () => {
  assert.deepEqual(chooseDistributionType("2026-09-01", false, today), { ok: true, type: "regular" });
});

test("новый релиз через два дня уходит срочной публикацией", () => {
  // Именно этот случай раньше падал: тип не отправлялся, Broma16 считала
  // публикацию обычной и требовала семь дней.
  assert.deepEqual(chooseDistributionType("2026-08-27", false, today), { ok: true, type: "asap" });
});

test("завтрашняя дата у нового релиза отклоняется до отправки", () => {
  const r = chooseDistributionType("2026-08-26", false, today);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /не раньше чем через 2 дня/);
  assert.match(r.ok === false ? r.reason : "", /Перенос каталога/);
});

test("перенос со старой датой уходит как перенос", () => {
  assert.deepEqual(chooseDistributionType("2019-05-17", true, today), { ok: true, type: "transfer" });
  assert.deepEqual(chooseDistributionType("2026-08-23", true, today), { ok: true, type: "transfer" });
});

test("перенос с будущей датой отклоняется: у переноса дата обязана быть в прошлом", () => {
  const r = chooseDistributionType("2026-09-10", true, today);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /не позже 2026-08-23/);
});

test("без даты не гадаем", () => {
  assert.equal(chooseDistributionType(null, false, today).ok, false);
});
