import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Mail, MapPin, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { api } from "./_api";

type SignupRequest = {
  id: number;
  entityType: "artist" | "label";
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  legalName: string | null;
  inn: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedAt: string | null;
  reviewedBy: number | null;
  rejectionReason: string | null;
  createdAt: string;
};

type ApproveResp = {
  request: SignupRequest;
  user: { id: number; email: string; name: string; role: string };
  tempPassword: string;
};

type Props = { onCountChange?: (n: number) => void };

export function SignupsTab({ onCountChange }: Props) {
  const [items, setItems] = useState<SignupRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [approveTarget, setApproveTarget] = useState<SignupRequest | null>(null);
  const [approveRole, setApproveRole] = useState<"artist" | "label">("artist");
  const [credModal, setCredModal] = useState<ApproveResp | null>(null);
  const [copied, setCopied] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<SignupRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ data: SignupRequest[] }>("/api/signup-requests?status=pending");
      setItems(r.data);
      onCountChange?.(r.data.length);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось загрузить заявки", description: e.message });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function doApprove() {
    if (!approveTarget) return;
    setBusyId(approveTarget.id);
    try {
      const r = await api<ApproveResp>(
        `/api/signup-requests/${approveTarget.id}/approve`,
        { method: "POST", body: JSON.stringify({ role: approveRole }) },
      );
      setApproveTarget(null);
      setCredModal(r);
      await load();
      toast({ title: "Заявка одобрена", description: `${r.user.email} — пароль показан в окне.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось одобрить", description: e.message });
    } finally {
      setBusyId(null);
    }
  }

  async function doReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast({ variant: "destructive", title: "Нужна причина", description: "Опишите кратко причину отказа." });
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      await api(`/api/signup-requests/${rejectTarget.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setRejectTarget(null);
      setRejectReason("");
      await load();
      toast({ title: "Заявка отклонена" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось отклонить", description: e.message });
    } finally {
      setBusyId(null);
    }
  }

  async function copyPassword() {
    if (!credModal) return;
    try {
      await navigator.clipboard.writeText(credModal.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ variant: "destructive", title: "Не удалось скопировать" });
    }
  }

  return (
    <>
      <div className="space-y-3">
        {loading && Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="card-surface no-lift border-border/60">
            <CardContent className="pt-5 pb-5"><Skeleton className="h-20 w-full" /></CardContent>
          </Card>
        ))}
        {!loading && (items?.length ?? 0) === 0 && (
          <Card className="card-surface no-lift border-border/60">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Нет открытых заявок на регистрацию.
            </CardContent>
          </Card>
        )}
        {!loading && items?.map((s) => (
          <Card key={s.id} className="card-surface no-lift border-border/60" data-testid={`row-signup-${s.id}`}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{s.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold">{s.name}</p>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400">Pending</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{s.entityType}</Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">SR-{s.id}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {s.email}</span>
                      {s.phone && <span>📞 {s.phone}</span>}
                      {s.country && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.country}</span>}
                      {s.legalName && <span>Юр. лицо: {s.legalName}</span>}
                      {s.inn && <span>ИНН: {s.inn}</span>}
                    </div>
                    {s.message && <p className="text-xs text-muted-foreground italic">«{s.message}»</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Подана {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                    disabled={busyId === s.id}
                    onClick={() => { setApproveRole(s.entityType); setApproveTarget(s); }}
                    data-testid={`button-approve-signup-${s.id}`}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-400 hover:bg-rose-500/10 border-rose-500/30"
                    disabled={busyId === s.id}
                    onClick={() => { setRejectReason(""); setRejectTarget(s); }}
                    data-testid={`button-reject-signup-${s.id}`}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* APPROVE confirmation */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Одобрить заявку</DialogTitle>
            <DialogDescription>
              Будет создан пользователь <b>{approveTarget?.email}</b>. Пароль покажем после.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Роль</label>
            <select
              className="w-full h-9 px-3 text-sm rounded-md bg-background border border-border"
              value={approveRole}
              onChange={(e) => setApproveRole(e.target.value as "artist" | "label")}
              aria-label="Выбор роли"
            >
              <option value="artist">Артист</option>
              <option value="label">Лейбл</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveTarget(null)}>Отмена</Button>
            <Button onClick={doApprove} disabled={busyId === approveTarget?.id}>Создать пользователя</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TEMP PASSWORD modal — показывается ОДИН раз */}
      <Dialog open={!!credModal} onOpenChange={(o) => !o && (setCredModal(null), setCopied(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Доступ создан</DialogTitle>
            <DialogDescription>
              Передайте эти данные пользователю. <b>Пароль показывается один раз</b> — после закрытия его восстановить нельзя.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/40 border border-border">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-mono">{credModal?.user.email}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/40 border border-border">
              <span className="text-muted-foreground">Временный пароль:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono">{credModal?.tempPassword}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyPassword}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setCredModal(null); setCopied(false); }}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECT */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить заявку</DialogTitle>
            <DialogDescription>
              Заявка <b>{rejectTarget?.email}</b> будет помечена как отклонённая. Причина увидится в логе.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Причина</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Например: дубль аккаунта, фейковые метаданные, нет связи..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>Отмена</Button>
            <Button variant="destructive" onClick={doReject} disabled={busyId === rejectTarget?.id}>
              Отклонить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
