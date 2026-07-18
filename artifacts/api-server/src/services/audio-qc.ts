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
const ANALYZE_RATE = 8000;         // Гц: даунсэмпл для детекторов пауз/фейдов
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

/** Декодирует файл в mono f32le PCM указанной частоты. */
async function decodePcm(file: string, rate: number): Promise<Float32Array> {
  const { stdout, code, stderr } = await run("ffmpeg", [
    "-v", "error", "-i", file, "-map", "a:0", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-",
  ]);
  if (code !== 0) throw new Error(`ffmpeg decode: ${stderr.slice(0, 300)}`);
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
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

function rmsDb(pcm: Float32Array, from: number, to: number): number {
  let sum = 0; let n = 0;
  for (let i = Math.max(0, from); i < Math.min(pcm.length, to); i++) { sum += pcm[i] * pcm[i]; n++; }
  if (n === 0) return -120;
  const rms = Math.sqrt(sum / n);
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type AudioQcAnalysis = Omit<AudioQcRow, "id" | "analyzedAt">;

export async function analyzeAudioFile(trackId: number, objectPath: string, filePath: string): Promise<AudioQcAnalysis> {
  const probe = await ffprobe(filePath);
  const [{ integratedLufs, truePeakDb }, pcmFull, pcmLow] = await Promise.all([
    loudness(filePath),
    decodePcm(filePath, probe.sampleRateHz ?? 44100), // полная частота — для клиппинга и пиков
    decodePcm(filePath, ANALYZE_RATE),                // даунсэмпл — для пауз/фейдов
  ]);
  const rate = probe.sampleRateHz ?? 44100;
  const durationSec = probe.durationSec ?? pcmFull.length / rate;

  // ── Пики волнограммы ──
  const peaks: number[] = [];
  const bucket = Math.max(1, Math.floor(pcmFull.length / PEAK_BUCKETS));
  for (let b = 0; b < PEAK_BUCKETS && b * bucket < pcmFull.length; b++) {
    let mx = 0;
    const end = Math.min(pcmFull.length, (b + 1) * bucket);
    for (let i = b * bucket; i < end; i++) { const v = Math.abs(pcmFull[i]); if (v > mx) mx = v; }
    peaks.push(Number(mx.toFixed(4)));
  }

  // ── Клиппинг ──
  let clippedSamples = 0;
  const clippingEvents: { startSec: number; peakDb: number | null }[] = [];
  let runLen = 0;
  for (let i = 0; i < pcmFull.length; i++) {
    if (Math.abs(pcmFull[i]) >= CLIP_THRESHOLD) {
      runLen++;
      clippedSamples++;
    } else {
      if (runLen >= CLIP_RUN_MIN && clippingEvents.length < 20) {
        clippingEvents.push({ startSec: Number(((i - runLen) / rate).toFixed(2)), peakDb: truePeakDb });
      }
      runLen = 0;
    }
  }
  if (runLen >= CLIP_RUN_MIN && clippingEvents.length < 20) {
    clippingEvents.push({ startSec: Number(((pcmFull.length - runLen) / rate).toFixed(2)), peakDb: truePeakDb });
  }
  const distortion = pcmFull.length > 0 && clippedSamples / pcmFull.length > DISTORTION_RATIO;

  // ── Тишина / мёртвый воздух (окна по 100 мс на даунсэмпле) ──
  const win = Math.floor(ANALYZE_RATE / 10);
  const winDb: number[] = [];
  for (let i = 0; i + win <= pcmLow.length; i += win) winDb.push(rmsDb(pcmLow, i, i + win));
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

  // ── Fade in / fade out ──
  const overallDb = rmsDb(pcmLow, 0, pcmLow.length);
  const musicEndSec = deadAir ? deadAir.startSec : durationSec;
  const headDb = rmsDb(pcmLow, 0, Math.floor(0.7 * ANALYZE_RATE));
  const tailDb = rmsDb(pcmLow, Math.floor((musicEndSec - 0.7) * ANALYZE_RATE), Math.floor(musicEndSec * ANALYZE_RATE));
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
export async function runAudioQcForTrack(trackId: number): Promise<AudioQcRow | null> {
  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!track?.audioUrl) return null;

  // Ассет может быть «пуловым» (track_id=null) — ищем по objectPath (см. memory).
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.objectPath, track.audioUrl));
  const filePath = resolveAssetLocalPath(track.audioUrl, asset?.storageKey ?? null);
  if (!filePath || !fs.existsSync(filePath)) return null;

  const analysis = await analyzeAudioFile(trackId, track.audioUrl, filePath);
  const [row] = await db.insert(audioQcTable)
    .values({ ...analysis, analyzedAt: new Date() })
    .onConflictDoUpdate({ target: audioQcTable.trackId, set: { ...analysis, analyzedAt: new Date() } })
    .returning();
  return row;
}

/** Fire-and-forget запуск (после загрузки/замены аудио). Ошибки — только в лог. */
export function queueAudioQc(trackId: number): void {
  void runAudioQcForTrack(trackId).catch((e) => {
    console.error(`[audio-qc] track ${trackId}: ${(e as Error).message}`);
  });
}
