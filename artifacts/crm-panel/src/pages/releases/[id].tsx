import { Layout } from "@/components/layout";
import {
  useGetRelease, useUpdateReleaseStatus, useUpdateRelease, useCreateTrack, useDeleteTrack,
  useDeliverRelease, useSubmitReleaseForReview,
  useUpdateTrack, useGetReleaseDsps, useUpdateReleaseDsps, useListSplits,
  getGetReleaseQueryKey, getListReleasesQueryKey, getGetReleaseCountsQueryKey,
  getListDeliveriesQueryKey,
  type Track, type DeliveryTarget,
  type ReleaseDetail, type CreateReleaseBody, type Split,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ImageIcon, Edit3, XCircle, Globe2, Music2, AlertTriangle,
  Calendar, Plus, Trash2, Send, ShieldCheck, Lock, CheckCircle2, Clock,
  ShieldAlert, ScanSearch, Database, Activity, ListChecks, Share2, RefreshCw, Pencil,
} from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { CoverUploader, AudioUploader, assetHref } from "@/components/asset-uploader";
import { BulkTracksDialog } from "@/components/bulk-tracks-dialog";
import { useState, useEffect, useMemo } from "react";
import { DspPickerDialog } from "@/components/release-wizard/dsp-picker";
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

        <div>
          <h1 className="text-2xl font-bold tracking-tight">{release.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Просмотрите релиз перед отправкой на проверку. Все обязательные поля и предупреждения собраны справа в «Show Issues».
          </p>
        </div>

        {/* ── Symphonic-style Release Hub: 2-колоночная сетка ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
          {/* ── ЛЕВАЯ КОЛОНКА: контент релиза ─────────────────────────────── */}
          <div className="flex flex-col gap-5 min-w-0">
        {/* Старая верхняя панель действий — отключена. Все действия переехали
            в правую колонку «Release Hub». Блок ниже скрыт, чтобы сохранить
            обработчики (submitOpen/deliverOpen/takedownOpen/editOpen) для
            существующих диалогов без переписывания. */}
        <div className="hidden" aria-hidden>
          <div className="flex gap-2 flex-wrap">
            {/* Send to Moderation: только из draft/rejected, доступно владельцу */}
            {release.canSubmit && (
              <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-primary to-violet-500 hover:opacity-95">
                    <ShieldCheck className="mr-2 h-4 w-4" /> Send to Moderation
                  </Button>
                </DialogTrigger>
                {/* Mount only when open: гарантирует свежий fetch /issues при каждом открытии. */}
                {submitOpen && (
                  <SubmitForReviewDialog
                    releaseId={id}
                    release={release}
                    enableEditing={() => setMetaEditing(true)}
                    onClose={() => { setSubmitOpen(false); invalidateAll(); }}
                  />
                )}
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
            {/* Edit Release:
                - draft: одной кнопкой включаем инлайн-редактирование метаданных
                  прямо в карточке Release Details. Никаких диалогов и смены статуса.
                - rejected: показываем диалог с подтверждением и переходом rejected→draft.
                - всё остальное (live/approved/etc): кнопка Edit Locked. */}
            {release.isEditable ? (
              release.status === "draft" ? (
                <>
                  <Button
                    variant="default"
                    onClick={() => setLocation(`/releases/${id}/edit`)}
                    title="Полный 4-шаговый мастер редактирования"
                  >
                    <Edit3 className="mr-2 h-4 w-4" /> Продолжить в мастере
                  </Button>
                  <Button
                    variant="outline"
                    className={metaEditing ? "bg-primary/15 border-primary/40 text-primary" : "bg-card"}
                    onClick={() => setMetaEditing((v) => !v)}
                    title="Быстрое редактирование основных полей в карточке"
                  >
                    <Edit3 className="mr-2 h-4 w-4" />
                    {metaEditing ? "Завершить" : "Быстрое ред."}
                  </Button>
                </>
              ) : (
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="bg-card">
                      <Edit3 className="mr-2 h-4 w-4" /> Edit Release
                    </Button>
                  </DialogTrigger>
                  <EditReleaseDialog
                    releaseId={id}
                    title={release.title}
                    currentStatus={release.status}
                    onClose={() => { setEditOpen(false); invalidateAll(); }}
                  />
                </Dialog>
              )
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

        {/* Risk panel — модератор/админ видит композитную оценку и факторы.
            Артист тоже видит, но только в read-only — кнопки сканов скрыты. */}
        <RiskPanel release={release} onChanged={invalidateAll} />

        {/* Release Details */}
        <Card id="card-release-details" className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Release Details</CardTitle>
            {metaEditing && (
              <span className="text-[11px] text-primary/90 bg-primary/10 border border-primary/30 rounded px-2 py-0.5">
                Режим редактирования
              </span>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
            {metaEditing ? (
              <EditDetailsForm
                release={release}
                onCancel={() => setMetaEditing(false)}
                onSaved={() => { setMetaEditing(false); invalidateAll(); }}
              />
            ) : (
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
                  <KV
                    label="AI Cover"
                    value={
                      (release as any).coverAiUsage === "none" ? "AI не использовался"
                      : (release as any).coverAiUsage === "some" ? "AI частично"
                      : (release as any).coverAiUsage === "all"  ? "Полностью AI"
                      : "Не указано"
                    }
                  />
                </div>
                {Array.isArray((release as any).metadataTranslations) && (release as any).metadataTranslations.length > 0 && (
                  <div className="pt-3 mt-1 border-t border-border/40">
                    <div className="text-xs text-muted-foreground mb-1.5">Переводы метаданных</div>
                    <ul className="space-y-1">
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
            <CoverUploader
              value={release.coverUrl ?? null}
              releaseId={id}
              attach
              onChange={() => invalidateAll()}
            />
          </CardContent>
        </Card>

        {/* Tracks */}
        <Card id="card-tracks" className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Music2 className="h-4 w-4" /> Треки ({release.tracks?.length ?? 0})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {release.isEditable && (release.tracks?.length ?? 0) > 1 && (
                <ReorderTracksDialog
                  releaseId={release.id}
                  tracks={release.tracks ?? []}
                  onSaved={invalidateAll}
                />
              )}
              {release.isEditable && (release.tracks?.length ?? 0) > 0 && (
                <MultiEditTracksDialog
                  tracks={release.tracks ?? []}
                  onSaved={invalidateAll}
                />
              )}
              {release.isEditable && (
                <ReuseExistingTrackDialog
                  releaseId={id}
                  releaseArtistId={release.artistId}
                  currentReleaseTitle={release.title}
                  nextTrackNumber={(release.tracks?.length ?? 0) + 1}
                  onReused={invalidateAll}
                />
              )}
              <BulkTracksDialog
                releaseId={id}
                artistId={release.artistId}
                defaultLanguage={release.language || "Tajik"}
                defaultGenre={release.genre || "Pop"}
                startTrackNumber={(release.tracks?.length ?? 0) + 1}
                onUploaded={invalidateAll}
              />
            </div>
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

        {/* Release Availability — реальный редактор DSP (Фаза 6) */}
        <ReleaseAvailabilityCard release={release} isEditable={!!release.isEditable} />

        {/* SplitShare — реальная сводка по трекам (Фаза 6) */}
        <SplitShareCard release={release} />
          </div>
          {/* ── ПРАВАЯ КОЛОНКА: sticky sidebar ─────────────────────────────── */}
          <ReleaseHubSidebar
            release={release}
            user={user}
            onEditClick={() => {
              if (release.status === "draft") setMetaEditing((v) => !v);
              else setEditOpen(true);
            }}
            metaEditing={metaEditing}
            onSubmitClick={() => setSubmitOpen(true)}
            onDeliverClick={() => setDeliverOpen(true)}
            onTakedownClick={() => setTakedownOpen(true)}
            onContinueWizard={() => setLocation(`/releases/${id}/edit`)}
            onJumpToIssue={(issue) => {
              jumpToIssue(issue, {
                releaseId: id,
                isDraft: release.status === "draft",
                enableEditing: () => setMetaEditing(true),
                navigate: (path) => setLocation(path),
              });
            }}
          />
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
    const territories = form.territories
      .split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    // UpdateReleaseBody на бэке требует title/releaseType/artistId; labelId/coverUrl — nullable.
    // Для не-привилегированных пользователей бэк отклоняет смену artistId/labelId,
    // поэтому подставляем существующие значения релиза без изменений.
    // Чистим переводы: убираем пустые ряды (без language или без title).
    const translations = form.translations
      .map((t) => ({ language: (t.language || "").trim(), title: (t.title || "").trim(), version: (t.version || "").trim() || null }))
      .filter((t) => t.language && t.title);
    const data: CreateReleaseBody = {
      title:       form.title.trim(),
      releaseType: form.releaseType as CreateReleaseBody["releaseType"],
      artistId:    release.artistId,
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
              <SelectTrigger className="bg-background/60 h-9 text-xs"><SelectValue placeholder="Язык" /></SelectTrigger>
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
              className="bg-background/60 h-9 text-xs"
            />
            <Input
              value={tr.version || ""}
              onChange={(e) => setForm((p) => {
                const next = [...p.translations];
                next[i] = { ...next[i], version: e.target.value };
                return { ...p, translations: next };
              })}
              placeholder="Версия (опц.)"
              className="bg-background/60 h-9 text-xs"
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
      <FieldLabel className="text-xs text-muted-foreground">{label}</FieldLabel>
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
    <div id={`track-${t.id}`} className="rounded-md border border-border/50 bg-background/40 p-4 space-y-3 scroll-mt-4 transition-shadow">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-semibold text-sm flex items-center gap-2">
          <span className="text-muted-foreground">Трек {index + 1}</span>
          <span className="text-foreground">· {t.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            Язык: <span className="text-foreground">{t.language || "—"}</span>
          </div>
          {release.isEditable && (
            <Link href={`/releases/${release.id}/tracks/${t.id}/edit`}>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Pencil className="h-3.5 w-3.5 mr-1" /> Редактировать
              </Button>
            </Link>
          )}
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

// ─── Risk Panel ─────────────────────────────────────────────────────────────
// Композитная оценка риска отказа DSP. Источник истины — backend
// services/risk-engine.ts. Здесь только показываем + даём кнопки запустить
// дополнительные проверки (full multi-segment ACR scan, MusicBrainz ISRC).

interface AcrCheckRow {
  id: number;
  releaseId: number;
  trackId: number | null;
  status: string;
  mode: string | null;
  engine: string | null;
  matchedTitle: string | null;
  matchedArtist: string | null;
  matchedIsrc: string | null;
  confidence: string | null;
  errorMessage: string | null;
  scannedAt: string;
  segments: Array<{
    index: number; startPct: number; endPct: number; status: string;
    score?: number; matchedTitle?: string; matchedArtist?: string; error?: string;
  }> | null;
}

// Использую loose-тип для release: поля riskScore/riskFactors появились в
// openapi.yaml и сгенерируются в @workspace/api-client-react только при
// следующем codegen в crm-panel. До этого читаем их через `any`-каст.
function RiskPanel({ release, onChanged }: { release: ReleaseDetail; onChanged: () => void }) {
  const { user } = useAuth();
  const isModerator = user && (user.role === "admin" || user.role === "manager");
  const r = release as ReleaseDetail & {
    riskScore?: number;
    riskFactors?: Array<{ code: string; message: string; severity: "low" | "medium" | "high" }>;
  };
  const score = r.riskScore ?? 0;
  const factors = r.riskFactors ?? [];

  const [checks, setChecks] = useState<AcrCheckRow[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [scanningTrackId, setScanningTrackId] = useState<number | null>(null);
  const [scanningKind, setScanningKind] = useState<"full" | "isrc" | null>(null);

  const loadChecks = async () => {
    setLoadingChecks(true);
    try {
      const data = await adminApi<{ checks: AcrCheckRow[] }>(`/api/distribution/acr/checks?releaseId=${release.id}`);
      setChecks(data.checks ?? []);
    } catch {
      /* silent — панель деградирует, но не валится */
    } finally {
      setLoadingChecks(false);
    }
  };
  useEffect(() => { void loadChecks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [release.id, release.updatedAt]);

  const tracks = release.tracks ?? [];
  const firstTrackWithAudio = tracks.find((t) => !!t.audioUrl) ?? tracks[0];
  const tracksWithIsrc = tracks.filter((t) => !!t.isrc);

  const runFullScan = async (trackId: number) => {
    setScanningKind("full");
    setScanningTrackId(trackId);
    try {
      await adminApi(`/api/distribution/acr/scan-full`, {
        method: "POST",
        body: JSON.stringify({ releaseId: release.id, trackId }),
      });
      toast({ title: "Multi-segment ACR scan запущен", description: "Результат через ~30 сек — обновите страницу или подождите автообновления." });
      // Дёргаем checks через 4 сек, чтобы pending-row уже точно был, и потом ещё через 30
      setTimeout(() => { void loadChecks(); }, 4_000);
      setTimeout(() => { void loadChecks(); onChanged(); }, 30_000);
    } catch (e) {
      toast({ title: "ACR full-scan failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setScanningTrackId(null);
      setScanningKind(null);
    }
  };

  const runMbCheck = async (trackId: number) => {
    setScanningKind("isrc");
    setScanningTrackId(trackId);
    try {
      await adminApi(`/api/distribution/musicbrainz/check-isrc`, {
        method: "POST",
        body: JSON.stringify({ trackId }),
      });
      toast({ title: "MusicBrainz check выполнен", description: "Результат добавлен в историю проверок." });
      await loadChecks();
      onChanged();
    } catch (e) {
      toast({ title: "MusicBrainz check failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setScanningTrackId(null);
      setScanningKind(null);
    }
  };

  const scoreColor =
    score >= 70 ? "text-rose-300 bg-rose-500/15 border-rose-500/40"
    : score >= 40 ? "text-amber-300 bg-amber-500/15 border-amber-500/40"
    : "text-emerald-300 bg-emerald-500/15 border-emerald-500/40";
  const scoreLabel = score >= 70 ? "Высокий" : score >= 40 ? "Средний" : "Низкий";

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Оценка риска
        </CardTitle>
        <div className={`text-xs px-2.5 py-1 rounded-md border font-mono ${scoreColor}`}>
          {scoreLabel} · {score}/100
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Факторы риска */}
        {factors.length === 0 ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Факторов риска не обнаружено.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {factors.map((f, i) => {
              const dot = f.severity === "high" ? "bg-rose-500" : f.severity === "medium" ? "bg-amber-500" : "bg-zinc-500";
              return (
                <li key={`${f.code}-${i}`} className="flex items-start gap-2 text-sm">
                  <span className={`inline-block h-2 w-2 mt-1.5 rounded-full shrink-0 ${dot}`} />
                  <div>
                    <span className="text-foreground">{f.message}</span>
                    <span className="text-[10px] text-muted-foreground font-mono ml-2">[{f.code}]</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Кнопки запуска проверок — только модераторам */}
        {isModerator && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
            <Button
              size="sm"
              variant="outline"
              disabled={!firstTrackWithAudio || (scanningKind === "full" && scanningTrackId === firstTrackWithAudio?.id)}
              onClick={() => firstTrackWithAudio && runFullScan(firstTrackWithAudio.id)}
              title={firstTrackWithAudio ? `Сканировать «${firstTrackWithAudio.title}» в 5 окнах` : "Нет трека с audio_url"}
            >
              <ScanSearch className="h-3.5 w-3.5 mr-1.5" />
              {scanningKind === "full" ? "Сканируем…" : "Full multi-segment ACR"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={tracksWithIsrc.length === 0 || scanningKind === "isrc"}
              onClick={() => tracksWithIsrc[0] && runMbCheck(tracksWithIsrc[0].id)}
              title={tracksWithIsrc.length > 0 ? `Проверить ISRC ${tracksWithIsrc[0].isrc}` : "Ни у одного трека нет ISRC"}
            >
              <Database className="h-3.5 w-3.5 mr-1.5" />
              {scanningKind === "isrc" ? "Запрашиваем MB…" : "MusicBrainz ISRC check"}
            </Button>
            {tracksWithIsrc.length > 1 && (
              <span className="text-[11px] text-muted-foreground self-center">
                (проверится первый ISRC; остальные — со страницы трека позже)
              </span>
            )}
          </div>
        )}

        {/* История проверок (последние 6) с timeline для full-сканов */}
        {loadingChecks ? (
          <Skeleton className="h-12 w-full" />
        ) : checks.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Проверок ACR/MusicBrainz по этому релизу ещё не было.</div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              История проверок
            </div>
            {checks.slice(0, 6).map((c) => (
              <AcrCheckCard key={c.id} check={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AcrCheckCard({ check }: { check: AcrCheckRow }) {
  const statusBadge =
    check.status === "matched" ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
    : check.status === "clean" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : check.status === "pending" ? "bg-zinc-500/15 text-zinc-300 border-zinc-500/40"
    : "bg-amber-500/15 text-amber-300 border-amber-500/40";

  const engineLabel =
    check.engine === "musicbrainz_isrc" ? "MusicBrainz ISRC"
    : check.mode === "full" ? "ACR · multi-segment"
    : "ACR · sample";

  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded border font-mono uppercase text-[10px] ${statusBadge}`}>
            {check.status}
          </span>
          <span className="text-muted-foreground">{engineLabel}</span>
        </div>
        <span className="text-muted-foreground">{new Date(check.scannedAt).toLocaleString()}</span>
      </div>
      {check.matchedTitle && (
        <div className="text-xs">
          <span className="text-muted-foreground">Match: </span>
          <span className="text-foreground">«{check.matchedTitle}»</span>
          {check.matchedArtist && <span className="text-muted-foreground"> — {check.matchedArtist}</span>}
          {check.confidence && <span className="text-muted-foreground font-mono"> · score {check.confidence}</span>}
        </div>
      )}
      {check.errorMessage && (
        <div className="text-xs text-amber-300/90 line-clamp-2">{check.errorMessage}</div>
      )}
      {check.segments && check.segments.length > 0 && <SegmentTimeline segments={check.segments} />}
    </div>
  );
}

function SegmentTimeline({ segments }: { segments: NonNullable<AcrCheckRow["segments"]> }) {
  // Горизонтальная полоса 0..100% с зонами по startPct..endPct.
  // matched — красный, clean — зелёный, error — жёлтый.
  return (
    <div className="space-y-1">
      <div className="relative h-5 w-full rounded-sm bg-zinc-800/60 border border-border/50 overflow-hidden">
        {segments.map((s) => {
          const left = `${s.startPct}%`;
          const width = `${Math.max(2, s.endPct - s.startPct)}%`;
          const cls =
            s.status === "matched" ? "bg-rose-500/70 hover:bg-rose-500"
            : s.status === "clean" ? "bg-emerald-500/55 hover:bg-emerald-500"
            : "bg-amber-500/55 hover:bg-amber-500";
          const tip =
            s.status === "matched" ? `Сегмент ${s.startPct}-${s.endPct}%: ${s.matchedTitle ?? "?"} — ${s.matchedArtist ?? "?"} (score ${s.score ?? "?"})`
            : s.status === "clean" ? `Сегмент ${s.startPct}-${s.endPct}%: чисто`
            : `Сегмент ${s.startPct}-${s.endPct}%: ошибка ${s.error ?? ""}`;
          return (
            <div
              key={s.index}
              className={`absolute top-0 bottom-0 ${cls} border-r border-background/40 transition-colors`}
              style={{ left, width }}
              title={tip}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>0:00</span>
        <span>{segments.length} сегментов</span>
        <span>конец</span>
      </div>
    </div>
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
  releaseId, releaseArtistId, currentReleaseTitle, nextTrackNumber, onReused,
}: {
  releaseId: number;
  releaseArtistId: number;
  currentReleaseTitle: string;
  nextTrackNumber: number;
  onReused: () => void;
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
        <Button variant="outline" size="sm" className="bg-card text-xs">
          <Database className="h-3.5 w-3.5 mr-1" /> Использовать существующий
        </Button>
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

// ─── Release Availability (real) ────────────────────────────────────────
// Заменяет старую заглушку. Реально загружает выбранные DSP через
// useGetReleaseDsps, открывает DspPickerDialog и сохраняет через
// useUpdateReleaseDsps. Территории показываются read-only с подсказкой,
// что они правятся в «Деталях релиза» (там уже есть поле).
function ReleaseAvailabilityCard({ release, isEditable }: { release: ReleaseDetail; isEditable: boolean }) {
  const qc = useQueryClient();
  const { data: selected = [], refetch } = useGetReleaseDsps(release.id);
  const update = useUpdateReleaseDsps();
  const [pickerOpen, setPickerOpen] = useState(false);

  const save = async (codes: string[]) => {
    try {
      await update.mutateAsync({ id: release.id, data: { dsps: codes } });
      toast({ title: "Площадки сохранены", description: `${codes.length} DSP выбрано.` });
      // Освежаем и список DSP, и сам релиз — Show Issues и сайдбар читают его статус.
      await Promise.all([
        refetch(),
        qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(release.id) }),
      ]);
    } catch (e) {
      toast({ variant: "destructive", title: "Не удалось сохранить", description: (e as Error).message });
    }
  };

  return (
    <Card id="card-availability" className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe2 className="h-4 w-4" /> Доступность релиза
        </CardTitle>
        {isEditable && (
          <Button variant="outline" size="sm" className="bg-card text-xs" onClick={() => setPickerOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Изменить
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-4 p-3 rounded-md border border-border/50 bg-background/40">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-indigo-500/40 to-violet-500/40 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Таймлайн</span>
              <StatusBadge status={release.status} className="text-[10px] px-1.5 py-0 h-4" />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Территории: {(release.territories || ["WW"]).join(", ")}
            </div>
            <div className="text-xs text-muted-foreground">
              Выбрано площадок: {selected.length || "— не выбрано"}
            </div>
          </div>
        </div>
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selected.map((d) => <DspPill key={d} name={d} />)}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground border border-dashed border-border/40 rounded p-3 text-center">
            Площадки не выбраны. {isEditable && "Нажмите «Изменить», чтобы выбрать DSP для доставки."}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed pt-2 border-t border-border/40">
          Отправляя релиз на модерацию, вы подтверждаете, что все мастера, обложка и метаданные принадлежат вам
          или лицензированы для распространения на выбранных площадках. Tajik Music Distribution не несёт
          ответственности за претензии правообладателей по неверно заявленному контенту.
        </p>

        <DspPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={selected}
          onChange={(codes) => { void save(codes); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── SplitShare (real per-track view) ───────────────────────────────────
// Заменяет заглушку. Загружает все splits релиза одним запросом и показывает
// строку на каждый трек со статусом сплита. Создание/редактирование — только
// admin/manager через прямую ссылку на /splits (где уже есть полный редактор).
function SplitShareCard({ release }: { release: ReleaseDetail }) {
  const { data: splits } = useListSplits({ release_id: release.id, limit: 100 });
  const tracks = release.tracks ?? [];
  const byTrack = useMemo(() => {
    const m = new Map<number, Split>();
    for (const s of splits?.data ?? []) {
      if (s.trackId) m.set(s.trackId, s);
    }
    return m;
  }, [splits]);

  const splitStatus = (s: Split | undefined) => {
    if (!s) return { label: "Не настроено", tone: "amber" as const };
    const ps = s.participants ?? [];
    const total = ps.reduce((a, p) => a + (p.percentage || 0), 0);
    if (Math.abs(total - 100) > 0.01) return { label: `Сумма ${total}% ≠ 100`, tone: "rose" as const };
    const states = ps.map((p) => (p as any).acceptanceStatus ?? "pending");
    if (states.every((s) => s === "accepted")) return { label: "Подписано всеми", tone: "emerald" as const };
    if (states.some((s) => s === "rejected"))   return { label: "Отклонено", tone: "rose" as const };
    if (states.every((s) => s === "pending"))   return { label: "Ожидает подписи", tone: "amber" as const };
    return { label: "Частично подписано", tone: "amber" as const };
  };

  return (
    <Card id="card-splitshare" className="bg-card/50 backdrop-blur border-border/50 scroll-mt-4 transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Share2 className="h-4 w-4" /> SplitShare — распределение доходов
        </CardTitle>
        <Link href="/splits">
          <Button variant="outline" size="sm" className="bg-card text-xs">
            Все сплиты
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {tracks.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border/40 rounded">
            Сначала добавьте треки — сплиты настраиваются на каждом треке отдельно.
          </div>
        ) : (
          tracks.map((t) => {
            const s = byTrack.get(t.id);
            const st = splitStatus(s);
            const toneClass =
              st.tone === "emerald" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
              st.tone === "rose"    ? "bg-rose-500/15 text-rose-300 border-rose-500/30" :
                                      "bg-amber-500/15 text-amber-300 border-amber-500/30";
            return (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-md border border-border/50 bg-background/40">
                <span className="text-xs font-mono w-7 text-muted-foreground text-center">{t.trackNumber ?? "—"}</span>
                <span className="text-sm truncate flex-1">{t.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${toneClass}`}>{st.label}</span>
                {s && (
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    {s.participants.length} {s.participants.length === 1 ? "участник" : "участников"}
                  </span>
                )}
                <Link href={s ? `/splits?id=${s.id}` : `/splits?release_id=${release.id}&track_id=${t.id}`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    {s ? "Открыть" : "Создать"}
                  </Button>
                </Link>
              </div>
            );
          })
        )}
        <p className="text-[11px] text-muted-foreground/70 pt-2 border-t border-border/40">
          Сумма долей на каждом треке должна равняться 100 %. Полный редактор сплитов
          (создание, изменение, отправка соавторам на подпись) — в разделе «Сплиты».
        </p>
      </CardContent>
    </Card>
  );
}
