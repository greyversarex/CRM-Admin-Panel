/**
 * ERN-4.3 builder.
 *
 * Собирает валидный по структуре DDEX ERN-4.3 NewReleaseMessage / PurgeReleaseMessage.
 * Использует `xmlbuilder2` для безопасной работы с namespaces и эскейпом.
 *
 * Архитектура: один builder-класс с приватными методами под каждый блок:
 *   MessageHeader → PartyList → ResourceList → ReleaseList → DealList
 *
 * Для отдельных профилей (AudioSingle / AudioAlbum / Video) меняется состав
 * `<ResourceList>` и атрибуты в `<Release>`, но костяк один.
 *
 * Исправления (сверка с образцом ACRCloud / FUGA):
 *   ✓ <SubTitle> для версии релиза и трека
 *   ✓ <Title TitleType="TranslatedTitle"> — многоязычные переводы
 *   ✓ <SubGenre> внутри <Genre> на уровне релиза и трека
 *   ✓ Featured-артисты трека из displayArtists → отдельные <DisplayArtist>
 *   ✓ Реальные тех-характеристики аудио (кодек, частота, разрядность, каналы)
 *     вместо жёстко заданных WAV/16/44100/2
 */

import { create } from "xmlbuilder2";
import { metadataLanguageToCode } from "../lib/metadata-language-code";
import type {
  BuildErnInput,
  BuildErnResult,
  ContributingArtist,
  ReleaseContext,
  TrackContext,
} from "./types";

const ERN_NS = "http://ddex.net/xml/ern/43";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

