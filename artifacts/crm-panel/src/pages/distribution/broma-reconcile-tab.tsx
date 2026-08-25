// Сверка нашего каталога с тем, что о нём знает Broma16.
//
// Запрос обходит все связанные релизы по очереди и занимает до минуты —
// поэтому он запускается кнопкой, а не сам при открытии вкладки.
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/pages/users/_api";

type Row = {
  releaseId: number;
  title: string;
  ourStatus: string;
  ourModeration: string | null;
  ourUpc: string | null;
  ourReleaseDate: string | null;
  bromaReleaseId: number | null;
  bromaAssetId: number | null;
  bromaTitle: string | null;
  bromaStep: string | null;
  bromaStatuses: string[];
  bromaModerationStatus: string | null;
  bromaUpc: string | null;
  bromaSaleStartDate: string | null;
  shipped: boolean;
  reasons: string[];
  notices: string[];
  problems: string[];
  unreachable: string | null;
};

const STEP_LABEL: Record<string, string> = {
  file: "файлы", tracks: "треки", check: "проверка",
  confirm: "подтверждение", distribution: "витрины", cover: "обложка",
};

function Side({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div className="flex-1 min-w-[200px]">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      {lines.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 text-xs py-0.5 border-b border-border/30 last:border-0">
          <span className="text-muted-foreground">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function BromaReconcileTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [, navigate] = useLocation();

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ data: Row[] }>("/api/broma16/reconcile");
      setRows(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить сверку");
    } finally {
      setLoading(false);
    }
  };

  const shown = (rows ?? []).filter((r) => (onlyProblems ? r.problems.length > 0 : true));
  const okCount = (rows ?? []).filter((r) => r.problems.length === 0).length;

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Сверка с Broma16</CardTitle>
            <CardDescription>
              Показывает наши данные рядом с их и называет расхождения. Обход всех релизов занимает до минуты.
            </CardDescription>
          </div>
          <Button onClick={run} disabled={loading} className="gap-2 shrink-0">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Сверяем…" : "Сверить"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {loading && !rows && <Skeleton className="h-24 w-full" />}
        {!rows && !loading && !error && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Нажмите «Сверить», чтобы спросить у Broma16 состояние каждого релиза.
          </p>
        )}

        {rows && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> совпадает: {okCount}
              </span>
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> расходится: {rows.length - okCount}
              </span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOnlyProblems((v) => !v)}>
                {onlyProblems ? "Показать все" : "Только расхождения"}
              </Button>
            </div>

            {shown.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Расхождений нет — наши данные и данные Broma16 совпадают.
              </p>
            )}

            {shown.map((r) => (
              <div key={r.releaseId} className="rounded-md border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <button
                    type="button"
                    className="text-sm font-medium hover:text-primary text-left"
                    onClick={() => navigate(`/releases/${r.releaseId}`)}
                  >
                    {r.title}
                  </button>
                  <div className="flex gap-1.5 shrink-0">
                    {r.shipped && (
                      <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                        на площадках
                      </Badge>
                    )}
                    {r.problems.length === 0
                      ? <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400">совпадает</Badge>
                      : <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-400">{r.problems.length}</Badge>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 mb-2">
                  <Side
                    title="у нас"
                    lines={[
                      ["статус", r.ourStatus],
                      ["модерация", r.ourModeration ?? "—"],
                      ["UPC", r.ourUpc ?? "—"],
                      ["дата", r.ourReleaseDate?.slice(0, 10) ?? "—"],
                    ]}
                  />
                  <Side
                    title="у Broma16"
                    lines={[
                      ["состояние", r.bromaStep
                        ? `черновик, шаг «${STEP_LABEL[r.bromaStep] ?? r.bromaStep}»`
                        : (r.bromaStatuses.join(", ") || "—")],
                      ["модерация", r.bromaModerationStatus ?? "—"],
                      ["UPC", r.bromaUpc ?? "—"],
                      ["дата продаж", r.bromaSaleStartDate ?? "—"],
                    ]}
                  />
                </div>

                {r.problems.map((p, i) => (
                  <p key={i} className="text-xs text-amber-300/90 flex gap-1.5 mt-1">
                    <span>▸</span><span>{p}</span>
                  </p>
                ))}
                {[...r.reasons, ...r.notices].slice(0, 5).map((x, i) => (
                  <p key={`n-${i}`} className="text-xs text-muted-foreground mt-1">замечание Broma16: {x}</p>
                ))}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
