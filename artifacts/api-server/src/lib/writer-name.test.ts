import assert from "node:assert/strict";
import test from "node:test";
import { checkWriterName } from "./writer-name";

test("имя и фамилия проходят", () => {
  assert.equal(checkWriterName("Austin Post").ok, true);
  assert.equal(checkWriterName("Дилшоди Зоир").ok, true);
  assert.equal(checkWriterName("Qobiljon Zaripov").ok, true);
});

test("одно слово отклоняется с объяснением", () => {
  const r = checkWriterName("Nizomi");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /только одно слово/);
    assert.match(r.reason, /Traditional/);
  }
});

test("пустое имя отклоняется", () => {
  assert.equal(checkWriterName("").ok, false);
  assert.equal(checkWriterName("   ").ok, false);
  assert.equal(checkWriterName(null).ok, false);
});

test("отраслевые обозначения разрешены", () => {
  assert.equal(checkWriterName("Traditional").ok, true);
  assert.equal(checkWriterName("Copyright Control").ok, true);
  assert.equal(checkWriterName("public domain").ok, true);
  assert.equal(checkWriterName("D.P.").ok, true);
});

test("двойные имена через дефис считаются одним словом", () => {
  // «Жан-Клод» — одно слово, фамилии нет.
  assert.equal(checkWriterName("Жан-Клод").ok, false);
  assert.equal(checkWriterName("Жан-Клод Ван Дамм").ok, true);
});

test("лишние пробелы не создают ложных слов", () => {
  assert.equal(checkWriterName("  Rumi  ").ok, false);
  assert.equal(checkWriterName("Sharof   Shakari").ok, true);
});

test("инициалы считаются полноценной частью имени", () => {
  assert.equal(checkWriterName("J. S. Bach").ok, true);
});
