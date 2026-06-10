import { Layout } from "@/components/layout";
import {
  useGetRelease, useUpdateReleaseStatus, useUpdateRelease, useCreateTrack, useDeleteTrack,
  useDeliverRelease, useSubmitReleaseForReview,
  useUpdateTrack, useGetReleaseDsps, useUpdateReleaseDsps, useListSplits,
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
  Upload, FilePlus2, FolderInput, Loader2, Save,
} from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { CoverUploader, AudioUploader, assetHref, useAssetUpload } from "@/components/asset-uploader";
import { BulkTracksDialog } from "@/components/bulk-tracks-dialog";
import { useState, useEffect, useMemo, useRef } from "react";
import { DspPickerDialog } from "@/components/release-wizard/dsp-picker";
import { MultiArtistPicker } from "@/components/release-wizard/multi-artist-picker";
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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const DSPS = ["Spotify", "Apple Music", "YouTube Music", "Yandex", "VK Music", "Tidal", "Boom", "Zvooq", "Amazon"];

// Те же справочники, что в /releases/new — единый источник.
const META_GENRES = ["Pop", "Dance Pop", "Tajik Folk", "Hip Hop", "Rock", "Electronic", "R&B", "Classical", "Jazz", "World"];
const META_LANGS: Array<{ value: string; label: string }> = [
  { value: "Tajik",   label: "Таджикский" },
  { value: "Russian", label: "Русский" },
  { value: "English", label: "Английский" },
  { value: "Persian", label: "Персидский" },
  { value: "Uzbek",   label: "Узбекский" },
  { value: "Arabic",  label: "Арабский" },
];
const META_RELEASE_TYPES: Array<{ value: string; label: string }> = [
  { value: "single",      label: "Сингл" },
  { value: "album",       label: "Альбом" },
  { value: "ep",          label: "EP" },
  { value: "compilation", label: "Сборник" },
];

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
  { code: "acrcloud_ddex", label: "ACRCloud (защита прав)" },
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

