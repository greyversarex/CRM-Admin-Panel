import { Layout } from "@/components/layout";
import {
  useGetRelease, useUpdateReleaseStatus, useUpdateRelease, useCreateTrack, useDeleteTrack,
  useDeliverRelease, useSubmitReleaseForReview,
  getGetReleaseQueryKey, getListReleasesQueryKey, getGetReleaseCountsQueryKey,
  getListDeliveriesQueryKey,
  type Track, type DeliveryTarget,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ImageIcon, Edit3, XCircle, Globe2, Music2, AlertTriangle,
  Calendar, Plus, Trash2, Send, ShieldCheck, Lock, CheckCircle2, Clock,
} from "lucide-react";
import { CoverUploader, AudioUploader, assetHref } from "@/components/asset-uploader";
import { BulkTracksDialog } from "@/components/bulk-tracks-dialog";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const DSPS = ["Spotify", "Apple Music", "YouTube Music", "Yandex", "VK Music", "Tidal", "Boom", "Zvooq", "Amazon"];

// Соответствует enum DeliveryTarget в openapi.yaml + connectors/registry.ts.
// label — что видит пользователь, code — что уходит в API.
const DELIVER_TARGETS: Array<{ code: DeliveryTarget; label: string }> = [
  { code: "spotify",       label: "Spotify" },
  { code: "apple_music",   label: "Apple Music" },
  { code: "youtube_music", label: "YouTube Music" },
  { code: "yandex_music",  label: "Yandex Music" },
  { code: "vk_music",      label: "VK Music" },
  { code: "tiktok",        label: "TikTok" },
  { code: "deezer",        label: "Deezer" },
  { code: "amazon_music",  label: "Amazon Music" },
  { code: "vevo",          label: "VEVO" },
  { code: "zvuk",          label: "Zvuk" },
  { code: "tidal",         label: "Tidal" },
  { code: "boomplay",      label: "Boomplay" },
  { code: "ok_music",      label: "OK Music" },
];

// Управление видимостью кнопок теперь полностью основано на флагах, которые
// возвращает бэкенд в каждом объекте Release:
//   release.canSubmit          — показывать «Send to Moderation»
//   release.canDeliver         — показывать «Deliver to DSPs»
//   release.isEditable         — показывать «Edit Release» (иначе «Edit Locked»)
//   release.allowedTransitions — содержит "takedown_requested" только если
//                                кнопку Take Down имеет смысл показывать
// Единый источник истины — RELEASE_STATUS_TRANSITIONS + флаги в enrichRelease на бэкенде.
const TAKEDOWN_REASONS = [
  "Other", "Legal/contractual obligations", "Incorrect metadata",
  "Wrong audio file", "Replacement release", "Artist request",
];

