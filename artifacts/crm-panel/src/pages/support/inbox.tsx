import { Layout } from "@/components/layout";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, Search, Filter, AlertTriangle, Clock, CheckCircle2,
  Timer, MessageSquare, UserCheck, Tag, ChevronRight, Send,
  Lock, MoreHorizontal, ArrowUpRight,
} from "lucide-react";

type Status   = "open" | "in_progress" | "waiting" | "resolved" | "closed";
type Priority = "low" | "medium" | "high" | "urgent";
type Category = "Финансы" | "Дистрибуция" | "Каталог" | "Маркетинг" | "Аккаунт" | "Другое";

type Ticket = {
  id: string;
  subject: string;
  category: Category;
  status: Status;
  priority: Priority;
  customer:   { name: string; role: "Артист" | "Лейбл"; initials: string; email: string };
  assignee:   string | null;
  ageHours:   number;
  lastReply:  string;
  messages:   number;
  slaHours:   number;
  preview:    string;
  thread:     { from: string; isAgent: boolean; at: string; text: string }[];
};

const TICKETS: Ticket[] = [
  {
    id: "TCK-2026-0048",
    subject: "Не приходит роялти за март",
    category: "Финансы",
    status: "open",
    priority: "high",
    customer: { name: "Шабнам Сурайё", role: "Артист", initials: "ШС", email: "shabnam@artist.tj" },
    assignee: null,
    ageHours: 2,
    lastReply: "2 часа назад",
    messages: 1,
    slaHours: 24,
    preview: "Брат, в личном кабинете висит баланс, но на карту ничего не пришло. Заявка от 12 апреля...",
    thread: [
      { from: "Шабнам Сурайё", isAgent: false, at: "Сегодня 14:32", text: "Здравствуйте! Заявка на выплату от 12 апреля висит в статусе «Отправлено», но на карту ничего не пришло. Можно проверить?" },
    ],
  },
  {
    id: "TCK-2026-0047",
    subject: "Релиз отклонён Spotify — wrong UPC",
    category: "Дистрибуция",
    status: "in_progress",
    priority: "urgent",
    customer: { name: "Sherlock Records", role: "Лейбл", initials: "SR", email: "ops@sherlock.tj" },
    assignee: "Фарход Г.",
    ageHours: 6,
    lastReply: "1 час назад",
    messages: 8,
    slaHours: 8,
    preview: "Spotify вернул ошибку UPC уже зарегистрирован. Нужна помощь со сменой identifier...",
    thread: [
      { from: "Sherlock Records", isAgent: false, at: "Сегодня 09:14", text: "Spotify вернул ошибку — UPC уже зарегистрирован за другим лейблом. Что делать?" },
      { from: "Фарход Г.",        isAgent: true,  at: "Сегодня 10:02", text: "Принял, посмотрю DDEX-ответ и зарегистрирую новый UPC из нашего пула. Дам знать через час." },
      { from: "Фарход Г.",        isAgent: true,  at: "Сегодня 13:21", text: "Новый UPC присвоен: 0859770892341. Перезалил пакет в Spotify, ждём подтверждения." },
    ],
  },
  {
    id: "TCK-2026-0046",
    subject: "Изменить ISRC на треке",
    category: "Каталог",
    status: "waiting",
    priority: "low",
    customer: { name: "Ёсамин Давлатов", role: "Артист", initials: "ЁД", email: "yosamin@artist.tj" },
    assignee: "Афруза А.",
    ageHours: 28,
    lastReply: "Вчера",
    messages: 4,
    slaHours: 48,
    preview: "Запрашиваю замену ISRC на треке Subhi Bahor — старый код принадлежит другому правообладателю...",
    thread: [
      { from: "Ёсамин Давлатов", isAgent: false, at: "Вчера 11:00", text: "Нужна замена ISRC на Subhi Bahor — старый принадлежал старому лейблу." },
      { from: "Афруза А.",       isAgent: true,  at: "Вчера 12:30", text: "Принято. Жду подтверждение от прав-отдела, ответим в течение 48 часов." },
    ],
  },
  {
    id: "TCK-2026-0045",
    subject: "Не работает пресейв-ссылка",
    category: "Маркетинг",
    status: "open",
    priority: "medium",
    customer: { name: "Манижа Давлатзода", role: "Артист", initials: "МД", email: "manija@artist.tj" },
    assignee: null,
    ageHours: 4,
    lastReply: "4 часа назад",
    messages: 1,
    slaHours: 24,
    preview: "Линк presave.tajikmusic.tj/manija-new выдаёт 404. Релиз через 3 дня, нужно срочно...",
    thread: [
      { from: "Манижа Давлатзода", isAgent: false, at: "Сегодня 12:14", text: "Линк presave.tajikmusic.tj/manija-new выдаёт 404. Релиз через 3 дня — горит!" },
    ],
  },
  {
    id: "TCK-2026-0044",
    subject: "Добавить нового участника в аккаунт",
    category: "Аккаунт",
    status: "resolved",
    priority: "low",
    customer: { name: "Sherlock Records", role: "Лейбл", initials: "SR", email: "ops@sherlock.tj" },
    assignee: "Фарход Г.",
    ageHours: 50,
    lastReply: "Вчера",
    messages: 3,
    slaHours: 48,
    preview: "Просьба пригласить менеджера ops2@sherlock.tj с правами Editor...",
    thread: [
      { from: "Sherlock Records", isAgent: false, at: "Позавчера 16:00", text: "Пригласите ops2@sherlock.tj с правами Editor." },
      { from: "Фарход Г.",        isAgent: true,  at: "Позавчера 16:45", text: "Готово, отправил приглашение." },
      { from: "Sherlock Records", isAgent: false, at: "Вчера 09:10", text: "Спасибо, всё ок!" },
    ],
  },
  {
    id: "TCK-2026-0043",
    subject: "Splits не считаются после изменения",
    category: "Финансы",
    status: "in_progress",
    priority: "high",
    customer: { name: "Парвиз Назаров", role: "Артист", initials: "ПН", email: "parviz@artist.tj" },
    assignee: "Фарход Г.",
    ageHours: 12,
    lastReply: "3 часа назад",
    messages: 5,
    slaHours: 24,
    preview: "Изменил процент сплита с соавтором, новая раскладка не применилась к апрельским отчислениям...",
    thread: [
      { from: "Парвиз Назаров", isAgent: false, at: "Сегодня 04:00", text: "Изменил процент сплита, апрельская выплата идёт по старой раскладке." },
      { from: "Фарход Г.",      isAgent: true,  at: "Сегодня 09:30", text: "Сплиты применяются с новых отчётных периодов. Текущий начислен по раскладке на момент закрытия периода — это норма." },
    ],
  },
  {
    id: "TCK-2026-0042",
    subject: "Хочу подключить YouTube Content ID",
    category: "Дистрибуция",
    status: "open",
    priority: "medium",
    customer: { name: "Парвиз Назаров", role: "Артист", initials: "ПН", email: "parviz@artist.tj" },
    assignee: null,
    ageHours: 18,
    lastReply: "18 часов назад",
    messages: 1,
    slaHours: 24,
    preview: "Подскажи как подключить Content ID для всего каталога, читал в FAQ но не нашёл кнопку...",
    thread: [
      { from: "Парвиз Назаров", isAgent: false, at: "Вчера 22:00", text: "Где включить Content ID для всего каталога? В FAQ написано, но кнопки не нашёл." },
    ],
  },
];

