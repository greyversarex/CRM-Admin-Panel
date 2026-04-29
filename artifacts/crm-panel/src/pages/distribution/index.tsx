import { Layout } from "@/components/layout";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Send, FileCode2, Inbox, Layers, AlertCircle, CheckCircle2, XCircle,
  Plus, Download, Ban, RotateCw,
} from "lucide-react";
import { useListReleases, useListIntegrations, type Integration } from "@workspace/api-client-react";
import { AcrTab } from "./acr-tab";
import { DisputesTab } from "./disputes-tab";

// ─── Типы DDEX (фронтовые DTO; соответствуют artifacts/api-server/src/routes/ddex.ts)

type ValidationError = { code: string; field?: string; message: string };

type DdexMessage = {
  id: number;
  messageRef: string;
  messageThreadId: string;
  releaseId: number;
  releaseTitle: string | null;
  deliveryId: number | null;
  batchId: number | null;
  partnerCode: string;
  messageType: "NewReleaseMessage" | "PurgeReleaseMessage";
  updateIndicator: "OriginalMessage" | "UpdateMessage" | "TakedownMessage";
  ernVersion: string;
  profile: string | null;
  status: "draft" | "validated" | "invalid" | "queued" | "sent" | "acked" | "rejected" | "cancelled";
  xmlSizeBytes: number;
  validationErrors: ValidationError[] | null;
  rejectionReason: string | null;
  parentMessageId: number | null;
  sentAt: string | null;
  ackedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DdexBatch = {
  id: number;
  batchRef: string;
  partnerCode: string;
  partyIdSender: string;
  partyIdRecipient: string;
  ernVersion: string;
  status: "building" | "uploading" | "uploaded" | "acked" | "partial" | "rejected" | "failed";
  transport: string;
  remotePath: string | null;
  manifestFilename: string | null;
  totalBytes: number;
  fileCount: number;
  attempts: number;
  lastError: string | null;
  uploadedAt: string | null;
  ackReceivedAt: string | null;
  createdAt: string;
};

type DdexAck = {
  id: number;
  messageId: number | null;
  batchId: number | null;
  partnerCode: string;
  source: string;
  ackType: string;
  status: "accepted" | "rejected" | "warning";
  parsed: Record<string, unknown>;
  receivedAt: string;
};

type Paginated<T> = { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
type MessageDetail = { message: DdexMessage; batch: DdexBatch | null; acknowledgements: DdexAck[] };

// ─── HTTP-клиент к /api/ddex (без OpenAPI-codegen — компактно через fetch) ─

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Бейджи статусов ──────────────────────────────────────────────────────

function MsgStatusBadge({ status }: { status: DdexMessage["status"] }) {
  const map: Record<DdexMessage["status"], { label: string; cls: string }> = {
    draft:      { label: "Черновик",   cls: "bg-muted text-muted-foreground" },
    validated:  { label: "Готово",     cls: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
    invalid:    { label: "Ошибки",     cls: "bg-red-500/15 text-red-600 dark:text-red-300" },
    queued:     { label: "В очереди",  cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
    sent:       { label: "Отправлено", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    acked:      { label: "Подтверждено", cls: "bg-emerald-600 text-white" },
    rejected:   { label: "Отклонено",  cls: "bg-red-600 text-white" },
    cancelled:  { label: "Отменено",   cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

function BatchStatusBadge({ status }: { status: DdexBatch["status"] }) {
  const map: Record<DdexBatch["status"], { label: string; cls: string }> = {
    building:  { label: "Сборка",       cls: "bg-muted text-muted-foreground" },
    uploading: { label: "Загрузка",     cls: "bg-blue-500/15 text-blue-600" },
    uploaded:  { label: "Загружено",    cls: "bg-emerald-500/15 text-emerald-600" },
    acked:     { label: "Подтверждено", cls: "bg-emerald-600 text-white" },
    partial:   { label: "Частично",     cls: "bg-amber-500/15 text-amber-600" },
    rejected:  { label: "Отклонено",    cls: "bg-red-600 text-white" },
    failed:    { label: "Сбой",         cls: "bg-red-500/15 text-red-600" },
  };
  const m = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

// ─── Создать сообщение ────────────────────────────────────────────────────

function CreateMessageDialog({ partners, onCreated }: { partners: Integration[]; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [releaseId, setReleaseId] = useState<string>("");
  const [partnerCode, setPartnerCode] = useState<string>("");
  const [updateInd, setUpdateInd] = useState<DdexMessage["updateIndicator"]>("OriginalMessage");
  const [sendNow, setSendNow] = useState(false);

  const releasesQ = useListReleases({ limit: 200 });
  const releases = releasesQ.data?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () => {
      return api<{ messageId: number; status: string; validationErrors: ValidationError[]; xmlBytes: number; sendResult: { ok: boolean; error?: string } | null }>(
        "/ddex/messages",
        { method: "POST", body: JSON.stringify({ releaseId: Number(releaseId), partnerCode, updateIndicator: updateInd, sendNow }) },
      );
    },
    onSuccess: (r) => {
      if (r.status === "invalid") {
        toast({
          variant: "destructive",
          title: `Сообщение создано, но валидация не прошла (${r.validationErrors.length} ошибок)`,
          description: r.validationErrors.slice(0, 3).map((e) => e.message).join("; "),
        });
      } else if (r.sendResult && !r.sendResult.ok) {
        toast({ variant: "destructive", title: "Создано, но отправка не прошла", description: r.sendResult.error });
      } else if (r.sendResult?.ok) {
        toast({ title: "Сообщение создано и отправлено", description: `messageId=${r.messageId}` });
      } else {
        toast({ title: "Сообщение создано", description: `messageId=${r.messageId} · готово к отправке` });
      }
      setOpen(false);
      onCreated(r.messageId);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Не удалось создать сообщение", description: err.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" />Создать сообщение</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Новое DDEX-сообщение</DialogTitle>
          <DialogDescription>
            Сформирует ERN-4.3 XML под выбранный релиз и партнёр. Если включена отправка сейчас — сразу зальёт через настроенный транспорт партнёра.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Релиз</label>
            <Select value={releaseId} onValueChange={setReleaseId}>
              <SelectTrigger><SelectValue placeholder="Выбрать релиз…" /></SelectTrigger>
              <SelectContent>
                {releases.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.title} · {r.artistName} {r.upc ? `· UPC ${r.upc}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Партнёр</label>
            <Select value={partnerCode} onValueChange={setPartnerCode}>
              <SelectTrigger><SelectValue placeholder="Выбрать партнёра…" /></SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.code} value={p.code}>{p.name} ({p.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Тип сообщения</label>
            <Select value={updateInd} onValueChange={(v) => setUpdateInd(v as DdexMessage["updateIndicator"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OriginalMessage">Initial — первичная поставка</SelectItem>
                <SelectItem value="UpdateMessage">Update — обновление метаданных</SelectItem>
                <SelectItem value="TakedownMessage">Takedown — снять с платформы</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
            Отправить сразу после валидации
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={() => createMut.mutate()} disabled={!releaseId || !partnerCode || createMut.isPending}>
            {createMut.isPending ? "Создаём…" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Карточка детального просмотра ────────────────────────────────────────

function MessageDetailDialog({ messageId, onClose, onRefresh }: { messageId: number; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const detailQ = useQuery({
    queryKey: ["ddex-message", messageId],
    queryFn: () => api<MessageDetail>(`/ddex/messages/${messageId}`),
    refetchInterval: 8000,
  });
  const xmlQ = useQuery({
    queryKey: ["ddex-message-xml", messageId],
    queryFn: async () => {
      const res = await fetch(`/api/ddex/messages/${messageId}/xml`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.text();
    },
    enabled: !!detailQ.data,
  });

  const sendMut = useMutation({
    mutationFn: () => api<{ ok: boolean; error?: string; remotePath?: string }>(`/ddex/messages/${messageId}/send`, { method: "POST" }),
    onSuccess: (r) => {
      if (r.ok) { toast({ title: "Отправлено", description: r.remotePath }); onRefresh(); detailQ.refetch(); }
      else toast({ variant: "destructive", title: "Сбой отправки", description: r.error });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Ошибка", description: e.message }),
  });
  const cancelMut = useMutation({
    mutationFn: () => api(`/ddex/messages/${messageId}/cancel`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Сообщение отменено" }); onRefresh(); detailQ.refetch(); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Ошибка", description: e.message }),
  });

  const m = detailQ.data?.message;

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileCode2 className="w-5 h-5" />
            <span>Сообщение #{messageId}</span>
            {m && <MsgStatusBadge status={m.status} />}
          </DialogTitle>
          {m && (
            <DialogDescription className="font-mono text-xs">
              {m.messageRef} · поток {m.messageThreadId}
            </DialogDescription>
          )}
        </DialogHeader>

        {!m ? <Skeleton className="h-[300px] w-full" /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground">Релиз</div><div className="font-medium">{m.releaseTitle ?? `#${m.releaseId}`}</div></div>
              <div><div className="text-muted-foreground">Партнёр</div><div className="font-medium">{m.partnerCode}</div></div>
              <div><div className="text-muted-foreground">Тип</div><div className="font-medium">{m.updateIndicator}</div></div>
              <div><div className="text-muted-foreground">ERN</div><div className="font-medium">{m.ernVersion} / {m.profile}</div></div>
              <div><div className="text-muted-foreground">Размер XML</div><div className="font-medium">{fmtBytes(m.xmlSizeBytes)}</div></div>
              <div><div className="text-muted-foreground">Создано</div><div className="font-medium">{fmtDate(m.createdAt)}</div></div>
              <div><div className="text-muted-foreground">Отправлено</div><div className="font-medium">{fmtDate(m.sentAt)}</div></div>
              <div><div className="text-muted-foreground">Подтверждено</div><div className="font-medium">{fmtDate(m.ackedAt)}</div></div>
            </div>

            {m.validationErrors && m.validationErrors.length > 0 && (
              <div className="border border-red-500/40 bg-red-500/5 rounded-md p-3">
                <div className="font-medium text-red-600 dark:text-red-300 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Ошибки валидации ({m.validationErrors.length})
                </div>
                <ul className="text-sm space-y-1">
                  {m.validationErrors.map((e, i) => (
                    <li key={i}><span className="font-mono text-xs text-muted-foreground">{e.code}</span> — {e.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {m.rejectionReason && (
              <div className="border border-red-500/40 bg-red-500/5 rounded-md p-3">
                <div className="font-medium text-red-600 dark:text-red-300 mb-1">Причина отклонения</div>
                <div className="text-sm">{m.rejectionReason}</div>
              </div>
            )}

            {detailQ.data?.batch && (
              <div className="border rounded-md p-3 text-sm">
                <div className="font-medium mb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Batch
                  <BatchStatusBadge status={detailQ.data.batch.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>batchRef: <span className="font-mono">{detailQ.data.batch.batchRef}</span></div>
                  <div>transport: <span className="font-mono">{detailQ.data.batch.transport}</span></div>
                  <div>файлов: {detailQ.data.batch.fileCount}</div>
                  <div>размер: {fmtBytes(detailQ.data.batch.totalBytes)}</div>
                  <div className="col-span-2">remotePath: <span className="font-mono break-all">{detailQ.data.batch.remotePath}</span></div>
                </div>
              </div>
            )}

            <div>
              <div className="font-medium mb-2 flex items-center gap-2"><Inbox className="w-4 h-4" /> История ack ({detailQ.data?.acknowledgements.length ?? 0})</div>
              {detailQ.data?.acknowledgements.length === 0 && <div className="text-sm text-muted-foreground">Подтверждений ещё не было.</div>}
              <ul className="space-y-1">
                {detailQ.data?.acknowledgements.map((a) => (
                  <li key={a.id} className="text-sm flex items-center gap-2">
                    {a.status === "accepted" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : a.status === "rejected" ? <XCircle className="w-4 h-4 text-red-500" />
                      : <AlertCircle className="w-4 h-4 text-amber-500" />}
                    <span className="font-mono text-xs">{fmtDate(a.receivedAt)}</span>
                    <span>{a.ackType}</span>
                    <Badge variant="outline">{a.source}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-medium mb-2 flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2"><FileCode2 className="w-4 h-4" /> ERN XML</span>
                <a href={`/api/ddex/messages/${messageId}/xml`} download className="inline-flex items-center text-sm text-primary hover:underline">
                  <Download className="w-4 h-4 mr-1" /> Скачать
                </a>
              </div>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-[280px]">{xmlQ.data ?? "Загрузка…"}</pre>
            </div>
          </div>
        )}

        <DialogFooter>
          {m && ["validated", "queued", "draft"].includes(m.status) && (
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
              <Send className="w-4 h-4 mr-2" /> Отправить
            </Button>
          )}
          {m && !["sent", "acked", "rejected", "cancelled"].includes(m.status) && (
            <Button variant="outline" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
              <Ban className="w-4 h-4 mr-2" /> Отменить
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Главная страница ─────────────────────────────────────────────────────

export default function Distribution() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("messages");
  const [openMessageId, setOpenMessageId] = useState<number | null>(null);

  // Фильтры списка сообщений
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPartner, setFPartner] = useState<string>("all");

  const integrationsQ = useListIntegrations({ category: "delivery" });
  const dspIntegrationsQ = useListIntegrations({ category: "dsp" });
  const partners: Integration[] = useMemo(() => {
    return [...(integrationsQ.data?.data ?? []), ...(dspIntegrationsQ.data?.data ?? [])];
  }, [integrationsQ.data, dspIntegrationsQ.data]);

  const messagesQ = useQuery({
    queryKey: ["ddex-messages", fStatus, fPartner],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (fStatus !== "all") params.set("status", fStatus);
      if (fPartner !== "all") params.set("partnerCode", fPartner);
      return api<Paginated<DdexMessage>>(`/ddex/messages?${params}`);
    },
    refetchInterval: 10_000,
  });

  const batchesQ = useQuery({
    queryKey: ["ddex-batches"],
    queryFn: () => api<Paginated<DdexBatch>>(`/ddex/batches?limit=50`),
    refetchInterval: 15_000,
    enabled: tab === "batches",
  });

  const acksQ = useQuery({
    queryKey: ["ddex-acks"],
    queryFn: () => api<Paginated<DdexAck>>(`/ddex/acknowledgements?limit=50`),
    refetchInterval: 15_000,
    enabled: tab === "acks",
  });

  const messages = messagesQ.data?.data ?? [];

  const kpi = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      total: messagesQ.data?.pagination.total ?? 0,
      queued: messages.filter((m) => m.status === "queued" || m.status === "validated").length,
      sentToday: messages.filter((m) => m.sentAt && new Date(m.sentAt) >= today).length,
      issues: messages.filter((m) => m.status === "invalid" || m.status === "rejected").length,
    };
  }, [messages, messagesQ.data]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["ddex-messages"] });
    qc.invalidateQueries({ queryKey: ["ddex-batches"] });
    qc.invalidateQueries({ queryKey: ["ddex-acks"] });
  };

  // Авто-обновление детальной карточки при списочном refetch
  useEffect(() => { if (openMessageId) qc.invalidateQueries({ queryKey: ["ddex-message", openMessageId] }); }, [messages, openMessageId, qc]);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Дистрибуция</h1>
            <p className="text-sm text-muted-foreground">DDEX ERN-4.3 пайплайн: сообщения, батчи и подтверждения партнёров</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCw className="w-4 h-4 mr-2" /> Обновить
            </Button>
            <CreateMessageDialog
              partners={partners}
              onCreated={(id) => { setOpenMessageId(id); refreshAll(); toast({ title: "Сообщение создано", description: `id=${id}` }); }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Всего сообщений"  value={String(kpi.total)}     icon={FileCode2}    iconColor="text-blue-500"    iconBg="bg-blue-500/10" />
          <KpiCard label="В очереди"        value={String(kpi.queued)}    icon={Send}         iconColor="text-amber-500"   iconBg="bg-amber-500/10" />
          <KpiCard label="Отправлено сегодня" value={String(kpi.sentToday)} icon={CheckCircle2} iconColor="text-emerald-500" iconBg="bg-emerald-500/10" />
          <KpiCard label="Требуют внимания" value={String(kpi.issues)}    icon={AlertCircle}  iconColor="text-red-500"     iconBg="bg-red-500/10" />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="messages"><FileCode2 className="w-4 h-4 mr-2" />Сообщения</TabsTrigger>
            <TabsTrigger value="batches"><Layers className="w-4 h-4 mr-2" />Батчи</TabsTrigger>
            <TabsTrigger value="acks"><Inbox className="w-4 h-4 mr-2" />Журнал подтверждений</TabsTrigger>
            <TabsTrigger value="acr">ACRCloud</TabsTrigger>
            <TabsTrigger value="disputes">Споры</TabsTrigger>
          </TabsList>

          {/* ───── Сообщения ───── */}
          <TabsContent value="messages" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Фильтры</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <label className="text-xs text-muted-foreground mb-1 block">Статус</label>
                  <Select value={fStatus} onValueChange={setFStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="draft">Черновик</SelectItem>
                      <SelectItem value="validated">Готово</SelectItem>
                      <SelectItem value="invalid">Ошибки</SelectItem>
                      <SelectItem value="queued">В очереди</SelectItem>
                      <SelectItem value="sent">Отправлено</SelectItem>
                      <SelectItem value="acked">Подтверждено</SelectItem>
                      <SelectItem value="rejected">Отклонено</SelectItem>
                      <SelectItem value="cancelled">Отменено</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-56">
                  <label className="text-xs text-muted-foreground mb-1 block">Партнёр</label>
                  <Select value={fPartner} onValueChange={setFPartner}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все партнёры</SelectItem>
                      {partners.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Сообщение</TableHead>
                      <TableHead>Релиз</TableHead>
                      <TableHead>Партнёр</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Создано</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messagesQ.isLoading && <TableRow><TableCell colSpan={7}><Skeleton className="h-16 w-full" /></TableCell></TableRow>}
                    {messagesQ.isSuccess && messages.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Сообщений ещё нет — нажмите «Создать сообщение»</TableCell></TableRow>
                    )}
                    {messages.map((m) => (
                      <TableRow key={m.id} className="cursor-pointer" onClick={() => setOpenMessageId(m.id)}>
                        <TableCell>
                          <div className="font-mono text-xs">{m.messageRef}</div>
                          <div className="text-xs text-muted-foreground">{m.ernVersion} · {m.profile}</div>
                        </TableCell>
                        <TableCell>{m.releaseTitle ?? `#${m.releaseId}`}</TableCell>
                        <TableCell><Badge variant="outline">{m.partnerCode}</Badge></TableCell>
                        <TableCell>
                          {m.updateIndicator === "OriginalMessage" && "Initial"}
                          {m.updateIndicator === "UpdateMessage" && "Update"}
                          {m.updateIndicator === "TakedownMessage" && "Takedown"}
                        </TableCell>
                        <TableCell><MsgStatusBadge status={m.status} /></TableCell>
                        <TableCell className="text-xs">{fmtDate(m.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setOpenMessageId(m.id); }}>
                            Открыть
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ───── Батчи ───── */}
          <TabsContent value="batches">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>BatchRef</TableHead>
                      <TableHead>Партнёр</TableHead>
                      <TableHead>Транспорт</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Файлов</TableHead>
                      <TableHead>Размер</TableHead>
                      <TableHead>Загружен</TableHead>
                      <TableHead>Удалённый путь</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchesQ.isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-16" /></TableCell></TableRow>}
                    {batchesQ.data?.data.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Батчей ещё не было.</TableCell></TableRow>
                    )}
                    {batchesQ.data?.data.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.batchRef}</TableCell>
                        <TableCell><Badge variant="outline">{b.partnerCode}</Badge></TableCell>
                        <TableCell><Badge>{b.transport}</Badge></TableCell>
                        <TableCell><BatchStatusBadge status={b.status} /></TableCell>
                        <TableCell>{b.fileCount}</TableCell>
                        <TableCell>{fmtBytes(b.totalBytes)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(b.uploadedAt)}</TableCell>
                        <TableCell className="font-mono text-xs break-all max-w-[260px]">{b.remotePath ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ───── Журнал ack ───── */}
          <TabsContent value="acks">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Получено</TableHead>
                      <TableHead>Партнёр</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Сообщение</TableHead>
                      <TableHead>Batch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acksQ.isLoading && <TableRow><TableCell colSpan={7}><Skeleton className="h-16" /></TableCell></TableRow>}
                    {acksQ.data?.data.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Подтверждений ещё не было.</TableCell></TableRow>
                    )}
                    {acksQ.data?.data.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{fmtDate(a.receivedAt)}</TableCell>
                        <TableCell><Badge variant="outline">{a.partnerCode}</Badge></TableCell>
                        <TableCell>{a.ackType}</TableCell>
                        <TableCell>
                          {a.status === "accepted" && <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">принято</Badge>}
                          {a.status === "rejected" && <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">отклонено</Badge>}
                          {a.status === "warning"  && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">внимание</Badge>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{a.source}</Badge></TableCell>
                        <TableCell>
                          {a.messageId ? (
                            <Button variant="link" size="sm" onClick={() => setOpenMessageId(a.messageId!)}>#{a.messageId}</Button>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{a.batchId ? `#${a.batchId}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">Тестирование webhook</CardTitle></CardHeader>
              <CardContent>
                <ManualAckTester onIngested={refreshAll} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="acr" className="space-y-4">
            <Card><CardContent className="pt-6"><AcrTab /></CardContent></Card>
          </TabsContent>

          <TabsContent value="disputes" className="space-y-4">
            <Card><CardContent className="pt-6"><DisputesTab /></CardContent></Card>
          </TabsContent>
        </Tabs>

        {openMessageId && (
          <MessageDetailDialog
            messageId={openMessageId}
            onClose={() => setOpenMessageId(null)}
            onRefresh={refreshAll}
          />
        )}
      </div>
    </Layout>
  );
}

// ─── Ручной тест ack — отправляем XML на /api/ddex/acknowledgements/inbound ─

function ManualAckTester({ onIngested }: { onIngested: () => void }) {
  const { toast } = useToast();
  const [partner, setPartner] = useState("ddex_main");
  const [body, setBody] = useState(
    `<?xml version="1.0" encoding="UTF-8"?>
<MessageAcknowledgement>
  <MessageHeader>
    <MessageId>ACK-MANUAL-001</MessageId>
    <MessageInResponseTo>MSG-ddex_main-XXXX</MessageInResponseTo>
  </MessageHeader>
  <Acknowledgement>
    <MessageStatus>Acknowledged</MessageStatus>
  </Acknowledgement>
</MessageAcknowledgement>`,
  );

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ddex/acknowledgements/inbound`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/xml", "X-DDEX-Partner": partner },
        body,
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: (r: { matchedMessageId?: number; status: string }) => {
      toast({ title: "Ack принят", description: `статус=${r.status}; matched message=${r.matchedMessageId ?? "—"}` });
      onIngested();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Ошибка", description: e.message }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-sm">Партнёр (X-DDEX-Partner):</label>
        <Input className="w-44" value={partner} onChange={(e) => setPartner(e.target.value)} />
      </div>
      <Textarea className="font-mono text-xs h-48" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end">
        <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
          <RotateCw className="w-4 h-4 mr-2" /> Отправить ack
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Подставьте реальный <span className="font-mono">MessageInResponseTo</span> или <span className="font-mono">BatchId</span>, чтобы привязка к сообщению/батчу сработала.
      </p>
    </div>
  );
}
