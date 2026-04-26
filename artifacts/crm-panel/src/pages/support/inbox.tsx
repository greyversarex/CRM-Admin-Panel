import { Layout } from "@/components/layout";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, Search, AlertTriangle, Clock, CheckCircle2,
  Timer, MessageSquare, UserCheck, ChevronRight, Send,
  Lock, ArrowUpRight,
} from "lucide-react";
import {
  useSupportTickets,
  useTicketDetails,
  useReplyToTicket,
  useUpdateTicket,
  useSupportAgents,
  type SupportTicket,
  type TicketMessage,
  type TicketStatus,
  type TicketPriority,
  type TicketCategory,
  CATEGORY_LABELS,
} from "@/lib/support-api";

// ─── Конфигурация значков статусов / приоритетов ───────────────────────────

const STATUS_CFG: Record<TicketStatus, { label: string; cls: string }> = {
  open:        { label: "Открыт",      cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  in_progress: { label: "В работе",    cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  waiting:     { label: "Ждёт ответа", cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  resolved:    { label: "Решён",       cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  closed:      { label: "Закрыт",      cls: "text-muted-foreground bg-muted/30 border-border/40" },
};

const PRIO_CFG: Record<TicketPriority, { label: string; cls: string; rowAccent?: string }> = {
  urgent: { label: "Срочный", cls: "text-rose-300 bg-rose-500/15 border-rose-500/30", rowAccent: "border-l-rose-500" },
  high:   { label: "Высокий", cls: "text-rose-300 bg-rose-500/10 border-rose-500/20", rowAccent: "border-l-rose-400/60" },
  medium: { label: "Средний", cls: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
  low:    { label: "Низкий",  cls: "text-muted-foreground bg-muted/30 border-border/40" },
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SupportInbox() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

  const { data: ticketsData, isLoading } = useSupportTickets({
    status: (statusFilter || undefined) as TicketStatus | undefined,
    priority: (priorityFilter || undefined) as TicketPriority | undefined,
    category: (categoryFilter || undefined) as TicketCategory | undefined,
    assignee: assigneeFilter || undefined,
  });
  const tickets: SupportTicket[] = ticketsData?.data ?? [];

  // Локальный full-text фильтр по subject / requester / ticketRef.
  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) =>
      t.subject.toLowerCase().includes(q) ||
      t.ticketRef.toLowerCase().includes(q) ||
      (t.requester?.name.toLowerCase().includes(q) ?? false) ||
      (t.requester?.email.toLowerCase().includes(q) ?? false)
    );
  }, [tickets, search]);

  // KPI на основе всего списка (а не отфильтрованного).
  const kpi = useMemo(() => {
    const open = tickets.filter((t) => t.status === "open").length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const waiting = tickets.filter((t) => t.status === "waiting").length;
    const resolved24h = tickets.filter((t) => t.status === "resolved" && hoursSince(t.updatedAt) <= 24).length;
    const urgent = tickets.filter((t) => (t.priority === "urgent" || t.priority === "high") && t.status !== "resolved" && t.status !== "closed").length;
    return { open, inProgress, waiting, resolved24h, urgent };
  }, [tickets]);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">Инбокс поддержки</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Очередь тикетов от артистов и лейблов. Назначайте, отвечайте, меняйте статусы.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAssigneeFilter("me")}>
            <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Мои тикеты
          </Button>
        </div>

        {/* KPI */}
        <div className="grid gap-3 md:grid-cols-5">
          <KpiTile icon={Inbox}         label="Открытых"  value={kpi.open}        accent="text-amber-400 bg-amber-500/10 border-amber-500/20" />
          <KpiTile icon={MessageSquare} label="В работе"  value={kpi.inProgress}  accent="text-blue-400 bg-blue-500/10 border-blue-500/20" />
          <KpiTile icon={Clock}         label="Ждут ответа" value={kpi.waiting}   accent="text-violet-400 bg-violet-500/10 border-violet-500/20" />
          <KpiTile icon={CheckCircle2}  label="Решено за 24ч" value={kpi.resolved24h} accent="text-emerald-400 bg-emerald-500/10 border-emerald-500/20" />
          <KpiTile icon={AlertTriangle} label="Срочные / высокие" value={kpi.urgent} accent="text-rose-400 bg-rose-500/10 border-rose-500/20" />
        </div>

        {/* Фильтры */}
        <Card className="card-surface no-lift border-border/60">
          <CardContent className="pt-4 pb-4 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Поиск по теме, номеру, имени или email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-background/50 text-sm"
              />
            </div>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Все статусы"
              options={[
                { v: "open",        l: "Открыт" },
                { v: "in_progress", l: "В работе" },
                { v: "waiting",     l: "Ждёт ответа" },
                { v: "resolved",    l: "Решён" },
                { v: "closed",      l: "Закрыт" },
              ]}
            />
            <FilterSelect value={priorityFilter} onChange={setPriorityFilter} label="Любой приоритет"
              options={[
                { v: "urgent", l: "Срочный" },
                { v: "high",   l: "Высокий" },
                { v: "medium", l: "Средний" },
                { v: "low",    l: "Низкий" },
              ]}
            />
            <FilterSelect value={categoryFilter} onChange={setCategoryFilter} label="Все категории"
              options={Object.keys(CATEGORY_LABELS).map((k) => ({ v: k, l: CATEGORY_LABELS[k] }))}
            />
            <FilterSelect value={assigneeFilter} onChange={setAssigneeFilter} label="Все исполнители"
              options={[
                { v: "me",          l: "Мои" },
                { v: "unassigned",  l: "Не назначено" },
              ]}
            />
          </CardContent>
        </Card>

        {/* Список тикетов */}
        <Card className="card-surface no-lift border-border/60">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-10 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search || statusFilter || priorityFilter || categoryFilter || assigneeFilter
                    ? "По фильтрам тикетов не найдено"
                    : "Очередь пуста — все обращения обработаны"}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {filteredTickets.map((t) => {
                  const accent = PRIO_CFG[t.priority]?.rowAccent ?? "border-l-transparent";
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setOpenTicketId(t.id)}
                        className={`w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors text-left focus:outline-none focus:bg-accent/30 border-l-2 ${accent}`}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-[10px] font-bold">
                            {t.requester?.name.slice(0, 2).toUpperCase() ?? "??"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">{t.ticketRef}</span>
                            <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_CFG[t.status].cls}`}>{STATUS_CFG[t.status].label}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${PRIO_CFG[t.priority].cls}`}>{PRIO_CFG[t.priority].label}</Badge>
                          </div>
                          <p className="text-sm font-medium mt-0.5 truncate">{t.subject}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{t.requester?.name ?? "—"} · {t.requester?.email ?? ""}</span>
                            <span>·</span>
                            <span><MessageSquare className="h-3 w-3 inline mr-1" />{t.messageCount}</span>
                            <span>·</span>
                            <span><Timer className="h-3 w-3 inline mr-1" />{ageLabel(t.lastMessageAt)}</span>
                            <span>·</span>
                            <span>
                              {t.assignee ? (
                                <span className="text-foreground/80">→ {t.assignee.name}</span>
                              ) : (
                                <span className="text-amber-400">не назначено</span>
                              )}
                            </span>
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <InboxTicketDrawer ticketId={openTicketId} onClose={() => setOpenTicketId(null)} />
      </div>
    </Layout>
  );
}

