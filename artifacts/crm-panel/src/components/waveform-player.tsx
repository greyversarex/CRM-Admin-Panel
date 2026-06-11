// Плеер с визуализацией волнограммы (canvas).
//
// Нативный <audio> + Range-стриминг — воспроизведение стартует мгновенно.
// Волнограмма — псевдослучайные столбики, сгенерированные из хэша пути файла,
// поэтому одна и та же дорожка всегда выглядит одинаково.
// Клик по волнограмме — перемотка.
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2, AlertTriangle } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Простой детерминированный PRNG (mulberry32) — одинаковые бары для одного файла.
function makePRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Генерируем массив высот баров [0..1] для волнограммы.
function generateBars(seed: number, count: number): number[] {
  const rng = makePRNG(seed);
  const bars: number[] = [];
  // Создаём «волнообразный» паттерн с плавными переходами
  let prev = 0.4 + rng() * 0.3;
  for (let i = 0; i < count; i++) {
    const delta = (rng() - 0.5) * 0.3;
    let next = Math.max(0.08, Math.min(1.0, prev + delta));
    // Добавляем случайные пики
    if (rng() < 0.05) next = 0.7 + rng() * 0.3;
    if (rng() < 0.08) next = 0.05 + rng() * 0.1;
    bars.push(next);
    prev = next;
  }
  return bars;
}

const BAR_COUNT = 160;
const BAR_GAP = 1;

export function WaveformPlayer({
  objectPath,
  filename,
}: {
  objectPath: string;
  filename?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barsRef = useRef<number[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  // Генерируем стабильные бары по хэшу пути файла.
  useEffect(() => {
    barsRef.current = generateBars(hashString(objectPath), BAR_COUNT);
    setCanPlay(false);
    setError(false);
    setIsPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [objectPath]);

  const drawWaveform = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const bars = barsRef.current;
    const barW = (width - BAR_GAP * (bars.length - 1)) / bars.length;
    const playedIdx = Math.floor(progress * bars.length);

    for (let i = 0; i < bars.length; i++) {
      const x = i * (barW + BAR_GAP);
      const barH = Math.max(2, bars[i] * height);
      const y = (height - barH) / 2;

      ctx.fillStyle = i < playedIdx
        ? "rgba(99, 102, 241, 0.9)"   // indigo-500 — воспроизведено
        : "rgba(148, 163, 184, 0.35)"; // slate-400 — ещё не воспроизведено

      // Скруглённые столбики
      const radius = Math.min(barW / 2, 2);
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, radius);
      ctx.fill();
    }
  }, []);

  // Перерисовываем при каждом изменении текущего времени.
  useEffect(() => {
    const progress = duration > 0 ? current / duration : 0;
    drawWaveform(progress);
  }, [current, duration, drawWaveform]);

  // Первая отрисовка (пустая волна) при монтировании и смене файла.
  useEffect(() => {
    drawWaveform(0);
  }, [objectPath, drawWaveform]);

  // Масштабируем canvas под реальный DPR.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
    drawWaveform(duration > 0 ? current / duration : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(true);
      });
    } else {
      a.pause();
    }
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const a = audioRef.current;
    const canvas = canvasRef.current;
    if (!a || !canvas || !canPlay || !isFinite(duration) || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = Math.max(0, Math.min(duration, ratio * duration));
    a.currentTime = time;
    setCurrent(time);
  };

  return (
    <div className="rounded-md border border-primary/40 bg-[#0f1117] p-3 space-y-2">
      <div className="flex items-center gap-3">
        {/* Кнопка Play/Pause */}
        <Button
          type="button"
          size="icon"
          className="shrink-0 h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
          disabled={!canPlay || error}
          onClick={togglePlay}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          style={{ boxShadow: "none" }}
        >
          {!canPlay && !error ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>

        {/* Временная метка — начало */}
        <span className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0 w-8">
          {fmt(current)}
        </span>

        {/* Волнограмма */}
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="flex-1 h-14"
          style={{ cursor: canPlay ? "pointer" : "default" }}
          aria-label="Волнограмма — клик для перемотки"
        />

        {/* Временная метка — конец */}
        <span className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0 w-10 text-right">
          {error ? "—" : fmt(duration)}
        </span>
      </div>

      {/* Имя файла */}
      {filename && (
        <div className="text-[11px] text-muted-foreground truncate pl-12">{filename}</div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-rose-300 pl-12">
          <AlertTriangle className="h-3.5 w-3.5" /> Не удалось загрузить аудио.
        </div>
      )}

      <audio
        ref={audioRef}
        src={assetHref(objectPath)}
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          setCanPlay(true);
        }}
        onCanPlay={() => setCanPlay(true)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError(true)}
        className="hidden"
      />
    </div>
  );
}
