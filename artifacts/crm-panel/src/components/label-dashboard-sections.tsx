import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Disc3, ListMusic, Music2, Play, Youtube } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { assetHref } from "@/components/asset-uploader";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Failed: ${url} (${response.status})`);
  return response.json() as Promise<T>;
}

function compact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  youtube: { label: "YouTube", color: "#e50914" },
  youtube_music: { label: "YouTube Art Tracks", color: "#ff2d20" },
  youtube_cms: { label: "YouTube CMS", color: "#ff2d20" },
  spotify: { label: "Spotify", color: "#10d338" },
  apple: { label: "Apple Music", color: "#f72572" },
  apple_music: { label: "Apple Music", color: "#f72572" },
  deezer: { label: "Deezer", color: "#4b2cf5" },
  amazon: { label: "Amazon Music", color: "#13b5d1" },
  amazon_music: { label: "Amazon Music", color: "#13b5d1" },
  yandex: { label: "Yandex Music", color: "#e8eb08" },
  yandex_music: { label: "Yandex Music", color: "#e8eb08" },
  vk: { label: "VK Music", color: "#4931ff" },
  vk_music: { label: "VK Music", color: "#4931ff" },
  tiktok: { label: "TikTok", color: "#ff2757" },
  meta: { label: "Meta", color: "#8127ff" },
  instagram: { label: "Instagram", color: "#c026d3" },
  facebook: { label: "Facebook", color: "#7552ff" },
};

const FALLBACK_COLORS = ["#f6c84c", "#6495ed", "#18c37e", "#f72572", "#7c3aed", "#10b6cf", "#f97316"];

function platformMeta(platform: string, index = 0) {
  const key = platform.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return PLATFORM_META[key] ?? { label: platform, color: FALLBACK_COLORS[index % FALLBACK_COLORS.length] };
}

type DspRow = { platform: string; streams: number; revenue: number; share: number };
type PlatformMonth = { period: string; month: string; values: Record<string, number> };
type PlatformMonthResponse = { platforms: string[]; series: PlatformMonth[] };
/**
 * The API scopes every dashboard request from the authenticated session.
 * The role belongs in query keys so cached catalog data never crosses roles.
 */
export type DashboardScopeKey = "admin" | "manager" | "label" | "artist";

function EmptyPanel({ text, light = false }: { text: string; light?: boolean }) {
  return (
    <div className={`h-full min-h-36 flex items-center justify-center px-6 text-center text-xs ${light ? "text-slate-400" : "text-muted-foreground/65"}`}>
      {text}
    </div>
  );
}

function DspGlyph({ platform, index = 0 }: { platform: string; index?: number }) {
  const meta = platformMeta(platform, index);
  return (
    <span className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: meta.color }}>
      {platform.toLowerCase().includes("youtube") ? <Play className="h-5 w-5 fill-white text-white" /> : <Music2 className="h-5 w-5 text-white" />}
    </span>
  );
}

function SharedStreamsSection({ scopeKey }: { scopeKey: DashboardScopeKey }) {
  const { data: monthData, isLoading: monthLoading } = useQuery({
    queryKey: ["dashboard.scoped.streams-by-platform-month", scopeKey],
    queryFn: () => fetchJson<PlatformMonthResponse>("/api/dashboard/streams-by-platform-month"),
  });
  const { data: dspData, isLoading: dspLoading } = useQuery({
    queryKey: ["dashboard.top-dsp", scopeKey],
    queryFn: () => fetchJson<DspRow[]>("/api/dashboard/top-dsp"),
  });

  const platforms = monthData?.platforms.slice(0, 9) ?? [];
  const chartData: Array<Record<string, string | number>> = (monthData?.series ?? []).map((point) => ({ month: point.month, ...point.values }));
  const hasStreams = platforms.some((platform) => chartData.some((point) => Number(point[platform]) > 0));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(290px,2fr)]">
      <Card className="card-surface border-border/60 overflow-hidden">
        <CardContent className="p-3">
          <div className="rounded-lg overflow-hidden bg-white text-slate-900">
            <div className="px-3 pt-2">
              <h2 className="text-lg font-semibold leading-tight">Streams</h2>
              <p className="text-[11px] text-slate-400">thousands</p>
            </div>
            <div className="h-[285px] w-full px-1 pb-1">
              {monthLoading ? (
                <Skeleton className="h-full w-full bg-slate-100" />
              ) : !hasStreams ? (
                <EmptyPanel light text="Нет импортированных DSP-отчётов по стримам" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e7e9ee" />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => compact(value)} />
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#d7dbe2", fontSize: 11 }} formatter={(value: number) => value.toLocaleString()} />
                    {platforms.map((platform, index) => {
                      const color = index === 0 ? "#f1c64d" : platformMeta(platform, index).color;
                      return (
                        <Area
                          key={platform}
                          type="monotone"
                          dataKey={platform}
                          name={platformMeta(platform, index).label}
                          stroke={color}
                          strokeWidth={index === 0 ? 2 : 1.3}
                          fill={color}
                          fillOpacity={index === 0 ? 0.24 : 0.04}
                          dot={false}
                          connectNulls
                        />
                      );
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="flex justify-center pt-3">
            <a href="/analytics?tab=streams" className="rounded-md bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/15 hover:text-white">
              View Streams Data
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="card-surface border-border/60">
        <CardContent className="p-5 h-full">
          {dspLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
          ) : !dspData?.length ? (
            <EmptyPanel text="Нет данных по DSP" />
          ) : (
            <div>
              {dspData.slice(0, 5).map((row, index) => (
                <div key={row.platform} className="flex items-center gap-3 py-3 border-b border-dashed border-white/35 last:border-0">
                  <DspGlyph platform={row.platform} index={index} />
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-white/65">{platformMeta(row.platform, index).label}</span>
                  <div className="text-right shrink-0 leading-tight">
                    <p className="text-sm tabular-nums text-white/25">{row.streams.toLocaleString()}</p>
                    <p className="text-xs font-medium text-white/70">Streams</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type PlaylistRow = {
  id: number;
  playlistName: string;
  dsp: string;
  streams: number;
  artistName: string | null;
  artistImageUrl: string | null;
};

function SharedPlaylistAndDspSection({ scopeKey }: { scopeKey: DashboardScopeKey }) {
  const { data: playlists, isLoading: playlistLoading } = useQuery({
    queryKey: ["dashboard.playlist-placements", scopeKey],
    queryFn: () => fetchJson<PlaylistRow[]>("/api/dashboard/playlist-placements"),
  });
  const { data: dsps, isLoading: dspLoading } = useQuery({
    queryKey: ["dashboard.top-dsp", scopeKey],
    queryFn: () => fetchJson<DspRow[]>("/api/dashboard/top-dsp"),
  });
  const pieData = (dsps ?? []).slice(0, 6).map((row, index) => ({
    name: platformMeta(row.platform, index).label,
    value: row.streams,
    color: platformMeta(row.platform, index).color,
  }));

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-stretch">
      <Card className="card-surface border-border/60 overflow-hidden h-full">
        <CardHeader className="border-b border-border/50 py-4 px-5"><CardTitle className="text-sm">Playlist</CardTitle></CardHeader>
        <CardContent className="px-5 py-1 min-h-[300px]">
          {playlistLoading ? (
            <div className="space-y-2 py-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-11 w-full" />)}</div>
          ) : !playlists?.length ? (
            <EmptyPanel text="Нет импортированных данных по плейлистам" />
          ) : (
            playlists.slice(0, 5).map((row) => (
              <div key={row.id} className="flex items-center gap-3 py-2.5 border-b border-dashed border-white/35 last:border-0">
                <div className="h-10 w-10 overflow-hidden rounded-sm bg-white/5 flex items-center justify-center shrink-0">
                  {row.artistImageUrl ? <img src={assetHref(row.artistImageUrl)} alt="" className="h-full w-full object-cover" /> : <ListMusic className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/75 truncate">{row.playlistName}</p>
                  <p className="text-xs font-semibold text-white/75 truncate">{row.artistName || platformMeta(row.dsp).label}</p>
                </div>
                <div className="text-right leading-tight">
                  <p className="text-xs tabular-nums text-white/25">{row.streams.toLocaleString()}</p>
                  <p className="text-[11px] text-white/65">Streams</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="card-surface border-border/60 overflow-hidden h-full">
        <CardHeader className="border-b border-border/50 py-4 px-5"><CardTitle className="text-sm">Top DSP Streams</CardTitle></CardHeader>
        <CardContent className="px-5 py-4 min-h-[340px]">
          {dspLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : pieData.length === 0 ? (
            <EmptyPanel text="Нет данных по DSP" />
          ) : (
            <>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={82} stroke="none">
                      {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#111319", borderColor: "#292d36", borderRadius: 8, fontSize: 11 }} formatter={(value: number) => `${value.toLocaleString()} Streams`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-7 gap-y-2 pt-2">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2 text-[11px] text-white/75">
                    <span className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                    <span className="truncate">{entry.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type ReleaseRow = {
  id: number;
  title: string;
  coverUrl: string | null;
  barcode: string | null;
  labelName: string | null;
  artist: { id: number; name: string; imageUrl: string | null };
};

function SharedLatestReleasesSection({ scopeKey }: { scopeKey: DashboardScopeKey }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.latest-releases", scopeKey],
    queryFn: () => fetchJson<ReleaseRow[]>("/api/dashboard/latest-releases"),
  });
  return (
    <Card className="card-surface border-border/60 overflow-hidden">
      <CardHeader className="border-b border-border/50 py-4 px-5"><CardTitle className="text-sm">Latest Releases</CardTitle></CardHeader>
      <CardContent className="p-3">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="aspect-[0.76] w-full" />)}</div>
        ) : !data?.length ? (
          <EmptyPanel text="У лейбла пока нет релизов" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {data.map((release) => (
              <a key={release.id} href={`/releases/${release.id}`} className="rounded-lg overflow-hidden border border-border/70 bg-[#111319] hover:border-primary/40 transition-colors">
                <div className="aspect-square bg-white/[0.035] flex items-center justify-center overflow-hidden">
                  {release.coverUrl ? <img src={assetHref(release.coverUrl)} alt={release.title} className="h-full w-full object-cover" /> : <Disc3 className="h-10 w-10 text-primary/45" />}
                </div>
                <div className="p-3 min-h-[82px] space-y-1">
                  <p className="text-[11px] font-semibold truncate">{release.title}</p>
                  <p className="text-[11px] text-white/45 truncate">{release.artist.name}</p>
                  {release.barcode && <p className="text-[9px] text-white/35 truncate">Barcode: {release.barcode}</p>}
                  {release.labelName && <p className="text-[9px] text-white/35 truncate">Label: {release.labelName}</p>}
                </div>
              </a>
            ))}
          </div>
        )}
        {!!data?.length && (
          <div className="flex justify-center pt-5 pb-1">
            <a href="/releases" className="rounded-md bg-white/10 px-4 py-2 text-[11px] text-white/75 hover:bg-white/15 hover:text-white">View Release</a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ArtistRow = { id: number; name: string; imageUrl: string | null; totalStreams: number };
type TrackRow = { id: number; title: string; coverUrl: string | null; streams: number; artist: { name: string } };

function RankingCard({ title, loading, rows }: { title: string; loading: boolean; rows: Array<{ id: number; name: string; subtitle?: string; imageUrl: string | null; streams: number }> }) {
  return (
    <Card className="card-surface border-border/60 overflow-hidden">
      <CardHeader className="border-b border-border/50 py-4 px-5"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="px-5 py-1 min-h-[290px]">
        {loading ? (
          <div className="space-y-2 py-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyPanel text="Нет статистики по стримам" />
        ) : (
          rows.slice(0, 5).map((row) => (
            <div key={row.id} className="flex items-center gap-3 py-3 border-b border-dashed border-white/35 last:border-0">
              <div className="h-8 w-8 rounded-md overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                {row.imageUrl ? <img src={assetHref(row.imageUrl)} alt="" className="h-full w-full object-cover" /> : <Music2 className="h-3.5 w-3.5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white/70 truncate">{row.name}</p>
                {row.subtitle && <p className="text-[9px] text-white/35 truncate">{row.subtitle}</p>}
              </div>
              <div className="text-right leading-tight shrink-0">
                <p className="text-xs tabular-nums text-white/25">{row.streams.toLocaleString()}</p>
                <p className="text-[11px] text-white/65">Streams</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SharedRankingsSection({ scopeKey }: { scopeKey: DashboardScopeKey }) {
  const { data: artists, isLoading: artistLoading } = useQuery({ queryKey: ["dashboard.top-artists", scopeKey], queryFn: () => fetchJson<ArtistRow[]>("/api/dashboard/top-artists") });
  const { data: tracks, isLoading: trackLoading } = useQuery({ queryKey: ["dashboard.top-tracks", scopeKey], queryFn: () => fetchJson<TrackRow[]>("/api/dashboard/top-tracks") });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <RankingCard title="Top Artists" loading={artistLoading} rows={(artists ?? []).map((row) => ({ id: row.id, name: row.name, imageUrl: row.imageUrl, streams: row.totalStreams }))} />
      <RankingCard title="Top Track" loading={trackLoading} rows={(tracks ?? []).map((row) => ({ id: row.id, name: row.title, subtitle: row.artist.name, imageUrl: row.coverUrl, streams: row.streams }))} />
    </div>
  );
}

type UgcPoint = { day: string; views: number; videos: number; likes: number; shares: number; watchTimeSeconds: number };
type UgcPlatformSeries = { platform: string; points: UgcPoint[] };
type UgcResponse = { series: UgcPoint[]; platformSeries: UgcPlatformSeries[] };

function platformGroup(platform: string): "youtube" | "tiktok" | "meta" | "other" {
  const key = platform.toLowerCase();
  if (key === "youtube" || key === "youtube_cms") return "youtube";
  if (key === "tiktok") return "tiktok";
  if (key === "meta" || key === "instagram" || key === "facebook") return "meta";
  return "other";
}

function combinePoints(entries: UgcPlatformSeries[], group: "youtube" | "tiktok" | "meta"): UgcPoint[] {
  const map = new Map<string, UgcPoint>();
  for (const entry of entries.filter((item) => platformGroup(item.platform) === group)) {
    for (const point of entry.points) {
      const current = map.get(point.day) ?? { day: point.day, views: 0, videos: 0, likes: 0, shares: 0, watchTimeSeconds: 0 };
      current.views += point.views;
      current.videos += point.videos;
      current.likes += point.likes;
      current.shares += point.shares;
      current.watchTimeSeconds += point.watchTimeSeconds;
      map.set(point.day, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

function UgcMetricChart({ title, total, points, metric, bars = false }: { title: string; total: string; points: UgcPoint[]; metric: "views" | "videos" | "watchTimeHours"; bars?: boolean }) {
  const data = points.map((point) => ({
    ...point,
    value: metric === "watchTimeHours" ? point.watchTimeSeconds / 3600 : point[metric],
    label: new Date(point.day).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
  }));
  return (
    <div className="min-w-0">
      <div className="px-5 pt-4 pb-2">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] font-semibold">{total}</p>
      </div>
      <div className="h-[225px] px-2">
        {points.length === 0 ? (
          <EmptyPanel text="Нет данных" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {bars ? (
              <BarChart data={data} margin={{ top: 8, right: 12, left: 2, bottom: 8 }}>
                <CartesianGrid vertical={false} stroke="#2a2d34" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                <Tooltip contentStyle={{ backgroundColor: "#111319", borderColor: "#292d36", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="value" fill="#bd1552" radius={[2, 2, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={data} margin={{ top: 8, right: 12, left: 2, bottom: 8 }}>
                <defs><linearGradient id={`ugc-${metric}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00e5ee" stopOpacity=".28" /><stop offset="1" stopColor="#00e5ee" stopOpacity="0" /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#2a2d34" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                <Tooltip contentStyle={{ backgroundColor: "#111319", borderColor: "#292d36", borderRadius: 8, fontSize: 11 }} />
                <Area type="monotone" dataKey="value" stroke="#00e5ee" strokeWidth={2.5} fill={`url(#ugc-${metric})`} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function LabelYoutubeUgcSection({ entries, loading }: { entries: UgcPlatformSeries[]; loading: boolean }) {
  const points = combinePoints(entries, "youtube");
  const views = points.reduce((sum, point) => sum + point.views, 0);
  const watchSeconds = points.reduce((sum, point) => sum + point.watchTimeSeconds, 0);
  const videos = points.reduce((sum, point) => sum + point.videos, 0);
  return (
    <Card className="card-surface border-border/60 overflow-hidden">
      <CardHeader className="px-5 py-4 bg-[#151a22]">
        <CardTitle className="text-sm">UGC Обзор</CardTitle>
        <p className="text-[11px] text-muted-foreground">Использование вашей музыки в Reels, Shorts и TikTok за 6 месяцев</p>
      </CardHeader>
      <div className="flex items-center gap-3 border-y border-border/50 px-8 py-2.5">
        <span className="h-6 w-8 rounded-md bg-red-500 flex items-center justify-center"><Youtube className="h-4 w-4 fill-white text-white" /></span>
        <span className="text-sm font-medium">Overview</span>
      </div>
      {loading ? (
        <CardContent className="p-4"><Skeleton className="h-[300px] w-full" /></CardContent>
      ) : (
        <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border/50">
          <UgcMetricChart title="UGC Views" total={compact(views)} points={points} metric="views" />
          <UgcMetricChart title="UGC Watch Time" total={`${compact(watchSeconds / 3600)} Hours`} points={points} metric="watchTimeHours" />
          <UgcMetricChart title="New UGC Videos" total={compact(videos)} points={points} metric="videos" bars />
        </div>
      )}
      <div className="border-t border-border/50 text-center py-4">
        <a href="/analytics?tab=ugc" className="text-[11px] text-sky-500 hover:underline underline-offset-4">View YouTube UGC data</a>
      </div>
    </Card>
  );
}

