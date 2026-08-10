import assert from "node:assert/strict";
import test from "node:test";
import { pickGenreCanon, type GenreDictEntry } from "./genre-match";

/**
 * Выборка из живого справочника Broma16 (283 записи) — те, что участвуют в
 * сопоставлении наших жанров. Порядок как в справочнике: по алфавиту, поэтому
 * «Acoustic Pop» идёт раньше «Pop» — именно на этом ломался прежний поиск.
 */
const DICT: GenreDictEntry[] = [
  { externalId: "292", code: "Acoustic Pop", name: "Acoustic Pop" },
  { externalId: "3", code: "Dance", name: "Dance" },
  { externalId: "283", code: "Electric Folk", name: "Electric Folk" },
  { externalId: "226", code: "Electro", name: "Electro" },
  { externalId: "5", code: "Electronica", name: "Electronica" },
  { externalId: "85", code: "Folk", name: "Folk" },
  { externalId: "119", code: "Folklore", name: "Folklore" },
  { externalId: "16", code: "Hip-Hop", name: "Hip-Hop" },
  { externalId: "87", code: "National Folk", name: "National Folk" },
  { externalId: "1", code: "Pop", name: "Pop" },
  { externalId: "58", code: "Pop-Folk", name: "Pop-Folk" },
  { externalId: "23", code: "Rap", name: "Rap" },
  { externalId: "151", code: "SynthPop", name: "SynthPop" },
  { externalId: "252", code: "TRADITIONAL", name: "TRADITIONAL" },
  { externalId: "192", code: "World", name: "World" },
  { externalId: "8", code: "Ethnic", name: "Ethnic" },
];

test("точное совпадение остаётся точным", () => {
  assert.equal(pickGenreCanon(DICT, "Pop"), "Pop");
  assert.equal(pickGenreCanon(DICT, "folk"), "Folk");
  assert.equal(pickGenreCanon(DICT, "Hip-Hop"), "Hip-Hop");
});

test("разделители не мешают: «Synth Pop» находит SynthPop", () => {
  assert.equal(pickGenreCanon(DICT, "Synth Pop"), "SynthPop");
  assert.equal(pickGenreCanon(DICT, "Pop Folk"), "Pop-Folk");
});

test("составное через слэш берёт первую известную часть", () => {
  assert.equal(pickGenreCanon(DICT, "Hip-Hop / Rap"), "Hip-Hop");
});

test("приставка происхождения отбрасывается", () => {
  // Раньше «Tajik Pop» превращался в «Acoustic Pop», а «Tajik Folk» — в «Electric Folk».
  assert.equal(pickGenreCanon(DICT, "Tajik Pop"), "Pop");
  assert.equal(pickGenreCanon(DICT, "Tajik Folk"), "Folk");
  assert.equal(pickGenreCanon(DICT, "Uzbek Pop"), "Pop");
});

test("наше название как начало жанра словаря", () => {
  assert.equal(pickGenreCanon(DICT, "Electronic"), "Electronica");
});

test("жанр словаря как начало нашего названия", () => {
  assert.equal(pickGenreCanon(DICT, "Dance Pop"), "Dance");
  assert.equal(pickGenreCanon(DICT, "World Music"), "World");
});

test("уточняющее слово впереди отбрасывается в пользу основного жанра", () => {
  // «Traditional World» — разновидность мировой музыки, а не наоборот,
  // поэтому основной жанр здесь World, а не TRADITIONAL.
  assert.equal(pickGenreCanon(DICT, "Traditional World"), "World");
  assert.equal(pickGenreCanon(DICT, "World Folk"), "Folk");
});

test("незнакомое уходит в World, а не в случайный жанр", () => {
  assert.equal(pickGenreCanon(DICT, "Central Asian"), "World");
  assert.equal(pickGenreCanon(DICT, "Совершенно неизвестное"), "World");
});

test("локальные жанры идут на осмысленный эквивалент", () => {
  const withClassical = [...DICT, { externalId: "39", code: "Classical", name: "Classical" }];
  // Шашмаком — классическая традиция, а не просто «мировая музыка».
  assert.equal(pickGenreCanon(withClassical, "Шашмаком"), "Classical");
  assert.equal(pickGenreCanon(withClassical, "shashmaqom"), "Classical");
  assert.equal(pickGenreCanon(DICT, "Фалак"), "Folk");
  assert.equal(pickGenreCanon(DICT, "дутар"), "Folk");
  assert.equal(pickGenreCanon(DICT, "ethnic"), "Ethnic");
});

test("пустые значения и пустой словарь", () => {
  assert.equal(pickGenreCanon(DICT, ""), null);
  assert.equal(pickGenreCanon(DICT, "   "), null);
  assert.equal(pickGenreCanon([], "Pop"), null);
});

test("без World в словаре возвращается null, а не выдуманный жанр", () => {
  const noWorld = DICT.filter((d) => d.name !== "World" && d.name !== "Ethnic");
  assert.equal(pickGenreCanon(noWorld, "Совсем незнакомый жанр"), null);
});
