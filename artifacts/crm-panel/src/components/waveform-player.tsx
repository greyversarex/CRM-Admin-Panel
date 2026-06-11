// Аудиоплеер с визуализацией волнограммы (Canvas + нативный <audio>).
// Нативный <audio> с Range-стримингом — воспроизведение стартует мгновенно.
// Волнограмма генерируется детерминированно из хэша пути файла.
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2, AlertTriangle } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makePRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBars(seed: number, count: number): number[] {
  const rng = makePRNG(seed);
  const raw: number[] = [];
  let v = 0.4 + rng() * 0.3;
  for (let i = 0; i < count; i++) {
    v = Math.max(0.06, Math.min(1, v + (rng() - 0.5) * 0.28));
    if (rng() < 0.04) v = 0.75 + rng() * 0.25;
    if (rng() < 0.07) v = 0.04 + rng() * 0.08;
    raw.push(v);
  }
  // Нормализуем: максимум всегда 1.0
  const mx = Math.max(...raw);
  return raw.map((x) => x / mx);
}

const BAR_COUNT = 180;

export function WaveformPlayer({
  objectPath,
  filename,
}: {
  objectPath: string;
  filename?: string | null;
}) {
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barsRef   = useRef<number[]>([]);
  const rafRef    = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [canPlay,   setCanPlay]   = useState(false);
  const [error,     setError]     = useState(false);
  const [current,   setCurrent]   = useState(0);
  const [duration,  setDuration]  = useState(0);

  useEffect(() => {
    barsRef.current = generateBars(hashString(objectPath), BAR_COUNT);
    setCanPlay(false); setError(false); setIsPlaying(false);
    setCurrent(0);     setDuration(0);
  }, [objectPath]);

  const draw = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const bars = barsRef.current;
    const gap  = 2;
    const barW = (W - gap * (bars.length - 1)) / bars.length;
    const playedIdx = Math.floor(progress * bars.length);

    for (let i = 0; i < bars.length; i++) {
      const x    = i * (barW + gap);
      const barH = Math.max(3, bars[i] * H * 0.9);
      const y    = (H - barH) / 2;

      // Сыгранная часть — индиго, несыгранная — серая
      if (i < playedIdx) {
        ctx.fillStyle = "rgba(129, 140, 248, 0.95)"; // indigo-400
      } else {
        ctx.fillStyle = "rgba(148, 163, 184, 0.30)"; // slate-400
      }

      // fillRect — безопасная альтернатива roundRect (поддерживается везде)
      ctx.fillRect(x, y, barW, barH);
    }
  }, []);

  // Перерисовываем через rAF чтобы не перегружать рендер.
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      draw(duration > 0 ? current / duration : 0);
    });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [current, duration, draw]);

  // ResizeObserver — корректно масштабируем canvas при изменении ширины контейнера.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      try {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0); // universally supported
          ctx.scale(dpr, dpr);
        }
        draw(duration > 0 ? current / duration : 0);
      } catch {
        // canvas недоступен — игнорируем
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, objectPath]);

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
    if (!a || !canvas || !canPlay || !duration) return;
    const rect  = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(a.currentTime);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-[#0d0f18] px-4 py-3 space-y-1.5">
      {/* Основная строка: кнопка + время + волна + время */}
      <div className="flex items-center gap-3">
        {/* Play / Pause */}
        <Button
          type="button"
          size="icon"
          className="shrink-0 h-9 w-9 rounded-full bg-primary hover:bg-primary/80 text-white border-0"
          style={{ boxShadow: "none", minHeight: 0 }}
          disabled={!canPlay || error}
          onClick={togglePlay}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        >
          {!canPlay && !error ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>

        {/* Текущее время */}
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground tabular-nums w-9">
          {fmt(current)}
        </span>

        {/* Волнограмма */}
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="flex-1 h-12 block"
          style={{ cursor: canPlay && !error ? "pointer" : "default" }}
          aria-label="Волнограмма"
        />

        {/* Продолжительность */}
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground tabular-nums w-9 text-right">
          {error ? "—" : fmt(duration)}
        </span>
      </div>

      {/* Имя файла или ошибка */}
      {error ? (
        <div className="flex items-center gap-1.5 text-xs text-rose-400 pl-12">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Не удалось загрузить аудио для предпрослушивания.
        </div>
      ) : filename ? (
        <div className="text-[11px] text-muted-foreground/70 truncate pl-12">{filename}</div>
      ) : null}

      <audio
        ref={audioRef}
        src={assetHref(objectPath)}
        preload="metadata"
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); setCanPlay(true); }}
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
