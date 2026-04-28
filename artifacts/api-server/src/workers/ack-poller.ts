/**
 * Ack-poller — раз в N минут перебирает все интеграции с настроенным DDEX-транспортом
 * и пробует pollAcks() (читает партнёрский /outbox/ через SFTP / локальный _outbox).
 *
 * Включается опционально через env `DDEX_ACK_POLLER_ENABLED=1`.
 * По умолчанию выключен — в проде партнёры обычно используют webhook (POST на
 * `/api/ddex/acknowledgements/inbound`).
 */

import { db, integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getTransport } from "../ddex/transports";
import { loadCredentials } from "../services/integrations-service";
import { ingestAck } from "../ddex/service";

const DEFAULT_INTERVAL_MS = 5 * 60_000;
let timer: NodeJS.Timeout | null = null;
let stopping = false;
let inFlight: Promise<void> | null = null;

async function pollOnePartner(integration: typeof integrationsTable.$inferSelect): Promise<void> {
  const cfg = (integration.config ?? {}) as Record<string, string>;
  const transportName = cfg.transport;
  if (!transportName) return; // не DDEX-доставка

  let transport;
  try { transport = getTransport(transportName); } catch { return; }
  if (!transport.pollAcks) return;

  const credentials = await loadCredentials(integration.id);
  const ctx = {
    config: { ...cfg, partnerCode: integration.code },
    credentials,
  };
  try {
    const acks = await transport.pollAcks(ctx);
    for (const a of acks) {
      try {
        const r = await ingestAck(a.body, "sftp-poll", integration.code);
        logger.info({ partner: integration.code, file: a.filename, ackId: r.ackId, status: r.status }, "ack-poll ingested");
      } catch (err) {
        logger.warn({ partner: integration.code, file: a.filename, err: (err as Error).message }, "ack-poll ingest failed");
      }
    }
  } catch (err) {
    logger.warn({ partner: integration.code, err: (err as Error).message }, "ack-poll failed");
  }
}

async function pollAllPartners(): Promise<void> {
  const integrations = await db.select().from(integrationsTable).where(eq(integrationsTable.enabled, true));
  for (const i of integrations) {
    if (stopping) break;
    await pollOnePartner(i);
  }
}

export async function startAckPoller(): Promise<void> {
  if (process.env.DDEX_ACK_POLLER_ENABLED !== "1") {
    logger.info("ack poller отключён (DDEX_ACK_POLLER_ENABLED != 1)");
    return;
  }
  const intervalMs = parseInt(process.env.DDEX_ACK_POLL_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`, 10);
  const tick = () => {
    if (stopping || inFlight) return;
    inFlight = pollAllPartners().catch((err) => {
      logger.error({ err }, "ack poller tick failed");
    }).finally(() => { inFlight = null; });
  };
  timer = setInterval(tick, intervalMs);
  logger.info({ intervalMs }, "ack poller started");
  tick();
}

export async function stopAckPoller(): Promise<void> {
  stopping = true;
  if (timer) { clearInterval(timer); timer = null; }
  if (inFlight) await inFlight;
  logger.info("ack poller stopped");
}
