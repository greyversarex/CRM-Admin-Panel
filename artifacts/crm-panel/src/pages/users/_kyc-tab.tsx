import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Eye, FileText, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { api } from "./_api";

type KycUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  kycStatus: "none" | "pending" | "approved" | "rejected";
  kycCompletedAt: string | null;
  docs: { total: number; pending: number; approved: number; rejected: number };
  updatedAt: string | null;
};

type KycDoc = {
  id: number;
  userId: number;
  kind: string;
  objectPath: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
};

type Props = { onCountChange?: (n: number) => void };

export function KycTab({ onCountChange }: Props) {
  const [users, setUsers] = useState<KycUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  const [open, setOpen] = useState<KycUser | null>(null);
  const [docs, setDocs] = useState<KycDoc[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docBusyId, setDocBusyId] = useState<number | null>(null);
  const [globalBusy, setGlobalBusy] = useState(false);

  const [rejectDocId, setRejectDocId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function loadList() {
    setLoading(true);
    try {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      const r = await api<{ data: KycUser[] }>(`/api/admin/kyc/users${qs}`);
      setUsers(r.data);
      if (filter === "pending") onCountChange?.(r.data.length);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось загрузить очередь KYC", description: e.message });
      setUsers([]);
    } finally { setLoading(false); }
  }
  useEffect(() => { loadList(); }, [filter]);

  async function loadDocs(uid: number) {
    setDocsLoading(true);
    try {
      const r = await api<{ data: KycDoc[] }>(`/api/admin/kyc/users/${uid}/documents`);
      setDocs(r.data);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось загрузить документы", description: e.message });
      setDocs([]);
    } finally { setDocsLoading(false); }
  }

  function openUser(u: KycUser) {
    setOpen(u);
    setDocs(null);
    loadDocs(u.id);
  }

  async function approveDoc(d: KycDoc) {
    setDocBusyId(d.id);
    try {
      await api(`/api/admin/kyc-documents/${d.id}/approve`, { method: "POST" });
      if (open) await loadDocs(open.id);
      toast({ title: "Документ одобрен" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Ошибка", description: e.message });
    } finally { setDocBusyId(null); }
  }

  async function rejectDocConfirm() {
    if (!rejectDocId) return;
    if (!rejectReason.trim()) {
      toast({ variant: "destructive", title: "Нужна причина" });
      return;
    }
    setDocBusyId(rejectDocId);
    try {
      await api(`/api/admin/kyc-documents/${rejectDocId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (open) await loadDocs(open.id);
      setRejectDocId(null); setRejectReason("");
      toast({ title: "Документ отклонён" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Ошибка", description: e.message });
    } finally { setDocBusyId(null); }
  }

  async function approveGlobal() {
    if (!open) return;
    setGlobalBusy(true);
    try {
      await api(`/api/admin/users/${open.id}/kyc/approve`, { method: "POST" });
      toast({ title: "KYC одобрен полностью" });
      setOpen(null);
      await loadList();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Ошибка", description: e.message });
    } finally { setGlobalBusy(false); }
  }

  async function rejectGlobal() {
    if (!open) return;
    const reason = window.prompt("Причина отказа в KYC:", "")?.trim();
    if (!reason) return;
    setGlobalBusy(true);
    try {
      await api(`/api/admin/users/${open.id}/kyc/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      toast({ title: "KYC отклонён" });
      setOpen(null);
      await loadList();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Ошибка", description: e.message });
    } finally { setGlobalBusy(false); }
  }

  function statusBadge(s: KycUser["kycStatus"]) {
    if (s === "approved") return <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Approved</Badge>;
    if (s === "pending") return <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">Pending</Badge>;
    if (s === "rejected") return <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">Rejected</Badge>;
    return <Badge variant="outline" className="text-[10px]">—</Badge>;
  }

  return (
    <>
      <Card className="card-surface no-lift border-border/60">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>KYC Verification Queue</CardTitle>
              <CardDescription>Документы артистов и лейблов, проверка личности.</CardDescription>
            </div>
            <select
              aria-label="Filter KYC status"
              className="h-9 px-3 text-xs rounded-md bg-background/50 border border-border"
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-background/30">
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`sk-${i}`}><TableCell colSpan={6}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
              ))}
              {!loading && (users?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  В очереди KYC пусто.
                </TableCell></TableRow>
              )}
              {!loading && users?.map((u) => (
                <TableRow key={u.id} className="hover:bg-accent/20" data-testid={`row-kyc-${u.id}`}>
                  <TableCell>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">{u.role}</TableCell>
                  <TableCell>{statusBadge(u.kycStatus)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">всего {u.docs.total}</Badge>
                      {u.docs.pending > 0 && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">pending {u.docs.pending}</Badge>}
                      {u.docs.approved > 0 && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">approved {u.docs.approved}</Badge>}
                      {u.docs.rejected > 0 && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">rejected {u.docs.rejected}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.updatedAt ? new Date(u.updatedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => openUser(u)}
                      data-testid={`button-open-kyc-${u.id}`}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Документы
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* DOCUMENTS modal */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Документы — {open?.name}</DialogTitle>
            <DialogDescription>
              Глобальный статус: {open && statusBadge(open.kycStatus)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {docsLoading && <Skeleton className="h-24 w-full" />}
            {!docsLoading && (docs?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Документы не загружены.</p>
            )}
            {!docsLoading && docs?.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-card/40">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{d.kind}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Загружен {new Date(d.uploadedAt).toLocaleString()}
                      {d.rejectionReason && <> · отказ: {d.rejectionReason}</>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(d.status as KycUser["kycStatus"])}
                  <a href={d.objectPath} target="_blank" rel="noreferrer" className="inline-flex">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Открыть файл">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  {d.status === "pending" && (
                    <>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-emerald-400 hover:bg-emerald-500/10"
                        disabled={docBusyId === d.id}
                        onClick={() => approveDoc(d)}
                        aria-label="Approve"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-rose-400 hover:bg-rose-500/10"
                        disabled={docBusyId === d.id}
                        onClick={() => { setRejectDocId(d.id); setRejectReason(""); }}
                        aria-label="Reject"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="border-t pt-3 mt-3">
            <Button variant="outline" onClick={() => setOpen(null)}>Закрыть</Button>
            {open?.kycStatus !== "approved" && (
              <Button
                className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                disabled={globalBusy}
                onClick={approveGlobal}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Одобрить KYC целиком
              </Button>
            )}
            {open?.kycStatus !== "rejected" && (
              <Button variant="destructive" disabled={globalBusy} onClick={rejectGlobal}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" /> Отклонить KYC
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DOC reject reason */}
      <Dialog open={rejectDocId !== null} onOpenChange={(o) => !o && setRejectDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Причина отказа</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Например: фото нечитаемо, документ просрочен..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectDocId(null)}>Отмена</Button>
            <Button variant="destructive" onClick={rejectDocConfirm}>Отклонить документ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
