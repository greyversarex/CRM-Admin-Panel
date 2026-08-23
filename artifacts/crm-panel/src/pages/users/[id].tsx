// Карточка пользователя: всё про одного клиента на одной странице.
//
// Намеренно без хитростей: обычный fetch через api(), useState вместо стора,
// вкладки — простой массив. Так страницу легко читать и править дальше.
import { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ShieldAlert, FileSignature, Lock, AlertTriangle, Scale } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { api } from "./_api";

// ─── что показываем ───────────────────────────────────────────────────────

type Overview = {
  user: {
    id: number; name: string; email: string; role: string; status: string;
    blockReason: string | null; phone: string | null; country: string | null;
    city: string | null; kycStatus: string; lastLoginAt: string | null; createdAt: string;
  };
  label: { id: number; name: string; country: string | null; status: string } | null;
  catalog: { releases: number; tracks: number; artists: number };
  finance: { revenue: number; payouts: Record<string, number> };
  kyc: { status: string; documents: number };
  contract: { id: number; number: string; status: string; version: number; signedAt: string | null; expiryDate: string | null } | null;
  rights: { status: string; reviewedAt: string | null } | null;
  violations: { confirmed: number };
  riskLevel: "low" | "medium" | "high";
  restrictions: string[];
};

type Violation = {
  id: number; kind: string; severity: string; status: string; title: string;
  description: string | null; caseId: string | null; createdAt: string;
};

type Contract = {
  id: number; contractNumber: string; title: string; status: string; version: number;
  signedAt: string | null; effectiveDate: string | null; expiryDate: string | null;
};

type Rights = {
  ownsRights: boolean; authorizedToDistribute: boolean;
  acceptsCopyrightResponsibility: boolean; territories: string | null;
  status: string; reviewNote: string | null; submittedAt: string;
};

// Переключатели доступа. Группы ровно те, что в ТЗ заказчика.
const ACCESS_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  {
    title: "Площадки",
    items: [
      { key: "dsp:spotify", label: "Spotify" },
      { key: "dsp:apple", label: "Apple Music" },
      { key: "dsp:youtube", label: "YouTube" },
      { key: "dsp:tiktok", label: "TikTok" },
      { key: "dsp:meta", label: "Meta" },
      { key: "dsp:amazon", label: "Amazon Music" },
      { key: "dsp:deezer", label: "Deezer" },
      { key: "dsp:tidal", label: "Tidal" },
      { key: "dsp:other", label: "Остальные площадки" },
    ],
  },
  {
    title: "Права и Content ID",
    items: [
      { key: "rights:youtube_cid", label: "YouTube Content ID" },
      { key: "rights:meta_rights", label: "Meta Rights Manager" },
      { key: "rights:tiktok_rights", label: "TikTok Rights" },
    ],
  },
  {
    title: "Дистрибуция",
    items: [
      { key: "dist:upload", label: "Загрузка релизов" },
      { key: "dist:delivery", label: "Отдача на площадки" },
      { key: "dist:takedown", label: "Заявки на снятие" },
      { key: "dist:transfer", label: "Перенос каталога" },
      { key: "dist:publishing", label: "Паблишинг" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { key: "fin:revenue", label: "Доходы" },
      { key: "fin:royalties", label: "Роялти" },
      { key: "fin:revenue_distribution", label: "Распределение доходов" },
      { key: "fin:payout_requests", label: "Заявки на выплату" },
      { key: "fin:payouts", label: "Выплаты" },
    ],
  },
  {
    title: "Аккаунт",
    items: [{ key: "account:full_suspension", label: "Полная блокировка аккаунта" }],
  },
];

const RISK_LABEL: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий" };
const RISK_CLASS: Record<string, string> = {
  low: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  medium: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  high: "bg-rose-500/10 border-rose-500/30 text-rose-400",
};
const CONTRACT_LABEL: Record<string, string> = {
  draft: "черновик", sent: "на подписи", signed: "подписан",
  expired: "истёк", terminated: "расторгнут",
};
const RIGHTS_LABEL: Record<string, string> = {
  pending: "на проверке", verified: "подтверждены",
  rejected: "отклонены", info_requested: "запрошены данные",
};
const VIOLATION_KIND_LABEL: Record<string, string> = {
  copyright: "авторские права", metadata: "метаданные", fraud: "мошенничество", other: "другое",
};

