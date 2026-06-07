import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Music, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";

type TikTokRow = {
  id: number;
  trackTitle: string;
  artistName: string;
  uses: number;
  videoViews: number;
  likes: number;
  reposts: number;
  periodStart: string;
  periodEnd: string;
};

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function fmt(n: number) { return new Intl.NumberFormat("ru-RU").format(n); }

export function MarketingTrendsPanel() {
  const { toast } = useToast();
  const { t } = useLang();
  const [rows, setRows] = useState<TikTokRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api<TikTokRow[]>("/api/analytics/tiktok")
      .then((d) => { if (mounted) setRows(d); })
      .catch((e) => toast({ title: "Ошибка", description: String(e?.message ?? e), variant: "destructive" }))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [toast]);

  return (
    <>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-pink-300" />
            </span>
            {t.nav.trends}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Тренды в TikTok по вашим трекам: количество видео, просмотры и оценка вирусности.
          </p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Music className="h-4 w-4 text-pink-400" />
              TikTok-тренды
            </CardTitle>
            <CardDescription>Топ треков по просмотрам видео (за последний период)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Пока нет данных по TikTok-трендам.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <tr className="border-b border-border/40">
                      <th className="py-2 px-2">Трек</th>
                      <th className="py-2 px-2">Артист</th>
                      <th className="py-2 px-2 text-right">Использования</th>
                      <th className="py-2 px-2 text-right">Просмотры</th>
                      <th className="py-2 px-2 text-right">Лайки</th>
                      <th className="py-2 px-2 text-right">Период</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/20 hover:bg-white/[0.02]">
                        <td className="py-2 px-2 font-medium">{r.trackTitle}</td>
                        <td className="py-2 px-2 text-muted-foreground">{r.artistName}</td>
                        <td className="py-2 px-2 text-right">{fmt(r.uses)}</td>
                        <td className="py-2 px-2 text-right">
                          <span className="inline-flex items-center justify-end gap-1">
                            <Eye className="h-3 w-3 text-muted-foreground" />
                            {fmt(r.videoViews)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">{fmt(r.likes)}</td>
                        <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                          <Badge variant="outline" className="bg-pink-500/10 border-pink-500/30 text-pink-300">
                            {r.periodStart} → {r.periodEnd}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function MarketingTrendsPage() {
  return (
    <Layout>
      <MarketingTrendsPanel />
    </Layout>
  );
}
