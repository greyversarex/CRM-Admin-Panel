/**
 * Требования Broma16 к релизу — в одном месте.
 *
 * Раньше проверки были размазаны: часть в отчёте готовности, часть выбрасывалась
 * из пушера уже во время отправки, часть вообще всплывала ответом Broma16 на
 * четвёртом шаге — когда черновик у неё создан, а релиз остался недоделанным.
 * Живой пример: релиз 48 пять раз упал с «title: does not match» и завис
 * черновиком, потому что в названии стояла кириллическая «с».
 *
 * Здесь собрано то, что требует именно Broma16 и что можно проверить заранее.
 * Общие для всех площадок требования (обложка, аудио, доли авторов) остаются в
 * отчёте `/releases/:id/issues` — этот модуль их не дублирует.
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  artistsTable,
  releaseArtistsTable,
  releasesTable,
  tracksTable,
  type Release,
  type Track,
} from "@workspace/db";
import { describeMixedScript } from "../../lib/mixed-script";
import { getDictionary, resolveCountryId, resolveOutletCodes } from "./dictionaries";

export type ReadinessIssue = {
  section: "release" | "tracks" | "distribution";
  field: string | null;
  message: string;
  severity: "error" | "warning";
};

const norm = (s: string) => s.trim().toLowerCase();

/** Есть ли у релиза хотя бы один основной артист (Broma16 требует performers). */
async function hasPrimaryArtist(release: Release): Promise<boolean> {
  const rows = await db
    .select({ id: artistsTable.id })
    .from(releaseArtistsTable)
    .innerJoin(artistsTable, eq(releaseArtistsTable.artistId, artistsTable.id))
    .where(and(eq(releaseArtistsTable.releaseId, release.id), eq(releaseArtistsTable.role, "primary")))
    .limit(1);
  if (rows.length > 0) return true;
  const [main] = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.id, release.artistId)).limit(1);
  return Boolean(main);
}

/** Продюсер записи — Broma16 требует его при отправке на модерацию. */
function producerOf(track: Track): string | null {
  const production = (track.production ?? []) as { name?: string; role?: string }[];
  const fromProduction = production.find((p) => p.role && /producer/i.test(p.role));
  if (fromProduction?.name?.trim()) return fromProduction.name.trim();
  const performers = (track.performers ?? []) as { name?: string; role?: string }[];
  const fromPerformers = performers.find((p) => p.role && /producer/i.test(p.role));
  return fromPerformers?.name?.trim() || null;
}

/**
 * Проверяет релиз на соответствие требованиям Broma16.
 * Пустой массив — можно отправлять.
 */
