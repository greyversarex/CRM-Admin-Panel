/**
 * Marketing → Смартлинки.
 *
 * Список всех смартлинков лейбла: поиск по релизу и артисту, обложка, дата
 * релиза и четыре действия в строке — скопировать, редактировать, открыть,
 * удалить. Редактирование живёт в боковой панели `SmartlinkEditor`.
 *
 * Создаются смартлинки в первую очередь с карточки релиза (там уже есть
 * обложка, артист и дата). Кнопка «Создать» здесь — запасной путь для ссылки
 * на релиз, которого нет в каталоге.
 */
import { Layout } from "@/components/layout";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Copy, ExternalLink, Link2, Pencil, Trash2, Search, Music2,
  TrendingUp, MousePointerClick, Loader2,
} from "lucide-react";
import { SmartlinkEditor } from "@/components/smartlink-editor";
import type { SmartLinkDto } from "@/lib/smartlink";

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function jsend<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text();
    let msg = text;
    try { msg = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* не JSON */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

/** "2026-06-13" → "13.06.2026". Пустая дата остаётся прочерком. */
function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

export function SmartLinksPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", artist: "" });
  const [editing, setEditing] = useState<SmartLinkDto | null>(null);
  const [deleting, setDeleting] = useState<SmartLinkDto | null>(null);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["smartlinks"],
    queryFn: () => jget<SmartLinkDto[]>("/api/marketing/links"),
  });

  // Поиск держим на клиенте: список смартлинков лейбла — это десятки строк,
  // ходить за каждым нажатием клавиши на сервер незачем.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return links;
    return links.filter(
      (l) => l.title.toLowerCase().includes(needle) || l.artist.toLowerCase().includes(needle),
    );
  }, [links, q]);

  const totals = useMemo(() => ({
    links: links.length,
    clicks: links.reduce((s, l) => s + l.clicks, 0),
    views: links.reduce((s, l) => s + l.views, 0),
  }), [links]);

  const create = useMutation({
    mutationFn: () => jsend<SmartLinkDto>("/api/marketing/links", "POST", form),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["smartlinks"] });
      setForm({ title: "", artist: "" });
      setCreateOpen(false);
      setEditing(created);   // сразу открываем редактор — без витрин ссылка бесполезна
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось создать", description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => jsend<{ ok: true }>(`/api/marketing/links/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smartlinks"] });
      qc.invalidateQueries({ queryKey: ["smartlink-by-release"] });
      setDeleting(null);
      toast({ title: "Смартлинк удалён" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось удалить", description: e.message }),
  });

  const pageUrl = (slug: string) => `${window.location.origin}/l/${slug}`;

  const copy = (slug: string) => {
    navigator.clipboard.writeText(pageUrl(slug))
      .then(() => toast({ title: "Ссылка скопирована", description: pageUrl(slug) }))
      .catch(() => toast({ variant: "destructive", title: "Буфер обмена недоступен" }));
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link2 className="w-6 h-6 text-pink-400" />
              Смартлинки
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Одна ссылка на все витрины. Слушатель открывает её и выбирает свой сервис.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Создать смартлинк
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10"><Link2 className="w-4 h-4 text-pink-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Смартлинков</p>
                <p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : totals.links}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><TrendingUp className="w-4 h-4 text-blue-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Открытий страниц</p>
                <p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-16 inline-block" /> : totals.views.toLocaleString("ru-RU")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><MousePointerClick className="w-4 h-4 text-emerald-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Переходов на витрины</p>
                <p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-14 inline-block" /> : totals.clicks.toLocaleString("ru-RU")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по артистам и релизам"
            className="pl-9"
            data-testid="smartlinks-search"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Link2 className="w-12 h-12 text-muted-foreground/30" />
                <p className="text-muted-foreground">
                  {q ? "Ничего не нашлось. Попробуйте другой запрос." : "Смартлинков пока нет."}
                </p>
                {!q && (
                  <p className="text-xs text-muted-foreground/70 max-w-sm">
                    Обычно смартлинк создают прямо со страницы релиза — там уже есть обложка, артист и дата.
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                <div className="hidden sm:grid grid-cols-[2.5rem_1fr_9rem_9rem] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>№</span>
                  <span>Релиз</span>
                  <span>Дата релиза</span>
                  <span className="text-right">Действия</span>
                </div>

                {filtered.map((l, i) => (
                  <div
                    key={l.id}
                    className="grid grid-cols-1 sm:grid-cols-[2.5rem_1fr_9rem_9rem] gap-3 px-4 py-3 items-center hover:bg-accent/20 transition-colors"
                    data-testid={`smartlink-row-${l.id}`}
                  >
                    <span className="hidden sm:block text-sm text-muted-foreground">{i + 1}</span>

                    <div className="flex items-center gap-3 min-w-0">
                      {l.coverUrl ? (
                        <img
                          src={`/api/public/smartlinks/${encodeURIComponent(l.slug)}/cover`}
                          alt=""
                          className="h-10 w-10 rounded object-cover shrink-0 bg-muted"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                          <Music2 className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate text-foreground">{l.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{l.artist}</div>
                      </div>
                      {!l.isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground shrink-0">
                          выключен
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <span className="sm:hidden text-xs text-muted-foreground/70">Дата релиза: </span>
                      {fmtDate(l.releaseDate)}
                    </div>

                    <div className="flex items-center gap-1 sm:justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copy(l.slug)} title="Скопировать ссылку">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(l)} title="Редактировать">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Открыть страницу">
                        <a href={pageUrl(l.slug)} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                        onClick={() => setDeleting(l)}
                        title="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && (
        <SmartlinkEditor
          link={editing}
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={(saved) => setEditing(saved)}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новый смартлинк</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Название релиза</Label>
              <Input
                placeholder="Дил Дил"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Артист</Label>
              <Input
                placeholder="Jahongir Ortiqov"
                value={form.artist}
                onChange={(e) => setForm((p) => ({ ...p, artist: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Витрины добавите на следующем шаге. Если релиз есть в каталоге — создавайте смартлинк
              с его страницы, тогда обложка и дата подставятся сами.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.title.trim() || !form.artist.trim()}
              className="gap-1.5"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить смартлинк?</AlertDialogTitle>
            <AlertDialogDescription>
              Страница «{deleting?.title}» перестанет открываться. Если ссылку уже публиковали
              в соцсетях, у слушателей она превратится в «страница не найдена».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function SmartLinks() {
  return (
    <Layout>
      <SmartLinksPanel />
    </Layout>
  );
}
