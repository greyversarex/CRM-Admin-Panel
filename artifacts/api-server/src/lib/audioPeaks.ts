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

const PEAKS_VERSION = 2;
// Ограничения, чтобы декодирование не съело всю память сервера (защита от OOM/DoS):
const MAX_FILE_BYTES = 200 * 1024 * 1024; // не читаем в память файл крупнее upload-лимита
const MAX_PCM_BYTES = 1_200 * 1024 * 1024; // оценка разжатого PCM (≈55 мин стерео 44.1кГц)
const MAX_CONCURRENT_DECODES = 2; // одновременно декодируем не более N файлов

export interface PeaksResult {
  version: number;
  peaks: number[]; // нормализованные амплитуды 0..1 (пусто, если декод невозможен)
  samples: number; // число столбиков (peaks.length)
  duration: number | null; // секунды
  channels: number;
  sampleRate: number;
  failed?: boolean; // true → файл нельзя/не нужно декодировать (формат/размер)
}

export interface DecodeHint {
  durationSeconds?: number | null;
  sampleRateHz?: number | null;
  channels?: number | null;
}

// ─── Простой семафор: не запускаем больше N декодов одновременно ──────────
let active = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_DECODES) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

function sidecarPath(file: LocalFile): string {
  return `${file.fullPath()}.peaks.json`;
}

async function readCache(file: LocalFile, samples: number): Promise<PeaksResult | null> {
  try {
    const txt = await fs.readFile(sidecarPath(file), "utf8");
    const data = JSON.parse(txt) as PeaksResult;
    if (data?.version !== PEAKS_VERSION) return null;
    // Негативный кэш (failed) валиден независимо от числа столбиков.
    if (data.failed) return data;
    if (data.samples === samples && Array.isArray(data.peaks)) return data;
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

function failedResult(samples: number): PeaksResult {
  return { version: PEAKS_VERSION, peaks: [], samples, duration: null, channels: 0, sampleRate: 0, failed: true };
}

/**
 * Считает (или берёт из кэша) форму волны для аудиофайла.
 * Возвращает результат с `failed: true` и пустыми peaks, если файл невозможно
 * декодировать (m4a/aac — чистый JS-декодер их не тянет), он слишком большой,
 * или разжатый PCM не помещается в бюджет памяти. В этом случае фронтенд
 * показывает плеер без волны, но звук всё равно играет.
 */
export async function getAudioPeaks(
  file: LocalFile,
  samples = 800,
  hint: DecodeHint = {},
): Promise<PeaksResult> {
  const n = Math.max(64, Math.min(2000, Math.floor(samples)));

  const cached = await readCache(file, n);
  if (cached) return cached;

  // 1) Не читаем в память слишком большой файл.
  let sizeBytes = 0;
  try {
    const [meta] = await file.getMetadata();
    sizeBytes = Number(meta.size ?? 0);
  } catch {
    /* размер не критичен */
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    const r = failedResult(n);
    await writeCache(file, r);
    return r;
  }

  // 2) Оцениваем размер разжатого PCM по метаданным ассета (если они есть) и
  //    отказываемся декодировать заведомо гигантские записи.
  const estChannels = hint.channels && hint.channels > 0 ? hint.channels : 2;
  const estRate = hint.sampleRateHz && hint.sampleRateHz > 0 ? hint.sampleRateHz : 44100;
  if (hint.durationSeconds && hint.durationSeconds > 0) {
    const estPcm = hint.durationSeconds * estRate * estChannels * 4; // Float32
    if (estPcm > MAX_PCM_BYTES) {
      const r = failedResult(n);
      await writeCache(file, r);
      return r;
    }
  }

  await acquire();
  try {
    // Повторная проверка кэша: пока ждали семафор, его мог посчитать другой запрос.
    const again = await readCache(file, n);
    if (again) return again;

    let audio: { channelData: Float32Array[]; sampleRate: number };
    try {
      const buf = await fs.readFile(file.fullPath());
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      audio = (await decode(ab)) as { channelData: Float32Array[]; sampleRate: number };
    } catch {
      const r = failedResult(n); // неподдерживаемый кодек / битый файл
      await writeCache(file, r);
      return r;
    }

    const channels = audio.channelData;
    if (!channels.length || !channels[0]?.length) {
      const r = failedResult(n);
      await writeCache(file, r);
      return r;
    }

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

    // Нормализуем к пику, чтобы тихие треки тоже были видны. Округляем до 3 знаков.
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
  } finally {
    release();
  }
}
