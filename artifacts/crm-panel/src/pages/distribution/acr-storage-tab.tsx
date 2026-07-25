/**
 * Вкладка «Хранилище ACRCloud» — партнёрская доставка каталога.
 *
 * Что это: полный DDEX-пакет релиза (аудио + обложка + метаданные) уходит в
 * S3-бакет ACRCloud, чтобы наши треки попали в их базу отпечатков и защищались.
 *
 * Чем это НЕ является: это не проверка на дубли. Канал односторонний —
 * автоматического вердикта по нему не приходит, поэтому вердикт фиксируется
 * руками, когда ACRCloud его пришлёт. Для настоящей проверки трека есть
 * кнопка ACRCloud в строке трека (модерация) — она работает по звуку и UPC
 * не требует.
 *
 * Доставка требует UPC, обложку и аудио у КАЖДОГО трека — это требование
 * формата DDEX, а не наше.
 *
 * API: POST /api/distribution/acr/drop           { releaseId }
 *      POST /api/distribution/acr/manual-result  { checkId, verdict }
 *      GET  /api/distribution/acr/checks?releaseId=
 */
import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useListReleases } from "@workspace/api-client-react";
import {
  UploadCloud, Loader2, CheckCircle2, XCircle, Info, ChevronDown, ChevronRight, RefreshCw,
} from "lucide-react";

type DropCheck = {
  id: number;
  releaseId: number | null;
  status: string;
  engine: string;
  matchedTitle: string | null;
  matchedArtist: string | null;
  errorMessage: string | null;
  scannedAt: string;
  resultJson: {
    s3Key?: string; remotePath?: string; fileCount?: number; totalBytes?: number;
    verdictNote?: string | null;
  } | null;
};

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

function statusLabel(s: string): string {
  return ({
    pending: "Загружено, ждём вердикт",
    clean: "Уникально (дублей нет)",
    matched: "Найден дубликат",
    error: "Ошибка отправки",
  } as Record<string, string>)[s] ?? s;
}

function statusTone(s: string): string {
  return s === "matched" ? "bg-red-500/15 text-red-700 dark:text-red-300"
    : s === "clean" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : s === "error" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "bg-muted text-muted-foreground";
}