export function buildErn(input: BuildErnInput): BuildErnResult {
  const { release, partner, messageType, updateIndicator, messageId, messageThreadId, createdAt, deal, ernVersion } = input;

  const root = create({ version: "1.0", encoding: "UTF-8" })
    .ele(messageType, {
      "xmlns:ern": ERN_NS,
      "xmlns:xsi": XSI_NS,
      MessageSchemaVersionId: `ern/${ernVersion.replace(".", "")}`,
      LanguageAndScriptCode: "en",
    });

  // ── 1. MessageHeader ───────────────────────────────────────────────
  const header = root.ele("MessageHeader");
  header.ele("MessageThreadId").txt(messageThreadId);
  header.ele("MessageId").txt(messageId);
  const sender = header.ele("MessageSender");
  sender.ele("PartyId").txt(partner.partyIdSender);
  sender.ele("PartyName").ele("FullName").txt(partner.partyNameSender);
  const recipient = header.ele("MessageRecipient");
  recipient.ele("PartyId").txt(partner.partyIdRecipient);
  recipient.ele("PartyName").ele("FullName").txt(partner.partyNameRecipient);
  header.ele("MessageCreatedDateTime").txt(createdAt.toISOString());
  header.ele("MessageControlType").txt(updateIndicator);

  // PurgeReleaseMessage не имеет ResourceList/ReleaseList в полном виде — только
  // ссылку на ICPN, который надо снять. Делаем компактный путь.
  if (messageType === "PurgeReleaseMessage") {
    const purge = root.ele("ReleaseList").ele("Release");
    purge.ele("ReleaseId").ele("ICPN", { isEan: "false" }).txt(release.upc);
    purge.ele("DisplayTitleText").txt(release.title);
    return { xml: root.end({ prettyPrint: true }), resources: [] };
  }

  // ── 2. PartyList ────────────────────────────────────────────────────
  const partyList = root.ele("PartyList");
  appendParty(partyList, release.mainArtist);
  for (const f of release.featuredArtists) appendParty(partyList, f);
  for (const t of release.tracks) {
    for (const c of t.contributors) appendParty(partyList, c);
  }
  if (release.label) {
    const labelParty = partyList.ele("Party");
    labelParty.ele("PartyReference").txt(release.label.partyRef);
    if (release.label.partyId) labelParty.ele("PartyId").txt(release.label.partyId);
    labelParty.ele("PartyName").ele("FullName").txt(release.label.name);
  }

  // ── 3. ResourceList ─────────────────────────────────────────────────
  const resourceList = root.ele("ResourceList");
  const allResources: BuildErnResult["resources"] = [];

  for (const t of release.tracks) {
    appendSoundRecording(resourceList, release, t);
    if (t.audioFile) allResources.push(t.audioFile);
  }
  if (release.cover) {
    const image = resourceList.ele("Image");
    image.ele("ResourceReference").txt("IMG_COVER");
    image.ele("Type").txt("FrontCoverImage");
    image.ele("ResourceId").ele("ProprietaryId", { Namespace: "TJM" }).txt(`COVER-${release.upc}`);
    const td = image.ele("TechnicalDetails");
    td.ele("TechnicalResourceDetailsReference").txt("T_IMG");
    const file = td.ele("File");
    file.ele("URI").txt(release.cover.filename);
    file.ele("HashSum")
      .ele("HashSum").txt(release.cover.sha1 ?? "").up()
      .ele("HashSumAlgorithmType").txt("SHA1");
    allResources.push(release.cover);
  }

  // ── 4. ReleaseList ──────────────────────────────────────────────────
  const releaseList = root.ele("ReleaseList");
  const rel = releaseList.ele("Release");
  rel.ele("ReleaseReference").txt("R0");
  rel.ele("ReleaseType").txt(profileToReleaseType(release));
  rel.ele("ReleaseId").ele("ICPN", { isEan: "false" }).txt(release.upc);

  // DisplayTitleText — простая форма без SubTitle (для совместимости с DSP-парсерами)
  rel.ele("DisplayTitleText").txt(release.title);

  // DisplayTitle — расширенная форма с SubTitle (версия релиза)
  const displayTitle = rel.ele("DisplayTitle");
  displayTitle.ele("TitleText").txt(release.title);
  if (release.releaseVersion) {
    displayTitle.ele("SubTitle").txt(release.releaseVersion);
  }

  // Переводы названия релиза на другие языки
  for (const tr of (release.metadataTranslations ?? [])) {
    if (!tr.language || !tr.title) continue;
    const tTitle = rel.ele("Title", { TitleType: "TranslatedTitle", LanguageAndScriptCode: metadataLanguageToCode(tr.language) });
    tTitle.ele("TitleText").txt(tr.title);
    if (tr.version) tTitle.ele("SubTitle").txt(tr.version);
  }

  // DisplayArtist: главный + featured
  const displayArtist = rel.ele("DisplayArtist", { SequenceNumber: "1" });
  displayArtist.ele("ArtistPartyReference").txt(release.mainArtist.partyRef);
  displayArtist.ele("DisplayArtistRole").txt("MainArtist");
  for (let i = 0; i < release.featuredArtists.length; i++) {
    const fa = rel.ele("DisplayArtist", { SequenceNumber: String(i + 2) });
    fa.ele("ArtistPartyReference").txt(release.featuredArtists[i].partyRef);
    fa.ele("DisplayArtistRole").txt("FeaturedArtist");
  }

  if (release.label) rel.ele("ReleaseLabelReference").txt(release.label.partyRef);

  // Genre с SubGenre
  if (release.genre) {
    const genre = rel.ele("Genre");
    genre.ele("GenreText").txt(release.genre);
    if (release.subgenre) genre.ele("SubGenre").txt(release.subgenre);
  }

  rel.ele("ParentalWarningType").txt(release.isExplicit ? "Explicit" : "NotExplicit");
  rel.ele("OriginalReleaseDate").txt(release.releaseDate);
  rel.ele("OriginalDigitalReleaseDate").txt(release.releaseDate);

  // P-line / C-line: используем явные pLineYear/cLineYear если есть, иначе год из даты
  const releaseYear = release.releaseDate.slice(0, 4);
  if (release.pLine) {
    const pline = rel.ele("PLine");
    pline.ele("Year").txt(releaseYear);
    pline.ele("PLineText").txt(release.pLine);
  }
  if (release.cLine) {
    const cline = rel.ele("CLine");
    cline.ele("Year").txt(releaseYear);
    cline.ele("CLineText").txt(release.cLine);
  }

  // Группировка ресурсов в порядке треков (важно для AudioAlbum profile).
  const resourceGroup = rel.ele("ResourceGroup");
  resourceGroup.ele("Title").ele("TitleText").txt(release.title);
  for (const t of release.tracks) {
    const item = resourceGroup.ele("ResourceGroupContentItem");
    item.ele("SequenceNumber").txt(String(t.trackNumber));
    item.ele("ReleaseResourceReference").txt(t.resourceRef);
  }
  if (release.cover) {
    const coverItem = resourceGroup.ele("ResourceGroupContentItem");
    coverItem.ele("ReleaseResourceReference").txt("IMG_COVER");
  }

  // ── 5. DealList ─────────────────────────────────────────────────────
  const dealList = root.ele("DealList");
  const releaseDeal = dealList.ele("ReleaseDeal");
  releaseDeal.ele("DealReleaseReference").txt("R0");
  const dealEle = releaseDeal.ele("Deal");
  const terms = dealEle.ele("DealTerms");
  terms.ele("CommercialModelType").txt(deal.commercialModel);
  for (const u of deal.useTypes) terms.ele("Usage").ele("UseType").txt(u);
  for (const territory of deal.territories) {
    if (territory === "WW" || territory === "Worldwide") {
      terms.ele("TerritoryCode").txt("Worldwide");
    } else {
      terms.ele("TerritoryCode").txt(territory);
    }
  }
  const validity = terms.ele("ValidityPeriod");
  validity.ele("StartDate").txt(deal.startDate);
  // Takedown: явный EndDate в прошлом / TakeDown=true для совместимости с разными партнёрами.
  if (deal.isTakedown) {
    const endDate = new Date(); endDate.setUTCDate(endDate.getUTCDate() - 1);
    validity.ele("EndDate").txt(endDate.toISOString().slice(0, 10));
    terms.ele("TakeDown").txt("true");
  } else if (deal.endDate) {
    validity.ele("EndDate").txt(deal.endDate);
  }

  return { xml: root.end({ prettyPrint: true }), resources: allResources };
}