export default function ReleaseDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { data: release, isLoading, error } = useGetRelease(id, {
    query: {
      enabled: Number.isFinite(id) && id > 0,
      retry: false,
    } as never,
  });
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [takedownOpen, setTakedownOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const { user } = useAuth();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetReleaseQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListReleasesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !release) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h2 className="text-xl font-semibold">Release not found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            We couldn't load release #{params.id}. It may have been deleted, or you don't have access to it.
          </p>
          <Button onClick={() => setLocation("/releases")} className="mt-2">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Releases
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* back */}
        <button onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Releases
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{release.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review your release for any issues before submitting to our review team for a final guideline check.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Send to Moderation: только из draft/rejected, доступно владельцу */}
            {release.canSubmit && (
              <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-primary to-violet-500 hover:opacity-95">
                    <ShieldCheck className="mr-2 h-4 w-4" /> Send to Moderation
                  </Button>
                </DialogTrigger>
                <SubmitForReviewDialog
                  releaseId={id}
                  release={release}
                  onClose={() => { setSubmitOpen(false); invalidateAll(); }}
                />
              </Dialog>
            )}
            {user && (user.role === "admin" || user.role === "manager") && release.canDeliver && (
              <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="bg-card border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
                    <Send className="mr-2 h-4 w-4" /> Deliver to DSPs
                  </Button>
                </DialogTrigger>
                <DeliverDialog
                  releaseId={id}
                  onClose={() => { setDeliverOpen(false); invalidateAll(); }}
                />
              </Dialog>
            )}
            {/* Take Down: показываем только когда backend разрешает переход в takedown_requested */}
            {release.allowedTransitions.includes("takedown_requested") && (
              <Dialog open={takedownOpen} onOpenChange={setTakedownOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="bg-card border-rose-500/30 text-rose-300 hover:bg-rose-500/10">
                    <XCircle className="mr-2 h-4 w-4" /> Take Down
                  </Button>
                </DialogTrigger>
                <TakeDownDialog
                  releaseId={id}
                  onClose={() => { setTakedownOpen(false); invalidateAll(); }}
                />
              </Dialog>
            )}
            {/* Edit Release: backend-флаг isEditable (draft/rejected). В остальных — disabled. */}
            {release.isEditable ? (
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="bg-card">
                    <Edit3 className="mr-2 h-4 w-4" /> Edit Release
                  </Button>
                </DialogTrigger>
                <EditReleaseDialog
                  releaseId={id}
                  title={release.title}
                  onClose={() => { setEditOpen(false); invalidateAll(); }}
                />
              </Dialog>
            ) : (
              <Button
                variant="outline"
                disabled
                className="bg-card opacity-60 cursor-not-allowed"
                title="Релиз заблокирован для редактирования. Дождитесь решения модератора или запросите takedown."
              >
                <Lock className="mr-2 h-4 w-4" /> Edit Locked
              </Button>
            )}
          </div>
        </div>

        {/* ── Контекстные баннеры по статусу ─────────────────────────────── */}
        {release.status === "pending_review" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-amber-300">Релиз на модерации</div>
                <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                  Модератор проверяет ваш релиз — обычно это занимает 1–2 рабочих дня.
                  В это время редактирование закрыто. Как только проверка пройдёт,
                  вы получите уведомление об одобрении или возврате с комментариями.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {release.status === "rejected" && (
          <Card className="border-rose-500/40 bg-rose-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-rose-300">Релиз отклонён модератором</div>
                {release.statusNote ? (
                  <div className="mt-2 p-3 rounded-md bg-rose-950/40 border border-rose-500/20">
                    <div className="text-[11px] uppercase tracking-wider text-rose-400/80 mb-1">Причина</div>
                    <p className="text-sm text-rose-100/90 whitespace-pre-wrap">{release.statusNote}</p>
                  </div>
                ) : (
                  <p className="text-xs text-rose-200/80 mt-1">Модератор не оставил комментариев.</p>
                )}
                <p className="text-xs text-rose-200/70 mt-2">
                  Внесите правки и нажмите «Send to Moderation», чтобы отправить релиз на повторную проверку.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {release.status === "approved" && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-emerald-300">Релиз одобрен</div>
                <p className="text-xs text-emerald-200/80 mt-1">
                  Релиз прошёл модерацию и готов к доставке на платформы.
                  {user?.role === "admin" || user?.role === "manager"
                    ? " Нажмите «Deliver to DSPs», чтобы поставить в очередь."
                    : " Дистрибьютор поставит его в очередь на отгрузку в DSP."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge status={release.status} className="text-xs" />
            </div>
            <div className="text-xs text-muted-foreground">
              Updated {new Date(release.updatedAt).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        {/* Release Details */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Release Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
            <div className="space-y-3">
              <KV label="Release Title" value={release.title} highlight />
              <KV label="Metadata Language" value={release.language || "English"} />
              <KV label="Primary Artist" value={release.artistName} chip />
              <KV label="Label" value={release.labelName || "Independent"} />
              <KV label="Release Date" value={release.releaseDate ? new Date(release.releaseDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "TBD"} />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <KV label="Genre" value={release.genre || "—"} />
                <KV label="Subgenre" value="—" />
                <KV label="UPC" value={release.upc || "Pending"} mono />
                <KV label="Release Type" value={release.releaseType} cap />
                <KV label="Tracks" value={String(release.totalTracks)} />
                <KV label="Explicit Content" value={release.isExplicit ? "Yes" : "No"} />
                <KV label="P-Line" value={release.pLine || "—"} />
                <KV label="C-Line" value={release.cLine || "—"} />
                <KV label="Territories" value={(release.territories || ["WW"]).join(", ")} />
              </div>
            </div>
            <CoverUploader
              value={release.coverUrl ?? null}
              releaseId={id}
              attach
              onChange={() => invalidateAll()}
            />
          </CardContent>
        </Card>

        {/* Tracks */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Music2 className="h-4 w-4" /> Треки ({release.tracks?.length ?? 0})
            </CardTitle>
            <BulkTracksDialog
              releaseId={id}
              artistId={release.artistId}
              defaultLanguage={release.language || "Tajik"}
              defaultGenre={release.genre || "Pop"}
              startTrackNumber={(release.tracks?.length ?? 0) + 1}
              onUploaded={invalidateAll}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {(release.tracks ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border/50 rounded-md">
                Треков пока нет — добавь первый ниже.
              </div>
            ) : (
              release.tracks!.map((t, i) => (
                <TrackRow key={t.id} t={t} index={i} release={release} onChange={invalidateAll} />
              ))
            )}
            <AddTrackForm
              releaseId={id}
              artistId={release.artistId}
              defaultLanguage={release.language || "Tajik"}
              defaultGenre={release.genre || "Pop"}
              nextTrackNumber={(release.tracks?.length ?? 0) + 1}
              onAdded={invalidateAll}
            />
          </CardContent>
        </Card>

        {/* Release Availability */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe2 className="h-4 w-4" /> Release Availability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-4 p-3 rounded-md border border-border/50 bg-background/40">
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-indigo-500/40 to-violet-500/40 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Timeline</span>
                  <StatusBadge status={release.status} className="text-[10px] px-1.5 py-0 h-4" />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Territory: {(release.territories || ["WW"]).join(", ")}</div>
                <div className="text-xs text-muted-foreground">Partners: All — {DSPS.join(", ")}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DSPS.map((d) => <DspPill key={d} name={d} />)}
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed pt-2 border-t border-border/40">
              With this release now approved and submitted, you have agreed to the terms of the agreement you have signed with Tajik Music Distribution. You confirm that all samples, musical works, vocals, and other compositions used within this release are owned by the label/artist or properly licensed for distribution to the partners chosen. Tajik Music Distribution will not be held responsible for any possible legal repercussions from misrepresented content.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function KV({
  label, value, highlight, chip, mono, cap, mini,
}: {
  label: string; value: string;
  highlight?: boolean; chip?: boolean; mono?: boolean; cap?: boolean; mini?: boolean;
}) {
  return (
    <div className={mini ? "" : "grid grid-cols-[140px_1fr] items-baseline gap-3"}>
      <div className={"text-xs text-muted-foreground " + (mini ? "block mb-0.5" : "")}>{label}</div>
      {chip ? (
        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 w-fit">
          {value}
        </span>
      ) : (
        <div className={
          "text-sm " +
          (highlight ? "font-semibold text-foreground " : "text-foreground ") +
          (mono ? "font-mono text-xs " : "") +
          (cap ? "capitalize " : "")
        }>
          {value}
        </div>
      )}
    </div>
  );
}

// ─── Track row ────────────────────────────────────────────────────────────
function TrackRow({
  t, index, release, onChange,
}: { t: Track; index: number; release: any; onChange: () => void }) {
  const deleteTrack = useDeleteTrack();
  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-semibold text-sm flex items-center gap-2">
          <span className="text-muted-foreground">Трек {index + 1}</span>
          <span className="text-foreground">· {t.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            Язык: <span className="text-foreground">{t.language || "—"}</span>
          </div>
          <Button
            variant="ghost" size="sm"
            className="text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 h-7 px-2"
            onClick={async () => {
              if (!confirm(`Удалить трек "${t.title}"?`)) return;
              await deleteTrack.mutateAsync({ id: t.id });
              toast({ title: "Трек удалён" });
              onChange();
            }}
            disabled={deleteTrack.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <KV label="Артист" value={release.artistName} mini />
        <KV label="ISRC" value={t.isrc || "—"} mini mono />
        <KV label="Жанр" value={t.genre || "—"} mini />
        <KV label="Explicit" value={t.isExplicit ? "EXPLICIT" : "Чисто"} mini />
      </div>
      <AudioUploader
        value={t.audioUrl ?? null}
        trackId={t.id}
        durationSeconds={t.durationSeconds ?? null}
        onChange={() => onChange()}
      />
    </div>
  );
}

// ─── Add Track form ───────────────────────────────────────────────────────
function AddTrackForm({
  releaseId, artistId, defaultLanguage, defaultGenre, nextTrackNumber, onAdded,
}: {
  releaseId: number; artistId: number;
  defaultLanguage: string; defaultGenre: string;
  nextTrackNumber: number; onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isrc, setIsrc] = useState("");
  const [isExplicit, setIsExplicit] = useState(false);
  const createTrack = useCreateTrack();

  const submit = async () => {
    if (!title.trim()) {
      toast({ title: "Укажи название трека", variant: "destructive" });
      return;
    }
    try {
      await createTrack.mutateAsync({
        data: {
          title: title.trim(),
          artistId, releaseId,
          trackNumber: nextTrackNumber,
          language: defaultLanguage,
          genre: defaultGenre,
          isrc: isrc.trim() || null,
          isExplicit,
        },
      });
      setTitle(""); setIsrc(""); setIsExplicit(false); setOpen(false);
      toast({ title: "Трек добавлен", description: "Теперь загрузи аудиофайл." });
      onAdded();
    } catch (e: any) {
      toast({ title: "Не удалось добавить трек", description: e?.message ?? "Ошибка", variant: "destructive" });
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Добавить трек
      </Button>
    );
  }
  return (
    <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-4 space-y-3">
      <div className="text-sm font-semibold">Новый трек #{nextTrackNumber}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Название *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track title" className="bg-background/40" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">ISRC (опционально)</label>
          <Input value={isrc} onChange={(e) => setIsrc(e.target.value)} placeholder="USRC17607839" className="bg-background/40 font-mono" />
        </div>
      </div>
      <div className="flex items-center justify-between p-2 rounded-md bg-background/40 border border-border/50">
        <span className="text-xs text-muted-foreground">Explicit Content</span>
        <Switch checked={isExplicit} onCheckedChange={setIsExplicit} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Отмена</Button>
        <Button size="sm" onClick={submit} disabled={createTrack.isPending}>
          {createTrack.isPending ? "Сохраняю…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}

function DspPill({ name }: { name: string }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/50 bg-background/40 text-xs">
      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500/40 to-violet-500/40 flex items-center justify-center text-[9px] font-bold text-white">
        {initials}
      </div>
      {name}
    </div>
  );
}

// ─── Edit Release dialog ──────────────────────────────────────────────────
function EditReleaseDialog({ releaseId, title, onClose }: { releaseId: number; title: string; onClose: () => void }) {
  const updateStatus = useUpdateReleaseStatus();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Your Release</DialogTitle>
        <DialogDescription>Putting "{title}" into Edit state allows you to:</DialogDescription>
      </DialogHeader>
      <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
        <li>Include new metadata (contributors, etc.)</li>
        <li>Fix metadata mistakes</li>
        <li>Correct corrupt audio / artwork</li>
        <li>Add DSPs</li>
      </ul>
      <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 text-amber-300/90">
        <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Note:</span>
        Primary Artist name is permanent and cannot change. To change it, take down the release and create a new one.
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Your Responsibilities:</div>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>Make any necessary changes to the release.</li>
          <li>Re-upload audio files / album art if Tajik Music no longer has access.</li>
          <li>Submit your edited release. Once approved we'll deliver to all DSPs.</li>
        </ol>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
        Confirm Edit Release
      </label>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!confirmed || updateStatus.isPending}
          onClick={async () => {
            await updateStatus.mutateAsync({ id: releaseId, data: { status: "draft", note: "Edit requested" } });
            toast({ title: "Release moved to edit state", description: "You can now make changes." });
            onClose();
          }}
        >
          Edit Release
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Submit for Review dialog ─────────────────────────────────────────────
// Чек-лист готовности зеркалит серверную проверку в POST /releases/:id/submit.
// Если всё ок — кнопка активна; если нет — пользователь сразу видит, что чинить.
function SubmitForReviewDialog({
  releaseId, release, onClose,
}: {
  releaseId: number;
  release: { title: string; coverUrl?: string | null; releaseDate?: string | null; genre?: string | null;
    tracks?: Array<{ id: number; title: string; audioUrl?: string | null }>; status: string };
  onClose: () => void;
}) {
  const submit = useSubmitReleaseForReview();
  const [confirmed, setConfirmed] = useState(false);

  const tracks = release.tracks ?? [];
  const tracksWithoutAudio = tracks.filter((t) => !t.audioUrl);

  // Список тех же требований, что проверяет backend.
  const checks: Array<{ ok: boolean; label: string }> = [
    { ok: !!release.title?.trim(),                        label: "Название релиза" },
    { ok: !!release.coverUrl,                             label: "Обложка загружена" },
    { ok: !!release.releaseDate,                          label: "Указана дата релиза" },
    { ok: !!release.genre,                                label: "Указан жанр" },
    { ok: tracks.length > 0,                              label: `Хотя бы один трек (сейчас: ${tracks.length})` },
    { ok: tracks.length > 0 && tracksWithoutAudio.length === 0,
      label: tracksWithoutAudio.length === 0
        ? "Аудио загружено для всех треков"
        : `Аудио для всех треков (без аудио: ${tracksWithoutAudio.length})` },
  ];
  const allReady = checks.every((c) => c.ok);

  const isResubmit = release.status === "rejected";

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>{isResubmit ? "Повторная отправка на модерацию" : "Отправить релиз на модерацию"}</DialogTitle>
        <DialogDescription>
          {isResubmit
            ? `«${release.title}» был отклонён ранее. После повторной отправки релиз снова попадёт в очередь модератора.`
            : `«${release.title}» будет передан модератору для проверки. Пока релиз на модерации, редактирование закрыто.`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Готовность к отправке</div>
        <ul className="space-y-1.5 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {c.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                : <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />}
              <span className={c.ok ? "text-foreground" : "text-rose-300"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {!allReady && (
        <div className="text-xs bg-rose-500/10 border border-rose-500/30 rounded p-3 text-rose-200">
          Заполните все пункты и загрузите аудио, прежде чем отправлять релиз модератору.
        </div>
      )}

      {allReady && (
        <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 text-amber-300/90">
          <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Внимание:</span>
          После отправки релиз будет заблокирован для редактирования до решения модератора.
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} disabled={!allReady} />
        Подтверждаю отправку на модерацию
      </label>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button
          disabled={!allReady || !confirmed || submit.isPending}
          onClick={async () => {
            try {
              await submit.mutateAsync({ id: releaseId });
              toast({
                title: isResubmit ? "Отправлено на повторную модерацию" : "Отправлено на модерацию",
                description: "Модератор получил уведомление. Вы узнаете о решении.",
              });
              onClose();
            } catch (e) {
              // 409 от backend — readiness разошлась с клиентским чек-листом (race condition).
              const err = e as { response?: { data?: { error?: string; missing?: string[] } }; message?: string };
              const data = err?.response?.data;
              const missing = data?.missing?.length ? ` Не хватает: ${data.missing.join(", ")}.` : "";
              toast({
                title: "Не удалось отправить",
                description: (data?.error ?? err?.message ?? "Неизвестная ошибка") + missing,
                variant: "destructive",
              });
            }
          }}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {isResubmit ? "Отправить повторно" : "Отправить на модерацию"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Take Down dialog ─────────────────────────────────────────────────────
function TakeDownDialog({ releaseId, onClose }: { releaseId: number; onClose: () => void }) {
  const updateStatus = useUpdateReleaseStatus();
  const [reason, setReason] = useState<string>("Other");
  const [other, setOther] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>Take Down Your Release</DialogTitle>
        <DialogDescription>Taking down this release removes its availability on all delivered DSPs.</DialogDescription>
      </DialogHeader>
      <div className="text-xs text-muted-foreground bg-rose-500/10 border border-rose-500/30 rounded p-3 space-y-1">
        <div className="font-semibold text-rose-300">Reasons for takedown:</div>
        <ul className="list-disc pl-4">
          <li>Legal / contractual obligations</li>
          <li>Remove an incorrect version of a release from DSPs in order to deliver a correct one (track removal / re-ordering)</li>
        </ul>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Takedown Reason</label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TAKEDOWN_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Other Reason</label>
        <Textarea value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason for the take down…" rows={4} className="bg-background/40" />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
        Confirm Take Down Request
      </label>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          variant="destructive"
          disabled={!confirmed || updateStatus.isPending}
          onClick={async () => {
            const note = reason === "Other" ? other : reason;
            await updateStatus.mutateAsync({ id: releaseId, data: { status: "takedown_requested", note: note || reason } });
            toast({ title: "Takedown requested", description: "Your release will be removed from DSPs." });
            onClose();
          }}
        >
          Take Down
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Deliver to DSPs dialog ───────────────────────────────────────────────
// Создаёт по одной delivery-job на каждый выбранный target. Воркер заберёт
// очередь на ближайшем тике (≤30 сек). Прогресс смотрим в /distribution.
function DeliverDialog({ releaseId, onClose }: { releaseId: number; onClose: () => void }) {
  const deliver = useDeliverRelease();
  const [selected, setSelected] = useState<Set<DeliveryTarget>>(new Set());

  const toggle = (code: DeliveryTarget) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(DELIVER_TARGETS.map((t) => t.code)));
  const clearAll = () => setSelected(new Set());

  const submit = async () => {
    const targets = Array.from(selected);
    if (targets.length === 0) return;
    try {
      const res = await deliver.mutateAsync({ id: releaseId, data: { targets, ddexVersion: "4.3" } });
      toast({
        title: "Доставка поставлена в очередь",
        description: `${res.jobs.length} job${res.jobs.length === 1 ? "" : "s"} → DDEX ERN 4.3. Прогресс — на /distribution.`,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Ошибка отгрузки", description: msg, variant: "destructive" });
    }
  };

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>Deliver Release to DSPs</DialogTitle>
        <DialogDescription>
          На каждый выбранный DSP сгенерируется отдельный DDEX ERN 4.3 пакет
          и поставится в очередь. Воркер обработает в течение 30 секунд.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between text-xs">
        <div className="text-muted-foreground">Выбрано: <span className="font-mono text-foreground">{selected.size}</span> / {DELIVER_TARGETS.length}</div>
        <div className="flex gap-2">
          <button type="button" onClick={selectAll} className="text-primary hover:underline">Выбрать все</button>
          <span className="text-muted-foreground">·</span>
          <button type="button" onClick={clearAll} className="text-muted-foreground hover:text-foreground">Очистить</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
        {DELIVER_TARGETS.map((t) => (
          <label
            key={t.code}
            className="flex items-center gap-2 px-2.5 py-2 rounded border border-border bg-background/40 hover:bg-accent/40 cursor-pointer text-sm"
          >
            <Checkbox
              checked={selected.has(t.code)}
              onCheckedChange={() => toggle(t.code)}
            />
            <span className="flex-1">{t.label}</span>
            <span className="text-[10px] text-muted-foreground font-mono">{t.code}</span>
          </label>
        ))}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={selected.size === 0 || deliver.isPending}
          onClick={submit}
        >
          <Send className="mr-2 h-4 w-4" />
          {deliver.isPending ? "Отправка…" : `Deliver (${selected.size})`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
