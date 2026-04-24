import * as fs from "fs";
import { createHash } from "crypto";
import { parse } from "csv-parse";
import { MAX_PARSED_ROWS, TooManyRowsError } from "./utils";

/** Стримит CSV/TSV-файл с диска через async-парсер `csv-parse`.
 * Не держит raw-буфер файла в RAM — fs.createReadStream читает чанками
 * (highWaterMark=64KB) и эмитит уже распарсенные записи в for-await.
 *
 * Возвращает массив записей. Сами записи существенно меньше raw-bytes файла
 * (заголовки колонок дедуплицируются ссылкой), и MAX_PARSED_ROWS=200_000
 * ограничивает максимальное количество — итого RAM-bound predictable.
 *
 * `delimiter` может быть массивом — csv-parse сам auto-detect (нужно для Apple
 * TSV-vs-CSV без peek-логики). */
export async function streamCsvRecords(
  filePath: string,
  delimiter?: string | string[],
): Promise<Record<string, string>[]> {
  const records: Record<string, string>[] = [];
  const input = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  const parser = input.pipe(parse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
    delimiter,
  }));
  try {
    for await (const record of parser as AsyncIterable<Record<string, string>>) {
      records.push(record);
      if (records.length > MAX_PARSED_ROWS) {
        input.destroy();
        parser.destroy();
        throw new TooManyRowsError(records.length);
      }
    }
  } catch (err) {
    input.destroy();
    throw err;
  }
  return records;
}

/** SHA-256 файла потоково — не загружаем целиком в RAM (нужно для idempotency
 * key, чтобы сравнивать одинаковые файлы при загрузке многомегабайтных CSV). */
export async function hashFileStream(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  return new Promise<string>((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/** Best-effort удаление tmp-файла после обработки. Ошибки логируются и
 * проглатываются — мы не должны 5xx из-за невозможности удалить tmp. */
export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    /* ignore */
  }
}
