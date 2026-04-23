import { Layout } from "@/components/layout";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import SupportInbox from "./inbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, BookOpen, Mail, Search, Plus, MessageCircle,
  Phone, Send, ChevronRight, HelpCircle,
} from "lucide-react";

const TICKETS = [
  { id: "TCK-2026-0048", subject: "Не приходит роялти за март", category: "Финансы", status: "open",       priority: "high",   updated: "2 часа назад", messages: 4 },
  { id: "TCK-2026-0046", subject: "Релиз отклонён Spotify",     category: "Дистрибуция", status: "in_progress", priority: "medium", updated: "5 часов назад", messages: 7 },
  { id: "TCK-2026-0042", subject: "Изменить ISRC на треке",     category: "Каталог",  status: "resolved",   priority: "low",    updated: "Вчера",        messages: 3 },
  { id: "TCK-2026-0038", subject: "Пресейв-ссылка не работает", category: "Маркетинг", status: "resolved",   priority: "medium", updated: "3 дня назад",  messages: 5 },
];

const FAQ_CATEGORIES = [
  {
    title: "Релизы и каталог",
    items: [
      { q: "Сколько идёт модерация релиза?", a: "Стандартно 24–48 часов. Если ускоренный режим — до 4 часов, доступно для лейблов уровня PRO." },
      { q: "Как изменить дату релиза после отправки?", a: "Открой релиз → Edit → Release Date. Возможно за 7 дней до отправки в DSP." },
      { q: "Что делать, если Spotify отклонил релиз?", a: "Проверь причину отклонения в Дистрибуция → Очередь. Чаще всего: cover art не соответствует требованиям или метаданные." },
    ],
  },
  {
    title: "Финансы и выплаты",
    items: [
      { q: "Когда поступают роялти?", a: "DSP отчитываются ежемесячно с задержкой 60–90 дней. Например, январь — в марте/апреле." },
      { q: "Какой минимум для выплаты?", a: "$50 для всех аккаунтов. Можно изменить в Профиль → Платёжная информация." },
      { q: "Как добавить банковский счёт?", a: "Профиль → Оплата и налоги → Банковский счёт. Поддерживаем SWIFT, TJ-банки, Payeer, Webmoney." },
    ],
  },
  {
    title: "Контракты и права",
    items: [
      { q: "Как настроить сплиты с соавторами?", a: "Релиз → Treble → Сплиты. Указать процент каждому, после подтверждения деньги делятся автоматически." },
      { q: "Что такое Content ID?", a: "Система YouTube для отслеживания использования твоей музыки. Включается в Видеодистрибуции." },
    ],
  },
];

export default function SupportPage() {
  const { user } = useAuth();
  // Admin/manager get the helpdesk inbox; label/artist get the customer view.
  if (user && (user.role === "admin" || user.role === "manager")) {
    return <SupportInbox />;
  }
  return <SupportCustomer />;
}

