import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, Plus, BookMarked, FileCheck2, Clock, AlertTriangle, FileText,
  Pencil, Loader2, Trash2 as RemoveIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

// ─── Types ──────────────────────────────────────────────────────────────────

type WorkStatus = "draft" | "registered" | "pending" | "active" | "rejected";

interface Writer {
  name: string;
  role: string;       // composer | lyricist | producer | arranger | …
  share: number;      // 0–100
  caeIpi?: string | null;
}

interface PublishingWork {
  id: number;
  title: string;
  iswc: string | null;
  isrc: string | null;
  trackId: number | null;
  status: WorkStatus;
  writers: Writer[];
  publisher: string | null;
  territory: string[];
  registeredWith: string[];
  mlcSongCode: string | null;
  songtrust: boolean;
  ascap: boolean;
  bmi: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_LABEL: Record<WorkStatus, string> = {
  draft: "Черновик",
  pending: "В обработке",
  registered: "Зарегистрировано",
  active: "Активно",
  rejected: "Отклонено",
};

const STATUS_CLS: Record<WorkStatus, string> = {
  draft:      "bg-white/[0.05] text-white/65 border-white/10",
  pending:    "bg-amber-500/15 text-amber-300 border-amber-500/30",
  registered: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  active:     "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected:   "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const ROLE_OPTIONS = [
  { v: "composer", l: "Композитор" },
  { v: "lyricist", l: "Автор текста" },
  { v: "producer", l: "Продюсер" },
  { v: "arranger", l: "Аранжировщик" },
  { v: "performer", l: "Исполнитель" },
];

// ─── API helper ─────────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

const sumShares = (ws: Writer[]) => ws.reduce((s, w) => s + (Number.isFinite(w.share) ? w.share : 0), 0);

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Publishing() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [works, setWorks] = useState<PublishingWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkStatus>("all");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [editor, setEditor] = useState<PublishingWork | "new" | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const r = await api<Paginated<PublishingWork>>("/api/publishing/works?limit=200");
      setWorks(r.data);
    } catch (e: any) {
      toast({ title: "Не удалось загрузить произведения", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { setLoading(false); return; }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return works.filter((w) => {
      const matchStatus = statusFilter === "all" || w.status === statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        (w.iswc ?? "").toLowerCase().includes(q) ||
        (w.isrc ?? "").toLowerCase().includes(q) ||
        (w.publisher ?? "").toLowerCase().includes(q) ||
        w.writers.some((wr) => wr.name.toLowerCase().includes(q))
      );
    });
  }, [works, search, statusFilter]);

