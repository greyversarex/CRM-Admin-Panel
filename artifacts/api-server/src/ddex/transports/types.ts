/**
 * Общий интерфейс транспорта DDEX-доставки.
 *
 * Реализации:
 *   - local-fs : пишет файлы в локальную директорию (dev/test, default)
 *   - sftp     : ssh2-sftp-client
 *   - https    : POST на партнёрский endpoint (опционально, для будущего)
 *
 * Все реализации имплементят upload(batchRef, files) → возвращают remotePath.
 */

import type { ResourceFile } from "../types";

export type TransportFile = {
  /** имя в пакете (как лежит на партнёре) */
  filename: string;
  /** содержимое: либо локальный путь, либо буфер */
  content: { type: "path"; localPath: string } | { type: "buffer"; data: Buffer };
};

export type UploadResult = {
  ok: boolean;
  remotePath: string;
  totalBytes: number;
  fileCount: number;
  manifestFilename: string;
  message?: string;
  uploadedFiles: string[];
};

export type TransportContext = {
  /** Куда грузим (для SFTP host/port/user, для local-fs — базовая директория) */
  config: Record<string, string>;
  /** Дешифрованные креды (passwords/keys) */
  credentials: Record<string, string>;
};

export interface ITransport {
  readonly name: "local-fs" | "sftp" | "https";
  /**
   * Тестовое подключение (для UI «Проверить»).
   * @returns ok=true если транспорт доступен.
   */
  test(ctx: TransportContext): Promise<{ ok: boolean; message?: string }>;
  /**
   * Залить пакет файлов одной партией. Партнёру отправляется
   * BatchComplete_<batchRef>.xml последним — это сигнал «можно забирать».
   */
  upload(ctx: TransportContext, batchRef: string, files: TransportFile[]): Promise<UploadResult>;
  /**
   * (опционально) забрать ack-файлы из /outbox/. Возвращает массив
   * (filename, body), сразу удаляет с партнёра — иначе будет заборка по кругу.
   */
  pollAcks?(ctx: TransportContext): Promise<Array<{ filename: string; body: string }>>;
}

/** Утилита: построить ResourceFile из storage-key. Используется сервисом перед upload. */
export type ResourceResolver = (storageKey: string) => Promise<{ localPath: string; sizeBytes: number; sha1?: string }>;

/** Сборка манифеста BatchComplete_<batchRef>.xml — DDEX standard. */
export function buildBatchComplete(batchRef: string, fileNames: string[], partyIdSender: string, partyIdRecipient: string): string {
  const now = new Date().toISOString();
  const items = fileNames.map((f) => `    <FileName>${escapeXml(f)}</FileName>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ftp:FtpAcknowledgementMessage xmlns:ftp="http://ddex.net/xml/ftp/41" MessageSchemaVersionId="ftp/41">
  <MessageHeader>
    <MessageId>BC-${batchRef}</MessageId>
    <MessageSender><PartyId>${escapeXml(partyIdSender)}</PartyId></MessageSender>
    <MessageRecipient><PartyId>${escapeXml(partyIdRecipient)}</PartyId></MessageRecipient>
    <MessageCreatedDateTime>${now}</MessageCreatedDateTime>
  </MessageHeader>
  <BatchInformation>
    <BatchId>${escapeXml(batchRef)}</BatchId>
    <NumberOfFiles>${fileNames.length}</NumberOfFiles>
${items}
  </BatchInformation>
</ftp:FtpAcknowledgementMessage>
`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/** Резюме о файле — нужно для подсчёта totalBytes без лишних readFile. */
export async function fileSize(file: TransportFile): Promise<number> {
  if (file.content.type === "buffer") return file.content.data.length;
  const fs = await import("node:fs/promises");
  const stat = await fs.stat(file.content.localPath);
  return stat.size;
}

export type { ResourceFile };
