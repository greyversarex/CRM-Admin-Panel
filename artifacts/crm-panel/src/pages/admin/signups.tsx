// ─── Admin: Signup Requests ────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Search, Copy, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/i18n";

type Status = "pending" | "approved" | "rejected";

interface SignupRequest {
  id: number;
  entityType: "artist" | "label";
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  legalName: string | null;
  inn: string | null;
  message: string | null;
  status: Status;
  reviewedBy: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdUserId: number | null;
  createdAt: string;
}

export default function AdminSignups() {
  const { toast } = useToast();
  const { t } = useLang();
  const [status, setStatus]   = useState<Status>("pending");
  const [search, setSearch]   = useState("");
  const [items, setItems]     = useState<SignupRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId]   = useState<number | null>(null);

  const [approveTarget, setApproveTarget] = useState<SignupRequest | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ email: string; password: string } | null>(null);

  const [rejectTarget, setRejectTarget] = useState<SignupRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
    pending:  { label: t.signups.approve,  cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    approved: { label: t.common.approve,   cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    rejected: { label: t.common.reject,    cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
  };

  async function load() {
    setLoading(true);
    try {
      const url = new URL("/api/signup-requests", window.location.origin);
      url.searchParams.set("status", status);
      if (search) url.searchParams.set("search", search);
      const res = await fetch(url.toString(), { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setItems(j.data ?? []);
    } catch (err: any) {
      toast({ title: t.signups.toast.load_error, description: err.message, variant: "destructive" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function handleApprove(req: SignupRequest) {
    setBusyId(req.id);
    try {
      const res = await fetch(`/api/signup-requests/${req.id}/approve`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setApproveTarget(null);
      setTempPasswordResult({ email: j.user.email, password: j.tempPassword });
      load();
    } catch (err: any) {
      toast({ title: t.signups.toast.approve_error, description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 3) {
      toast({ title: t.signups.toast.reason_required, description: t.signups.toast.min_chars, variant: "destructive" });
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      const res = await fetch(`/api/signup-requests/${rejectTarget.id}/reject`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: t.signups.toast.rejected });
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      toast({ title: t.signups.toast.reject_error, description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: t.signups.toast.copied, description: t.signups.toast.copy_hint }),
      () => toast({ title: t.signups.toast.copy_error, variant: "destructive" }),
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)]" />
          <h1 className="text-2xl font-bold">{t.signups.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t.signups.subtitle}</p>
        </div>

        <Card className="card-surface no-lift border-border/60">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
              <TabsList>
                <TabsTrigger value="pending">{t.signups.approve}</TabsTrigger>
                <TabsTrigger value="approved">{t.common.approve}</TabsTrigger>
                <TabsTrigger value="rejected">{t.common.reject}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") load(); }}
                  placeholder={t.signups.search_placeholder}
                  className="pl-8 h-9 w-64"
                />
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.signups.refresh}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading && !items && (
              <div className="p-12 flex items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {items && items.length === 0 && (
              <div className="p-12 text-center text-muted-foreground text-sm">
                {t.signups.empty}
              </div>
            )}
            {items && items.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.signups.table.applicant}</TableHead>
                      <TableHead>{t.signups.table.type}</TableHead>
                      <TableHead>{t.signups.table.contacts}</TableHead>
                      <TableHead>{t.signups.table.date}</TableHead>
                      <TableHead>{t.signups.table.status}</TableHead>
                      <TableHead className="text-right">{t.signups.table.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => (
                      <TableRow key={r.id} className="hover:bg-accent/20">
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          {r.legalName && <div className="text-xs text-muted-foreground">{r.legalName}{r.inn ? ` · INN ${r.inn}` : ""}</div>}
                          {r.message && <div className="text-xs text-muted-foreground/70 mt-0.5 max-w-md line-clamp-2">{r.message}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.entityType === "label" ? "border-violet-500/30 text-violet-400" : "border-emerald-500/30 text-emerald-400"}>
                            {r.entityType === "label" ? t.payouts.label_type : t.payouts.artist_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{r.email}</div>
                          {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                          {r.country && <div className="text-[10px] uppercase text-muted-foreground">{r.country}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[r.status].cls}>
                            {STATUS_BADGE[r.status].label}
                          </Badge>
                          {r.status === "rejected" && r.rejectionReason && (
                            <div className="text-[10px] text-rose-400/80 mt-1 max-w-xs">{r.rejectionReason}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                disabled={busyId === r.id}
                                onClick={() => setApproveTarget(r)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t.signups.approve}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                                disabled={busyId === r.id}
                                onClick={() => { setRejectTarget(r); setRejectReason(""); }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" /> {t.signups.reject}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve confirm */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.signups.approve_dialog.title} #{approveTarget?.id}?</DialogTitle>
            <DialogDescription>
              {approveTarget?.name} ({approveTarget?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200/80">{t.signups.approve_dialog.warning}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>{t.signups.approve_dialog.cancel}</Button>
            <Button
              onClick={() => approveTarget && handleApprove(approveTarget)}
              disabled={busyId === approveTarget?.id}
            >
              {busyId === approveTarget?.id
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /></>
                : t.signups.approve_dialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp password reveal */}
      <Dialog open={!!tempPasswordResult} onOpenChange={(o) => !o && setTempPasswordResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              {t.signups.temp_password.title}
            </DialogTitle>
            <DialogDescription>
              {t.signups.approve_dialog.warning}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Email</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-background/60 border border-border text-sm font-mono">
                  {tempPasswordResult?.email}
                </code>
                <Button size="sm" variant="outline" onClick={() => tempPasswordResult && copyToClipboard(tempPasswordResult.email)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t.signups.temp_password.copy_password}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-background/60 border border-primary/30 text-sm font-mono text-primary">
                  {tempPasswordResult?.password}
                </code>
                <Button size="sm" variant="outline" onClick={() => tempPasswordResult && copyToClipboard(tempPasswordResult.password)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPasswordResult(null)}>{t.signups.temp_password.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.signups.reject_dialog.title} #{rejectTarget?.id}</DialogTitle>
            <DialogDescription>
              {t.signups.reject_dialog.title}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={500}
            placeholder={t.signups.reject_dialog.placeholder}
            className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md bg-background/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>{t.signups.reject_dialog.cancel}</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={busyId === rejectTarget?.id || rejectReason.trim().length < 3}
            >
              {busyId === rejectTarget?.id
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /></>
                : t.signups.reject_dialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
