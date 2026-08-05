import assert from "node:assert/strict";
import test from "node:test";
import { pickBromaDuplicate } from "./catalog-match";

/** Форма записи из GET /accounts/{id}/assets?type=releases. */
const rel = (over: Record<string, unknown> = {}) => ({
  id: 17810070,
  title: "Dar Talabi Didani Tu",
  performers: ["Yasmina"],
  ean: "4741534859516",
  moderation_status: "approved",
  statuses: ["shipped", "approved", "ready"],
  release_type_id: 51,
  ...over,
}) as Parameters<typeof pickBromaDuplicate>[0][number];

test("совпадение по UPC ловится независимо от названия", () => {
  const found = pickBromaDuplicate([rel()], {
    upc: "4741534859516",
    title: "Совсем другое название",
    performer: "Кто-то ещё",
  });
  assert.equal(found?.matchedBy, "upc");
  assert.equal(found?.id, 17810070);
});

test("другой UPC при другом названии — не дубль", () => {
  assert.equal(
    pickBromaDuplicate([rel()], { upc: "4741534000000", title: "Bahor", performer: "Shirin" }),
    null,
  );
});

test("совпадение по названию и исполнителю ловится без UPC", () => {
  const found = pickBromaDuplicate([rel()], {
    upc: null,
    title: "dar talabi  didani tu",
    performer: "YASMINA",
  });
  assert.equal(found?.matchedBy, "title");
});

test("совпадение по названию требует того же исполнителя", () => {
  assert.equal(
    pickBromaDuplicate([rel()], { upc: null, title: "Dar Talabi Didani Tu", performer: "Shirin" }),
    null,
  );
});

test("черновик с тем же названием отправку не блокирует", () => {
  const draft = rel({ moderation_status: "draft", statuses: ["draft"] });
  assert.equal(
    pickBromaDuplicate([draft], { upc: null, title: "Dar Talabi Didani Tu", performer: "Yasmina" }),
    null,
  );
  // но точный UPC блокирует даже черновик — штрихкод занят
  assert.equal(
    pickBromaDuplicate([draft], { upc: "4741534859516", title: "X", performer: "Y" })?.matchedBy,
    "upc",
  );
});

test("исполнитель берётся первым из списка через точку с запятой", () => {
  const pair = rel({ performers: ["Qobiljon Zaripov; Komiljon Zaripov"], title: "Arusi", ean: "" });
  const found = pickBromaDuplicate([pair], { upc: null, title: "Arusi", performer: "Qobiljon Zaripov" });
  assert.equal(found?.matchedBy, "title");
});

test("без исполнителя совпадение по одному названию не засчитывается", () => {
  assert.equal(
    pickBromaDuplicate([rel()], { upc: null, title: "Dar Talabi Didani Tu", performer: null }),
    null,
  );
});

test("пустой UPC в каталоге не совпадает с пустым UPC у нас", () => {
  assert.equal(
    pickBromaDuplicate([rel({ ean: "" })], { upc: "", title: "Другое", performer: "Другой" }),
    null,
  );
});
