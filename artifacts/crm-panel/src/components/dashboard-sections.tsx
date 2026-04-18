import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe2, Eye, Clock4, Film, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import type { GeoCountry, UgcMonth, SocialBlock } from "@/data/dashboard-extras";

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

          {/* Декоративная "карта" — стилизованные пятна */}
          <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-[hsl(222_50%_8%)] to-[hsl(222_50%_4%)] border border-white/[0.05] overflow-hidden hidden lg:block">
            <svg viewBox="0 0 800 500" className="absolute inset-0 w-full h-full opacity-50">
              <defs>
                <radialGradient id="dot1" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="hsl(226 84% 67%)" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="hsl(226 84% 67%)" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="dot2" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="hsl(271 80% 68%)" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="hsl(271 80% 68%)" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* TJ — крупная точка */}
              <circle cx="500" cy="200" r="120" fill="url(#dot1)" />
              {/* RU */}
              <circle cx="540" cy="120" r="90" fill="url(#dot2)" />
              {/* UZ */}
              <circle cx="470" cy="220" r="60" fill="url(#dot1)" />
              {/* US */}
              <circle cx="180" cy="200" r="50" fill="url(#dot2)" />
              {/* DE */}
              <circle cx="400" cy="170" r="35" fill="url(#dot2)" />
            </svg>
            {/* Точки городов */}
            {data.slice(0, 8).map((c, i) => {
              const positions: Record<string, [number, number]> = {
                tj: [62, 45], ru: [68, 25], uz: [60, 47], kz: [62, 30],
                kg: [64, 42], us: [22, 42], de: [50, 38], tr: [54, 45],
              };
              const [x, y] = positions[c.code] ?? [50, 50];
              const size = Math.max(4, c.percent / 8);
              return (
                <span
                  key={c.code}
                  className="absolute rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.8)] animate-pulse"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: size,
                    height: size,
                    animationDelay: `${i * 200}ms`,
                  }}
                  title={`${c.name}: ${c.streams.toLocaleString()}`}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
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
