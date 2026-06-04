// Плеер для прослушивания загруженного аудио прямо в карточке трека.
//
// Воспроизведение: нативный <audio> стримит файл по диапазонам (Range), поэтому
// звук стартует почти мгновенно при любом размере файла.
//
// Волна (waveform): считается на сервере (endpoint .../peaks) и приходит как
// маленький JSON-массив пиков. Браузеру НЕ нужно качать весь файл ради картинки.
// Рисуем пики на <canvas>; кликом по волне можно перематывать. Если сервер не
// смог декодировать формат (например m4a/aac) — показываем тонкую полосу
// перемотки вместо волны, звук при этом играет.
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

const WAVE_HEIGHT = 56;

export function WaveformPlayer({
  objectPath,
  filename,
}: {
  objectPath: string;
  filename?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[] | null>(null);

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  // Сброс состояния и загрузка пиков при смене файла.
  useEffect(() => {
    setCanPlay(false);
    setError(false);
    setIsPlaying(false);
    setCurrent(0);
    setDuration(0);
    setSeeking(false);
    setPeaks(null);
    peaksRef.current = null;

    let cancelled = false;
    const ctrl = new AbortController();
    fetch(`${assetHref(objectPath)}/peaks?samples=800`, {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.peaks) && data.peaks.length > 0) {
          peaksRef.current = data.peaks;
          setPeaks(data.peaks);
        }
        if (typeof data.duration === "number" && data.duration > 0) {
          setDuration((d) => d || data.duration);
        }
      })
      .catch(() => {
        /* нет волны — покажем полосу перемотки */
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [objectPath]);

  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    const pk = peaksRef.current;
    if (!canvas || !pk || pk.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1;
    const cssH = WAVE_HEIGHT;
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const styles = getComputedStyle(canvas);
    const primary = styles.getPropertyValue("--primary").trim() || "243 75% 59%";
    const played = `hsl(${primary})`;
    const unplayed = `hsl(${primary} / 0.28)`;

    const progress = duration > 0 ? current / duration : 0;
    const n = pk.length;
    const gap = 1;
    const barW = Math.max(1, cssW / n - gap);
    const mid = cssH / 2;

    for (let i = 0; i < n; i++) {
      const x = (i / n) * cssW;
      const h = Math.max(2, pk[i] * (cssH - 4));
      ctx.fillStyle = i / n <= progress ? played : unplayed;
      ctx.beginPath();
      const r = Math.min(barW / 2, 1.5);
      const y = mid - h / 2;
      // прямоугольник со скруглёнными краями
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + barW, y, x + barW, y + h, r);
      ctx.arcTo(x + barW, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + barW, y, r);
      ctx.closePath();
      ctx.fill();
    }
  }, [current, duration]);

  // Перерисовываем волну при изменении прогресса/размеров.
  useEffect(() => {
    drawWave();
  }, [drawWave, peaks]);

  useEffect(() => {
    if (!peaks) return;
    const ro = new ResizeObserver(() => drawWave());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [peaks, drawWave]);

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

  const seekTo = (value: number) => {
    const a = audioRef.current;
    if (!a || !isFinite(value)) return;
    a.currentTime = value;
    setCurrent(value);
  };

  const seekFromPointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekTo(frac * duration);
  };

  const progressPct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="shrink-0 h-10 w-10 rounded-full"
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

        <div className="flex-1 min-w-0">
          {filename && (
            <div className="text-xs text-muted-foreground truncate mb-1.5">{filename}</div>
          )}

          {peaks ? (
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: WAVE_HEIGHT, display: "block" }}
              className={`rounded ${!canPlay || error ? "opacity-50" : "cursor-pointer"}`}
              onPointerDown={(e) => {
                if (!canPlay || error) return;
                setSeeking(true);
                e.currentTarget.setPointerCapture(e.pointerId);
                seekFromPointer(e.clientX);
              }}
              onPointerMove={(e) => {
                if (seeking) seekFromPointer(e.clientX);
              }}
              onPointerUp={() => setSeeking(false)}
              onPointerCancel={() => setSeeking(false)}
            />
          ) : (
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              disabled={!canPlay || error}
              onPointerDown={() => setSeeking(true)}
              onPointerUp={() => setSeeking(false)}
              onPointerCancel={() => setSeeking(false)}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="audio-seek w-full"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) ${progressPct}%, hsl(var(--muted)) ${progressPct}%)`,
              }}
              aria-label="Перемотка"
            />
          )}
        </div>

        <div className="shrink-0 text-[11px] font-mono text-muted-foreground tabular-nums w-[88px] text-right">
          {error ? "—" : `${fmt(current)} / ${fmt(duration)}`}
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Не удалось загрузить аудио для предпрослушивания.
        </div>
      )}

      <audio
        ref={audioRef}
        src={assetHref(objectPath)}
        preload="metadata"
        onLoadedMetadata={(e) => {
          if (isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
            setDuration((d) => d || e.currentTarget.duration);
          }
          setCanPlay(true);
        }}
        onCanPlay={() => setCanPlay(true)}
        onTimeUpdate={(e) => {
          if (!seeking) setCurrent(e.currentTarget.currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError(true)}
        className="hidden"
      />
    </div>
  );
}
