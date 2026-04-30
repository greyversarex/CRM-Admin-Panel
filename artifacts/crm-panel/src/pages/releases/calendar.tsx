import { Layout } from "@/components/layout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CalendarDays, Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Release = {
  id: number;
  title: string;
  artist: string;
  date: string;
  type: "single" | "album" | "ep";
  status: "scheduled" | "live" | "draft";
};

const TYPE_COLORS: Record<string, string> = {
  single: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  album:  "bg-violet-500/15 text-violet-400 border-violet-500/25",
  ep:     "bg-amber-500/15 text-amber-400 border-amber-500/25",
};
const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-amber-400",
  live:       "bg-emerald-400",
  draft:      "bg-slate-400",
  published:  "bg-emerald-400",
  rejected:   "bg-red-400",
  pending:    "bg-amber-400",
};

const DAYS_RU   = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function apiStatusToLocal(status: string): Release["status"] {
  if (status === "published" || status === "live") return "live";
  if (status === "draft" || status === "rejected") return "draft";
  return "scheduled";
}

function apiTypeToLocal(type: string): Release["type"] {
  if (type === "album") return "album";
  if (type === "ep") return "ep";
  return "single";
}

export default function ReleaseCalendar() {
  const { toast } = useToast();
  const today = new Date();
  const [current, setCurrent]   = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/releases?limit=500", { credentials: "same-origin" })
      .then(r => r.json())
      .then((data: { data?: { id: number; title: string; artistName?: string; releaseDate?: string; releaseType?: string; status?: string }[] }) => {
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        setReleases(
          rows
            .filter((r) => r.releaseDate)
            .map((r) => ({
              id:     r.id,
              title:  r.title,
              artist: r.artistName ?? "—",
              date:   r.releaseDate!.slice(0, 10),
              type:   apiTypeToLocal(r.releaseType ?? "single"),
              status: apiStatusToLocal(r.status ?? "pending"),
            }))
        );
      })
      .catch(e => toast({ variant: "destructive", title: "Ошибка загрузки", description: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const year  = current.getFullYear();
  const month = current.getMonth();

  const firstDay    = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const releasesForDate = (date: Date) =>
    releases.filter(r => isSameDay(new Date(r.date + "T00:00:00"), date));

  const selectedReleases = selected ? releasesForDate(selected) : [];
  const monthReleases    = releases.filter(r => {
    const d = new Date(r.date + "T00:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-emerald-400" />
            Календарь релизов
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Все запланированные выпуски — по дате и артисту
          </p>
        </div>

        {loading ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={() => setCurrent(new Date(year, month - 1, 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <CardTitle className="text-base">{MONTHS_RU[month]} {year}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => setCurrent(new Date(year, month + 1, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 mb-2">
                    {DAYS_RU.map(d => (
                      <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((date, i) => {
                      if (!date) return <div key={i} />;
                      const rels   = releasesForDate(date);
                      const isToday = isSameDay(date, today);
                      const isSel   = selected ? isSameDay(date, selected) : false;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelected(isSel ? null : date)}
                          className={cn(
                            "relative flex flex-col items-center min-h-[56px] rounded-lg p-1 text-xs transition-colors hover:bg-muted/60",
                            isToday && "ring-1 ring-primary/50",
                            isSel   && "bg-primary/10 ring-1 ring-primary",
                          )}
                        >
                          <span className={cn(
                            "w-6 h-6 flex items-center justify-center rounded-full font-medium",
                            isToday && "bg-primary text-primary-foreground text-xs",
                          )}>
                            {date.getDate()}
                          </span>
                          <div className="flex gap-0.5 flex-wrap justify-center mt-0.5">
                            {rels.slice(0, 3).map(r => (
                              <span key={r.id} className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[r.status] ?? "bg-slate-400")} />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right panel */}
            <div className="flex flex-col gap-4">
              {selected && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {selected.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {selectedReleases.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Нет релизов</p>
                    ) : selectedReleases.map(r => (
                      <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                        <Disc3 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.artist}</p>
                        </div>
                        <Badge variant="outline" className={cn("text-xs", TYPE_COLORS[r.type])}>
                          {r.type}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{MONTHS_RU[month]} — {monthReleases.length} релиз{monthReleases.length === 1 ? "" : monthReleases.length < 5 ? "а" : "ов"}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                  {monthReleases.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет запланированных релизов</p>
                  ) : monthReleases.sort((a, b) => a.date.localeCompare(b.date)).map(r => (
                    <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[r.status] ?? "bg-slate-400")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.artist} · {new Date(r.date + "T00:00:00").getDate()} {MONTHS_RU[month].toLowerCase()}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs", TYPE_COLORS[r.type])}>
                        {r.type}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
