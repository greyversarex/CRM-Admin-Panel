import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Settings2, KeyRound, Network, FileCode2, ScrollText, Database, Globe2,
  Eye, EyeOff, Copy, Plus, RefreshCcw, Download, CheckCircle2, AlertTriangle, Clock,
} from "lucide-react";

const API_KEYS = [
  { id: "key_1", name: "Production — DSP webhooks", key: "sk_live_a1b2…f9c4", scopes: ["releases:read", "releases:write", "deliveries:read"], created: "2025-09-12", lastUsed: "2026-04-11 14:32", env: "production" },
  { id: "key_2", name: "Staging — partner integration", key: "sk_test_77ee…b2a8", scopes: ["releases:read", "analytics:read"], created: "2026-01-04", lastUsed: "2026-04-09 11:18", env: "staging" },
  { id: "key_3", name: "Internal — Statement Generator", key: "sk_live_2240…dd91", scopes: ["transactions:read", "balances:read", "statements:write"], created: "2025-11-22", lastUsed: "2026-04-01 00:02", env: "production" },
];

const DSP_CONNECTIONS = [
  { dsp: "Spotify", status: "connected", protocol: "DDEX ERN 4.3 SFTP", lastDelivery: "2026-04-11 03:00", successRate: "99.2%", endpoint: "ddex-ingest.spotify.com" },
  { dsp: "Apple Music", status: "connected", protocol: "DDEX ERN 4.3 SFTP", lastDelivery: "2026-04-11 04:12", successRate: "98.7%", endpoint: "ddex.itunes.apple.com" },
  { dsp: "Yandex Music", status: "connected", protocol: "DDEX ERN 3.8.2 SFTP", lastDelivery: "2026-04-11 02:30", successRate: "97.4%", endpoint: "music-partners.yandex.com" },
  { dsp: "Deezer", status: "connected", protocol: "DDEX ERN 4.2 API", lastDelivery: "2026-04-11 03:15", successRate: "99.8%", endpoint: "api.deezer.com/v1/partner" },
  { dsp: "TikTok", status: "warning", protocol: "DDEX ERN 4.1 API", lastDelivery: "2026-04-10 18:00", successRate: "94.1%", endpoint: "partner-api.tiktok.com" },
  { dsp: "VK Music", status: "connected", protocol: "DDEX ERN 4.2 SFTP", lastDelivery: "2026-04-11 02:45", successRate: "96.8%", endpoint: "ingest.vk.com/music" },
  { dsp: "YouTube Music", status: "connected", protocol: "DDEX ERN 4.3 + Content ID", lastDelivery: "2026-04-11 05:00", successRate: "99.5%", endpoint: "youtube.com/contentid" },
];

const AUDIT_LOGS = [
  { time: "2026-04-11 14:32:08", actor: "lead@tajikmusic.tj", action: "settings.update", target: "DDEX party_id (no change)", severity: "info" },
  { time: "2026-04-11 11:02:14", actor: "system", action: "backup.complete", target: "Database snapshot 2.4 GB → S3", severity: "info" },
  { time: "2026-04-10 22:45:51", actor: "lead@tajikmusic.tj", action: "user.suspend", target: "U-005 (Рустам Назаров)", severity: "warn" },
  { time: "2026-04-10 18:30:22", actor: "alisher@tajikmusic.tj", action: "payout.create", target: "$340 → Зарина Саидова (Payeer)", severity: "info" },
  { time: "2026-04-10 09:15:03", actor: "system", action: "key.rotation", target: "API key key_2 rotated", severity: "warn" },
  { time: "2026-04-09 03:14:40", actor: "system", action: "delivery.fail", target: "TikTok endpoint timeout (retry queued)", severity: "error" },
  { time: "2026-04-08 16:00:00", actor: "lead@tajikmusic.tj", action: "rule.toggle", target: "Fraud Stream Detection → disabled", severity: "warn" },
];

const BACKUPS = [
  { id: "BAK-2026-04-11", date: "2026-04-11 03:00", size: "2.41 GB", target: "S3 / eu-central-1", duration: "4m 12s", status: "success" },
  { id: "BAK-2026-04-10", date: "2026-04-10 03:00", size: "2.39 GB", target: "S3 / eu-central-1", duration: "4m 03s", status: "success" },
  { id: "BAK-2026-04-09", date: "2026-04-09 03:00", size: "2.38 GB", target: "S3 / eu-central-1", duration: "4m 18s", status: "success" },
  { id: "BAK-2026-04-08", date: "2026-04-08 03:00", size: "2.36 GB", target: "S3 / eu-central-1", duration: "4m 02s", status: "success" },
];