// ─── Drawer (детали + ответ + изменения) ───────────────────────────────────

function InboxTicketDrawer({ ticketId, onClose }: { ticketId: number | null; onClose: () => void }) {
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const { data, isLoading } = useTicketDetails(ticketId);
  const { data: agentsData } = useSupportAgents(ticketId !== null);
  const replyMut = useReplyToTicket(ticketId);
  const patchMut = useUpdateTicket(ticketId);

  const ticket = data?.ticket ?? null;
  const messages = data?.messages ?? [];
  const agents = agentsData?.data ?? [];
  const isClosed = ticket?.status === "closed";

  const handlePatch = (patch: Parameters<typeof patchMut.mutate>[0]) => {
    patchMut.mutate(patch, {
      onError: (e: any) => toast({ variant: "destructive", title: "Не удалось обновить", description: e?.message }),
    });
  };

  return (
    <Sheet open={ticketId !== null} onOpenChange={(o) => { if (!o) { onClose(); setReply(""); setInternal(false); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading || !ticket ? (
          <div className="space-y-3 mt-6">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-2">
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">{ticket.ticketRef}</span>
                <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</Badge>
              </div>
              <SheetTitle className="text-left text-lg">{ticket.subject}</SheetTitle>
              <SheetDescription>
                От: <span className="text-foreground/90">{ticket.requester?.name ?? "—"}</span>{" "}
                <span className="opacity-70">({ticket.requester?.email})</span>
                <span className="mx-1.5">·</span>
                Создан {new Date(ticket.createdAt).toLocaleString("ru-RU")}
              </SheetDescription>
            </SheetHeader>

            {/* Управление: статус / приоритет / исполнитель */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Статус</Label>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => handlePatch({ status: v as TicketStatus })}
                  disabled={patchMut.isPending}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CFG) as TicketStatus[]).map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{STATUS_CFG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Приоритет</Label>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => handlePatch({ priority: v as TicketPriority })}
                  disabled={patchMut.isPending}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIO_CFG) as TicketPriority[]).map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">{PRIO_CFG[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Исполнитель</Label>
                <Select
                  value={ticket.assignee ? String(ticket.assignee.id) : "none"}
                  onValueChange={(v) => handlePatch({ assigneeUserId: v === "none" ? null : Number(v) })}
                  disabled={patchMut.isPending}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">— не назначено —</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)} className="text-xs">{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Thread */}
            <div className="mt-5 space-y-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>

            {isClosed ? (
              <div className="mt-5 p-3 rounded-md border border-border/60 bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Тикет закрыт. Чтобы продолжить переписку — измените статус.
              </div>
            ) : (
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Ответить</Label>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={internal}
                      onChange={(e) => setInternal(e.target.checked)}
                      className="rounded border-border"
                    />
                    Внутренняя заметка (не видна клиенту)
                  </label>
                </div>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={internal ? "Заметка для команды..." : "Ответ клиенту..."}
                  className={`w-full min-h-[100px] px-3 py-2 text-sm rounded-md border focus:outline-none focus:ring-2 resize-none ${
                    internal
                      ? "bg-amber-500/5 border-amber-500/30 focus:ring-amber-500/40"
                      : "bg-background/50 border-border focus:ring-primary/40"
                  }`}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!reply.trim() || replyMut.isPending}
                    onClick={() => {
                      replyMut.mutate(
                        { body: reply.trim(), isInternal: internal },
                        {
                          onSuccess: () => {
                            setReply("");
                            setInternal(false);
                            toast({ title: internal ? "Заметка добавлена" : "Ответ отправлен" });
                          },
                          onError: (e: any) => toast({ variant: "destructive", title: "Не удалось отправить", description: e?.message }),
                        },
                      );
                    }}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {replyMut.isPending ? "Отправка..." : internal ? "Сохранить заметку" : "Отправить ответ"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MessageBubble({ message }: { message: TicketMessage }) {
  const isStaff = message.author?.role === "admin" || message.author?.role === "manager";
  const internalCls = message.isInternal
    ? "bg-amber-500/8 border-amber-500/30"
    : isStaff ? "bg-primary/5 border-primary/20" : "bg-muted/20 border-border/60";
  return (
    <div className={`p-3 rounded-lg border ${internalCls}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[9px] bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold">
              {message.author?.name.slice(0, 2).toUpperCase() ?? "??"}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium">{message.author?.name ?? "—"}</span>
          {isStaff && <Badge variant="outline" className="text-[9px] text-primary bg-primary/10 border-primary/20">Поддержка</Badge>}
          {message.isInternal && (
            <Badge variant="outline" className="text-[9px] text-amber-400 bg-amber-500/10 border-amber-500/30">
              <Lock className="h-2.5 w-2.5 mr-1" /> Internal
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{new Date(message.createdAt).toLocaleString("ru-RU")}</span>
      </div>
      <p className="text-xs whitespace-pre-wrap leading-relaxed">{message.body}</p>
    </div>
  );
}

// ─── Mini-компоненты ───────────────────────────────────────────────────────

function KpiTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
  return (
    <Card className="card-surface no-lift border-border/60">
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <span className={`h-9 w-9 rounded-lg border flex items-center justify-center ${accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-lg font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value, onChange, label, options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger className="h-9 text-xs w-auto min-w-[140px] bg-background/50">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__" className="text-xs">{label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v} className="text-xs">{o.l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
function ageLabel(iso: string): string {
  const h = hoursSince(iso);
  if (h < 1) return `${Math.max(1, Math.floor(h * 60))} мин`;
  if (h < 24) return `${Math.floor(h)} ч`;
  return `${Math.floor(h / 24)} д`;
}
