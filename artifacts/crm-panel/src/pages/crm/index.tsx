import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users2, Search, Plus, Phone, Mail, MessageSquare, FileText, CheckSquare, Filter } from "lucide-react";

const CONTACTS = [
  { name: "Давлатмандов Шариф", role: "Artist", genre: "Pop / Folk", label: "Tajik Music", email: "sharif@example.com", phone: "+992 900 111 222", tags: ["Active", "Contract signed"], initials: "ДШ" },
  { name: "Зарина Саидова", role: "Artist", genre: "Pop", label: "Tajik Music", email: "zarina@example.com", phone: "+992 900 333 444", tags: ["Active"], initials: "ЗС" },
  { name: "Рустам Назаров", role: "Artist", genre: "R&B", label: "Independent", email: "rustam@example.com", phone: "+992 900 555 666", tags: ["Onboarding"], initials: "РН" },
  { name: "Музаффар Холов", role: "Manager", genre: "—", label: "Star Music Label", email: "muz@example.com", phone: "+992 901 777 888", tags: ["Partner"], initials: "МХ" },
  { name: "Ансамбл Бахор", role: "Label", genre: "Folk / Classical", label: "Self", email: "bahor@example.com", phone: "+992 902 000 111", tags: ["Active", "Contract signed"], initials: "АБ" },
];

const TASKS = [
  { title: "Sign distribution contract with Рустам Назаров", due: "2026-04-20", priority: "high", status: "open", assignee: "Admin" },
  { title: "Review publishing splits for Ансамбл Бахор", due: "2026-04-18", priority: "medium", status: "open", assignee: "Admin" },
  { title: "Send Q1 statement to all artists", due: "2026-04-15", priority: "high", status: "done", assignee: "Finance" },
  { title: "Verify KYC documents — Зарина Саидова", due: "2026-04-22", priority: "low", status: "open", assignee: "Support" },
  { title: "Upload cover art for Summer EP", due: "2026-04-14", priority: "medium", status: "done", assignee: "Admin" },
];

const NOTES = [
  { contact: "Давлатмандов Ш.", content: "Requested an advance on May payout. To be reviewed after Q1 statement.", date: "2026-04-09", author: "Admin" },
  { contact: "Зарина Саидова", content: "Discussed a potential joint EP with Рустам Назаров for autumn release.", date: "2026-04-07", author: "Admin" },
  { contact: "Музаффар Холов", content: "Sent partnership proposal via email. Awaiting response.", date: "2026-04-05", author: "Admin" },
];

function priorityColor(p: string) {
  if (p === "high") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (p === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-muted-foreground bg-muted/40";
}

export default function CRM() {
  const [search, setSearch] = useState("");

  const filteredContacts = CONTACTS.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.role.toLowerCase().includes(search.toLowerCase()) ||
      c.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CRM</h1>
            <p className="text-muted-foreground mt-1">Contacts, tasks, notes, and communication history.</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total Contacts", value: String(CONTACTS.length), icon: Users2, color: "text-primary", bg: "bg-primary/10" },
            { label: "Artists", value: String(CONTACTS.filter(c => c.role === "Artist").length), icon: Users2, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: "Open Tasks", value: String(TASKS.filter(t => t.status === "open").length), icon: CheckSquare, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "Notes This Month", value: String(NOTES.length), icon: FileText, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="pt-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="contacts">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="contacts" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="tasks" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    className="pl-8 bg-background/50 border-border h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9 bg-background/50">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {filteredContacts.map((c, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-accent/20 transition-colors cursor-pointer">
                      <Avatar className="h-10 w-10 border border-border shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{c.initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{c.name}</p>
                          <Badge variant="outline" className="text-xs">{c.role}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{c.label} · {c.genre}</p>
                      </div>
                      <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className={`text-[10px] ${tag === "Active" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : tag === "Contract signed" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" : "text-muted-foreground"}`}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7"><Mail className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Tasks</CardTitle>
                  <CardDescription>Internal team tasks and follow-ups</CardDescription>
                </div>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Task
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {TASKS.map((t, i) => (
                    <div key={i} className={`flex items-center gap-4 px-6 py-4 hover:bg-accent/20 transition-colors ${t.status === "done" ? "opacity-60" : ""}`}>
                      <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${t.status === "done" ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"}`}>
                        {t.status === "done" && <span className="text-white text-[8px]">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                        <p className="text-xs text-muted-foreground">Due: {t.due} · {t.assignee}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs capitalize shrink-0 ${priorityColor(t.priority)}`}>{t.priority}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="mt-4 space-y-3">
            {NOTES.map((n, i) => (
              <Card key={i} className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{n.contact}</Badge>
                        <span className="text-xs text-muted-foreground">{n.date} · by {n.author}</span>
                      </div>
                      <p className="text-sm text-foreground">{n.content}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" className="w-full bg-card">
              <Plus className="mr-2 h-4 w-4" />
              Add Note
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
