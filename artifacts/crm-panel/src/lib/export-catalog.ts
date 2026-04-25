import { listReleases, listTracks } from "@workspace/api-client-react";

export type ExportProgress = {
  phase: "releases" | "tracks" | "building" | "done";
  loaded: number;
  total: number | null;
};

const CSV_COLUMNS = [
  "release_id",
  "release_title",
  "release_type",
  "release_status",
  "artist_id",
  "artist_name",
  "label_id",
  "label_name",
  "upc",
  "genre",
  "language",
  "release_date",
  "is_explicit",
  "territories",
  "p_line",
  "c_line",
  "total_tracks",
  "track_id",
  "track_number",
  "track_title",
  "isrc",
  "duration_seconds",
  "composer",
  "lyricist",
  "iswc",
  "audio_url",
  "release_created_at",
  "release_updated_at",
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (Array.isArray(v)) s = v.join("|");
  if (typeof v === "boolean") s = v ? "true" : "false";
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows: Record<string, unknown>[]): string {
  const header = CSV_COLUMNS.join(",");
  const body = rows
    .map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","))
    .join("\n");
  return header + "\n" + body + "\n";
}

async function fetchAllReleases(
  onProgress?: (p: ExportProgress) => void,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const limit = 100;
  let total: number | null = null;
  // Hard cap to prevent runaway loops on a misbehaving backend.
  const maxPages = 200;
  while (page <= maxPages) {
    const res: any = await listReleases({ page, limit });
    const items: any[] = res?.data ?? [];
    total = res?.pagination?.total ?? total;
    all.push(...items);
    onProgress?.({ phase: "releases", loaded: all.length, total });
    const totalPages: number | undefined = res?.pagination?.totalPages;
    if (items.length === 0) break;
    if (totalPages && page >= totalPages) break;
    if (items.length < limit) break;
    page++;
  }
  return all;
}

async function fetchAllTracks(
  onProgress?: (p: ExportProgress) => void,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const limit = 200;
  let total: number | null = null;
  const maxPages = 500;
  while (page <= maxPages) {
    const res: any = await listTracks({ page, limit });
    const items: any[] = res?.data ?? [];
    total = res?.pagination?.total ?? total;
    all.push(...items);
    onProgress?.({ phase: "tracks", loaded: all.length, total });
    const totalPages: number | undefined = res?.pagination?.totalPages;
    if (items.length === 0) break;
    if (totalPages && page >= totalPages) break;
    if (items.length < limit) break;
    page++;
  }
  return all;
}

export async function exportCatalogCsv(
  onProgress?: (p: ExportProgress) => void,
): Promise<{ releaseCount: number; trackCount: number; rowCount: number }> {
  const releases = await fetchAllReleases(onProgress);
  const tracks = await fetchAllTracks(onProgress);

  onProgress?.({ phase: "building", loaded: 0, total: releases.length });

  const tracksByRelease = new Map<number, any[]>();
  for (const t of tracks) {
    const rid = Number(t.releaseId);
    if (!Number.isFinite(rid)) continue;
    const arr = tracksByRelease.get(rid) ?? [];
    arr.push(t);
    tracksByRelease.set(rid, arr);
  }
  for (const arr of tracksByRelease.values()) {
    arr.sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));
  }

  const rows: Record<string, unknown>[] = [];
  for (const r of releases) {
    const releaseFields = {
      release_id: r.id,
      release_title: r.title,
      release_type: r.releaseType,
      release_status: r.status,
      artist_id: r.artistId,
      artist_name: r.artistName ?? "",
      label_id: r.labelId ?? "",
      label_name: r.labelName ?? "",
      upc: r.upc ?? "",
      genre: r.genre ?? "",
      language: r.language ?? "",
      release_date: r.releaseDate ?? "",
      is_explicit: r.isExplicit,
      territories: r.territories ?? [],
      p_line: r.pLine ?? "",
      c_line: r.cLine ?? "",
      total_tracks: r.totalTracks ?? 0,
      release_created_at: r.createdAt ?? "",
      release_updated_at: r.updatedAt ?? "",
    };
    const ts = tracksByRelease.get(Number(r.id)) ?? [];
    if (ts.length === 0) {
      rows.push({
        ...releaseFields,
        track_id: "",
        track_number: "",
        track_title: "",
        isrc: "",
        duration_seconds: "",
        composer: "",
        lyricist: "",
        iswc: "",
        audio_url: "",
      });
    } else {
      for (const t of ts) {
        rows.push({
          ...releaseFields,
          track_id: t.id,
          track_number: t.trackNumber ?? "",
          track_title: t.title,
          isrc: t.isrc ?? "",
          duration_seconds: t.durationSeconds ?? "",
          composer: t.composerName ?? "",
          lyricist: t.lyricistName ?? "",
          iswc: t.iswc ?? "",
          audio_url: t.audioUrl ?? "",
        });
      }
    }
  }

  const csv = buildCsv(rows);

  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `catalog-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  onProgress?.({ phase: "done", loaded: releases.length, total: releases.length });
  return {
    releaseCount: releases.length,
    trackCount: tracks.length,
    rowCount: rows.length,
  };
}
