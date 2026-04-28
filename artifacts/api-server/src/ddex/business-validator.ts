/**
 * Бизнес-валидатор перед отправкой в ERN-builder. Ловит ошибки, которые XSD
 * не поймает (UPC формат, splits=100%, наличие audio assets и т.д.).
 *
 * Возвращает массив ошибок — пустой = всё ОК.
 */

import type { ReleaseContext, PartnerContext, DealConfig } from "./types";

export type ValidationError = {
  code: string;            // "UPC_INVALID" | "ISRC_MISSING" | …
  field?: string;
  message: string;
};

const UPC_REGEX = /^\d{12,13}$/;        // EAN-13 / UPC-A
const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;
const PARTY_ID_REGEX = /^P[AD][D-]?[A-Z0-9-]+$/i;  // PADPIDA / PA-DPIDA — оба варианта в природе

export function validateBusinessRules(
  release: ReleaseContext,
  partner: PartnerContext,
  deal: DealConfig,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Release-level ──────────────────────────────────────────────────
  if (!release.upc) {
    errors.push({ code: "UPC_MISSING", field: "release.upc", message: "У релиза не заполнен UPC/ICPN" });
  } else if (!UPC_REGEX.test(release.upc)) {
    errors.push({ code: "UPC_INVALID", field: "release.upc", message: `UPC «${release.upc}» не похож на EAN-13/UPC-A (12-13 цифр)` });
  }
  if (!release.title?.trim()) errors.push({ code: "TITLE_MISSING", field: "release.title", message: "Не заполнено название релиза" });
  if (!release.releaseDate) errors.push({ code: "DATE_MISSING", field: "release.releaseDate", message: "Не заполнена дата релиза" });
  if (!release.mainArtist?.fullName) errors.push({ code: "MAIN_ARTIST_MISSING", field: "release.mainArtist", message: "Не указан главный артист" });
  if (!release.cover) errors.push({ code: "COVER_MISSING", field: "release.cover", message: "Не загружена обложка релиза" });

  // ── Tracks ──────────────────────────────────────────────────────────
  if (release.tracks.length === 0) {
    errors.push({ code: "TRACKS_EMPTY", field: "tracks", message: "В релизе нет ни одного трека" });
  }
  const isrcSet = new Set<string>();
  for (const t of release.tracks) {
    if (!t.isrc) {
      errors.push({ code: "ISRC_MISSING", field: `track.${t.trackId}.isrc`, message: `У трека «${t.title}» нет ISRC` });
    } else if (!ISRC_REGEX.test(t.isrc)) {
      errors.push({ code: "ISRC_INVALID", field: `track.${t.trackId}.isrc`, message: `ISRC «${t.isrc}» не соответствует формату CC-XXX-YY-NNNNN` });
    } else if (isrcSet.has(t.isrc)) {
      errors.push({ code: "ISRC_DUPLICATE", field: `track.${t.trackId}.isrc`, message: `ISRC ${t.isrc} повторяется в нескольких треках` });
    } else {
      isrcSet.add(t.isrc);
    }
    if (!t.title?.trim()) errors.push({ code: "TRACK_TITLE_MISSING", field: `track.${t.trackId}.title`, message: `У трека id=${t.trackId} нет названия` });
    if (!t.durationSeconds || t.durationSeconds <= 0) {
      errors.push({ code: "TRACK_DURATION_MISSING", field: `track.${t.trackId}.duration`, message: `У трека «${t.title}» не определена длительность (загрузите аудиофайл)` });
    }
    if (!t.audioFile) {
      errors.push({ code: "TRACK_AUDIO_MISSING", field: `track.${t.trackId}.audio`, message: `Для трека «${t.title}» нет аудиофайла в storage` });
    }
  }

  // ── Partner ─────────────────────────────────────────────────────────
  if (!partner.partyIdSender || !PARTY_ID_REGEX.test(partner.partyIdSender)) {
    errors.push({ code: "SENDER_PARTY_ID_INVALID", field: "partner.partyIdSender", message: `PartyId отправителя «${partner.partyIdSender}» некорректен (ожидается PADPIDA-…)` });
  }
  if (!partner.partyIdRecipient || !PARTY_ID_REGEX.test(partner.partyIdRecipient)) {
    errors.push({ code: "RECIPIENT_PARTY_ID_INVALID", field: "partner.partyIdRecipient", message: `PartyId получателя «${partner.partyIdRecipient}» некорректен (ожидается PADPIDA-…)` });
  }

  // ── Deal ────────────────────────────────────────────────────────────
  if (!deal.useTypes || deal.useTypes.length === 0) {
    errors.push({ code: "DEAL_USE_TYPES_EMPTY", field: "deal.useTypes", message: "В Deal не указано ни одного UseType (Stream/Download)" });
  }
  if (!deal.territories || deal.territories.length === 0) {
    errors.push({ code: "DEAL_TERRITORIES_EMPTY", field: "deal.territories", message: "В Deal не указана ни одна территория" });
  }
  if (!deal.startDate) {
    errors.push({ code: "DEAL_START_MISSING", field: "deal.startDate", message: "В Deal не указана дата начала действия" });
  }

  return errors;
}

/** Проверка splits — должна быть равна 100% (или 0% если нет splits). */
export function validateSplits(participants: Array<{ percentage: number }>): ValidationError[] {
  if (participants.length === 0) return []; // splits опциональны
  const sum = participants.reduce((acc, p) => acc + (p.percentage ?? 0), 0);
  if (Math.abs(sum - 100) > 0.01) {
    return [{ code: "SPLITS_NOT_100", field: "splits.participants", message: `Сумма долей = ${sum}%, должна быть 100%` }];
  }
  return [];
}
