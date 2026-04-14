import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Zap, Shield, CheckCircle2, Clock, AlertTriangle, Plus, Play, Pause, Settings2 } from "lucide-react";

const WORKFLOWS = [
  {
    name: "Release Approved → Generate DDEX",
    trigger: "Release status = approved",
    action: "Generate DDEX ERN 4.3 → Queue for delivery",
    enabled: true,
    runs: 48,
    lastRun: "2026-04-10 14:32",
    status: "active",
  },
  {
    name: "New Release → QC Check",
    trigger: "New release submitted",
    action: "Run metadata validation + ACRCloud fingerprint check",
    enabled: true,
    runs: 102,
    lastRun: "2026-04-11 09:15",
    status: "active",
  },
  {
    name: "Payment Threshold → Auto-notify",
    trigger: "Artist balance ≥ $50",
    action: "Send email + push notification to artist",
    enabled: true,
    runs: 34,
    lastRun: "2026-04-09 10:00",
    status: "active",
  },
  {
    name: "Monthly Statement Generator",
    trigger: "1st of every month, 00:00 UTC",
    action: "Generate PDF statements for all artists → Email",
    enabled: true,
    runs: 3,
    lastRun: "2026-04-01 00:02",
    status: "active",
  },
  {
    name: "Fraud Stream Detection",
    trigger: "Stream spike > 500% in 24h",
    action: "Flag release → Notify Rights Manager → Pause payout",
    enabled: false,
    runs: 2,
    lastRun: "2026-03-14 18:22",
    status: "paused",
  },
];

const FRAUD_ALERTS = [
  { release: "Unknown Release 882", artist: "Suspicious Account", streams: "+4200%", triggered: "2026-03-14", action: "Flagged + Payout paused", severity: "high" },
  { release: "Дилам мехохад", artist: "Давлатмандов Ш.", streams: "+180%", triggered: "2026-04-08", action: "Monitoring", severity: "low" },
];

const MODERATION_RULES = [
  { rule: "Cover image must be ≥ 3000x3000px", enabled: true, violations: 4 },
  { rule: "ISRC must be present on all tracks", enabled: true, violations: 1 },
  { rule: "Explicit content label required", enabled: true, violations: 0 },
  { rule: "Audio quality ≥ 16-bit 44.1kHz", enabled: true, violations: 2 },
  { rule: "No duplicate track names in album", enabled: false, violations: 0 },
  { rule: "Metadata language must match release language", enabled: false, violations: 0 },
];

export default function Automation() {
  const [workflows, setWorkflows] = useState(WORKFLOWS);
  const [rules, setRules] = useState(MODERATION_RULES);

  const toggleWorkflow = (i: number) => {
    setWorkflows((prev) => prev.map((w, idx) => idx === i ? { ...w, enabled: !w.enabled, status: !w.enabled ? "active" : "paused" } : w));
  };

  const toggleRule = (i: number) => {
    setRules((prev) => prev.map((r, idx) => idx === i ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Automation</h1>
            <p className="text-muted-foreground mt-1">Workflow rules, fraud detection, and content moderation automation.</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <KpiCard
            label="Active Workflows"
            value="4"
            icon={Zap}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
            trend={{ value: "+1 this month", up: true }}
          />
          <KpiCard
            label="Runs This Month"
            value="187"
            icon={Play}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
            trend={{ value: "+34%", up: true, label: "vs last month" }}
          />
          <KpiCard
            label="Fraud Alerts"
            value="2"
            icon={Shield}
            iconColor="text-rose-400"
            iconBg="bg-rose-500/12"
            iconBorder="border-rose-500/20"
            trend={{ value: "-1", up: true, label: "vs last month" }}
          />
          <KpiCard
            label="QC Violations"
            value="7"
            icon={AlertTriangle}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/12"
            iconBorder="border-amber-500/20"
            trend={{ value: "+2", up: false, label: "needs review" }}
          />
        </div>

        <Tabs defaultValue="workflows">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="workflows" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Workflows
            </TabsTrigger>
            <TabsTrigger value="fraud" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Fraud Detection
            </TabsTrigger>
            <TabsTrigger value="moderation" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Content QC Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="mt-4 space-y-3">
            {workflows.map((wf, i) => (
              <Card key={i} className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${wf.enabled ? "bg-primary/10" : "bg-muted"}`}>
                      <Zap className={`h-4 w-4 ${wf.enabled ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium">{wf.name}</p>
                        <Badge variant="outline" className={`text-xs ${wf.status === "active" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-muted-foreground bg-muted/50"}`}>
                          {wf.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        <span className="text-primary/70 font-medium">Trigger:</span> {wf.trigger}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        <span className="text-primary/70 font-medium">Action:</span> {wf.action}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Play className="h-3 w-3" /> {wf.runs} runs</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last: {wf.lastRun}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={wf.enabled}
                        onCheckedChange={() => toggleWorkflow(i)}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="fraud" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Fraud & Risk Alerts</CardTitle>
                <CardDescription>Suspicious streaming activity automatically flagged by the system</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {FRAUD_ALERTS.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-500" />
                    <p className="text-sm">No active fraud alerts</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-background/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Release</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Stream Spike</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Triggered</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Action Taken</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FRAUD_ALERTS.map((a, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-6 py-3">
                            <div className="text-sm font-medium">{a.release}</div>
                            <div className="text-xs text-muted-foreground">{a.artist}</div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-rose-400">{a.streams}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{a.triggered}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{a.action}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${a.severity === "high" ? "text-rose-400 bg-rose-500/10 border-rose-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"}`}>
                              {a.severity}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="moderation" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Content QC Rules</CardTitle>
                <CardDescription>Automatic quality control checks applied to every submitted release</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {rules.map((r, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-accent/20 transition-colors">
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={() => toggleRule(i)}
                      />
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${!r.enabled ? "text-muted-foreground" : ""}`}>{r.rule}</p>
                      </div>
                      <div className="shrink-0">
                        {r.violations > 0 ? (
                          <Badge variant="outline" className="text-xs text-amber-400 bg-amber-500/10 border-amber-500/20">
                            {r.violations} violation{r.violations > 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <span className="text-xs text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Clean
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
