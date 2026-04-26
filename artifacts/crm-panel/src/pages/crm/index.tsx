import { Layout } from "@/components/layout";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Users2, Search, Plus, Phone, Mail, MessageSquare, CheckSquare, Filter, X,
  Pencil, Trash2, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

// ─── Types ──────────────────────────────────────────────────────────────────

type ContactType = "artist" | "author" | "label" | "manager" | "partner";

interface Contact {
  id: number;
  name: string;
  type: ContactType;
  email: string | null;
  phone: string | null;
  company: string | null;
  country: string | null;
  notes: string | null;
  telegram: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface CrmTask {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToId: number | null;
  assignedToName: string | null;
  dueDate: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface UserLite {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  artist: "Артист",
  author: "Автор",
  label: "Лейбл",
  manager: "Менеджер",
  partner: "Партнёр",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Низкий", medium: "Средний", high: "Высокий", urgent: "Срочно",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "В работе", in_progress: "В процессе", done: "Готово", cancelled: "Отменено",
};

function priorityClass(p: TaskPriority) {
  if (p === "urgent") return "text-rose-400 bg-rose-500/15 border-rose-500/30";
  if (p === "high")   return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (p === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-muted-foreground bg-muted/40";
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ─── API helpers ────────────────────────────────────────────────────────────

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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Page ───────────────────────────────────────────────────────────────────

// Telegram value can be either an @username or a https://t.me/... URL.
// We refuse anything else to prevent stored open-redirect / phishing links.
function safeTelegramHref(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("@")) return `https://t.me/${v.slice(1).replace(/[^a-zA-Z0-9_]/g, "")}`;
  if (/^https:\/\/(t\.me|telegram\.me)\/[A-Za-z0-9_+/?=&-]+$/.test(v)) return v;
  if (/^[a-zA-Z0-9_]{3,32}$/.test(v)) return `https://t.me/${v}`;
  return null;
}

export default function CRM() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  const [contactDlg, setContactDlg] = useState<Contact | "new" | null>(null);
  const [taskDlg, setTaskDlg] = useState<CrmTask | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "contact"; id: number; name: string }
    | { kind: "task"; id: number; name: string }
    | null
  >(null);

  const isAdmin = user?.role === "admin" || user?.role === "manager";

  async function reload() {
    setLoading(true);
    try {
      const [c, t, u] = await Promise.all([
        api<Paginated<Contact>>("/api/crm/contacts?limit=100"),
        api<Paginated<CrmTask>>("/api/crm/tasks?limit=100"),
        api<{ data: UserLite[] }>("/api/users?limit=100").catch(() => ({ data: [] })),
      ]);
      setContacts(c.data);
      setTasks(t.data);
      setUsers(u.data);
    } catch (e: any) {
      toast({ title: "Не удалось загрузить CRM", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { setLoading(false); return; }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const [filterTypes, setFilterTypes] = useState<Set<ContactType>>(new Set());
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterHasOpen, setFilterHasOpen] = useState<boolean>(false);

  const countryOptions = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => { if (c.country) s.add(c.country); });
    return Array.from(s).sort();
  }, [contacts]);

  // Контакты с открытыми задачами (для фильтра «есть открытые задачи»)
  const contactsWithOpenTasks = useMemo(() => {
    const s = new Set<number>();
    tasks.forEach((t) => {
      if (
        (t.status === "todo" || t.status === "in_progress") &&
        t.relatedEntityType === "contact" &&
        t.relatedEntityId != null
      ) {
        s.add(t.relatedEntityId);
      }
    });
    return s;
  }, [tasks]);

  const activeFilterCount =
    (filterTypes.size > 0 ? 1 : 0) +
    (filterCountry !== "all" ? 1 : 0) +
    (filterHasOpen ? 1 : 0);

  function resetFilters() {
    setFilterTypes(new Set());
    setFilterCountry("all");
    setFilterHasOpen(false);
  }

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (q) {
        const matchSearch =
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q);
        if (!matchSearch) return false;
      }
      if (filterTypes.size > 0 && !filterTypes.has(c.type)) return false;
      if (filterCountry !== "all" && c.country !== filterCountry) return false;
      if (filterHasOpen && !contactsWithOpenTasks.has(c.id)) return false;
      return true;
    });
  }, [contacts, search, filterTypes, filterCountry, filterHasOpen, contactsWithOpenTasks]);

  const kpi = useMemo(() => ({
    total: contacts.length,
    artists: contacts.filter((c) => c.type === "artist").length,
    open: tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length,
    overdue: tasks.filter(
      (t) => (t.status === "todo" || t.status === "in_progress") && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10),
    ).length,
  }), [contacts, tasks]);

  if (!isAdmin) {
    return (
      <Layout>
        <Card className="bg-card/50 border-border/50 max-w-md mx-auto mt-12">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              CRM доступен только администраторам и менеджерам.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  async function toggleTaskDone(t: CrmTask) {
    if (pendingTaskIds.has(t.id)) return; // ignore double-clicks while in flight
    const previousStatus = t.status;
    const nextStatus: TaskStatus = previousStatus === "done" ? "todo" : "done";
    setPendingTaskIds((p) => new Set(p).add(t.id));
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x)));
    try {
      const updated = await api<CrmTask>(`/api/crm/tasks/${t.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: t.title,
          description: t.description,
          status: nextStatus,
          priority: t.priority,
          assignedToId: t.assignedToId,
          dueDate: t.dueDate,
          relatedEntityType: t.relatedEntityType,
          relatedEntityId: t.relatedEntityId,
        }),
      });
      // Reconcile with server payload (authoritative).
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...updated } : x)));
    } catch (e: any) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: previousStatus } : x)));
      toast({ title: "Не получилось обновить задачу", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setPendingTaskIds((p) => { const n = new Set(p); n.delete(t.id); return n; });
    }
  }

  async function performDelete() {
    if (!confirmDelete) return;
    const item = confirmDelete;
    try {
      if (item.kind === "contact") {
        await api(`/api/crm/contacts/${item.id}`, { method: "DELETE" });
        setContacts((p) => p.filter((c) => c.id !== item.id));
        toast({ title: "Контакт удалён" });
      } else {
        await api(`/api/crm/tasks/${item.id}`, { method: "DELETE" });
        setTasks((p) => p.filter((t) => t.id !== item.id));
        toast({ title: "Задача удалена" });
      }
    } catch (e: any) {
      toast({ title: "Удаление не удалось", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CRM</h1>
            <p className="text-muted-foreground mt-1">Контакты артистов, лейблов, партнёров и внутренние задачи.</p>
          </div>
          <Button onClick={() => setContactDlg("new")}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить контакт
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Всего контактов", value: kpi.total, icon: Users2, color: "text-primary", bg: "bg-primary/10" },
            { label: "Артистов", value: kpi.artists, icon: Users2, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "Открытых задач", value: kpi.open, icon: CheckSquare, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "Просрочено", value: kpi.overdue, icon: CheckSquare, color: "text-rose-400", bg: "bg-rose-500/10" },
          ].map((k) => (
            <Card key={k.label} className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="pt-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="contacts">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="contacts" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> Контакты
            </TabsTrigger>
            <TabsTrigger value="tasks" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" /> Задачи
            </TabsTrigger>
          </TabsList>

          {/* ─── Contacts ─────────────────────────────────────────────────── */}
          <TabsContent value="contacts" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск контактов…"
                    className="pl-8 bg-background/50 border-border h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 bg-background/50 relative"
                      data-testid="button-filter"
                      aria-label="Фильтры контактов"
                    >
                      <Filter className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 space-y-4">
                    <div>
                      <div className="text-xs font-medium mb-2">Тип контакта</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(Object.keys(CONTACT_TYPE_LABEL) as ContactType[]).map((t) => (
                          <label key={t} className="flex items-center gap-2 text-xs cursor-pointer hover-elevate rounded p-1">
                            <Checkbox
                              checked={filterTypes.has(t)}
                              onCheckedChange={(v) => {
                                const s = new Set(filterTypes);
                                if (v) s.add(t); else s.delete(t);
                                setFilterTypes(s);
                              }}
                              data-testid={`filter-type-${t}`}
                            />
                            <span>{CONTACT_TYPE_LABEL[t]}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium mb-2">Страна</div>
                      <select
                        aria-label="Filter by country"
                        className="w-full h-9 px-2 text-xs rounded-md bg-background border border-border"
                        value={filterCountry}
                        onChange={(e) => setFilterCountry(e.target.value)}
                        data-testid="filter-country"
                      >
                        <option value="all">Все страны</option>
                        {countryOptions.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer hover-elevate rounded p-1">
                        <Checkbox
                          checked={filterHasOpen}
                          onCheckedChange={(v) => setFilterHasOpen(!!v)}
                          data-testid="filter-has-open-tasks"
                        />
                        <span>Только с открытыми задачами</span>
                      </label>
                    </div>

                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost" size="sm" className="w-full h-8 text-xs"
                        onClick={resetFilters}
                        data-testid="button-reset-filters"
                      >
                        <X className="h-3 w-3 mr-1" /> Сбросить фильтры
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                    <Spinner /> Загрузка…
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    {contacts.length === 0 ? "Пока нет контактов. Добавь первый." : "Ничего не найдено."}
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {filteredContacts.map((c) => (
                      <div key={c.id} className="flex items-center gap-4 px-6 py-4 hover:bg-accent/20 transition-colors group">
                        <Avatar className="h-10 w-10 border border-border shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {initialsOf(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{c.name}</p>
                            <Badge variant="outline" className="text-xs">{CONTACT_TYPE_LABEL[c.type]}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {[c.company, c.country].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                          {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                          {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                          {c.email && (
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7" aria-label={`Написать email ${c.email}`}>
                              <a href={`mailto:${c.email}`}><Mail className="h-3.5 w-3.5 text-muted-foreground" /></a>
                            </Button>
                          )}
                          {c.telegram && safeTelegramHref(c.telegram) && (
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7" aria-label="Открыть Telegram">
                              <a href={safeTelegramHref(c.telegram)!} target="_blank" rel="noopener noreferrer">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Редактировать контакт ${c.name}`} onClick={() => setContactDlg(c)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Удалить контакт ${c.name}`} onClick={() => setConfirmDelete({ kind: "contact", id: c.id, name: c.name })}>
                            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Tasks ────────────────────────────────────────────────────── */}
          <TabsContent value="tasks" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Задачи</CardTitle>
                  <CardDescription>Внутренние задачи и фоллоу-апы команды</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setTaskDlg("new")}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Добавить задачу
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                    <Spinner /> Загрузка…
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">Задач пока нет.</div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {tasks.map((t) => {
                      const done = t.status === "done";
                      const overdue = !done && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
                      return (
                        <div key={t.id} className={`flex items-center gap-4 px-6 py-4 hover:bg-accent/20 transition-colors group ${done ? "opacity-60" : ""}`}>
                          <button
                            type="button"
                            onClick={() => toggleTaskDone(t)}
                            disabled={pendingTaskIds.has(t.id)}
                            className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-wait ${
                              done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground hover:border-primary"
                            }`}
                            aria-label={done ? "Снять отметку" : "Отметить выполненной"}
                            aria-pressed={done}
                          >
                            {done && <span className="text-white text-[8px]">✓</span>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.dueDate ? <>Срок: <span className={overdue ? "text-rose-400 font-medium" : ""}>{t.dueDate}</span></> : "Без срока"}
                              {t.assignedToName && <> · {t.assignedToName}</>}
                              {!done && <> · {STATUS_LABEL[t.status]}</>}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-xs shrink-0 ${priorityClass(t.priority)}`}>
                            {PRIORITY_LABEL[t.priority]}
                          </Badge>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Редактировать задачу ${t.title}`} onClick={() => setTaskDlg(t)}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Удалить задачу ${t.title}`} onClick={() => setConfirmDelete({ kind: "task", id: t.id, name: t.title })}>
                              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ContactDialog
        state={contactDlg}
        onClose={() => setContactDlg(null)}
        onSaved={(saved, mode) => {
          setContacts((prev) => {
            if (mode === "create") return [saved, ...prev];
            return prev.map((c) => (c.id === saved.id ? saved : c));
          });
          setContactDlg(null);
        }}
      />
      <TaskDialog
        state={taskDlg}
        users={users}
        onClose={() => setTaskDlg(null)}
        onSaved={(saved, mode) => {
          setTasks((prev) => {
            if (mode === "create") return [saved, ...prev];
            return prev.map((t) => (t.id === saved.id ? saved : t));
          });
          setTaskDlg(null);
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить безвозвратно?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "contact" ? "Контакт" : "Задача"} «{confirmDelete?.name}» будет удалён{confirmDelete?.kind === "task" ? "а" : ""}. Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={performDelete} className="bg-rose-500 hover:bg-rose-600">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

// ─── Contact dialog ─────────────────────────────────────────────────────────

function ContactDialog({
  state,
  onClose,
  onSaved,
}: {
  state: Contact | "new" | null;
  onClose: () => void;
  onSaved: (c: Contact, mode: "create" | "update") => void;
}) {
  const { toast } = useToast();
  const isOpen = state !== null;
  const isNew = state === "new";
  const editing = state && state !== "new" ? state : null;

  const [form, setForm] = useState<{
    name: string; type: ContactType;
    email: string; phone: string; company: string; country: string;
    telegram: string; whatsapp: string; notes: string;
  }>({
    name: "", type: "artist",
    email: "", phone: "", company: "", country: "",
    telegram: "", whatsapp: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type,
        email: editing.email ?? "",
        phone: editing.phone ?? "",
        company: editing.company ?? "",
        country: editing.country ?? "",
        telegram: editing.telegram ?? "",
        whatsapp: editing.whatsapp ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm({ name: "", type: "artist", email: "", phone: "", company: "", country: "", telegram: "", whatsapp: "", notes: "" });
    }
  }, [isOpen, editing]);

  async function save() {
    if (!form.name.trim()) {
      toast({ title: "Укажите имя", variant: "destructive" });
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      type: form.type,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      country: form.country.trim() || null,
      telegram: form.telegram.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (isNew) {
        const created = await api<Contact>("/api/crm/contacts", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Контакт добавлен" });
        onSaved(created, "create");
      } else if (editing) {
        const updated = await api<Contact>(`/api/crm/contacts/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Контакт обновлён" });
        onSaved(updated, "update");
      }
    } catch (e: any) {
      toast({ title: "Сохранение не удалось", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Новый контакт" : "Редактировать контакт"}</DialogTitle>
          <DialogDescription>Базовая информация для связи и тэгирования.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="c-name">Имя *</Label>
            <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Тип</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ContactType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTACT_TYPE_LABEL) as ContactType[]).map((k) => (
                  <SelectItem key={k} value={k}>{CONTACT_TYPE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-company">Компания</Label>
            <Input id="c-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-phone">Телефон</Label>
            <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-tg">Telegram</Label>
            <Input id="c-tg" placeholder="@username" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-wa">WhatsApp</Label>
            <Input id="c-wa" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-country">Страна</Label>
            <Input id="c-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="c-notes">Заметки</Label>
            <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task dialog ────────────────────────────────────────────────────────────

function TaskDialog({
  state,
  users,
  onClose,
  onSaved,
}: {
  state: CrmTask | "new" | null;
  users: UserLite[];
  onClose: () => void;
  onSaved: (t: CrmTask, mode: "create" | "update") => void;
}) {
  const { toast } = useToast();
  const isOpen = state !== null;
  const isNew = state === "new";
  const editing = state && state !== "new" ? state : null;

  const [form, setForm] = useState<{
    title: string; description: string;
    status: TaskStatus; priority: TaskPriority;
    assignedToId: string; dueDate: string;
  }>({
    title: "", description: "",
    status: "todo", priority: "medium",
    assignedToId: "none", dueDate: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description ?? "",
        status: editing.status,
        priority: editing.priority,
        assignedToId: editing.assignedToId ? String(editing.assignedToId) : "none",
        dueDate: editing.dueDate ?? "",
      });
    } else {
      setForm({ title: "", description: "", status: "todo", priority: "medium", assignedToId: "none", dueDate: "" });
    }
  }, [isOpen, editing]);

  async function save() {
    if (!form.title.trim()) {
      toast({ title: "Укажите название задачи", variant: "destructive" });
      return;
    }
    setSaving(true);
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      assignedToId: form.assignedToId === "none" ? null : Number(form.assignedToId),
      dueDate: form.dueDate || null,
      relatedEntityType: editing?.relatedEntityType ?? null,
      relatedEntityId: editing?.relatedEntityId ?? null,
    };
    try {
      if (isNew) {
        const created = await api<CrmTask>("/api/crm/tasks", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Задача создана" });
        onSaved(created, "create");
      } else if (editing) {
        const updated = await api<CrmTask>(`/api/crm/tasks/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Задача обновлена" });
        onSaved(updated, "update");
      }
    } catch (e: any) {
      toast({ title: "Сохранение не удалось", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Новая задача" : "Редактировать задачу"}</DialogTitle>
          <DialogDescription>Внутренние задачи команды.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="t-title">Название *</Label>
            <Input id="t-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="t-desc">Описание</Label>
            <Textarea id="t-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Статус</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Приоритет</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((k) => (
                  <SelectItem key={k} value={k}>{PRIORITY_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ответственный</Label>
            <Select value={form.assignedToId} onValueChange={(v) => setForm({ ...form, assignedToId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не назначен</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-due">Срок</Label>
            <Input id="t-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
