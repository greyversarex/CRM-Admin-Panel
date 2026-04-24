// ─── Admin: KYC Review (Task #6) ──────────────────────────────────────────
// Слева — список юзеров с pending-статусом KYC. Справа (когда выбран) —
// просмотр документов: открыть, одобрить/отклонить отдельный документ,
// глобально approve/reject пользователя.
import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, FileText, ExternalLink, CheckCircle2, XCircle, ChevronRight } from "lucide-react";

type KycStatus = "not_started" | "pending" | "approved" | "rejected";

interface KycUser {
  id: number;
  name: string;
  email: string;
  role: string;
  country: string | null;
  kycStatus: KycStatus;
  kycCompletedAt: string | null;
  docs: { total: number; pending: number; approved: number; rejected: number };
}

interface KycDoc {
  id: number;
  userId: number;
  kind: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  uploadedAt: string;
}

const KIND_LABEL: Record<string, string> = {
  passport: "Паспорт",
  id_card: "ID-карта",
  company_reg: "Свидетельство о регистрации",
  tax_certificate: "Налоговая справка",
  bank_statement: "Банковская выписка",
  other: "Другое",
};

const DOC_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:  { label: "На проверке", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  approved: { label: "Одобрен",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  rejected: { label: "Отклонён",   cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
};

const USER_STATUS_BADGE: Record<KycStatus, { label: string; cls: string }> = {
  not_started: { label: "Не начат", cls: "bg-muted/40 text-muted-foreground border-border" },
  pending:     { label: "На проверке", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  approved:    { label: "Одобрен", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  rejected:    { label: "Отклонён", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
};

export default function AdminKyc() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<KycStatus>("pending");
  const [users, setUsers]   = useState<KycUser[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [selected, setSelected] = useState<KycUser | null>(null);
  const [docs, setDocs] = useState<KycDoc[] | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [busyDocId, setBusyDocId] = useState<number | null>(null);
  const [busyUserAction, setBusyUserAction] = useState<"approve" | "reject" | null>(null);

  // reject dialog (для документа или для юзера)
  const [rejectTarget, setRejectTarget] = useState<{ kind: "doc" | "user"; id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/kyc/users?status=${filter}`, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setUsers(j.data ?? []);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }
  useEffect(() => { loadUsers(); /* eslint-disable-next-line */ }, [filter]);

  async function loadDocs(userId: number) {
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/admin/kyc/users/${userId}/documents`, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDocs(j.data ?? []);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      setDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  function handleSelect(u: KycUser) {
    setSelected(u);
    loadDocs(u.id);
  }

  async function approveDoc(docId: number) {
    setBusyDocId(docId);
    try {
      const res = await fetch(`/api/admin/kyc-documents/${docId}/approve`, {
        method: "POST", credentials: "same-origin",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      toast({ title: "Документ одобрен" });
      if (selected) await loadDocs(selected.id);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setBusyDocId(null);
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 3) {
      toast({ title: "Укажи причину", description: "Минимум 3 символа", variant: "destructive" });
      return;
    }
    const url = rejectTarget.kind === "doc"
      ? `/api/admin/kyc-documents/${rejectTarget.id}/reject`
      : `/api/admin/users/${rejectTarget.id}/kyc/reject`;
    if (rejectTarget.kind === "doc") setBusyDocId(rejectTarget.id);
    else setBusyUserAction("reject");
    try {
      const res = await fetch(url, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: "Отклонено" });
      setRejectTarget(null); setRejectReason("");
      if (selected) {
        await loadDocs(selected.id);
        if (rejectTarget.kind === "user") { await loadUsers(); setSelected(null); }
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setBusyDocId(null);
      setBusyUserAction(null);
    }
  }

  async function approveUser() {
    if (!selected) return;
    setBusyUserAction("approve");
    try {
      const res = await fetch(`/api/admin/users/${selected.id}/kyc/approve`, {
        method: "POST", credentials: "same-origin",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: "KYC пользователя одобрен" });
      await loadUsers();
      setSelected(null);
    } catch (err: any) {
      toast({ title: "Не удалось одобрить", description: err.message, variant: "destructive" });
    } finally {
      setBusyUserAction(null);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)]" />
          <h1 className="text-2xl font-bold">KYC верификация</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Документы пользователей, ожидающие проверки</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* USERS LIST */}
          <Card className="card-surface no-lift border-border/60 self-start">
            <CardHeader className="pb-3">
              <Tabs value={filter} onValueChange={(v) => { setFilter(v as KycStatus); setSelected(null); setDocs(null); }}>
                <TabsList className="w-full">
                  <TabsTrigger value="pending" className="flex-1">На проверке</TabsTrigger>
                  <TabsTrigger value="approved" className="flex-1">Одобрены</TabsTrigger>
                  <TabsTrigger value="rejected" className="flex-1">Отклонены</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
              {loadingUsers && (
                <div className="p-8 flex items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
                </div>
              )}
              {users && users.length === 0 && !loadingUsers && (
                <div className="p-8 text-center text-sm text-muted-foreground">Пусто</div>
              )}
              {users && users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelect(u)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/30 transition-colors flex items-center justify-between gap-2 ${
                    selected?.id === u.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-1">
                      {u.docs.total} док. · {u.docs.pending} pending · {u.docs.approved} ok · {u.docs.rejected} rej
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* DOCS PANE */}
          {!selected ? (
            <Card className="card-surface no-lift border-border/60">
              <CardContent className="p-12 text-center text-muted-foreground">
                <ShieldCheck className="h-10 w-10 mx-auto opacity-30 mb-3" />
                <p className="text-sm">Выбери пользователя слева, чтобы просмотреть документы</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>{selected.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{selected.email} · {selected.role}{selected.country ? ` · ${selected.country.toUpperCase()}` : ""}</p>
                  <div className="mt-2">
                    <Badge variant="outline" className={USER_STATUS_BADGE[selected.kycStatus].cls}>
                      KYC: {USER_STATUS_BADGE[selected.kycStatus].label}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                    disabled={busyUserAction !== null || selected.kycStatus === "approved"}
                    onClick={approveUser}
                  >
                    {busyUserAction === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                    Одобрить пользователя
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                    disabled={busyUserAction !== null}
                    onClick={() => { setRejectTarget({ kind: "user", id: selected.id }); setRejectReason(""); }}
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Отклонить
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingDocs && (
                  <div className="p-8 flex items-center justify-center text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Загрузка документов…
                  </div>
                )}
                {docs && docs.length === 0 && !loadingDocs && (
                  <div className="p-8 text-center text-muted-foreground text-sm">Документов нет</div>
                )}
                {docs && docs.length > 0 && (
                  <div className="space-y-3">
                    {docs.map((d) => {
                      const objectId = d.objectPath.split("/").pop();
                      const viewUrl = `/api/kyc/objects/uploads/${objectId}`;
                      const sizeKb = Math.round(d.sizeBytes / 1024);
                      return (
                        <div key={d.id} className="rounded-lg border border-border/60 bg-background/40 p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{KIND_LABEL[d.kind] ?? d.kind}</div>
                                <div className="text-xs text-muted-foreground truncate">{d.originalFilename}</div>
                                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                                  {d.mimeType} · {sizeKb} KB · {new Date(d.uploadedAt).toLocaleString("ru-RU")}
                                </div>
                                {d.status === "rejected" && d.rejectionReason && (
                                  <div className="text-[11px] text-rose-400/80 mt-1">Причина: {d.rejectionReason}</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className={DOC_STATUS_BADGE[d.status].cls}>
                                {DOC_STATUS_BADGE[d.status].label}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-3">
                            <Button asChild size="sm" variant="outline">
                              <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Открыть
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                              disabled={busyDocId === d.id || d.status === "approved"}
                              onClick={() => approveDoc(d.id)}
                            >
                              {busyDocId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Одобрить</>}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                              disabled={busyDocId === d.id || d.status === "rejected"}
                              onClick={() => { setRejectTarget({ kind: "doc", id: d.id }); setRejectReason(""); }}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Отклонить
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Reject dialog (общий для doc/user) */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rejectTarget?.kind === "doc" ? "Отклонить документ" : "Отклонить KYC пользователя"}</DialogTitle>
            <DialogDescription>Укажи причину — будет показана пользователю.</DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={500}
            placeholder="Например: документ нечитабелен, не виден срок действия…"
            className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md bg-background/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 3 || busyDocId !== null || busyUserAction !== null}
              onClick={submitReject}
            >
              {(busyDocId !== null || busyUserAction === "reject")
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Отклонение…</>
                : "Отклонить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
