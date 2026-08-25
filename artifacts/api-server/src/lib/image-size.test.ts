import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCover, imageSize } from "./image-size";

/** Минимальный PNG: подпись + чанк IHDR с нужными размерами. */
function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** JPEG: подпись, один пропускаемый сегмент и SOF0 с размерами. */
function jpeg(width: number, height: number): Buffer {
  const parts: number[] = [0xff, 0xd8];
  // APP0 длиной 4 байта — его разбор обязан перешагнуть.
  parts.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00);
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08);
  parts.push((height >> 8) & 0xff, height & 0xff);
  parts.push((width >> 8) & 0xff, width & 0xff);
  parts.push(0x03, 0x01, 0x11, 0x00);
  return Buffer.from(parts);
}

test("читает размеры PNG", () => {
  assert.deepEqual(imageSize(png(3000, 3000)), { width: 3000, height: 3000, format: "png" });
});

test("читает размеры JPEG, перешагивая служебные сегменты", () => {
  assert.deepEqual(imageSize(jpeg(1800, 1800)), { width: 1800, height: 1800, format: "jpeg" });
});

test("чужой формат не выдаёт себя за картинку", () => {
  assert.equal(imageSize(Buffer.from("не картинка вовсе, а текст")), null);
});

test("обрезанный заголовок не приводит к выдуманному ответу", () => {
  assert.equal(imageSize(png(3000, 3000).subarray(0, 12)), null);
});

test("квадрат нужного размера проходит", () => {
  const v = checkCover(jpeg(3000, 3000));
  assert.equal(v.ok, true);
});

test("обложка с Deezer 1000×1000 отклоняется", () => {
  // Ровно тот случай, на котором споткнулся релиз #30.
  const v = checkCover(jpeg(1000, 1000));
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.reason : "", /меньше 1500×1500/);
});

test("прямоугольная обложка отклоняется как не 1:1", () => {
  const v = checkCover(png(2000, 1500));
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.reason : "", /не квадрат/);
});
