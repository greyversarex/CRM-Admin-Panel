import { test } from "node:test";
import assert from "node:assert/strict";
import { upscaleCoverUrl } from "./cover-url";

const deezer = "https://cdn-images.dzcdn.net/images/cover/0ae60d3db6a1e75f/1000x1000-000000-80-0-0.jpg";

test("поднимает размер обложки Deezer до принимаемого Broma16", () => {
  assert.equal(
    upscaleCoverUrl(deezer),
    "https://cdn-images.dzcdn.net/images/cover/0ae60d3db6a1e75f/1800x1800-000000-80-0-0.jpg",
  );
});

test("не уменьшает уже большую обложку", () => {
  const big = deezer.replace("1000x1000", "1920x1920");
  assert.equal(upscaleCoverUrl(big), big);
});

test("чужие ссылки не трогает", () => {
  const spotify = "https://i.scdn.co/image/ab67616d0000b273abcdef";
  assert.equal(upscaleCoverUrl(spotify), spotify);
});

test("пустое значение остаётся пустым", () => {
  assert.equal(upscaleCoverUrl(null), null);
  assert.equal(upscaleCoverUrl(undefined), null);
});

test("ссылку Deezer без размера в адресе оставляет как есть", () => {
  const odd = "https://cdn-images.dzcdn.net/images/cover/abc/cover.jpg";
  assert.equal(upscaleCoverUrl(odd), odd);
});
