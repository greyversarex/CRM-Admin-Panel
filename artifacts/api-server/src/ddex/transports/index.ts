/**
 * Регистрация транспортов и выбор по имени.
 */

import type { ITransport } from "./types";
import { localFsTransport } from "./local-fs";
import { sftpTransport } from "./sftp";
import { s3Transport } from "./s3";

const REGISTRY = new Map<string, ITransport>();
REGISTRY.set("local-fs", localFsTransport);
REGISTRY.set("sftp", sftpTransport);
REGISTRY.set("s3", s3Transport);

export function getTransport(name: string): ITransport {
  const t = REGISTRY.get(name);
  if (!t) throw new Error(`Unknown DDEX transport: ${name} (доступны: ${Array.from(REGISTRY.keys()).join(", ")})`);
  return t;
}

export function listTransports(): string[] {
  return Array.from(REGISTRY.keys());
}

export type { ITransport, TransportContext, TransportFile, UploadResult } from "./types";
