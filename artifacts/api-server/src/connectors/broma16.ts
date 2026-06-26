/**
 * Коннектор Broma16 (ROD API) для вкладки интеграций.
 *
 * testConnection делает РЕАЛЬНЫЙ login + запрос account_id — честный
 * end-to-end тест. При отсутствии кред возвращает понятную ошибку
 * (без unverified-заглушек).
 */

import type { IConnector, ConnectorResult } from "./base";
import { createBroma16Client } from "../services/broma16/client";
import { Broma16ConfigError } from "../services/broma16/errors";
import { markIntegrationStatus } from "../services/broma16/credentials";
import { syncAllDictionaries } from "../services/broma16/dictionaries";
import { logger } from "../lib/logger";

export const broma16Connector: IConnector = {
  code: "broma16",
  authType: "api_key",
  async testConnection(): Promise<ConnectorResult> {
    try {
      const client = await createBroma16Client();
      await client.login();
      const accountId = await client.getAccountId();
      await markIntegrationStatus("connected", null);
      return {
        ok: true,
        message: `Broma16 подключён. Account ID: ${accountId}`,
        data: { accountId },
      };
    } catch (e) {
      const message =
        e instanceof Broma16ConfigError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Ошибка подключения к Broma16";
      await markIntegrationStatus("error", message).catch(() => {});
      return { ok: false, message };
    }
  },

  /**
   * Сразу после подключения автоматически тянем справочники Broma16
   * (жанры, языки, типы релизов, витрины, страны) в наш кэш, чтобы они
   * были доступны для выбора витрин и маппинга при отправке релиза —
   * без ручного запуска синхронизации.
   */
  async onConnected(): Promise<void> {
    try {
      const result = await syncAllDictionaries();
      logger.info({ result }, "[broma16] словари синхронизированы (после подключения)");
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e.message : String(e) },
        "[broma16] не удалось синхронизировать словари после подключения",
      );
    }
  },
};
