/**
 * Distribution / Scheduled tab — релизы с будущей датой релиза.
 *
 * Группируется по дате (день / неделя / месяц), показывает таймлайн.
 * Источник: GET /api/distribution/scheduled?from=YYYY-MM-DD
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ScheduledItem = {
  id: number;
  title: string;
  artistName: string;
  releaseType: string;
  upc: string;
  status: string;
  releaseDate: string;
  releaseTime: string | null;
};

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

function fmtDateRu(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    approved:      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    delivering:    "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    live:          "bg-emerald-600 text-white",
    pending_review:"bg-amber-500/15 text-amber-700 dark:text-amber-300",
  };
  const labels: Record<string, string> = {
    approved: "одобрено",
    delivering: "доставляется",
    live: "в эфире",
    pending_review: "на модерации",
  };
  return <Badge className={map[s] ?? "bg-muted text-muted-foreground"} variant="outline">{labels[s] ?? s}</Badge>;
}

export function ScheduledTab() {
  const q = useQuery({
    queryKey: ["scheduled-releases"],
    queryFn: () => jget<{ items: ScheduledItem[] }>(`/api/distribution/scheduled`),
    refetchInterval: 60_000,
  });

  // Группируем по дате
  const grouped = useMemo(() => {
    const items = q.data?.items ?? [];
    const byDate = new Map<string, ScheduledItem[]>();
    for (const i of items) {
      const arr = byDate.get(i.releaseDate) ?? [];
      arr.push(i);
      byDate.set(i.releaseDate, arr);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [q.data]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold">Запланированные релизы</h3>
          <p className="text-xs text-muted-foreground">
            Релизы с датой выхода в будущем. Дата релиза приходит на DSP в DDEX-сообщении и определяет, когда трек станет доступен слушателям.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className="h-4 w-4 mr-1" />Обновить
        </Button>
      </div>

      {q.isLoading && <Skeleton className="h-40" />}

      {q.isSuccess && grouped.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-10 border rounded-md">
          Запланированных релизов нет.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(([date, items]) => {
          const isToday = date === today;
          const days = Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / 86_400_000);
          return (
            <Card key={date} data-testid={`card-scheduled-${date}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="capitalize">{fmtDateRu(date)}</span>
                  {isToday
                    ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">сегодня</Badge>
                    : <Badge variant="outline">через {days} {days === 1 ? "день" : days < 5 ? "дня" : "дней"}</Badge>
                  }
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-2 border rounded-md" data-testid={`row-scheduled-${r.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.artistName} · <span className="capitalize">{r.releaseType}</span>{r.upc ? ` · UPC ${r.upc}` : ""}
                      </div>
                    </div>
                    {r.releaseTime && (
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />{r.releaseTime}
                      </span>
                    )}
                    {statusBadge(r.status)}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/releases/${r.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />Открыть
                      </Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