function money(n: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ─── страница ─────────────────────────────────────────────────────────────

export default function UserProfile() {
  const [, params] = useRoute("/users/:id");
  const [, navigate] = useLocation();
  const userId = Number(params?.id);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>(`/api/users/${userId}/overview`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (Number.isFinite(userId)) void load(); }, [userId, load]);

  if (loading) {
    return <Layout><div className="p-6"><Skeleton className="h-40 w-full" /></div></Layout>;
  }
  if (error || !overview) {
    return (
      <Layout>
        <div className="p-6 space-y-3">
          <p className="text-sm text-rose-400">{error ?? "Пользователь не найден"}</p>
          <Button variant="outline" onClick={() => navigate("/users")}>К списку</Button>
        </div>
      </Layout>
    );
  }

  const u = overview.user;

  return (
    <Layout>
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 mt-1" onClick={() => navigate("/users")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{u.name}</h1>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {u.email}{overview.label ? ` · ${overview.label.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Badge variant="outline" className={RISK_CLASS[overview.riskLevel]}>
              риск: {RISK_LABEL[overview.riskLevel]}
            </Badge>
            <Badge variant="outline">{u.status === "active" ? "активен" : u.status === "suspended" ? "заблокирован" : u.status}</Badge>
            {overview.restrictions.length > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-400">
                ограничений: {overview.restrictions.length}
              </Badge>
            )}
          </div>
        </div>

        {overview.riskLevel === "high" && (
          <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Подтверждённых нарушений: {overview.violations.confirmed}. Аккаунт помечен как высокий риск —
              решите на вкладке «Доступ», что ограничить. Автоматически ничего не блокируется.
            </span>
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="overview" className="gap-1.5">Обзор</TabsTrigger>
            <TabsTrigger value="access" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> Доступ</TabsTrigger>
            <TabsTrigger value="violations" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Нарушения
              {overview.violations.confirmed > 0 && (
                <Badge variant="outline" className="ml-1 h-4 text-[10px] bg-rose-500/10 border-rose-500/30 text-rose-400">
                  {overview.violations.confirmed}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-1.5"><FileSignature className="h-3.5 w-3.5" /> Договоры</TabsTrigger>
            <TabsTrigger value="rights" className="gap-1.5"><Scale className="h-3.5 w-3.5" /> Права</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab overview={overview} onNavigate={navigate} />
          </TabsContent>
          <TabsContent value="access" className="mt-4">
            <AccessTab userId={userId} active={overview.restrictions} onChange={load} />
          </TabsContent>
          <TabsContent value="violations" className="mt-4">
            <ViolationsTab userId={userId} onChange={load} />
          </TabsContent>
          <TabsContent value="contracts" className="mt-4">
            <ContractsTab userId={userId} onChange={load} />
          </TabsContent>
          <TabsContent value="rights" className="mt-4">
            <RightsTab userId={userId} onChange={load} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ─── обзор ────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function OverviewTab({ overview, onNavigate }: { overview: Overview; onNavigate: (to: string) => void }) {
  const u = overview.user;
  const payouts = overview.finance.payouts;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="card-surface no-lift">
        <CardHeader className="pb-2"><CardTitle className="text-base">Профиль</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row label="Роль" value={u.role} />
          <Row label="Телефон" value={u.phone ?? "—"} />
          <Row label="Страна" value={u.country ?? "—"} />
          <Row label="Регистрация" value={new Date(u.createdAt).toLocaleDateString("ru-RU")} />
          <Row label="Последний вход" value={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("ru-RU") : "—"} />
          <Row label="KYC" value={`${overview.kyc.status} · документов: ${overview.kyc.documents}`} />
          {u.blockReason && <Row label="Причина блокировки" value={u.blockReason} />}
        </CardContent>
      </Card>

      <Card className="card-surface no-lift">
        <CardHeader className="pb-2"><CardTitle className="text-base">Каталог</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row label="Релизов" value={overview.catalog.releases} />
          <Row label="Треков" value={overview.catalog.tracks} />
          <Row label="Артистов" value={overview.catalog.artists} />
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => onNavigate("/releases")}>
            Открыть релизы
          </Button>
        </CardContent>
      </Card>

      <Card className="card-surface no-lift">
        <CardHeader className="pb-2"><CardTitle className="text-base">Финансы</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row label="Начислено" value={money(overview.finance.revenue)} />
          {Object.keys(payouts).length === 0 && <Row label="Выплаты" value="нет" />}
          {Object.entries(payouts).map(([status, sum]) => (
            <Row key={status} label={`Выплаты · ${status}`} value={money(sum)} />
          ))}
        </CardContent>
      </Card>

      <Card className="card-surface no-lift md:col-span-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Статус подключения</CardTitle></CardHeader>
        <CardContent className="pt-0 grid gap-4 md:grid-cols-3">
          <Row label="Договор" value={overview.contract
            ? `${CONTRACT_LABEL[overview.contract.status] ?? overview.contract.status} · № ${overview.contract.number}`
            : "нет"} />
          <Row label="Права" value={overview.rights ? RIGHTS_LABEL[overview.rights.status] ?? overview.rights.status : "не подавались"} />
          <Row label="Подтверждённых нарушений" value={overview.violations.confirmed} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── доступ и ограничения ─────────────────────────────────────────────────

function AccessTab({ userId, active, onChange }: { userId: number; active: string[]; onChange: () => void }) {
  const [pending, setPending] = useState<{ key: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [caseId, setCaseId] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);

  const isRestricted = (key: string) => active.includes(key);

  const applyRestriction = async () => {
    if (!pending || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await api(`/api/users/${userId}/restrictions`, {
        method: "POST",
        body: JSON.stringify({
          feature: pending.key,
          reason: reason.trim(),
          caseId: caseId.trim() || null,
          durationDays: days ? Number(days) : null,
        }),
      });
      toast({ title: "Ограничение применено", description: pending.label });
      setPending(null); setReason(""); setCaseId(""); setDays("");
      onChange();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const lift = async (key: string, label: string) => {
    try {
      await api(`/api/users/${userId}/restrictions/lift`, {
        method: "POST", body: JSON.stringify({ feature: key }),
      });
      toast({ title: "Ограничение снято", description: label });
      onChange();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <>
      <p className="text-[13px] text-muted-foreground mb-3">
        Переключатель включён — функция доступна. Выключаете — система спросит причину и запишет её в журнал.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {ACCESS_GROUPS.map((group) => (
          <Card key={group.title} className="card-surface no-lift">
            <CardHeader className="pb-2"><CardTitle className="text-base">{group.title}</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                  <span className="text-sm">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${isRestricted(item.key) ? "text-rose-400" : "text-emerald-400"}`}>
                      {isRestricted(item.key) ? "закрыто" : "открыто"}
                    </span>
                    <Switch
                      checked={!isRestricted(item.key)}
                      onCheckedChange={(on) => {
                        if (on) void lift(item.key, item.label);
                        else setPending(item);
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ограничить: {pending?.label}</DialogTitle>
            <DialogDescription>Причина обязательна — она попадёт в журнал и в уведомление клиенту.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Например: спор об авторских правах"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Input placeholder="Номер дела (необязательно)" value={caseId} onChange={(e) => setCaseId(e.target.value)} />
            <Input
              type="number" min={1}
              placeholder="Срок в днях (пусто — бессрочно)"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Отмена</Button>
            <Button disabled={busy || reason.trim().length < 3} onClick={applyRestriction}>Ограничить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── нарушения ────────────────────────────────────────────────────────────

function ViolationsTab({ userId, onChange }: { userId: number; onChange: () => void }) {
  const [rows, setRows] = useState<Violation[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "copyright", severity: "warning", title: "", description: "", caseId: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ data: Violation[] }>(`/api/users/${userId}/violations`);
    setRows(r.data);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (form.title.trim().length < 3) return;
    setBusy(true);
    try {
      await api(`/api/users/${userId}/violations`, {
        method: "POST",
        body: JSON.stringify({
          kind: form.kind, severity: form.severity, title: form.title.trim(),
          description: form.description.trim() || null, caseId: form.caseId.trim() || null,
        }),
      });
      setOpen(false);
      setForm({ kind: "copyright", severity: "warning", title: "", description: "", caseId: "" });
      await load(); onChange();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const setStatus = async (id: number, status: string) => {
    await api(`/api/violations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load(); onChange();
  };

  return (
    <Card className="card-surface no-lift">
      <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between">
        <CardTitle className="text-base">Нарушения и заметки</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>Добавить</Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-2">
        {rows === null && <Skeleton className="h-16 w-full" />}
        {rows?.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Нарушений нет.</p>
        )}
        {rows?.map((v) => (
          <div key={v.id} className="rounded-md border border-border/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{v.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {VIOLATION_KIND_LABEL[v.kind] ?? v.kind}
                  {v.caseId ? ` · дело ${v.caseId}` : ""}
                  {` · ${new Date(v.createdAt).toLocaleDateString("ru-RU")}`}
                </div>
                {v.description && <p className="text-xs mt-1.5">{v.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={
                  v.severity === "critical"
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                }>
                  {v.severity === "critical" ? "критично" : "предупреждение"}
                </Badge>
                <Badge variant="outline">
                  {v.status === "confirmed" ? "подтверждено" : v.status === "dismissed" ? "снято" : "открыто"}
                </Badge>
              </div>
            </div>
            {v.status === "open" && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => void setStatus(v.id, "confirmed")}>Подтвердить</Button>
                <Button size="sm" variant="ghost" onClick={() => void setStatus(v.id, "dismissed")}>Снять</Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новое нарушение</DialogTitle>
            <DialogDescription>
              На счётчик риска влияют только подтверждённые. Пока запись открыта, она считается заметкой.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select
              aria-label="Вид нарушения"
              className="h-9 w-full px-3 text-sm rounded-md bg-background/50 border border-border"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="copyright">Авторские права</option>
              <option value="metadata">Метаданные</option>
              <option value="fraud">Мошенничество</option>
              <option value="other">Другое</option>
            </select>
            <select
              aria-label="Серьёзность"
              className="h-9 w-full px-3 text-sm rounded-md bg-background/50 border border-border"
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
            >
              <option value="warning">Предупреждение</option>
              <option value="critical">Критично</option>
            </select>
            <Input placeholder="Коротко о нарушении" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea placeholder="Подробности (необязательно)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input placeholder="Номер дела (необязательно)" value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button disabled={busy || form.title.trim().length < 3} onClick={create}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── договоры ─────────────────────────────────────────────────────────────

function ContractsTab({ userId, onChange }: { userId: number; onChange: () => void }) {
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "Договор на дистрибуцию", effectiveDate: "", expiryDate: "", body: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ data: Contract[] }>(`/api/contracts?userId=${userId}`);
    setRows(r.data);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: number, path: string, body?: object) => {
    try {
      await api(`/api/contracts/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      await load(); onChange();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      await api(`/api/contracts`, {
        method: "POST",
        body: JSON.stringify({
          userId, title: form.title.trim(),
          effectiveDate: form.effectiveDate || null,
          expiryDate: form.expiryDate || null,
          body: form.body.trim() || null,
        }),
      });
      setOpen(false); await load(); onChange();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="card-surface no-lift">
      <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between">
        <CardTitle className="text-base">Договоры</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>Создать</Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-2">
        {rows === null && <Skeleton className="h-16 w-full" />}
        {rows?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Договоров нет.</p>}
        {rows?.map((c) => (
          <div key={c.id} className="rounded-md border border-border/60 p-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{c.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                № {c.contractNumber} · версия {c.version}
                {c.signedAt ? ` · подписан ${new Date(c.signedAt).toLocaleDateString("ru-RU")}` : ""}
                {c.expiryDate ? ` · действует до ${c.expiryDate}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline">{CONTRACT_LABEL[c.status] ?? c.status}</Badge>
              {(c.status === "draft" || c.status === "sent") && (
                <Button size="sm" variant="outline" onClick={() => void act(c.id, "send")}>
                  {c.status === "draft" ? "На подпись" : "Отправить снова"}
                </Button>
              )}
              {c.status === "signed" && (
                <Button
                  size="sm" variant="ghost" className="text-rose-400"
                  onClick={() => {
                    const reason = window.prompt("Причина расторжения:");
                    if (reason && reason.trim().length >= 3) void act(c.id, "terminate", { reason: reason.trim() });
                  }}
                >
                  Расторгнуть
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый договор</DialogTitle>
            <DialogDescription>
              После создания нажмите «На подпись» — клиент получит письмо с кодом и подпишет договор в кабинете.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Действует с</label>
                <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Действует до</label>
                <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>
            <Textarea
              rows={8}
              placeholder="Текст договора"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button disabled={busy || form.title.trim().length < 3} onClick={create}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── права ────────────────────────────────────────────────────────────────

function RightsTab({ userId, onChange }: { userId: number; onChange: () => void }) {
  const [data, setData] = useState<Rights | null | undefined>(undefined);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ data: Rights | null }>(`/api/users/${userId}/rights-verification`);
    setData(r.data);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const review = async (status: string) => {
    try {
      await api(`/api/users/${userId}/rights-verification/review`, {
        method: "POST", body: JSON.stringify({ status, note: note.trim() || null }),
      });
      setNote(""); await load(); onChange();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  if (data === undefined) return <Skeleton className="h-32 w-full" />;
  if (data === null) {
    return (
      <Card className="card-surface no-lift">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Клиент ещё не подтверждал права на каталог.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-surface no-lift">
      <CardHeader className="pb-2"><CardTitle className="text-base">Подтверждение прав</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <Row label="Владеет правами" value={data.ownsRights ? "да" : "нет"} />
        <Row label="Вправе распространять" value={data.authorizedToDistribute ? "да" : "нет"} />
        <Row label="Берёт ответственность за авторские права" value={data.acceptsCopyrightResponsibility ? "да" : "нет"} />
        <Row label="Территории" value={data.territories ?? "—"} />
        <Row label="Подано" value={new Date(data.submittedAt).toLocaleString("ru-RU")} />
        <Row label="Статус" value={<Badge variant="outline">{RIGHTS_LABEL[data.status] ?? data.status}</Badge>} />
        {data.reviewNote && <Row label="Комментарий проверяющего" value={data.reviewNote} />}

        {data.status === "pending" && (
          <div className="mt-4 space-y-3">
            <Textarea placeholder="Комментарий (обязателен при отказе)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void review("verified")}>Подтвердить</Button>
              <Button size="sm" variant="outline" onClick={() => void review("info_requested")}>Запросить данные</Button>
              <Button size="sm" variant="ghost" className="text-rose-400" onClick={() => void review("rejected")}>Отклонить</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
