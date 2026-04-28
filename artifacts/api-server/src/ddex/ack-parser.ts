/**
 * Парсер DDEX-ack сообщений. Поддерживает:
 *   - DDEX MessageAcknowledgement (стандартный)
 *   - FtpAcknowledgementMessage (тоже стандарт, для подтверждения batch)
 *   - Простой партнёрский XML с тегами Status/MessageRef
 *
 * Возвращает структуру для записи в `ddex_acknowledgements` и обновления статуса
 * `ddex_messages.status` (acked / rejected).
 */

import { XMLParser } from "fast-xml-parser";

export type ParsedAck = {
  source: "webhook" | "sftp-poll" | "manual";
  ackType: "MessageAcknowledgement" | "FileAccepted" | "FileRejected" | "DealAcknowledged" | "Custom";
  status: "accepted" | "rejected" | "warning";
  /** Ссылка на наше сообщение или batch — то, что прислал партнёр в качестве ID */
  messageRef?: string;
  batchRef?: string;
  /** Идентификатор треда сообщений (для связки, если RelatedMessageId не нашли) */
  messageThreadId?: string;
  rejectionReason?: string;
  parsed: Record<string, unknown>;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
});

export function parseAck(raw: string, source: ParsedAck["source"] = "webhook"): ParsedAck {
  let xml: Record<string, unknown>;
  try {
    xml = parser.parse(raw);
  } catch (e) {
    return {
      source, ackType: "Custom", status: "rejected",
      rejectionReason: `Не XML: ${(e as Error).message}`,
      parsed: { rawBytes: raw.length },
    };
  }

  // Найти корневой элемент (без префикса)
  const rootKey = Object.keys(xml).find((k) => k !== "?xml") ?? "";
  const root = (xml[rootKey] ?? {}) as Record<string, unknown>;

  // ── 1. Полноценный MessageAcknowledgement ───────────────────────────
  if (rootKey === "MessageAcknowledgement" || rootKey === "NewReleaseMessageAcknowledgement") {
    const header = (root.MessageHeader ?? {}) as Record<string, unknown>;
    const ackMessageId = header.MessageId as string | undefined;
    const inResponseTo = (header.MessageInResponseTo ?? header.OriginalMessageId) as string | undefined;

    // DDEX 4.x: AcknowledgementOfReleaseMessage / AcknowledgementOfFileMessage / AcknowledgementOfDealMessage
    // Старые форматы: AcknowledgementMessage / Acknowledgement
    const ackBlockKey = Object.keys(root).find((k) => k.startsWith("AcknowledgementOf")) ?? "";
    const ackBlock = (
      (ackBlockKey ? root[ackBlockKey] : null) ?? root.AcknowledgementMessage ?? root.Acknowledgement ?? {}
    ) as Record<string, unknown>;

    const relatedMessageId = (
      ackBlock.RelatedMessageId
        ?? ackBlock.RelatedMessage
        ?? ackBlock.OriginalMessageId
        ?? inResponseTo
    ) as string | undefined;
    const messageThreadId = ackBlock.MessageThreadId as string | undefined;

    const rawStatus = String(
      ackBlock.MessageStatus ?? ackBlock.Status ?? ackBlock.AcknowledgementStatus ?? "Acknowledged",
    ).toLowerCase();
    const isReject = rawStatus.includes("reject") || rawStatus.includes("error") || rawStatus.includes("fail");
    const isWarning = !isReject && (rawStatus.includes("warn") || rawStatus.includes("partial"));

    const reason = (
      ackBlock.MessageStatusDescription
        ?? ackBlock.StatusReason
        ?? ackBlock.RejectionReason
        ?? ackBlock.ErrorMessage
    ) as string | undefined;

    return {
      source,
      ackType: "MessageAcknowledgement",
      status: isReject ? "rejected" : isWarning ? "warning" : "accepted",
      messageRef: relatedMessageId ?? ackMessageId,
      messageThreadId,
      rejectionReason: isReject ? reason : undefined,
      parsed: { header, ackBlock, ackBlockKey },
    };
  }

  // ── 2. FtpAcknowledgement (для batch'ей) ───────────────────────────
  if (rootKey === "FtpAcknowledgementMessage" || rootKey === "FtpAcknowledgement") {
    const batchInfo = (root.BatchInformation ?? root.BatchAcknowledgement ?? {}) as Record<string, unknown>;
    const batchRef = batchInfo.BatchId as string | undefined;
    const status = String(batchInfo.Status ?? "Accepted").toLowerCase();
    const isReject = status.includes("reject") || status.includes("error");
    return {
      source,
      ackType: isReject ? "FileRejected" : "FileAccepted",
      status: isReject ? "rejected" : "accepted",
      batchRef,
      rejectionReason: isReject ? (batchInfo.RejectionReason as string) ?? undefined : undefined,
      parsed: { batchInfo },
    };
  }

  // ── 3. Партнёрский кастомный формат ─────────────────────────────────
  const messageRef = (root.MessageRef ?? root.MessageId ?? root.OriginalMessageId) as string | undefined;
  const batchRef = (root.BatchRef ?? root.BatchId) as string | undefined;
  const status = String(root.Status ?? root.Result ?? "Accepted").toLowerCase();
  const isReject = status.includes("reject") || status.includes("error") || status.includes("fail");
  return {
    source,
    ackType: "Custom",
    status: isReject ? "rejected" : "accepted",
    messageRef,
    batchRef,
    rejectionReason: isReject ? (root.Reason as string) ?? (root.ErrorMessage as string) ?? undefined : undefined,
    parsed: root,
  };
}
