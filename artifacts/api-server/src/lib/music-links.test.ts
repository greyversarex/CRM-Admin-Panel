import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMusicLink, looksLikeUrl } from "./music-links";

test("разбирает ссылку Deezer на альбом", () => {
  assert.deepEqual(parseMusicLink("https://www.deezer.com/album/998729491"), {
    platform: "deezer", kind: "album", id: "998729491",
  });
});

test("языковой префикс Deezer не мешает", () => {
  assert.deepEqual(parseMusicLink("https://www.deezer.com/en/album/998729491"), {
    platform: "deezer", kind: "album", id: "998729491",
  });
});

test("разбирает ссылку Deezer на трек", () => {
  assert.deepEqual(parseMusicLink("https://deezer.com/track/4065086161"), {
    platform: "deezer", kind: "track", id: "4065086161",
  });
});

test("разбирает ссылку Spotify с intl-префиксом и хвостом ?si=", () => {
  assert.deepEqual(parseMusicLink("https://open.spotify.com/intl-de/album/4m2880jivSbbyEGAKfITCa?si=abc"), {
    platform: "spotify", kind: "album", id: "4m2880jivSbbyEGAKfITCa",
  });
});

test("разбирает URI из десктопного Spotify", () => {
  assert.deepEqual(parseMusicLink("spotify:track:1301WleyT98MSxVHPZCA6M"), {
    platform: "spotify", kind: "track", id: "1301WleyT98MSxVHPZCA6M",
  });
});

test("у Apple ?i= означает трек, а не альбом", () => {
  assert.deepEqual(parseMusicLink("https://music.apple.com/us/album/get-lucky/617154241?i=617154970"), {
    platform: "apple", kind: "track", id: "617154970",
  });
});

test("ссылка Apple без ?i= — альбом", () => {
  assert.deepEqual(parseMusicLink("https://music.apple.com/us/album/random-access-memories/617154241"), {
    platform: "apple", kind: "album", id: "617154241",
  });
});

test("незнакомые и короткие ссылки не разбираются", () => {
  assert.equal(parseMusicLink("https://link.deezer.com/s/30abc"), null);
  assert.equal(parseMusicLink("https://example.com/album/1"), null);
  assert.equal(parseMusicLink(""), null);
  assert.equal(parseMusicLink(null), null);
});

test("UPC ссылкой не считается", () => {
  assert.equal(looksLikeUrl("4741534729345"), false);
  assert.equal(looksLikeUrl("https://deezer.com/album/1"), true);
  assert.equal(looksLikeUrl("deezer.com/album/1"), true);
});
