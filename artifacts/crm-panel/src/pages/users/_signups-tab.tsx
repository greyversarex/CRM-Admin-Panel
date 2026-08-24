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
  status: "pending" | "under_review" | "info_requested" | "approved" | "rejected";
  website: string | null;
  socialMedia: string | null;
  contactPerson: string | null;
  contactPosition: string | null;
  whatsapp: string | null;
  artistCount: number | null;
  releaseCount: number | null;
  trackCount: number | null;
  genres: string | null;
  currentDistributor: string | null;
  reasonForMoving: string | null;
  mainDsps: string | null;
  territories: string | null;
  monthlyReleases: string | null;
  catalogSize: string | null;
  hearAbout: string | null;
  sourceIp: string | null;
  internalNote: string | null;
  infoRequest: string | null;
  infoResponse: string | null;
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

const OPEN_STATUSES = ["pending", "under_review", "info_requested"];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:        { label: "Новая",          className: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  under_review:   { label: "В работе",       className: "bg-sky-500/10 border-sky-500/30 text-sky-400" },
  info_requested: { label: "Ждём данные",    className: "bg-violet-500/10 border-violet-500/30 text-violet-400" },
};

/** Что показывать в раскрытой анкете: подпись и поле. Пустые поля пропускаем. */
const SURVEY_ROWS: [string, string][] = [
  ["Контактное лицо", "contactPerson"],
  ["Должность", "contactPosition"],
  ["WhatsApp", "whatsapp"],
  ["Сайт", "website"],
  ["Соцсети", "socialMedia"],
  ["Артистов", "artistCount"],
  ["Релизов", "releaseCount"],
  ["Треков", "trackCount"],
  ["Жанры", "genres"],
  ["Нынешний дистрибьютор", "currentDistributor"],
  ["Почему уходят", "reasonForMoving"],
  ["Основные площадки", "mainDsps"],
  ["Территории", "territories"],
  ["Релизов в месяц", "monthlyReleases"],
  ["Размер каталога", "catalogSize"],
  ["Откуда узнали", "hearAbout"],
];

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

  const [infoTarget, setInfoTarget] = useState<SignupRequest | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [infoLink, setInfoLink] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      // Заявка «в работе» и «запрошены данные» — тоже открытая: тянем всё и
      // фильтруем на месте, чтобы не делать три запроса.
      const r = await api<{ data: SignupRequest[] }>("/api/signup-requests");
      const open = r.data.filter((x) => OPEN_STATUSES.includes(x.status));
      setItems(open);
      onCountChange?.(open.length);
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

  async function setStatus(s: SignupRequest, status: "under_review") {
    setBusyId(s.id);
    try {
      await api(`/api/signup-requests/${s.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      await load();
      toast({ title: "Заявка взята в работу" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не получилось", description: e.message });
    } finally { setBusyId(null); }
  }

  async function doRequestInfo() {
    if (!infoTarget || infoMessage.trim().length < 3) return;
    setBusyId(infoTarget.id);
    try {
      const r = await api<{ mailSent?: boolean; link?: string }>(
        `/api/signup-requests/${infoTarget.id}/request-info`,
        { method: "POST", body: JSON.stringify({ message: infoMessage.trim() }) },
      );
      setInfoTarget(null); setInfoMessage("");
      await load();
      if (r.link) {
        // Почта не настроена — письмо не ушло. Ссылку показываем, чтобы её
        // можно было передать заявителю любым другим способом.
        setInfoLink(r.link);
      } else {
        toast({ title: "Запрос отправлен", description: "Заявителю ушло письмо со ссылкой для ответа." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не получилось", description: e.message });
    } finally { setBusyId(null); }
  }

  async function saveNote(s: SignupRequest, note: string) {
    try {
      await api(`/api/signup-requests/${s.id}/note`, { method: "POST", body: JSON.stringify({ note }) });
      await load();
      toast({ title: "Заметка сохранена" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не получилось", description: e.message });
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
                      <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[s.status]?.className ?? ""}`}>
                        {STATUS_BADGE[s.status]?.label ?? s.status}
                      </Badge>
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

                    {s.infoRequest && (
                      <div className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/5 p-2 text-xs">
                        <div className="text-violet-300">Запрошено: {s.infoRequest}</div>
                        {s.infoResponse && <div className="mt-1">Ответ: {s.infoResponse}</div>}
                      </div>
                    )}

                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline mt-1.5"
                      onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    >
                      {expanded === s.id ? "Свернуть анкету" : "Показать анкету"}
                    </button>

                    {expanded === s.id && (
                      <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
                        {SURVEY_ROWS.map(([label, value]) => {
                          const v = (s as any)[value];
                          if (v === null || v === undefined || v === "") return null;
                          return (
                            <div key={value} className="flex justify-between gap-3 border-b border-border/30 py-1">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="text-right">{String(v)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {expanded === s.id && (
                      <div className="mt-3">
                        <Textarea
                          className="text-xs"
                          rows={2}
                          placeholder="Внутренняя заметка (видна только сотрудникам)"
                          defaultValue={s.internalNote ?? ""}
                          onBlur={(e) => {
                            if (e.target.value !== (s.internalNote ?? "")) void saveNote(s, e.target.value);
                          }}
                        />
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Подана {new Date(s.createdAt).toLocaleString()}
                      {s.sourceIp ? ` · IP ${s.sourceIp}` : ""}
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
                  {s.status === "pending" && (
                    <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => void setStatus(s, "under_review")}>
                      В работу
                    </Button>
                  )}
                  <Button
                    size="sm" variant="outline"
                    disabled={busyId === s.id}
                    onClick={() => { setInfoMessage(""); setInfoTarget(s); }}
                  >
                    Запросить данные
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

      {/* Почта не настроена — ссылку передаёт администратор */}
      <Dialog open={!!infoLink} onOpenChange={(o) => !o && setInfoLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Почта не настроена — передайте ссылку сами</DialogTitle>
            <DialogDescription>
              Письмо не ушло: в разделе «Настройки → Email / SMTP» не заданы параметры почты.
              Отправьте заявителю эту ссылку — по ней он ответит без регистрации.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 break-all text-xs font-mono">
            {infoLink}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (infoLink) void navigator.clipboard.writeText(infoLink); }}>
              Скопировать
            </Button>
            <Button onClick={() => setInfoLink(null)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REQUEST INFO */}
      <Dialog open={!!infoTarget} onOpenChange={(o) => !o && setInfoTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Запросить дополнительные данные</DialogTitle>
            <DialogDescription>
              Заявителю уйдёт письмо со ссылкой, по которой он ответит без регистрации.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder="Например: пришлите свидетельство о регистрации компании и ссылку на каталог"
            value={infoMessage}
            onChange={(e) => setInfoMessage(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoTarget(null)}>Отмена</Button>
            <Button disabled={infoMessage.trim().length < 3} onClick={doRequestInfo}>Отправить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