  const kpi = useMemo(() => ({
    total: works.length,
    registered: works.filter((w) => w.status === "registered" || w.status === "active").length,
    pending: works.filter((w) => w.status === "pending").length,
    drafts: works.filter((w) => w.status === "draft").length,
    rejected: works.filter((w) => w.status === "rejected").length,
  }), [works]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  if (!isAdmin) {
    return (
      <Layout>
        <Card className="bg-card/50 border-border/50 max-w-md mx-auto mt-12">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Раздел «Произведения» доступен только администраторам и менеджерам.
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                <BookMarked className="h-5 w-5 text-cyan-300" />
              </span>
              Произведения
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Каталог произведений, авторский состав и регистрация в PRO.
            </p>
          </div>
          <Button className="gap-2" onClick={() => setEditor("new")}>
            <Plus className="h-4 w-4" />
            Новое произведение
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile icon={BookMarked}    label="Всего"            value={kpi.total}      color="cyan" />
          <KpiTile icon={FileCheck2}    label="Зарегистрировано" value={kpi.registered} color="emerald" />
          <KpiTile icon={Clock}         label="В обработке"      value={kpi.pending}    color="amber" />
          <KpiTile icon={FileText}      label="Черновики"        value={kpi.drafts}     color="primary" />
          <KpiTile icon={AlertTriangle} label="Отклонено"        value={kpi.rejected}   color="rose" />
        </div>

        {/* Table */}
        <Card className="card-surface border-border/60 overflow-hidden">
          <div className="p-3 border-b border-border/40 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <label htmlFor="pub-search" className="sr-only">Поиск произведений</label>
                <Input
                  id="pub-search"
                  placeholder="Поиск: название, ISWC, ISRC, автор…"
                  className="pl-8 w-[300px] bg-background/40"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
                <SelectTrigger className="w-[170px] bg-background/40" aria-label="Фильтр по статусу">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {(Object.keys(STATUS_LABEL) as WorkStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Найдено: <span className="font-bold text-white">{filtered.length}</span> из {works.length}
            </p>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead>Название</TableHead>
                  <TableHead>Авторы</TableHead>
                  <TableHead>ISWC / ISRC</TableHead>
                  <TableHead>Издатель</TableHead>
                  <TableHead>PRO / реестры</TableHead>
                  <TableHead className="text-right">Доли</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-32 text-muted-foreground">
                      <span className="inline-flex items-center gap-2"><Spinner /> Загрузка…</span>
                    </TableCell>
                  </TableRow>
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-32 text-muted-foreground">
                      {works.length === 0 ? "Каталог пуст. Добавь первое произведение." : "Ничего не найдено."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((w) => {
                    const total = sumShares(w.writers);
                    const valid = Math.round(total) === 100;
                    const pros = [
                      ...(w.ascap ? ["ASCAP"] : []),
                      ...(w.bmi ? ["BMI"] : []),
                      ...(w.songtrust ? ["Songtrust"] : []),
                      ...w.registeredWith,
                    ];
                    return (
                      <TableRow key={w.id} className="border-border/40 hover:bg-accent/15">
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <span>{w.title}</span>
                            {w.mlcSongCode && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">
                                MLC {w.mlcSongCode}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-white/85 text-sm">
                          <div className="flex flex-wrap gap-1.5 max-w-[260px]">
                            {w.writers.length === 0 ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : w.writers.map((wr, i) => (
                              <span key={i} className="inline-flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-full pl-0.5 pr-2 py-0.5 text-[11px]">
                                <span className="h-4 w-4 rounded-full bg-primary/20 text-primary text-[8px] font-bold flex items-center justify-center">
                                  {initialsOf(wr.name)}
                                </span>
                                <span className="truncate max-w-[110px]">{wr.name}</span>
                                <span className="text-white/45">{wr.share}%</span>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-white/55 tabular-nums">
                          {w.iswc ? <div>{w.iswc}</div> : <div className="text-white/30">—</div>}
                          {w.isrc && <div className="text-white/40">{w.isrc}</div>}
                        </TableCell>
                        <TableCell className="text-white/65 text-sm">{w.publisher ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {pros.length === 0 ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : pros.map((p) => (
                              <Badge key={p} variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-bold bg-violet-500/10 text-violet-300 border-violet-500/25">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            title={valid ? "Сумма долей = 100%" : `Сумма долей: ${total}% (норма 100%)`}
                            className={`tabular-nums font-semibold text-sm ${valid ? "text-emerald-300" : "text-amber-300"}`}
                          >
                            {total}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-bold ${STATUS_CLS[w.status]}`}>
                            {STATUS_LABEL[w.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Редактировать ${w.title}`} onClick={() => setEditor(w)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>

          {filtered.length > perPage && (
            <div className="p-3 border-t border-border/40 flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">
                Показано {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} из {filtered.length}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Назад
                </Button>
                <Button variant="outline" size="sm" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Далее
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <WorkDialog
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={(saved, mode) => {
          setWorks((prev) => mode === "create" ? [saved, ...prev] : prev.map((w) => (w.id === saved.id ? saved : w)));
          setEditor(null);
        }}
      />
    </Layout>
  );
}

// ─── Editor dialog ──────────────────────────────────────────────────────────

function WorkDialog({
  state,
  onClose,
  onSaved,
}: {
  state: PublishingWork | "new" | null;
  onClose: () => void;
  onSaved: (w: PublishingWork, mode: "create" | "update") => void;
}) {
  const { toast } = useToast();
  const isOpen = state !== null;
  const isNew = state === "new";
  const editing = state && state !== "new" ? state : null;

  const [form, setForm] = useState<{
    title: string; iswc: string; isrc: string;
    status: WorkStatus; publisher: string;
    territory: string;     // comma-separated
    songtrust: boolean; ascap: boolean; bmi: boolean;
    writers: Writer[];
  }>({
    title: "", iswc: "", isrc: "",
    status: "draft", publisher: "",
    territory: "WW",
    songtrust: false, ascap: false, bmi: false,
    writers: [{ name: "", role: "composer", share: 100, caeIpi: "" }],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm({
        title: editing.title,
        iswc: editing.iswc ?? "",
        isrc: editing.isrc ?? "",
        status: editing.status,
        publisher: editing.publisher ?? "",
        territory: (editing.territory ?? ["WW"]).join(", "),
        songtrust: editing.songtrust,
        ascap: editing.ascap,
        bmi: editing.bmi,
        writers: editing.writers.length > 0
          ? editing.writers.map((w) => ({ ...w, caeIpi: w.caeIpi ?? "" }))
          : [{ name: "", role: "composer", share: 100, caeIpi: "" }],
      });
    } else {
      setForm({
        title: "", iswc: "", isrc: "",
        status: "draft", publisher: "",
        territory: "WW",
        songtrust: false, ascap: false, bmi: false,
        writers: [{ name: "", role: "composer", share: 100, caeIpi: "" }],
      });
    }
  }, [isOpen, editing]);

  const totalShare = sumShares(form.writers);
  const shareOk = Math.round(totalShare) === 100;

  function updateWriter(i: number, patch: Partial<Writer>) {
    setForm((f) => ({
      ...f,
      writers: f.writers.map((w, idx) => (idx === i ? { ...w, ...patch } : w)),
    }));
  }

  function addWriter() {
    const remaining = Math.max(0, 100 - totalShare);
    setForm((f) => ({
      ...f,
      writers: [...f.writers, { name: "", role: "composer", share: remaining, caeIpi: "" }],
    }));
  }

  function removeWriter(i: number) {
    setForm((f) => ({ ...f, writers: f.writers.filter((_, idx) => idx !== i) }));
  }

  async function save() {
    if (!form.title.trim()) {
      toast({ title: "Укажите название", variant: "destructive" });
      return;
    }
    const cleanWriters: Writer[] = [];
    for (let i = 0; i < form.writers.length; i++) {
      const w = form.writers[i];
      const name = w.name.trim();
      if (!name) continue; // skip empty rows
      const share = Number(w.share);
      if (!Number.isFinite(share) || share < 0 || share > 100) {
        toast({
          title: `Доля автора «${name}» некорректна`,
          description: "Допускаются числа от 0 до 100.",
          variant: "destructive",
        });
        return;
      }
      cleanWriters.push({
        name,
        role: w.role,
        share,
        caeIpi: w.caeIpi?.trim() ? w.caeIpi.trim() : null,
      });
    }
    if (cleanWriters.length === 0) {
      toast({ title: "Добавьте хотя бы одного автора", variant: "destructive" });
      return;
    }
    // Reject duplicates by normalized (name, caeIpi).
    const seen = new Set<string>();
    for (const w of cleanWriters) {
      const key = `${w.name.toLowerCase()}|${w.caeIpi ?? ""}`;
      if (seen.has(key)) {
        toast({
          title: `Автор «${w.name}» указан дважды`,
          description: "Объедините доли в одну строку.",
          variant: "destructive",
        });
        return;
      }
      seen.add(key);
    }
    if (Math.round(sumShares(cleanWriters)) !== 100) {
      toast({
        title: "Сумма долей должна быть 100%",
        description: `Сейчас: ${sumShares(cleanWriters)}%`,
        variant: "destructive",
      });
      return;
    }

    const territory = form.territory.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

    const body = {
      title: form.title.trim(),
      iswc: form.iswc.trim() || null,
      isrc: form.isrc.trim() || null,
      trackId: editing?.trackId ?? null,
      status: form.status,
      writers: cleanWriters,
      publisher: form.publisher.trim() || null,
      territory: territory.length > 0 ? territory : ["WW"],
      songtrust: form.songtrust,
      ascap: form.ascap,
      bmi: form.bmi,
    };

    setSaving(true);
    try {
      if (isNew) {
        const created = await api<PublishingWork>("/api/publishing/works", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Произведение добавлено" });
        onSaved(created, "create");
      } else if (editing) {
        const updated = await api<PublishingWork>(`/api/publishing/works/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Произведение обновлено" });
        onSaved(updated, "update");
      }
    } catch (e: any) {
      toast({ title: "Сохранение не удалось", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Новое произведение" : "Редактировать произведение"}</DialogTitle>
          <DialogDescription>Метаданные, авторский состав и регистрация в PRO.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="w-title">Название *</Label>
              <Input id="w-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-iswc">ISWC</Label>
              <Input id="w-iswc" placeholder="T-345.246.800-1" value={form.iswc} onChange={(e) => setForm({ ...form, iswc: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-isrc">ISRC</Label>
              <Input id="w-isrc" placeholder="TJX001234567" value={form.isrc} onChange={(e) => setForm({ ...form, isrc: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as WorkStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as WorkStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="w-pub">Издатель</Label>
              <Input id="w-pub" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-terr">Территории</Label>
              <Input id="w-terr" placeholder="WW или RU, TJ, KZ" value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} />
            </div>
          </div>

          {/* PRO toggles */}
          <div className="rounded-lg border border-border/50 p-3 bg-background/30">
            <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Регистрация в PRO</div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.ascap} onCheckedChange={(v) => setForm({ ...form, ascap: v })} />
                ASCAP
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.bmi} onCheckedChange={(v) => setForm({ ...form, bmi: v })} />
                BMI
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.songtrust} onCheckedChange={(v) => setForm({ ...form, songtrust: v })} />
                Songtrust
              </label>
            </div>
          </div>

          {/* Writers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold">Авторы и доли</div>
                <div className="text-xs text-muted-foreground">
                  Сумма должна быть 100% — сейчас{" "}
                  <span className={shareOk ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{totalShare}%</span>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addWriter}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Добавить автора
              </Button>
            </div>
            <div className="space-y-2">
              {form.writers.map((w, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 rounded border border-border/40 bg-background/30">
                  <div className="col-span-5 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Имя</Label>
                    <Input
                      value={w.name}
                      onChange={(e) => updateWriter(i, { name: e.target.value })}
                      placeholder="Имя автора"
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Роль</Label>
                    <Select value={w.role} onValueChange={(v) => updateWriter(i, { role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Доля %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={w.share}
                      onChange={(e) => updateWriter(i, { share: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">CAE/IPI</Label>
                    <div className="flex gap-1">
                      <Input
                        value={w.caeIpi ?? ""}
                        onChange={(e) => updateWriter(i, { caeIpi: e.target.value })}
                        placeholder="00000000000"
                      />
                      {form.writers.length > 1 && (
                        <Button
                          type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                          aria-label="Удалить автора"
                          onClick={() => removeWriter(i)}
                        >
                          <RemoveIcon className="h-3.5 w-3.5 text-rose-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI tile ───────────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon, label, value, color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: "cyan" | "emerald" | "amber" | "rose" | "primary";
}) {
  const cfg = {
    cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/25",    text: "text-cyan-300" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-300" },
    amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/25",   text: "text-amber-300" },
    rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/25",    text: "text-rose-300" },
    primary: { bg: "bg-primary/10",     border: "border-primary/25",     text: "text-primary" },
  }[color];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-center gap-3`}>
      <span className={`h-10 w-10 rounded-lg bg-black/30 border ${cfg.border} flex items-center justify-center`}>
        <Icon className={`h-5 w-5 ${cfg.text}`} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-white/55 truncate">{label}</p>
        <p className="text-[22px] font-bold tabular-nums leading-tight mt-0.5">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}
