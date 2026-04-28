import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users2, UserPlus, ShieldCheck, FileSignature, Activity, Ban,
  Search, CheckCircle2, Clock, MoreHorizontal, LogIn, Edit3,
} from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { useAuth, type Role } from "@/lib/auth";
import {
  useListUsers, useUpdateUser, getListUsersQueryKey,
  type User,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useLang } from "@/lib/i18n";

import { SignupsTab } from "./_signups-tab";
import { KycTab } from "./_kyc-tab";
import { ActivityTab } from "./_activity-tab";
import { BlacklistTab } from "./_blacklist-tab";
import { EditUserDialog } from "./_edit-user-dialog";

export default function Users() {
  const { t, lang } = useLang();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { user: currentUser, impersonator, impersonate } = useAuth();
  const [, navigate] = useLocation();
  const [imperBusyId, setImperBusyId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);

  const [signupsCount, setSignupsCount] = useState<number>(0);
  const [kycPendingCount, setKycPendingCount] = useState<number>(0);
  const [blacklistCount, setBlacklistCount] = useState<number>(0);

  const queryClient = useQueryClient();
  const updateUser = useUpdateUser();

  const handleImpersonate = async (target: User) => {
    setImperBusyId(target.id);
    const r = await impersonate(target.id);
    setImperBusyId(null);
    if (r.ok) {
      toast({ title: t.users.impersonated.replace("{name}", target.name), description: target.email });
      navigate("/");
    } else {
      toast({ variant: "destructive", title: t.users.impersonate_error, description: r.error });
    }
  };

  async function setStatus(u: User, status: "active" | "suspended") {
    setStatusBusyId(u.id);
    try {
      await updateUser.mutateAsync({
        id: u.id,
        data: { name: u.name, email: u.email, role: u.role, status } as any,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: status === "suspended" ? t.users.status_suspended_toast : t.users.status_active_toast,
        description: u.email,
        ...(status === "suspended" ? { variant: "destructive" as any } : {}),
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: t.users.status_error, description: e?.message });
    } finally {
      setStatusBusyId(null);
    }
  }

  const params = {
    role: roleFilter === "all" ? undefined : (roleFilter as any),
    status: statusFilter === "all" ? undefined : (statusFilter as any),
    search: search || undefined,
    limit: 50,
  } as any;
  const { data: usersResp, isLoading } = useListUsers(params, {
    query: { queryKey: getListUsersQueryKey(params) },
  });
  const apiUsers: User[] = usersResp?.data ?? [];
  const totalUsers = usersResp?.pagination.total ?? apiUsers.length;

  function kycBadge(s: string | null | undefined) {
    if (s === "approved") return <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Verified</Badge>;
    if (s === "pending") return <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">Pending</Badge>;
    if (s === "rejected") return <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">Rejected</Badge>;
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  // Roles & permissions data — translated
  const ROLES_PERMISSIONS: Array<{ role: Role; perms: string[] }> = [
    {
      role: "admin",
      perms: [
        lang === "ru"
          ? "Полный доступ ко всему"
          : "Full access to everything",
        lang === "ru"
          ? "Управление пользователями (создать / роль / suspend)"
          : "User management (create / role / suspend)",
        lang === "ru"
          ? "Одобрение заявок и KYC"
          : "Approve registrations and KYC",
        lang === "ru"
          ? "Финансовый контроль и выплаты"
          : "Financial control and payouts",
        lang === "ru"
          ? "Системные настройки и интеграции"
          : "System settings and integrations",
      ],
    },
    {
      role: "manager",
      perms: [
        lang === "ru"
          ? "Модерация релизов (approve / reject / takedown)"
          : "Release moderation (approve / reject / takedown)",
        lang === "ru"
          ? "Доставка в DSP и retry"
          : "DSP delivery and retry",
        lang === "ru"
          ? "Одобрение KYC и заявок на регистрацию"
          : "Approve KYC and registration requests",
        lang === "ru"
          ? "Просмотр финансов (read-only)"
          : "View financials (read-only)",
        lang === "ru"
          ? "Управление CRM (контакты, задачи)"
          : "Manage CRM (contacts, tasks)",
      ],
    },
    {
      role: "label",
      perms: [
        lang === "ru"
          ? "Свой каталог релизов и треков"
          : "Own release and track catalog",
        lang === "ru"
          ? "Сплиты внутри лейбла"
          : "Splits within the label",
        lang === "ru"
          ? "Доход лейбла и подартисты"
          : "Label income and sub-artists",
        lang === "ru"
          ? "Свои контакты и задачи"
          : "Own contacts and tasks",
      ],
    },
    {
      role: "artist",
      perms: [
        lang === "ru" ? "Подача релизов" : "Submit releases",
        lang === "ru" ? "Своя аналитика и статистика" : "Personal analytics and stats",
        lang === "ru" ? "Запрос выплаты" : "Request payout",
        lang === "ru" ? "Свой профиль и KYC" : "Own profile and KYC",
      ],
    },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">{t.users.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t.users.subtitle}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <KpiCard label={t.users.kpi_total}    value={String(totalUsers)}      icon={Users2}        iconColor="text-primary"      iconBg="bg-primary/12"      iconBorder="border-primary/20" />
          <KpiCard label={t.users.kpi_signups}  value={String(signupsCount)}    icon={UserPlus}      iconColor="text-amber-400"    iconBg="bg-amber-500/12"    iconBorder="border-amber-500/20" />
          <KpiCard label={t.users.kpi_kyc}      value={String(kycPendingCount)} icon={FileSignature} iconColor="text-violet-400"   iconBg="bg-violet-500/12"   iconBorder="border-violet-500/20" />
          <KpiCard label={t.users.kpi_suspended} value={String(blacklistCount)} icon={Ban}           iconColor="text-rose-400"     iconBg="bg-rose-500/12"     iconBorder="border-rose-500/20" />
        </div>

        <Tabs defaultValue="users">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> {t.users.tab_users}
            </TabsTrigger>
            <TabsTrigger value="signups" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> {t.users.tab_signups}
              {signupsCount > 0 && <Badge variant="outline" className="ml-1 h-4 text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400">{signupsCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> {t.users.tab_roles}
            </TabsTrigger>
            <TabsTrigger value="kyc" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileSignature className="h-3.5 w-3.5" /> {t.users.tab_kyc}
              {kycPendingCount > 0 && <Badge variant="outline" className="ml-1 h-4 text-[10px] bg-violet-500/10 border-violet-500/30 text-violet-400">{kycPendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Activity className="h-3.5 w-3.5" /> {t.users.tab_activity}
            </TabsTrigger>
            <TabsTrigger value="blacklist" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Ban className="h-3.5 w-3.5" /> {t.users.tab_blacklist}
              {blacklistCount > 0 && <Badge variant="outline" className="ml-1 h-4 text-[10px] bg-rose-500/10 border-rose-500/30 text-rose-400">{blacklistCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── ALL USERS ── */}
          <TabsContent value="users" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t.users.users_card_title}</CardTitle>
                    <CardDescription>{t.users.users_card_desc}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Filter by role"
                      className="h-9 px-3 text-xs rounded-md bg-background/50 border border-border"
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                    >
                      <option value="all">{t.users.filter_all_roles}</option>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="label">Label</option>
                      <option value="artist">Artist</option>
                    </select>
                    <select
                      aria-label="Filter by status"
                      className="h-9 px-3 text-xs rounded-md bg-background/50 border border-border"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">{t.users.filter_all_statuses}</option>
                      <option value="active">{t.users.status_active}</option>
                      <option value="inactive">{t.users.status_inactive}</option>
                      <option value="suspended">{t.users.status_suspended}</option>
                    </select>
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder={t.users.search_placeholder}
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
                      <TableHead>{t.users.col_name}</TableHead>
                      <TableHead>{t.users.col_role}</TableHead>
                      <TableHead>{t.users.col_status}</TableHead>
                      <TableHead>{t.users.col_kyc}</TableHead>
                      <TableHead>{t.users.col_joined}</TableHead>
                      <TableHead>{t.users.col_last_login}</TableHead>
                      <TableHead className="text-right w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell colSpan={7}><Skeleton className="h-9 w-full" /></TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && apiUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          {t.users.empty}
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading && apiUsers.map((u) => {
                      const kycStatus = (u as any).kycStatus as string | undefined;
                      const role = u.role as Role;
                      return (
                        <TableRow key={u.id} className="hover:bg-accent/20" data-testid={`row-user-${u.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-primary">{u.name.slice(0, 2).toUpperCase()}</span>
                              </div>
                              <div>
                                <div className="text-sm font-medium">{u.name}</div>
                                <div className="text-xs text-muted-foreground">{u.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${ROLE_COLORS[role] ?? ""}`}>
                              {ROLE_LABELS[role] ?? u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {u.status === "active" && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {t.users.status_active}</span>}
                            {u.status === "suspended" && <span className="text-xs text-rose-400 flex items-center gap-1"><Ban className="h-3 w-3" /> {t.users.status_suspended}</span>}
                            {(u.status as string) === "inactive" && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {t.users.status_inactive}</span>}
                          </TableCell>
                          <TableCell>{kycBadge(kycStatus)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${u.name}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setEditTarget(u)} data-testid={`menu-edit-${u.id}`}>
                                  <Edit3 className="h-3.5 w-3.5 mr-2" /> {t.users.menu_edit}
                                </DropdownMenuItem>
                                {currentUser?.role === "admin" && !impersonator && u.role !== "admin" && u.id !== currentUser.id && u.status === "active" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleImpersonate(u)}
                                      disabled={imperBusyId === u.id}
                                    >
                                      <LogIn className="h-3.5 w-3.5 mr-2" /> {t.users.menu_impersonate}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                {u.status !== "suspended" ? (
                                  <DropdownMenuItem
                                    className="text-rose-400 focus:text-rose-300"
                                    disabled={statusBusyId === u.id || u.id === currentUser?.id}
                                    onClick={() => setStatus(u, "suspended")}
                                    data-testid={`menu-suspend-${u.id}`}
                                  >
                                    <Ban className="h-3.5 w-3.5 mr-2" /> {t.users.menu_suspend}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-emerald-400 focus:text-emerald-300"
                                    disabled={statusBusyId === u.id}
                                    onClick={() => setStatus(u, "active")}
                                    data-testid={`menu-reactivate-${u.id}`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> {t.users.menu_reactivate}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SIGN UP REQUESTS ── */}
          <TabsContent value="signups" className="mt-4">
            <SignupsTab onCountChange={setSignupsCount} />
          </TabsContent>

          {/* ── ROLES & PERMISSIONS ── */}
          <TabsContent value="roles" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {ROLES_PERMISSIONS.map((r) => {
                const count = apiUsers.filter(u => u.role === r.role).length;
                return (
                  <Card key={r.role} className="card-surface no-lift border-border/60">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[11px] uppercase tracking-wider ${ROLE_COLORS[r.role]}`}>
                            {ROLE_LABELS[r.role]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t.users.roles_count.replace("{n}", String(count))}
                          </span>
                        </div>
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
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t.users.roles_note}
            </p>
          </TabsContent>

          {/* ── KYC ── */}
          <TabsContent value="kyc" className="mt-4">
            <KycTab onCountChange={setKycPendingCount} />
          </TabsContent>

          {/* ── ACTIVITY ── */}
          <TabsContent value="activity" className="mt-4">
            <ActivityTab />
          </TabsContent>

          {/* ── BLACKLIST ── */}
          <TabsContent value="blacklist" className="mt-4">
            <BlacklistTab onCountChange={setBlacklistCount} />
          </TabsContent>
        </Tabs>
      </div>

      <EditUserDialog user={editTarget} onClose={() => setEditTarget(null)} />
    </Layout>
  );
}
