// ─── Admin: Signup Requests (Task #6) ─────────────────────────────────────
// Список заявок (pending/approved/rejected) + действия approve/reject.
// При успешном approve показываем модал с временным паролем — копируется
// один раз, дальше пароля в ответе нет.
import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Search, Copy, AlertTriangle } from "lucide-react";

type Status = "pending" | "approved" | "rejected";

interface SignupRequest {
  id: number;
  entityType: "artist" | "label";
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  legalName: string | null;
  inn: string | null;
  message: string | null;
  status: Status;
  reviewedBy: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdUserId: number | null;
  createdAt: string;
}

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  pending:  { label: "Ожидает",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  approved: { label: "Одобрена",  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  rejected: { label: "Отклонена", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
};

export default function AdminSignups() {
  const { toast } = useToast();
  const [status, setStatus]   = useState<Status>("pending");
  const [search, setSearch]   = useState("");
  const [items, setItems]     = useState<SignupRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId]   = useState<number | null>(null);

  // approve modal
  const [approveTarget, setApproveTarget] = useState<SignupRequest | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ email: string; password: string } | null>(null);

  // reject modal
  const [rejectTarget, setRejectTarget] = useState<SignupRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const url = new URL("/api/signup-requests", window.location.origin);
      url.searchParams.set("status", status);
      if (search) url.searchParams.set("search", search);
      const res = await fetch(url.toString(), { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setItems(j.data ?? []);
    } catch (err: any) {
      toast({ title: "Ошибка загрузки", description: err.message, variant: "destructive" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function handleApprove(req: SignupRequest) {
    setBusyId(req.id);
    try {
      const res = await fetch(`/api/signup-requests/${req.id}/approve`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),  // role/labelId — оставляем дефолт от заявки
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setApproveTarget(null);
      setTempPasswordResult({ email: j.user.email, password: j.tempPassword });
      load();
    } catch (err: any) {
      toast({ title: "Не удалось одобрить", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 3) {
      toast({ title: "Укажи причину", description: "Минимум 3 символа", variant: "destructive" });
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      const res = await fetch(`/api/signup-requests/${rejectTarget.id}/reject`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: "Заявка отклонена" });
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "Скопировано", description: "Передай пользователю безопасным каналом." }),
      () => toast({ title: "Не удалось скопировать", variant: "destructive" }),
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)]" />
          <h1 className="text-2xl font-bold">Заявки на регистрацию</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Публичные заявки, ожидающие активации аккаунта
          </p>
        </div>

        <Card className="card-surface no-lift border-border/60">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
              <TabsList>
                <TabsTrigger value="pending">Ожидают</TabsTrigger>
                <TabsTrigger value="approved">Одобрены</TabsTrigger>
                <TabsTrigger value="rejected">Отклонены</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") load(); }}
                  placeholder="Имя или email…"
                  className="pl-8 h-9 w-64"
                />
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Обновить"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading && !items && (
              <div className="p-12 flex items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
              </div>
            )}
            {items && items.length === 0 && (
              <div className="p-12 text-center text-muted-foreground text-sm">
                Заявок в статусе «{STATUS_BADGE[status].label}» пока нет
              </div>
            )}
            {items && items.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Заявитель</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Контакты</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => (
                      <TableRow key={r.id} className="hover:bg-accent/20">
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          {r.legalName && <div className="text-xs text-muted-foreground">{r.legalName}{r.inn ? ` · ИНН ${r.inn}` : ""}</div>}
                          {r.message && <div className="text-xs text-muted-foreground/70 mt-0.5 max-w-md line-clamp-2">{r.message}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.entityType === "label" ? "border-violet-500/30 text-violet-400" : "border-emerald-500/30 text-emerald-400"}>
                            {r.entityType === "label" ? "Лейбл" : "Артист"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{r.email}</div>
                          {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                          {r.country && <div className="text-[10px] uppercase text-muted-foreground">{r.country}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[r.status].cls}>
                            {STATUS_BADGE[r.status].label}
                          </Badge>
                          {r.status === "rejected" && r.rejectionReason && (
                            <div className="text-[10px] text-rose-400/80 mt-1 max-w-xs">{r.rejectionReason}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                disabled={busyId === r.id}
                                onClick={() => setApproveTarget(r)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Одобрить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                                disabled={busyId === r.id}
                                onClick={() => { setRejectTarget(r); setRejectReason(""); }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Отклонить
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve confirm */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Одобрить заявку #{approveTarget?.id}?</DialogTitle>
            <DialogDescription>
              Будет создан аккаунт {approveTarget?.entityType === "label" ? "лейбла" : "артиста"} <b>{approveTarget?.name}</b> ({approveTarget?.email}) с временным паролем.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200/80">
              Временный пароль будет показан <b>один раз</b> после нажатия «Одобрить».
              Передай его пользователю безопасным каналом — повторного просмотра не будет.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Отмена</Button>
            <Button
              onClick={() => approveTarget && handleApprove(approveTarget)}
              disabled={busyId === approveTarget?.id}
            >
              {busyId === approveTarget?.id ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Создание…</> : "Одобрить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp password reveal — показывается ровно один раз */}
      <Dialog open={!!tempPasswordResult} onOpenChange={(o) => !o && setTempPasswordResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Аккаунт создан
            </DialogTitle>
            <DialogDescription>
              Передай эти данные пользователю безопасным каналом. Пароль больше не будет показан.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Email</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-background/60 border border-border text-sm font-mono">
                  {tempPasswordResult?.email}
                </code>
                <Button size="sm" variant="outline" onClick={() => tempPasswordResult && copyToClipboard(tempPasswordResult.email)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Временный пароль</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-background/60 border border-primary/30 text-sm font-mono text-primary">
                  {tempPasswordResult?.password}
                </code>
                <Button size="sm" variant="outline" onClick={() => tempPasswordResult && copyToClipboard(tempPasswordResult.password)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPasswordResult(null)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить заявку #{rejectTarget?.id}</DialogTitle>
            <DialogDescription>
              Заявитель будет уведомлён по email. Укажи причину отказа (мин. 3 символа).
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={500}
            placeholder="Причина отказа..."
            className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md bg-background/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={busyId === rejectTarget?.id || rejectReason.trim().length < 3}
            >
              {busyId === rejectTarget?.id ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Отклонение…</> : "Отклонить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