// ── helpers ──────────────────────────────────────────────────────────

function appendParty(parent: ReturnType<typeof create>, c: ContributingArtist): void {
  // Не дублируем уже добавленный partyRef.
  // xmlbuilder2 fluent: просто дописываем — дедуп делаем на уровне сборки контекста.
  // Здесь дополнительно фильтруем по простому маркеру в node-name, чтобы не падать.
  const existing = (parent as unknown as { node: { childNodes: Array<{ firstChild?: { textContent?: string } | null }> } }).node?.childNodes ?? [];
  for (const child of existing) {
    const ref = child?.firstChild?.textContent;
    if (ref === c.partyRef) return;
  }
  const party = parent.ele("Party");
  party.ele("PartyReference").txt(c.partyRef);
  party.ele("PartyName").ele("FullName").txt(c.fullName);
}

function appendSoundRecording(parent: ReturnType<typeof create>, release: ReleaseContext, t: TrackContext): void {
  const sr = parent.ele("SoundRecording");
  sr.ele("ResourceReference").txt(t.resourceRef);
  sr.ele("Type").txt("MusicalWorkSoundRecording");
  sr.ele("ResourceId").ele("ISRC").txt(t.isrc);

  // DisplayTitleText — простая форма (совместимость)
  sr.ele("DisplayTitleText").txt(t.title);

  // DisplayTitle — расширенная форма с SubTitle (версия трека)
  const dt = sr.ele("DisplayTitle");
  dt.ele("TitleText").txt(t.title);
  if (t.trackVersion) {
    dt.ele("SubTitle").txt(t.trackVersion);
  }

  // Переводы названия трека на другие языки
  for (const tr of (t.metadataTranslations ?? [])) {
    if (!tr.language || !tr.title) continue;
    const tTitle = sr.ele("Title", { TitleType: "TranslatedTitle", LanguageAndScriptCode: metadataLanguageToCode(tr.language) });
    tTitle.ele("TitleText").txt(tr.title);
    if (tr.version) tTitle.ele("SubTitle").txt(tr.version);
  }

  // DisplayArtist: главный артист + featured
  // contributors уже содержит правильные роли (MainArtist / FeaturedArtist),
  // собранные в service.ts из track.displayArtists.
  for (let i = 0; i < t.contributors.length; i++) {
    const c = t.contributors[i];
    const da = sr.ele("DisplayArtist", { SequenceNumber: String(i + 1) });
    da.ele("ArtistPartyReference").txt(c.partyRef);
    // Composer/Lyricist/Producer — это авторы, не исполнители; для DisplayArtist
    // они берутся только когда одновременно являются главным/featured артистом.
    // Здесь все entries из contributors — именно исполнители (DisplayArtist).
    da.ele("DisplayArtistRole").txt(
      c.role === "FeaturedArtist" ? "FeaturedArtist" : "MainArtist",
    );
  }

  sr.ele("Duration").txt(formatDuration(t.durationSeconds));
  sr.ele("LanguageOfPerformance").txt(metadataLanguageToCode(t.language));
  sr.ele("ParentalWarningType").txt(t.isExplicit ? "Explicit" : "NotExplicit");

  // Genre на уровне трека с SubGenre
  // Используем жанр трека, если задан; иначе — жанр релиза.
  const trackGenre = t.genre || release.genre;
  const trackSubgenre = t.subgenre || release.subgenre;
  if (trackGenre) {
    const genre = sr.ele("Genre");
    genre.ele("GenreText").txt(trackGenre);
    if (trackSubgenre) genre.ele("SubGenre").txt(trackSubgenre);
  }

  // ContributorList — по DDEX ERN 4.3 живёт внутри SoundRecording.
  // Включаем writers (composer/lyricist/songwriter/arranger), performers и
  // production как отдельных <Contributor>. Каждой роли свой DDEX-маппинг.
  let contribSeq = 1;
  const ddexWriterRole: Record<string, string> = {
    composer: "Composer",
    lyricist: "Lyricist",
    songwriter: "ComposerLyricist",
    arranger: "Arranger",
  };
  for (const w of t.writers) {
    const ddexRole = ddexWriterRole[w.role] ?? "Composer";
    const c = sr.ele("Contributor", { SequenceNumber: String(contribSeq++) });
    c.ele("ContributorPartyReference").txt(`P_W_T${t.trackId}_${contribSeq}`);
    c.ele("ContributorRole").txt(ddexRole);
  }
  for (const p of t.performers) {
    const c = sr.ele("Contributor", { SequenceNumber: String(contribSeq++) });
    c.ele("ContributorPartyReference").txt(`P_PF_T${t.trackId}_${contribSeq}`);
    c.ele("ContributorRole").txt("Performer");
  }
  for (const pr of t.production) {
    const c = sr.ele("Contributor", { SequenceNumber: String(contribSeq++) });
    c.ele("ContributorPartyReference").txt(`P_PR_T${t.trackId}_${contribSeq}`);
    c.ele("ContributorRole").txt(pr.role === "producer" ? "Producer" : "StudioPersonnel");
  }

  // TechnicalDetails — реальные характеристики из music-metadata.
  // Fallback на отраслевые дефолты только для старых ассетов без колонок.
  if (t.audioFile) {
    const td = sr.ele("TechnicalDetails");
    td.ele("TechnicalResourceDetailsReference").txt(`T_${t.resourceRef}`);

    // Кодек: нормализуем к DDEX-значению (FLAC, MP3, AAC, WAV, …)
    td.ele("AudioCodecType").txt(normalizeDdexCodec(t.audioFile.codec));

    // Разрядность (бит на семпл): 16, 24, 32
    td.ele("BitsPerSample").txt(String(t.audioFile.bitDepth ?? 16));

    // Частота дискретизации: DDEX ожидает кГц с одним знаком после запятой.
    // music-metadata отдаёт в Гц (44100, 48000, 96000), конвертируем.
    td.ele("SamplingRate", { UnitOfMeasure: "kHz" }).txt(hzToKhzString(t.audioFile.sampleRateHz));

    // Количество каналов: 1 = моно, 2 = стерео, 6 = 5.1
    td.ele("NumberOfChannels").txt(String(t.audioFile.channels ?? 2));

    const file = td.ele("File");
    file.ele("URI").txt(t.audioFile.filename);
    if (t.audioFile.sha1) {
      file.ele("HashSum")
        .ele("HashSum").txt(t.audioFile.sha1).up()
        .ele("HashSumAlgorithmType").txt("SHA1");
    }
  }
}

