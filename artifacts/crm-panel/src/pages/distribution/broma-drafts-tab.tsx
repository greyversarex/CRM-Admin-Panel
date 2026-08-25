// Черновики, оставшиеся в кабинете Broma16.
//
// Отправка релиза идёт девятью шагами, и любой сбой на середине оставляет там
// недоделанный черновик. Раньше их было видно только в кабинете Broma16, и
// накопилось семь штук.
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { api } from "@/pages/users/_api";

type Draft = {
  id: number;
  type: "release" | "composition";
  title: string;
  step: string | null;
  ourReleaseId: number | null;
  ourReleaseTitle: string | null;
  safeToRemove: boolean;
};

const STEP_LABEL: Record<string, string> = {
  file: "файлы", tracks: "треки", check: "проверка",
  confirm: "подтверждение", distribution: "витрины", cover: "обложка",
};

export function BromaDraftsTab() {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();

  const load = useCallback(async () => {
    try {
      const r = await api<{ data: Draft[] }>("/api/broma16/drafts");
      setRows(r.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить");
      setRows([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const remove = async (draft: Draft, force: boolean) => {
    setBusy(true);
    try {
      await api(`/api/broma16/drafts/${draft.type}/${draft.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
      toast({ title: "Черновик удалён", description: draft.title });
      setTarget(null);
      await load();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Card className="card-surface no-lift border-border/60">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle>Черновики в кабинете Broma16</CardTitle>
          <CardDescription>
            Остаются после неудачных отправок. Черновик, за которым стоит наш релиз, удалять не нужно:
            следующая отправка продолжит именно его.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error && <p className="p-6 text-sm text-rose-400">{error}</p>}
          <Table>
            <TableHeader className="bg-background/30">
              <TableRow className="hover:bg-transparent">
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Остановился на</TableHead>
                <TableHead>Наш релиз</TableHead>
                <TableHead className="text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null && !error && (
                <TableRow><TableCell colSpan={5}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
              )}
              {rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Брошенных черновиков нет.
                  </TableCell>
                </TableRow>
              )}
              {rows?.map((d) => (
                <TableRow key={`${d.type}-${d.id}`} className="hover:bg-accent/20">
                  <TableCell>
                    <div className="text-sm">{d.title}</div>
                    <div className="text-xs text-muted-foreground">id {d.id}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.type === "composition" ? "произведение" : "релиз"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.step ? (STEP_LABEL[d.step] ?? d.step) : "—"}
                  </TableCell>
                  <TableCell>
                    {d.ourReleaseId ? (
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        onClick={() => navigate(`/releases/${d.ourReleaseId}`)}
                      >
                        {d.ourReleaseTitle}
                      </button>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">ничей</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={d.safeToRemove ? "outline" : "ghost"}
                      className={d.safeToRemove ? "" : "text-muted-foreground"}
                      onClick={() => setTarget(d)}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить черновик «{target?.title}»?</DialogTitle>
            <DialogDescription>
              {target?.safeToRemove
                ? "Этот черновик ни за одним нашим релизом не числится — удаление ничего у нас не изменит."
                : `Черновик принадлежит нашему релизу «${target?.ourReleaseTitle}». Если удалить, ` +
                  "следующая отправка создаст его в Broma16 заново, с нуля."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => target && remove(target, !target.safeToRemove)}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
