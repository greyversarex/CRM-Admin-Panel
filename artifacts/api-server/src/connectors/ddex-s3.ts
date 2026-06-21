/**
 * Универсальный DDEX S3-коннектор.
 *
 * Для партнёров, которые принимают DDEX-поставки через S3-бакет (а не SFTP).
 * В частности — ACRCloud (direct partnership): бакет партнёра, регион us-east-1,
 * префикс TajikMusic/. Реальная отгрузка релиза идёт через
 * ddex/transports/s3.ts (вызывается delivery-worker'ом). Здесь — только
 * проверка соединения (testConnection) для мастера настройки интеграции.
 *
 * Config: transport=s3, bucket, region, prefix (+ partyIdSender/Recipient)
 * Credentials (AES-GCM): access_key_id, secret_access_key
 */

import type { IConnector, ConnectorContext, ConnectorResult } from "./base";
import { s3Transport } from "../ddex/transports/s3";
import { getEffectiveIntegrationConfig } from "../ddex/service";

export function createDdexS3Connector(code: string): IConnector {
  return {
    code,
    authType: "api_key",

    async testConnection(ctx: ConnectorContext): Promise<ConnectorResult> {
      // Накладываем config из БД на код-дефолты партнёра (bucket/region/prefix
      // для ACRCloud зашиты в коде), чтобы тест проходил, когда оператор ввёл
      // только Access Key ID и Secret Access Key.
      const cfg = getEffectiveIntegrationConfig(code, ctx.config);
      const transport = cfg.transport || "s3";
      if (transport === "local-fs") {
        return { ok: true, message: "Транспорт local-fs — файлы пишутся в локальную директорию api-server (.ddex-out). Соединение не требуется." };
      }
      const r = await s3Transport.test({ config: cfg, credentials: ctx.credentials });
      return { ok: r.ok, message: r.message };
    },
  };
}
