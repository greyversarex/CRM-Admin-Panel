import { Layout } from "@/components/layout";
import {
  useGetRelease, useUpdateRelease, useCreateTrack, useDeleteTrack,
  useDeliverRelease, useSubmitReleaseForReview,
  useUpdateTrack, useUpdateReleaseDsps, useListSplits,
  useGetReleaseArtists, useUpdateReleaseArtists,
  getGetReleaseQueryKey, getListReleasesQueryKey, getGetReleaseCountsQueryKey,
  getListDeliveriesQueryKey, getGetReleaseDspsQueryKey, getGetReleaseArtistsQueryKey,
  type Track, type DeliveryTarget,
  type ReleaseDetail, type CreateReleaseBody, type Split, type ReleaseArtistRef,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ChevronDown, ImageIcon, Edit3, XCircle, Globe2, Music2, AlertTriangle,
  Calendar, Plus, Trash2, Send, ShieldCheck, Lock, CheckCircle2, Clock,
  ShieldAlert, ScanSearch, Database, ListChecks, Share2, RefreshCw, Pencil,
  Upload, FilePlus2, FolderInput, Loader2, Save, Headphones, ArrowDownToLine,
} from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { CoverUploader, AudioUploader, useAssetUpload } from "@/components/asset-uploader";
import { BulkTracksDialog } from "@/components/bulk-tracks-dialog";
import { WaveformPlayer } from "@/components/waveform-player";
import { useState, useEffect, useMemo, useRef } from "react";
import { DspPickerDialog } from "@/components/release-wizard/dsp-picker";
import { MultiArtistPicker } from "@/components/release-wizard/multi-artist-picker";
import { useCatalogOptions } from "@/components/release-wizard/use-catalog";
import { genreOptionsWith } from "@/components/release-wizard/types";
import { DictionaryCombobox } from "@/components/release-wizard/dictionary-combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch as SwitchUI } from "@/components/ui/switch";
import { Label as FieldLabel } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AcrMatchesModal } from "@/components/acr-matches-modal";
import { Broma16DistributionControl } from "@/components/broma16-push-card";
import { ModerationActionsBar } from "@/components/moderation-actions-bar";
import { DeliverDialog, TakeDownDialog } from "@/components/release-action-dialogs";
import { toast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";

const DSPS = ["Spotify", "Apple Music", "YouTube Music", "Yandex", "VK Music", "Tidal", "Boom", "Zvooq", "Amazon"];

/** Вытаскивает 4-значный год из строки ℗/© («℗ 2025 Tajik Music» → 2025). */
function yearFromLine(s: string | null | undefined): number | null {
  const m = s?.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

// Те же справочники, что в /releases/new — единый источник.
const META_LANGS: Array<{ value: string; label: string }> = [
  { value: "Tajik",   label: "Таджикский" },
  { value: "Russian", label: "Русский" },
  { value: "English", label: "Английский" },
  { value: "Persian", label: "Персидский" },
  { value: "Uzbek",   label: "Узбекский" },
  { value: "Arabic",  label: "Арабский" },
  { value: "Turkish", label: "Турецкий" },
];
const META_RELEASE_TYPES: Array<{ value: string; label: string }> = [
  { value: "single",      label: "Сингл" },
  { value: "album",       label: "Альбом" },
  { value: "ep",          label: "EP" },
  { value: "compilation", label: "Сборник" },
];


// Управление видимостью кнопок теперь полностью основано на флагах, которые
// возвращает бэкенд в каждом объекте Release:
//   release.canSubmit          — показывать «Send to Moderation»
//   release.canDeliver         — показывать «Deliver to DSPs»
//   release.isEditable         — показывать «Edit Release» (иначе «Edit Locked»)
//   release.allowedTransitions — содержит "takedown_requested" только если
//                                кнопку Take Down имеет смысл показывать
// Единый источник истины — RELEASE_STATUS_TRANSITIONS + флаги в enrichRelease на бэкенде.

export default function ReleaseDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const { data: release, isLoading, error } = useGetRelease(id, {
    query: {
      enabled: Number.isFinite(id) && id > 0,
      retry: false,
    } as never,
  });
  const queryClient = useQueryClient();
  const createTrack = useCreateTrack();
  const { data: releaseArtists } = useGetReleaseArtists(id, {
    query: { enabled: Number.isFinite(id) && id > 0 } as never,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [takedownOpen, setTakedownOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [cancelSubmitOpen, setCancelSubmitOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("1");
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [acrTrackId, setAcrTrackId] = useState<number | null>(null);
  // Инлайн-режим редактирования метаданных карточки Release Details.
  // Включается кнопкой «Edit Release» для черновика (без диалога/смены статуса).
  const [metaEditing, setMetaEditing] = useState(false);
  // Если пользователь параллельно отправил релиз на модерацию (или статус сменился
  // на любой не-draft) — инлайн-форма должна автоматически закрыться, иначе
  // следующий PUT упадёт на бэкендовом lock-чек'е (releaseEditableReason).
  useEffect(() => {
    if (release && release.status !== "draft" && metaEditing) setMetaEditing(false);
  }, [release?.status, metaEditing]);
  const { user } = useAuth();
  const isModeratorRole = user && (user.role === "admin" || user.role === "manager");

  const { data: acrData } = useQuery({
    queryKey: ["acr-checks-release", id],
    queryFn: async () => {
      const r = await fetch(`/api/distribution/acr/checks?releaseId=${id}`, { credentials: "same-origin" });
      if (!r.ok) return { checks: [] as Array<{ id: number; trackId: number | null; status: string; matchedTitle: string | null; scannedAt: string }>, configured: false };
      return r.json() as Promise<{ checks: Array<{ id: number; trackId: number | null; status: string; matchedTitle: string | null; scannedAt: string }>; configured: boolean }>;
    },
    enabled: Number.isFinite(id) && id > 0 && !!isModeratorRole,
    staleTime: 30_000,
  });
  const releaseAcrChecks = acrData?.checks ?? [];
  const releaseAcrConfigured = acrData?.configured ?? false;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetReleaseQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetReleaseArtistsQueryKey(id) });
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
          <h2 className="text-xl font-semibold">{RV.notFound}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {RV.notFoundDesc.replace("{id}", String(params.id))}
          </p>
          <Button onClick={() => setLocation("/releases")} className="mt-2">
            <ChevronLeft className="mr-2 h-4 w-4" /> {RV.backToReleases}
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* ── Dialogs (programmatic, no trigger buttons needed) ──────────── */}
      {submitOpen && (
        <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
          <SubmitForReviewDialog
            releaseId={id}
            release={release}
            enableEditing={() => setMetaEditing(true)}
            onClose={() => { setSubmitOpen(false); invalidateAll(); }}
          />
        </Dialog>
      )}
      {cancelSubmitOpen && (
        <Dialog open={cancelSubmitOpen} onOpenChange={setCancelSubmitOpen}>
          <CancelSubmissionDialog
            releaseId={id}
            releaseTitle={release.title}
            onClose={() => { setCancelSubmitOpen(false); invalidateAll(); }}
          />
        </Dialog>
      )}
      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DeliverDialog releaseId={id} onClose={() => { setDeliverOpen(false); invalidateAll(); }} />
      </Dialog>
      <Dialog open={takedownOpen} onOpenChange={setTakedownOpen}>
        <TakeDownDialog releaseId={id} onClose={() => { setTakedownOpen(false); invalidateAll(); }} />
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <EditReleaseDialog
          releaseId={id}
          title={release.title}
          currentStatus={release.status}
          onClose={() => { setEditOpen(false); invalidateAll(); }}
        />
      </Dialog>

      <Dialog open={bulkCreateOpen} onOpenChange={(o) => { if (!isBulkCreating) setBulkCreateOpen(o); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{RV.addTracksTitle}</DialogTitle>
            <DialogDescription>
              {RV.addTracksDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <FieldLabel htmlFor="bulk-track-count" className="text-sm text-muted-foreground">{RV.tracksCountLabel}</FieldLabel>
            <Input
              id="bulk-track-count"
              type="number"
              min={1}
              max={50}
              value={bulkCount}
              onChange={(e) => setBulkCount(e.target.value)}
              disabled={isBulkCreating}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCreateOpen(false)} disabled={isBulkCreating}>
              {RV.cancel}
            </Button>
            <Button
              disabled={isBulkCreating}
              onClick={async () => {
                if (isBulkCreating) return;
                const n = Math.max(1, Math.min(50, Math.floor(Number(bulkCount) || 1)));
                const startNum = (release.tracks?.length ?? 0) + 1;
                let created = 0;
                setIsBulkCreating(true);
                try {
                  for (let k = 0; k < n; k++) {
                    const num = startNum + k;
                    await createTrack.mutateAsync({
                      data: {
                        title: "",
                        artistId: release.artistId,
                        releaseId: id,
                        trackNumber: num,
                        language: "English",
                        genre: release.genre || "Pop",
                      } as any,
                    });
                    created++;
                  }
                  toast({
                    title: created === 1 ? RV.trackCreated : RV.tracksCreated.replace("{count}", String(created)),
                    description: RV.fillDetailsHint,
                  });
                  setBulkCreateOpen(false);
                } catch (e: any) {
                  toast({
                    title: created > 0 ? RV.createdPartial.replace("{created}", String(created)).replace("{total}", String(n)) : RV.couldNotCreateTracks,
                    description: e?.message ?? RV.error,
                    variant: "destructive",
                  });
                  if (created > 0) setBulkCreateOpen(false);
                } finally {
                  setIsBulkCreating(false);
                  invalidateAll();
                }
              }}
            >
              {isBulkCreating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {RV.addTracksBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-8">

        {/* Back */}
        <button
          onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded border border-border/40 hover:bg-accent/30"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> {RV.backToReleases}
        </button>

        {/* Title + subtitle */}
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{release.title}</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            {RV.subtitle}
          </p>
        </div>

        {/* Status banners */}
        {release.status === "pending_review" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-amber-300">{RV.pendingTitle}</div>
                <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                  {RV.pendingDesc}
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
                <div className="font-semibold text-sm text-rose-300">{RV.rejectedTitle}</div>
                {release.statusNote ? (
                  <div className="mt-2 p-3 rounded-md bg-rose-950/40 border border-rose-500/20">
                    <div className="text-[11px] uppercase tracking-wider text-rose-400/80 mb-1">{RV.rejectionReason}</div>
                    <p className="text-sm text-rose-100/90 whitespace-pre-wrap">{release.statusNote}</p>
                  </div>
                ) : (
                  <p className="text-xs text-rose-200/80 mt-1">{RV.noModComment}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        {release.status === "approved" && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-emerald-300">{RV.approvedTitle}</div>
                <p className="text-xs text-emerald-200/80 mt-1">
                  {RV.approvedDesc}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{RV.status}</span>
            <StatusBadge status={release.status} className="text-xs" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {release.status === "approved" && (
              <>
                {release.allowedTransitions.includes("takedown_requested") && (
                  <Button
                    size="sm" variant="outline"
                    className="bg-card border-rose-500/30 text-rose-300 hover:bg-rose-500/10 h-8 text-xs"
                    onClick={() => setTakedownOpen(true)}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5 mr-1.5" /> {RV.takeDown}
                  </Button>
                )}
                <Button
                  size="sm" variant="outline"
                  className="bg-card h-8 text-xs"
                  onClick={() => setEditOpen(true)}
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1.5" /> {RV.editRelease}
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="bg-card h-8 text-xs"
                  onClick={() => document.getElementById("card-tracks")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  <Headphones className="h-3.5 w-3.5 mr-1.5" /> {RV.listeningPage}
                </Button>
              </>
            )}
            {release.status === "pending_review" && (
              <>
                {release.canCancelSubmit ? (
                  <Button
                    size="sm" variant="outline"
                    className="bg-card border-amber-500/30 text-amber-300 hover:bg-amber-500/10 h-8 text-xs"
                    onClick={() => setCancelSubmitOpen(true)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" /> {RV.cancelSubmission}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground/60 italic px-1">
                    {RV.cancelUnavailable}
                  </span>
                )}
                <Button
                  size="sm" variant="outline"
                  className="bg-card h-8 text-xs"
                  onClick={() => document.getElementById("card-tracks")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  <Headphones className="h-3.5 w-3.5 mr-1.5" /> {RV.listeningPage}
                </Button>
              </>
            )}
            {release.isEditable && (
              <DeleteReleaseButton releaseId={release.id} releaseTitle={release.title} onDeleted={() => setLocation("/releases")} />
            )}
          </div>
        </div>

        {/* Release Details */}
        <Card id="card-release-details" className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{RV.releaseDetails}</CardTitle>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 cursor-pointer"
                onClick={() => jumpToIssue({ section: "release", field: "", message: "", severity: "error" }, { releaseId: id, isDraft: release.status === "draft", enableEditing: () => setMetaEditing(true), navigate: setLocation })}>
                {RV.showIssues}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {metaEditing && (
                <span className="text-[11px] text-primary/90 bg-primary/10 border border-primary/30 rounded px-2 py-0.5">{RV.editing}</span>
              )}
              {release.isEditable ? (
                <Button
                  size="sm" variant="outline"
                  className={metaEditing ? "bg-primary/15 border-primary/40 text-primary" : "bg-card"}
                  onClick={() => setLocation(`/releases/${release.id}/edit`)}
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1" />
                  {RV.edit}
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="bg-card opacity-60 cursor-not-allowed">
                  <Lock className="h-3.5 w-3.5 mr-1" /> {RV.locked}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 p-6">
            {metaEditing ? (
              <EditDetailsForm
                release={release}
                onCancel={() => setMetaEditing(false)}
                onSaved={() => { setMetaEditing(false); invalidateAll(); }}
              />
            ) : (
              <div className="space-y-2">
                <KV label={RV.releasesTitle} value={release.title} highlight />
                <KV label={RV.releaseVersion} value={(release as any).releaseVersion || (release as any).trackVersion || "—"} />
                <KV label={RV.metadata} value={release.language || "English"} />
                {releaseArtists && releaseArtists.length > 0 ? (
                  <div className="grid grid-cols-[160px_1fr] items-baseline gap-4">
                    <div className="text-sm text-muted-foreground">{RV.artists}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {releaseArtists.map((a) => (
                        <span
                          key={`${a.artistId}-${a.position}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                        >
                          {a.name}
                          <span className="text-[10px] text-primary/60 font-normal">{(RV.artistRoleLabels as Record<string, string>)[a.role] ?? a.role}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <KV label={RV.primaryArtist} value={release.artistName} chip />
                )}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 pt-3 border-t border-border/30">
                  <KV label={RV.genre} value={release.genre || "—"} mini />
                  <KV label="UPC" value={release.upc || RV.upcPending} mono mini />
                  <KV label={RV.subgenre} value="—" mini />
                  <KV label={RV.catalog} value={(release as any).catalogNumber || release.upc || "—"} mini />
                  <KV label={RV.releaseTypeLabel2} value={(RV.releaseTypes as Record<string, string>)[release.releaseType] ?? release.releaseType} cap mini />
                  <KV label={RV.labelLabel} value={release.labelName || RV.independent} mini />
                  <KV label={RV.tracks} value={String(release.totalTracks)} mini />
                  <KV label="CLINE" value={release.cLine || "—"} mini />
                  <KV label={RV.explicitContent} value={release.isExplicit ? RV.yes : RV.no} mini />
                  <div />
                  <KV label="PLINE" value={release.pLine || "—"} mini />
                </div>
                {Array.isArray((release as any).metadataTranslations) && (release as any).metadataTranslations.length > 0 && (
                  <div className="pt-2 mt-1 border-t border-border/30">
                    <div className="text-[11px] text-muted-foreground mb-1">{RV.metadataTranslations}</div>
                    <ul className="space-y-0.5">
                      {((release as any).metadataTranslations as Array<{language: string; title: string; version?: string | null}>).map((t, i) => (
                        <li key={i} className="text-xs text-foreground bg-background/40 border border-border/40 rounded px-2 py-1 flex flex-wrap gap-x-2">
                          <span className="text-muted-foreground uppercase font-mono text-[10px] self-center">{t.language}</span>
                          <span className="font-medium">{t.title}</span>
                          {t.version && <span className="text-muted-foreground">· {t.version}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <CoverUploader value={release.coverUrl ?? null} releaseId={id} attach onChange={() => invalidateAll()} />
          </CardContent>
        </Card>

        {/* Tracks section header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{RV.tracks}</h2>
            <span className="h-5 min-w-[22px] px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">
              {(release.tracks ?? []).length}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 cursor-pointer"
              onClick={() => jumpToIssue(
                { section: "tracks", field: "", message: "", severity: "error" },
                { releaseId: id, isDraft: release.status === "draft", enableEditing: () => setMetaEditing(true), navigate: setLocation },
              )}
            >
              {RV.showIssues}
            </span>
          </div>
          {/* Групповое редактирование треков (Multi Track Edit / Reorder / Upload
              Audio) ведёт на страницы, где правки идут через PUT/POST /tracks и
              attach ассетов — бэкенд блокирует их для владельца на нередактируемом
              релизе (409). Поэтому кнопки показываем только когда релиз редактируем
              (draft/rejected), как и остальные edit-кнопки на странице. */}
          {release.isEditable && (release.tracks ?? []).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm" className="text-xs h-8"
                onClick={() => setLocation(`/releases/${id}/multi-track-edit`)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> {RV.multiTrackEdit}
              </Button>
              <Button
                size="sm" className="text-xs h-8"
                onClick={() => setLocation(`/releases/${id}/reorder-tracks`)}
              >
                <ListChecks className="h-3.5 w-3.5 mr-1.5" /> {RV.reorderTracks}
              </Button>
              <Button
                size="sm" className="text-xs h-8"
                onClick={() => window.open(`/releases/${id}/audio-upload`, "_blank")}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> {RV.uploadAudio}
              </Button>
            </div>
          )}
        </div>

        {/* Tracks — individual card per track */}
        {(release.tracks ?? []).map((t, i) => (
          <TrackRow
            key={t.id} t={t} index={i} release={release} onChange={invalidateAll}
            acrChecks={releaseAcrChecks.filter(c => c.trackId === t.id)}
            acrConfigured={releaseAcrConfigured}
            isModeratorRole={!!isModeratorRole}
            onOpenAcr={setAcrTrackId}
          />
        ))}
        {(release.tracks ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border/50 rounded-lg">
            {RV.noTracksYet}
          </div>
        )}

        {/* Релиз-уровневая модалка распознавания ACRCloud (открывается по иконкам треков) */}
        {isModeratorRole && acrTrackId !== null && (
          <AcrMatchesModal
            releaseId={id}
            initialTrackId={acrTrackId}
            tracks={(release.tracks ?? []).map((t, i) => {
              const da = Array.isArray((t as any).displayArtists) ? (t as any).displayArtists : [];
              const primary = da.find((d: any) => d.role === "primary")?.name as string | undefined;
              return {
                id: t.id,
                title: t.title || `Track ${i + 1}`,
                artist: primary ?? (release as any).artistName ?? "—",
                trackNumber: i + 1,
              };
            })}
            onClose={() => setAcrTrackId(null)}
          />
        )}

        {/* Create New Track */}
        {release.isEditable && (
          <Card id="card-tracks" className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                <button
                  type="button"
                  disabled={createTrack.isPending}
                  onClick={() => {
                    setBulkCount("1");
                    setBulkCreateOpen(true);
                  }}
                  className="h-full text-left rounded-xl border border-border/50 bg-background/40 p-6 hover:bg-accent/30 transition disabled:opacity-50"
                  data-testid="card-create-track"
                >
                  <div className="flex items-start gap-5">
                    <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/20 border border-primary/30 flex items-center justify-center shrink-0">
                      <Music2 className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg text-foreground">{RV.createNewTrack}</div>
                      <p className="text-sm text-primary/90 mt-1">{RV.createTrackQuestion}</p>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                        {RV.createTrackDesc}
                      </p>
                      <div className="mt-4">
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                          {RV.createTrack}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
                <ReuseExistingTrackCard
                  releaseId={id}
                  releaseArtistId={release.artistId}
                  currentReleaseTitle={release.title}
                  nextTrackNumber={(release.tracks?.length ?? 0) + 1}
                  onReused={invalidateAll}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Release Availability (Timeline + Territory + Stores) ─────────── */}
        <ReleaseAvailabilitySummaryCard
          release={release}
          isEditable={!!release.isEditable}
          onEdit={() => setLocation(`/releases/${id}/availability`)}
        />

        {/* ── SplitShare Setup (OPTIONAL) ──────────────────────────────────── */}
        <SplitShareSetupSummaryCard
          release={release}
          onEdit={() => setLocation(`/releases/${id}/splitshare`)}
        />

        {/* ── Модерация (админ, релиз на модерации) ────────────────────────── */}
        {user?.role === "admin" && release.status === "pending_review" && (
          <ModerationActionsBar releaseId={id} onDecided={invalidateAll} />
        )}

        {/* ── Terms + submit / actions ─────────────────────────────────────── */}
        <div className="space-y-3 pt-1">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {RV.terms}
          </p>
          <div className="flex items-center justify-end gap-3 flex-wrap">
            {release.canSubmit && (
              <Button
                className="bg-gradient-to-r from-primary to-violet-500 hover:opacity-95 px-6"
                onClick={() => setSubmitOpen(true)}
              >
                <ShieldCheck className="mr-2 h-4 w-4" /> {RV.submitRelease}
              </Button>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
}

// ─── Inline edit form для Release Details (только для статуса draft) ──────
// Сервер позволяет PUT /releases/:id для не-владельцев только в draft/rejected.
// Поэтому форма доступна только из режима metaEditing, который включается
// для draft. Для rejected — сначала нужно перевести в draft (это делает
// EditReleaseDialog ниже).
function EditDetailsForm({
  release, onCancel, onSaved,
}: {
  release: ReleaseDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const updateRelease = useUpdateRelease();
  const updateArtists = useUpdateReleaseArtists();
  // Язык — справочник Broma16; жанр берётся из иерархии документа.
  const langOpts = useCatalogOptions("language", { valueKey: "code", fallback: META_LANGS.map((l) => ({ value: l.value, label: l.label })) });
  const { data: serverArtists } = useGetReleaseArtists(release.id);
  // Локальный список артистов релиза. Синхронизируем один раз, когда придёт
  // ответ сервера, пока пользователь его не правил.
  const [artists, setArtists] = useState<ReleaseArtistRef[]>([]);
  const artistsTouched = useRef(false);
  useEffect(() => {
    if (artistsTouched.current || !serverArtists) return;
    setArtists(
      serverArtists.length > 0
        ? serverArtists.map((a, i) => ({ artistId: a.artistId, name: a.name, role: a.role, position: i }))
        : [{ artistId: release.artistId, name: release.artistName ?? "", role: "primary", position: 0 }],
    );
  }, [serverArtists, release.artistId, release.artistName]);

  const [form, setForm] = useState({
    title:        release.title ?? "",
    language:     release.language ?? "Tajik",
    releaseType:  release.releaseType ?? "single",
    genre:        release.genre ?? "",
    releaseDate:  release.releaseDate ? String(release.releaseDate).slice(0, 10) : "",
    upc:          release.upc ?? "",
    catalogNumber: (release as any).catalogNumber ?? "",
    pLine:        release.pLine ?? "",
    pLineYear:    ((release as any).pLineYear as number | null) ?? null,
    cLine:        release.cLine ?? "",
    cLineYear:    ((release as any).cLineYear as number | null) ?? null,
    isExplicit:   !!release.isExplicit,
    territories:  (release.territories ?? ["WW"]).join(", "),
    coverAiUsage: ((release as any).coverAiUsage as "none" | "some" | "all" | null) ?? null,
    translations: (((release as any).metadataTranslations as Array<{ language: string; title: string; version?: string | null }>) ?? []),
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const onSave = async () => {
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: RV.titleRequired, description: RV.titleRequiredDesc });
      return;
    }
    if (artists.length === 0) {
      toast({ variant: "destructive", title: RV.needArtist, description: RV.needArtistDesc });
      return;
    }
    if (!artists.some((a) => a.role === "primary")) {
      toast({ variant: "destructive", title: RV.needPrimary, description: RV.needPrimaryDesc });
      return;
    }
    const dupIds = artists.map((a) => a.artistId);
    if (new Set(dupIds).size !== dupIds.length) {
      toast({ variant: "destructive", title: RV.duplicateArtist, description: RV.duplicateArtistDesc });
      return;
    }
    const territories = form.territories
      .split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    // UpdateReleaseBody на бэке требует title/releaseType/artistId; labelId/coverUrl — nullable.
    // Для не-привилегированных пользователей бэк отклоняет смену artistId/labelId,
    // поэтому подставляем существующие значения релиза без изменений.
    // Чистим переводы: убираем пустые ряды (без language или без title).
    const translations = form.translations
      .map((t) => ({ language: (t.language || "").trim(), title: (t.title || "").trim(), version: (t.version || "").trim() || null }))
      .filter((t) => t.language && t.title);
    // Первый primary становится «легаси» artistId релиза (бэк всё равно
    // синхронизирует, но отправляем согласованно).
    const firstPrimary = artists.find((a) => a.role === "primary") ?? artists[0];
    const data: CreateReleaseBody = {
      title:       form.title.trim(),
      releaseType: form.releaseType as CreateReleaseBody["releaseType"],
      artistId:    firstPrimary.artistId,
      labelId:     release.labelId ?? null,
      coverUrl:    release.coverUrl ?? null,
      language:    form.language || null,
      genre:       form.genre || null,
      releaseDate: form.releaseDate || null,
      upc:         form.upc.trim() || null,
      catalogNumber: form.catalogNumber.trim() || null,
      pLine:       form.pLine.trim() || null,
      // Год: явное поле, а если не задано — пробуем вытащить из строки («2025 Tajik Music»).
      pLineYear:   form.pLineYear ?? yearFromLine(form.pLine),
      cLine:       form.cLine.trim() || null,
      cLineYear:   form.cLineYear ?? yearFromLine(form.cLine),
      isExplicit:  form.isExplicit,
      territories: territories.length > 0 ? territories : ["WW"],
      coverAiUsage: form.coverAiUsage ?? undefined,
      metadataTranslations: translations,
    } as CreateReleaseBody;
    try {
      // Список артистов сохраняем ПЕРВЫМ: этот эндпоинт в одной транзакции
      // и заменяет join-таблицу, и синхронизирует releases.artist_id с первым
      // primary. Если он упадёт — метаданные ещё не тронуты (нет частичного
      // рассинхрона). Только после успеха обновляем остальные метаданные.
      await updateArtists.mutateAsync({
        id: release.id,
        data: { artists: artists.map((a) => ({ artistId: a.artistId, role: a.role })) },
      });
      await updateRelease.mutateAsync({ id: release.id, data });
      toast({ title: RV.changesSaved, description: RV.changesSavedDesc });
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: RV.saveFailed, description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <FormField label={RV.releaseTitleLabel}>
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} className="bg-background/40" />
      </FormField>

      <FormField label={RV.releaseArtistsLabel}>
        <MultiArtistPicker
          value={artists}
          onChange={(next) => { artistsTouched.current = true; setArtists(next); }}
        />
        <p className="text-[11px] text-muted-foreground/80 mt-1">
          {RV.artistsHint}
        </p>
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label={RV.metadataLanguageLabel}>
          <DictionaryCombobox value={form.language} onChange={(v) => set("language", v)} options={langOpts.options} placeholder="—" />

        </FormField>
        <FormField label={RV.releaseTypeLabel}>
          <Select value={form.releaseType} onValueChange={(v) => set("releaseType", v as typeof form.releaseType)}>
            <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {META_RELEASE_TYPES.map((rt) => <SelectItem key={rt.value} value={rt.value}>{(RV.releaseTypes as Record<string, string>)[rt.value] ?? rt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label={RV.genreLabel}>
          <DictionaryCombobox value={form.genre || ""} onChange={(v) => set("genre", v)} options={genreOptionsWith(form.genre)} placeholder="—" />

        </FormField>
        <FormField label={RV.upcOptional}>
          <Input value={form.upc} onChange={(e) => set("upc", e.target.value)} placeholder="195502855390" className="bg-background/40 font-mono" />
        </FormField>
        <FormField label={RV.releaseDateLabel}>
          <Input type="date" value={form.releaseDate} onChange={(e) => set("releaseDate", e.target.value)} className="bg-background/40" />
        </FormField>
      </div>

      <FormField label={RV.catalogOptional}>
        <Input
          value={form.catalogNumber}
          onChange={(e) => set("catalogNumber", e.target.value)}
          placeholder="TM260001"
          className="bg-background/40 font-mono"
        />
        <p className="text-[11px] text-muted-foreground/80 mt-1">
          {RV.catalogHint}
        </p>
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label={RV.pLineLabel}>
          <Input value={form.pLine} onChange={(e) => set("pLine", e.target.value)} placeholder="2026 Tajik Music" className="bg-background/40" />
        </FormField>
        <FormField label={RV.pYearLabel}>
          <Input type="number" min={1900} max={2100} value={form.pLineYear ?? ""} placeholder={String(yearFromLine(form.pLine) ?? new Date().getFullYear())}
            onChange={(e) => { const n = Number(e.target.value); set("pLineYear", e.target.value && Number.isFinite(n) ? n : null); }} className="bg-background/40 font-mono" />
        </FormField>
        <FormField label={RV.cLineLabel}>
          <Input value={form.cLine} onChange={(e) => set("cLine", e.target.value)} placeholder="2026 Tajik Music" className="bg-background/40" />
        </FormField>
        <FormField label={RV.cYearLabel}>
          <Input type="number" min={1900} max={2100} value={form.cLineYear ?? ""} placeholder={String(yearFromLine(form.cLine) ?? new Date().getFullYear())}
            onChange={(e) => { const n = Number(e.target.value); set("cLineYear", e.target.value && Number.isFinite(n) ? n : null); }} className="bg-background/40 font-mono" />
        </FormField>
      </div>

      <FormField label={RV.territoriesLabel}>
        <Input value={form.territories} onChange={(e) => set("territories", e.target.value)} placeholder="WW" className="bg-background/40 font-mono uppercase" />
      </FormField>

      <div className="flex items-center justify-between p-3 rounded-md bg-background/40 border border-border/50">
        <div>
          <FieldLabel className="text-sm">{RV.explicitToggleLabel}</FieldLabel>
          <p className="text-xs text-muted-foreground">{RV.explicitToggleDesc}</p>
        </div>
        <SwitchUI checked={form.isExplicit} onCheckedChange={(v) => set("isExplicit", v)} />
      </div>

      {/* AI Usage Disclosure — обязательно перед отправкой на модерацию (Symphonic). */}
      <FormField label={RV.coverAiLabel}>
        <Select
          value={form.coverAiUsage ?? ""}
          onValueChange={(v) => set("coverAiUsage", (v || null) as typeof form.coverAiUsage)}
        >
          <SelectTrigger className="bg-background/40">
            <SelectValue placeholder={RV.selectOption} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{RV.aiNone}</SelectItem>
            <SelectItem value="some">{RV.aiSomePartial}</SelectItem>
            <SelectItem value="all">{RV.aiAllGen}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground/80 mt-1">
          {RV.coverAiHint}
        </p>
      </FormField>

      {/* Переводы метаданных — необязательное многоязычие названия/версии. */}
      <div className="space-y-2 p-3 rounded-md bg-background/40 border border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <FieldLabel className="text-sm">{RV.metaTransLabel}</FieldLabel>
            <p className="text-[11px] text-muted-foreground">
              {RV.metaTransDesc}
            </p>
          </div>
          <Button
            type="button" variant="outline" size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setForm((p) => ({ ...p, translations: [...p.translations, { language: "", title: "", version: null }] }))}
          >
            <Plus className="h-3 w-3 mr-1" /> {RV.addTranslation}
          </Button>
        </div>
        {form.translations.length === 0 && (
          <div className="text-[11px] text-muted-foreground/70 italic">{RV.noTranslationsYet}</div>
        )}
        {form.translations.map((tr, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_160px_auto] gap-2 items-start">
            <DictionaryCombobox
              value={tr.language || ""}
              onChange={(v) => setForm((p) => {
                const next = [...p.translations];
                next[i] = { ...next[i], language: v };
                return { ...p, translations: next };
              })}
              options={langOpts.options}
              placeholder={RV.langPlaceholder}
              className="bg-background/60 h-9 text-sm"
            />
            <Input
              value={tr.title}
              onChange={(e) => setForm((p) => {
                const next = [...p.translations];
                next[i] = { ...next[i], title: e.target.value };
                return { ...p, translations: next };
              })}
              placeholder={RV.translatedTitlePlaceholder}
              className="bg-background/60 h-9 text-sm"
            />
            <Input
              value={tr.version || ""}
              onChange={(e) => setForm((p) => {
                const next = [...p.translations];
                next[i] = { ...next[i], version: e.target.value };
                return { ...p, translations: next };
              })}
              placeholder={RV.versionOptPlaceholder}
              className="bg-background/60 h-9 text-sm"
            />
            <Button
              type="button" variant="ghost" size="sm"
              className="h-9 px-2 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
              onClick={() => setForm((p) => ({ ...p, translations: p.translations.filter((_, idx) => idx !== i) }))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
        <Button variant="outline" onClick={onCancel} disabled={updateRelease.isPending}>{RV.cancel}</Button>
        <Button onClick={onSave} disabled={updateRelease.isPending}>
          {updateRelease.isPending ? RV.saving : RV.saveChanges}
        </Button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel className="text-sm text-muted-foreground">{label}</FieldLabel>
      {children}
    </div>
  );
}

function KV({
  label, value, highlight, chip, mono, cap, mini,
}: {
  label: string; value: string;
  highlight?: boolean; chip?: boolean; mono?: boolean; cap?: boolean; mini?: boolean;
}) {
  return (
    <div className={mini ? "" : "grid grid-cols-[160px_1fr] items-baseline gap-4"}>
      <div className={"text-sm text-muted-foreground " + (mini ? "block mb-0.5" : "")}>{label}</div>
      {chip ? (
        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 w-fit">
          {value}
        </span>
      ) : (
        <div className={
          (mini ? "text-[15px] " : "text-base ") +
          (highlight ? "font-semibold text-foreground " : "text-foreground ") +
          (mono ? "font-mono text-sm " : "") +
          (cap ? "capitalize " : "")
        }>
          {value}
        </div>
      )}
    </div>
  );
}

// ─── Delete Release button + confirmation dialog ─────────────────────────
function DeleteReleaseButton({
  releaseId, releaseTitle, onDeleted,
}: { releaseId: number; releaseTitle: string; onDeleted: () => void }) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const handleDelete = async () => {
    setPending(true);
    try {
      await adminApi(`/api/releases/${releaseId}`, { method: "DELETE" });
      toast({ title: RV.releaseDeleted, description: RV.releaseDeletedDesc.replace("{title}", releaseTitle) });
      onDeleted();
    } catch (e: any) {
      toast({ title: RV.deleteFailed, description: e?.message ?? RV.error, variant: "destructive" });
    } finally {
      setPending(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {RV.deleteRelease}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{RV.deleteReleaseQ}</DialogTitle>
            <DialogDescription>
              {RV.deleteReleaseWarn.replace("{title}", releaseTitle)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {RV.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> {RV.deleting}</> : RV.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Cancel Submission dialog ────────────────────────────────────────────
// Отзыв релиза с модерации обратно в черновик. Доступен владельцу (артист/лейбл)
// и admin/manager. После отзыва релиз снова можно редактировать или удалить.
function CancelSubmissionDialog({
  releaseId, releaseTitle, onClose,
}: { releaseId: number; releaseTitle: string; onClose: () => void }) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const [pending, setPending] = useState(false);

  const handleCancel = async () => {
    setPending(true);
    try {
      await adminApi(`/api/releases/${releaseId}/cancel-submission`, { method: "POST" });
      toast({
        title: RV.submissionWithdrawn,
        description: RV.submissionWithdrawnDesc.replace("{title}", releaseTitle),
      });
      onClose();
    } catch (e: any) {
      toast({ title: RV.withdrawFailed, description: e?.message ?? RV.error, variant: "destructive" });
      setPending(false);
    }
  };

  return (
    <DialogContent className="bg-card border-border max-w-md">
      <DialogHeader>
        <DialogTitle>{RV.cancelSubmission}</DialogTitle>
        <DialogDescription>
          {RV.cancelSubmissionDesc.replace("{title}", releaseTitle)}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          {RV.cancel}
        </Button>
        <Button onClick={handleCancel} disabled={pending}>
          {pending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> {RV.withdrawing}</> : RV.cancelSubmission}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Track row (Symphonic-style read-only card with Edit/Delete) ────────
const DASH = "------";
function TrackField({ label, value, chip }: { label: string; value: React.ReactNode; chip?: boolean }) {
  const empty = value === DASH || value == null || value === "";
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {chip && !empty ? (
        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 w-fit">
          {value}
        </span>
      ) : (
        <div className={"text-sm " + (empty ? "text-muted-foreground/60" : "text-foreground font-medium")}>
          {empty ? DASH : value}
        </div>
      )}
    </div>
  );
}

type TrackAcrCheck = { id: number; trackId: number | null; status: string; matchedTitle: string | null; scannedAt: string };

function TrackRow({
  t, index, release, onChange, acrChecks = [], acrConfigured = false, isModeratorRole = false, onOpenAcr,
}: { t: Track; index: number; release: any; onChange: () => void; acrChecks?: TrackAcrCheck[]; acrConfigured?: boolean; isModeratorRole?: boolean; onOpenAcr: (trackId: number) => void }) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const deleteTrack = useDeleteTrack();
  const latestAcr = acrChecks.length > 0 ? acrChecks[0] : null;
  const displayArtists: Array<{ name: string; role: string }> = Array.isArray((t as any).displayArtists) ? (t as any).displayArtists : [];
  const primaries  = displayArtists.filter(d => d.role === "primary");
  const featurings = displayArtists.filter(d => d.role === "featuring");
  const remixers   = displayArtists.filter(d => d.role === "remixer");
  const writers     = Array.isArray((t as any).writers) ? (t as any).writers : [];
  const performers  = Array.isArray((t as any).performers) ? (t as any).performers : [];
  const production  = Array.isArray((t as any).production) ? (t as any).production : [];
  const audioStyle  = (t as any).audioStyle as string | undefined;
  const explicitSt  = (t as any).explicitStatus as string | undefined;
  const aiUseSpat   = (t as any).spatialAiUsage as string | undefined;
  const recYear     = (t as any).recordingYear as number | undefined;
  const trackVer    = (t as any).trackVersion as string | undefined;

  const namesOrDash = (arr: { name: string }[]) => arr.length ? arr.map(x => x.name).join(", ") : DASH;
  const explicitLabel = explicitSt ? ((RV.explicitLabels as Record<string, string>)[explicitSt] ?? DASH) : DASH;
  const previewStart  = (t as any).clipStartSeconds ?? 0;
  const previewMm     = Math.floor(previewStart / 60);
  const previewSs     = String(previewStart % 60).padStart(2, "0");

  return (
    <>
    <Card id={`track-${t.id}`} className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
      {/* Card header: Track N · Show Issues | Delete | Edit */}
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{RV.trackN.replace("{n}", String(index + 1))}</CardTitle>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            {RV.showIssues}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* ACR Check buttons — visible only to admin/manager */}
          {isModeratorRole && (
            <>
              {latestAcr?.status === "matched" && (
                <button
                  onClick={() => onOpenAcr(t.id)}
                  title="ACR: совпадение найдено — нажмите для деталей"
                  className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center hover:bg-amber-500/30 transition-colors shrink-0"
                >
                  <AlertTriangle className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onOpenAcr(t.id)}
                title={latestAcr ? `ACRCloud: ${latestAcr.status}` : "ACRCloud: нет проверок"}
                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                  latestAcr?.status === "clean"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30"
                    : latestAcr?.status === "matched"
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30"
                    : latestAcr?.status === "pending"
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-400 animate-pulse"
                    : "bg-muted/60 border-border/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <ScanSearch className="h-4 w-4" />
              </button>
            </>
          )}
          {/* Delete/Edit трека доступны только когда релиз редактируем (draft/
              rejected). На модерации (pending_review) и далее кнопки скрыты —
              после Cancel Submission релиз снова draft и кнопки возвращаются. */}
          {release.isEditable && (
            <Button
              variant="outline" size="sm"
              className="border-rose-500/30 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 h-8 px-3 text-xs"
              onClick={async () => {
                if (!confirm(RV.confirmDeleteTrack.replace("{title}", t.title || `#${index + 1}`))) return;
                await deleteTrack.mutateAsync({ id: t.id });
                toast({ title: RV.trackDeleted });
                onChange();
              }}
              disabled={deleteTrack.isPending}
            >
              {RV.delete}
            </Button>
          )}
          {release.isEditable && (
            <Link href={`/releases/${release.id}/tracks/${t.id}/edit`}>
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs bg-card">
                {RV.edit}
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Row 1: Track Title / Mix Version / Metadata Language */}
        <div className="grid grid-cols-3 gap-4">
          <TrackField label={RV.trackTitle} value={t.title || DASH} />
          <TrackField label={RV.mixVersion} value={trackVer || DASH} />
          <TrackField label={RV.metadataLanguage} value={t.language || DASH} />
        </div>

        {/* Row 2: Primary Artist */}
        <div>
          <TrackField
            label={RV.primary}
            value={primaries.length ? primaries.map(p => p.name).join(", ") : (release.artistName || DASH)}
            chip
          />
        </div>

        {/* Row 3: Featuring / Remixer */}
        <div className="grid grid-cols-2 gap-4">
          <TrackField label={RV.featuring} value={namesOrDash(featurings)} />
          <TrackField label={RV.remixer} value={namesOrDash(remixers)} />
        </div>

        {/* Row 4: 4-col contributors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <TrackField label={RV.explicitStatusLabel} value={explicitLabel} />
          <TrackField label={RV.writers} value={writers.length ? writers.map((w: any) => w.name).join(", ") : DASH} />
          <TrackField
            label={RV.performersProduction}
            value={
              performers.length + production.length === 0
                ? DASH
                : [...performers, ...production].map((p: any) => p.name).join(", ")
            }
          />
          <div className="space-y-0.5">
            <div className="text-[11px] text-muted-foreground">{RV.lyrics}</div>
            <div className="text-sm font-medium text-foreground">
              {audioStyle === "instrumental" ? RV.instrumental : (t as any).lyrics ? RV.hasLyrics : DASH}
            </div>
            {audioStyle === "instrumental" && (
              <div className="text-[11px] text-muted-foreground">{RV.noLyrics}</div>
            )}
          </div>
        </div>

        {/* Row 5: Genre / Subgenre */}
        <div className="grid grid-cols-2 gap-4">
          <TrackField label={RV.genre} value={t.genre || DASH} />
          <TrackField label={RV.subgenre} value={(t as any).subgenre || DASH} />
        </div>

        {/* Row 6-8: Recorded / ISRC / Stereo AI Use */}
        <div className="grid grid-cols-3 gap-4">
          <TrackField label={RV.recorded} value={recYear ? String(recYear) : DASH} />
          <TrackField label="ISRC" value={t.isrc ? <span className="font-mono text-xs">{t.isrc}</span> : DASH} />
          <TrackField
            label={RV.stereoAiUse}
            value={(t as any).aiUsage === "some" ? RV.aiSome : (t as any).aiUsage === "all" ? RV.aiAll : DASH}
          />
        </div>

        {/* Waveform player / audio status */}
        {t.audioUrl ? (
          <WaveformPlayer objectPath={t.audioUrl} filename={null} trackId={t.id} />
        ) : (
          <div className="pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground/70">
            <span>{RV.noAudioLinked}</span>
            <span>{RV.previewStartTime}: {previewMm}:{previewSs}:00</span>
          </div>
        )}
      </CardContent>
    </Card>
  </>
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
// ВАЖНО: для черновика (status=draft) сам PATCH /status не вызывается —
// иначе сервер вернёт 409 "уже в статусе draft". Черновик и так редактируется
// прямо на этой странице. Для rejected — выполняем переход rejected → draft.
function EditReleaseDialog({
  releaseId, title, currentStatus, onClose,
}: { releaseId: number; title: string; currentStatus: string; onClose: () => void }) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const isAlreadyDraft = currentStatus === "draft";

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>{isAlreadyDraft ? RV.editDraftTitle : RV.toEditingTitle}</DialogTitle>
        <DialogDescription>
          {isAlreadyDraft
            ? RV.draftAlreadyDesc.replace("{title}", title)
            : RV.toEditingDesc.replace("{title}", title)}
        </DialogDescription>
      </DialogHeader>
      {!isAlreadyDraft && (
        <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
          <li>{RV.editBullet1}</li>
          <li>{RV.editBullet2}</li>
          <li>{RV.editBullet3}</li>
          <li>{RV.editBullet4}</li>
        </ul>
      )}
      <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 text-amber-300/90">
        <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {RV.importantLabel}</span>
        {RV.importantText}
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">{RV.yourResponsibility}</div>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>{RV.resp1}</li>
          <li>{RV.resp2}</li>
          <li>{RV.resp3}</li>
        </ol>
      </div>
      {!isAlreadyDraft && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
          {RV.confirmSwitch}
        </label>
      )}
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>{isAlreadyDraft ? RV.close : RV.cancel}</Button>
        {isAlreadyDraft ? (
          <Button onClick={onClose}>{RV.gotItEditing}</Button>
        ) : (
          <Button
            disabled={!confirmed || pending}
            onClick={async () => {
              setPending(true);
              try {
                await adminApi(`/api/releases/${releaseId}/reopen`, { method: "POST" });
                toast({ title: RV.reopened, description: RV.reopenedDesc });
                onClose();
              } catch (e) {
                toast({ variant: "destructive", title: RV.reopenFailed, description: (e as Error).message });
                setPending(false);
              }
            }}
          >
            {RV.switchToEditing}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Submit for Review dialog (Phase 8: preflight через /issues) ──────────
// Источник истины — серверная проверка GET /api/releases/:id/issues, тот же
// движок, который питает ShowIssuesPanel. Логика:
//   1. На открытии — fetch /issues (loading).
//   2. Если есть errors → submit заблокирован, показываем список со ссылками
//      на проблемные поля (как в Show Issues).
//   3. Если только warnings → submit разрешён, но требуется подтверждение
//      "Понимаю предупреждения" + основной чек.
//   4. Если всё чисто → требуется только основной чек.
// При ошибке от backend (race с серверной валидацией) показываем toast и
// перезапрашиваем /issues, чтобы пользователь увидел актуальную картину.
function SubmitForReviewDialog({
  releaseId, release, enableEditing, onClose,
}: {
  releaseId: number;
  release: { title: string; status: string };
  enableEditing: () => void;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const submit = useSubmitReleaseForReview();
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const [confirmed, setConfirmed] = useState(false);
  const [warningsAck, setWarningsAck] = useState(false);

  const [issues, setIssues] = useState<IssuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Сигнатура текущего набора предупреждений — чтобы при /refresh, если состав
  // warning'ов поменялся, сбросить ack (иначе пользователь подтвердил один набор
  // предупреждений, а отправит — с другим).
  const warningsSig = (issues?.issues || [])
    .filter((i) => i.severity === "warning")
    .map((i) => `${i.section}:${i.field}:${i.message}`)
    .sort()
    .join("|");

  const refresh = async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const r = await adminApi<IssuesResponse>(`/api/releases/${releaseId}/issues`);
      const newSig = (r.issues || [])
        .filter((i) => i.severity === "warning")
        .map((i) => `${i.section}:${i.field}:${i.message}`)
        .sort()
        .join("|");
      if (newSig !== warningsSig) setWarningsAck(false);
      setIssues(r);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  // Mount-only fetch. Родитель монтирует диалог при каждом открытии,
  // так что preflight всегда свежий.
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [releaseId]);

  const errors   = (issues?.issues || []).filter((i) => i.severity === "error");
  const warnings = (issues?.issues || []).filter((i) => i.severity === "warning");
  const grouped = (items: IssueItem[]) => {
    const map: Record<string, IssueItem[]> = {};
    for (const it of items) {
      const k = (RV.sections as Record<string, string>)[it.section] || it.section;
      (map[k] ||= []).push(it);
    }
    return Object.entries(map);
  };

  const isResubmit = release.status === "rejected";
  const canSubmit  = !loading && !loadErr && errors.length === 0
                   && confirmed && (warnings.length === 0 || warningsAck);

  // Клик по конкретной проблеме закрывает диалог и прыгает к полю (как в Show Issues).
  const handleJump = (issue: IssueItem) => {
    onClose();
    // Дать диалогу анимированно закрыться, чтобы scrollIntoView сработал по
    // финальному layout без перекрытия. Передаём настоящий enableEditing
    // от родителя, чтобы для draft-релиза сразу открылся inline-редактор.
    window.setTimeout(() => {
      jumpToIssue(issue, {
        releaseId,
        isDraft: release.status === "draft",
        enableEditing,
        navigate: (path) => setLocation(path),
      });
    }, 180);
  };

  return (
    <DialogContent className="bg-card border-border max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isResubmit ? RV.resubmitTitle : RV.submitTitle}</DialogTitle>
        <DialogDescription>
          {isResubmit
            ? RV.resubmitDesc.replace("{title}", release.title)
            : RV.submitDesc.replace("{title}", release.title)}
        </DialogDescription>
      </DialogHeader>

      {/* Preflight статус */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{RV.readinessCheck}</div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/40 disabled:opacity-50"
          >
            <RefreshCw className={"h-3 w-3 " + (loading ? "animate-spin" : "")} /> {RV.recheck}
          </button>
        </div>

        {loading && !issues && (
          <div className="text-xs text-muted-foreground py-4 text-center">{RV.checkingRelease}</div>
        )}

        {loadErr && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
            {RV.checkFailed} {loadErr}
          </div>
        )}

        {issues && errors.length === 0 && warnings.length === 0 && (
          <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {RV.readyNoIssues}
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-rose-300/90 font-semibold">
              {RV.errorsLabel} ({errors.length}) — {RV.mustFix}
            </div>
            {grouped(errors).map(([section, items]) => (
              <div key={"se-" + section} className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground/70">{section}</div>
                <ul className="space-y-1">
                  {items.map((it, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => handleJump(it)}
                        className="w-full text-left text-xs text-rose-100/90 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1.5 leading-snug hover:bg-rose-500/20 transition"
                        title={RV.jumpToField}
                      >
                        {it.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-amber-300/90 font-semibold">
              {RV.warningsLabel} ({warnings.length}) — {RV.canSubmitStill}
            </div>
            {grouped(warnings).map(([section, items]) => (
              <div key={"sw-" + section} className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground/70">{section}</div>
                <ul className="space-y-1">
                  {items.map((it, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => handleJump(it)}
                        className="w-full text-left text-xs text-amber-100/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 leading-snug hover:bg-amber-500/20 transition"
                        title={RV.jumpToField}
                      >
                        {it.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Внимание о блокировке редактирования */}
      {!loading && !loadErr && errors.length === 0 && (
        <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 text-amber-300/90">
          <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {RV.noteLabel}</span>
          {RV.lockNote}
        </div>
      )}

      {/* Чекбоксы подтверждения */}
      <div className="space-y-2">
        {warnings.length > 0 && errors.length === 0 && (
          <label className="flex items-start gap-2 text-xs text-amber-200/90 cursor-pointer leading-snug">
            <Checkbox
              className="mt-0.5"
              checked={warningsAck}
              onCheckedChange={(v) => setWarningsAck(!!v)}
              disabled={loading}
            />
            {RV.ackWarnings.replace("{count}", String(warnings.length))}
          </label>
        )}
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer leading-snug">
          <Checkbox
            className="mt-0.5"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
            disabled={loading || errors.length > 0}
          />
          {RV.confirmSubmit}
        </label>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>{RV.cancel}</Button>
        <Button
          disabled={!canSubmit || submit.isPending}
          onClick={async () => {
            try {
              await submit.mutateAsync({ id: releaseId });
              toast({
                title: isResubmit ? RV.submittedResubmit : RV.submitted,
                description: RV.submittedDesc,
              });
              onClose();
            } catch (e) {
              // 409 от backend — клиентский preflight разошёлся с серверным (race).
              const err = e as { response?: { data?: { error?: string; missing?: string[] } }; message?: string };
              const data = err?.response?.data;
              const missing = data?.missing?.length ? ` ${RV.missingPrefix} ${data.missing.join(", ")}.` : "";
              toast({
                title: RV.submitFailed,
                description: (data?.error ?? err?.message ?? RV.unknownError) + missing,
                variant: "destructive",
              });
              // Перезапросим /issues — пользователь увидит, что именно изменилось.
              void refresh();
              setConfirmed(false);
              setWarningsAck(false);
            }
          }}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {isResubmit ? RV.resubmitBtn : RV.submitBtn}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}


// ─── Show Issues panel ────────────────────────────────────────────────────
// Дергает GET /api/releases/:id/issues и показывает сгруппированный список.
// Автоматически обновляется при изменении release.status, чтобы после
// сохранений показывать актуальные проблемы.
type IssueItem = {
  // Бэкенд (release-flow.ts) шлёт: release | tracks | delivery | contributors.
  // Старое значение "splits" тоже допускаем для обратной совместимости.
  section: "release" | "tracks" | "delivery" | "contributors" | "splits";
  field: string;
  message: string;
  severity: "error" | "warning";
};
type IssuesResponse = { ok: boolean; issues: IssueItem[] };

function ShowIssuesPanel({ releaseId, status, updatedAt, onJump }: {
  releaseId: number; status: string; updatedAt: string;
  onJump?: (issue: IssueItem) => void;
}) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const [data, setData] = useState<IssuesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi<IssuesResponse>(`/api/releases/${releaseId}/issues`);
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  // Перезапрашиваем при смене статуса И при любом обновлении релиза
  // (release.updatedAt меняется после inline-save, добавления трека и т.д.).
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [releaseId, status, updatedAt]);

  const errors   = (data?.issues || []).filter((i) => i.severity === "error");
  const warnings = (data?.issues || []).filter((i) => i.severity === "warning");
  const grouped = (items: IssueItem[]) => {
    const map: Record<string, IssueItem[]> = {};
    for (const it of items) {
      const k = (RV.sections as Record<string, string>)[it.section] || it.section;
      (map[k] ||= []).push(it);
    }
    return Object.entries(map);
  };

  return (
    <Card className="bg-card/70 backdrop-blur border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> {RV.showIssues}
        </CardTitle>
        <button
          onClick={() => void refresh()}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/40"
          title={RV.recheck}
          disabled={loading}
        >
          <RefreshCw className={"h-3 w-3 " + (loading ? "animate-spin" : "")} /> {RV.refreshBtn}
        </button>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {loading && !data && <div className="text-xs text-muted-foreground">{RV.checking}</div>}
        {error && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
            {RV.checkFailed} {error}
          </div>
        )}
        {data && data.ok && (
          <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {RV.readyNoCritical}
          </div>
        )}
        {errors.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-rose-300/90 font-semibold">
              {RV.errorsLabel} ({errors.length})
            </div>
            {grouped(errors).map(([section, items]) => (
              <div key={"e-" + section} className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground/70">{section}</div>
                <ul className="space-y-1">
                  {items.map((it, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => onJump?.(it)}
                        disabled={!onJump}
                        className="w-full text-left text-xs text-rose-100/90 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1.5 leading-snug hover:bg-rose-500/20 transition disabled:cursor-default disabled:hover:bg-rose-500/10"
                        title={onJump ? RV.jumpToField : undefined}
                      >
                        {it.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-amber-300/90 font-semibold">
              {RV.warningsLabel} ({warnings.length})
            </div>
            {grouped(warnings).map(([section, items]) => (
              <div key={"w-" + section} className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground/70">{section}</div>
                <ul className="space-y-1">
                  {items.map((it, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => onJump?.(it)}
                        disabled={!onJump}
                        className="w-full text-left text-xs text-amber-100/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 leading-snug hover:bg-amber-500/20 transition disabled:cursor-default disabled:hover:bg-amber-500/10"
                        title={onJump ? RV.jumpToField : undefined}
                      >
                        {it.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── jumpToIssue: deep-link из Show Issues к проблемному месту ────────────
// Логика:
//   • section=release           → подсветить карточку Release Details, для draft
//                                  включить inline-редактор (metaEditing=true).
//   • section=tracks, field=track:<id>:<sub> → перейти на /releases/:id/tracks/:tid/edit
//                                  (отдельная страница trackEdit с 5 секциями, Фаза 5).
//   • section=tracks без id     → подсветить карточку Tracks.
//   • section=delivery          → подсветить карточку «Доступность релиза».
//   • section=contributors, field=splits|split:N → SplitShare карточка.
//   • section=contributors, field=artists       → Release Details (артист правится там).
// Подсветка: временный ring через CSS-класс на 1.5 секунды.
// Глобальные таймеры — чтобы быстрые повторные клики не «съедали» подсветку
// предыдущей цели и не запускали несколько параллельных переходов.
let _jumpRingTimer: number | null = null;
let _jumpRingEl: Element | null = null;
let _jumpNavTimer: number | null = null;
const RING_CLASSES = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"];

function clearActiveRing() {
  if (_jumpRingTimer !== null) { window.clearTimeout(_jumpRingTimer); _jumpRingTimer = null; }
  if (_jumpRingEl) { _jumpRingEl.classList.remove(...RING_CLASSES); _jumpRingEl = null; }
}

// Подсветить элемент: scroll + ring на 1.5с. Если элемент ещё не примонтирован
// (например, был только что добавлен), ждём один RAF и пробуем ещё раз — это
// покрывает случай, когда issue приходит сразу после refetch и DOM ещё не успел
// обновиться.
function flashElement(id: string) {
  const apply = (el: Element) => {
    clearActiveRing();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add(...RING_CLASSES);
    _jumpRingEl = el;
    _jumpRingTimer = window.setTimeout(() => {
      el.classList.remove(...RING_CLASSES);
      _jumpRingEl = null;
      _jumpRingTimer = null;
    }, 1500);
  };
  const el = document.getElementById(id);
  if (el) { apply(el); return; }
  // Один retry на следующем кадре + короткий таймаут — после этого сдаёмся,
  // чтобы не цикловать на отсутствующих якорях.
  requestAnimationFrame(() => {
    const el2 = document.getElementById(id);
    if (el2) apply(el2);
    else window.setTimeout(() => {
      const el3 = document.getElementById(id);
      if (el3) apply(el3);
    }, 120);
  });
}

function jumpToIssue(
  issue: IssueItem,
  opts: {
    releaseId: number | string;
    isDraft: boolean;
    enableEditing: () => void;
    navigate: (path: string) => void;
  },
) {
  // Сначала отменяем ранее запланированный переход — чтобы быстрые клики не
  // запускали навигации по очереди.
  if (_jumpNavTimer !== null) { window.clearTimeout(_jumpNavTimer); _jumpNavTimer = null; }

  // tracks: ветвимся ПЕРВЫМ ДЕЛОМ по секции, потом разбираем field. Поле может
  // быть null (например: «в релизе нет треков»), тогда показываем карточку Tracks.
  if (issue.section === "tracks") {
    const m = issue.field ? /^track:(\d+):/.exec(issue.field) : null;
    if (m) {
      const tid = m[1];
      const row = document.getElementById(`track-${tid}`);
      if (row) {
        flashElement(`track-${tid}`);
        // Открываем страницу редактирования трека (Фаза 5) после короткой паузы.
        _jumpNavTimer = window.setTimeout(() => {
          _jumpNavTimer = null;
          opts.navigate(`/releases/${opts.releaseId}/tracks/${tid}/edit`);
        }, 350);
      } else {
        opts.navigate(`/releases/${opts.releaseId}/tracks/${tid}/edit`);
      }
      return;
    }
    flashElement("card-tracks");
    return;
  }

  if (issue.section === "release") {
    if (opts.isDraft) opts.enableEditing();
    flashElement("card-release-details");
    return;
  }

  if (issue.section === "delivery") {
    flashElement("card-availability");
    return;
  }

  if (issue.section === "contributors" || issue.section === "splits") {
    if (issue.field === "artists") {
      if (opts.isDraft) opts.enableEditing();
      flashElement("card-release-details");
      return;
    }
    flashElement("card-splitshare");
    return;
  }
}

// ─── Reuse Existing Track ────────────────────────────────────────────────
// Открывает модалку поиска по ранее одобренным трекам лейбла/артиста.
// При выборе создаёт новый track-row на текущем релизе, скопировав ключевые
// метаданные (title/isrc/audioUrl/duration/artistId) — пользователь дальше
// может отредактировать через TrackRow или Track Edit (Фаза 5).
type ReusableTrack = {
  id: number;
  title: string;
  isrc: string | null;
  durationSeconds: number | null;
  audioUrl: string | null;
  releaseId: number | null;
  releaseTitle: string;
  artistId: number;
  artistName: string;
};

function ReuseExistingTrackDialog({
  releaseId, releaseArtistId, currentReleaseTitle, nextTrackNumber, onReused, trigger,
}: {
  releaseId: number;
  releaseArtistId: number;
  currentReleaseTitle: string;
  nextTrackNumber: number;
  onReused: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ReusableTrack[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const createTrack = useCreateTrack();

  const search = async () => {
    setLoading(true); setError(null);
    try {
      const url = `/api/tracks/reusable?excludeReleaseId=${releaseId}` + (q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "");
      const r = await adminApi<{ data: ReusableTrack[] }>(url);
      setItems(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  // При открытии — сразу подгружаем первые 50.
  useEffect(() => {
    if (open && items === null) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reuse = async (src: ReusableTrack) => {
    setBusyId(src.id);
    try {
      // ВАЖНО: artistId нового трека должен совпадать с artistId релиза
      // (бэкенд проверяет это в POST /tracks и возвращает 403, если разные).
      // Если исходный трек принадлежал другому артисту того же лейбла —
      // мы переписываем artistId на текущий, имена авторов всё равно
      // редактируются дальше через Track Edit.
      await createTrack.mutateAsync({
        data: {
          title:           src.title,
          isrc:            src.isrc,
          audioUrl:        src.audioUrl,
          durationSeconds: src.durationSeconds,
          releaseId:       releaseId,
          artistId:        releaseArtistId,
          trackNumber:     nextTrackNumber,
        },
      });
      toast({
        title: RV.trackAdded,
        description: RV.trackAddedDesc.replace("{title}", src.title).replace("{release}", src.releaseTitle),
      });
      onReused();
      setOpen(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: RV.addTrackFailed,
        description: (e as Error).message,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="bg-card text-xs">
            <Database className="h-3.5 w-3.5 mr-1" /> {RV.useExisting}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{RV.reuseTrackTitle}</DialogTitle>
          <DialogDescription>
            {RV.reuseTrackDesc.replace("{title}", currentReleaseTitle)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder={RV.searchPlaceholder}
            className="bg-background/40"
          />
          <Button variant="outline" onClick={() => void search()} disabled={loading}>
            <ScanSearch className={"h-4 w-4 mr-1 " + (loading ? "animate-spin" : "")} />
            {RV.find}
          </Button>
        </div>

        <div className="max-h-[420px] overflow-y-auto -mx-2 px-2 mt-2 space-y-2">
          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}
          {loading && items === null && (
            <div className="text-sm text-muted-foreground py-6 text-center">{RV.loadingEllipsis}</div>
          )}
          {items !== null && items.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border/40 rounded-md">
              {RV.noReusable}
            </div>
          )}
          {items?.map((t) => {
            const dur = t.durationSeconds
              ? `${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, "0")}`
              : "—";
            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 p-3 rounded-md border border-border/50 bg-background/40 hover:bg-accent/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.artistName} · {t.releaseTitle}
                  </div>
                  <div className="text-[11px] text-muted-foreground/80 mt-1 flex flex-wrap gap-x-3 font-mono">
                    {t.isrc && <span>ISRC {t.isrc}</span>}
                    <span>{dur}</span>
                    {t.audioUrl ? <span className="text-emerald-400/80">{RV.hasAudio}</span> : <span className="text-amber-400/80">{RV.noAudio}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => void reuse(t)}
                  disabled={busyId === t.id}
                  className="shrink-0"
                >
                  {busyId === t.id ? RV.adding : RV.use}
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{RV.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// ФАЗА 6 — Reorder / Multi-edit / Release Availability / SplitShare
// ═════════════════════════════════════════════════════════════════════════

// ─── Reorder tracks ─────────────────────────────────────────────────────
// Simple up/down editor (без drag-and-drop, чтобы не тянуть лишних зависимостей
// и сохранить совместимость с touch-устройствами). Save → POST /releases/:id/tracks/reorder.
function ReorderTracksDialog({
  releaseId, tracks, onSaved,
}: {
  releaseId: number;
  tracks: Track[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<Track[]>([]);
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setOrder([...tracks].sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0)));
  }, [open, tracks]);

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi(`/api/releases/${releaseId}/tracks/reorder`, {
        method: "POST",
        body: JSON.stringify({ order: order.map((t) => t.id) }),
      });
      toast({ title: RV.orderSaved });
      onSaved();
      setOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: RV.orderSaveFailed, description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="bg-card text-xs">
          <ListChecks className="h-3.5 w-3.5 mr-1" /> {RV.order}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{RV.reorderTitle}</DialogTitle>
          <DialogDescription>
            {RV.reorderDesc}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {order.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 p-2 rounded-md border border-border/50 bg-background/40">
              <span className="text-xs font-mono w-7 text-muted-foreground text-center">{i + 1}</span>
              <span className="text-sm flex-1 truncate">{t.title}</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</Button>
            </div>
          ))}
          {order.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">{RV.noTracks}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{RV.cancel}</Button>
          <Button onClick={save} disabled={saving || order.length < 2}>
            {saving ? RV.saving : RV.saveOrder}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Multi-edit tracks ──────────────────────────────────────────────────
// Применяет общие поля (genre / language / explicitStatus / aiUsage) сразу
// к нескольким выбранным трекам через PUT /tracks/:id в цикле.
function MultiEditTracksDialog({
  tracks, onSaved,
}: {
  tracks: Track[];
  onSaved: () => void;
}) {
  const updateTrack = useUpdateTrack();
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  // Язык — справочник Broma16; жанр берётся из иерархии документа.
  const langOpts = useCatalogOptions("language", { valueKey: "code", fallback: META_LANGS.map((l) => ({ value: l.value, label: l.label })) });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [genre, setGenre] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  const [explicit, setExplicit] = useState<"" | "non_explicit" | "explicit" | "censored">("");
  // ВАЖНО: пустая строка = «не менять». Для значения «Без AI» используем
  // настоящее серверное значение "none". Раньше оба варианта имели value="none"
  // в Select и сваливались в один и тот же ключ — выбрать «Без AI» было нельзя.
  const [ai, setAi] = useState<"" | "none" | "some" | "all">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setGenre(""); setLanguage(""); setExplicit(""); setAi("");
    }
  }, [open]);

  const allOn = selected.size === tracks.length && tracks.length > 0;
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(tracks.map((t) => t.id)));
  const toggle = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const save = async () => {
    if (selected.size === 0) {
      toast({ title: RV.selectTracksFirst, variant: "destructive" });
      return;
    }
    if (!genre && !language && !explicit && !ai) {
      toast({ title: RV.nothingToApply, description: RV.fillAtLeastOne });
      return;
    }
    setSaving(true);
    let ok = 0; let fail = 0; let firstErr = "";
    const toApply = tracks.filter((t) => selected.has(t.id));
    for (const t of toApply) {
      try {
        await updateTrack.mutateAsync({
          id: t.id,
          data: {
            artistId: t.artistId,
            title: t.title,
            ...(genre    ? { genre } : {}),
            ...(language ? { language } : {}),
            ...(explicit ? { explicitStatus: explicit, isExplicit: explicit === "explicit" } : {}),
            ...(ai       ? { aiUsage: ai } : {}),
          },
        });
        ok++;
      } catch (e) {
        fail++;
        if (!firstErr) firstErr = (e as Error).message;
      }
    }
    setSaving(false);
    if (fail === 0) {
      toast({ title: RV.updated, description: RV.appliedTo.replace("{count}", String(ok)) });
    } else {
      toast({
        variant: "destructive",
        title: RV.updateFailedN.replace("{fail}", String(fail)).replace("{total}", String(ok + fail)),
        description: firstErr,
      });
    }
    onSaved();
    if (fail === 0) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="bg-card text-xs">
          <Pencil className="h-3.5 w-3.5 mr-1" /> {RV.bulkEdit}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{RV.bulkEditTitle}</DialogTitle>
          <DialogDescription>
            {RV.bulkEditDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border border-border/50 rounded-md bg-background/30">
            <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
              <Checkbox checked={allOn} onCheckedChange={toggleAll} />
              <span className="text-xs text-muted-foreground">
                {selected.size === 0 ? RV.selectAll : RV.selectedOf.replace("{a}", String(selected.size)).replace("{b}", String(tracks.length))}
              </span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {tracks.map((t) => (
                <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30 cursor-pointer text-sm">
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                  <span className="truncate flex-1">{t.title}</span>
                  <span className="text-[10px] text-muted-foreground">#{t.trackNumber ?? "—"}</span>
                </label>
              ))}
              {tracks.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">{RV.noTracks}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel className="text-xs">{RV.genreLabel}</FieldLabel>
              <DictionaryCombobox
                value={genre}
                onChange={setGenre}
                options={[{ value: "", label: RV.keepAsIs }, ...genreOptionsWith(genre)]}
                placeholder={RV.keepAsIs}
              />
            </div>
            <div>
              <FieldLabel className="text-xs">{RV.metadataLanguageLabel}</FieldLabel>
              <DictionaryCombobox
                value={language}
                onChange={setLanguage}
                options={[{ value: "", label: RV.keepAsIs }, ...langOpts.options]}
                placeholder={RV.keepAsIs}
              />
            </div>
            <div>
              <FieldLabel className="text-xs">{RV.explicitLabel2}</FieldLabel>
              <Select value={explicit || "none"} onValueChange={(v) => setExplicit(v === "none" ? "" : (v as any))}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder={RV.keepAsIs} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{RV.keepAsIs}</SelectItem>
                  <SelectItem value="non_explicit">{RV.cleanVersion}</SelectItem>
                  <SelectItem value="explicit">{RV.explicitLabels.explicit}</SelectItem>
                  <SelectItem value="censored">{RV.censoredLabel}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel className="text-xs">{RV.aiLabel}</FieldLabel>
              <Select value={ai || "__keep"} onValueChange={(v) => setAi(v === "__keep" ? "" : (v as any))}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder={RV.keepAsIs} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep">{RV.keepAsIs}</SelectItem>
                  <SelectItem value="none">{RV.noAi}</SelectItem>
                  <SelectItem value="some">{RV.partialAi}</SelectItem>
                  <SelectItem value="all">{RV.fullAi}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{RV.cancel}</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? RV.saving : `${RV.apply} (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Release Availability (summary: Timeline + Territory + Stores) ───────────
// Symphonic-style сводка. Все правки (дата, территории, площадки) — на отдельной
// странице /releases/:id/availability (одна кнопка Edit). «Показать проблемы»
// раскрывает локальный список валидационных замечаний по доступности релиза.
function ReleaseAvailabilitySummaryCard({
  release, isEditable, onEdit,
}: {
  release: ReleaseDetail;
  isEditable: boolean;
  onEdit: () => void;
}) {
  // Витрины Broma16 (реальный канал) — тот же источник, что и «Выбор площадок».
  const { data: serverDsps = [] } = useQuery<string[]>({
    queryKey: ["release-outlets", release.id],
    queryFn: async () => {
      const res = await fetch(`/api/releases/${release.id}/distribution-outlets`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as string[];
    },
  });
  const { options: outletOptions } = useCatalogOptions("outlet", { valueKey: "code" });
  const outletLabel = (code: string) => outletOptions.find((o) => o.value === code)?.label ?? code;
  const [showIssues, setShowIssues] = useState(false);
  const { t: TT } = useLang();
  const RV = TT.releaseView;

  const dateLabel = release.releaseDate ? String(release.releaseDate).slice(0, 10) : "XXXX-XX-XX";
  const timeLabel = formatReleaseTime(release.releaseTime);
  const territories = release.territories ?? [];
  const isWorldWide = territories.includes("WW");
  const territoryLabel = isWorldWide
    ? RV.worldWide
    : territories.length > 0
      ? territories.join(", ")
      : RV.notSelected;
  const storeCount = serverDsps.length;

  const issues: string[] = [];
  if (!release.releaseDate) {
    issues.push(RV.issueNoDate);
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rd = new Date(`${String(release.releaseDate).slice(0, 10)}T00:00:00`);
    if (rd < today) issues.push(RV.issueDatePast);
  }
  if (!isWorldWide && territories.length === 0) issues.push(RV.issueNoTerritories);
  if (storeCount === 0) issues.push(RV.issueNoStores);

  return (
    <section id="card-availability" className="space-y-3 scroll-mt-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-bold">{RV.releaseAvailability}</h2>
        {issues.length > 0 && (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <Button
              variant={showIssues ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowIssues((v) => !v)}
            >
              {showIssues ? RV.hideIssues : `${RV.showIssuesBtn} (${issues.length})`}
            </Button>
          </>
        )}
      </div>

      {showIssues && issues.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
          {issues.map((m, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{m}</span>
            </div>
          ))}
        </div>
      )}

      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-bold">{RV.timeline}</h3>
              <div className="text-sm">
                <span className="font-medium">{dateLabel}</span>
                <span className="text-muted-foreground"> {RV.generalReleaseAt} {timeLabel} (UTC)</span>
              </div>
            </div>
            {isEditable && (
              <Button variant="outline" size="sm" className="bg-card text-xs shrink-0" onClick={onEdit}>
                <Edit3 className="h-3.5 w-3.5 mr-1" /> {RV.edit}
              </Button>
            )}
          </div>

          <div className="space-y-1 border-t border-border/30 pt-4">
            <h3 className="text-lg font-bold">{RV.territoryRights}</h3>
            <div className="text-sm text-muted-foreground">{territoryLabel}</div>
          </div>

          <div className="space-y-2 border-t border-border/30 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {RV.stores}
              {storeCount > 0 && (
                <span className="ml-2 font-normal text-muted-foreground/70 normal-case tracking-normal">
                  ({storeCount})
                </span>
              )}
            </h3>
            {storeCount === 0 ? (
              <div className="text-sm text-muted-foreground">{RV.noStoresSelected}</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {serverDsps.map((code) => (
                  <div
                    key={code}
                    title={outletLabel(code)}
                    className="flex items-center gap-1.5 bg-muted/30 border border-border/40 rounded-md px-2 py-1"
                  >
                    <span className="h-4 w-4 rounded bg-muted flex items-center justify-center text-[9px] uppercase text-muted-foreground shrink-0">
                      {outletLabel(code).slice(0, 2)}
                    </span>
                    <span className="text-xs text-foreground/80">{outletLabel(code)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// Принимает "HH:MM" или legacy "HH:MM:SS" (UTC) → нормализует к "HH:MM" с
// ведущим нулём часа. Невалидное/пустое → null.
function normalizeHHMM(t?: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((t ?? "").trim());
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// Нормализованное "HH:MM" (UTC, 24ч) → "h:MM AM/PM" в стиле Symphonic. Пустое → 12:00 AM.
function formatReleaseTime(t?: string | null): string {
  const hhmm = normalizeHHMM(t);
  if (!hhmm) return "12:00 AM";
  const h = parseInt(hhmm.slice(0, 2), 10);
  const min = hhmm.slice(3, 5);
  const period = h < 12 ? "AM" : "PM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${min} ${period}`;
}

// ─── SplitShare Setup (summary, OPTIONAL) ────────────────────────────────────
// Symphonic-style сводка по сплитам релиза. Полное назначение треков на сплит —
// на отдельной странице /releases/:id/splitshare (кнопка Edit).
function SplitShareSetupSummaryCard({
  release, onEdit,
}: {
  release: ReleaseDetail;
  onEdit: () => void;
}) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const { data: splits } = useListSplits({ release_id: release.id, limit: 200 });
  const tracks = release.tracks ?? [];
  const byTrack = useMemo(() => {
    const m = new Map<number, Split>();
    for (const s of splits?.data ?? []) {
      if (s.trackId) m.set(s.trackId, s);
    }
    return m;
  }, [splits]);

  const assignedCount = tracks.filter((t) => byTrack.has(t.id)).length;
  const unassignedCount = tracks.length - assignedCount;

  const shareholders = useMemo(() => {
    const names = new Set<string>();
    for (const s of splits?.data ?? []) {
      for (const p of s.participants ?? []) {
        if (p.entityName) names.add(p.entityName);
      }
    }
    return names;
  }, [splits]);

  const splitStatus =
    tracks.length === 0
      ? "—"
      : assignedCount === 0
        ? RV.notAssigned
        : assignedCount === tracks.length
          ? RV.assigned
          : `${assignedCount}/${tracks.length} ${RV.assignedSuffix}`;

  return (
    <section id="card-splitshare" className="space-y-3 scroll-mt-4">
      <h2 className="text-lg font-bold">
        {RV.splitShareSetup}{" "}
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{RV.optionalSuffix}</span>
      </h2>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <span className="h-10 w-10 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Share2 className="h-5 w-5 text-emerald-400" />
            </span>
            <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
              {RV.splitShareDesc}
            </p>
            {/* Edit сплитов доступен только пока релиз редактируем (draft/rejected).
                На модерации скрыт; после Cancel Submission возвращается. */}
            {release.isEditable && (
              <Button variant="outline" size="sm" className="bg-card text-xs shrink-0" onClick={onEdit}>
                <Edit3 className="h-3.5 w-3.5 mr-1" /> {RV.edit}
              </Button>
            )}
          </div>

          {tracks.length > 0 && unassignedCount > 0 && (
            <p className="border-t border-border/30 pt-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {unassignedCount} / {tracks.length} {RV.tracksNotAssigned}
              </span>{" "}
              {RV.unassignedHint}
            </p>
          )}

          <div className="grid grid-cols-3 gap-4 border-t border-border/30 pt-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{RV.splitLabel}</div>
              <div className="text-sm font-semibold">{splitStatus}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{RV.participantsLabel}</div>
              <div className="text-sm font-semibold">{shareholders.size > 0 ? shareholders.size : "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{RV.trackTotal}</div>
              <div className="text-sm font-semibold">{tracks.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ─── Reuse Existing Track — card-shaped trigger (Symphonic-style) ────────
function ReuseExistingTrackCard(props: {
  releaseId: number;
  releaseArtistId: number;
  currentReleaseTitle: string;
  nextTrackNumber: number;
  onReused: () => void;
}) {
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  return (
    <ReuseExistingTrackDialog
      {...props}
      trigger={
        <button
          type="button"
          className="h-full text-left rounded-xl border border-dashed border-indigo-400/40 bg-indigo-400/[0.04] p-6 hover-elevate transition w-full"
          data-testid="card-reuse-track"
        >
          <div className="flex items-start gap-5">
            <div className="h-16 w-16 rounded-xl bg-indigo-400/15 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <FolderInput className="h-8 w-8 text-indigo-300" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-lg text-foreground">{RV.reuseCardTitle}</div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {RV.reuseCardDesc}
              </p>
              <div className="mt-4">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border/60 text-sm">
                  <Database className="h-4 w-4" /> {RV.chooseTrack}
                </span>
              </div>
            </div>
          </div>
        </button>
      }
    />
  );
}

// ─── Bulk Audio Upload — header button (multiple files → tracks) ─────────
function BulkAudioUploadButton({
  releaseId, artistId, defaultLanguage, defaultGenre, startTrackNumber, onUploaded,
}: {
  releaseId: number;
  artistId: number;
  defaultLanguage: string;
  defaultGenre: string;
  startTrackNumber: number;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t: TT } = useLang();
  const RV = TT.releaseView;
  const { upload } = useAssetUpload();
  const createTrack = useCreateTrack();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setBusy(true);
    setProgress({ done: 0, total: list.length });
    let okCount = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      try {
        const asset = await upload(f, { kind: "audio", releaseId, attach: false });
        await createTrack.mutateAsync({
          data: {
            title: "",
            artistId, releaseId,
            trackNumber: startTrackNumber + i,
            language: "English",
            genre: defaultGenre,
            audioUrl: asset.objectPath,
            durationSeconds: asset.durationSeconds ?? null,
          },
        });
        okCount++;
      } catch (e: any) {
        toast({
          title: RV.uploadFailedFile.replace("{name}", f.name),
          description: e?.message ?? RV.error,
          variant: "destructive",
        });
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setBusy(false);
    setProgress(null);
    if (okCount > 0) {
      toast({ title: RV.uploadDone, description: `${RV.addedTracks} ${okCount} / ${list.length}.` });
      onUploaded();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef} type="file" multiple className="hidden"
        accept="audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/mpeg,audio/mp4,audio/aac"
        onChange={(e) => onPick(e.target.files)}
      />
      <Button
        variant="outline" size="sm" className="bg-card text-xs"
        onClick={() => inputRef.current?.click()} disabled={busy}
        data-testid="button-upload-audio"
      >
        <Upload className="h-3.5 w-3.5 mr-1" />
        {busy && progress
          ? `${RV.uploadingLabel} ${progress.done}/${progress.total}…`
          : RV.uploadAudioBtn}
      </Button>
    </>
  );
}
