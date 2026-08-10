import assert from "node:assert/strict";
import test from "node:test";
import { describeMixedScript, findMixedScriptWords } from "./mixed-script";

test("находит кириллическую букву внутри латинского слова", () => {
  // Живой случай с прода: «с» здесь кириллическая (U+0441).
  const found = findMixedScriptWords("Oсhai Khushruyum");
  assert.equal(found.length, 1);
  assert.equal(found[0].word, "Oсhai");
  assert.equal(found[0].position, 1);
  assert.deepEqual(found[0].chars, ["с"]);
});

test("чистая латиница и чистая кириллица не считаются смешением", () => {
  assert.deepEqual(findMixedScriptWords("Ochai Khushbuyum"), []);
  assert.deepEqual(findMixedScriptWords("Сари Рох"), []);
});

test("разные алфавиты в разных словах — это нормально", () => {
  // Обычное название: русское имя плюс латинский псевдоним.
  assert.deepEqual(findMixedScriptWords("Дуня feat. DJ Smash"), []);
});

test("нарушителями считаются буквы в меньшинстве", () => {
  const found = findMixedScriptWords("Привеt");
  assert.deepEqual(found[0].chars, ["t"]);
});

test("пустые значения не дают находок", () => {
  assert.deepEqual(findMixedScriptWords(null), []);
  assert.deepEqual(findMixedScriptWords(""), []);
  assert.deepEqual(findMixedScriptWords("   "), []);
  assert.deepEqual(findMixedScriptWords("2026 — 100%"), []);
});

test("сообщение называет слово и подозрительные буквы", () => {
  const msg = describeMixedScript("Название релиза", "Oсhai Khushruyum");
  assert.ok(msg);
  assert.match(msg, /Название релиза/);
  assert.match(msg, /«Oсhai»/);
  assert.match(msg, /«с»/);
  assert.equal(describeMixedScript("Название релиза", "Ochai Khushbuyum"), null);
});