function SupportCustomer() {
  const { toast } = useToast();
  const [tab, setTab] = useState("tickets");
  const [search, setSearch] = useState("");

  // New contact form
  const [subject, setSubject]   = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage]   = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Заполни все поля", variant: "destructive" });
      return;
    }
    toast({ title: "Запрос отправлен", description: "Ответим в течение 24 часов на email." });
    setSubject(""); setMessage("");
  }

  const filteredFaq = search
    ? FAQ_CATEGORIES.map(c => ({
        ...c,
        items: c.items.filter(i =>
          i.q.toLowerCase().includes(search.toLowerCase()) ||
          i.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(c => c.items.length > 0)
    : FAQ_CATEGORIES;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">Поддержка</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Тикеты, база знаний и связь с командой Tajik Music.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex-wrap">
            <TabsTrigger value="tickets" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Тикеты
            </TabsTrigger>
            <TabsTrigger value="help" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> База знаний
            </TabsTrigger>
            <TabsTrigger value="contact" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Связаться с поддержкой
            </TabsTrigger>
          </TabsList>

          {/* TICKETS */}
          <TabsContent value="tickets" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Мои тикеты</CardTitle>
                  <CardDescription>История запросов в поддержку</CardDescription>
                </div>
                <Button size="sm" onClick={() => setTab("contact")}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Новый тикет
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {TICKETS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toast({ title: t.id, description: t.subject })}
                      aria-label={`Открыть тикет ${t.id}: ${t.subject}`}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-accent/20 transition-colors cursor-pointer text-left focus:outline-none focus:bg-accent/30"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-[10px] font-bold">
                          {t.id.slice(-2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{t.id}</span>
                          <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                        </div>
                        <p className="text-sm font-medium mt-0.5 truncate">{t.subject}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                          <MessageCircle className="h-3 w-3" /> {t.messages} сообщений · обновлено {t.updated}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <StatusBadge status={t.status} />
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HELP CENTER */}
          <TabsContent value="help" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardContent className="pt-6">
                <div className="relative max-w-2xl mx-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Найти ответ в базе знаний..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 h-11 bg-background/50 text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            {filteredFaq.length === 0 ? (
              <Card className="card-surface no-lift border-border/60">
                <CardContent className="py-12 text-center">
                  <HelpCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">По запросу «{search}» ничего не найдено</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setTab("contact")}>
                    Связаться с поддержкой
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredFaq.map((cat) => (
                <Card key={cat.title} className="card-surface no-lift border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">{cat.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {cat.items.map((item, i) => (
                        <AccordionItem key={i} value={`${cat.title}-${i}`} className="border-border/40">
                          <AccordionTrigger className="text-sm hover:no-underline hover:text-primary text-left">
                            {item.q}
                          </AccordionTrigger>
                          <AccordionContent className="text-xs text-muted-foreground leading-relaxed">
                            {item.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* CONTACT */}
          <TabsContent value="contact" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="card-surface no-lift border-border/60 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Связаться с поддержкой</CardTitle>
                  <CardDescription>Опиши проблему — ответим в течение 24 часов</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Категория</Label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">Общий вопрос</SelectItem>
                            <SelectItem value="finance">Финансы и выплаты</SelectItem>
                            <SelectItem value="distribution">Дистрибуция</SelectItem>
                            <SelectItem value="catalog">Каталог</SelectItem>
                            <SelectItem value="bug">Сообщить об ошибке</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Тема</Label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Кратко опиши проблему" className="bg-background/50" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Сообщение</Label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Опиши подробно: что произошло, ID релиза, скриншоты..."
                        className="w-full min-h-[160px] px-3 py-2 text-sm rounded-md bg-background/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit">
                        <Send className="mr-1.5 h-3.5 w-3.5" /> Отправить запрос
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="card-surface no-lift border-border/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Прямые контакты</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <a href="mailto:support@tajikmusic.tj" className="text-sm font-medium hover:text-primary">support@tajikmusic.tj</a>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Телефон</p>
                        <a href="tel:+992905555555" className="text-sm font-medium hover:text-primary">+992 905 555 555</a>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Send className="h-4 w-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Telegram</p>
                        <a href="https://t.me/tajikmusic_support" className="text-sm font-medium hover:text-primary">@tajikmusic_support</a>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-surface no-lift border-border/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Время работы</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Пн–Пт</span>
                      <span className="font-medium">09:00–18:00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Сб</span>
                      <span className="font-medium">10:00–14:00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Вс</span>
                      <span className="font-medium text-rose-400">Выходной</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40 mt-2">Часовой пояс: GMT+5 (Душанбе)</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    open:        { label: "Открыт",      cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    in_progress: { label: "В работе",    cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    resolved:    { label: "Решён",       cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  };
  const c = cfg[status] ?? cfg.open;
  return <Badge variant="outline" className={`text-[10px] ${c.cls}`}>{c.label}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    high:   { label: "Высокий",  cls: "text-rose-400" },
    medium: { label: "Средний",  cls: "text-amber-400" },
    low:    { label: "Низкий",   cls: "text-muted-foreground" },
  };
  const c = cfg[priority] ?? cfg.medium;
  return <span className={`text-[10px] font-medium ${c.cls}`}>{c.label}</span>;
}