const STATUS_META: Record<Status, { label: string; color: string }> = {
  open:        { label: "Открыт",      color: "bg-rose-500/15 text-rose-300 border-rose-500/25" },
  in_progress: { label: "В работе",    color: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  waiting:     { label: "Ждём клиента", color: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25" },
  resolved:    { label: "Решён",       color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  closed:      { label: "Закрыт",      color: "bg-muted/40 text-muted-foreground border-border/40" },
};

const PRIO_META: Record<Priority, { label: string; color: string; dot: string }> = {
  urgent: { label: "Критично", color: "text-rose-300 border-rose-500/30 bg-rose-500/10",       dot: "bg-rose-400" },
  high:   { label: "Высокий",  color: "text-orange-300 border-orange-500/30 bg-orange-500/10", dot: "bg-orange-400" },
  medium: { label: "Средний",  color: "text-amber-300 border-amber-500/30 bg-amber-500/10",    dot: "bg-amber-400" },
  low:    { label: "Низкий",   color: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", dot: "bg-emerald-400" },
};

const AGENTS = ["Все исполнители", "Не назначено", "Фарход Г.", "Афруза А.", "Manager Bot"];

export default function SupportInbox() {
  const { toast } = useToast();
  const [search,    setSearch]    = useState("");
  const [statusF,   setStatusF]   = useState<string>("all");
  const [prioF,     setPrioF]     = useState<string>("all");
  const [catF,      setCatF]      = useState<string>("all");
  const [assigneeF, setAssigneeF] = useState<string>("Все исполнители");
  const [active,    setActive]    = useState<Ticket | null>(null);
  const [reply,     setReply]     = useState("");
  const [internal,  setInternal]  = useState(false);

  const filtered = useMemo(() => TICKETS.filter(t => {
    if (statusF !== "all" && t.status   !== statusF) return false;
    if (prioF   !== "all" && t.priority !== prioF)   return false;
    if (catF    !== "all" && t.category !== catF)    return false;
    if (assigneeF === "Не назначено" && t.assignee !== null) return false;
    if (assigneeF !== "Все исполнители" && assigneeF !== "Не назначено" && t.assignee !== assigneeF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.subject.toLowerCase().includes(q) &&
          !t.id.toLowerCase().includes(q) &&
          !t.customer.name.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [statusF, prioF, catF, assigneeF, search]);

  const stats = useMemo(() => ({
    open:       TICKETS.filter(t => t.status === "open").length,
    inProgress: TICKETS.filter(t => t.status === "in_progress").length,
    waiting:    TICKETS.filter(t => t.status === "waiting").length,
    resolved:   TICKETS.filter(t => t.status === "resolved").length,
    sla:        TICKETS.filter(t => t.ageHours > t.slaHours && t.status !== "resolved" && t.status !== "closed").length,
    unassigned: TICKETS.filter(t => t.assignee === null && t.status !== "resolved" && t.status !== "closed").length,
  }), []);

  const slaPct = (t: Ticket) => Math.min(100, Math.round((t.ageHours / t.slaHours) * 100));

  function handleReply() {
    if (!reply.trim()) {
      toast({ title: "Пустой ответ", variant: "destructive" });
      return;
    }
    toast({
      title: internal ? "Внутренняя заметка добавлена" : "Ответ отправлен",
      description: `Тикет ${active?.id} обновлён.`,
    });
    setReply("");
    setInternal(false);
  }

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="px-6 py-5 max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-semibold">Хелпдеск — входящие обращения</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Обращения от лейблов и артистов · SLA 24/48 часов · автомаршрутизация по категории
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Tag className="mr-1.5 h-3.5 w-3.5" /> Категории и шаблоны
              </Button>
              <Button size="sm" variant="default">
                <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" /> Отчёт по SLA
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <StatCard icon={AlertTriangle} label="SLA нарушено" value={stats.sla} tone="rose" />
            <StatCard icon={UserCheck}    label="Не назначено" value={stats.unassigned} tone="amber" />
            <StatCard icon={MessageSquare} label="Открыто" value={stats.open} tone="rose" />
            <StatCard icon={Timer}        label="В работе" value={stats.inProgress} tone="amber" />
            <StatCard icon={Clock}        label="Ждём клиента" value={stats.waiting} tone="cyan" />
            <StatCard icon={CheckCircle2} label="Решено" value={stats.resolved} tone="emerald" />
          </div>

          {/* Filters */}
          <Card className="card-surface no-lift border-border/60 mb-4">
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Поиск по ID, теме, клиенту…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm bg-background/40"
                />
              </div>
              <Select value={statusF} onValueChange={setStatusF}>
                <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="open">Открыт</SelectItem>
                  <SelectItem value="in_progress">В работе</SelectItem>
                  <SelectItem value="waiting">Ждём клиента</SelectItem>
                  <SelectItem value="resolved">Решён</SelectItem>
                  <SelectItem value="closed">Закрыт</SelectItem>
                </SelectContent>
              </Select>
              <Select value={prioF} onValueChange={setPrioF}>
                <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Приоритет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все приоритеты</SelectItem>
                  <SelectItem value="urgent">Критично</SelectItem>
                  <SelectItem value="high">Высокий</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="low">Низкий</SelectItem>
                </SelectContent>
              </Select>
              <Select value={catF} onValueChange={setCatF}>
                <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Категория" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  <SelectItem value="Финансы">Финансы</SelectItem>
                  <SelectItem value="Дистрибуция">Дистрибуция</SelectItem>
                  <SelectItem value="Каталог">Каталог</SelectItem>
                  <SelectItem value="Маркетинг">Маркетинг</SelectItem>
                  <SelectItem value="Аккаунт">Аккаунт</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assigneeF} onValueChange={setAssigneeF}>
                <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue placeholder="Исполнитель" /></SelectTrigger>
                <SelectContent>
                  {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => {
                setStatusF("all"); setPrioF("all"); setCatF("all"); setAssigneeF("Все исполнители"); setSearch("");
              }}>
                <Filter className="mr-1.5 h-3.5 w-3.5" /> Сброс
              </Button>
            </CardContent>
          </Card>

          {/* Ticket list */}
          <Card className="card-surface no-lift border-border/60">
            <CardContent className="p-0">
              <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                <span>Очередь обращений · {filtered.length} из {TICKETS.length}</span>
                <span>SLA</span>
              </div>
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Ничего не найдено по выбранным фильтрам.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filtered.map(t => {
                    const sla = slaPct(t);
                    const slaColor = sla >= 100 ? "bg-rose-500" : sla >= 75 ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActive(t)}
                        aria-label={`Открыть тикет ${t.id}: ${t.subject}`}
                        className="w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto_140px_auto] items-center gap-3 px-4 py-3 hover:bg-accent/15 transition-colors text-left focus:outline-none focus:bg-accent/25"
                      >
                        <span className={`h-2 w-2 rounded-full ${PRIO_META[t.priority].dot} shrink-0`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[11px] font-mono text-muted-foreground/80">{t.id}</span>
                            <Badge variant="outline" className="text-[10px] border-border/50">{t.category}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_META[t.status].color}`}>{STATUS_META[t.status].label}</Badge>
                            {t.assignee === null && (
                              <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-300">Не назначено</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate">{t.subject}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{t.preview}</p>
                        </div>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-[10px] font-bold">
                            {t.customer.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-right min-w-[120px]">
                          <p className="text-xs font-medium truncate">{t.customer.name}</p>
                          <p className="text-[10px] text-muted-foreground">{t.customer.role}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${PRIO_META[t.priority].color}`}>
                          {PRIO_META[t.priority].label}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground text-right whitespace-nowrap">
                          <MessageSquare className="inline h-3 w-3 mr-1 opacity-60" />{t.messages}
                          <div className="mt-0.5">{t.lastReply}</div>
                        </div>
                        <div>
                          <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                            <div className={`h-full ${slaColor} transition-all`} style={{ width: `${sla}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                            {t.ageHours}ч / {t.slaHours}ч
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail drawer */}
      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full sm:max-w-[640px] overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono text-muted-foreground">{active.id}</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_META[active.status].color}`}>{STATUS_META[active.status].label}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${PRIO_META[active.priority].color}`}>{PRIO_META[active.priority].label}</Badge>
                  <Badge variant="outline" className="text-[10px]">{active.category}</Badge>
                </div>
                <SheetTitle className="text-base">{active.subject}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 text-xs">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-bold">{active.customer.initials}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">{active.customer.name}</span>
                  <span>·</span>
                  <span>{active.customer.role}</span>
                  <span>·</span>
                  <span>{active.customer.email}</span>
                </SheetDescription>
              </SheetHeader>

              {/* Quick actions */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Select defaultValue={active.assignee ?? "unassigned"}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Не назначено</SelectItem>
                    <SelectItem value="Фарход Г.">Фарход Г.</SelectItem>
                    <SelectItem value="Афруза А.">Афруза А.</SelectItem>
                    <SelectItem value="Manager Bot">Manager Bot</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue={active.priority}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Критично</SelectItem>
                    <SelectItem value="high">Высокий</SelectItem>
                    <SelectItem value="medium">Средний</SelectItem>
                    <SelectItem value="low">Низкий</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue={active.status}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Открыт</SelectItem>
                    <SelectItem value="in_progress">В работе</SelectItem>
                    <SelectItem value="waiting">Ждём клиента</SelectItem>
                    <SelectItem value="resolved">Решён</SelectItem>
                    <SelectItem value="closed">Закрыт</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conversation */}
              <div className="mt-5 space-y-3">
                {active.thread.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 border ${
                      m.isAgent
                        ? "bg-primary/5 border-primary/20 ml-6"
                        : "bg-muted/20 border-border/50 mr-6"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[11px] font-semibold ${m.isAgent ? "text-primary" : "text-foreground"}`}>
                        {m.from}{m.isAgent && " · агент"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{m.at}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{m.text}</p>
                  </div>
                ))}
              </div>

              {/* Reply box */}
              <div className="mt-5 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">{internal ? "Внутренняя заметка (клиент не видит)" : "Ответ клиенту"}</span>
                  <Button
                    variant="ghost" size="sm"
                    className={`h-7 text-[11px] ${internal ? "text-amber-300" : "text-muted-foreground"}`}
                    onClick={() => setInternal(!internal)}
                  >
                    <Lock className="mr-1 h-3 w-3" />
                    {internal ? "Сделать публичным" : "Внутренняя заметка"}
                  </Button>
                </div>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={internal ? "Заметка для команды…" : "Ответ клиенту…"}
                  rows={4}
                  className={`text-sm ${internal ? "bg-amber-500/5 border-amber-500/30" : "bg-background/40"}`}
                />
                <div className="flex items-center justify-between mt-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <MoreHorizontal className="mr-1.5 h-3 w-3" /> Шаблон ответа
                  </Button>
                  <Button size="sm" onClick={handleReply}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {internal ? "Сохранить заметку" : "Отправить"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Layout>
  );
}

function StatCard({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: number;
  tone: "rose" | "amber" | "cyan" | "emerald";
}) {
  const tones = {
    rose:    "text-rose-300 bg-rose-500/10 border-rose-500/20",
    amber:   "text-amber-300 bg-amber-500/10 border-amber-500/20",
    cyan:    "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  };
  return (
    <Card className="card-surface no-lift border-border/60">
      <CardContent className="p-3 flex items-center gap-3">
        <span className={`h-9 w-9 rounded-lg flex items-center justify-center border ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
