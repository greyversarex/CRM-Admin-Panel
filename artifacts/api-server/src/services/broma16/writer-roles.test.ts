import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Коды ролей авторов закреплены партнёрской спецификацией Broma16
 * (docs/broma16/rod-api.openapi.json, метод .../recording/{id}/composition):
 * A — автор слов, C — автор музыки, CA — автор слов и музыки,
 * AR — аранжировщик, AD — адаптор, TR — переводчик.
 *
 * Проверяем соответствие по исходнику, а не через импорт: release-pusher
 * тянет подключение к базе и в тестах не поднимается.
 */
const SRC = readFileSync(new URL("./release-pusher.ts", import.meta.url), "utf8");
const MAP = SRC.slice(SRC.indexOf("const WRITER_ROLE_MAP"), SRC.indexOf("};", SRC.indexOf("const WRITER_ROLE_MAP")));

test("аранжировщик уходит как AR, а не как автор слов", () => {
  // Было ["A"] — Broma16 получала аранжировщика в роли автора текста.
  assert.match(MAP, /arranger:\s*\["AR"\]/);
});

test("автор слов и музыки уходит одним кодом CA", () => {
  // Было ["C", "A"] — для этого случая в справочнике есть отдельный код.
  assert.match(MAP, /songwriter:\s*\["CA"\]/);
});

test("отдельные роли остаются как были", () => {
  assert.match(MAP, /composer:\s*\["C"\]/);
  assert.match(MAP, /lyricist:\s*\["A"\]/);
});

test("используются только коды из справочника Broma16", () => {
  const codes = [...MAP.matchAll(/"([A-Z]{1,2})"/g)].map((m) => m[1]);
  assert.ok(codes.length > 0, "коды ролей не найдены");
  for (const c of codes) {
    assert.ok(["A", "C", "CA", "AR", "AD", "TR"].includes(c), `неизвестный код роли: ${c}`);
  }
});

test("несуществующего поля ipi в запросе больше нет", () => {
  // В спецификации такого поля нет: идентификаторы авторов передаются через
  // функционал артистов (contributor_author_id), а не строкой IPI.
  assert.ok(!/ipi:\s*w\.caeIpi/.test(SRC), "ipi всё ещё отправляется");
});
