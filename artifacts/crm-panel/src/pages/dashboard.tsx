import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  useGetDashboardSummary,
  useGetDashboardRevenueByMonth,
  useGetDashboardRecentActivity,
  useGetDashboardTopArtists,
  useGetDashboardReleasesByStatus
} from "@workspace/api-client-react";
import { Users, Disc3, DollarSign, Activity, TrendingUp, ArrowUpRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  gradient,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
  loading?: boolean;
}) {
  return (
    <Card className="bg-card border-border/50 overflow-hidden relative group hover:border-border transition-all duration-200 stat-card-glow">
      <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300", gradient)} />
      <CardContent className="pt-5 pb-5 relative">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", color.replace("text-", "bg-").replace(/\w+$/, match => match + "/10"))}>
            <Icon className={cn("h-4 w-4", color)} />
          </div>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
        </div>
        {loading ? (
          <>
            <Skeleton className="h-7 w-20 mb-1.5" />
            <Skeleton className="h-3 w-16" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
        <p className="text-[11px] font-medium text-muted-foreground/70 mt-2 uppercase tracking-wide">{label}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: revenueData, isLoading: isRevenueLoading } = useGetDashboardRevenueByMonth();
  const { data: activityData, isLoading: isActivityLoading } = useGetDashboardRecentActivity();
  const { data: topArtistsData, isLoading: isTopArtistsLoading } = useGetDashboardTopArtists();
  const { data: statusData, isLoading: isStatusLoading } = useGetDashboardReleasesByStatus();
  const { t } = useLang();
  const d = t.dashboard;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-1">{d.subtitle}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={d.total_revenue}
            value={`$${summary?.totalRevenue?.toLocaleString() ?? "—"}`}
            sub={summary?.revenueGrowth ? `+${summary.revenueGrowth}%` : undefined}
            icon={DollarSign}
            color="text-emerald-400"
            gradient="bg-gradient-to-br from-emerald-500/5 to-transparent"
            loading={isSummaryLoading}
          />
          <KpiCard
            label={d.total_artists}
            value={summary?.totalArtists?.toLocaleString() ?? "—"}
            icon={Users}
            color="text-primary"
            gradient="bg-gradient-to-br from-primary/5 to-transparent"
            loading={isSummaryLoading}
          />
          <KpiCard
            label={d.total_releases}
            value={summary?.totalReleases?.toLocaleString() ?? "—"}
            sub={summary?.releasesThisMonth ? `+${summary.releasesThisMonth} this month` : undefined}
            icon={Disc3}
            color="text-violet-400"
            gradient="bg-gradient-to-br from-violet-500/5 to-transparent"
            loading={isSummaryLoading}
          />
          <KpiCard
            label={d.active_deliveries}
            value={summary?.activeDeliveries?.toLocaleString() ?? "—"}
            icon={Activity}
            color="text-sky-400"
            gradient="bg-gradient-to-br from-sky-500/5 to-transparent"
            loading={isSummaryLoading}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-7">
          <Card className="col-span-4 bg-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.revenue_overview}</CardTitle>
              <CardDescription className="text-[12px]">{d.revenue_subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="pl-1">
              {isRevenueLoading ? (
                <Skeleton className="h-[280px] w-full rounded-md" />
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData || []} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDsp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPub" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.6)" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "10px", fontSize: "12px", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                      <Area type="monotone" dataKey="dspRevenue" name="DSP Revenue" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorDsp)" />
                      <Area type="monotone" dataKey="publishingRevenue" name="Publishing Revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} fillOpacity={1} fill="url(#colorPub)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-3 bg-card border-border/50 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.top_artists}</CardTitle>
              <CardDescription className="text-[12px]">{d.top_artists_subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto px-4">
              {isTopArtistsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-2.5 w-14" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {topArtistsData?.map((artist, i) => (
                    <div key={artist.id} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-[11px] font-bold text-muted-foreground/40 w-4 text-right shrink-0">{i + 1}</span>
                      <Avatar className="h-8 w-8 border border-border/50 shrink-0">
                        <AvatarImage src={artist.imageUrl || ""} alt={artist.name} />
                        <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                          {artist.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{artist.name}</p>
                        <p className="text-[10px] text-muted-foreground">{artist.totalStreams.toLocaleString()} streams</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] font-semibold">${artist.revenue.toLocaleString()}</p>
                        <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${artist.trend > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          <TrendingUp className="h-2.5 w-2.5" />
                          {artist.trend > 0 ? "+" : ""}{artist.trend}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-7">
          <Card className="col-span-3 bg-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.recent_releases}</CardTitle>
              <CardDescription className="text-[12px]">{d.recent_releases_subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              {isStatusLoading ? (
                <Skeleton className="h-[220px] w-full rounded-md" />
              ) : (
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData || []} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border) / 0.5)" />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="status"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickFormatter={(v) => v.replace(/_/g, " ")}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "10px", fontSize: "12px" }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-4 bg-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isActivityLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-2 w-2 mt-1.5 rounded-full shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {activityData?.map((item) => (
                    <div key={item.id} className="flex gap-3 items-start pb-3 border-b border-border/30 last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0 shadow-sm shadow-primary/50" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[12px] font-medium leading-snug">{item.title}</p>
                          <time className="text-[10px] text-muted-foreground shrink-0">{new Date(item.timestamp).toLocaleDateString()}</time>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  ))}
                  {(!activityData || activityData.length === 0) && (
                    <p className="text-[12px] text-muted-foreground text-center py-6">No recent activity.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
