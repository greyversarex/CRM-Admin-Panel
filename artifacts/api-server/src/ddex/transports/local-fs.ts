/**
 * Local-filesystem транспорт (default, для dev/test).
 *
 * Пишет batch в директорию, заданную в `ctx.config.basePath`
 * (по умолчанию ./.ddex-out). Партнёр в проде это, конечно, заменит на SFTP,
 * но для smoke-тестов и локальной разработки работает без внешних зависимостей.
 *
 * Структура:
 *   {basePath}/{partner_code}/{batchRef}/{file1.xml}, file2.wav, …, BatchComplete_{batchRef}.xml
 */

import path from "node:path";
import fs from "node:fs/promises";
import type { ITransport, TransportContext, TransportFile, UploadResult } from "./types";
import { buildBatchComplete } from "./types";

const DEFAULT_BASE = "./.ddex-out";

export const localFsTransport: ITransport = {
  name: "local-fs",

  async test(ctx) {
    const base = ctx.config.basePath || DEFAULT_BASE;
    try {
      await fs.mkdir(base, { recursive: true });
      const probe = path.join(base, ".probe");
      await fs.writeFile(probe, "ok"); await fs.unlink(probe);
      return { ok: true, message: `Директория ${base} доступна для записи` };
    } catch (e) {
      return { ok: false, message: `Не удалось писать в ${base}: ${(e as Error).message}` };
    }
  },

  async upload(ctx, batchRef, files): Promise<UploadResult> {
    const base = ctx.config.basePath || DEFAULT_BASE;
    const partner = ctx.config.partnerCode || "default";
    const partyIdSender = ctx.config.partyIdSender || "PADPIDA-UNKNOWN";
    const partyIdRecipient = ctx.config.partyIdRecipient || "PADPIDA-UNKNOWN";
    const remoteDir = path.join(base, partner, batchRef);
    await fs.mkdir(remoteDir, { recursive: true });

    let totalBytes = 0;
    const written: string[] = [];
    for (const f of files) {
      const dest = path.join(remoteDir, f.filename);
      // Создаём подкаталоги если filename содержит /
      await fs.mkdir(path.dirname(dest), { recursive: true });
      if (f.content.type === "buffer") {
        await fs.writeFile(dest, f.content.data);
        totalBytes += f.content.data.length;
      } else {
        // Если local-путь не существует (например в dev нет реального файла),
        // создаём заглушку с пометкой — это даёт оператору смотреть структуру пакета
        // даже без реального ассета.
        try {
          await fs.copyFile(f.content.localPath, dest);
          const st = await fs.stat(dest);
          totalBytes += st.size;
        } catch {
          const stub = Buffer.from(`[STUB] missing source: ${f.content.localPath}`, "utf8");
          await fs.writeFile(dest, stub);
          totalBytes += stub.length;
        }
      }
      written.push(f.filename);
    }

    // BatchComplete пишем последним — DDEX-конвенция «пакет готов».
    const manifestName = `BatchComplete_${batchRef}.xml`;
    const manifestXml = buildBatchComplete(batchRef, written, partyIdSender, partyIdRecipient);
    await fs.writeFile(path.join(remoteDir, manifestName), manifestXml, "utf8");
    totalBytes += Buffer.byteLength(manifestXml, "utf8");

    return {
      ok: true,
      remotePath: remoteDir,
      totalBytes,
      fileCount: written.length + 1,
      manifestFilename: manifestName,
      message: `Сохранено в ${remoteDir} (${written.length + 1} файл(ов), ${totalBytes} байт)`,
      uploadedFiles: [...written, manifestName],
    };
  },

  async pollAcks(ctx) {
    // Ack-эмулятор: читаем партнёрский /outbox/ из локальной ФС.
    const base = ctx.config.basePath || DEFAULT_BASE;
    const partner = ctx.config.partnerCode || "default";
    const outbox = path.join(base, partner, "_outbox");
    const out: Array<{ filename: string; body: string }> = [];
    try {
      const list = await fs.readdir(outbox);
      for (const name of list) {
        if (!name.endsWith(".xml")) continue;
        const full = path.join(outbox, name);
        const body = await fs.readFile(full, "utf8");
        out.push({ filename: name, body });
        await fs.unlink(full); // забрали — удалили
      }
    } catch {
      // outbox не существует — это норма
    }
    return out;
  },
};
