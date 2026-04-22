import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users2, UserPlus, ShieldCheck, FileSignature, Activity, Ban,
  Search, CheckCircle2, XCircle, Clock, Eye, Mail, MapPin, Plus, Download,
} from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import type { Role } from "@/lib/auth";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "suspended" | "pending";
  kyc: "verified" | "pending" | "rejected" | "none";
  contractType: "exclusive" | "non_exclusive" | "publishing" | "none";
  joined: string;
  releases: number;
  revenue: string;
};

const USERS: UserRow[] = [
  { id: "U-001", name: "Давлатмандов Шерзод", email: "sherzod@tajikmusic.tj", role: "artist", status: "active", kyc: "verified", contractType: "exclusive", joined: "2023-04-12", releases: 14, revenue: "$3,420" },
  { id: "U-002", name: "Зарина Саидова", email: "zarina.s@gmail.com", role: "artist", status: "active", kyc: "verified", contractType: "non_exclusive", joined: "2023-08-22", releases: 7, revenue: "$1,890" },
  { id: "U-003", name: "Камол Хасанов", email: "kamol@yandex.ru", role: "artist", status: "active", kyc: "pending", contractType: "exclusive", joined: "2024-01-15", releases: 4, revenue: "$540" },
  { id: "U-004", name: "Студия «Парвоз»", email: "studio@parvoz.tj", role: "label", status: "active", kyc: "verified", contractType: "publishing", joined: "2022-11-03", releases: 56, revenue: "$12,700" },
  { id: "U-005", name: "Рустам Назаров", email: "rustam@mail.ru", role: "artist", status: "suspended", kyc: "rejected", contractType: "none", joined: "2024-06-30", releases: 1, revenue: "$0" },
  { id: "U-006", name: "Manager Алишер", email: "alisher@tajikmusic.tj", role: "manager", status: "active", kyc: "verified", contractType: "none", joined: "2023-02-01", releases: 0, revenue: "—" },
  { id: "U-007", name: "Lead Финдер", email: "lead@tajikmusic.tj", role: "admin", status: "active", kyc: "verified", contractType: "none", joined: "2022-09-15", releases: 0, revenue: "—" },
];

const SIGNUP_REQUESTS = [
  { id: "SR-101", name: "Madina Karimova", email: "madina.k@gmail.com", phone: "+992 901 23 45 67", country: "Tajikistan", referrer: "TikTok ad", submitted: "2026-04-11 09:14", followers: "12.4K IG", note: "Singer, 3 self-released tracks" },
  { id: "SR-102", name: "Beatmaker DJ Nodir", email: "nodir.beats@mail.ru", phone: "+992 555 12 34 56", country: "Tajikistan", referrer: "Instagram", submitted: "2026-04-10 16:22", followers: "4.8K SC", note: "Producer, hip-hop / trap" },
  { id: "SR-103", name: "Khujand Folk Ensemble", email: "khujand.folk@gmail.com", phone: "+992 92 800 11 22", country: "Tajikistan", referrer: "Word of mouth", submitted: "2026-04-09 11:08", followers: "1.1K YT", note: "Traditional ensemble, 8 members" },
];

const KYC_QUEUE = [
  { id: "KYC-201", artist: "Камол Хасанов", docs: ["Passport scan", "Selfie with passport"], submitted: "2026-04-08", country: "Tajikistan", status: "pending" },
  { id: "KYC-202", artist: "Madina Karimova", docs: ["ID card", "Bank statement"], submitted: "2026-04-11", country: "Tajikistan", status: "pending" },
  { id: "KYC-203", artist: "Anonymous Producer 9XX", docs: ["Passport scan"], submitted: "2026-04-05", country: "—", status: "rejected" },
];

