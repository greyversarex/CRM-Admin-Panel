import app from "./app";
import { logger } from "./lib/logger";
import { seedIntegrations } from "./services/integrations-seed";
import { startDeliveryWorker, stopDeliveryWorker } from "./workers/delivery-worker";
import { startAckPoller, stopAckPoller } from "./workers/ack-poller";
import { startFraudEngine, stopFraudEngine } from "./services/fraud-engine";
import { startPaymentAutomation, stopPaymentAutomation } from "./services/payment-automation";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Засеиваем реестр интеграций (не блокируем старт)
  seedIntegrations().catch((e) => logger.error({ err: e }, "seedIntegrations failed"));
  // Стартуем фоновый delivery-воркер (Task #4)
  startDeliveryWorker().catch((e) => logger.error({ err: e }, "startDeliveryWorker failed"));
  // Опциональный ack-poller — включается env-переменной DDEX_ACK_POLLER_ENABLED=1
  startAckPoller().catch((e) => logger.error({ err: e }, "startAckPoller failed"));
  // Fraud-engine: периодически прогоняет fraud_rules → создаёт fraud_alerts
  startFraudEngine();
  // Payment automation scheduler: cron-выражения payment_automation_rules
  startPaymentAutomation();
});

// Graceful shutdown: останавливаем воркер до закрытия HTTP, чтобы дать активному
// тику доехать (иначе job останется в processing и подождёт reset на след. старте).
async function shutdown(signal: string) {
  logger.info({ signal }, "shutdown signal received");
  try {
    await stopDeliveryWorker();
  } catch (e) {
    logger.error({ err: e }, "stopDeliveryWorker failed");
  }
  try {
    await stopAckPoller();
  } catch (e) {
    logger.error({ err: e }, "stopAckPoller failed");
  }
  try { stopFraudEngine(); } catch (e) { logger.error({ err: e }, "stopFraudEngine failed"); }
  try { stopPaymentAutomation(); } catch (e) { logger.error({ err: e }, "stopPaymentAutomation failed"); }
  server.close((err) => {
    if (err) { logger.error({ err }, "server.close error"); process.exit(1); }
    process.exit(0);
  });
  // Hard timeout 10 sec
  setTimeout(() => { logger.warn("shutdown hard-timeout, exiting"); process.exit(1); }, 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
