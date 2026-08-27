import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseStatusFromBroma } from "./release-status";

test("отказ Broma16 отклоняет релиз, каким бы он у нас ни был", () => {
  assert.equal(releaseStatusFromBroma("approved", "rejected", false), "rejected");
  assert.equal(releaseStatusFromBroma("live", "rejected", true), "rejected");
});

test("отгрузка на площадки переводит релиз в live", () => {
  assert.equal(releaseStatusFromBroma("approved", "approved", true), "live");
  // Отгрузка сильнее вердикта: материал уже играет.
  assert.equal(releaseStatusFromBroma("submitted", "pending", true), "live");
});

test("одобрение без отгрузки не делает релиз живым", () => {
  // Именно здесь была ошибка: одобренный релиз считался вышедшим, хотя до
  // магазинов он ещё едет.
  assert.equal(releaseStatusFromBroma("submitted", "approved", false), "approved");
  assert.equal(releaseStatusFromBroma("rejected", "approved", false), "approved");
});

test("пока Broma16 смотрит, наш статус не трогаем", () => {
  assert.equal(releaseStatusFromBroma("submitted", "pending", false), "submitted");
  assert.equal(releaseStatusFromBroma("rejected", "pending", false), "rejected");
});

test("ручные состояния Broma16 не переписывает", () => {
  // Черновик и архив выставляет человек, и Broma16 про них ничего не знает.
  assert.equal(releaseStatusFromBroma("draft", "approved", false), "draft");
  assert.equal(releaseStatusFromBroma("archived", "approved", false), "archived");
});