export default function Settings() {
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Tajik Music Distribution");
  const [partyId] = useState("PA-DPIDA-2024053004-T");
  const [defaultLang, setDefaultLang] = useState("ru");
  const [twoFA, setTwoFA] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Конфигурация платформы, API, DDEX/DSP, безопасность, бэкапы.</p>
          </div>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex-wrap">
            <TabsTrigger value="general" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> General
            </TabsTrigger>
            <TabsTrigger value="api" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="ddex" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" /> DDEX & DSP
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Network className="h-3.5 w-3.5" /> Security
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <ScrollText className="h-3.5 w-3.5" /> Audit Logs
            </TabsTrigger>
            <TabsTrigger value="backup" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Database className="h-3.5 w-3.5" /> Backup & Restore
            </TabsTrigger>
          </TabsList>

          {/* ================= GENERAL ================= */}
          <TabsContent value="general" className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Organization</CardTitle>
                <CardDescription>Базовая информация о компании-дистрибьюторе</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Organization Name</label>
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Country</label>
                  <Input defaultValue="Tajikistan (TJ)" className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default Language</label>
                  <select value={defaultLang} onChange={(e) => setDefaultLang(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border">
                    <option value="ru">Русский</option>
                    <option value="tg">Тоҷикӣ</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <Button size="sm">Save Changes</Button>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Branding</CardTitle>
                <CardDescription>Логотип, акцентный цвет, темы</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-background/40 border border-border/40">
                  <img src="/tajikmusic-logo.png" className="h-10 w-auto" alt="" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">tajikmusic-logo.png</p>
                    <p className="text-xs text-muted-foreground">Uploaded 2025-09-01</p>
                  </div>
                  <Button variant="outline" size="sm">Replace</Button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Color (Electric Indigo)</label>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-md border border-border" style={{ background: "hsl(226 84% 67%)" }} />
                    <Input defaultValue="#6366F1" className="bg-background/50 font-mono text-xs" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Dark Mode (default)</p>
                    <p className="text-xs text-muted-foreground">Force dark theme for all users</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= API KEYS ================= */}
          <TabsContent value="api" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Ключи для DSP webhooks, партнёрских интеграций и внутренних сервисов</CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Generate Key
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Env</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {API_KEYS.map((k) => (
                      <TableRow key={k.id} className="hover:bg-accent/20">
                        <TableCell className="text-sm font-medium">{k.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-background/60 px-2 py-1 rounded font-mono">
                              {revealKey === k.id ? k.key.replace("…", "abcdef1234") : k.key}
                            </code>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRevealKey(revealKey === k.id ? null : k.id)}>
                              {revealKey === k.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6"><Copy className="h-3 w-3" /></Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {k.scopes.map((s) => (
                              <Badge key={s} variant="outline" className="text-[10px] font-mono">{s}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] uppercase ${k.env === "production" ? "text-rose-400 bg-rose-500/10 border-rose-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30"}`}>
                            {k.env}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{k.lastUsed}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Rotate"><RefreshCcw className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-400 hover:bg-rose-500/10">Revoke</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= DDEX & DSP ================= */}
          <TabsContent value="ddex" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>DDEX Party Identification</CardTitle>
                <CardDescription>Уникальный идентификатор лейбла для всех XML-доставок</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">DDEX Party ID (DPID)</label>
                  <div className="flex gap-2">
                    <Input value={partyId} readOnly className="bg-background/50 font-mono text-sm" />
                    <Button variant="outline" size="icon"><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Issued by DDEX, registered 2024-05-30</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default ERN Version</label>
                  <select className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" defaultValue="4.3">
                    <option value="4.3">ERN 4.3 (recommended)</option>
                    <option value="4.2">ERN 4.2</option>
                    <option value="4.1">ERN 4.1</option>
                    <option value="3.8.2">ERN 3.8.2 (legacy)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ISRC Prefix</label>
                  <Input defaultValue="TJ-MUS-26" className="bg-background/50 font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UPC Prefix</label>
                  <Input defaultValue="888002" className="bg-background/50 font-mono" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>DSP Connections</CardTitle>
                  <CardDescription>Endpoints, протоколы и состояние доставок по платформам</CardDescription>
                </div>
                <Button size="sm" variant="outline"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add DSP</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>DSP</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Last Delivery</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DSP_CONNECTIONS.map((d) => (
                      <TableRow key={d.dsp} className="hover:bg-accent/20">
                        <TableCell className="text-sm font-medium flex items-center gap-2">
                          <Globe2 className="h-3.5 w-3.5 text-primary/70" />
                          {d.dsp}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.protocol}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{d.endpoint}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.lastDelivery}</TableCell>
                        <TableCell className="text-sm tabular-nums">{d.successRate}</TableCell>
                        <TableCell>
                          {d.status === "connected" && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Connected</Badge>}
                          {d.status === "warning" && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20"><AlertTriangle className="h-2.5 w-2.5 mr-1" /> Degraded</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= SECURITY ================= */}
          <TabsContent value="security" className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>Обязательно для admin/manager ролей</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Require 2FA for admins</p>
                    <p className="text-xs text-muted-foreground">All admin accounts must enroll TOTP</p>
                  </div>
                  <Switch checked={twoFA} onCheckedChange={setTwoFA} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Session timeout</p>
                    <p className="text-xs text-muted-foreground">Auto-logout after inactivity</p>
                  </div>
                  <select className="h-8 px-2 text-xs rounded-md bg-background/50 border border-border" defaultValue="60">
                    <option value="30">30 min</option>
                    <option value="60">60 min</option>
                    <option value="240">4 hours</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Password rotation</p>
                    <p className="text-xs text-muted-foreground">Force change every 90 days</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>IP Allow / Deny List</CardTitle>
                <CardDescription>Доступ к Admin Panel из определённых сетей</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Allowed IPs / CIDR</label>
                  <Input defaultValue="188.92.0.0/16, 5.182.42.0/24" className="bg-background/50 font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Block Tor / VPN</label>
                  <div className="flex items-center justify-between p-2 rounded-md bg-background/40 border border-border/40">
                    <span className="text-xs text-muted-foreground">Auto-block Tor exit nodes</span>
                    <Switch defaultChecked />
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full">Save Network Rules</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= AUDIT LOGS ================= */}
          <TabsContent value="audit" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>System Audit Logs</CardTitle>
                  <CardDescription>Каждое действие на уровне системы для соответствия GDPR / SOC 2</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Filter by actor or action..." className="w-64 h-9 bg-background/50" />
                  <Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Severity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {AUDIT_LOGS.map((a, i) => (
                      <TableRow key={i} className="hover:bg-accent/20">
                        <TableCell className="text-xs text-muted-foreground font-mono">{a.time}</TableCell>
                        <TableCell className="text-xs font-medium">{a.actor}</TableCell>
                        <TableCell className="text-xs font-mono text-primary/80">{a.action}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.target}</TableCell>
                        <TableCell>
                          {a.severity === "info" && <Badge variant="outline" className="text-[10px] text-blue-400 bg-blue-500/10 border-blue-500/20">info</Badge>}
                          {a.severity === "warn" && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">warn</Badge>}
                          {a.severity === "error" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">error</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= BACKUP ================= */}
          <TabsContent value="backup" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Automatic Backups</CardTitle>
                <CardDescription>Конфигурация ежедневных снапшотов БД и файлов</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Schedule</label>
                    <select className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" defaultValue="03:00">
                      <option value="01:00">Daily at 01:00 UTC</option>
                      <option value="03:00">Daily at 03:00 UTC</option>
                      <option value="06:00">Daily at 06:00 UTC</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Retention</label>
                    <select className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" defaultValue="30">
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">365 days</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storage Target</label>
                    <Input defaultValue="s3://tajik-music-backups/eu-central-1" className="bg-background/50 font-mono text-xs" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-background/40 border border-border/40">
                  <div>
                    <p className="text-sm font-medium">Auto-backup enabled</p>
                    <p className="text-xs text-muted-foreground">Next run: 2026-04-12 03:00 UTC</p>
                  </div>
                  <Switch checked={autoBackup} onCheckedChange={setAutoBackup} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm">Run Backup Now</Button>
                  <Button size="sm" variant="outline">Save Schedule</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Backup History</CardTitle>
                <CardDescription>Последние снапшоты и точки восстановления</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {BACKUPS.map((b) => (
                      <TableRow key={b.id} className="hover:bg-accent/20">
                        <TableCell className="font-mono text-xs">{b.id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.date}</TableCell>
                        <TableCell className="text-sm tabular-nums">{b.size}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{b.target}</TableCell>
                        <TableCell className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />{b.duration}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-xs">Restore</Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
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
