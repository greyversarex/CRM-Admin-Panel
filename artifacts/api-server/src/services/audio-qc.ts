// ─── Audio QC: автоматический анализ качества аудио ─────────────────────────
// После загрузки аудиофайла трека прогоняем его через ffmpeg/ffprobe:
//   • честные пики волнограммы (для waveform в UI)
//   • тишина внутри трека и «мёртвый воздух» в конце (с таймкодами)
//   • клиппинг/перегруз и искажения
//   • fade in / fade out
//   • громкость LUFS + True Peak (ebur128 — то, по чему нормализуют DSP)
//   • моно/стерео и sample rate
// Результат сохраняется в таблицу audio_qc (одна строка на трек) и
// показывается на странице трека/релиза. Анализ идемпотентен: если
// object_path не изменился — повторный запуск перезаписывает строку.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { db, audioQcTable, tracksTable, assetsTable, type AudioQcIssue, type AudioQcRow } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveAssetLocalPath } from "../ddex/service";

const PEAK_BUCKETS = 600;          // точек волнограммы для UI
const SILENCE_DB = -50;            // порог тишины, dBFS (RMS окна)
const SILENCE_MIN_SEC = 3;         // минимальная длительность «паузы» внутри трека
const DEAD_AIR_MIN_SEC = 2;        // «мёртвый воздух» в конце
const CLIP_THRESHOLD = 0.985;      // |sample| выше — считаем клиппингом (после декода)
const CLIP_RUN_MIN = 4;            // подряд сэмплов у потолка = событие клиппинга
const DISTORTION_RATIO = 0.0001;   // доля клипованных сэмплов, после которой это «искажения»

function run(cmd: string, args: string[], opts: { collectStdout?: boolean } = {}): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d: Buffer) => { if (opts.collectStdout !== false) out.push(d); });
    p.stderr.on("data", (d: Buffer) => { err += d.toString(); if (err.length > 1_000_000) err = err.slice(-500_000); });
    p.on("error", reject);
    p.on("close", (code) => resolve({ stdout: Buffer.concat(out), stderr: err, code: code ?? -1 }));
  });
}

/**
 * Потоковый однопроходный анализ PCM: ffmpeg декодирует в mono f32le 44.1kHz,
 * а мы обрабатываем чанки на лету, НЕ буферизуя весь трек в памяти
 * (WAV 4 мин ≈ 44 МБ f32 — при параллельных анализах это критично).
 * За один проход считаем: пики волнограммы, клиппинг, RMS-окна по 100 мс.
 */
