import { Layout } from "@/components/layout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { XCircle, AlertTriangle, Clock, CheckCircle2, Plus } from "lucide-react";

type TakedownStatus = "pending" | "processing" | "completed" | "rejected";

type TakedownRequest = {
  id: number;
  release: string;
  artist: string;
  upc: string;
  reason: string;
  dsps: string[];
  status: TakedownStatus;
  note: string;
  submittedAt: string;
  completedAt: string | null;
};

const STATUS_META: Record<TakedownStatus, { label: string; icon: React.ElementType; color: string }> = {
  pending:    { label: "На рассмотрении", icon: Clock,        color: "bg-amber-500/15 text-amber-400 border-amber-500/25"       },
  processing: { label: "В обработке",     icon: AlertTriangle, color: "bg-blue-500/15 text-blue-400 border-blue-500/25"         },
  completed:  { label: "Выполнен",        icon: CheckCircle2,  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  rejected:   { label: "Отклонён",        icon: XCircle,       color: "bg-red-500/15 text-red-400 border-red-500/25"            },
};

const ALL_DSPS = ["Spotify","Apple Music","YouTube Music","Deezer","Яндекс Музыка","VK Музыка","TikTok Music","Звук","Amazon Music","Tidal"];

const REASONS = [
  "Смена дистрибьютора",
  "Устаревший контент",
  "Нарушение авторских прав",
  "Техническая ошибка в релизе",
  "Коммерческое решение лейбла",
  "Другое",
];

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

export default function TakedownRequests() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<TakedownRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [confirm, setConfirm]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    release: "", upc: "", reason: "", note: "", dsps: [] as string[],
  });

  useEffect(() => {
    api<TakedownRequest[]>("/api/takedowns")
      .then(setRequests)
      .catch(e => toast({ variant: "destructive", title: "Ошибка загрузки", description: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const toggleDsp = (dsp: string) => setForm(p => ({
    ...p,
    dsps: p.dsps.includes(dsp) ? p.dsps.filter(d => d !== dsp) : [...p.dsps, dsp],
  }));

  const handleSubmit = () => {
    if (!form.release || form.dsps.length === 0 || !form.reason) {
      toast({ variant: "destructive", title: "Заполните все обязательные поля" });
      return;
    }
    setOpen(false);
    setConfirm(true);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const created = await api<TakedownRequest>("/api/takedowns", {
        method: "POST",
        body: JSON.stringify({
          release: form.release,
          upc: form.upc || undefined,
          reason: form.reason,
          dsps: form.dsps,
          note: form.note || undefined,
        }),
      });
      setRequests(p => [created, ...p]);
      setForm({ release: "", upc: "", reason: "", note: "", dsps: [] });
      setConfirm(false);
      toast({ title: "Запрос отправлен", description: "Обработка занимает 5–10 рабочих дней" });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : String(e) });
      setConfirm(false);
      setOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <XCircle className="w-6 h-6 text-red-400" />
              Запросы на снятие
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Снятие релизов с цифровых платформ занимает 5–10 рабочих дней
            </p>
          </div>
          <Button variant="destructive" onClick={() => setOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Новый запрос
          </Button>
        </div>

        {/* Warning */}
        <div className="flex gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-400 mb-1">Важно перед отправкой</p>
            <p className="text-muted-foreground">После снятия релиза все стримы и доход на выбранных платформах прекратятся. Операция необратима без повторной дистрибуции.</p>
          </div>
        </div>

        {/* Requests list */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map(r => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{r.release}</CardTitle>
                        <CardDescription>{r.artist ? `${r.artist} · ` : ""}UPC: {r.upc || "—"}</CardDescription>
                      </div>
                      <Badge variant="outline" className={meta.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {meta.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {r.dsps.map(d => (
                        <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Причина: {r.reason}</span>
                      <span>
                        Подано {new Date(r.submittedAt).toLocaleDateString("ru-RU")}
                        {r.completedAt && ` · Выполнено ${new Date(r.completedAt).toLocaleDateString("ru-RU")}`}
                      </span>
                    </div>
                    {r.note && <p className="text-xs text-muted-foreground italic">Примечание: {r.note}</p>}
                  </CardContent>
                </Card>
              );
            })}
            {requests.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <XCircle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>Нет запросов на снятие</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый запрос на снятие</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Название релиза <span className="text-red-400">*</span></Label>
              <Input value={form.release} onChange={e => setForm(p => ({ ...p, release: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>UPC / EAN</Label>
              <Input placeholder="860000000000" value={form.upc} onChange={e => setForm(p => ({ ...p, upc: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Причина снятия <span className="text-red-400">*</span></Label>
              <Select value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите причину" /></SelectTrigger>
                <SelectContent>
                  {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Платформы для снятия <span className="text-red-400">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_DSPS.map(dsp => (
                  <label key={dsp} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={form.dsps.includes(dsp)}
                      onCheckedChange={() => toggleDsp(dsp)}
                    />
                    <span className="text-sm">{dsp}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Примечание</Label>
              <Textarea placeholder="Дополнительная информация..." rows={2}
                value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button variant="destructive" onClick={handleSubmit}>Отправить запрос</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" /> Подтверждение
            </DialogTitle>
            <DialogDescription>
              Вы собираетесь запросить снятие релиза <strong>«{form.release}»</strong> с {form.dsps.length} платформ. Это действие необратимо.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirm(false); setOpen(true); }}>Назад</Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Отправка..." : "Подтвердить снятие"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