const ACTIVITY_LOG = [
  { time: "2026-04-11 14:32", actor: "Lead Финдер", action: "Approved release", target: "Дилам мехохад → Spotify, Apple Music", ip: "188.92.x.x", role: "admin" },
  { time: "2026-04-11 13:18", actor: "Manager Алишер", action: "Updated split %", target: "ISRC TJ-MUS-26-00128 (60/40 → 70/30)", ip: "188.92.x.x", role: "manager" },
  { time: "2026-04-11 11:02", actor: "Давлатмандов Ш.", action: "Submitted release", target: "Шаби нав (single, ISRC TJ-MUS-26-00134)", ip: "5.182.x.x", role: "artist" },
  { time: "2026-04-11 09:14", actor: "system", action: "New signup", target: "madina.k@gmail.com", ip: "—", role: "system" },
  { time: "2026-04-10 22:45", actor: "Lead Финдер", action: "Suspended user", target: "Рустам Назаров (fake metadata)", ip: "188.92.x.x", role: "admin" },
  { time: "2026-04-10 18:30", actor: "Manager Алишер", action: "Issued payout", target: "$340 to Зарина Саидова (Payeer)", ip: "188.92.x.x", role: "manager" },
];

const BLACKLIST = [
  { value: "fake.label@mail.ru", type: "Email", reason: "Fake metadata, repeated takedowns", added: "2026-02-14", by: "Lead Финдер" },
  { value: "188.92.110.42", type: "IP", reason: "Brute-force login attempts", added: "2026-03-22", by: "system" },
  { value: "Unofficial Cover Records", type: "Label name", reason: "Unauthorized covers (5+ DMCA)", added: "2026-01-08", by: "Lead Финдер" },
];

const ROLES_PERMISSIONS = [
  { role: "admin" as Role, count: 2, perms: ["Full access", "User management", "Financial control", "System settings"] },
  { role: "label" as Role, count: 8, perms: ["Manage own catalog", "Sub-label artists", "View label revenue"] },
  { role: "manager" as Role, count: 5, perms: ["QC moderation", "DSP delivery", "View finance (read-only)"] },
  { role: "artist" as Role, count: 342, perms: ["Submit releases", "View own analytics", "Request payout"] },
];

