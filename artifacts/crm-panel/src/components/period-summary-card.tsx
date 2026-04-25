import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { listTransactions } from "@workspace/api-client-react";
import { CalendarRange, RefreshCw, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Tx = {
  id: number;
  type: string;
  amount: number;
  currency: string;
  platform?: string | null;
  description?: string | null;
  createdAt: string;
};

type Aggregate = {
  income: number;
  payouts: number;
  net: number;
  byType: Record<string, number>;
  byPlatform: Record<string, number>;
};

const TYPE_LABELS: Record<string, string> = {
  dsp_revenue: "DSP",
  publishing_revenue: "Publishing",
  content_id: "Content ID",
  manual: "Manual",
  payout: "Payout",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 30);
  return { from: isoDate(from), to: isoDate(today) };
}

function fmt(amt: number): string {
  return amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PeriodSummaryCard({
  artistId,
  labelId,
}: {
  artistId?: number;
  labelId?: number;
}) {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [byCurrency, setByCurrency] = useState<Record<string, Aggregate>>({});
  const [hasRun, setHasRun] = useState(false);

  const aggregate = (txs: Tx[]): Record<string, Aggregate> => {
    const out: Record<string, Aggregate> = {};
    for (const t of txs) {
      const cur = String(t.currency ?? "").toUpperCase() || "—";
      const a = (out[cur] ??= {
        income: 0,
        payouts: 0,
        net: 0,
        byType: {},
        byPlatform: {},
      });
      const amt = Number(t.amount) || 0;
      if (t.type === "payout" || amt < 0) {
        a.payouts += Math.abs(amt);
      } else {
        a.income += amt;
        const platform = String(t.platform ?? "").trim() || "—";
        a.byPlatform[platform] = (a.byPlatform[platform] ?? 0) + amt;
      }
      a.byType[t.type] = (a.byType[t.type] ?? 0) + Math.abs(amt);
      a.net = a.income - a.payouts;
    }
    return out;
  };

  const inRange = (iso: string): boolean => {
    if (!iso) return false;
    const d = iso.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const onRecalc = async () => {
    if (loading) return;
    if (from && to && from > to) {
      toast({
        title: "Неверный диапазон",
        description: "Дата «с» позже даты «по».",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setLoaded(0);
    try {
      const all: Tx[] = [];
      let page = 1;
      const limit = 200;
      const baseParams: any = {};
      if (artistId) baseParams.artist_id = artistId;
      if (labelId) baseParams.label_id = labelId;
      const maxPages = 500;
      while (page <= maxPages) {
        const res: any = await listTransactions({ ...baseParams, page, limit });
        const items: Tx[] = res?.data ?? [];
        all.push(...items);
        setLoaded(all.length);
        const totalPages: number | undefined = res?.pagination?.totalPages;
        if (items.length === 0) break;
        if (totalPages && page >= totalPages) break;
        if (items.length < limit) break;
        page++;
      }
      const filtered = all.filter((t) => inRange(t.createdAt));
      setByCurrency(aggregate(filtered));
      setHasRun(true);
    } catch (e: any) {
      toast({
        title: "Не удалось посчитать сводку",
        description: e?.message ?? "Неизвестная ошибка",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const setQuickRange = (days: number) => {
    const today = new Date();
    const f = new Date(today);
    f.setDate(today.getDate() - days);
    setFrom(isoDate(f));
    setTo(isoDate(today));
  };

  const setMonth = (offset: number) => {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const start = target;
    const end = new Date(target.getFullYear(), target.getMonth() + 1, 0);
    setFrom(isoDate(start));
    setTo(isoDate(end));
  };

  const currencies = Object.keys(byCurrency).sort();

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" />
            Сводка за период
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="ghost" onClick={() => setQuickRange(7)}>
              7д
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setQuickRange(30)}>
              30д
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setQuickRange(90)}>
              90д
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(-1)}>
              Прошлый месяц
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(0)}>
              Этот месяц
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">с</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[150px] bg-background/50"
          />
          <span className="text-xs text-muted-foreground">по</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[150px] bg-background/50"
          />
          <Button onClick={onRecalc} disabled={loading} size="sm" className="ml-auto">
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? `Считаю… ${loaded}` : "Посчитать"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !hasRun ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : !hasRun ? (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border/50 rounded-md">
            Выбери период и нажми «Посчитать», чтобы увидеть сводку.
          </div>
        ) : currencies.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border/50 rounded-md">
            За выбранный период транзакций нет.
          </div>
        ) : (
          currencies.map((cur) => {
            const a = byCurrency[cur];
            const topPlatforms = Object.entries(a.byPlatform)
              .filter(([k]) => k && k !== "—")
              .sort((x, y) => y[1] - x[1])
              .slice(0, 5);
            return (
              <div key={cur} className="rounded-md border border-border/40 p-4 space-y-3 bg-background/30">
                {currencies.length > 1 && (
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    Валюта {cur}
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-300/80">
                      <TrendingUp className="h-3.5 w-3.5" /> Начислено
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">
                      {fmt(a.income)} {cur}
                    </div>
                  </div>
                  <div className="rounded-md bg-rose-500/5 border border-rose-500/20 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-rose-300/80">
                      <TrendingDown className="h-3.5 w-3.5" /> Выплачено
                    </div>
                    <div className="text-2xl font-bold text-rose-400 mt-1">
                      {fmt(a.payouts)} {cur}
                    </div>
                  </div>
                  <div
                    className={`rounded-md p-3 border ${
                      a.net >= 0
                        ? "bg-primary/5 border-primary/20"
                        : "bg-amber-500/5 border-amber-500/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" /> Чистое движение
                    </div>
                    <div
                      className={`text-2xl font-bold mt-1 ${
                        a.net >= 0 ? "text-primary" : "text-amber-400"
                      }`}
                    >
                      {a.net >= 0 ? "+" : ""}
                      {fmt(a.net)} {cur}
                    </div>
                  </div>
                </div>

                {topPlatforms.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Топ источников по доходу:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {topPlatforms.map(([name, amt]) => (
                        <Badge
                          key={name}
                          variant="outline"
                          className="text-xs border-border/60 bg-background/40"
                        >
                          {name} · {fmt(amt)} {cur}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(a.byType).length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">По типам операций:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(a.byType)
                        .sort((x, y) => y[1] - x[1])
                        .map(([type, amt]) => (
                          <Badge
                            key={type}
                            variant="outline"
                            className="text-xs border-border/60 bg-background/40"
                          >
                            {TYPE_LABELS[type] ?? type} · {fmt(amt)} {cur}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
