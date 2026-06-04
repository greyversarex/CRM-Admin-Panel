// Расчёт формы волны (waveform) аудиофайла на сервере.
//
// Зачем на сервере: чтобы браузеру не приходилось скачивать и декодировать весь
// файл (мастер .wav бывает 40–60 МБ) ради картинки волны. Сервер один раз
// считает компактный массив пиков (0..1), кладёт его рядом с файлом в кэш
// (`<file>.peaks.json`) и отдаёт как маленький JSON. Само воспроизведение идёт
// потоком по Range-запросам и стартует мгновенно.
import { promises as fs } from "fs";
import decode from "audio-decode";
import type { LocalFile } from "./objectStorage";

const PEAKS_VERSION = 1;
const MAX_DECODE_BYTES = 220 * 1024 * 1024; // не декодируем гигантские файлы в память

export interface PeaksResult {
  version: number;
  peaks: number[]; // нормализованные амплитуды 0..1
  samples: number; // число столбиков (peaks.length)
  duration: number; // секунды
  channels: number;
  sampleRate: number;
}

function sidecarPath(file: LocalFile): string {
  return `${file.fullPath()}.peaks.json`;
}

async function readCache(file: LocalFile, samples: number): Promise<PeaksResult | null> {
  try {
    const txt = await fs.readFile(sidecarPath(file), "utf8");
    const data = JSON.parse(txt) as PeaksResult;
    if (data?.version === PEAKS_VERSION && data.samples === samples && Array.isArray(data.peaks)) {
      return data;
    }
  } catch {
    /* кэша нет — посчитаем */
  }
  return null;
}

async function writeCache(file: LocalFile, result: PeaksResult): Promise<void> {
  try {
    await fs.writeFile(sidecarPath(file), JSON.stringify(result), "utf8");
  } catch {
    /* кэш — не критично; молча игнорируем сбой записи */
  }
}

/**
 * Считает (или берёт из кэша) форму волны для аудиофайла.
 * Возвращает null, если файл невозможно декодировать (например m4a/aac,
 * который не поддерживается чистым JS-декодером) или он слишком большой —
 * в этом случае фронтенд показывает плеер без волны, но звук всё равно играет.
 */
export async function getAudioPeaks(
  file: LocalFile,
  samples = 800,
): Promise<PeaksResult | null> {
  const n = Math.max(64, Math.min(2000, Math.floor(samples)));

  const cached = await readCache(file, n);
  if (cached) return cached;

  let sizeBytes = 0;
  try {
    const [meta] = await file.getMetadata();
    sizeBytes = Number(meta.size ?? 0);
  } catch {
    /* размер не критичен */
  }
  if (sizeBytes > MAX_DECODE_BYTES) return null;

  let audio: { channelData: Float32Array[]; sampleRate: number };
  try {
    const buf = await fs.readFile(file.fullPath());
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    audio = (await decode(ab)) as { channelData: Float32Array[]; sampleRate: number };
  } catch {
    return null; // неподдерживаемый кодек / битый файл
  }

  const channels = audio.channelData;
  if (!channels.length || !channels[0]?.length) return null;
  const len = channels[0].length;
  const block = Math.max(1, Math.floor(len / n));

  const peaks: number[] = new Array(n);
  let globalMax = 0;
  for (let i = 0; i < n; i++) {
    const start = i * block;
    let bucketMax = 0;
    for (let j = 0; j < block; j++) {
      const idx = start + j;
      if (idx >= len) break;
      for (let c = 0; c < channels.length; c++) {
        const v = Math.abs(channels[c][idx] || 0);
        if (v > bucketMax) bucketMax = v;
      }
    }
    peaks[i] = bucketMax;
    if (bucketMax > globalMax) globalMax = bucketMax;
  }

  // Нормализуем к пику, чтобы тихие треки тоже были видны. Округляем до 3 знаков
  // для компактности JSON.
  const norm = globalMax > 0 ? 1 / globalMax : 1;
  for (let i = 0; i < n; i++) {
    peaks[i] = Math.round(peaks[i] * norm * 1000) / 1000;
  }

  const result: PeaksResult = {
    version: PEAKS_VERSION,
    peaks,
    samples: n,
    duration: len / audio.sampleRate,
    channels: channels.length,
    sampleRate: audio.sampleRate,
  };
  await writeCache(file, result);
  return result;
}