export default function Users() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filteredUsers = USERS.filter(u =>
    (roleFilter === "all" || u.role === roleFilter) &&
    (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">Users & Access</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Артисты, лейблы, менеджеры, KYC, журнал действий и blacklist.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button size="sm">
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Add User
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <KpiCard label="Total Users" value="357" icon={Users2} iconColor="text-primary" iconBg="bg-primary/12" iconBorder="border-primary/20" trend={{ value: "+18", up: true, label: "this month" }} />
          <KpiCard label="Pending Signups" value={String(SIGNUP_REQUESTS.length)} icon={UserPlus} iconColor="text-amber-400" iconBg="bg-amber-500/12" iconBorder="border-amber-500/20" trend={{ value: "review now", label: "queue" }} />
          <KpiCard label="KYC Pending" value="2" icon={FileSignature} iconColor="text-violet-400" iconBg="bg-violet-500/12" iconBorder="border-violet-500/20" trend={{ value: "1 rejected", up: false, label: "this week" }} />
          <KpiCard label="Suspended / Blacklist" value={String(USERS.filter(u => u.status === "suspended").length + BLACKLIST.length)} icon={Ban} iconColor="text-rose-400" iconBg="bg-rose-500/12" iconBorder="border-rose-500/20" trend={{ value: "stable", label: "—" }} />
        </div>

        <Tabs defaultValue="users">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> All Users
            </TabsTrigger>
            <TabsTrigger value="signups" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Sign Up Requests <Badge variant="outline" className="ml-1 h-4 text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400">{SIGNUP_REQUESTS.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Roles & Permissions
            </TabsTrigger>
            <TabsTrigger value="kyc" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileSignature className="h-3.5 w-3.5" /> KYC & Contracts
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Activity Log
            </TabsTrigger>
            <TabsTrigger value="blacklist" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Ban className="h-3.5 w-3.5" /> Blacklist
            </TabsTrigger>
          </TabsList>

          {/* ================= ALL USERS ================= */}
          <TabsContent value="users" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>Filter by role, status, KYC and contract type</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 px-3 text-xs rounded-md bg-background/50 border border-border"
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                    >
                      <option value="all">All roles</option>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="label">Label</option>
                      <option value="artist">Artist</option>
                    </select>
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        className="pl-8 h-9 bg-background/50"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name / Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>KYC</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Releases</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id} className="hover:bg-accent/20">
                        <TableCell>
                          <div className="text-sm font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${ROLE_COLORS[u.role]}`}>
                            {ROLE_LABELS[u.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.status === "active" && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Active</span>}
                          {u.status === "suspended" && <span className="text-xs text-rose-400 flex items-center gap-1"><Ban className="h-3 w-3" /> Suspended</span>}
                          {u.status === "pending" && <span className="text-xs text-amber-400 flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</span>}
                        </TableCell>
                        <TableCell>
                          {u.kyc === "verified" && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Verified</Badge>}
                          {u.kyc === "pending" && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">Pending</Badge>}
                          {u.kyc === "rejected" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">Rejected</Badge>}
                          {u.kyc === "none" && <span className="text-[10px] text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs capitalize text-muted-foreground">{u.contractType.replace("_", "-")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{u.joined}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{u.releases}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-emerald-400 tabular-nums">{u.revenue}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= SIGN UP REQUESTS ================= */}
          <TabsContent value="signups" className="mt-4 space-y-3">
            {SIGNUP_REQUESTS.map((s) => (
              <Card key={s.id} className="card-surface no-lift border-border/60">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">{s.name.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold">{s.name}</p>
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400">Pending</Badge>
                          <span className="text-[10px] font-mono text-muted-foreground">{s.id}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {s.email}</span>
                          <span>📞 {s.phone}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.country}</span>
                          <span>🌐 {s.followers}</span>
                        </div>
                        <p className="text-xs text-muted-foreground italic">«{s.note}»</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Referrer: {s.referrer} · Submitted {s.submitted}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30">
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-rose-400 hover:bg-rose-500/10 border-rose-500/30">
                        <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ================= ROLES & PERMISSIONS ================= */}
          <TabsContent value="roles" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {ROLES_PERMISSIONS.map((r) => (
                <Card key={r.role} className="card-surface no-lift border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[11px] uppercase tracking-wider ${ROLE_COLORS[r.role]}`}>
                          {ROLE_LABELS[r.role]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{r.count} users</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">Edit Permissions</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1.5">
                      {r.perms.map((p, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> {p}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ================= KYC ================= */}
          <TabsContent value="kyc" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>KYC Verification Queue</CardTitle>
                <CardDescription>Документы артистов для проверки личности и заключения договора</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {KYC_QUEUE.map((k) => (
                      <TableRow key={k.id} className="hover:bg-accent/20">
                        <TableCell className="font-mono text-xs text-muted-foreground">{k.id}</TableCell>
                        <TableCell className="text-sm font-medium">{k.artist}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {k.docs.map((d, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{k.country}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{k.submitted}</TableCell>
                        <TableCell>
                          {k.status === "pending" && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">Pending</Badge>}
                          {k.status === "rejected" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">Rejected</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button>
                            {k.status === "pending" && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-400 hover:bg-emerald-500/10"><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400 hover:bg-rose-500/10"><XCircle className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ACTIVITY LOG ================= */}
          <TabsContent value="activity" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Account Activity Log</CardTitle>
                  <CardDescription>Полная история действий: моерация, выплаты, входы, изменения сплитов</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export Audit
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {ACTIVITY_LOG.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 px-6 py-3 hover:bg-accent/20">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Activity className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{a.actor}</span>
                          <Badge variant="outline" className="text-[10px]">{a.role}</Badge>
                          <span className="text-xs text-muted-foreground">{a.action}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.target}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-muted-foreground">{a.time}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono">{a.ip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= BLACKLIST ================= */}
          <TabsContent value="blacklist" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Blacklist</CardTitle>
                  <CardDescription>Заблокированные email, IP и названия лейблов</CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Entry
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Value</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {BLACKLIST.map((b, i) => (
                      <TableRow key={i} className="hover:bg-accent/20">
                        <TableCell className="font-mono text-xs">{b.value}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{b.type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.reason}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.added}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.by}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-400 hover:bg-rose-500/10">Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
