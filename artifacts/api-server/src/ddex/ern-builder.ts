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
 */

import { create } from "xmlbuilder2";
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
  rel.ele("DisplayTitleText").txt(release.title);
  const displayTitle = rel.ele("DisplayTitle");
  displayTitle.ele("TitleText").txt(release.title);
  const displayArtist = rel.ele("DisplayArtist", { SequenceNumber: "1" });
  displayArtist.ele("ArtistPartyReference").txt(release.mainArtist.partyRef);
  displayArtist.ele("DisplayArtistRole").txt("MainArtist");
  for (let i = 0; i < release.featuredArtists.length; i++) {
    const fa = rel.ele("DisplayArtist", { SequenceNumber: String(i + 2) });
    fa.ele("ArtistPartyReference").txt(release.featuredArtists[i].partyRef);
    fa.ele("DisplayArtistRole").txt("FeaturedArtist");
  }
  if (release.label) rel.ele("ReleaseLabelReference").txt(release.label.partyRef);
  if (release.genre) {
    const genre = rel.ele("Genre");
    genre.ele("GenreText").txt(release.genre);
  }
  rel.ele("ParentalWarningType").txt(release.isExplicit ? "Explicit" : "NotExplicit");
  rel.ele("OriginalReleaseDate").txt(release.releaseDate);
  rel.ele("OriginalDigitalReleaseDate").txt(release.releaseDate);
  if (release.pLine) {
    const pline = rel.ele("PLine");
    pline.ele("Year").txt(release.releaseDate.slice(0, 4));
    pline.ele("PLineText").txt(release.pLine);
  }
  if (release.cLine) {
    const cline = rel.ele("CLine");
    cline.ele("Year").txt(release.releaseDate.slice(0, 4));
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

function appendSoundRecording(parent: ReturnType<typeof create>, _release: ReleaseContext, t: TrackContext): void {
  const sr = parent.ele("SoundRecording");
  sr.ele("ResourceReference").txt(t.resourceRef);
  sr.ele("Type").txt("MusicalWorkSoundRecording");
  sr.ele("ResourceId").ele("ISRC").txt(t.isrc);
  sr.ele("DisplayTitleText").txt(t.title);
  const dt = sr.ele("DisplayTitle");
  dt.ele("TitleText").txt(t.title);

  // Главный артист трека = главный артист релиза (в простом случае).
  // Featured-роли для трека добавляются как дополнительные `DisplayArtist`.
  for (let i = 0; i < t.contributors.length; i++) {
    const c = t.contributors[i];
    const da = sr.ele("DisplayArtist", { SequenceNumber: String(i + 1) });
    da.ele("ArtistPartyReference").txt(c.partyRef);
    da.ele("DisplayArtistRole").txt(c.role === "Composer" || c.role === "Lyricist" || c.role === "Producer" ? "MainArtist" : c.role);
  }

  sr.ele("Duration").txt(formatDuration(t.durationSeconds));
  sr.ele("LanguageOfPerformance").txt(t.language || "tg");
  sr.ele("ParentalWarningType").txt(t.isExplicit ? "Explicit" : "NotExplicit");

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

  if (t.audioFile) {
    const td = sr.ele("TechnicalDetails");
    td.ele("TechnicalResourceDetailsReference").txt(`T_${t.resourceRef}`);
    td.ele("AudioCodecType").txt("WAV");
    td.ele("BitsPerSample").txt("16");
    td.ele("SamplingRate").txt("44100");
    td.ele("NumberOfChannels").txt("2");
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
