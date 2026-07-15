/**
 * Release Pusher — отправка релиза из нашей БД в Broma16 (ROD API) по полному
 * 9-шаговому flow: артисты → создание релиза → загрузка треков → метаданные →
 * произведения+авторы → лирика → обложка → дистрибуция → модерация.
 *
 * Идемпотентность:
 *   - broma16_release_id / broma16_recording_id сохраняются в БД; повторный
 *     запуск не создаёт сущности заново, а обновляет/пропускает.
 *   - неидемпотентные шаги (composition, cover, moderate) защищены флагами
 *     прогресса в broma16_push_jobs.result — при ретрае воркер их пропускает.
 */

import {
  db,
  releasesTable,
  tracksTable,
  artistsTable,
  labelsTable,
  releaseArtistsTable,
  auditLogTable,
  type Release,
  type Track,
  type Artist,
  type TrackWriter,
  type TrackPerformer,
  type TrackProductionMember,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { Broma16ApiError } from "./errors";
import { createBroma16Client, type Broma16Client } from "./client";
import { ensureArtistSynced } from "./artists";
import {
  resolveCountryId,
  resolveGenres,
  resolveLanguageId,
  resolveOutletCodes,
  resolveReleaseTypeId,
} from "./dictionaries";
import { fetchAssetBytes, buildFileForm } from "./files";

/** Приводит дату (строка из БД или Date) к формату YYYY-MM-DD для Broma16. */
function toBroma16Date(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length >= 10 ? trimmed.slice(0, 10) : (trimmed || undefined);
  }
  return undefined;
}

/**
 * Дата создания записи (мастера) для Broma16. На уровне recording это дата
 * записи трека — Broma16 требует её не позже сегодняшнего дня (релиз может быть
 * запланирован на будущее, но запись всегда уже существует). Поэтому ограничиваем
 * дату релиза сегодняшним днём.
 */
function toBroma16RecordingDate(releaseDate: unknown): string {
  const today = new Date().toISOString().slice(0, 10);
  const rd = toBroma16Date(releaseDate);
  if (!rd) return today;
  return rd > today ? today : rd;
}

export type PushProgress = {
  metadataDone?: number[];
  compositionDone?: number[];
  lyricsDone?: number[];
  coverDone?: boolean;
  distributionDone?: boolean;
  moderateDone?: boolean;
};

export type PushContext = {
  progress?: PushProgress;
  /** Персист прогресса между ретраями (например, в broma16_push_jobs.result). */
  save?: (progress: PushProgress) => Promise<void>;
  /** Кто инициировал (для аудита). */
  requestedBy?: number | null;
  /** Колбэк смены шага (для broma16_push_jobs.step). */
  onStep?: (step: string) => Promise<void>;
};

export type PushResult = {
  releaseId: number;
  broma16ReleaseId: number;
  recordings: number;
  moderation: string;
};

function extractId(data: unknown): number | null {
  if (typeof data === "number") return data;
  if (typeof data === "string" && /^\d+$/.test(data)) return Number(data);
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const id = obj.id ?? obj.recording_id ?? obj.recordingId ?? obj.release_id ?? obj.releaseId;
    if (typeof id === "number") return id;
    if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  }
  return null;
}

const WRITER_ROLE_MAP: Record<TrackWriter["role"], string[]> = {
  composer: ["C"],
  lyricist: ["A"],
  songwriter: ["C", "A"],
  arranger: ["A"],
};

type Contributor = {
  title: string;
  ownership: string;
  roles: string[];
  controlled_by_submitter: number;
  ipi?: string;
};

/** Строит список авторов трека с гарантией суммы долей = 100%. */
function buildContributors(track: Track): Contributor[] {
  const writers = (track.writers ?? []) as TrackWriter[];
  if (writers.length > 0) {
    const sum = writers.reduce((s, w) => s + (Number(w.share) || 0), 0);
    if (Math.abs(sum - 100) < 0.01) {
      return writers.map((w) => ({
        title: w.name,
        ownership: (Number(w.share) || 0).toFixed(2),
        roles: WRITER_ROLE_MAP[w.role] ?? ["C", "A"],
        controlled_by_submitter: 1,
        ...(w.caeIpi ? { ipi: w.caeIpi } : {}),
      }));
    }
    logger.warn(
      { trackId: track.id, sum },
      "[broma16] сумма долей авторов != 100% — использую Copyright Control",
    );
  }
  // Фоллбэк: без данных об авторах Broma16 вернёт 422, поэтому ставим CC 100%.
  return [{ title: "Copyright Control", ownership: "100.00", roles: ["C", "A"], controlled_by_submitter: 1 }];
}

/**
 * Имя продюсера записи. Broma16 при модерации требует `producer` (или party_id)
 * на уровне записи. Берём первого участника с ролью продюсера из production,
 * затем из performers (music_producer).
 */