function monthlyPlatformData(entries: UgcPlatformSeries[], group: "tiktok" | "meta") {
  const selected = entries.filter((entry) => platformGroup(entry.platform) === group);
  const map = new Map<string, Record<string, number | string>>();
  for (const entry of selected) {
    for (const point of entry.points) {
      const date = new Date(point.day);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const row = map.get(key) ?? { key, month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) };
      row[entry.platform] = Number(row[entry.platform] ?? 0) + point.views;
      map.set(key, row);
    }
  }
  return { platforms: selected.map((entry) => entry.platform), rows: Array.from(map.values()).sort((a, b) => String(a.key).localeCompare(String(b.key))) };
}

function SocialUgcCard({ group, entries, loading }: { group: "tiktok" | "meta"; entries: UgcPlatformSeries[]; loading: boolean }) {
  const { platforms, rows } = monthlyPlatformData(entries, group);
  const total = rows.reduce((sum, row) => sum + platforms.reduce((platformSum, platform) => platformSum + Number(row[platform] ?? 0), 0), 0);
  const isTikTok = group === "tiktok";
  return (
    <Card className="card-surface border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-7 py-3 border-b border-border/50">
        <span className={`h-7 w-7 rounded-lg border flex items-center justify-center ${isTikTok ? "border-fuchsia-500 text-fuchsia-400" : "border-blue-500 text-blue-500"}`}>
          {isTikTok ? <Music2 className="h-4 w-4" /> : <span className="text-lg font-bold leading-none">∞</span>}
        </span>
        <div className="text-right leading-tight"><p className="text-xs font-semibold">Views</p><p className="text-[11px]">Total {total.toLocaleString()}</p></div>
      </div>
      <div className="h-[235px] px-5 pt-3">
        {loading ? <Skeleton className="h-full w-full" /> : rows.length === 0 ? <EmptyPanel text={`Нет данных ${isTikTok ? "TikTok" : "Meta"}`} /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 5, right: 5, left: -6, bottom: 5 }}>
              <CartesianGrid vertical={false} stroke="#2a2d34" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} />
              <Tooltip contentStyle={{ backgroundColor: "#111319", borderColor: "#292d36", borderRadius: 8, fontSize: 11 }} />
              {platforms.map((platform, index) => <Bar key={platform} dataKey={platform} stackId="views" fill={isTikTok ? (index % 2 === 0 ? "#ff2757" : "#10b6cf") : platformMeta(platform, index).color} radius={index === platforms.length - 1 ? [7, 7, 0, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="border-t border-border/50 text-center py-4"><a href="/analytics?tab=ugc" className="text-[11px] text-sky-500 hover:underline underline-offset-4">View {isTikTok ? "TikTok" : "Meta"} Data</a></div>
    </Card>
  );
}

function SharedUgcSections({ scopeKey }: { scopeKey: DashboardScopeKey }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.ugc-timeseries", scopeKey],
    queryFn: () => fetchJson<UgcResponse>("/api/dashboard/ugc-timeseries"),
  });
  const entries = data?.platformSeries ?? [];
  return (
    <div className="space-y-5">
      <LabelYoutubeUgcSection entries={entries} loading={isLoading} />
      <div className="grid gap-5 lg:grid-cols-2">
        <SocialUgcCard group="tiktok" entries={entries} loading={isLoading} />
        <SocialUgcCard group="meta" entries={entries} loading={isLoading} />
      </div>
    </div>
  );
}

export function SharedDashboardSections({ scopeKey }: { scopeKey: DashboardScopeKey }) {
  return (
    <div className="space-y-5">
      <SharedStreamsSection scopeKey={scopeKey} />
      <SharedPlaylistAndDspSection scopeKey={scopeKey} />
      <SharedLatestReleasesSection scopeKey={scopeKey} />
      <SharedRankingsSection scopeKey={scopeKey} />
      <SharedUgcSections scopeKey={scopeKey} />
    </div>
  );
}
