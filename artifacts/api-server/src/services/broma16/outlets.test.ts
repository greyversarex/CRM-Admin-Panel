import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOutletIds, outletNeedsOwnReleaseType, restrictedOutletName } from "./outlets";

// Срез настоящего словаря витрин аккаунта: код везде пустой, а у двух записей
// идентификатор отрицательный — именно так их отдаёт Broma16.
const DICT = [
  { externalId: "6140",   code: null, name: "Spotify" },
  { externalId: "49803",  code: null, name: "Apple Music, iTunes" },
  { externalId: "329",    code: null, name: "Yandex.Music" },
  { externalId: "22025",  code: null, name: "Deezer" },
  { externalId: "1216",   code: null, name: "Beeline Privet, Kiyvstar D-Jingle, Tele2 Gudok " },
  { externalId: "510125", code: null, name: "TikTok (branded as “Dou Yin” in China)" },
  { externalId: "-1",     code: null, name: "TCell Streaming Tajikistan" },
  { externalId: "-2",     code: null, name: "Kyivstar Music Club" },
];

test("возвращается идентификатор, а не название", () => {
  // Из-за пустого code прежняя версия отдавала «Spotify» вместо 6140,
  // и Broma16 получала строку вместо идентификатора витрины.
  assert.deepEqual(pickOutletIds(DICT, ["spotify"]), ["6140"]);
  assert.deepEqual(pickOutletIds(DICT, ["Yandex.Music"]), ["329"]);
  assert.deepEqual(pickOutletIds(DICT, ["22025"]), ["22025"]);
});

test("рингтонные витрины и TikTok в обычную поставку не попадают", () => {
  const got = pickOutletIds(DICT, ["6140", "1216", "510125", "-1", "-2", "22025"]);
  assert.deepEqual(got, ["6140", "22025"]);
});

test("их же можно получить явно — для предупреждения оператору", () => {
  const got = pickOutletIds(DICT, ["6140", "1216", "-2"], { keepRestricted: true });
  assert.deepEqual(got, ["6140", "1216", "-2"]);
});

test("несовпавший ввод даёт пустой список, а не весь словарь", () => {
  // Прежняя ветка «лучше, чем пусто» отправляла все 39 витрин разом, включая
  // рингтонные, и релиз застревал черновиком целиком.
  assert.deepEqual(pickOutletIds(DICT, ["несуществующая витрина"]), []);
});

test("дубликаты схлопываются, регистр не важен", () => {
  assert.deepEqual(pickOutletIds(DICT, ["SPOTIFY", "spotify", "6140"]), ["6140"]);
});

test("ограниченные витрины опознаются по идентификатору", () => {
  assert.equal(outletNeedsOwnReleaseType("1216"), true);
  assert.equal(outletNeedsOwnReleaseType("-1"), true);
  assert.equal(outletNeedsOwnReleaseType("6140"), false);
  assert.equal(restrictedOutletName("2588"), "Megafon Gudok");
  assert.equal(restrictedOutletName("6140"), null);
});
