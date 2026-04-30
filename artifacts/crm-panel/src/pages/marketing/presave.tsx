import { Layout } from "@/components/layout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Copy, ExternalLink, Megaphone, Music, TrendingUp, Users } from "lucide-react";

type Campaign = {
  id: number;
  title: string;
  artist: string;
  releaseDate: string;
  saves: number;
  clicks: number;
  status: "active" | "draft" | "ended";
  link: string;
};

const STATUS_LABELS: Record<Campaign["status"], { label: string; color: string }> = {
  active: { label: "Активна",   color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  draft:  { label: "Черновик",  color: "bg-slate-500/15 text-slate-400 border-slate-500/25" },
  ended:  { label: "Завершена", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
};

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
  return res.json() as Promise<T>;
}

export default function PresaveCampaigns() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", artist: "", releaseDate: "", dsps: "all" });

  useEffect(() => {
    api<Campaign[]>("/api/marketing/presave")
      .then(setCampaigns)
      .catch(e => toast({ variant: "destructive", title: "Ошибка загрузки", description: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const totalSaves  = campaigns.reduce((s, c) => s + c.saves, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const activeCnt   = campaigns.filter(c => c.status === "active").length;

  const handleCreate = async () => {
    if (!form.title || !form.artist || !form.releaseDate) {
      toast({ variant: "destructive", title: "Заполните все поля" });
      return;
    }
    setSaving(true);
    try {
      const created = await api<Campaign>("/api/marketing/presave", {
        method: "POST",
        body: JSON.stringify({ title: form.title, artist: form.artist, releaseDate: form.releaseDate, platforms: form.dsps }),
      });
      setCampaigns(p => [created, ...p]);
      setForm({ title: "", artist: "", releaseDate: "", dsps: "all" });
      setOpen(false);
      toast({ title: "Кампания создана", description: `Pre-save страница для «${created.title}» готова` });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(`https://${link}`).then(() =>
      toast({ title: "Ссылка скопирована" })
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-pink-400" />
              Pre-save кампании
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Соберите сохранения до выхода релиза — Spotify, Apple Music, Deezer
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Новая кампания
          </Button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pink-500/10"><Music className="w-4 h-4 text-pink-400" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Всего сохранений</p>
                  <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16 inline-block" /> : totalSaves.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10"><TrendingUp className="w-4 h-4 text-blue-400" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Переходов</p>
                  <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16 inline-block" /> : totalClicks.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10"><Users className="w-4 h-4 text-emerald-400" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Активных кампаний</p>
                  <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-8 inline-block" /> : activeCnt}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Campaigns list */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <Megaphone className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Нет кампаний. Создайте первую Pre-save страницу.</p>
            <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Новая кампания</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map(c => (
              <Card key={c.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{c.title}</CardTitle>
                      <CardDescription>{c.artist}</CardDescription>
                    </div>
                    <Badge className={STATUS_LABELS[c.status].color} variant="outline">
                      {STATUS_LABELS[c.status].label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 flex-1">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <p className="text-muted-foreground text-xs">Сохранений</p>
                      <p className="font-semibold">{c.saves.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <p className="text-muted-foreground text-xs">Переходов</p>
                      <p className="font-semibold">{c.clicks.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Дата релиза: {new Date(c.releaseDate + "T00:00:00").toLocaleDateString("ru-RU")}
                  </p>
                  {c.link && (
                    <div className="flex items-center gap-1 mt-auto">
                      <code className="text-xs bg-muted rounded px-2 py-1 flex-1 truncate">{c.link}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyLink(c.link)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" asChild>
                        <a href={`https://${c.link}`} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3" /></a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая Pre-save кампания</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Название релиза</Label>
              <Input placeholder="Например: Дил Дил" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Исполнитель</Label>
              <Input placeholder="Имя артиста" value={form.artist} onChange={e => setForm(p => ({ ...p, artist: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Дата релиза</Label>
              <Input type="date" value={form.releaseDate} onChange={e => setForm(p => ({ ...p, releaseDate: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Платформы</Label>
              <Select value={form.dsps} onValueChange={v => setForm(p => ({ ...p, dsps: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все платформы</SelectItem>
                  <SelectItem value="spotify">Только Spotify</SelectItem>
                  <SelectItem value="apple">Только Apple Music</SelectItem>
                  <SelectItem value="spotify_apple">Spotify + Apple Music</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Создание..." : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
