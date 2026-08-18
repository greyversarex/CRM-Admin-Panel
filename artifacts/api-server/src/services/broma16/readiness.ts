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
  assetsTable,
  releaseArtistsTable,
  releasesTable,
  tracksTable,
  type Release,
  type Track,
} from "@workspace/db";
import { describeMixedScript } from "../../lib/mixed-script";
import { checkWriterName } from "../../lib/writer-name";
import {
  getDictionary,
  outletsNeedingOwnReleaseType,
  resolveCountryId,
  resolveGenres,
  resolveOutletCodes,
  resolveReleaseTypeId,
} from "./dictionaries";

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

  // Требования Broma16 к синглам («Критерии готовности релиза», документация
  // прислана 18.08.2026): у типов Сингл/RBT/RT/TikTok должна быть ровно одна
  // фонограмма, а её название, версия и состав исполнителей обязаны совпадать
  // с релизом. Проверяем всё это до отправки — Broma16 иначе отклоняет.
  if (release.releaseType === "single") {
    if (tracks.length > 1) {
      add({
        section: "tracks",
        field: null,
        message:
          `У сингла может быть только одна фонограмма, сейчас их ${tracks.length}. ` +
          `Разделите релиз или смените тип на EP/альбом.`,
        severity: "error",
      });
    }

    if (tracks.length === 1) {
      const track = tracks[0];
      const trackTitle = (track.title ?? "").trim();
      if (trackTitle && releaseTitle && trackTitle !== releaseTitle) {
        add({
          section: "tracks",
          field: `track:${track.id}:title`,
          message:
            `Для сингла название трека должно совпадать с названием релиза. ` +
            `Сейчас релиз — «${releaseTitle}», трек — «${trackTitle}». Broma16 отклонит отправку.`,
          severity: "error",
        });
      }

      // Версия (сабтайтл) сверяется так же строго, как и название.
      const releaseVersion = (release.releaseVersion ?? "").trim();
      const trackVersion = (track.trackVersion ?? "").trim();
      if (releaseVersion !== trackVersion) {
        add({
          section: "tracks",
          field: `track:${track.id}:trackVersion`,
          message:
            `Для сингла версия трека должна совпадать с версией релиза. ` +
            `Сейчас у релиза «${releaseVersion || "пусто"}», у трека «${trackVersion || "пусто"}».`,
          severity: "error",
        });
      }

      // Третье требование Broma16 — совпадение состава исполнителей — здесь не
      // проверяется: пушер отправляет фонограмме тот же список main_performer,
      // что и релизу, поэтому разойтись они не могут. Проверка ловила бы не
      // расхождение, а музыкантов из блока «Исполнители» (вокал, гитара), и
      // ошибочно ругалась бы на исправные релизы.
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

  // ── Имена авторов ─────────────────────────────────────────────────
  // Broma16 передаёт авторов в общества, а те регистрируют произведение по
  // юридическому имени. Одного слова недостаточно: отчисления просто не на
  // кого начислить. Исполнителя это не касается — сценическое имя нормально.
  for (const t of tracks) {
    const writers = (t.writers ?? []) as { name?: string }[];
    for (const w of writers) {
      const check = checkWriterName(w.name);
      if (!check.ok) {
        add({
          section: "tracks",
          field: `track:${t.id}:writers`,
          message: `Трек «${t.title}», автор: ${check.reason}`,
          severity: "error",
        });
      }
    }
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
  // resolveGenres никогда не отправляет в Broma16 неизвестный жанр: сначала
  // ищет прямое совпадение, потом региональный эквивалент, потом подставляет
  // общий «World». Отклонения по жанру поэтому не будет — но подмена меняет
  // то, как релиз выглядит на площадках, и оператор должен об этом знать.
  const genreDict = await getDictionary("genre");
  if (genreDict.length === 0) {
    add({
      section: "release",
      field: "genre",
      message: "Справочники Broma16 не синхронизированы — обновите их в настройках интеграции перед отправкой.",
      severity: "error",
    });
  } else {
    const used = [...new Set(
      [release.genre, release.subgenre, ...tracks.flatMap((t) => [t.genre, t.subgenre])]
        .filter(Boolean)
        .map((g) => (g as string).trim()),
    )];
    // Предупреждаем только когда жанр действительно теряется — то есть уходит
    // в общий «World»/«Ethnic» из чего-то конкретного. «Synth Pop» → «SynthPop»
    // и «Tajik Pop» → «Pop» это то же самое другими словами, и сообщать не о
    // чем: предупреждение, которое горит на каждом релизе, перестают читать.
    const compactKey = (s: string) => norm(s).replace(/[^\p{Letter}\p{Number}]+/gu, "");
    const GENERIC = new Set(["world", "ethnic"]);
    for (const g of used) {
      const [canon] = await resolveGenres([g]);
      if (!canon || compactKey(canon) === compactKey(g)) continue;
      const becameGeneric = GENERIC.has(norm(canon));
      const wasAlreadyGeneric = /world|ethnic|этно|мировая/i.test(g);
      if (becameGeneric && !wasAlreadyGeneric) {
        add({
          section: "release",
          field: "genre",
          message:
            `Жанр «${g}» Broma16 не знает — он уйдёт как «${canon}», то есть потеряет конкретику. ` +
            `На площадках трек попадёт в общую категорию и хуже найдётся в рекомендациях. ` +
            `Выберите ближайший жанр из справочника.`,
          severity: "warning",
        });
      }
    }
  }

  // ── Обложка ───────────────────────────────────────────────────────
  // Требования Broma16 (ответ поддержки 18.08.2026): JPG/JPEG/PNG, до 40 МБ,
  // строго 1:1, не меньше 1500×1500, без логотипов, адресов сайтов, ссылок,
  // штрихкодов, QR-кодов и любой рекламы.
  if (release.coverUrl) {
    const [cover] = await db
      .select({ mimeType: assetsTable.mimeType, sizeBytes: assetsTable.sizeBytes, filename: assetsTable.filename })
      .from(assetsTable)
      .where(eq(assetsTable.objectPath, release.coverUrl))
      .limit(1);

    if (cover) {
      const mime = norm(cover.mimeType ?? "");
      if (mime && !["image/jpeg", "image/jpg", "image/png"].includes(mime)) {
        add({
          section: "release",
          field: "coverUrl",
          message: `Broma16 принимает обложку только в JPG, JPEG или PNG, а файл «${cover.filename}» — ${cover.mimeType}.`,
          severity: "error",
        });
      }
      const maxBytes = 40 * 1024 * 1024;
      if (cover.sizeBytes > maxBytes) {
        add({
          section: "release",
          field: "coverUrl",
          message:
            `Обложка весит ${(cover.sizeBytes / 1024 / 1024).toFixed(1)} МБ — Broma16 принимает до 40 МБ. ` +
            `Пересохраните файл с меньшим качеством.`,
          severity: "error",
        });
      }
    }

    // Размеры и содержимое картинки мы не читаем: ширина и высота при загрузке
    // не сохраняются, а логотипы и QR-коды машиной не проверить. Поэтому не
    // молчим, а показываем оператору сам список требований.
    add({
      section: "release",
      field: "coverUrl",
      message:
        "Проверьте обложку по требованиям Broma16: квадрат 1:1, не меньше 1500×1500 пикселей, " +
        "без логотипов, адресов сайтов, ссылок, штрихкодов, QR-кодов и рекламы.",
      severity: "warning",
    });
  }

  // ── Язык ──────────────────────────────────────────────────────────
  // Пустой язык не блокирует отправку — но и не остаётся пустым: при отправке
  // подставляется английский. Для таджикского каталога это молча неверные
  // данные на площадках, поэтому спрашиваем до отправки, а не после.
  const withoutLanguage = tracks.filter((t) => !(t.vocalLanguage ?? t.language));
  if (withoutLanguage.length > 0) {
    add({
      section: "tracks",
      field: withoutLanguage.length === tracks.length ? "language" : `track:${withoutLanguage[0].id}:language`,
      message:
        (withoutLanguage.length === tracks.length
          ? "Не указан язык вокала ни у одного трека. "
          : `Не указан язык вокала у ${withoutLanguage.length} из ${tracks.length} треков. `) +
        "При отправке будет проставлен английский — на площадках это скажется на " +
        "подборках и текстах. Укажите язык явно, инструментальные помечайте как таковые.",
      severity: "warning",
    });
  }

  // ── Поджанр ───────────────────────────────────────────────────────
  // Ни один открытый каталог поджанр не публикует: Deezer и iTunes отдают
  // только широкий жанр. Значит после импорта это поле всегда пустое, и
  // заполнить его может только оператор.
  if (release.genre && !release.subgenre) {
    add({
      section: "release",
      field: "subgenre",
      message:
        `Не указан поджанр (жанр — «${release.genre}»). Внешние каталоги поджанр не отдают, ` +
        "поэтому после импорта его нужно выбрать вручную: он уточняет, в какие подборки попадёт релиз.",
      severity: "warning",
    });
  }

  // ── Витрины ───────────────────────────────────────────────────────
  // Тип релиза важен: у рингтонов и TikTok свой набор витрин, и без него
  // отбор шёл бы по общему списку.
  const releaseTypeId = await resolveReleaseTypeId(release.releaseType);
  const outlets = await resolveOutletCodes(release.broma16DistributionOutlets, { releaseTypeId });
  if (outlets.length === 0) {
    add({
      section: "distribution",
      field: "outlets",
      message: "Не выбрано ни одной площадки для дистрибуции — Broma16 не примет релиз без списка витрин.",
      severity: "error",
    });
  }

  // Рингтон-витрины и TikTok требуют отдельного типа релиза. Если их не убрать,
  // Broma16 отвечает «an incorrect release distribution identifier» и релиз
  // целиком остаётся черновиком — так застрял релиз #48 «Ochai Khushruyum».
  const restricted = await outletsNeedingOwnReleaseType(release.broma16DistributionOutlets);
  if (restricted.length > 0) {
    add({
      section: "distribution",
      field: "outlets",
      message:
        `Эти витрины требуют отдельного релиза своего типа (RBT / рингтон / TikTok) и в обычную ` +
        `поставку не войдут: ${restricted.join(", ")}. Остальные площадки уедут как обычно; ` +
        `для рингтонов и TikTok нужен отдельный релиз.`,
      severity: "warning",
    });
  }

  return issues;
}

/** Только ошибки — то, что действительно блокирует отправку. */
export function blockingIssues(issues: ReadinessIssue[]): ReadinessIssue[] {
  return issues.filter((i) => i.severity === "error");
}
