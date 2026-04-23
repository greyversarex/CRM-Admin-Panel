import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe2, Eye, Clock4, Film, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import type { GeoCountry, UgcMonth, SocialBlock } from "@/data/dashboard-extras";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";

// ════════════════ Гео-карта ════════════════

function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function GeoStreamsCard({ data }: { data: GeoCountry[] }) {
  const total = data.reduce((s, c) => s + c.streams, 0);

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              География стримов
            </CardTitle>
            <CardDescription className="text-[12px]">
              Распределение прослушиваний по странам · {(total / 1_000_000).toFixed(2)}M всего
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid lg:grid-cols-2 gap-6 items-center">
          {/* Список стран */}
          <div className="space-y-2">
            {data.map((c) => (
              <div key={c.code} className="flex items-center gap-3">
                <span className="text-lg shrink-0 leading-none">{flagEmoji(c.code)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-white truncate">{c.name}</span>
                    <span className="text-[11px] tabular-nums text-white/60">
                      {c.streams >= 1_000_000
                        ? `${(c.streams / 1_000_000).toFixed(2)}M`
                        : `${(c.streams / 1000).toFixed(0)}K`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-[hsl(271_80%_68%)] rounded-full"
                      style={{ width: `${c.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dotted world map с пульсирующими странами */}
          <WorldStreamsMap data={data} />
        </div>
      </CardContent>
    </Card>
  );
}

// ════════════════ Real World Map (TopoJSON + react-simple-maps) ════════════════

// ISO A2 → [longitude, latitude] центроиды столиц/центров
const COUNTRY_LATLNG: Record<string, [number, number]> = {
  tj: [71.0, 38.9], ru: [100.0, 61.5], uz: [64.6, 41.4], kz: [66.9, 48.0],
  kg: [74.8, 41.2], us: [-95.7, 38.0], de: [10.5, 51.2], tr: [35.2, 39.0],
  fr: [2.2, 46.6], gb: [-1.0, 52.5], in: [78.9, 20.6], cn: [104.2, 35.9],
  jp: [138.3, 36.2], br: [-51.9, -14.2], au: [133.8, -25.3], ae: [53.8, 23.4],
};

// ISO A2 → ISO 3166-1 numeric (строки — как в Natural Earth topojson `id`)
const ISO_A2_TO_NUMERIC: Record<string, string> = {
  tj: "762", ru: "643", uz: "860", kz: "398", kg: "417", us: "840",
  de: "276", tr: "792", fr: "250", gb: "826", in: "356", cn: "156",
  jp: "392", br: "076", au: "036", ae: "784",
};

const geoUrl = `${import.meta.env.BASE_URL}maps/world-110m.json`;

function WorldStreamsMap({ data }: { data: GeoCountry[] }) {
  const maxStreams = Math.max(...data.map((c) => c.streams), 1);
  const home = COUNTRY_LATLNG.tj;

  // set активных numeric id для подсветки
  const activeIds = new Map<string, number>();
  for (const c of data) {
    const num = ISO_A2_TO_NUMERIC[c.code.toLowerCase()];
    if (num) activeIds.set(num, c.streams / maxStreams);
  }

  const homeNumeric = ISO_A2_TO_NUMERIC.tj;

  return (
    <div className="relative aspect-[16/9] rounded-xl bg-gradient-to-br from-[hsl(226_60%_7%)] via-[hsl(222_55%_4%)] to-[hsl(240_70%_5%)] border border-white/[0.06] overflow-hidden hidden lg:block">
      {/* фон-глоу */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 65% 35%, hsl(226 84% 67% / 0.16) 0%, transparent 45%), radial-gradient(circle at 20% 65%, hsl(271 80% 68% / 0.10) 0%, transparent 50%)",
        }}
      />

      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 155, center: [20, 15] }}
        width={820}
        height={460}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      >
        <defs>
          <radialGradient id="countryPulseGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(226 84% 67%)" stopOpacity="0.85" />
            <stop offset="60%" stopColor="hsl(226 84% 67%)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="hsl(226 84% 67%)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="homePulseGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(271 85% 70%)" stopOpacity="0.9" />
            <stop offset="60%" stopColor="hsl(271 85% 70%)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(271 85% 70%)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="geoArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(271 85% 70%)" stopOpacity="0" />
            <stop offset="50%" stopColor="hsl(226 84% 67%)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(226 84% 67%)" stopOpacity="0" />
          </linearGradient>
          <filter id="markerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* континенты */}
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies.map((geo: any) => {
              const id = String(geo.id).padStart(3, "0");
              const weight = activeIds.get(id) ?? 0;
              const isHome = id === homeNumeric;
              const fill = isHome
                ? "hsl(271 70% 35%)"
                : weight > 0
                  ? `hsl(226 70% ${18 + weight * 22}%)`
                  : "hsl(222 30% 11%)";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="hsl(226 30% 22%)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "hsl(226 70% 40%)", outline: "none", cursor: "pointer" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>

        {/* анимированные дуги от TJ к топ-5 */}
        <g style={{ mixBlendMode: "screen" }}>
          {data.slice(0, 5).map((c, i) => {
            const ll = COUNTRY_LATLNG[c.code.toLowerCase()];
            if (!ll || c.code.toLowerCase() === "tj") return null;
            return (
              <Line
                key={`arc-${c.code}`}
                from={home}
                to={ll}
                stroke="url(#geoArcGrad)"
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeDasharray="4 3"
                style={{
                  default: {
                    animation: `geo-dash 2.4s ${i * 0.3}s linear infinite`,
                  } as any,
                }}
              />
            );
          })}
        </g>

        {/* маркеры стран */}
        <g filter="url(#markerGlow)">
          {data.slice(0, 10).map((c, i) => {
            const ll = COUNTRY_LATLNG[c.code.toLowerCase()];
            if (!ll) return null;
            const weight = c.streams / maxStreams;
            const coreR = 2.4 + weight * 3.0;
            const haloR = 7 + weight * 11;
            const isHome = c.code.toLowerCase() === "tj";
            const core = isHome ? "hsl(271 85% 72%)" : "hsl(226 84% 67%)";
            const gradId = isHome ? "homePulseGrad" : "countryPulseGrad";
            return (
              <Marker key={c.code} coordinates={ll}>
                {/* пульсирующее кольцо */}
                <circle
                  r={coreR}
                  fill="none"
                  stroke={core}
                  strokeWidth={1.2}
                  style={{
                    transformOrigin: "0 0",
                    animation: `geo-ping 2.4s ${i * 0.25}s ease-out infinite`,
                  }}
                />
                <circle r={haloR} fill={`url(#${gradId})`} />
                <circle r={coreR} fill={core} />
                <circle r={coreR * 0.4} fill="white" opacity={0.95} />
              </Marker>
            );
          })}
        </g>

        {/* подписи топ-3 */}
        {data.slice(0, 3).map((c) => {
          const ll = COUNTRY_LATLNG[c.code.toLowerCase()];
          if (!ll) return null;
          const label =
            c.streams >= 1_000_000
              ? `${(c.streams / 1_000_000).toFixed(1)}M`
              : `${(c.streams / 1000).toFixed(0)}K`;
          const text = `${c.code.toUpperCase()} · ${label}`;
          const w = text.length * 5.2 + 10;
          return (
            <Marker key={`lbl-${c.code}`} coordinates={ll}>
              <g transform="translate(10,-6)">
                <rect
                  x={0} y={-8} rx={3} ry={3} width={w} height={13}
                  fill="hsl(222 45% 9% / 0.9)"
                  stroke="hsl(226 84% 67% / 0.45)"
                  strokeWidth={0.5}
                />
                <text
                  x={5} y={0} fontSize={8}
                  fontFamily="ui-monospace, monospace"
                  fill="hsl(226 84% 82%)"
                  dominantBaseline="middle"
                >
                  {text}
                </text>
              </g>
            </Marker>
          );
        })}
      </ComposableMap>

      {/* легенда */}
      <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[10px] text-white/50 pointer-events-none">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(271_85%_72%)] shadow-[0_0_6px_hsl(271_85%_72%)]" />
          Home: Tajikistan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(226_84%_67%)] shadow-[0_0_6px_hsl(226_84%_67%)]" />
          Active markets
        </span>
      </div>

      <style>{`
        @keyframes geo-ping {
          0% { transform: scale(1); opacity: 0.7; }
          80%, 100% { transform: scale(4); opacity: 0; }
        }
        @keyframes geo-dash {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -14; }
        }
      `}</style>
    </div>
  );
}

// ════════════════ UGC Обзор ════════════════

export function UgcOverviewCard({ data }: { data: UgcMonth[] }) {
  const totalViews = data.reduce((s, m) => s + m.views, 0);
  const totalWatch = data.reduce((s, m) => s + m.watchTime, 0);
  const totalVideos = data.reduce((s, m) => s + m.videos, 0);

  const blocks = [
    { key: "views",     title: "UGC Просмотры",   value: totalViews,  icon: Eye,   color: "hsl(190 90% 55%)", suffix: "" },
    { key: "watchTime", title: "Время просмотра", value: totalWatch,  icon: Clock4,color: "hsl(160 70% 50%)", suffix: " ч" },
    { key: "videos",    title: "Новые UGC видео", value: totalVideos, icon: Film,  color: "hsl(330 85% 65%)", suffix: "" },
  ] as const;

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">UGC Обзор</CardTitle>
        <CardDescription className="text-[12px]">
          Использование вашей музыки в Reels, Shorts и TikTok за 6 месяцев
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {blocks.map((b) => (
            <div
              key={b.key}
              className="rounded-xl border border-white/[0.06] bg-[hsl(222_40%_7%)] p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-7 w-7 rounded-lg flex items-center justify-center"
                    style={{ background: `${b.color}25`, border: `1px solid ${b.color}40` }}
                  >
                    <b.icon className="h-3.5 w-3.5" style={{ color: b.color }} />
                  </span>
                  <div>
                    <p className="text-[10px] text-white/50 uppercase tracking-wider">{b.title}</p>
                    <p className="text-[16px] font-bold tabular-nums leading-none mt-0.5">
                      {b.value.toLocaleString()}{b.suffix}
                    </p>
                  </div>
                </div>
              </div>
              <div className="h-[80px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [v.toLocaleString(), b.title]}
                    />
                    <Bar dataKey={b.key} fill={b.color} radius={[3, 3, 0, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ════════════════ Соцсети ════════════════

const SOCIAL_META: Record<SocialBlock["platform"], { name: string; color: string; gradient: string }> = {
  tiktok:         { name: "TikTok",          color: "hsl(330 85% 65%)", gradient: "from-pink-500 to-rose-500" },
  instagram:      { name: "Instagram Reels", color: "hsl(271 80% 68%)", gradient: "from-fuchsia-500 to-purple-500" },
  youtube_shorts: { name: "YouTube Shorts",  color: "hsl(0 80% 60%)",   gradient: "from-red-500 to-orange-500" },
};

export function SocialViewsCard({ blocks }: { blocks: SocialBlock[] }) {
  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Соцсети — просмотры</CardTitle>
        <CardDescription className="text-[12px]">
          Динамика просмотров видео с вашей музыкой
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          {blocks.map((b) => {
            const meta = SOCIAL_META[b.platform];
            return (
              <div key={b.platform} className="rounded-xl border border-white/[0.06] bg-[hsl(222_40%_7%)] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/50">{meta.name}</p>
                    <p className="text-[22px] font-bold tabular-nums leading-tight mt-0.5">
                      {b.totalViews.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-white/45 mt-0.5">Всего просмотров</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-white bg-gradient-to-r ${meta.gradient}`}>
                    <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" /> +{Math.floor(Math.random() * 30 + 15)}%
                  </span>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={b.data} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number) => [v.toLocaleString(), meta.name]}
                      />
                      <Bar dataKey="value" fill={meta.color} radius={[4, 4, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   NEW ADMIN DASHBOARD WIDGETS — подтягивают реальные данные
════════════════════════════════════════════════════════════ */

import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Legend } from "recharts";
import { Music2, Disc3, Award, TrendingDown, Users as UsersIcon, Headphones, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* ───── fetcher utils ───── */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed: ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

/* ───── Top DSP Donut (streams + revenue pair) ───── */

const DSP_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

type TopDspRow = { platform: string; revenue: number; streams: number; share: number };

export function TopDspCard({ metric = "streams", title }: { metric?: "streams" | "revenue"; title?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.top-dsp"],
    queryFn: () => fetchJson<TopDspRow[]>("/api/dashboard/top-dsp"),
  });

  const chartData = (data ?? []).slice(0, 6).map((r, i) => ({
    name: r.platform,
    value: metric === "streams" ? r.streams : r.revenue,
    fill: DSP_COLORS[i % DSP_COLORS.length],
  }));

  const total = chartData.reduce((s, r) => s + r.value, 0);

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Disc3 className="h-3.5 w-3.5 text-primary" />
          {title ?? (metric === "streams" ? "Top DSP · Streams" : "Top DSP · Earnings")}
        </CardTitle>
        <CardDescription className="text-[11px]">
          {metric === "streams" ? "Распределение стримов по платформам" : "Распределение доходов по платформам"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-[11px] text-muted-foreground">Нет данных</div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-[180px] w-[180px] shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [metric === "streams" ? `${(v / 1000).toFixed(1)}K` : `$${v.toLocaleString()}`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Total</p>
                <p className="text-sm font-bold tabular-nums">
                  {metric === "streams" ? `${(total / 1000).toFixed(0)}K` : `$${(total / 1000).toFixed(1)}k`}
                </p>
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              {chartData.map((row, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.fill }} />
                  <span className="flex-1 truncate">{row.name}</span>
                  <span className="font-semibold tabular-nums text-muted-foreground">
                    {metric === "streams"
                      ? `${(row.value / 1000).toFixed(0)}K`
                      : `$${row.value.toLocaleString()}`}
                  </span>
                  <span className="w-10 text-right text-muted-foreground/70 tabular-nums">
                    {total > 0 ? `${((row.value / total) * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Top Territories Card ───── */

type TerritoryRow = { country: string; streams: number; revenue: number; artistCount: number };

export function TopTerritoriesCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.top-territories"],
    queryFn: () => fetchJson<TerritoryRow[]>("/api/dashboard/top-territories"),
  });

  const maxStreams = Math.max(1, ...(data ?? []).map(r => r.streams));

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-primary" />
          Top Territories
        </CardTitle>
        <CardDescription className="text-[12px]">Топ стран по стримам и доходам</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">Нет данных по территориям</p>
        ) : (
          <div className="space-y-2">
            {data.slice(0, 10).map((c, i) => (
              <div key={c.country + i} className="flex items-center gap-3 py-1.5 border-b border-border/25 last:border-0">
                <span className="text-[11px] font-bold text-muted-foreground/40 w-4 text-right shrink-0">{i + 1}</span>
                <span className="text-lg shrink-0 leading-none">{flagEmoji(c.country)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium">{c.country}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {(c.streams / 1000).toFixed(0)}K streams
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
                      style={{ width: `${Math.max(4, (c.streams / maxStreams) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0 w-20">
                  <p className="text-[11px] font-semibold text-emerald-400 tabular-nums">${c.revenue.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">{c.artistCount} артистов</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Latest Releases Grid ───── */

type LatestRelease = {
  id: number;
  title: string;
  coverUrl: string | null;
  status: string;
  releaseType: string;
  releaseDate: string | null;
  createdAt: string;
  artist: { id: number; name: string; imageUrl: string | null };
};

export function LatestReleasesGridCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.latest-releases"],
    queryFn: () => fetchJson<LatestRelease[]>("/api/dashboard/latest-releases"),
  });

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            Latest Releases
          </CardTitle>
          <CardDescription className="text-[12px]">Недавно добавленные релизы каталога</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-8">Нет релизов</p>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {data.map((r) => (
              <div key={r.id} className="group cursor-pointer">
                <div className="aspect-square rounded-lg overflow-hidden border border-border/50 bg-gradient-to-br from-primary/15 to-violet-500/10 flex items-center justify-center relative">
                  {r.coverUrl ? (
                    <img src={r.coverUrl} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <Music2 className="h-8 w-8 text-primary/50" />
                  )}
                  <div className="absolute top-1.5 right-1.5">
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                <div className="mt-1.5 px-0.5">
                  <p className="text-[12px] font-medium truncate group-hover:text-primary transition-colors">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.artist.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Top Tracks Card ───── */

type TopTrack = {
  id: number;
  title: string;
  coverUrl: string | null;
  artist: { id: number; name: string; imageUrl: string | null };
  release: { id: number | null; title: string | null };
  streams: number;
  revenue: number;
  trend: number;
};

export function TopTracksCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.top-tracks"],
    queryFn: () => fetchJson<TopTrack[]>("/api/dashboard/top-tracks"),
  });

  return (
    <Card className="card-surface border-border/60 flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Music2 className="h-4 w-4 text-violet-400" />
          Top Tracks
        </CardTitle>
        <CardDescription className="text-[12px]">Самые прослушиваемые треки</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 px-4">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">Нет треков</p>
        ) : (
          <div className="space-y-1">
            {data.slice(0, 6).map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border/25 last:border-0 hover:bg-white/[0.025] rounded-lg px-1 transition-colors cursor-default">
                <span className="text-[11px] font-bold text-muted-foreground/35 w-4 text-right shrink-0">{i + 1}</span>
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                  {t.coverUrl ? <img src={t.coverUrl} alt={t.title} className="w-full h-full object-cover" /> : <Music2 className="h-3.5 w-3.5 text-violet-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{t.artist.name}{t.release.title ? ` · ${t.release.title}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-semibold tabular-nums">{(t.streams / 1000).toFixed(0)}K</p>
                  <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${t.trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {t.trend >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {t.trend >= 0 ? "+" : ""}{t.trend}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Royalty Summary ───── */

type RoyaltySummary = {
  totalRoyalties: number;
  dspRoyalties: number;
  publishingRoyalties: number;
  mtd: number;
  topArtists: { id: number; name: string; revenue: number; share: number }[];
  topReleases: { id: number; title: string; coverUrl: string | null; revenue: number; share: number }[];
};

export function RoyaltySummaryCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.royalty-summary"],
    queryFn: () => fetchJson<RoyaltySummary>("/api/dashboard/royalty-summary"),
  });

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-400" />
          Royalty Summary
        </CardTitle>
        <CardDescription className="text-[12px]">Общий доход и лидеры по выплатам</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !data ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">Нет данных</p>
        ) : (
          <div className="space-y-4">
            {/* Hero totals */}
            <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Royalties</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">${data.totalRoyalties.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <div className="flex items-center gap-4 mt-2 text-[11px]">
                <span className="text-muted-foreground">DSP: <span className="text-foreground font-semibold tabular-nums">${data.dspRoyalties.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                <span className="text-muted-foreground">Publishing: <span className="text-foreground font-semibold tabular-nums">${data.publishingRoyalties.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                <span className="text-muted-foreground">MTD: <span className="text-emerald-400 font-semibold tabular-nums">${data.mtd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
              </div>
            </div>
            {/* Top Earners grid */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Earning Artists</p>
                <div className="space-y-1.5">
                  {data.topArtists.length === 0 && <p className="text-[11px] text-muted-foreground">Нет данных</p>}
                  {data.topArtists.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-right text-muted-foreground/40 font-bold shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="font-semibold tabular-nums text-emerald-400">${a.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-muted-foreground/70 w-10 text-right tabular-nums">{a.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Earning Releases</p>
                <div className="space-y-1.5">
                  {data.topReleases.length === 0 && <p className="text-[11px] text-muted-foreground">Нет данных</p>}
                  {data.topReleases.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-right text-muted-foreground/40 font-bold shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate">{r.title}</span>
                      <span className="font-semibold tabular-nums text-emerald-400">${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-muted-foreground/70 w-10 text-right tabular-nums">{r.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Artists Stats Table (большая таблица внизу) ───── */

type ArtistTableRow = {
  id: number;
  name: string;
  imageUrl: string | null;
  genre: string | null;
  country: string | null;
  status: string;
  hasSpotify: boolean;
  hasApple: boolean;
  releaseCount: number;
  streams: number;
  revenue: number;
};

export function ArtistsStatsTableCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.artists-table"],
    queryFn: () => fetchJson<ArtistTableRow[]>("/api/dashboard/artists-table"),
  });

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-primary" />
            Artists Stats
          </CardTitle>
          <CardDescription className="text-[12px]">Полная таблица артистов с доходами и стримами</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-8">Нет артистов</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-background/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wider">Artist</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Genre</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Country</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">DSPs</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Releases</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Streams</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Revenue</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((a) => (
                  <TableRow key={a.id} className="hover:bg-accent/20">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 border border-border/50 shrink-0">
                          <AvatarImage src={a.imageUrl ?? ""} alt={a.name} />
                          <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                            {a.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[12px] font-medium">{a.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.genre ? <Badge variant="outline" className="text-[10px]">{a.genre}</Badge> : <span className="text-muted-foreground/50 text-[11px]">—</span>}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {a.country ? <span className="flex items-center gap-1.5"><span className="text-sm">{flagEmoji(a.country)}</span>{a.country}</span> : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {a.hasSpotify && <Badge variant="outline" className="text-[9px] px-1 py-0 text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Spotify</Badge>}
                        {a.hasApple && <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-300 bg-rose-500/10 border-rose-500/20">Apple</Badge>}
                        {!a.hasSpotify && !a.hasApple && <span className="text-muted-foreground/50 text-[11px]">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{a.releaseCount}</TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{(a.streams / 1000).toFixed(0)}K</TableCell>
                    <TableCell className="text-right text-[12px] font-semibold text-emerald-400 tabular-nums">
                      {a.revenue > 0 ? `$${a.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className="text-muted-foreground/50 font-normal">—</span>}
                    </TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
