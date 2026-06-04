// Плеер для прослушивания загруженного аудио прямо в карточке трека.
//
// Раньше здесь использовался wavesurfer.js, который ПОЛНОСТЬЮ скачивал файл
// (44 МБ .wav ≈ 45 секунд) и только потом декодировал волну и включал кнопку
// play. Из-за этого плеер выглядел «зависшим» на спиннере.
//
// Теперь используется нативный <audio>: он стримит файл по диапазонам
// (Range-запросы поддержаны на сервере), поэтому воспроизведение стартует почти
// мгновенно и работает для файлов любого размера.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2, AlertTriangle } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function WaveformPlayer({
  objectPath,
  filename,
}: {
  objectPath: string;
  filename?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  // Пересоздаём состояние при смене файла.
  useEffect(() => {
    setCanPlay(false);
    setError(false);
    setIsPlaying(false);
    setCurrent(0);
    setDuration(0);
    setSeeking(false);
  }, [objectPath]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((err: unknown) => {
        // AbortError возникает при быстрой смене источника — это не ошибка загрузки.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(true);
      });
    } else {
      a.pause();
    }
  };

  const onSeek = (value: number) => {
    const a = audioRef.current;
    if (!a || !isFinite(value)) return;
    a.currentTime = value;
    setCurrent(value);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

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
            onChange={(e) => onSeek(Number(e.target.value))}
            className="audio-seek w-full"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, hsl(var(--muted)) ${progress}%)`,
            }}
            aria-label="Перемотка"
          />
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
          setDuration(e.currentTarget.duration || 0);
          setCanPlay(true);
        }}
        onCanPlay={() => setCanPlay(true)}
        onTimeUpdate={(e) => {
          if (!seeking) setCurrent(e.currentTarget.currentTime);
        }}
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
