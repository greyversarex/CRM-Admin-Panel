import { Layout } from "@/components/layout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Copy, ExternalLink, Link2, BarChart2, TrendingUp } from "lucide-react";

type SmartLink = {
  id: number;
  title: string;
  artist: string;
  slug: string;
  clicks: number;
  topPlatform: string;
  dsps: { name: string; url: string; active: boolean }[];
  createdAt: string;
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

export default function SmartLinks() {
  const { toast } = useToast();
  const [links, setLinks] = useState<SmartLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", artist: "" });

  useEffect(() => {
    api<SmartLink[]>("/api/marketing/links")
      .then(setLinks)
      .catch(e => toast({ variant: "destructive", title: "Ошибка загрузки", description: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const totalClicks = links.reduce((s, l) => s + l.clicks, 0);

  const handleCreate = async () => {
    if (!form.title || !form.artist) {
      toast({ variant: "destructive", title: "Заполните поля" });
      return;
    }
    setSaving(true);
    try {
      const created = await api<SmartLink>("/api/marketing/links", {
        method: "POST",
        body: JSON.stringify({ title: form.title, artist: form.artist }),
      });
      setLinks(p => [created, ...p]);
      setForm({ title: "", artist: "" });
      setOpen(false);
      toast({ title: "Smart Link создан", description: `link.tajikmusic.com/${created.slug}` });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const copy = (slug: string) => {
    navigator.clipboard.writeText(`https://link.tajikmusic.com/${slug}`)
      .then(() => toast({ title: "Ссылка скопирована" }));
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link2 className="w-6 h-6 text-pink-400" />
              Smart Links
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Одна ссылка — все платформы. Автоматический редирект по стране и устройству.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Создать ссылку
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10"><Link2 className="w-4 h-4 text-pink-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Smart Links</p>
                <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-8 inline-block" /> : links.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><TrendingUp className="w-4 h-4 text-blue-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Всего переходов</p>
                <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16 inline-block" /> : totalClicks.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><BarChart2 className="w-4 h-4 text-emerald-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Ср. переходов / ссылка</p>
                <p className="text-2xl font-bold">
                  {loading ? <Skeleton className="h-7 w-14 inline-block" /> : (links.length ? Math.round(totalClicks / links.length).toLocaleString() : 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <Link2 className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Нет ссылок. Создайте первый Smart Link.</p>
            <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Создать ссылку</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {links.map(l => (
              <Card key={l.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{l.title}</CardTitle>
                      <CardDescription>{l.artist}</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30 bg-blue-500/10">
                      {l.clicks.toLocaleString()} кл.
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {l.dsps.map(d => (
                      <Badge key={d.name} variant="outline"
                        className={d.active ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-muted-foreground opacity-50"}>
                        {d.name}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="text-xs bg-muted rounded px-2 py-1 flex-1 truncate">
                      link.tajikmusic.com/{l.slug}
                    </code>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copy(l.slug)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" asChild>
                      <a href={`https://link.tajikmusic.com/${l.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Создана {new Date(l.createdAt).toLocaleDateString("ru-RU")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новый Smart Link</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Название трека / релиза</Label>
              <Input placeholder="Дил Дил" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Исполнитель</Label>
              <Input placeholder="Jahongir Ortiqov" value={form.artist} onChange={e => setForm(p => ({ ...p, artist: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">
              После создания добавьте ссылки на каждую платформу в настройках.
            </p>
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
