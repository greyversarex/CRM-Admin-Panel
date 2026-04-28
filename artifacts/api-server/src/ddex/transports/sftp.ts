/**
 * SFTP-транспорт через ssh2-sftp-client. В проде партнёры используют этот.
 *
 * Required ctx.config: host, port, username, remotePath
 * Required ctx.credentials: password OR private_key (опционально passphrase)
 */

import path from "node:path";
import type { ITransport, TransportContext, TransportFile, UploadResult } from "./types";
import { buildBatchComplete } from "./types";

export const sftpTransport: ITransport = {
  name: "sftp",

  async test(ctx) {
    const cfg = parseSftpConfig(ctx);
    if ("error" in cfg) return { ok: false, message: cfg.error };
    const Client = (await import("ssh2-sftp-client")).default;
    const sftp = new Client();
    try {
      await sftp.connect(cfg.connect);
      const exists = await sftp.exists(cfg.remoteBase);
      await sftp.end();
      return { ok: true, message: `Подключение успешно. Директория ${cfg.remoteBase}: ${exists ? "существует" : "создадим при upload"}` };
    } catch (e) {
      try { await sftp.end(); } catch { /* noop */ }
      return { ok: false, message: `SFTP error: ${(e as Error).message}` };
    }
  },

  async upload(ctx, batchRef, files): Promise<UploadResult> {
    const cfg = parseSftpConfig(ctx);
    if ("error" in cfg) throw new Error(cfg.error);
    const partyIdSender = ctx.config.partyIdSender || "PADPIDA-UNKNOWN";
    const partyIdRecipient = ctx.config.partyIdRecipient || "PADPIDA-UNKNOWN";

    const Client = (await import("ssh2-sftp-client")).default;
    const sftp = new Client();
    let totalBytes = 0;
    const written: string[] = [];
    let manifestName = `BatchComplete_${batchRef}.xml`;
    let remoteDir = "";
    try {
      await sftp.connect(cfg.connect);
      remoteDir = path.posix.join(cfg.remoteBase, batchRef);
      await sftp.mkdir(remoteDir, true);

      for (const f of files) {
        const remoteFile = path.posix.join(remoteDir, f.filename);
        // Нестрогий mkdir под подпапки внутри пакета (если filename содержит /)
        if (f.filename.includes("/")) {
          await sftp.mkdir(path.posix.dirname(remoteFile), true);
        }
        if (f.content.type === "buffer") {
          await sftp.put(f.content.data, remoteFile);
          totalBytes += f.content.data.length;
        } else {
          await sftp.fastPut(f.content.localPath, remoteFile);
          // size берём через stat
          const st = await sftp.stat(remoteFile);
          totalBytes += st.size;
        }
        written.push(f.filename);
      }
      // BatchComplete последним — сигнал партнёру.
      const manifestXml = buildBatchComplete(batchRef, written, partyIdSender, partyIdRecipient);
      await sftp.put(Buffer.from(manifestXml, "utf8"), path.posix.join(remoteDir, manifestName));
      totalBytes += Buffer.byteLength(manifestXml, "utf8");
    } finally {
      try { await sftp.end(); } catch { /* noop */ }
    }

    return {
      ok: true,
      remotePath: remoteDir,
      totalBytes,
      fileCount: written.length + 1,
      manifestFilename: manifestName,
      uploadedFiles: [...written, manifestName],
    };
  },

  async pollAcks(ctx) {
    const cfg = parseSftpConfig(ctx);
    if ("error" in cfg) return [];
    const Client = (await import("ssh2-sftp-client")).default;
    const sftp = new Client();
    const out: Array<{ filename: string; body: string }> = [];
    try {
      await sftp.connect(cfg.connect);
      const outbox = ctx.config.outboxPath || path.posix.join(cfg.remoteBase, "..", "outbox");
      const list = (await sftp.list(outbox).catch(() => [])) as Array<{ name: string; type: string }>;
      for (const entry of list) {
        if (entry.type !== "-" || !entry.name.toLowerCase().endsWith(".xml")) continue;
        const remoteFile = path.posix.join(outbox, entry.name);
        const buf = (await sftp.get(remoteFile)) as Buffer;
        out.push({ filename: entry.name, body: buf.toString("utf8") });
        await sftp.delete(remoteFile);
      }
    } catch {
      // outbox недоступен — норма
    } finally {
      try { await sftp.end(); } catch { /* noop */ }
    }
    return out;
  },
};

function parseSftpConfig(ctx: TransportContext):
  | { connect: { host: string; port: number; username: string; password?: string; privateKey?: string | Buffer; passphrase?: string }; remoteBase: string }
  | { error: string } {
  const host = ctx.config.host;
  const username = ctx.config.username || ctx.credentials.username;
  const port = parseInt(ctx.config.port || "22", 10);
  const remoteBase = ctx.config.remotePath || "/incoming";
  if (!host) return { error: "В config отсутствует host" };
  if (!username) return { error: "В credentials/config отсутствует username" };

  const password = ctx.credentials.password;
  const privateKey = ctx.credentials.private_key || ctx.credentials.ssh_private_key;
  const passphrase = ctx.credentials.passphrase;
  if (!password && !privateKey) return { error: "Нужен password или private_key" };

  return {
    connect: {
      host, port, username,
      ...(password ? { password } : {}),
      ...(privateKey ? { privateKey } : {}),
      ...(passphrase ? { passphrase } : {}),
    },
    remoteBase,
  };
}