const RELEASE_ARTIST_ROLE_LABELS: Record<string, string> = {
  primary: "Основной",
  featuring: "Приглашённый",
  with: "С участием",
  remixer: "Ремиксер",
};

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
  const createTrack = useCreateTrack();
  const { data: releaseArtists } = useGetReleaseArtists(id, {
    query: { enabled: Number.isFinite(id) && id > 0 } as never,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [takedownOpen, setTakedownOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("1");
  const [isBulkCreating, setIsBulkCreating] = useState(false);
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
            <DialogTitle>Add Tracks</DialogTitle>
            <DialogDescription>
              Create one or more empty tracks for this release. You can fill in the details afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <FieldLabel htmlFor="bulk-track-count" className="text-sm text-muted-foreground"># of tracks to add</FieldLabel>
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
              Cancel
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
                        title: `Track ${num}`,
                        artistId: release.artistId,
                        releaseId: id,
                        trackNumber: num,
                        language: release.language || "Tajik",
                        genre: release.genre || "Pop",
                        isExplicit: false,
                      } as any,
                    });
                    created++;
                  }
                  toast({
                    title: created === 1 ? "Track created" : `${created} tracks created`,
                    description: "Click \"Edit\" to fill in the details.",
                  });
                  setBulkCreateOpen(false);
                } catch (e: any) {
                  toast({
                    title: created > 0 ? `Created ${created} of ${n} tracks` : "Could not create tracks",
                    description: e?.message ?? "Error",
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
              Add Track(s)
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
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Releases
        </button>

        {/* Title + subtitle */}
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{release.title}</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Review your release for any issues before submitting to our review team for a final guidelines check.
          </p>
        </div>

        {/* Status banners */}
        {release.status === "pending_review" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-amber-300">Релиз на модерации</div>
                <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                  Модератор проверяет ваш релиз — обычно это занимает 1–2 рабочих дня.
                  В это время редактирование закрыто.
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
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <StatusBadge status={release.status} className="text-xs" />
          </div>
          {release.isEditable && (
            <DeleteReleaseButton releaseId={release.id} releaseTitle={release.title} onDeleted={() => setLocation("/releases")} />
          )}
        </div>

        {/* Release Details */}
        <Card id="card-release-details" className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Release Details</CardTitle>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 cursor-pointer"
                onClick={() => jumpToIssue({ section: "release", field: "", message: "", severity: "error" }, { releaseId: id, isDraft: release.status === "draft", enableEditing: () => setMetaEditing(true), navigate: setLocation })}>
                Show Issues
              </span>
            </div>
            <div className="flex items-center gap-2">
              {metaEditing && (
                <span className="text-[11px] text-primary/90 bg-primary/10 border border-primary/30 rounded px-2 py-0.5">Editing</span>
              )}
              {release.isEditable ? (
                <Button
                  size="sm" variant="outline"
                  className={metaEditing ? "bg-primary/15 border-primary/40 text-primary" : "bg-card"}
                  onClick={() => { if (release.status === "draft") setMetaEditing((v) => !v); else setEditOpen(true); }}
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1" />
                  {metaEditing ? "Done" : "Edit"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="bg-card opacity-60 cursor-not-allowed">
                  <Lock className="h-3.5 w-3.5 mr-1" /> Locked
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
                <KV label="Releases Title" value={release.title} highlight />
                <KV label="Release Version" value={(release as any).releaseVersion || (release as any).trackVersion || "—"} />
                <KV label="Metadata" value={release.language || "English"} />
                {releaseArtists && releaseArtists.length > 0 ? (
                  <div className="grid grid-cols-[160px_1fr] items-baseline gap-4">
                    <div className="text-sm text-muted-foreground">Артисты</div>
                    <div className="flex flex-wrap gap-1.5">
                      {releaseArtists.map((a) => (
                        <span
                          key={`${a.artistId}-${a.position}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                        >
                          {a.name}
                          <span className="text-[10px] text-primary/60 font-normal">{RELEASE_ARTIST_ROLE_LABELS[a.role] ?? a.role}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <KV label="Primary Artist" value={release.artistName} chip />
                )}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 pt-3 border-t border-border/30">
                  <KV label="Genre" value={release.genre || "—"} mini />
                  <KV label="UPC" value={release.upc || "Pending"} mono mini />
                  <KV label="Subgenre" value="—" mini />
                  <KV label="Catalog" value={(release as any).catalogNumber || release.upc || "—"} mini />
                  <KV label="Release Type" value={release.releaseType} cap mini />
                  <KV label="Label" value={release.labelName || "Independent"} mini />
                  <KV label="Tracks" value={String(release.totalTracks)} mini />
                  <KV label="CLINE" value={release.cLine || "—"} mini />
                  <KV label="Explicit Content" value={release.isExplicit ? "Yes" : "No"} mini />
                  <div />
                  <KV label="PLINE" value={release.pLine || "—"} mini />
                </div>
                {Array.isArray((release as any).metadataTranslations) && (release as any).metadataTranslations.length > 0 && (
                  <div className="pt-2 mt-1 border-t border-border/30">
                    <div className="text-[11px] text-muted-foreground mb-1">Metadata Translations</div>
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
            <h2 className="text-base font-semibold">Tracks</h2>
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
              Show Issues
            </span>
          </div>
          {(release.tracks ?? []).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm" className="text-xs h-8"
                onClick={() => setLocation(`/releases/${id}/multi-track-edit`)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Multi Track Edit
              </Button>
              <Button
                size="sm" className="text-xs h-8"
                onClick={() => setLocation(`/releases/${id}/reorder-tracks`)}
              >
                <ListChecks className="h-3.5 w-3.5 mr-1.5" /> Reorder Tracks
              </Button>
              <Button
                size="sm" className="text-xs h-8"
                onClick={() => setLocation(`/releases/${id}/audio-upload`)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Audio
              </Button>
            </div>
          )}
        </div>

        {/* Tracks — individual card per track */}
        {(release.tracks ?? []).map((t, i) => (
          <TrackRow key={t.id} t={t} index={i} release={release} onChange={invalidateAll} />
        ))}
        {(release.tracks ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border/50 rounded-lg">
            No tracks yet — add the first one below.
          </div>
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
                      <div className="font-bold text-lg text-foreground">Create New Track</div>
                      <p className="text-sm text-primary/90 mt-1">Need to create a new track for this release?</p>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                        Create as many as you need, upload your audio, and fill out your track details.
                      </p>
                      <div className="mt-4">
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                          Create Track
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

        {/* ── Terms + submit / actions ─────────────────────────────────────── */}
        <div className="space-y-3 pt-1">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Отправляя релиз, вы подтверждаете, что все мастеры, обложки и метаданные принадлежат
            вам или лицензированы для распространения на выбранных площадках, и соглашаетесь с
            условиями цифровой дистрибуции, Условиями использования и Политикой конфиденциальности.
          </p>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {user && (user.role === "admin" || user.role === "manager") && release.canDeliver && (
                <Button
                  variant="outline"
                  className="bg-card border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => setDeliverOpen(true)}
                >
                  <Send className="mr-2 h-4 w-4" /> Deliver to DSPs
                </Button>
              )}
              {release.allowedTransitions.includes("takedown_requested") && (
                <Button
                  variant="outline"
                  className="bg-card border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                  onClick={() => setTakedownOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Take Down
                </Button>
              )}
            </div>
            {release.canSubmit && (
              <Button
                className="bg-gradient-to-r from-primary to-violet-500 hover:opacity-95 px-6"
                onClick={() => setSubmitOpen(true)}
              >
                <ShieldCheck className="mr-2 h-4 w-4" /> Submit Release
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
  const updateRelease = useUpdateRelease();
  const updateArtists = useUpdateReleaseArtists();
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
    pLine:        release.pLine ?? "",
    cLine:        release.cLine ?? "",
    isExplicit:   !!release.isExplicit,
    territories:  (release.territories ?? ["WW"]).join(", "),
    coverAiUsage: ((release as any).coverAiUsage as "none" | "some" | "all" | null) ?? null,
    translations: (((release as any).metadataTranslations as Array<{ language: string; title: string; version?: string | null }>) ?? []),
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const onSave = async () => {
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: "Название обязательно", description: "Поле «Название релиза» не может быть пустым." });
      return;
    }
    if (artists.length === 0) {
      toast({ variant: "destructive", title: "Нужен артист", description: "Добавьте хотя бы одного артиста." });
      return;
    }
    if (!artists.some((a) => a.role === "primary")) {
      toast({ variant: "destructive", title: "Нужен основной артист", description: "Назначьте хотя бы одного артиста основным (Primary)." });
      return;
    }
    const dupIds = artists.map((a) => a.artistId);
    if (new Set(dupIds).size !== dupIds.length) {
      toast({ variant: "destructive", title: "Повтор артиста", description: "Один и тот же артист добавлен несколько раз. Уберите дубликаты." });
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
      pLine:       form.pLine.trim() || null,
      cLine:       form.cLine.trim() || null,
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
      toast({ title: "Изменения сохранены", description: "Метаданные релиза обновлены." });
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Не удалось сохранить", description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="Название релиза *">
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} className="bg-background/40" />
      </FormField>

      <FormField label="Артисты релиза">
        <MultiArtistPicker
          value={artists}
          onChange={(next) => { artistsTouched.current = true; setArtists(next); }}
        />
        <p className="text-[11px] text-muted-foreground/80 mt-1">
          Можно добавить несколько артистов и задать роль каждому (основной,
          приглашённый, с участием, ремиксер). Основных артистов может быть несколько.
        </p>
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Язык метаданных">
          <Select value={form.language} onValueChange={(v) => set("language", v)}>
            <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {META_LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Тип релиза">
          <Select value={form.releaseType} onValueChange={(v) => set("releaseType", v as typeof form.releaseType)}>
            <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {META_RELEASE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label="Жанр">
          <Select value={form.genre || undefined} onValueChange={(v) => set("genre", v)}>
            <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {META_GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="UPC (необязательно)">
          <Input value={form.upc} onChange={(e) => set("upc", e.target.value)} placeholder="195502855390" className="bg-background/40 font-mono" />
        </FormField>
        <FormField label="Дата релиза">
          <Input type="date" value={form.releaseDate} onChange={(e) => set("releaseDate", e.target.value)} className="bg-background/40" />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="℗ Строка">
          <Input value={form.pLine} onChange={(e) => set("pLine", e.target.value)} placeholder="2026 Tajik Music" className="bg-background/40" />
        </FormField>
        <FormField label="© Строка">
          <Input value={form.cLine} onChange={(e) => set("cLine", e.target.value)} placeholder="2026 Tajik Music" className="bg-background/40" />
        </FormField>
      </div>

      <FormField label="Территории (через запятую, ISO-коды или WW)">
        <Input value={form.territories} onChange={(e) => set("territories", e.target.value)} placeholder="WW" className="bg-background/40 font-mono uppercase" />
      </FormField>

      <div className="flex items-center justify-between p-3 rounded-md bg-background/40 border border-border/50">
        <div>
          <FieldLabel className="text-sm">Explicit-контент</FieldLabel>
          <p className="text-xs text-muted-foreground">Пометить релиз как explicit на музыкальных площадках.</p>
        </div>
        <SwitchUI checked={form.isExplicit} onCheckedChange={(v) => set("isExplicit", v)} />
      </div>

      {/* AI Usage Disclosure — обязательно перед отправкой на модерацию (Symphonic). */}
      <FormField label="Использование AI при создании обложки *">
        <Select
          value={form.coverAiUsage ?? ""}
          onValueChange={(v) => set("coverAiUsage", (v || null) as typeof form.coverAiUsage)}
        >
          <SelectTrigger className="bg-background/40">
            <SelectValue placeholder="Выберите вариант" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">AI не использовался</SelectItem>
            <SelectItem value="some">AI помогал частично (доработка/редактирование)</SelectItem>
            <SelectItem value="all">Обложка целиком сгенерирована AI</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground/80 mt-1">
          DSP-платформы (Spotify, Apple Music) требуют явного раскрытия использования AI.
        </p>
      </FormField>

      {/* Переводы метаданных — необязательное многоязычие названия/версии. */}
      <div className="space-y-2 p-3 rounded-md bg-background/40 border border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <FieldLabel className="text-sm">Переводы метаданных</FieldLabel>
            <p className="text-[11px] text-muted-foreground">
              Дополнительные локализации названия и версии релиза. Необязательно.
            </p>
          </div>
          <Button
            type="button" variant="outline" size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setForm((p) => ({ ...p, translations: [...p.translations, { language: "", title: "", version: null }] }))}
          >
            <Plus className="h-3 w-3 mr-1" /> Добавить перевод
          </Button>
        </div>
        {form.translations.length === 0 && (
          <div className="text-[11px] text-muted-foreground/70 italic">Переводов пока нет.</div>
        )}
        {form.translations.map((tr, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_160px_auto] gap-2 items-start">
            <Select
              value={tr.language || ""}
              onValueChange={(v) => setForm((p) => {
                const next = [...p.translations];
                next[i] = { ...next[i], language: v };
                return { ...p, translations: next };
              })}
            >
              <SelectTrigger className="bg-background/60 h-9 text-sm"><SelectValue placeholder="Язык" /></SelectTrigger>
              <SelectContent>
                {META_LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={tr.title}
              onChange={(e) => setForm((p) => {
                const next = [...p.translations];
                next[i] = { ...next[i], title: e.target.value };
                return { ...p, translations: next };
              })}
              placeholder="Переведённое название"
              className="bg-background/60 h-9 text-sm"
            />
            <Input
              value={tr.version || ""}
              onChange={(e) => setForm((p) => {
                const next = [...p.translations];
                next[i] = { ...next[i], version: e.target.value };
                return { ...p, translations: next };
              })}
              placeholder="Версия (опц.)"
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
        <Button variant="outline" onClick={onCancel} disabled={updateRelease.isPending}>Отмена</Button>
        <Button onClick={onSave} disabled={updateRelease.isPending}>
          {updateRelease.isPending ? "Сохраняем…" : "Сохранить изменения"}
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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const handleDelete = async () => {
    setPending(true);
    try {
      await adminApi(`/api/releases/${releaseId}`, { method: "DELETE" });
      toast({ title: "Релиз удалён", description: `«${releaseTitle}» был удалён.` });
      onDeleted();
    } catch (e: any) {
      toast({ title: "Не удалось удалить", description: e?.message ?? "Ошибка", variant: "destructive" });
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
        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete release
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить релиз?</DialogTitle>
            <DialogDescription>
              Вы собираетесь удалить релиз <span className="font-semibold text-foreground">«{releaseTitle}»</span>.
              Это действие необратимо — все треки, метаданные и файлы этого релиза будут удалены.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Удаляю…</> : "Да, удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

function TrackRow({
  t, index, release, onChange,
}: { t: Track; index: number; release: any; onChange: () => void }) {
  const deleteTrack = useDeleteTrack();
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
  const explicitLabel = explicitSt === "explicit" ? "Explicit" : explicitSt === "censored" ? "Censored" : explicitSt === "non_explicit" ? "Non-explicit" : DASH;
  const previewStart  = (t as any).clipStartSeconds ?? 0;
  const previewMm     = Math.floor(previewStart / 60);
  const previewSs     = String(previewStart % 60).padStart(2, "0");

  return (
    <Card id={`track-${t.id}`} className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
      {/* Card header: Track N · Show Issues | Delete | Edit */}
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Track {index + 1}</CardTitle>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            Show Issues
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            className="border-rose-500/30 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 h-8 px-3 text-xs"
            onClick={async () => {
              if (!confirm(`Delete track "${t.title || `#${index + 1}`}"?`)) return;
              await deleteTrack.mutateAsync({ id: t.id });
              toast({ title: "Track deleted" });
              onChange();
            }}
            disabled={deleteTrack.isPending}
          >
            Delete
          </Button>
          {release.isEditable && (
            <Link href={`/releases/${release.id}/tracks/${t.id}/edit`}>
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs bg-card">
                Edit
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Row 1: Track Title / Mix Version / Metadata Language */}
        <div className="grid grid-cols-3 gap-4">
          <TrackField label="Track Title" value={t.title || DASH} />
          <TrackField label="Mix Version" value={trackVer || DASH} />
          <TrackField label="Metadata Language" value={t.language || DASH} />
        </div>

        {/* Row 2: Primary Artist */}
        <div>
          <TrackField
            label="Primary"
            value={primaries.length ? primaries.map(p => p.name).join(", ") : (release.artistName || DASH)}
            chip
          />
        </div>

        {/* Row 3: Featuring / Remixer */}
        <div className="grid grid-cols-2 gap-4">
          <TrackField label="Featuring" value={namesOrDash(featurings)} />
          <TrackField label="Remixer" value={namesOrDash(remixers)} />
        </div>

        {/* Row 4: 4-col contributors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <TrackField label="Explicit status" value={explicitLabel} />
          <TrackField label="Writers" value={writers.length ? writers.map((w: any) => w.name).join(", ") : DASH} />
          <TrackField
            label="Performers/Production"
            value={
              performers.length + production.length === 0
                ? DASH
                : [...performers, ...production].map((p: any) => p.name).join(", ")
            }
          />
          <div className="space-y-0.5">
            <div className="text-[11px] text-muted-foreground">Lyrics</div>
            <div className="text-sm font-medium text-foreground">
              {audioStyle === "instrumental" ? "Instrumental" : (t as any).lyrics ? "Has lyrics" : DASH}
            </div>
            {audioStyle === "instrumental" && (
              <div className="text-[11px] text-muted-foreground">No Lyrics</div>
            )}
          </div>
        </div>

        {/* Row 5: Genre / Subgenre */}
        <div className="grid grid-cols-2 gap-4">
          <TrackField label="Genre" value={t.genre || DASH} />
          <TrackField label="Subgenre" value={(t as any).subgenre || DASH} />
        </div>

        {/* Row 6-8: Recorded / ISRC / Stereo AI Use */}
        <div className="grid grid-cols-3 gap-4">
          <TrackField label="Recorded" value={recYear ? String(recYear) : DASH} />
          <TrackField label="ISRC" value={t.isrc ? <span className="font-mono text-xs">{t.isrc}</span> : DASH} />
          <TrackField
            label="Stereo AI Use"
            value={(t as any).aiUsage === "some" ? "Some" : (t as any).aiUsage === "all" ? "All" : DASH}
          />
        </div>

        {/* Footer: audio status + preview start */}
        <div className="pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground/70">
          <span>{t.audioUrl ? "Audio file linked" : "No audio file linked"}</span>
          <span>Preview Start Time: {previewMm}:{previewSs}:00</span>
        </div>
      </CardContent>
    </Card>
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
  const updateStatus = useUpdateReleaseStatus();
  const [confirmed, setConfirmed] = useState(false);
  const isAlreadyDraft = currentStatus === "draft";

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>{isAlreadyDraft ? "Редактирование черновика" : "Перевести релиз в редактирование"}</DialogTitle>
        <DialogDescription>
          {isAlreadyDraft
            ? `Релиз «${title}» уже в статусе черновика — все поля можно править прямо на этой странице.`
            : `Перевод «${title}» в режим редактирования позволит:`}
        </DialogDescription>
      </DialogHeader>
      {!isAlreadyDraft && (
        <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
          <li>Внести новые метаданные (контрибьюторы и пр.)</li>
          <li>Исправить ошибки в метаданных</li>
          <li>Заменить повреждённое аудио / обложку</li>
          <li>Добавить DSP-площадки</li>
        </ul>
      )}
      <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 text-amber-300/90">
        <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Важно:</span>
        Имя основного артиста изменить нельзя. Чтобы поменять его, снимите релиз с публикации и создайте новый.
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Ваша ответственность:</div>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>Внести нужные правки в релиз.</li>
          <li>Перезалить аудио / обложку, если Tajik Music больше не имеет к ним доступа.</li>
          <li>Отправить отредактированный релиз на модерацию. После одобрения мы доставим его на все DSP.</li>
        </ol>
      </div>
      {!isAlreadyDraft && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
          Подтверждаю перевод в редактирование
        </label>
      )}
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>{isAlreadyDraft ? "Закрыть" : "Отмена"}</Button>
        {isAlreadyDraft ? (
          <Button onClick={onClose}>Понятно, редактирую</Button>
        ) : (
          <Button
            disabled={!confirmed || updateStatus.isPending}
            onClick={async () => {
              try {
                await updateStatus.mutateAsync({ id: releaseId, data: { status: "draft", note: "Edit requested" } });
                toast({ title: "Релиз переведён в редактирование", description: "Можете вносить изменения." });
                onClose();
              } catch (e) {
                toast({ variant: "destructive", title: "Не удалось перевести релиз", description: (e as Error).message });
              }
            }}
          >
            Перевести в редактирование
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
      const k = SECTION_LABEL[it.section] || it.section;
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
        <DialogTitle>{isResubmit ? "Повторная отправка на модерацию" : "Отправить релиз на модерацию"}</DialogTitle>
        <DialogDescription>
          {isResubmit
            ? `«${release.title}» был отклонён ранее. После повторной отправки релиз снова попадёт в очередь модератора.`
            : `«${release.title}» будет передан модератору для проверки. Пока релиз на модерации, редактирование закрыто.`}
        </DialogDescription>
      </DialogHeader>

      {/* Preflight статус */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Проверка готовности</div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/40 disabled:opacity-50"
          >
            <RefreshCw className={"h-3 w-3 " + (loading ? "animate-spin" : "")} /> Перепроверить
          </button>
        </div>

        {loading && !issues && (
          <div className="text-xs text-muted-foreground py-4 text-center">Проверяем релиз…</div>
        )}

        {loadErr && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
            Не удалось проверить: {loadErr}
          </div>
        )}

        {issues && errors.length === 0 && warnings.length === 0 && (
          <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Релиз готов к отправке — замечаний нет.
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-rose-300/90 font-semibold">
              Ошибки ({errors.length}) — нужно исправить
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
                        title="Перейти к проблемному полю"
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
              Предупреждения ({warnings.length}) — можно отправить, но рекомендуется исправить
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
                        title="Перейти к полю"
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
          <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Внимание:</span>
          После отправки релиз будет заблокирован для редактирования до решения модератора.
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
            Вижу предупреждения ({warnings.length}) и всё равно хочу отправить релиз на модерацию.
          </label>
        )}
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer leading-snug">
          <Checkbox
            className="mt-0.5"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
            disabled={loading || errors.length > 0}
          />
          Подтверждаю отправку на модерацию.
        </label>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button
          disabled={!canSubmit || submit.isPending}
          onClick={async () => {
            try {
              await submit.mutateAsync({ id: releaseId });
              toast({
                title: isResubmit ? "Отправлено на повторную модерацию" : "Отправлено на модерацию",
                description: "Модератор получил уведомление. Вы узнаете о решении.",
              });
              onClose();
            } catch (e) {
              // 409 от backend — клиентский preflight разошёлся с серверным (race).
              const err = e as { response?: { data?: { error?: string; missing?: string[] } }; message?: string };
              const data = err?.response?.data;
              const missing = data?.missing?.length ? ` Не хватает: ${data.missing.join(", ")}.` : "";
              toast({
                title: "Не удалось отправить",
                description: (data?.error ?? err?.message ?? "Неизвестная ошибка") + missing,
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
  // Когда бэкенд вернул 409 label_blocked_too_many_strikes — показываем
  // подтверждение перед повторной отправкой с force=true.
  const [strikeBlock, setStrikeBlock] = useState<null | {
    labelName: string; copyrightStrikes: number; threshold: number; targets: DeliveryTarget[];
  }>(null);

  const toggle = (code: DeliveryTarget) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(DELIVER_TARGETS.map((t) => t.code)));
  const clearAll = () => setSelected(new Set());

  const sendDelivery = async (targets: DeliveryTarget[], force: boolean) => {
    // Используем direct fetch (а не useDeliverRelease.mutateAsync), чтобы
    // получить доступ к телу 409-ответа и понять причину блокировки.
    const resp = await fetch(`/api/releases/${releaseId}/deliver`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets, ddexVersion: "4.3", force }),
    });
    if (resp.status === 409) {
      const body = await resp.json().catch(() => ({}));
      if (body?.error === "label_blocked_too_many_strikes") {
        setStrikeBlock({
          labelName: body.labelName ?? "—",
          copyrightStrikes: body.copyrightStrikes ?? 0,
          threshold: body.threshold ?? 3,
          targets,
        });
        return;
      }
      throw new Error(body?.error || body?.message || `HTTP 409`);
    }
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body?.error || body?.message || `HTTP ${resp.status}`);
    }
    const res = await resp.json();
    toast({
      title: "Доставка поставлена в очередь",
      description: `${res.jobs.length} job${res.jobs.length === 1 ? "" : "s"} → DDEX ERN 4.3. Прогресс — на /distribution.`,
    });
    onClose();
  };

  const submit = async () => {
    const targets = Array.from(selected);
    if (targets.length === 0) return;
    try {
      await sendDelivery(targets, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Ошибка отгрузки", description: msg, variant: "destructive" });
    }
  };

  // ── Сценарий блокировки лейбла: подтверждаем и повторяем с force=true ──
  if (strikeBlock) {
    return (
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="h-5 w-5" />
            Внимание: лейбл заблокирован
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <p>
              У лейбла <strong className="text-foreground">«{strikeBlock.labelName}»</strong> накоплено{" "}
              <span className="font-mono text-rose-400">{strikeBlock.copyrightStrikes}</span>{" "}
              копирайт-страйков от DSP (порог: {strikeBlock.threshold}).
            </p>
            <p>
              Повторная отгрузка может привести к ещё одному отказу и пометке лейбла как
              ненадёжного. Вы уверены, что хотите продолжить?
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setStrikeBlock(null)}>Отмена</Button>
          <Button
            variant="destructive"
            disabled={deliver.isPending}
            onClick={async () => {
              try {
                await sendDelivery(strikeBlock.targets, true);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                toast({ title: "Ошибка отгрузки", description: msg, variant: "destructive" });
                setStrikeBlock(null);
              }
            }}
          >
            <Send className="mr-2 h-4 w-4" />
            Подтвердить и отгрузить
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

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

// ─── Release Hub Sidebar (sticky правая колонка, Symphonic-стиль) ────────
// Содержит: статус релиза, основные действия (Submit/Deliver/Take Down/Edit),
// и панель "Show Issues" с живой подгрузкой проверок с сервера.
function ReleaseHubSidebar({
  release, user, onEditClick, metaEditing,
  onSubmitClick, onDeliverClick, onTakedownClick, onContinueWizard,
  onJumpToIssue,
}: {
  release: ReleaseDetail;
  user: { role?: string } | null;
  onEditClick: () => void;
  metaEditing: boolean;
  onSubmitClick: () => void;
  onDeliverClick: () => void;
  onTakedownClick: () => void;
  onContinueWizard: () => void;
  onJumpToIssue: (issue: IssueItem) => void;
}) {
  return (
    <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto flex flex-col gap-4 pr-1">
      {/* Статус + дата */}
      <Card className="bg-card/70 backdrop-blur border-border/60">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Статус</span>
            <StatusBadge status={release.status} className="text-xs" />
          </div>
          <div className="text-[11px] text-muted-foreground">
            Обновлён {new Date(release.updatedAt).toLocaleString("ru-RU")}
          </div>
          {release.upc ? (
            <div className="text-[11px] text-muted-foreground">UPC <span className="font-mono text-foreground">{release.upc}</span></div>
          ) : (
            <div className="text-[11px] text-muted-foreground">UPC будет присвоен на отправке</div>
          )}
        </CardContent>
      </Card>

      {/* Действия */}
      <Card className="bg-card/70 backdrop-blur border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Действия</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-2">
          {release.canSubmit && (
            <Button
              className="w-full bg-gradient-to-r from-primary to-violet-500 hover:opacity-95"
              onClick={onSubmitClick}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> Отправить на модерацию
            </Button>
          )}
          {user && (user.role === "admin" || user.role === "manager") && release.canDeliver && (
            <Button
              variant="outline"
              className="w-full bg-card border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
              onClick={onDeliverClick}
            >
              <Send className="mr-2 h-4 w-4" /> Доставить на DSP
            </Button>
          )}
          {release.isEditable ? (
            <>
              <Button
                variant="outline"
                className={"w-full " + (metaEditing ? "bg-primary/15 border-primary/40 text-primary" : "bg-card")}
                onClick={onEditClick}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                {release.status === "draft"
                  ? (metaEditing ? "Завершить редактирование" : "Редактировать детали")
                  : "Edit Release"}
              </Button>
              {release.status === "draft" && (
                <Button
                  variant="ghost"
                  className="w-full text-xs h-8 text-muted-foreground hover:text-foreground"
                  onClick={onContinueWizard}
                >
                  Открыть полный мастер →
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" disabled className="w-full bg-card opacity-60 cursor-not-allowed">
              <Lock className="mr-2 h-4 w-4" /> Редактирование закрыто
            </Button>
          )}
          {release.allowedTransitions.includes("takedown_requested") && (
            <Button
              variant="outline"
              className="w-full bg-card border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
              onClick={onTakedownClick}
            >
              <XCircle className="mr-2 h-4 w-4" /> Запрос на снятие
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Show Issues — комплексная проверка готовности */}
      <ShowIssuesPanel
        releaseId={release.id}
        status={release.status}
        updatedAt={String(release.updatedAt)}
        onJump={onJumpToIssue}
      />
    </div>
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
      const k = SECTION_LABEL[it.section] || it.section;
      (map[k] ||= []).push(it);
    }
    return Object.entries(map);
  };

  return (
    <Card className="bg-card/70 backdrop-blur border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Show Issues
        </CardTitle>
        <button
          onClick={() => void refresh()}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/40"
          title="Перепроверить"
          disabled={loading}
        >
          <RefreshCw className={"h-3 w-3 " + (loading ? "animate-spin" : "")} /> Обновить
        </button>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {loading && !data && <div className="text-xs text-muted-foreground">Проверяем…</div>}
        {error && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
            Не удалось проверить: {error}
          </div>
        )}
        {data && data.ok && (
          <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Релиз готов к отправке — критичных замечаний нет.
          </div>
        )}
        {errors.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-rose-300/90 font-semibold">
              Ошибки ({errors.length})
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
                        title={onJump ? "Перейти к проблемному полю" : undefined}
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
              Предупреждения ({warnings.length})
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
                        title={onJump ? "Перейти к проблемному полю" : undefined}
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

const SECTION_LABEL: Record<string, string> = {
  release: "Релиз",
  tracks:  "Треки",
  delivery: "Доставка",
  splits:  "SplitShare",
  contributors: "Соавторы",
};

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
        title: "Трек добавлен",
        description: `«${src.title}» переиспользован из релиза «${src.releaseTitle}».`,
      });
      onReused();
      setOpen(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Не удалось добавить трек",
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
            <Database className="h-3.5 w-3.5 mr-1" /> Использовать существующий
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Переиспользовать трек</DialogTitle>
          <DialogDescription>
            Выберите трек из ранее одобренных релизов лейбла, чтобы добавить его
            в «{currentReleaseTitle}» (например, для сборника или перевыпуска).
            Метаданные (название, ISRC) скопируются, дальше их можно редактировать.
            Аудиофайл переиспользуется по ссылке — если исходный трек будет удалён,
            рекомендуется перезалить аудио на новый трек.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="Поиск по названию или ISRC…"
            className="bg-background/40"
          />
          <Button variant="outline" onClick={() => void search()} disabled={loading}>
            <ScanSearch className={"h-4 w-4 mr-1 " + (loading ? "animate-spin" : "")} />
            Найти
          </Button>
        </div>

        <div className="max-h-[420px] overflow-y-auto -mx-2 px-2 mt-2 space-y-2">
          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}
          {loading && items === null && (
            <div className="text-sm text-muted-foreground py-6 text-center">Загрузка…</div>
          )}
          {items !== null && items.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border/40 rounded-md">
              Нет одобренных треков, подходящих под запрос.
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
                    {t.audioUrl ? <span className="text-emerald-400/80">аудио есть</span> : <span className="text-amber-400/80">без аудио</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => void reuse(t)}
                  disabled={busyId === t.id}
                  className="shrink-0"
                >
                  {busyId === t.id ? "Добавляем…" : "Использовать"}
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Закрыть</Button>
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
      toast({ title: "Порядок треков сохранён" });
      onSaved();
      setOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Не удалось сохранить порядок", description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="bg-card text-xs">
          <ListChecks className="h-3.5 w-3.5 mr-1" /> Порядок
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Порядок треков на релизе</DialogTitle>
          <DialogDescription>
            Перетаскивать кнопками: стрелка вверх/вниз. Этот порядок будет показан на всех DSP.
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
            <div className="text-xs text-muted-foreground text-center py-6">Треков нет.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving || order.length < 2}>
            {saving ? "Сохраняю…" : "Сохранить порядок"}
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
      toast({ title: "Сначала выберите треки", variant: "destructive" });
      return;
    }
    if (!genre && !language && !explicit && !ai) {
      toast({ title: "Нечего применять", description: "Заполните хотя бы одно поле." });
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
      toast({ title: "Обновлено", description: `Изменения применены к ${ok} ${ok === 1 ? "треку" : "трекам"}.` });
    } else {
      toast({
        variant: "destructive",
        title: `Не удалось обновить ${fail} из ${ok + fail}`,
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
          <Pencil className="h-3.5 w-3.5 mr-1" /> Массовое редактирование
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Массовое редактирование треков</DialogTitle>
          <DialogDescription>
            Выберите треки, заполните только те поля, которые нужно поменять — остальные останутся как были.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border border-border/50 rounded-md bg-background/30">
            <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
              <Checkbox checked={allOn} onCheckedChange={toggleAll} />
              <span className="text-xs text-muted-foreground">
                {selected.size === 0 ? "Выбрать все" : `Выбрано ${selected.size} из ${tracks.length}`}
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
                <div className="text-xs text-muted-foreground text-center py-4">Треков нет.</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel className="text-xs">Жанр</FieldLabel>
              <Select value={genre || "none"} onValueChange={(v) => setGenre(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="— не менять" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— не менять</SelectItem>
                  {META_GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel className="text-xs">Язык метаданных</FieldLabel>
              <Select value={language || "none"} onValueChange={(v) => setLanguage(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="— не менять" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— не менять</SelectItem>
                  {["Tajik","Russian","English","Persian","Uzbek","Arabic","Turkish"].map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel className="text-xs">Explicit</FieldLabel>
              <Select value={explicit || "none"} onValueChange={(v) => setExplicit(v === "none" ? "" : (v as any))}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="— не менять" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— не менять</SelectItem>
                  <SelectItem value="non_explicit">Чистая версия</SelectItem>
                  <SelectItem value="explicit">EXPLICIT</SelectItem>
                  <SelectItem value="censored">Цензурированная</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel className="text-xs">AI</FieldLabel>
              <Select value={ai || "__keep"} onValueChange={(v) => setAi(v === "__keep" ? "" : (v as any))}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="— не менять" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep">— не менять</SelectItem>
                  <SelectItem value="none">Без AI</SelectItem>
                  <SelectItem value="some">Частично</SelectItem>
                  <SelectItem value="all">Полностью AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Сохраняю…" : `Применить (${selected.size})`}
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
  const { data: serverDsps = [] } = useGetReleaseDsps(release.id);
  const [showIssues, setShowIssues] = useState(false);

  const dateLabel = release.releaseDate ? String(release.releaseDate).slice(0, 10) : "XXXX-XX-XX";
  const timeLabel = formatReleaseTime(release.releaseTime);
  const territories = release.territories ?? [];
  const isWorldWide = territories.includes("WW");
  const territoryLabel = isWorldWide
    ? "World Wide (весь мир)"
    : territories.length > 0
      ? territories.join(", ")
      : "Не выбрано";
  const storeCount = serverDsps.length;

  const issues: string[] = [];
  if (!release.releaseDate) {
    issues.push("Не указана дата выхода релиза.");
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rd = new Date(`${String(release.releaseDate).slice(0, 10)}T00:00:00`);
    if (rd < today) issues.push("Дата выхода релиза находится в прошлом.");
  }
  if (!isWorldWide && territories.length === 0) issues.push("Не выбраны территории распространения.");
  if (storeCount === 0) issues.push("Не выбраны площадки (магазины) для дистрибуции.");

  return (
    <section id="card-availability" className="space-y-3 scroll-mt-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-bold">Release Availability</h2>
        {issues.length > 0 && (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <Button
              variant={showIssues ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowIssues((v) => !v)}
            >
              {showIssues ? "Скрыть проблемы" : `Показать проблемы (${issues.length})`}
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
              <h3 className="text-lg font-bold">Timeline</h3>
              <div className="text-sm">
                <span className="font-medium">{dateLabel}</span>
                <span className="text-muted-foreground"> general release at {timeLabel} (UTC)</span>
              </div>
            </div>
            {isEditable && (
              <Button variant="outline" size="sm" className="bg-card text-xs shrink-0" onClick={onEdit}>
                <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            )}
          </div>

          <div className="space-y-1 border-t border-border/30 pt-4">
            <h3 className="text-lg font-bold">Territory Rights</h3>
            <div className="text-sm text-muted-foreground">{territoryLabel}</div>
          </div>

          <div className="space-y-1 border-t border-border/30 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stores</h3>
            <div className="text-sm text-muted-foreground">
              {storeCount > 0
                ? `${storeCount} ${storeCount === 1 ? "площадка выбрана" : "площадок выбрано"}`
                : "Площадки не выбраны"}
            </div>
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
        ? "Не назначено"
        : assignedCount === tracks.length
          ? "Назначено"
          : `${assignedCount}/${tracks.length} назначено`;

  return (
    <section id="card-splitshare" className="space-y-3 scroll-mt-4">
      <h2 className="text-lg font-bold">
        SplitShare Setup{" "}
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">— Опционально</span>
      </h2>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <span className="h-10 w-10 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Share2 className="h-5 w-5 text-emerald-400" />
            </span>
            <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
              SplitShare автоматически рассчитывает доли роялти для ваших соавторов и переводит
              выплаты на их счета. Назначьте трекам сплит, чтобы доход делился автоматически.
            </p>
            <Button variant="outline" size="sm" className="bg-card text-xs shrink-0" onClick={onEdit}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </div>

          {tracks.length > 0 && unassignedCount > 0 && (
            <p className="border-t border-border/30 pt-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {unassignedCount} / {tracks.length} {tracks.length === 1 ? "трек" : "треков"} не назначены на сплит.
              </span>{" "}
              Треки без сплита будут добавлены в сплит при одобрении релиза. Рекомендуем назначить
              сплиты в течение 45 дней после выхода релиза.
            </p>
          )}

          <div className="grid grid-cols-3 gap-4 border-t border-border/30 pt-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Сплит</div>
              <div className="text-sm font-semibold">{splitStatus}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Участники</div>
              <div className="text-sm font-semibold">{shareholders.size > 0 ? shareholders.size : "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Кол-во треков</div>
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
              <div className="font-bold text-lg text-foreground">Переиспользовать существующий трек</div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Возьмите трек из ранее одобренного релиза — например, для сборника или перевыпуска.
                Аудио и метаданные подтянутся автоматически.
              </p>
              <div className="mt-4">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border/60 text-sm">
                  <Database className="h-4 w-4" /> Выбрать трек
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
        const baseTitle = f.name.replace(/\.[^.]+$/, "").trim() || `Track ${startTrackNumber + i}`;
        await createTrack.mutateAsync({
          data: {
            title: baseTitle,
            artistId, releaseId,
            trackNumber: startTrackNumber + i,
            language: defaultLanguage,
            genre: defaultGenre,
            audioUrl: asset.objectPath,
            durationSeconds: asset.durationSeconds ?? null,
          },
        });
        okCount++;
      } catch (e: any) {
        toast({
          title: `Не удалось загрузить «${f.name}»`,
          description: e?.message ?? "Ошибка",
          variant: "destructive",
        });
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setBusy(false);
    setProgress(null);
    if (okCount > 0) {
      toast({ title: "Загрузка завершена", description: `Добавлено треков: ${okCount} из ${list.length}.` });
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
          ? `Загрузка ${progress.done}/${progress.total}…`
          : "Загрузить аудио"}
      </Button>
    </>
  );
}
