import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Bell, MessageSquare, Plus, Send, Users, Eye, MousePointer, Clock } from "lucide-react";

const EMAIL_CAMPAIGNS = [
  { name: "Наврӯз Release Announcement", recipients: 342, sent: "2026-03-20", opens: 218, clicks: 94, status: "sent" },
  { name: "Monthly Artist Statement — March", recipients: 89, sent: "2026-04-01", opens: 67, clicks: 34, status: "sent" },
  { name: "New Feature: Smart Links", recipients: 342, sent: null, opens: 0, clicks: 0, status: "draft" },
  { name: "Payment Processing Update", recipients: 342, sent: "2026-04-10", opens: 281, clicks: 112, status: "sent" },
];

const PUSH_LOGS = [
  { title: "Release Approved ✅", body: "Your release «Дилам мехохад» has been approved and delivered to all DSPs.", target: "Давлатмандов Ш.", time: "2026-04-10 14:32", channel: "In-app" },
  { title: "Payment Sent 💸", body: "Your payout of $340.00 has been processed.", target: "Зарина Саидова", time: "2026-04-09 10:00", channel: "Email" },
  { title: "New Contract Ready 📄", body: "Please review and sign your updated distribution contract.", target: "All Artists", time: "2026-04-07 09:00", channel: "Telegram" },
  { title: "Release Rejected ❌", body: "«Unofficial Cover» was rejected. Please review the QC feedback.", target: "Камол Хасанов", time: "2026-04-06 16:15", channel: "Email + In-app" },
];

const TEMPLATES = [
  { name: "Release Approved", type: "Email", last_used: "2026-04-10", uses: 48 },
  { name: "Release Rejected", type: "Email", last_used: "2026-04-06", uses: 12 },
  { name: "Payment Sent", type: "Email + Push", last_used: "2026-04-09", uses: 89 },
  { name: "Monthly Statement", type: "Email", last_used: "2026-04-01", uses: 24 },
  { name: "New Contract", type: "Telegram + Email", last_used: "2026-04-07", uses: 6 },
];

export default function Communications() {
  const [composing, setComposing] = useState(false);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Communications</h1>
            <p className="text-muted-foreground mt-1">Email campaigns, push notifications, and messaging channels.</p>
          </div>
          <Button onClick={() => setComposing(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Emails Sent (Month)", value: "1,204", icon: Mail, color: "text-primary", bg: "bg-primary/10" },
            { label: "Avg Open Rate", value: "73%", icon: Eye, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Avg Click Rate", value: "34%", icon: MousePointer, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: "Pending Sends", value: "1", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
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

        <Tabs defaultValue="email">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="email" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email Campaigns
            </TabsTrigger>
            <TabsTrigger value="push" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Push & Notifications
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="mt-4 space-y-4">
            {composing && (
              <Card className="bg-card/50 backdrop-blur border-primary/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">New Email Campaign</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Campaign Name</label>
                      <Input placeholder="e.g. May Newsletter" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recipients</label>
                      <Input placeholder="All Artists, or select group..." className="bg-background/50" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject Line</label>
                    <Input placeholder="Email subject..." className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message</label>
                    <Textarea placeholder="Write your message..." className="bg-background/50 min-h-[120px]" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setComposing(false)}>Cancel</Button>
                    <Button variant="outline">Save Draft</Button>
                    <Button>
                      <Send className="mr-2 h-4 w-4" />
                      Send Campaign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Email Campaigns</CardTitle>
                <CardDescription>History of sent and draft campaigns</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Campaign</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Recipients</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Sent</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Opens</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Clicks</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EMAIL_CAMPAIGNS.map((c, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors">
                        <td className="px-6 py-3 text-sm font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.recipients}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.sent ?? "—"}</td>
                        <td className="px-4 py-3 text-sm">
                          {c.opens > 0 ? <span className="text-emerald-400">{c.opens} ({Math.round(c.opens / c.recipients * 100)}%)</span> : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {c.clicks > 0 ? <span className="text-blue-400">{c.clicks} ({Math.round(c.clicks / c.recipients * 100)}%)</span> : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${c.status === "sent" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"}`}>
                            {c.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="push" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Recent Notifications</CardTitle>
                <CardDescription>Push, email and messaging channel activity</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {PUSH_LOGS.map((n, i) => (
                    <div key={i} className="flex items-start gap-4 px-6 py-4 hover:bg-accent/20 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bell className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{n.title}</p>
                          <span className="text-xs text-muted-foreground shrink-0">{n.time}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className="text-[10px] h-4">{n.channel}</Badge>
                          <span className="text-[10px] text-muted-foreground">→ {n.target}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Message Templates</CardTitle>
                  <CardDescription>Reusable templates for common notifications</CardDescription>
                </div>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Template
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Template</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Channels</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Last Used</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Uses</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TEMPLATES.map((t, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="px-6 py-3 text-sm font-medium">{t.name}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{t.type}</Badge></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{t.last_used}</td>
                        <td className="px-4 py-3 text-sm font-medium">{t.uses}</td>
                        <td className="px-6 py-3 text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-xs">Edit</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
