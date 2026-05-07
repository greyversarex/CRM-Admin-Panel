/**
 * Distribution / DSP Status tab — карта по DSP-партнёрам.
 *
 * Для каждой настроенной интеграции (категории dsp/delivery) показывает:
 *   • статус интеграции (connected/unverified/disconnected)
 *   • счётчики DDEX-сообщений по статусам (sent/acked/rejected/queued/invalid)
 *   • когда последний раз была отправка / получено подтверждение
 *
 * Источник: GET /api/distribution/dsp-status (агрегация по ddex_messages
 * GROUP BY partner_code, status + JOIN integrations).
 */
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Send, Inbox, Hourglass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type DspRow = {
  code: string;
  name: string;
  integrationStatus: "connected" | "unverified" | "disconnected" | null;
  counts: { sent: number; acked: number; rejected: number; queued: number; invalid: number; cancelled: number; draft: number; validated: number };
  totalMessages: number;
  lastSentAt: string | null;
  lastAckedAt: string | null;
};

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function StatusBadge({ s }: { s: DspRow["integrationStatus"] }) {
  if (s === "connected")    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">подключено</Badge>;
  if (s === "unverified")   return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">не проверено</Badge>;
  if (s === "disconnected") return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">отключено</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">нет интеграции</Badge>;
}

export function DspStatusTab() {
  const q = useQuery({
    queryKey: ["dsp-status"],
    queryFn: () => jget<{ items: DspRow[] }>(`/api/distribution/dsp-status`),
    refetchInterval: 20_000,
  });

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold">Статус DSP-площадок</h3>
          <p className="text-xs text-muted-foreground">
            Текущее состояние доставки в каждую площадку: что ушло, что подтверждено, что отклонено.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-refresh-dsp">
          <RefreshCw className="h-4 w-4 mr-1" /> Обновить
        </Button>
      </div>

      {q.isLoading && <Skeleton className="h-40" />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((d) => {
          const issues = d.counts.rejected + d.counts.invalid;
          const inflight = d.counts.queued + d.counts.draft + d.counts.validated;
          return (
            <Card key={d.code} data-testid={`card-dsp-${d.code}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="truncate">{d.name}</span>
                  <StatusBadge s={d.integrationStatus} />
                </CardTitle>
                <div className="text-xs text-muted-foreground font-mono">{d.code}</div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat icon={Send}        value={d.counts.sent}    label="Отправлено" tone="blue" />
                  <Stat icon={CheckCircle2} value={d.counts.acked}   label="Подтверждено" tone="emerald" />
                  <Stat icon={XCircle}     value={issues}          label="Ошибок" tone={issues > 0 ? "red" : "muted"} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-3">
                  <div className="flex items-center gap-1.5">
                    <Hourglass className="h-3.5 w-3.5" /> в очереди: <span className="text-foreground font-medium">{inflight}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Inbox className="h-3.5 w-3.5" /> всего: <span className="text-foreground font-medium">{d.totalMessages}</span>
                  </div>
                  <div className="col-span-2">Последняя отправка: <span className="text-foreground">{fmtDate(d.lastSentAt)}</span></div>
                  <div className="col-span-2">Последний ack: <span className="text-foreground">{fmtDate(d.lastAckedAt)}</span></div>
                </div>
                {d.integrationStatus === "disconnected" && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Интеграция отключена — отправка в эту площадку не пойдёт. Подключите в Настройках → Интеграции.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {q.isSuccess && items.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-10 border rounded-md">
          Пока нет ни настроенных DSP-интеграций, ни отправленных сообщений.
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label, tone }: { icon: typeof Send; value: number; label: string; tone: "blue" | "emerald" | "red" | "muted" }) {
  const cls =
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "red"     ? "text-red-600 dark:text-red-400" :
    tone === "blue"    ? "text-blue-600 dark:text-blue-400" :
                         "text-muted-foreground";
  return (
    <div>
      <div className={`flex items-center justify-center gap-1 text-lg font-semibold ${cls}`}>
        <Icon className="h-4 w-4" />{value}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
