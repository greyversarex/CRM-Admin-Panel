/**
 * Минимальное чтение ZIP-архива средствами Node (без внешних зависимостей).
 *
 * Нужен для отчётов статистики Broma16: она отдаёт не XLSX, а zip с набором
 * недельных CSV внутри. Поддерживаются два метода хранения, которыми пользуются
 * все распространённые архиваторы: 0 (без сжатия) и 8 (deflate).
 *
 * ZIP64 намеренно не поддержан — отчёты весят сотни килобайт.
 */
import { inflateRawSync } from "node:zlib";

export type ZipEntry = { name: string; data: Buffer };

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN_LEN = 22;
/** Максимальный размер комментария архива — дальше искать EOCD бессмысленно. */
const MAX_COMMENT_LEN = 0xffff;

/** Быстрая проверка сигнатуры "PK" в начале файла. */
export function isZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const earliest = Math.max(0, buf.length - EOCD_MIN_LEN - MAX_COMMENT_LEN);
  for (let i = buf.length - EOCD_MIN_LEN; i >= earliest; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * Возвращает содержимое всех файлов архива. Повреждённые или сжатые незнакомым
 * методом записи пропускаются, а не роняют разбор целиком: один битый файл в
 * недельной выгрузке не должен обнулять всю статистику.
 */
export function readZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error("Не найден конец центрального каталога — файл не похож на ZIP");

  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < total; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIG) break;

    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    offset += 46 + nameLen + extraLen + commentLen;

    // Каталоги внутри архива данных не несут.
    if (name.endsWith("/")) continue;
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) continue;

    // Длины полей в локальном заголовке могут отличаться от центрального —
    // читаем именно локальные, иначе съедем на границе данных.
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    try {
      if (method === 0) entries.push({ name, data: Buffer.from(raw) });
      else if (method === 8) entries.push({ name, data: inflateRawSync(raw) });
    } catch {
      /* битую запись пропускаем */
    }
  }

  return entries;
}
