/**
 * Analytics / UGC tab — пользовательский контент: YouTube CMS, TikTok, Meta, Instagram.
 */
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Plus, Youtube, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtMoney } from "@/lib/admin-api";

interface UgcAggregate { platform: string; views: number; likes: number; shares: number; videos: number; revenueCents: number; }

export function UgcTab() {
  const [byPlatform, setByPlatform] = useState<UgcAggregate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ platform: "youtube_cms", externalContentId: "", views: "0", likes: "0", shares: "0", videosCount: "0", revenueCents: "0" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ rows: unknown[]; byPlatform: UgcAggregate[] }>("/api/analytics/ugc");
      setByPlatform(r.byPlatform);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const importSpotify = async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ imported: number; skipped: number; errors: number; message?: string }>(
        "/api/analytics/ugc/import-spotify",
        { method: "POST", body: JSON.stringify({ limit: 100 }) },
      );
      toast({
        title: "Импорт из Spotify завершён",
        description: r.message ?? `Импортировано: ${r.imported}, пропущено: ${r.skipped}, ошибок: ${r.errors}`,
      });
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      toast({
        title: msg.includes("503") ? "Spotify не настроен" : "Ошибка импорта",
        description: msg.includes("503")
          ? "Заполните client_id/client_secret в Settings → Интеграции → Spotify"
          : msg,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const create = async () => {
    try {
      await adminApi("/api/analytics/ugc", { method: "POST", body: JSON.stringify({
        platform: form.platform, externalContentId: form.externalContentId || null,
        views: Number(form.views), likes: Number(form.likes), shares: Number(form.shares),
        videosCount: Number(form.videosCount), revenueCents: Number(form.revenueCents),
      })});
      setOpen(false);
      await load();
      toast({ title: "Запись добавлена" });
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">UGC / социальный контент</h3>
          <p className="text-xs text-muted-foreground">Сводка по YouTube CMS, TikTok, Meta, Instagram. Ручной импорт CSV — через кнопку «Добавить».</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-ugc">
            <RefreshCw className="h-4 w-4 mr-1" /> Обновить
          </Button>
          <Button variant="outline" size="sm" onClick={() => void importSpotify()} disabled={loading} data-testid="button-import-spotify">
            <Music2 className="h-4 w-4 mr-1" /> Импорт из Spotify
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-ugc"><Plus className="h-4 w-4 mr-1" /> Добавить</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {byPlatform.length === 0 ? (
          <div className="col-span-full p-6 text-sm text-muted-foreground text-center border rounded-md bg-card">Нет данных по UGC.</div>
        ) : byPlatform.map((p) => (
          <div key={p.platform} className="p-4 rounded-md border bg-card" data-testid={`card-ugc-${p.platform}`}>
            <div className="flex items-center gap-2 mb-2">
              <Youtube className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline">{p.platform}</Badge>
            </div>
            <div className="text-2xl font-semibold">{Number(p.views).toLocaleString("ru-RU")}</div>
            <div className="text-xs text-muted-foreground">просмотров</div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              <div>Лайков: <span className="font-medium">{Number(p.likes).toLocaleString("ru-RU")}</span></div>
              <div>Шеров: <span className="font-medium">{Number(p.shares).toLocaleString("ru-RU")}</span></div>
              <div>Видео: <span className="font-medium">{Number(p.videos).toLocaleString("ru-RU")}</span></div>
              <div>Доход: <span className="font-medium">{fmtMoney(Number(p.revenueCents) / 100)}</span></div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добавить запись UGC</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Платформа</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                <SelectTrigger data-testid="select-ugc-platform"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube_cms">YouTube CMS</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="meta">Meta</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>External Content ID</Label><Input value={form.externalContentId} onChange={(e) => setForm((f) => ({ ...f, externalContentId: e.target.value }))} data-testid="input-ugc-extid" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Просмотры</Label><Input type="number" value={form.views} onChange={(e) => setForm((f) => ({ ...f, views: e.target.value }))} data-testid="input-ugc-views" /></div>
              <div><Label>Лайки</Label><Input type="number" value={form.likes} onChange={(e) => setForm((f) => ({ ...f, likes: e.target.value }))} data-testid="input-ugc-likes" /></div>
              <div><Label>Шеры</Label><Input type="number" value={form.shares} onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))} data-testid="input-ugc-shares" /></div>
              <div><Label>Видео</Label><Input type="number" value={form.videosCount} onChange={(e) => setForm((f) => ({ ...f, videosCount: e.target.value }))} data-testid="input-ugc-videos" /></div>
            </div>
            <div><Label>Доход (центы)</Label><Input type="number" value={form.revenueCents} onChange={(e) => setForm((f) => ({ ...f, revenueCents: e.target.value }))} data-testid="input-ugc-revenue" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => void create()} data-testid="button-save-ugc">Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
