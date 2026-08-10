import assert from "node:assert/strict";
import test from "node:test";
import { explainBroma16Error } from "./error-hints";

test("объясняет несовпадение названий и сохраняет исходный текст", () => {
  const out = explainBroma16Error("title: does not match");
  assert.match(out, /Название релиза и название трека должны совпадать/);
  assert.match(out, /ответ Broma16: title: does not match/);
});

test("объясняет отказ по размеру обложки", () => {
  const out = explainBroma16Error("file: rule: image_dimensions");
  assert.match(out, /3000×3000/);
  assert.match(out, /file: rule: image_dimensions/);
});

test("незнакомое правило возвращается как есть, без выдуманного объяснения", () => {
  const raw = "quantum_flux: rule: unstable";
  assert.equal(explainBroma16Error(raw), raw);
});

test("пустая ошибка не превращается в текст", () => {
  assert.equal(explainBroma16Error(null), "");
  assert.equal(explainBroma16Error(""), "");
  assert.equal(explainBroma16Error("   "), "");
});

test("частные правила имеют приоритет над общими", () => {
  // «image_dimensions» содержит слово file — не должно попасть в подсказку про формат.
  assert.match(explainBroma16Error("file: rule: image_dimensions"), /3000×3000/);
  // а вот собственно формат — в свою.
  assert.match(explainBroma16Error("file: rule: image_format"), /JPG или PNG, аудио/);
});

test("узнаёт ошибки по кодам и участникам", () => {
  assert.match(explainBroma16Error("isrc: already exists"), /12 символов/);
  assert.match(explainBroma16Error("ean: not unique"), /штрихкодом/);
  assert.match(explainBroma16Error("producer: required"), /продюсер/);
  assert.match(explainBroma16Error("ownership: must be 100"), /100%/);
});
