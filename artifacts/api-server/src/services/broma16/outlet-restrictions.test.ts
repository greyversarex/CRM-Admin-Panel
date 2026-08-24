import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRestrictedOutlets, outletMatchesFeature } from "./outlet-restrictions";

const dict = [
  { externalId: "6140", name: "Spotify" },
  { externalId: "10", name: "Apple Music / iTunes" },
  { externalId: "20", name: "YouTube Music (Art Track)" },
  { externalId: "30", name: "Deezer" },
  { externalId: "40", name: "Zvuk" },
];
const all = ["6140", "10", "20", "30", "40"];

test("без ограничений список витрин не меняется", () => {
  const r = filterRestrictedOutlets(all, dict, []);
  assert.deepEqual(r.kept, all);
  assert.equal(r.removed.length, 0);
});

test("закрытая площадка выпадает из поставки", () => {
  const r = filterRestrictedOutlets(all, dict, ["dsp:spotify"]);
  assert.ok(!r.kept.includes("6140"));
  assert.deepEqual(r.removed.map((x) => x.name), ["Spotify"]);
});

test("развёрнутые названия из словаря тоже опознаются", () => {
  assert.ok(outletMatchesFeature("Apple Music / iTunes", "dsp:apple"));
  assert.ok(outletMatchesFeature("YouTube Music (Art Track)", "dsp:youtube"));
  assert.ok(!outletMatchesFeature("Zvuk", "dsp:youtube"));
});

test("«остальные площадки» закрывают всё неопознанное, не трогая известные", () => {
  const r = filterRestrictedOutlets(all, dict, ["dsp:other"]);
  assert.deepEqual(r.removed.map((x) => x.name), ["Zvuk"]);
  assert.deepEqual(r.kept, ["6140", "10", "20", "30"]);
});

test("несколько ограничений складываются", () => {
  const r = filterRestrictedOutlets(all, dict, ["dsp:spotify", "dsp:deezer"]);
  assert.deepEqual(r.kept, ["10", "20", "40"]);
});

test("ограничения других видов сюда не вмешиваются", () => {
  const r = filterRestrictedOutlets(all, dict, ["fin:payouts", "app:catalog"]);
  assert.deepEqual(r.kept, all);
});