function buildProducer(track: Track): string | undefined {
  const production = (track.production ?? []) as TrackProductionMember[];
  const fromProduction = production.find((p) => /producer/i.test(p.role));
  if (fromProduction?.name) return fromProduction.name;
  const performers = (track.performers ?? []) as TrackPerformer[];
  const fromPerformers = performers.find((p) => /producer/i.test(p.role));
  return fromPerformers?.name || undefined;
}

async function auditStep(
  releaseId: number,
  step: string,
  info: Record<string, unknown>,
  userId: number | null,
): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      userId: userId ?? null,
      action: "update",
      entityType: "broma16_push",
      entityId: releaseId,
      diff: { step, ...info },
    });
  } catch (err) {
    logger.warn({ err, releaseId, step }, "[broma16] не удалось записать audit");
  }
}

async function getPrimaryArtists(release: Release): Promise<Artist[]> {
  const rows = await db
    .select({ artist: artistsTable })
    .from(releaseArtistsTable)
    .innerJoin(artistsTable, eq(releaseArtistsTable.artistId, artistsTable.id))
    .where(and(eq(releaseArtistsTable.releaseId, release.id), eq(releaseArtistsTable.role, "primary")))
    .orderBy(asc(releaseArtistsTable.position));
  if (rows.length > 0) return rows.map((r) => r.artist);
  // Фоллбэк на исторический главный артист.
  const [main] = await db.select().from(artistsTable).where(eq(artistsTable.id, release.artistId)).limit(1);
  return main ? [main] : [];
}

function releaseGenres(release: Release, tracks: Track[]): string[] {
  const set = new Set<string>();
  if (release.genre) set.add(release.genre);
  for (const t of tracks) if (t.genre) set.add(t.genre);
  return [...set];
}