export async function checkBroma16Readiness(releaseId: number): Promise<ReadinessIssue[]> {
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId)).limit(1);
  if (!release) return [{ section: "release", field: null, message: "Релиз не найден.", severity: "error" }];

  const tracks = await db
    .select()
    .from(tracksTable)
    .where(eq(tracksTable.releaseId, releaseId))
    .orderBy(asc(tracksTable.trackNumber), asc(tracksTable.id));

  const issues: ReadinessIssue[] = [];
  const add = (i: ReadinessIssue) => issues.push(i);

  // ── Артист ────────────────────────────────────────────────────────
  if (!(await hasPrimaryArtist(release))) {
    add({
      section: "release",
      field: "artistId",
      message: "У релиза нет основного артиста. Broma16 не примет релиз без исполнителя.",
      severity: "error",
    });
  }

  // ── Названия ──────────────────────────────────────────────────────
  const releaseTitle = (release.title ?? "").trim();
  const mixedRelease = describeMixedScript("Название релиза", release.title);
  if (mixedRelease) add({ section: "release", field: "title", message: mixedRelease, severity: "error" });

  for (const t of tracks) {
    const mixedTrack = describeMixedScript(`Трек «${t.title}»: название`, t.title);
    if (mixedTrack) add({ section: "tracks", field: `track:${t.id}:title`, message: mixedTrack, severity: "error" });
  }

  // Для сингла Broma16 сверяет название записи с названием релиза.
  if (release.releaseType === "single" && tracks.length === 1) {
    const trackTitle = (tracks[0].title ?? "").trim();
    if (trackTitle && releaseTitle && trackTitle !== releaseTitle) {
      add({
        section: "tracks",
        field: `track:${tracks[0].id}:title`,
        message:
          `Для сингла название трека должно совпадать с названием релиза. ` +
          `Сейчас релиз — «${releaseTitle}», трек — «${trackTitle}». Broma16 отклонит отправку.`,
        severity: "error",
      });
    }
  }

  // ── Продюсер ──────────────────────────────────────────────────────
  const withoutProducer = tracks.filter((t) => !producerOf(t));
  for (const t of withoutProducer) {
    add({
      section: "tracks",
      field: `track:${t.id}:production`,
      message:
        `Трек «${t.title}»: не указан продюсер. Добавьте участника с ролью продюсера в разделе ` +
        `«Производство» — без него Broma16 не пропустит релиз на модерацию.`,
      severity: "error",
    });
  }

  // ── Перенос каталога: оригинальные коды обязательны ───────────────
  if (release.isTransfer) {
    if (!release.upc?.trim()) {
      add({
        section: "release",
        field: "upc",
        message:
          "Перенос каталога: не указан оригинальный UPC. Новый код создавать нельзя — иначе площадки " +
          "не свяжут релиз со старой записью и обнулят статистику.",
        severity: "error",
      });
    }
    for (const t of tracks.filter((t) => !t.isrc?.trim())) {
      add({
        section: "tracks",
        field: `track:${t.id}:isrc`,
        message: `Перенос каталога: у трека «${t.title}» нет оригинального ISRC. Без него потеряются накопленные прослушивания.`,
        severity: "error",
      });
    }
  }

  // ── Страна записи ─────────────────────────────────────────────────
  // resolveCountryId бросает, если значение не найдено в словаре Broma16, —
  // проверяем заранее, иначе отправка упадёт на середине.
  const countries = new Set(tracks.map((t) => t.countryOfRecording).filter(Boolean) as string[]);
  for (const country of countries) {
    try {
      await resolveCountryId(country);
    } catch {
      add({
        section: "tracks",
        field: "countryOfRecording",
        message: `Страна записи «${country}» не распознана справочником Broma16. Выберите страну из списка.`,
        severity: "error",
      });
    }
  }

  // ── Жанры ─────────────────────────────────────────────────────────
  const genreDict = await getDictionary("genre");
  if (genreDict.length === 0) {
    add({
      section: "release",
      field: "genre",
      message: "Справочники Broma16 не синхронизированы — обновите их в настройках интеграции перед отправкой.",
      severity: "error",
    });
  } else {
    const known = new Set(genreDict.flatMap((g) => [norm(g.name), g.code ? norm(g.code) : ""].filter(Boolean)));
    const used = new Set(
      [release.genre, release.subgenre, ...tracks.flatMap((t) => [t.genre, t.subgenre])]
        .filter(Boolean)
        .map((g) => norm(g as string)),
    );
    for (const g of used) {
      if (!known.has(g)) {
        add({
          section: "release",
          field: "genre",
          message: `Жанр «${g}» отсутствует в справочнике Broma16 — она может его отклонить. Выберите значение из списка.`,
          severity: "warning",
        });
      }
    }
  }

  // ── Витрины ───────────────────────────────────────────────────────
  const outlets = await resolveOutletCodes(release.broma16DistributionOutlets);
  if (outlets.length === 0) {
    add({
      section: "distribution",
      field: "outlets",
      message: "Не выбрано ни одной площадки для дистрибуции — Broma16 не примет релиз без списка витрин.",
      severity: "error",
    });
  }

  return issues;
}

/** Только ошибки — то, что действительно блокирует отправку. */
export function blockingIssues(issues: ReadinessIssue[]): ReadinessIssue[] {
  return issues.filter((i) => i.severity === "error");
}
