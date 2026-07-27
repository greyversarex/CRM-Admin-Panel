/**
 * Релиз-уровневое модальное окно "Music recognition matches by ACRCloud".
 * Аналог экрана распознавания в Symphonic/Revelator: аккордеон по всем трекам
 * релиза, у каждого — карточки совпадений с полным набором полей
 * (Scanned Segments, Matched Segment, Label Name, Album, UPC, ISRC,
 * Release Date, Confidence Score, Found On).
 *
 * Данные:      GET  /api/distribution/acr/checks?releaseId=X
 * Сканирование: POST /api/distribution/acr/scan | scan-full  { releaseId, trackId }
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ScanSearch, CheckCircle2, AlertTriangle, XCircle,
  Loader2, Play, Zap, ChevronDown, ChevronRight, Music2, Clock, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AcrCheckSegment = {
  index: number; startPct: number; endPct: number;
  status: "matched" | "clean" | "error";
  matchedTitle?: string | null; matchedArtist?: string | null; matchedIsrc?: string | null;
  score?: number | null; error?: string | null; tookMs?: number;
};

type AcrCheck = {
  id: number; releaseId: number | null; trackId: number | null;
  status: string; mode: string; engine: string;
  confidence: string | null;
  matchedTitle: string | null; matchedArtist: string | null;
  matchedIsrc: string | null; matchedLabel: string | null;
  segments: AcrCheckSegment[] | null;
  resultJson: Record<string, unknown> | null;
  errorMessage: string | null;
  scannedBy: number | null; scannedAt: string;
};

export type AcrModalTrack = {
  id: number;
  title: string;
  artist: string;
  trackNumber?: number | null;
};

const DASH = "—";

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v
  : (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
/** Имена артистов из массива {name} — устойчиво к чужим формам (не массив → null). */
const artistNames = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const names = v
    .map((a) => (a && typeof a === "object" ? (a as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === "string" && n.trim() !== "");
  return names.length ? names.join(", ") : null;
};
/** Ключи платформ из external_metadata — только если это объект (не массив/строка). */
const foundOnKeys = (v: unknown): string[] =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.keys(v as Record<string, unknown>).filter((k) => k !== "_scan_meta")
    : [];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

/** "2021-10-28" | ISO -> "Oct 28, 2021" (как на скринах). */
export function fmtReleaseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** миллисекунды -> "mm:ss" */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const DSP_BRANDS: Record<string, { label: string; color: string }> = {
  spotify:     { label: "Spotify",      color: "#1DB954" },
  deezer:      { label: "Deezer",       color: "#A238FF" },
  youtube:     { label: "YouTube",      color: "#FF0000" },
  apple_music: { label: "Apple Music",  color: "#FA243C" },
  applemusic:  { label: "Apple Music",  color: "#FA243C" },
  itunes:      { label: "iTunes",       color: "#FB5BC5" },
  amazon:      { label: "Amazon Music", color: "#00A8E1" },
  tidal:       { label: "Tidal",        color: "#38BDF8" },
  soundcloud:  { label: "SoundCloud",   color: "#FF5500" },
  musicbrainz: { label: "MusicBrainz",  color: "#BA478F" },
};
function dspInfo(key: string): { label: string; color: string } {
  const k = key.toLowerCase();
  return DSP_BRANDS[k] ?? { label: key.charAt(0).toUpperCase() + key.slice(1), color: "#8b8b8b" };
}

const enc = encodeURIComponent;

/** Объект по ключу: {track:{…}} -> {…}. Пустое/чужое -> null. */
function nestedNode(node: unknown, key: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const inner = (node as Record<string, unknown>)[key];
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null;
  return inner as Record<string, unknown>;
}

/** id как строка: ACRCloud шлёт их и числом (Deezer), и строкой (Spotify). */
function idOf(node: Record<string, unknown> | null): string | null {
  if (!node) return null;
  const id = node["id"];
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

/** Артисты внутри блока площадки: [{name,id}] -> только те, у кого есть id. */
function platformArtists(node: unknown): Array<{ name: string; id: string }> {
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  const arr = (node as Record<string, unknown>)["artists"];
  if (!Array.isArray(arr)) return [];
  const out: Array<{ name: string; id: string }> = [];
  for (const a of arr) {
    if (!a || typeof a !== "object") continue;
    const id = idOf(a as Record<string, unknown>);
    const name = asStr((a as Record<string, unknown>)["name"]);
    if (id && name) out.push({ name, id });
  }
  return out;
}

/** Одна ссылка на площадку. `kind` решает, как её подписать. */
export type PlatformLink = { kind: "track" | "album" | "artist"; url: string; label: string };
export type PlatformLinks = Record<string, PlatformLink[]>;

/**
 * Все ссылки, которые можно собрать из `external_metadata`.
 *
 * ACRCloud присылает не только id трека, но и id альбома и каждого артиста.
 * Раньше мы брали только трек и выбрасывали остальное — а модератору как раз
 * важно посмотреть и альбом (на каком сборнике издано), и артиста целиком.
 */
export function buildPlatformLinks(external: unknown): PlatformLinks {
  if (!external || typeof external !== "object" || Array.isArray(external)) return {};
  const meta = external as Record<string, unknown>;
  const out: PlatformLinks = {};

  for (const [key, node] of Object.entries(meta)) {
    const k = key.toLowerCase();
    const links: PlatformLink[] = [];

    const track = nestedNode(node, "track");
    const album = nestedNode(node, "album");
    const trackId = idOf(track);
    const albumId = idOf(album);
    const albumName = asStr(album?.["name"]);

    if (k === "spotify") {
      if (trackId) links.push({ kind: "track", url: `https://open.spotify.com/track/${enc(trackId)}`, label: "трек" });
      if (albumId) links.push({ kind: "album", url: `https://open.spotify.com/album/${enc(albumId)}`, label: albumName ?? "альбом" });
      for (const a of platformArtists(node)) {
        links.push({ kind: "artist", url: `https://open.spotify.com/artist/${enc(a.id)}`, label: a.name });
      }
    } else if (k === "deezer") {
      if (trackId) links.push({ kind: "track", url: `https://www.deezer.com/track/${enc(trackId)}`, label: "трек" });
      if (albumId) links.push({ kind: "album", url: `https://www.deezer.com/album/${enc(albumId)}`, label: albumName ?? "альбом" });
      for (const a of platformArtists(node)) {
        links.push({ kind: "artist", url: `https://www.deezer.com/artist/${enc(a.id)}`, label: a.name });
      }
    } else if (k === "youtube") {
      const vid = node && typeof node === "object" && !Array.isArray(node)
        ? asStr((node as Record<string, unknown>)["vid"]) : null;
      if (vid) links.push({ kind: "track", url: `https://www.youtube.com/watch?v=${enc(vid)}`, label: "видео" });
    } else if (k === "musicbrainz") {
      if (trackId) links.push({ kind: "track", url: `https://musicbrainz.org/recording/${enc(trackId)}`, label: "запись" });
    }

    if (links.length > 0) out[key] = links;
  }
  return out;
}

/**
 * Ссылки-поиск на площадки, которых нет в тарифе ACRCloud.
 *
 * ACRCloud на нашем аккаунте отдаёт id только для Spotify, Deezer, YouTube и
 * MusicBrainz — Apple Music, Tidal и остальные идут отдельным платным пакетом
 * метаданных. Точную ссылку без id не построить, но по ISRC (а если его нет —
 * по названию и артисту) поиск на площадке открывается сразу, и модератор
 * дальше проверяет глазами. Это НЕ подтверждённое совпадение, а именно поиск.
 */
export function buildSearchLinks(title: string, artist: string, isrc: string): PlatformLink[] {
  const q = isrc !== DASH && isrc ? isrc : [title, artist].filter((s) => s && s !== DASH).join(" ");
  if (!q.trim()) return [];
  return [
    { kind: "track", label: "Apple Music",  url: `https://music.apple.com/search?term=${enc(q)}` },
    { kind: "track", label: "YouTube Music", url: `https://music.youtube.com/search?q=${enc(q)}` },
    { kind: "track", label: "Tidal",        url: `https://listen.tidal.com/search?q=${enc(q)}` },
    { kind: "track", label: "Amazon Music", url: `https://music.amazon.com/search/${enc(q)}` },
    { kind: "track", label: "Discogs",      url: `https://www.discogs.com/search/?q=${enc(q)}&type=release` },
  ];
}

/**
 * Единая форма совпадения для отрисовки. Все поля уже приведены к строкам
 * (DASH вместо пустоты), чтобы карточка не занималась форматированием.
 * Экспортируется: тем же типом пользуется трековая модалка File Scanning.
 */
export type MatchArtist = { name: string; roles: string[] };
export type MatchSegment = {
  sampleFromMs: number | null; sampleToMs: number | null;
  dbFromMs: number | null; dbToMs: number | null;
  score: number | null;
};

export type RichMatch = {
  title: string;
  artist: string;
  scannedSegments: number | null;
  matchedSegment: string;
  label: string;
  album: string;
  upc: string;
  isrc: string;
  releaseDate: string;
  confidence: string;
  foundOn: string[];
  /** platform -> ссылки на трек, альбом и артистов. Площадки без id сюда не попадают. */
  platformLinks: PlatformLinks;
  /** Жанр по версии ACRCloud — может расходиться с заявленным у нас. */
  genres: string[];
  /** Артисты с ролями (MainArtist, Composer, Lyricist, …). */
  artistsDetailed: MatchArtist[];
  /** Длительность оригинала, мс. Сравнение с нашим файлом показывает, фрагмент это или целиком. */
  durationMs: number | null;
  /** Каждый совпавший участок отдельно, с таймкодами и в нашем файле, и в оригинале. */
  segmentsDetail: MatchSegment[];
};

/** `[{name,roles}]` из ответа ACRCloud или из нормализованного бэкендом поля. */
function parseArtistsDetailed(v: unknown): MatchArtist[] {
  if (!Array.isArray(v)) return [];
  const out: MatchArtist[] = [];
  for (const a of v) {
    if (!a || typeof a !== "object") continue;
    const rec = a as Record<string, unknown>;
    const name = asStr(rec["name"]);
    if (!name) continue;
    const roles = Array.isArray(rec["roles"])
      ? (rec["roles"] as unknown[]).filter((r): r is string => typeof r === "string" && r.trim() !== "")
      : [];
    out.push({ name, roles });
  }
  return out;
}

/** `[{name:"Dance/House"}]` -> `["Dance/House"]`. */
function parseGenres(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((g) => (g && typeof g === "object" ? asStr((g as Record<string, unknown>)["name"]) : asStr(g)))
    .filter((s): s is string => s !== null);
}

/** Участки, уже нормализованные бэкендом (`segmentsDetail`). */
function parseSegmentsDetail(v: unknown): MatchSegment[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
    .map((s) => ({
      sampleFromMs: asNum(s["sampleFromMs"]),
      sampleToMs: asNum(s["sampleToMs"]),
      dbFromMs: asNum(s["dbFromMs"]),
      dbToMs: asNum(s["dbToMs"]),
      score: asNum(s["score"]),
    }));
}

/** Достаём совпадения из resultJson (sample: metadata.music[]; full: top_match). */
function parseRichMatches(check: AcrCheck): RichMatch[] {
  const rj = check.resultJson ?? {};
  const segsScanned = Array.isArray(check.segments) ? check.segments.length : null;

  const offsetRange = (b: number | null, e: number | null, playOffset: number | null): string => {
    if (b != null && e != null) return `${mmss(b)} - ${mmss(e)}`;
    if (playOffset != null) return mmss(playOffset);
    return DASH;
  };

  // Sample scan — сырой ответ ACRCloud с богатыми метаданными.
  const metadata = rj["metadata"] as { music?: unknown } | undefined;
  const music = Array.isArray(metadata?.music) ? (metadata!.music as unknown[]) : [];
  if (music.length > 0) {
    return music.map((raw): RichMatch => {
      const m: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>) : {};
      const album = m["album"] as { name?: string } | undefined;
      const ext = m["external_ids"] as { isrc?: string; upc?: string } | undefined;
      const foundOn = foundOnKeys(m["external_metadata"]);
      const sampleFrom = asNum(m["sample_begin_time_offset_ms"]);
      const sampleTo = asNum(m["sample_end_time_offset_ms"]);
      const dbFrom = asNum(m["db_begin_time_offset_ms"]);
      const dbTo = asNum(m["db_end_time_offset_ms"]);
      return {
        title: asStr(m["title"]) ?? check.matchedTitle ?? DASH,
        artist: artistNames(m["artists"]) ?? check.matchedArtist ?? DASH,
        scannedSegments: segsScanned ?? 1,
        matchedSegment: offsetRange(
          asNum(m["sample_begin_time_offset_ms"]) ?? asNum(m["db_begin_time_offset_ms"]),
          asNum(m["sample_end_time_offset_ms"]) ?? asNum(m["db_end_time_offset_ms"]),
          asNum(m["play_offset_ms"]),
        ),
        label: asStr(m["label"]) ?? asStr(album?.name) ?? check.matchedLabel ?? DASH,
        album: asStr(album?.name) ?? DASH,
        upc: asStr(ext?.upc) ?? DASH,
        isrc: asStr(ext?.isrc) ?? check.matchedIsrc ?? DASH,
        releaseDate: fmtReleaseDate(asStr(m["release_date"])) ?? DASH,
        confidence: asNum(m["score"]) != null ? String(asNum(m["score"])) : (check.confidence ?? DASH),
        foundOn,
        platformLinks: buildPlatformLinks(m["external_metadata"]),
        genres: parseGenres(m["genres"]),
        artistsDetailed: parseArtistsDetailed(m["artists"]),
        durationMs: asNum(m["duration_ms"]),
        segmentsDetail: [{
          sampleFromMs: sampleFrom, sampleToMs: sampleTo,
          dbFromMs: dbFrom, dbToMs: dbTo,
          score: asNum(m["score"]),
        }],
      };
    });
  }

  // Full scan — нормализованный top_match (обогащён на бэкенде).
  const tm = rj["top_match"] as Record<string, unknown> | null | undefined;
  if (tm) {
    const foundOn = Array.isArray(tm["foundOn"]) ? (tm["foundOn"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    return [{
      title: asStr(tm["title"]) ?? check.matchedTitle ?? DASH,
      artist: asStr(tm["artist"]) ?? check.matchedArtist ?? DASH,
      scannedSegments: segsScanned,
      matchedSegment: offsetRange(asNum(tm["sampleBeginMs"]), asNum(tm["sampleEndMs"]), null),
      label: asStr(tm["label"]) ?? check.matchedLabel ?? DASH,
      album: asStr(tm["album"]) ?? DASH,
      upc: asStr(tm["upc"]) ?? DASH,
      isrc: asStr(tm["isrc"]) ?? check.matchedIsrc ?? DASH,
      releaseDate: fmtReleaseDate(asStr(tm["releaseDate"])) ?? DASH,
      confidence: asNum(tm["score"]) != null ? String(asNum(tm["score"])) : (check.confidence ?? DASH),
      foundOn,
      platformLinks: buildPlatformLinks(tm["externalMetadata"]),
      genres: parseGenres(tm["genres"]),
      artistsDetailed: parseArtistsDetailed(tm["artistsDetailed"]),
      durationMs: asNum(tm["durationMs"]),
      segmentsDetail: parseSegmentsDetail(tm["segmentsDetail"]),
    }];
  }

  // Совпадение есть, но без богатых метаданных — собираем из плоских колонок.
  if (check.status === "matched") {
    return [{
      title: check.matchedTitle ?? DASH,
      artist: check.matchedArtist ?? DASH,
      scannedSegments: segsScanned,
      matchedSegment: DASH,
      label: check.matchedLabel ?? DASH,
      album: DASH,
      upc: DASH,
      isrc: check.matchedIsrc ?? DASH,
      releaseDate: DASH,
      confidence: check.confidence ?? DASH,
      foundOn: [],
      platformLinks: {},
      genres: [],
      artistsDetailed: [],
      durationMs: null,
      segmentsDetail: [],
    }];
  }
  return [];
}

function StatusIcon({ status }: { status: string | undefined }) {
  if (status === "matched") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (status === "clean")   return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "pending") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
  if (status === "error")   return <XCircle className="h-4 w-4 text-rose-400" />;
  return <ScanSearch className="h-4 w-4 text-muted-foreground/60" />;
}

function statusLabel(status: string | undefined): string {
  return status === "matched" ? "Совпадение"
    : status === "clean" ? "Чисто"
    : status === "pending" ? "Сканируется"
    : status === "error" ? "Ошибка"
    : "Не проверялось";
}

function FieldRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/25 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

/** Роли, которые говорят об авторстве — их подсвечиваем: спор чаще всего именно о них. */
const AUTHOR_ROLES = new Set(["composer", "lyricist", "composerlyricist", "writer", "author", "producer", "publisher"]);

function RoleBadge({ role }: { role: string }) {
  const isAuthor = AUTHOR_ROLES.has(role.toLowerCase().replace(/[\s_-]/g, ""));
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
        isAuthor
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-muted/40 text-muted-foreground border-border/40"
      }`}
    >
      {role}
    </span>
  );
}

/** Строка площадки: название-ссылка на трек + отдельные ссылки на альбом и артистов. */
function FoundOnRow({ platform, links }: { platform: string; links: PlatformLink[] }) {
  const info = dspInfo(platform);
  const primary = links.find((l) => l.kind === "track");
  const extras = links.filter((l) => l !== primary);

  const dot = <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: info.color }} />;

  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/25 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">Found On</span>
      <div className="flex flex-col items-end gap-1 min-w-0">
        {primary ? (
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Открыть на ${info.label}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline underline-offset-2"
            style={{ color: info.color }}
            data-testid={`acr-found-on-${platform}`}
          >
            {dot}{info.label}<ExternalLink className="h-3 w-3 opacity-70" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: info.color }}>
            {dot}{info.label}
          </span>
        )}
        {extras.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {extras.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.kind === "album" ? `Альбом на ${info.label}` : `Артист на ${info.label}`}
                className="px-1.5 py-0.5 rounded text-[10px] border border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border truncate max-w-[160px]"
              >
                {l.kind === "album" ? "💿 " : "👤 "}{l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MatchCard({ m }: { m: RichMatch }) {
  const searchLinks = buildSearchLinks(m.title, m.artist, m.isrc);
  const hasSegmentTable = m.segmentsDetail.some((s) => s.dbFromMs != null || s.sampleFromMs != null);

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 flex items-center justify-between gap-2 border-b border-border/40">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate text-foreground">{m.title}</div>
          {m.artist !== DASH && <div className="text-xs text-muted-foreground truncate">{m.artist}</div>}
        </div>
        {m.confidence !== DASH && (
          <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/30 shrink-0">
            {m.confidence}% match
          </Badge>
        )}
      </div>

      <div className="px-3 py-1">
        <FieldRow label="Scanned Segments" value={m.scannedSegments != null ? `${m.scannedSegments} Segments` : DASH} />
        <FieldRow label="Matched Segment" value={m.matchedSegment} />
        <FieldRow label="Label Name" value={m.label} />
        <FieldRow label="Album" value={m.album} />
        <FieldRow label="UPC" value={m.upc} mono />
        <FieldRow label="ISRC" value={m.isrc} mono />
        <FieldRow label="Release Date" value={m.releaseDate} />
        {m.genres.length > 0 && <FieldRow label="Genres" value={m.genres.join(", ")} />}
        {m.durationMs != null && <FieldRow label="Длительность оригинала" value={mmss(m.durationMs)} />}
        <FieldRow label="Confidence Score" value={m.confidence} />
        {m.foundOn.length > 0
          ? m.foundOn.map((p) => <FoundOnRow key={p} platform={p} links={m.platformLinks[p] ?? []} />)
          : <FieldRow label="Found On" value={DASH} />}
      </div>

      {/* Авторы и роли — по ним видно, кто на самом деле написал музыку и текст. */}
      {m.artistsDetailed.length > 0 && (
        <div className="px-3 py-2 border-t border-border/30 bg-muted/10">
          <div className="text-[11px] text-muted-foreground mb-1.5">Правообладатели и роли</div>
          <div className="space-y-1.5">
            {m.artistsDetailed.map((a, i) => (
              <div key={`${a.name}-${i}`} className="flex items-start justify-between gap-3">
                <span className="text-xs font-medium text-foreground shrink-0">{a.name}</span>
                {a.roles.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {a.roles.map((r) => <RoleBadge key={r} role={r} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Где именно совпало: наш кусок против участка оригинала. */}
      {hasSegmentTable && (
        <div className="px-3 py-2 border-t border-border/30 bg-muted/10">
          <div className="text-[11px] text-muted-foreground mb-1.5">
            Совпавшие участки ({m.segmentsDetail.length})
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground/70 px-1">
              <span>в нашем файле</span><span>в оригинале</span><span className="text-right">точность</span>
            </div>
            {m.segmentsDetail.map((s, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 text-[11px] font-mono px-1 py-1 rounded bg-background/40">
                <span className="text-foreground">
                  {s.sampleFromMs != null && s.sampleToMs != null ? `${mmss(s.sampleFromMs)}–${mmss(s.sampleToMs)}` : DASH}
                </span>
                <span className="text-amber-400">
                  {s.dbFromMs != null && s.dbToMs != null ? `${mmss(s.dbFromMs)}–${mmss(s.dbToMs)}` : DASH}
                </span>
                <span className="text-right text-muted-foreground">{s.score != null ? `${s.score}%` : DASH}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Площадок, которых нет в тарифе ACRCloud, — только поиск, не подтверждение. */}
      {searchLinks.length > 0 && (
        <div className="px-3 py-2 border-t border-border/30 bg-muted/10">
          <div className="text-[11px] text-muted-foreground mb-1.5">
            Проверить вручную {m.isrc !== DASH ? "по ISRC" : "по названию"} — ACRCloud эти площадки не покрывает
          </div>
          <div className="flex flex-wrap gap-1.5">
            {searchLinks.map((l) => (
              <a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border/40 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border"
              >
                {l.label}<ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface AcrMatchesModalProps {
  releaseId: number;
  tracks: AcrModalTrack[];
  initialTrackId?: number | null;
  onClose: () => void;
}

export function AcrMatchesModal({ releaseId, tracks, initialTrackId, onClose }: AcrMatchesModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState<Set<number>>(() => new Set(initialTrackId != null ? [initialTrackId] : []));
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(initialTrackId ?? null);
  const [scanning, setScanning] = useState<{ trackId: number; mode: "sample" | "full" } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["acr-checks-release-full", releaseId],
    queryFn: () => jget<{ checks: AcrCheck[]; configured: boolean }>(`/api/distribution/acr/checks?releaseId=${releaseId}`),
    refetchInterval: (q) => (q.state.data?.checks.some((c) => c.status === "pending") ? 2000 : false),
  });

  const checks = data?.checks ?? [];
  const configured = data?.configured ?? false;

  const latestByTrack = useMemo(() => {
    const map = new Map<number, AcrCheck>();
    for (const c of checks) {
      if (c.trackId == null) continue;
      const prev = map.get(c.trackId);
      if (!prev || new Date(c.scannedAt).getTime() > new Date(prev.scannedAt).getTime()) map.set(c.trackId, c);
    }
    return map;
  }, [checks]);

  // Раскрываем и помечаем целевой трек для прокрутки. Сам scroll делает ref-callback
  // строки — он срабатывает, когда строка реально смонтирована (после загрузки данных),
  // поэтому холодное открытие тоже корректно прокручивает к нужному треку.
  useEffect(() => {
    if (initialTrackId == null) return;
    setOpen((prev) => (prev.has(initialTrackId) ? prev : new Set(prev).add(initialTrackId)));
    setPendingScrollId(initialTrackId);
  }, [initialTrackId]);

  const runScan = useMutation({
    mutationFn: ({ trackId, mode }: { trackId: number; mode: "sample" | "full" }) =>
      jpost(`/api/distribution/acr/${mode === "full" ? "scan-full" : "scan"}`, { releaseId, trackId }),
    onMutate: (v) => setScanning(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acr-checks-release-full", releaseId] });
      qc.invalidateQueries({ queryKey: ["acr-checks-release", String(releaseId)] });
      qc.invalidateQueries({ queryKey: ["acr-checks-release", releaseId] });
      setScanning(null);
      toast({ title: "Сканирование запущено", description: "Результат появится через несколько секунд." });
    },
    onError: (e: Error) => {
      setScanning(null);
      toast({ variant: "destructive", title: "Ошибка запуска сканирования", description: e.message });
    },
  });

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const matchedCount = tracks.filter((t) => latestByTrack.get(t.id)?.status === "matched").length;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[720px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <ScanSearch className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">Music recognition matches by ACRCloud</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Music2 className="h-3 w-3 shrink-0" />
                {tracks.length} {tracks.length === 1 ? "трек" : "треков"}
                {matchedCount > 0 && <span className="text-amber-400">· {matchedCount} с совпадениями</span>}
              </p>
            </div>
          </div>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
          </div>
        )}

        {!isLoading && tracks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">В релизе пока нет треков.</div>
        )}

        {!isLoading && tracks.length > 0 && (
          <div className="divide-y divide-border/50">
            {tracks.map((t, idx) => {
              const check = latestByTrack.get(t.id);
              const isOpen = open.has(t.id);
              const matches = check ? parseRichMatches(check) : [];
              const isPending = check?.status === "pending";
              const busy = scanning?.trackId === t.id;
              return (
                <div
                  key={t.id}
                  ref={(el) => {
                    if (el && pendingScrollId === t.id) {
                      requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
                      setPendingScrollId(null);
                    }
                  }}
                >
                  <div className="flex items-center gap-2 px-4 py-3 hover:bg-accent/20 transition-colors">
                    <button
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                      onClick={() => toggle(t.id)}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <span className="text-xs text-muted-foreground shrink-0 w-6">#{t.trackNumber ?? idx + 1}</span>
                      <StatusIcon status={check?.status} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate text-foreground">{t.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{t.artist}</div>
                      </div>
                    </button>
                    <span className="text-[11px] text-muted-foreground hidden sm:inline shrink-0">{statusLabel(check?.status)}</span>
                    {configured && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline" size="sm"
                          className="h-7 px-2 text-[11px] gap-1"
                          disabled={runScan.isPending || isPending}
                          onClick={() => runScan.mutate({ trackId: t.id, mode: "sample" })}
                          title="Быстрая проверка (sample)"
                        >
                          {busy && scanning?.mode === "sample" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          Sample
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          className="h-7 px-2 text-[11px] gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                          disabled={runScan.isPending || isPending}
                          onClick={() => runScan.mutate({ trackId: t.id, mode: "full" })}
                          title="Полное сканирование"
                        >
                          {busy && scanning?.mode === "full" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                          Full
                        </Button>
                      </div>
                    )}
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 bg-muted/10 space-y-3">
                      {!check && (
                        <div className="text-center py-6 text-muted-foreground">
                          <ScanSearch className="h-7 w-7 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">Проверок ещё не проводилось.</p>
                          {!configured && <p className="text-xs mt-1 text-rose-400">ACRCloud не настроен в системе.</p>}
                        </div>
                      )}

                      {check && (
                        <>
                          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="bg-muted/40 text-xs">
                                {check.mode === "full" ? "Полное сканирование" : "Sample scan"}
                              </Badge>
                              <Badge variant="outline" className="bg-muted/40 text-xs">
                                {check.engine === "musicbrainz_isrc" ? "MusicBrainz ISRC" : "ACRCloud"}
                              </Badge>
                            </div>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" /> {fmtDateTime(check.scannedAt)}
                            </span>
                          </div>

                          {check.errorMessage && (
                            <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 p-2.5 text-xs text-rose-300 flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                              {check.errorMessage}
                            </div>
                          )}

                          {isPending && (
                            <div className="flex items-center justify-center py-4 text-blue-400 gap-2 text-sm">
                              <Loader2 className="h-4 w-4 animate-spin" /> Идёт сканирование...
                            </div>
                          )}

                          {check.status === "clean" && (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-2.5 text-xs text-emerald-300 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                              Совпадений не найдено — трек чист.
                            </div>
                          )}

                          {matches.map((m, i) => <MatchCard key={i} m={m} />)}

                          {Array.isArray(check.segments) && check.segments.length > 0 && (
                            <div>
                              <div className="text-[11px] text-muted-foreground mb-1.5">
                                Сегменты ({check.segments.filter((s) => s.status === "matched").length} из {check.segments.length} совпали)
                              </div>
                              <div className="flex gap-1">
                                {check.segments.map((seg) => (
                                  <div
                                    key={seg.index}
                                    title={`Сегмент ${seg.index + 1} (${seg.startPct}–${seg.endPct}%): ${seg.status}${seg.score ? ` · ${seg.score}%` : ""}`}
                                    className={`h-4 flex-1 rounded text-[9px] flex items-center justify-center font-bold ${
                                      seg.status === "matched" ? "bg-amber-500/60 text-amber-100"
                                      : seg.status === "clean" ? "bg-emerald-500/50 text-emerald-100"
                                      : "bg-rose-500/50 text-rose-100"
                                    }`}
                                  >
                                    {seg.index + 1}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="px-6 py-4 border-t bg-muted/20 sticky bottom-0 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {configured ? "ACRCloud подключён" : <span className="text-rose-400">ACRCloud не настроен</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">Закрыть</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