export async function pushReleaseToBroma16(releaseId: number, ctx: PushContext = {}): Promise<PushResult> {
  const progress: PushProgress = ctx.progress ?? {};
  const save = ctx.save ?? (async () => {});
  const onStep = ctx.onStep ?? (async () => {});
  const userId = ctx.requestedBy ?? null;

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId)).limit(1);
  if (!release) throw new Broma16ApiError(404, `Релиз #${releaseId} не найден`);

  const tracks = await db
    .select()
    .from(tracksTable)
    .where(eq(tracksTable.releaseId, releaseId))
    .orderBy(asc(tracksTable.trackNumber), asc(tracksTable.id));
  if (tracks.length === 0) throw new Broma16ApiError(422, "У релиза нет треков — нечего отправлять");

  // Preflight: Broma16 при модерации требует продюсера (producer/party_id) на
  // каждой записи. Если данных нет — даём оператору понятную ошибку заранее,
  // вместо непрозрачной 422 от Broma16 в самом конце пуша.
  const tracksWithoutProducer = tracks.filter((t) => !buildProducer(t));
  if (tracksWithoutProducer.length > 0) {
    const titles = tracksWithoutProducer.map((t) => `«${t.title}»`).join(", ");
    throw new Broma16ApiError(
      422,
      `Не указан продюсер у треков: ${titles}. Добавьте продюсера (раздел Production/Performers) — Broma16 не примет релиз на модерацию без него.`,
    );
  }

  const client = await createBroma16Client();
  const accountId = await client.getAccountId();

  // ── Шаг 1: артисты ───────────────────────────────────────────────
  await onStep("artist");
  const primaryArtists = await getPrimaryArtists(release);
  if (primaryArtists.length === 0) throw new Broma16ApiError(422, "У релиза нет основного артиста");
  const performerIds: string[] = [];
  for (const a of primaryArtists) {
    performerIds.push(await ensureArtistSynced(a, accountId, client));
  }
  await auditStep(releaseId, "artist", { performers: performerIds.length }, userId);

  // ── Шаг 2: создание / обновление релиза ──────────────────────────
  await onStep("create_release");
  const genres = await resolveGenres(releaseGenres(release, tracks));
  // Правообладатель (лейбл) для Broma16: имя лейбла, привязанного к релизу.
  // Для клиентов-лейблов уходит их название; если лейбл не задан — дефолт.
  let labelName = "Tajik Music";
  if (release.labelId) {
    const [label] = await db
      .select({ name: labelsTable.name })
      .from(labelsTable)
      .where(eq(labelsTable.id, release.labelId))
      .limit(1);
    if (label?.name?.trim()) labelName = label.name.trim();
  }
  const releaseBody: Record<string, unknown> = {
    title: release.title,
    subtitle: release.releaseVersion ?? "",
    release_type_id: await resolveReleaseTypeId(release.releaseType),
    performers: performerIds,
    genres,
    account_id: Number(accountId),
    p_line: release.pLine ?? undefined,
    c_line: release.cLine ?? undefined,
    // Broma16 ожидает строки (string_type), а не числовой год.
    date_p_line: release.pLineYear != null ? String(release.pLineYear) : undefined,
    date_c_line: release.cLineYear != null ? String(release.cLineYear) : undefined,
    // created_date обязателен на уровне релиза; формат YYYY-MM-DD.
    created_date: toBroma16Date(release.releaseDate),
    // Лейбл-правообладатель релиза (из БД), а не захардкоженное имя.
    label_name: labelName,
  };
  // Перенос каталога (isTransfer): НИКОГДА не генерируем новый UPC — только
  // оригинальный. Иначе DSP не свяжут релиз со старой записью и обнулят стримы,
  // плейлисты и статистику. Нет оригинального кода → блокируем отправку.
  if (release.upc) releaseBody.ean = release.upc;
  else if (release.isTransfer) throw new Broma16ApiError(422, "Перенос каталога: у релиза нет оригинального UPC. Заполните оригинальный UPC перед отправкой — при переносе нельзя создавать новый код, иначе потеряются стримы и статистика.");
  else releaseBody.generate_ean = true;
  if (release.catalogNumber) releaseBody.catalog_number = release.catalogNumber;
  else releaseBody.generate_catalog_number = true;
  // Перенос каталога: документированный флаг Broma16 (регулирует особенности переноса).
  if (release.isTransfer) releaseBody.isTransferRelease = true;

  let broma16ReleaseId = release.broma16ReleaseId ?? null;
  if (broma16ReleaseId) {
    await client.request("PUT", `/repertoire/release/${broma16ReleaseId}`, { body: releaseBody });
  } else {
    const data = await client.request<unknown>("POST", "/repertoire/release", { body: releaseBody });
    broma16ReleaseId = extractId(data);
    if (!broma16ReleaseId) throw new Broma16ApiError(0, "Broma16: не удалось получить id созданного релиза");
    await db
      .update(releasesTable)
      .set({ broma16ReleaseId })
      .where(eq(releasesTable.id, releaseId));
  }
  await auditStep(releaseId, "create_release", { broma16ReleaseId }, userId);

  // ── Шаг 3: загрузка аудио ────────────────────────────────────────
  await onStep("upload_tracks");
  for (const track of tracks) {
    if (track.broma16RecordingId) continue; // уже загружен
    if (!track.audioUrl) throw new Broma16ApiError(422, `У трека «${track.title}» нет аудиофайла`);
    const asset = await fetchAssetBytes(track.audioUrl);
    const form = buildFileForm(asset, { sort: track.trackNumber ?? 1 });
    const data = await client.request<unknown>(
      "POST",
      `/repertoire/release/${broma16ReleaseId}/recording/upload`,
      { form },
    );
    const recordingId = extractId(data);
    if (!recordingId) throw new Broma16ApiError(0, `Broma16: не получен recordingId для «${track.title}»`);
    track.broma16RecordingId = recordingId;
    await db.update(tracksTable).set({ broma16RecordingId: recordingId }).where(eq(tracksTable.id, track.id));
  }
  await auditStep(releaseId, "upload_tracks", { count: tracks.length }, userId);

  // ── Шаг 4: метаданные треков ─────────────────────────────────────
  await onStep("track_metadata");
  progress.metadataDone ??= [];
  for (const track of tracks) {
    if (progress.metadataDone.includes(track.id)) continue;
    const recId = track.broma16RecordingId!;
    const trackGenres = await resolveGenres(track.genre ? [track.genre] : genres);
    const body: Record<string, unknown> = {
      title: track.title,
      subtitle: track.trackVersion ?? "",
      genres: trackGenres,
      main_performer: performerIds,
      featured_artist: [],
      created_country_id: await resolveCountryId(track.countryOfRecording),
      created_date: toBroma16RecordingDate(release.releaseDate),
      // Эти поля Broma16 проверяет при отправке на модерацию (required_without
      // is_instrumental). Раньше они уходили только в шаге «лирика», который
      // пропускается у треков без текста, поэтому модерация падала с 422.
      is_instrumental: track.audioStyle === "instrumental",
      parental_warning_type: track.isExplicit ? "explicit" : "not_explicit",
      language: await resolveLanguageId(track.vocalLanguage ?? track.language),
    };
    // Продюсер записи (или party_id) обязателен при модерации Broma16.
    const producer = buildProducer(track);
    if (producer) body.producer = producer;
    // Broma16 требует каталожный номер и на уровне записи: наследуем номер релиза,
    // иначе просим Broma16 сгенерировать (как и для UPC/каталога релиза).
    if (release.catalogNumber) body.catalog_number = release.catalogNumber;
    else body.generate_catalog_number = true;
    // ISRC: если у трека уже есть свой код — передаём его, иначе просим Broma16
    // сгенерировать. Присвоенный код читаем обратно после модерации (см. moderation.ts).
    // Перенос каталога (isTransfer): НИКОГДА не генерируем новый ISRC — только
    // оригинальный, иначе теряются стримы трека на DSP. Нет кода → блокируем отправку.
    if (track.isrc) body.isrc = track.isrc;
    else if (release.isTransfer) throw new Broma16ApiError(422, `Перенос каталога: у трека «${track.title}» нет оригинального ISRC. Заполните оригинальный ISRC перед отправкой — при переносе нельзя создавать новый код, иначе потеряются стримы.`);
    else body.generate_isrc = true;
    await client.request("PUT", `/repertoire/release/${broma16ReleaseId}/recording/${recId}`, { body });
    progress.metadataDone.push(track.id);
    await save(progress);
  }
  await auditStep(releaseId, "track_metadata", { count: tracks.length }, userId);

  // ── Шаг 5: произведения и авторы (обязательно для модерации) ──────
  await onStep("composition");
  progress.compositionDone ??= [];
  for (const track of tracks) {
    if (progress.compositionDone.includes(track.id)) continue;
    const recId = track.broma16RecordingId!;
    const contributors = buildContributors(track);
    await client.request(
      "POST",
      `/repertoire/release/${broma16ReleaseId}/recording/${recId}/composition`,
      { body: { contributors } },
    );
    progress.compositionDone.push(track.id);
    await save(progress);
  }
  await auditStep(releaseId, "composition", { count: tracks.length }, userId);

  // ── Шаг 6: лирика (если есть) ─────────────────────────────────────
  await onStep("lyrics");
  progress.lyricsDone ??= [];
  for (const track of tracks) {
    if (!track.lyrics || progress.lyricsDone.includes(track.id)) continue;
    const recId = track.broma16RecordingId!;
    const body = {
      parental_warning_type: track.isExplicit ? "explicit" : "not_explicit",
      is_instrumental: track.audioStyle === "instrumental",
      lyrics: track.lyrics,
      language: await resolveLanguageId(track.vocalLanguage ?? track.language),
    };
    await client.request("PUT", `/repertoire/release/${broma16ReleaseId}/recording/${recId}/lyrics`, { body });
    progress.lyricsDone.push(track.id);
    await save(progress);
  }

  // ── Шаг 7: обложка ───────────────────────────────────────────────
  await onStep("cover");
  if (release.coverUrl && !progress.coverDone) {
    const asset = await fetchAssetBytes(release.coverUrl);
    const form = buildFileForm(asset);
    await client.request("POST", `/repertoire/release/${broma16ReleaseId}/cover/upload`, { form });
    progress.coverDone = true;
    await save(progress);
  }
  await auditStep(releaseId, "cover", { uploaded: Boolean(release.coverUrl) }, userId);

  // ── Шаг 8: дистрибуция ───────────────────────────────────────────
  await onStep("distribution");
  const outlets = await resolveOutletCodes(release.broma16DistributionOutlets);
  if (!progress.distributionDone) {
    // Broma16 ждёт верхнеуровневый список витрин `outlets` (required_unless: update).
    // `distribution_outlets` — необязательный, только для персональных дат отгрузки
    // по отдельной договорённости с площадкой, поэтому его не отправляем.
    await client.request("POST", `/repertoire/release/${broma16ReleaseId}/distribution`, {
      body: { outlets, sale_start_date: toBroma16Date(release.releaseDate) },
    });
    progress.distributionDone = true;
    await save(progress);
  }
  await db
    .update(releasesTable)
    .set({ broma16DistributionOutlets: outlets })
    .where(eq(releasesTable.id, releaseId));
  await auditStep(releaseId, "distribution", { outlets }, userId);

  // ── Шаг 9: отправка на модерацию ─────────────────────────────────
  await onStep("moderate");
  if (!progress.moderateDone) {
    await client.request("POST", `/repertoire/release/${broma16ReleaseId}/send-moderate`, {});
    progress.moderateDone = true;
    await save(progress);
  }
  await db
    .update(releasesTable)
    .set({
      broma16ModerationStatus: "pending",
      broma16PushedAt: new Date(),
      broma16LastError: null,
    })
    .where(eq(releasesTable.id, releaseId));
  await auditStep(releaseId, "moderate", { status: "pending" }, userId);

  await onStep("done");
  logger.info({ releaseId, broma16ReleaseId }, "[broma16] релиз отправлен на модерацию");
  return {
    releaseId,
    broma16ReleaseId,
    recordings: tracks.length,
    moderation: "pending",
  };
}
