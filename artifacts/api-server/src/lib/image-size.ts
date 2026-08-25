/**
 * Размеры картинки из первых байтов файла.
 *
 * Своя реализация вместо библиотеки: нужны всего два формата, которые
 * принимает Broma16 (JPEG и PNG), а тянуть зависимость ради тридцати строк
 * разбора заголовка незачем. Читаем только начало файла — полный кадр
 * разжимать не требуется.
 *
 * Зачем вообще: Broma16 требует обложку не меньше 1500×1500 и строго
 * квадратную. Мы этого не проверяли, и релиз #30 «Qade Belande Dari» уехал с
 * обложкой 1000×1000, притянутой при переносе каталога, — отказ
 * «file: rule: image_dimensions» пришёл после пяти попыток.
 */

export type ImageSize = { width: number; height: number; format: "jpeg" | "png" };

/** Маркеры JPEG, в которых лежат размеры кадра (SOF0…SOF15, кроме DHT/JPG/DAC). */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readPng(buf: Buffer): ImageSize | null {
  // 8 байт подписи, затем длина и тип чанка; IHDR начинается с 16-го байта.
  if (buf.length < 24) return null;
  const signature = buf.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
}

function readJpeg(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) { offset += 1; continue; }
    let marker = buf[offset + 1];
    // Подряд идущие 0xFF — заполнитель, пропускаем.
    let cursor = offset + 1;
    while (marker === 0xff && cursor + 1 < buf.length) {
      cursor += 1;
      marker = buf[cursor];
    }
    if (SOF_MARKERS.has(marker)) {
      // Порядок после маркера: длина (2 байта), точность (1), высота (2),
      // ширина (2). То есть высота начинается через четыре байта от маркера.
      const base = cursor + 4;
      if (base + 3 >= buf.length) return null;
      return { height: buf.readUInt16BE(base), width: buf.readUInt16BE(base + 2), format: "jpeg" };
    }
    const lengthAt = cursor + 1;
    if (lengthAt + 1 >= buf.length) return null;
    const segmentLength = buf.readUInt16BE(lengthAt);
    if (segmentLength < 2) return null;
    offset = lengthAt + segmentLength;
  }
  return null;
}

/** Размеры картинки, либо null — если формат не тот или заголовок обрезан. */
export function imageSize(buf: Buffer): ImageSize | null {
  return readPng(buf) ?? readJpeg(buf);
}

export type CoverVerdict =
  | { ok: true; size: ImageSize }
  | { ok: false; size: ImageSize | null; reason: string };

/** Требования Broma16 к обложке. */
export const COVER_MIN_SIDE = 1500;

/**
 * Годится ли обложка для Broma16.
 *
 * Отдельная функция, а не проверка на месте: тем же правилом пользуются и
 * отчёт готовности, и перенос каталога.
 */
export function checkCover(buf: Buffer): CoverVerdict {
  const size = imageSize(buf);
  if (!size) {
    return { ok: false, size: null, reason: "Не удалось прочитать размеры файла — Broma16 принимает только JPG и PNG." };
  }
  if (size.width !== size.height) {
    return {
      ok: false,
      size,
      reason: `Обложка ${size.width}×${size.height} — не квадрат. Broma16 принимает строго 1:1.`,
    };
  }
  if (size.width < COVER_MIN_SIDE) {
    return {
      ok: false,
      size,
      reason: `Обложка ${size.width}×${size.height} — меньше ${COVER_MIN_SIDE}×${COVER_MIN_SIDE}, Broma16 такую не примет.`,
    };
  }
  return { ok: true, size };
}
