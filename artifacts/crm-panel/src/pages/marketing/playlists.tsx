import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, ListMusic, TrendingUp, TrendingDown, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type Playlist = {
  id: number;
  playlistName: string;
  dsp: string;
  followers: number;
  streams: number;
  trendPct: number;
  lastUpdated: string;
};

const DSP_OPTIONS = [
  { value: "spotify",       label: "Spotify" },
  { value: "apple_music",   label: "Apple Music" },
  { value: "youtube_music", label: "YouTube Music" },
  { value: "deezer",        label: "Deezer" },
  { value: "tidal",         label: "Tidal" },
  { value: "amazon_music",  label: "Amazon Music" },
];

const DSP_LABEL: Record<string, string> = Object.fromEntries(DSP_OPTIONS.map(d => [d.value, d.label]));

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

export default function PlaylistsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === "admin" || user?.role === "manager" || user?.role === "label";

  const [rows, setRows] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dspFilter, setDspFilter] = useState<string>("all");
  const [editor, setEditor] = useState<Playlist | "new" | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const data = await api<Playlist[]>("/api/analytics/playlists");
      setRows(data);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось загрузить плейлисты", description: e?.message });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (dspFilter !== "all" && r.dsp !== dspFilter) return false;
      if (!q) return true;
      return r.playlistName.toLowerCase().includes(q);
    });
  }, [rows, search, dspFilter]);

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.followers += r.followers;
      acc.streams   += r.streams;
      return acc;
    }, { followers: 0, streams: 0 });
  }, [rows]);

  async function handleDelete() {
    if (!deleting) return;
    try {
      await api(`/api/playlists/${deleting.id}`, { method: "DELETE" });
      toast({ title: "Плейлист удалён" });
      setDeleting(null);
      await reload();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось удалить", description: e?.message });
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
                <ListMusic className="h-5 w-5 text-violet-300" />
              </span>
              Плейлисты
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Плейлисты DSP, где звучат треки каталога — фолловеры, стримы и динамика.
            </p>
          </div>
          {canEdit && (
            <Button className="gap-2" onClick={() => setEditor("new")} data-testid="button-new-playlist">
              <Plus className="h-4 w-4" />
              Добавить плейлист
            </Button>
          )}
        </div>

        {/* KPI */}
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="card-surface border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Всего плейлистов</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-12" /> : rows.length}</div></CardContent>
          </Card>
          <Card className="card-surface border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Всего фолловеров</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-24" /> : totals.followers.toLocaleString()}</div></CardContent>
          </Card>
          <Card className="card-surface border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Всего стримов</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-24" /> : totals.streams.toLocaleString()}</div></CardContent>
          </Card>
        </div>

        <Card className="card-surface border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2 flex-wrap">
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по названию..."
                    className="pl-8 h-9 bg-background/50"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="input-search-playlists"
                  />
                </div>
                <Select value={dspFilter} onValueChange={setDspFilter}>
                  <SelectTrigger className="w-[180px] h-9 bg-background/50"><SelectValue placeholder="DSP" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все DSP</SelectItem>
                    {DSP_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[12px] text-muted-foreground">{filtered.length} / {rows.length}</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Плейлист</TableHead>
                  <TableHead>DSP</TableHead>
                  <TableHead className="text-right">Фолловеры</TableHead>
                  <TableHead className="text-right">Стримы</TableHead>
                  <TableHead className="text-right">Тренд</TableHead>
                  <TableHead>Обновлён</TableHead>
                  {canEdit && <TableHead className="w-[80px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={canEdit ? 7 : 6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 7 : 6} className="h-32 text-center text-muted-foreground">
                      {rows.length === 0 ? "Плейлистов ещё нет. Добавьте первый." : "Нет совпадений с фильтром."}
                    </TableCell>
                  </TableRow>
                ) : filtered.map((p) => (
                  <TableRow key={p.id} className="hover:bg-accent/15" data-testid={`row-playlist-${p.id}`}>
                    <TableCell className="font-medium">{p.playlistName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{DSP_LABEL[p.dsp] ?? p.dsp}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.followers.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.streams.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${p.trendPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {p.trendPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {p.trendPct >= 0 ? "+" : ""}{p.trendPct.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.lastUpdated).toLocaleDateString()}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditor(p)} data-testid={`button-edit-${p.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400" onClick={() => setDeleting(p)} data-testid={`button-delete-${p.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <PlaylistEditor
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={() => { setEditor(null); void reload(); }}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить плейлист?</DialogTitle>
            <DialogDescription>
              {deleting && `«${deleting.playlistName}» (${DSP_LABEL[deleting.dsp] ?? deleting.dsp}). Это действие нельзя отменить.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="button-confirm-delete">Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function PlaylistEditor({
  state, onClose, onSaved,
}: {
  state: Playlist | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isNew = state === "new";
  const current = state && state !== "new" ? state : null;

  const [form, setForm] = useState({
    playlistName: "",
    dsp: "spotify",
    followers: 0,
    streams: 0,
    trendPct: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (current) {
      setForm({
        playlistName: current.playlistName,
        dsp: current.dsp,
        followers: current.followers,
        streams: current.streams,
        trendPct: current.trendPct,
      });
    } else {
      setForm({ playlistName: "", dsp: "spotify", followers: 0, streams: 0, trendPct: 0 });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!form.playlistName.trim()) {
      toast({ variant: "destructive", title: "Укажите название плейлиста" });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await api("/api/playlists", { method: "POST", body: JSON.stringify(form) });
        toast({ title: "Плейлист добавлен" });
      } else if (current) {
        await api(`/api/playlists/${current.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast({ title: "Сохранено" });
      }
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось сохранить", description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Новый плейлист" : "Редактировать плейлист"}</DialogTitle>
          <DialogDescription>Данные плейлиста DSP, в который попал трек каталога.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pl-name">Название</Label>
            <Input id="pl-name" value={form.playlistName} onChange={(e) => setForm(s => ({ ...s, playlistName: e.target.value }))} data-testid="input-playlist-name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pl-dsp">DSP</Label>
            <Select value={form.dsp} onValueChange={(v) => setForm(s => ({ ...s, dsp: v }))}>
              <SelectTrigger id="pl-dsp" data-testid="select-playlist-dsp"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DSP_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pl-foll">Фолловеры</Label>
              <Input id="pl-foll" type="number" min={0} value={form.followers} onChange={(e) => setForm(s => ({ ...s, followers: parseInt(e.target.value || "0", 10) }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pl-str">Стримы</Label>
              <Input id="pl-str" type="number" min={0} value={form.streams} onChange={(e) => setForm(s => ({ ...s, streams: parseInt(e.target.value || "0", 10) }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pl-trend">Тренд %</Label>
              <Input id="pl-trend" type="number" step="0.1" value={form.trendPct} onChange={(e) => setForm(s => ({ ...s, trendPct: parseFloat(e.target.value || "0") }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-playlist">
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