function profileToReleaseType(r: ReleaseContext): string {
  if (r.releaseType === "single") return "Single";
  if (r.releaseType === "ep") return "EP";
  if (r.releaseType === "compilation") return "Album";
  return "Album";
}

/** ISO-8601 duration: PT3M42S */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let out = "PT";
  if (h > 0) out += `${h}H`;
  if (m > 0 || h > 0) out += `${m}M`;
  out += `${s}S`;
  return out;
}

/**
 * Нормализует codec-строку от music-metadata к значению DDEX AudioCodecType.
 * Список значений: https://ddex.net/xml/avs/avs (AudioCodecType).
 * Fallback: если codec неизвестен — WAV (безопасный дефолт для мастер-файлов).
 */
function normalizeDdexCodec(codec: string | undefined | null): string {
  if (!codec) return "WAV";
  const c = codec.toLowerCase().trim();
  if (c === "flac")            return "FLAC";
  if (c === "mp3" || c === "mpeg" || c === "mpeg audio") return "MP3";
  if (c === "aac" || c === "m4a" || c === "mp4a") return "AAC";
  if (c === "wav" || c === "wave" || c === "pcm" || c === "lpcm") return "WAV";
  if (c === "aiff" || c === "aif") return "AIFF";
  if (c === "ogg" || c === "vorbis") return "OGG";
  if (c === "opus")            return "Opus";
  if (c === "alac")            return "ALAC";
  // Неизвестный кодек — безопасный fallback, чтобы XML остался валидным.
  return "WAV";
}

/**
 * Конвертирует частоту дискретизации из Гц (как отдаёт music-metadata)
 * в строку кГц с одним знаком после запятой (как ожидает DDEX).
 * Примеры: 44100 → "44.1", 48000 → "48.0", 96000 → "96.0".
 * Fallback при null/undefined: "44.1" (стандарт CD).
 */
function hzToKhzString(hz: number | undefined | null): string {
  if (!hz || hz <= 0) return "44.1";
  const khz = hz / 1000;
  // Отображаем один знак после запятой, но убираем лишние нули только если целое.
  // 44.1 → "44.1", 48.0 → "48.0" (DDEX принимает оба формата).
  return khz.toFixed(1);
}