async function streamAnalyzePcm(file: string, rate: number, expectedDurationSec: number): Promise<{
  totalSamples: number;
  peaks: number[];
  clippedSamples: number;
  clipStarts: number[];       // сэмпл-индексы начала событий клиппинга
  winDb: number[];            // RMS каждого 100 мс окна, dBFS
}> {
  const expectedSamples = Math.max(1, Math.round(expectedDurationSec * rate));
  const bucketSize = Math.max(1, Math.floor(expectedSamples / PEAK_BUCKETS));
  const win = Math.floor(rate / 10);

  const peaks: number[] = [];
  const winDb: number[] = [];
  let bucketMax = 0, bucketFill = 0;
  let winSum = 0, winFill = 0;
  let clippedSamples = 0, runLen = 0;
  const clipStarts: number[] = [];
  let totalSamples = 0;
  let carry: Buffer | null = null; // хвост чанка, не кратный 4 байтам

  await new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", ["-v", "error", "-i", file, "-map", "a:0", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d: Buffer) => { err += d.toString(); if (err.length > 100_000) err = err.slice(-50_000); });
    p.stdout.on("data", (chunk: Buffer) => {
      let buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 4);
      carry = usable < buf.length ? buf.subarray(usable) : null;
      const n = usable / 4;
      for (let i = 0; i < n; i++) {
        const v = buf.readFloatLE(i * 4);
        const av = Math.abs(v);
        // пики
        if (av > bucketMax) bucketMax = av;
        if (++bucketFill >= bucketSize) { peaks.push(Number(bucketMax.toFixed(4))); bucketMax = 0; bucketFill = 0; }
        // клиппинг
        if (av >= CLIP_THRESHOLD) { runLen++; clippedSamples++; }
        else {
          if (runLen >= CLIP_RUN_MIN && clipStarts.length < 200) clipStarts.push(totalSamples - runLen);
          runLen = 0;
        }
        // RMS-окна
        winSum += v * v;
        if (++winFill >= win) {
          const rms = Math.sqrt(winSum / winFill);
          winDb.push(rms > 0 ? 20 * Math.log10(rms) : -120);
          winSum = 0; winFill = 0;
        }
        totalSamples++;
      }
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg decode: ${err.slice(0, 300)}`));
      else resolve();
    });
  });
  if (runLen >= CLIP_RUN_MIN && clipStarts.length < 200) clipStarts.push(totalSamples - runLen);
  if (winFill > 0) {
    const rms = Math.sqrt(winSum / winFill);
    winDb.push(rms > 0 ? 20 * Math.log10(rms) : -120);
  }
  if (bucketFill > 0) peaks.push(Number(bucketMax.toFixed(4)));
  return { totalSamples, peaks: peaks.slice(0, PEAK_BUCKETS), clippedSamples, clipStarts, winDb };
}

type ProbeInfo = {
  durationSec: number | null;
  sampleRateHz: number | null;
  channels: number | null;
  codec: string | null;
  bitDepth: number | null;
};

async function ffprobe(file: string): Promise<ProbeInfo> {
  const { stdout, code } = await run("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file]);
  if (code !== 0) throw new Error("ffprobe: не удалось прочитать аудиофайл");
  const j = JSON.parse(stdout.toString() || "{}");
  const audio = (j.streams ?? []).find((s: any) => s.codec_type === "audio");
  const bits = Number(audio?.bits_per_raw_sample || audio?.bits_per_sample || 0) || null;
  return {
    durationSec: Number(j.format?.duration) || Number(audio?.duration) || null,
    sampleRateHz: Number(audio?.sample_rate) || null,
    channels: Number(audio?.channels) || null,
    codec: (audio?.codec_name as string) || null,
    bitDepth: bits,
  };
}

/** Интегральная громкость + true peak через ebur128. */
async function loudness(file: string): Promise<{ integratedLufs: number | null; truePeakDb: number | null }> {
  const { stderr } = await run("ffmpeg", ["-v", "info", "-nostats", "-i", file, "-map", "a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { collectStdout: false });
  // Итоговая сводка в конце stderr:  I: -13.5 LUFS ... Peak: -0.8 dBFS
  const tail = stderr.slice(-4000);
  const i = tail.match(/I:\s*(-?[\d.]+)\s*LUFS/);
  const tp = tail.match(/Peak:\s*(-?[\d.]+)\s*dBFS/);
  return {
    integratedLufs: i ? Number(i[1]) : null,
    truePeakDb: tp ? Number(tp[1]) : null,
  };
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type AudioQcAnalysis = Omit<AudioQcRow, "id" | "analyzedAt">;

export async function analyzeAudioFile(trackId: number, objectPath: string, filePath: string): Promise<AudioQcAnalysis> {
  const probe = await ffprobe(filePath);
  const rate = 44100; // фиксированная частота анализа (потоковый декод, память O(1))
  const [{ integratedLufs, truePeakDb }, pcm] = await Promise.all([
    loudness(filePath),
    streamAnalyzePcm(filePath, rate, probe.durationSec ?? 300),
  ]);
  const durationSec = probe.durationSec ?? pcm.totalSamples / rate;

  // ── Пики волнограммы ── (посчитаны потоково)
  const peaks = pcm.peaks;

  // ── Клиппинг ──
  const clippedSamples = pcm.clippedSamples;
  const clippingEvents: { startSec: number; peakDb: number | null }[] =
    pcm.clipStarts.slice(0, 20).map((s) => ({ startSec: Number((s / rate).toFixed(2)), peakDb: truePeakDb }));
  const distortion = pcm.totalSamples > 0 && clippedSamples / pcm.totalSamples > DISTORTION_RATIO;

  // ── Тишина / мёртвый воздух (окна по 100 мс, из того же потока) ──
  const winDb = pcm.winDb;
  const silences: { startSec: number; endSec: number }[] = [];
  let silStart: number | null = null;
  for (let w = 0; w <= winDb.length; w++) {
    const silent = w < winDb.length && winDb[w] < SILENCE_DB;
    if (silent && silStart === null) silStart = w;
    if (!silent && silStart !== null) {
      const startSec = silStart / 10, endSec = w / 10;
      if (endSec - startSec >= SILENCE_MIN_SEC) silences.push({ startSec: Number(startSec.toFixed(1)), endSec: Number(endSec.toFixed(1)) });
      silStart = null;
    }
  }
  // Хвостовая тишина = dead air (не считаем её обычной «паузой»).
  let deadAir: { startSec: number; endSec: number } | null = null;
  const last = silences[silences.length - 1];
  if (last && durationSec - last.endSec < 0.5 && last.endSec - last.startSec >= DEAD_AIR_MIN_SEC) {
    deadAir = last;
    silences.pop();
  }
  // Начальную тишину тоже не считаем «паузой» внутри трека.
  if (silences.length > 0 && silences[0].startSec < 0.3) silences.shift();

  // ── Fade in / fade out (по 100-мс RMS-окнам) ──
  const meanDb = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : -120);
  const overallDb = meanDb(winDb);
  const musicEndWin = Math.max(1, Math.floor((deadAir ? deadAir.startSec : durationSec) * 10));
  const headDb = meanDb(winDb.slice(0, 7));
  const tailDb = meanDb(winDb.slice(Math.max(0, musicEndWin - 7), musicEndWin));
  const fadeIn = headDb < overallDb - 8;   // начало заметно тише среднего → плавный вход
  const fadeOut = tailDb < overallDb - 8;  // конец заметно тише среднего → есть затухание

  // ── Сводка замечаний ──
  const issues: AudioQcIssue[] = [];
  if (clippingEvents.length > 0) {
    issues.push({
      code: "clipping", severity: "error",
      message: `Audio clipped at ${fmtTime(clippingEvents[0].startSec)}${truePeakDb != null ? ` (True Peak: ${truePeakDb > 0 ? "+" : ""}${truePeakDb.toFixed(1)} dBTP)` : ""}${clippingEvents.length > 1 ? ` — событий: ${clippingEvents.length}` : ""}`,
      startSec: clippingEvents[0].startSec,
    });
  }
  if (distortion) {
    issues.push({ code: "distortion", severity: "error", message: "Обнаружены искажения (перегруз сигнала на значительной части трека)" });
  }
  for (const s of silences.slice(0, 5)) {
    issues.push({
      code: "silence", severity: "warning",
      message: `Silence detected: ${fmtTime(s.startSec)} – ${fmtTime(s.endSec)} (${Math.round(s.endSec - s.startSec)} сек)`,
      startSec: s.startSec, endSec: s.endSec,
    });
  }
  if (deadAir) {
    issues.push({
      code: "dead_air", severity: "warning",
      message: `Dead Air (пустой звук в конце): ${fmtTime(deadAir.startSec)} – ${fmtTime(deadAir.endSec)}`,
      startSec: deadAir.startSec, endSec: deadAir.endSec,
    });
  }
  if (!fadeIn) issues.push({ code: "fade_in_missing", severity: "info", message: "Fade In не обнаружен (трек начинается резко)" });
  if (!fadeOut) issues.push({ code: "fade_out_missing", severity: "info", message: "Fade Out не обнаружен (трек обрывается без затухания)" });
  if (truePeakDb != null && truePeakDb > -1) {
    issues.push({ code: "loudness", severity: "warning", message: `True Peak ${truePeakDb > 0 ? "+" : ""}${truePeakDb.toFixed(1)} dBTP выше рекомендуемого −1 dBTP — DSP могут добавить искажения при транскодировании` });
  }
  if (integratedLufs != null && integratedLufs > -8) {
    issues.push({ code: "loudness", severity: "warning", message: `Слишком высокая громкость: ${integratedLufs.toFixed(1)} LUFS (DSP нормализуют к −14 LUFS)` });
  }
  if (probe.sampleRateHz != null && probe.sampleRateHz < 44100) {
    issues.push({ code: "sample_rate", severity: "error", message: `Sample Rate ${(probe.sampleRateHz / 1000).toFixed(1)} kHz ниже минимума 44.1 kHz` });
  }
  if (probe.channels === 1) {
    issues.push({ code: "channels", severity: "warning", message: "Аудио моно — большинство DSP ожидают стерео" });
  }

  const status = issues.some((i) => i.severity === "error") ? "error"
    : issues.some((i) => i.severity === "warning") ? "warning" : "pass";

  return {
    trackId,
    objectPath,
    durationSec: durationSec != null ? Number(durationSec.toFixed(2)) : null,
    sampleRateHz: probe.sampleRateHz,
    channels: probe.channels,
    codec: probe.codec,
    bitDepth: probe.bitDepth,
    integratedLufs,
    truePeakDb,
    fadeIn,
    fadeOut,
    distortion,
    clippedSamples,
    clippingEvents,
    silences,
    deadAir,
    peaks,
    issues,
    status,
  };
}

/**
 * Запускает анализ для трека (по его текущему audioUrl) и сохраняет результат.
 * Возвращает сохранённую строку или null, если у трека нет аудио/файл не найден.
 */
// Дедупликация: не гоняем два анализа одного трека одновременно
// (ленивый GET + POST + fire-and-forget после загрузки могут совпасть).
const inFlight = new Map<number, Promise<AudioQcRow | null>>();

export function runAudioQcForTrack(trackId: number): Promise<AudioQcRow | null> {
  const existing = inFlight.get(trackId);
  if (existing) return existing;
  const p = doRunAudioQc(trackId).finally(() => inFlight.delete(trackId));
  inFlight.set(trackId, p);
  return p;
}

async function doRunAudioQc(trackId: number): Promise<AudioQcRow | null> {
  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!track?.audioUrl) return null;
  const objectPath = track.audioUrl;

  // Ассет может быть «пуловым» (track_id=null) — ищем по objectPath (см. memory).
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.objectPath, objectPath));
  // Anti-IDOR: если ассет принадлежит другому артисту/треку, НЕ анализируем чужой
  // файл (audioUrl мог быть подставлен). Бесхозные ассеты (без владельца) — ок.
  if (asset) {
    const ownedByOtherTrack = asset.trackId != null && asset.trackId !== track.id;
    const ownedByOtherArtist = asset.artistId != null && asset.artistId !== track.artistId;
    if (ownedByOtherTrack || ownedByOtherArtist) return null;
  }
  const filePath = resolveAssetLocalPath(objectPath, asset?.storageKey ?? null);
  if (!filePath || !fs.existsSync(filePath)) return null;

  const analysis = await analyzeAudioFile(trackId, objectPath, filePath);
  // Stale-wins guard: за время анализа аудиофайл трека мог смениться —
  // не перезаписываем результат более нового файла устаревшим.
  const [fresh] = await db.select({ audioUrl: tracksTable.audioUrl }).from(tracksTable).where(eq(tracksTable.id, trackId));
  if (fresh?.audioUrl !== objectPath) return null;
  const [row] = await db.insert(audioQcTable)
    .values({ ...analysis, analyzedAt: new Date() })
    .onConflictDoUpdate({ target: audioQcTable.trackId, set: { ...analysis, analyzedAt: new Date() } })
    .returning();
  return row;
}

/**
 * Запуск после загрузки или замены аудио.
 *
 * Провал анализа записываем в ту же таблицу отдельным статусом. Раньше ошибка
 * уходила только в лог: на новом сервере не оказалось ffmpeg, анализ молча не
 * выполнялся, и в панели вместо волны была ровная полоса — понять, что дело в
 * сервере, а не в самом файле, было неоткуда.
 */
export function queueAudioQc(trackId: number): void {
  void runAudioQcForTrack(trackId).catch(async (e) => {
    const message = (e as Error).message ?? String(e);
    console.error(`[audio-qc] track ${trackId}: ${message}`);
    // ENOENT на ffmpeg/ffprobe означает, что анализатор не установлен, — это
    // чинится на сервере, а не в файле, и написать надо именно так.
    const missingTool = /ENOENT/.test(message) || /not found/i.test(message);
    try {
      // objectPath у таблицы обязателен — берём тот, что стоит у трека сейчас.
      const [t] = await db.select({ audioUrl: tracksTable.audioUrl }).from(tracksTable).where(eq(tracksTable.id, trackId));
      await db.insert(audioQcTable)
        .values({
          trackId,
          objectPath: t?.audioUrl ?? "",
          status: "failed",
          issues: [{
            code: missingTool ? "analyzer_missing" : "analysis_failed",
            severity: "error" as const,
            message: missingTool
              ? "Анализ аудио не выполнен: на сервере не установлен ffmpeg. Обратитесь к администратору."
              : `Анализ аудио не выполнен: ${message.slice(0, 200)}`,
          }],
          analyzedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: audioQcTable.trackId,
          set: { status: "failed", analyzedAt: new Date() },
        });
    } catch (writeErr) {
      console.error(`[audio-qc] track ${trackId}: не удалось записать отказ: ${(writeErr as Error).message}`);
    }
  });
}