function fmtBytes(b?: number): string {
  if (!b) return "—";
  const mb = b / 1024 / 1024;
  return mb < 1 ? `${(b / 1024).toFixed(0)} КБ` : `${mb.toFixed(1)} МБ`;
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

export function AcrStorageTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<number | null>(null);

  const releasesQ = useListReleases({ limit: 200 });
  const releases = releasesQ.data?.data ?? [];

  const checksQ = useQuery({
    queryKey: ["acr-drops-all"],
    queryFn: () => jget<{ checks: DropCheck[]; configured: boolean }>(`/api/distribution/acr/checks`),
  });
  const drops = (checksQ.data?.checks ?? []).filter((c) => c.engine === "acrcloud_ddex");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["acr-drops-all"] });
    qc.invalidateQueries({ queryKey: ["releases"] });
  };

  const drop = useMutation({
    mutationFn: (releaseId: number) => jpost(`/api/distribution/acr/drop`, { releaseId }),
    onSuccess: () => {
      toast({ title: "Пакет отправлен в хранилище ACRCloud", description: "Вердикт придёт отдельно — зафиксируйте его здесь, когда получите." });
      refresh();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось отправить", description: e.message }),
  });

  const verdict = useMutation({
    mutationFn: (v: { checkId: number; verdict: "unique" | "duplicate" | "processing" }) =>
      jpost(`/api/distribution/acr/manual-result`, v),
    onSuccess: () => { toast({ title: "Вердикт сохранён" }); refresh(); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось сохранить вердикт", description: e.message }),
  });

  const dropsFor = (releaseId: number) => drops.filter((d) => d.releaseId === releaseId);

  return (
    <div className="space-y-4">
      {/* Пояснение — чтобы вкладку не путали с проверкой */}
      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 flex gap-2.5">
        <Info className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">Это доставка каталога, а не проверка.</span>{" "}
            Полный DDEX-пакет релиза уходит в S3-хранилище ACRCloud, чтобы наши треки попали
            в их базу отпечатков и защищались на площадках.
          </p>
          <p>
            Вердикт по этому каналу автоматически не возвращается — когда ACRCloud его пришлёт,
            зафиксируйте результат вручную. Чтобы проверить трек на совпадения, используйте кнопку
            <span className="font-medium text-foreground"> ACRCloud</span> в строке трека во вкладке «Модерация».
          </p>
          <p>Для отправки релизу обязательно нужны UPC, обложка и аудиофайл у каждого трека — этого требует формат DDEX.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Отправка релизов в хранилище</CardTitle>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={refresh} disabled={checksQ.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${checksQ.isFetching ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </CardHeader>
        <CardContent>
          {releasesQ.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Релизов пока нет.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Релиз</TableHead>
                  <TableHead>UPC</TableHead>
                  <TableHead>Статус релиза</TableHead>
                  <TableHead>Отправок</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((r) => {
                  const rid = r.id as number;
                  const mine = dropsFor(rid);
                  const isOpen = expanded === rid;
                  const noUpc = !r.upc;
                  return (
                    <Fragment key={rid}>
                      <TableRow data-testid={`row-acr-storage-${rid}`}>
                        <TableCell className="p-0 pl-2">
                          {mine.length > 0 && (
                            <button
                              className="p-1 text-muted-foreground hover:text-foreground"
                              onClick={() => setExpanded(isOpen ? null : rid)}
                              aria-label={isOpen ? "Свернуть" : "Развернуть"}
                            >
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium max-w-[280px] truncate">{r.title}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.upc ?? <span className="text-rose-500">нет UPC</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.status}</Badge></TableCell>
                        <TableCell className="tabular-nums text-sm">{mine.length || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm" variant="outline" className="h-7 gap-1.5"
                            disabled={drop.isPending || noUpc}
                            title={noUpc ? "Без UPC пакет DDEX собрать нельзя" : "Отправить пакет в хранилище ACRCloud"}
                            onClick={() => drop.mutate(rid)}
                            data-testid={`button-acr-drop-${rid}`}
                          >
                            {drop.isPending && drop.variables === rid
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <UploadCloud className="h-3.5 w-3.5" />}
                            Отправить
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isOpen && mine.map((c) => (
                        <TableRow key={`d-${c.id}`} className="bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={5} className="py-2">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-xs flex-wrap">
                                <span className="text-muted-foreground tabular-nums">{fmtWhen(c.scannedAt)}</span>
                                <Badge variant="outline" className={`text-[10px] ${statusTone(c.status)}`}>{statusLabel(c.status)}</Badge>
                                {c.resultJson?.fileCount != null && (
                                  <span className="text-muted-foreground">
                                    {c.resultJson.fileCount} файл(ов), {fmtBytes(c.resultJson.totalBytes)}
                                  </span>
                                )}
                              </div>
                              {c.errorMessage && <p className="text-[11px] text-red-600 dark:text-red-400 break-words">{c.errorMessage}</p>}
                              {c.status === "matched" && c.matchedTitle && (
                                <p className="text-[11px] text-muted-foreground">
                                  Найдено: {c.matchedTitle}{c.matchedArtist ? ` (${c.matchedArtist})` : ""}
                                </p>
                              )}
                              {c.resultJson?.verdictNote && (
                                <p className="text-[11px] text-muted-foreground">Заметка: {c.resultJson.verdictNote}</p>
                              )}

                              {c.status !== "error" && (
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                  <span className="text-[11px] text-muted-foreground mr-1">Вердикт ACRCloud:</span>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1"
                                    disabled={verdict.isPending}
                                    onClick={() => verdict.mutate({ checkId: c.id, verdict: "unique" })}>
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />Уникально
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1"
                                    disabled={verdict.isPending}
                                    onClick={() => verdict.mutate({ checkId: c.id, verdict: "duplicate" })}>
                                    <XCircle className="h-3 w-3 text-red-600" />Дубликат
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1"
                                    disabled={verdict.isPending}
                                    onClick={() => verdict.mutate({ checkId: c.id, verdict: "processing" })}>
                                    <Loader2 className="h-3 w-3" />В обработке
                                  </Button>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
