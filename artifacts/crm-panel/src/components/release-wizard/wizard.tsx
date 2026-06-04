import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRelease, useCreateRelease, useUpdateRelease,
  useListArtists, useListLabels,
  useListTracks, useCreateTrack,
  useGetReleaseDsps, useUpdateReleaseDsps,
  useGetReleaseArtists, useUpdateReleaseArtists,
  useValidateReleaseForSubmission, useSubmitReleaseForReview,
  getGetReleaseQueryKey, getListReleasesQueryKey, getGetReleaseCountsQueryKey,
  getListTracksQueryKey, getGetReleaseArtistsQueryKey, getGetReleaseDspsQueryKey,
  type ReleaseArtistRef,
  type ValidationIssue, type ValidationIssueSection,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useAssetUpload, assetHref } from "@/components/asset-uploader";
import { ArtistFormDialog } from "@/components/artist-form-dialog";
import { LabelFormDialog } from "@/components/label-form-dialog";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, AlertTriangle, AlertCircle,
  ListMusic, Send, Loader2, Settings2, MapPin, Calendar, Globe, Upload, ImageIcon,
} from "lucide-react";

import { RELEASE_TYPES, GENRES, SUBGENRES, LANGS, COUNTRIES, STEPS, type StepKey } from "./types";
import { MultiArtistPicker } from "./multi-artist-picker";
import { DspPickerDialog } from "./dsp-picker";
import { TrackCard } from "./track-card";
import { useLang } from "@/lib/i18n";

// ─── Form state ─────────────────────────────────────────────────────────────
type Form = {
  title: string;
  releaseVersion: string;
  releaseType: "single" | "album" | "ep" | "compilation";
  artistId: number;        // legacy "primary" — берём из artists[0]
  labelId: number | null;
  upc: string;
  catalogNumber: string;   // readonly после создания
  coverUrl: string;
  genre: string;
  subgenre: string;
  releaseDate: string;     // ISO date YYYY-MM-DD
  releaseTime: string;     // HH:MM
  language: string;
  isExplicit: boolean;
  isCompilation: boolean;
  isVariousArtists: boolean;
  pLine: string;
  pLineYear: number | null;
  cLine: string;
  cLineYear: number | null;
  coverAiUsage: "none" | "some" | "all" | null;
};

const EMPTY: Form = {
  title: "", releaseVersion: "", releaseType: "single",
  artistId: 0, labelId: null,
  upc: "", catalogNumber: "", coverUrl: "",
  genre: "Tajik Folk", subgenre: "",
  releaseDate: "", releaseTime: "00:00", language: "Tajik",
  isExplicit: false, isCompilation: false, isVariousArtists: false,
  pLine: "", pLineYear: new Date().getFullYear(),
  cLine: "", cLineYear: new Date().getFullYear(),
  coverAiUsage: null,
};

// ─── Wizard component ──────────────────────────────────────────────────────
export function ReleaseWizard({ initialReleaseId = null }: { initialReleaseId?: number | null }) {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [releaseId, setReleaseId] = useState<number | null>(initialReleaseId);
  const [step, setStep] = useState<StepKey>("details");
  const [form, setForm] = useState<Form>(EMPTY);

  // ── Hydrate from server when id known (edit mode / after step 1 save) ──
  const { data: release } = useGetRelease(releaseId!, {
    query: { enabled: releaseId != null, retry: false } as never,
  });
  const { data: tracksList } = useListTracks(
    releaseId ? { release_id: releaseId } : undefined,
    { query: { enabled: releaseId != null } as never },
  );
  const { data: serverDsps = [] } = useGetReleaseDsps(releaseId!, {
    query: { enabled: releaseId != null } as never,
  });
  const { data: serverArtists = [] } = useGetReleaseArtists(releaseId!, {
    query: { enabled: releaseId != null } as never,
  });

  const tracks = useMemo(() => tracksList?.data ?? [], [tracksList]);

  // Локальные shadow-копии, чтобы пользователь видел изменения сразу.
  const [dsps, setDsps] = useState<string[]>([]);
  const [artists, setArtists] = useState<ReleaseArtistRef[]>([]);
  useEffect(() => { setDsps(serverDsps); }, [serverDsps.join("|")]);
  useEffect(() => { setArtists(serverArtists); }, [JSON.stringify(serverArtists)]);

  // Hydrate form once from server release.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (release && !hydratedRef.current) {
      hydratedRef.current = true;
      setForm({
        title: release.title ?? "",
        releaseVersion: release.releaseVersion ?? "",
        releaseType: release.releaseType,
        artistId: release.artistId,
        labelId: release.labelId ?? null,
        upc: release.upc ?? "",
        catalogNumber: release.catalogNumber ?? "",
        coverUrl: release.coverUrl ?? "",
        genre: release.genre ?? "Tajik Folk",
        subgenre: release.subgenre ?? "",
        releaseDate: release.releaseDate ?? "",
        releaseTime: release.releaseTime ?? "00:00",
        language: release.language ?? "Tajik",
        isExplicit: release.isExplicit,
        isCompilation: release.isCompilation,
        isVariousArtists: release.isVariousArtists,
        pLine: release.pLine ?? "",
        pLineYear: release.pLineYear ?? new Date().getFullYear(),
        cLine: release.cLine ?? "",
        cLineYear: release.cLineYear ?? new Date().getFullYear(),
        coverAiUsage: (release.coverAiUsage as Form["coverAiUsage"]) ?? null,
      });
    }
  }, [release]);

  // ── Helper hooks ──
  const isArtist = user?.role === "artist";
  const isLabel  = user?.role === "label";
  const isAdminLike = user?.role === "admin" || user?.role === "manager";

  const { data: artistsData } = useListArtists({ limit: 200 });
  const { data: labelsData }  = useListLabels({ limit: 100 });

  // Default artistId for artist role
  useEffect(() => {
    if (releaseId == null && isArtist && user?.artistId && form.artistId === 0) {
      setForm((p) => ({ ...p, artistId: user.artistId! }));
    }
    if (releaseId == null && isLabel && user?.labelId && form.labelId == null) {
      setForm((p) => ({ ...p, labelId: user.labelId! }));
    }
  }, [isArtist, isLabel, user?.artistId, user?.labelId, releaseId]);

  const createRelease = useCreateRelease();
  const updateRelease = useUpdateRelease();
  const updateDsps = useUpdateReleaseDsps();
  const updateArtists = useUpdateReleaseArtists();
  const createTrack = useCreateTrack();
  const validate = useValidateReleaseForSubmission();
  const submitForReview = useSubmitReleaseForReview();
  const { upload } = useAssetUpload();

  const [validationResult, setValidationResult] = useState<{ ok: boolean; issues: ValidationIssue[] } | null>(null);

  const invalidateAll = (id: number) => {
    qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListReleasesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() });
    qc.invalidateQueries({ queryKey: getListTracksQueryKey({ release_id: id }) });
    qc.invalidateQueries({ queryKey: getGetReleaseArtistsQueryKey(id) });
    qc.invalidateQueries({ queryKey: getGetReleaseDspsQueryKey(id) });
  };

  // ── STEP 1 SAVE: create or update + sync artists list ──
  const saveStep1 = async (): Promise<number | null> => {
    if (!form.title.trim() || !form.artistId) {
      toast({ title: t.releaseWizard.fillRequiredTitle, description: t.releaseWizard.fillRequiredDesc, variant: "destructive" });
      return null;
    }
    const payload: any = {
      title: form.title.trim(),
      releaseVersion: form.releaseVersion || null,
      releaseType: form.releaseType,
      artistId: form.artistId,
      labelId: form.labelId ?? null,
      upc: form.upc || null,
      coverUrl: form.coverUrl || null,
      genre: form.genre || null,
      subgenre: form.subgenre || null,
      releaseDate: form.releaseDate || null,
      releaseTime: form.releaseTime || null,
      language: form.language || null,
      isExplicit: form.isExplicit,
      isCompilation: form.isCompilation,
      isVariousArtists: form.isVariousArtists,
      territories: ["WW"], // World по умолчанию, можно менять на шаге 3
      pLine: form.pLine || null,
      pLineYear: form.pLineYear ?? null,
      cLine: form.cLine || null,
      cLineYear: form.cLineYear ?? null,
      coverAiUsage: form.coverAiUsage ?? null,
    };
    try {
      let id: number;
      if (releaseId == null) {
        const created = await createRelease.mutateAsync({ data: payload });
        id = created.id;
        setReleaseId(id);
      } else {
        await updateRelease.mutateAsync({ id: releaseId, data: payload });
        id = releaseId;
      }
      // Multi-primary: если пользователь добавил больше артистов — синхронизируем.
      // Серверная схема UpdateReleaseArtistsBody принимает только {artistId, role}
      // (порядок берёт из позиции в массиве), поэтому position не отправляем.
      if (artists.length > 0) {
        await updateArtists.mutateAsync({
          id,
          data: { artists: artists.map((a) => ({ artistId: a.artistId, role: a.role })) },
        });
      }
      invalidateAll(id);
      toast({ title: t.releaseWizard.releaseSaved });
      return id;
    } catch (e: any) {
      toast({ title: t.releaseWizard.saveFailed, description: e?.message ?? "", variant: "destructive" });
      return null;
    }
  };

  // ── STEP 3 SAVE: DSP list + release date/time + territories (одной транзакцией) ──
  const [territories, setTerritories] = useState<string[]>(["WW"]);
  const saveStep3 = async (): Promise<boolean> => {
    if (releaseId == null) return false;
    try {
      // 1. Обновляем дату/время/территории через PUT /releases/:id.
      await updateRelease.mutateAsync({
        id: releaseId,
        data: {
          title: form.title,
          releaseType: form.releaseType,
          artistId: form.artistId,
          labelId: form.labelId ?? null,
          upc: form.upc || null,
          coverUrl: form.coverUrl || null,
          genre: form.genre || null,
          subgenre: form.subgenre || null,
          releaseDate: form.releaseDate || null,
          releaseTime: form.releaseTime || null,
          language: form.language || null,
          isExplicit: form.isExplicit,
          isCompilation: form.isCompilation,
          isVariousArtists: form.isVariousArtists,
          territories,
          pLine: form.pLine || null,
          pLineYear: form.pLineYear ?? null,
          cLine: form.cLine || null,
          cLineYear: form.cLineYear ?? null,
        } as any,
      });
      // 2. Сохраняем выбор площадок.
      await updateDsps.mutateAsync({ id: releaseId, data: { dsps } });
      invalidateAll(releaseId);
      return true;
    } catch (e: any) {
      toast({ title: t.releaseWizard.saveFailed, description: e?.message ?? "", variant: "destructive" });
      return false;
    }
  };

  // Гидратируем territories из release при первой загрузке.
  useEffect(() => {
    if (release && release.territories && release.territories.length > 0) {
      setTerritories(release.territories);
    }
  }, [release?.id]);

  // ── STEP 4: validate + submit ──
  const runValidation = async () => {
    if (releaseId == null) return;
    try {
      const r = await validate.mutateAsync({ id: releaseId });
      setValidationResult(r);
    } catch (e: any) {
      toast({ title: t.releaseWizard.validationError, description: e?.message ?? "", variant: "destructive" });
    }
  };
  useEffect(() => { if (step === "submission" && releaseId) runValidation(); }, [step, releaseId]);

  const submit = async () => {
    if (releaseId == null) return;
    try {
      await submitForReview.mutateAsync({ id: releaseId });
      invalidateAll(releaseId);
      toast({ title: t.releaseWizard.submittedTitle, description: t.releaseWizard.submittedDesc });
      setLocation(`/releases/${releaseId}`);
    } catch (e: any) {
      toast({ title: t.releaseWizard.submitFailed, description: e?.message ?? "", variant: "destructive" });
    }
  };

  // ── Navigation ──
  const goNext = async () => {
    if (step === "details") {
      const id = await saveStep1();
      if (id != null) setLocation(`/releases/${id}`);
    } else if (step === "tracks") {
      setStep("delivery");
    } else if (step === "delivery") {
      const ok = await saveStep3();
      if (ok) setStep("submission");
    }
  };
  const goBack = () => {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1].key);
  };
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // Список артистов для multi-picker (если массив пуст — заполняем "primary" из form).
  const artistsForPicker: ReleaseArtistRef[] = useMemo(() => {
    if (artists.length > 0) return artists;
    const a = artistsData?.data?.find((x: any) => x.id === form.artistId);
    if (form.artistId && a) {
      return [{ artistId: form.artistId, name: a.name, role: "primary", position: 0 }];
    }
    return [];
  }, [artists, artistsData, form.artistId]);

  return (
    <div className="space-y-6">
      <button
        onClick={() => setLocation(releaseId ? `/releases/${releaseId}` : "/releases")}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> {releaseId ? t.releaseWizard.backToRelease : t.releaseWizard.backToReleases}
      </button>

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {releaseId ? t.releaseWizard.editReleaseTitle.replace("{id}", String(releaseId)) : t.releaseWizard.createReleaseTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {form.title || t.releaseWizard.untitled}
            {form.catalogNumber && <span className="ml-2 font-mono text-xs">[{form.catalogNumber}]</span>}
          </p>
        </div>
        {release && (
          <Badge variant={release.status === "draft" ? "outline" : "secondary"} className="uppercase text-[10px]">
            {release.status}
          </Badge>
        )}
      </div>

      {/* STEPPER */}
      <StepIndicator current={step} setStep={(s) => { if (releaseId || s === "details") setStep(s); }} releaseExists={releaseId != null} />

      {/* CONTENT */}
      {step === "details" && (
        <Step1Details
          form={form} setForm={setForm}
          artists={artistsForPicker} setArtists={setArtists}
          isArtist={isArtist} isLabel={isLabel} isAdminLike={isAdminLike}
          user={user}
          artistsData={artistsData} labelsData={labelsData}
        />
      )}

      {step === "tracks" && releaseId != null && (
        <Step2Tracks
          releaseId={releaseId}
          tracks={tracks}
          // Используем серверную правду release.artistId (синхронизирована при PUT /artists),
          // а не form.artistId — иначе бэкенд может отдать 403, если scope разъехался.
          primaryArtistId={release?.artistId ?? form.artistId}
          createTrack={createTrack}
          upload={upload}
          invalidate={() => invalidateAll(releaseId)}
        />
      )}

      {step === "delivery" && releaseId != null && (
        <Step3Delivery
          releaseId={releaseId}
          dsps={dsps} setDsps={setDsps}
          territories={territories} setTerritories={setTerritories}
          form={form} setForm={setForm}
        />
      )}

      {step === "submission" && releaseId != null && (
        <Step4Submission
          release={release ?? null}
          tracks={tracks}
          artists={artistsForPicker}
          dsps={dsps}
          validation={validationResult}
          isValidating={validate.isPending}
          onRevalidate={runValidation}
          onSubmit={submit}
          submitting={submitForReview.isPending}
          onGoToStep={(s) => setStep(s)}
        />
      )}

      {/* NAV BUTTONS */}
      <div className="flex justify-between gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 -mx-4 px-4 border-t border-border/40">
        <Button variant="outline" onClick={goBack} disabled={stepIndex === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> {t.releaseWizard.back}
        </Button>
        {step !== "submission" ? (
          <Button onClick={goNext} disabled={createRelease.isPending || updateRelease.isPending || updateDsps.isPending}>
            {(createRelease.isPending || updateRelease.isPending || updateDsps.isPending)
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t.releaseWizard.saving}</>
              : <>{t.releaseWizard.next} <ChevronRight className="h-4 w-4 ml-1" /></>}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Step Indicator ─────────────────────────────────────────────────────────
function StepIndicator({
  current, setStep, releaseExists,
}: {
  current: StepKey;
  setStep: (s: StepKey) => void;
  releaseExists: boolean;
}) {
  const { t } = useLang();
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const done = i < idx;
        const clickable = releaseExists || s.key === "details";
        return (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => clickable && setStep(s.key)}
              disabled={!clickable}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition
                ${active ? "bg-primary text-primary-foreground" :
                  done ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" :
                  "bg-muted/40 text-muted-foreground hover:bg-muted/60"}
                ${!clickable && "opacity-50 cursor-not-allowed"}`}
            >
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold
                ${active ? "bg-primary-foreground/20" : done ? "bg-emerald-500/30" : "bg-muted/60"}`}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              {t.releaseWizard.steps[s.key]}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Год для CLine/PLine — выпадающий список ────────────────────────────────
const YEAR_NOW = new Date().getFullYear();
const YEARS = Array.from({ length: YEAR_NOW - 1950 + 3 }, (_, i) => YEAR_NOW + 2 - i);

// ─── Drag-&-drop загрузчик обложки в стиле Symphonic ────────────────────────
function WizardCoverUploader({
  value, onChange,
}: {
  value: string | null;
  onChange: (objectPath: string | null) => void;
}) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { upload, isUploading, progress } = useAssetUpload();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const asset = await upload(file, { kind: "cover", attach: false });
      onChange(asset.objectPath);
      toast({ title: t.releaseWizard.coverUploaded, description: file.name });
    } catch (err: any) {
      toast({ title: t.releaseWizard.coverUploadFailed, description: err?.message ?? t.releaseWizard.error, variant: "destructive" });
    }
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col gap-2" style={{ width: 200 }}>
      <div
        role="button"
        tabIndex={0}
        aria-label={t.releaseWizard.uploadCoverAria}
        className={[
          "relative rounded-lg overflow-hidden cursor-pointer transition-all select-none",
          "border-2 border-dashed",
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : value
              ? "border-border/40 hover:border-primary/60"
              : "border-border/50 bg-muted/20 hover:bg-muted/30 hover:border-primary/40",
        ].join(" ")}
        style={{ width: 200, height: 200 }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {value ? (
          <img src={assetHref(value)} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-3 text-center text-muted-foreground">
            <ImageIcon className="h-9 w-9 opacity-35 mb-1" />
            <span className="text-xs leading-snug">{t.releaseWizard.dropImage}</span>
            <span className="text-[10px] opacity-60">{t.releaseWizard.coverFormats}</span>
            <span className="text-[10px] opacity-60">{t.releaseWizard.coverMaxSize}</span>
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-background/75 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <Progress value={progress} className="w-full h-1.5" />
            <span className="text-[11px] text-muted-foreground">{progress}%</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        {t.releaseWizard.uploadCoverArt}
      </Button>
    </div>
  );
}

// ─── STEP 1: Details ────────────────────────────────────────────────────────
function Step1Details({
  form, setForm, artists, setArtists,
  isArtist, isLabel, isAdminLike, user,
  artistsData, labelsData,
}: {
  form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>;
  artists: ReleaseArtistRef[]; setArtists: (a: ReleaseArtistRef[]) => void;
  isArtist: boolean; isLabel: boolean; isAdminLike: boolean;
  user: any;
  artistsData: any; labelsData: any;
}) {
  const { t } = useLang();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen]   = useState(false);

  const myArtist = artistsData?.data?.find((a: any) => a.id === user?.artistId);
  const myLabel  = labelsData?.data?.find((l: any) => l.id === user?.labelId);
  const subgenresFor = form.genre ? (SUBGENRES[form.genre] ?? []) : [];

  // Синхронизируем form.artistId с primary артистом из multi-picker.
  useEffect(() => {
    const primary = artists.find((a) => a.role === "primary");
    if (primary && primary.artistId !== form.artistId) {
      setForm((p) => ({ ...p, artistId: primary.artistId }));
    }
  }, [artists]);

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{t.releaseWizard.step1Title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t.releaseWizard.step1Subtitle}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* ── Cover Art + AI Usage ─────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <FieldLabel className="text-sm font-semibold">{t.createRelease.coverArt}</FieldLabel>
            <span className="text-muted-foreground text-sm">?</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <WizardCoverUploader
              value={form.coverUrl || null}
              onChange={(p) => set("coverUrl", p ?? "")}
            />
            <div className="flex-1 space-y-3 pt-1">
              <p className="text-sm text-muted-foreground leading-snug">
                {t.createRelease.aiQuestion}
              </p>
              <RadioGroup
                value={form.coverAiUsage ?? "none"}
                onValueChange={(v) => set("coverAiUsage", v as Form["coverAiUsage"])}
                className="gap-2"
              >
                {(["none", "some", "all"] as const).map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <RadioGroupItem value={v} id={`ai-${v}`} />
                    <FieldLabel htmlFor={`ai-${v}`} className="text-sm capitalize cursor-pointer font-normal">
                      {v === "none" ? t.createRelease.aiNone : v === "some" ? t.createRelease.aiSome : t.createRelease.aiAll}
                    </FieldLabel>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        </div>

        {/* ── Release Title / Version / Language ───────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.releaseTitleRequired}</FieldLabel>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={t.releaseWizard.releaseTitlePlaceholder}
              className="bg-background/40"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.releaseVersionOptional}</FieldLabel>
            <Input
              value={form.releaseVersion}
              onChange={(e) => set("releaseVersion", e.target.value)}
              placeholder={t.releaseWizard.versionPlaceholder}
              className="bg-background/40"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.createRelease.metadataLanguage}</FieldLabel>
            <Select value={form.language} onValueChange={(v) => set("language", v)}>
              <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Release Type ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.releaseTypeRequired}</FieldLabel>
            <Select value={form.releaseType} onValueChange={(v) => set("releaseType", v as Form["releaseType"])}>
              <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELEASE_TYPES.map((rt) => <SelectItem key={rt.value} value={rt.value}>{t.createRelease.releaseTypes[rt.value as keyof typeof t.createRelease.releaseTypes] ?? rt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Primary Artists ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.primaryArtistsRequired}</FieldLabel>
          {isArtist ? (
            <div className="flex items-center gap-2 bg-background/40 border border-border/60 rounded-md px-3 py-2 text-sm">
              <span className="flex-1">{myArtist?.name ?? t.releaseWizard.yourArtist}</span>
              <Badge variant="outline" className="text-[10px]">{t.releaseWizard.primaryYou}</Badge>
            </div>
          ) : (
            <>
              <MultiArtistPicker value={artists} onChange={setArtists} labelId={isLabel ? user?.labelId : null} />
              {(isAdminLike || isLabel) && (
                <Button type="button" variant="ghost" size="sm" className="text-xs"
                  onClick={() => setArtistDialogOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> {t.releaseWizard.createNewArtist}
                </Button>
              )}
            </>
          )}
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <Checkbox
              checked={form.isVariousArtists}
              onCheckedChange={(v) => set("isVariousArtists", !!v)}
            />
            <span className="text-sm text-muted-foreground">
              {t.createRelease.variousArtists}{" "}
              <span className="text-xs opacity-60">{t.createRelease.variousArtistsHint}</span>
            </span>
          </label>
        </div>

        {/* ── UPC / Genre / Subgenre ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.createRelease.upc}</FieldLabel>
            <Input
              value={form.upc}
              onChange={(e) => set("upc", e.target.value)}
              placeholder={t.createRelease.assignedOnSubmission}
              className="bg-background/40 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.createRelease.genre}</FieldLabel>
            <Select value={form.genre} onValueChange={(v) => { set("genre", v); set("subgenre", ""); }}>
              <SelectTrigger className="bg-background/40 h-10">
                <SelectValue placeholder={t.createRelease.pleaseSelect} />
              </SelectTrigger>
              <SelectContent>
                {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.subgenre}</FieldLabel>
            <Select value={form.subgenre} onValueChange={(v) => set("subgenre", v)} disabled={subgenresFor.length === 0}>
              <SelectTrigger className="bg-background/40 h-10">
                <SelectValue placeholder={t.createRelease.pleaseSelect} />
              </SelectTrigger>
              <SelectContent>
                {subgenresFor.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Label Name / © CLine / ℗ PLine ──────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Label */}
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.createRelease.labelName}</FieldLabel>
            {isLabel ? (
              <div className="flex items-center gap-2 bg-background/40 border border-border/60 rounded-md px-3 py-2 text-sm">
                <span className="flex-1">{myLabel?.name ?? t.releaseWizard.yourLabel}</span>
                <Badge variant="outline" className="text-[10px]">{t.releaseWizard.yourLabel}</Badge>
              </div>
            ) : isArtist ? (
              <div className="bg-background/40 border border-border/60 rounded-md px-3 py-2 text-sm text-muted-foreground">
                {t.releaseWizard.independent}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Select value={form.labelId ? String(form.labelId) : "none"}
                  onValueChange={(v) => set("labelId", v === "none" ? null : Number(v))}>
                  <SelectTrigger className="bg-background/40">
                    <SelectValue placeholder={t.createRelease.pleaseSelect} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t.releaseWizard.independent}</SelectItem>
                    {labelsData?.data?.map((l: any) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdminLike && (
                  <Button type="button" variant="outline" size="icon" className="bg-background/40 shrink-0"
                    onClick={() => setLabelDialogOpen(true)} title={t.releaseWizard.createNewLabel}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* © C-Line */}
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.createRelease.cLine}</FieldLabel>
            <div className="flex gap-2">
              <Select value={String(form.cLineYear ?? YEAR_NOW)} onValueChange={(v) => set("cLineYear", Number(v))}>
                <SelectTrigger className="bg-background/40 w-[90px] shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={form.cLine}
                onChange={(e) => set("cLine", e.target.value)}
                placeholder={t.createRelease.cLinePlaceholder}
                className="bg-background/40 min-w-0"
              />
            </div>
          </div>

          {/* ℗ P-Line */}
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.createRelease.pLine}</FieldLabel>
            <div className="flex gap-2">
              <Select value={String(form.pLineYear ?? YEAR_NOW)} onValueChange={(v) => set("pLineYear", Number(v))}>
                <SelectTrigger className="bg-background/40 w-[90px] shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={form.pLine}
                onChange={(e) => set("pLine", e.target.value)}
                placeholder={t.createRelease.pLinePlaceholder}
                className="bg-background/40 min-w-0"
              />
            </div>
          </div>
        </div>

        {/* ── Catalogue / Compilation ──────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.catalogue}</FieldLabel>
            <p className="text-[11px] text-muted-foreground/70">{t.createRelease.catalogHint}</p>
            <Input
              value={form.catalogNumber}
              disabled
              placeholder={t.releaseWizard.autoGenerated}
              className="bg-background/40 font-mono"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel className="text-xs text-muted-foreground">{t.createRelease.compilation}</FieldLabel>
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.isCompilation}
                  onCheckedChange={(v) => set("isCompilation", !!v)}
                />
                <span className="text-sm">{t.createRelease.compilationYes}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!form.isCompilation}
                  onCheckedChange={(v) => set("isCompilation", !v)}
                />
                <span className="text-sm">{t.releaseWizard.standardRelease}</span>
              </label>
            </div>
          </div>
        </div>

      </CardContent>

      {(isAdminLike || isLabel) && (
        <ArtistFormDialog open={artistDialogOpen} onOpenChange={setArtistDialogOpen}
          onSaved={(id) => set("artistId", id)} />
      )}
      {isAdminLike && (
        <LabelFormDialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}
          onSaved={(id) => set("labelId", id)} />
      )}
    </Card>
  );
}

// ─── STEP 2: Tracks ─────────────────────────────────────────────────────────
function Step2Tracks({
  releaseId, tracks, primaryArtistId, createTrack, upload, invalidate,
}: {
  releaseId: number;
  tracks: any[];
  primaryArtistId: number;
  createTrack: ReturnType<typeof useCreateTrack>;
  upload: ReturnType<typeof useAssetUpload>["upload"];
  invalidate: () => void;
}) {
  const { t } = useLang();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isBulkUploading, setBulkUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onBulkPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    let nextNumber = (tracks.length || 0) + 1;
    try {
      for (const file of Array.from(files)) {
        const titleFromName = file.name.replace(/\.[^.]+$/, "").trim() || t.releaseWizard.untitled;
        // 1. Создаём пустой трек.
        const track = await createTrack.mutateAsync({
          data: {
            title: titleFromName,
            releaseId,
            artistId: primaryArtistId,
            trackNumber: nextNumber,
            audioStyle: "vocal",
            aiUsage: "none",
            explicitStatus: "non_explicit",
            clipStartSeconds: 0,
            displayArtists: [],
            writers: [],
            performers: [],
            production: [],
          },
        });
        // 2. Загружаем аудио, сервер сам распарсит длительность через music-metadata.
        await upload(file, { kind: "audio", trackId: track.id, attach: true });
        nextNumber += 1;
      }
      invalidate();
      toast({ title: t.releaseWizard.uploadComplete, description: t.releaseWizard.tracksAdded.replace("{count}", String(files.length)) });
    } catch (e: any) {
      toast({ title: t.releaseWizard.bulkUploadError, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setBulkUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <ListMusic className="h-5 w-5" /> {t.releaseWizard.releaseTracks.replace("{count}", String(tracks.length))}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t.releaseWizard.tracksHint}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef} type="file" multiple accept="audio/*" className="hidden"
            onChange={(e) => onBulkPick(e.target.files)}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={isBulkUploading}>
            {isBulkUploading
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t.releaseWizard.uploading}</>
              : <><Upload className="h-4 w-4 mr-1" /> {t.releaseWizard.uploadTracks}</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tracks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {t.releaseWizard.noTracksYet}
          </div>
        )}
        {tracks.map((tr) => (
          <TrackCard
            key={tr.id}
            track={tr}
            releaseId={releaseId}
            expanded={expandedId === tr.id}
            onExpandToggle={() => setExpandedId((p) => p === tr.id ? null : tr.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── STEP 3: Delivery ───────────────────────────────────────────────────────
function Step3Delivery({
  releaseId, dsps, setDsps, territories, setTerritories, form, setForm,
}: {
  releaseId: number;
  dsps: string[]; setDsps: (d: string[]) => void;
  territories: string[]; setTerritories: (t: string[]) => void;
  form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>;
}) {
  const { t } = useLang();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Режим: World (одна запись "WW") vs Custom (список ISO-кодов).
  const isWorld = territories.length === 1 && territories[0] === "WW";
  const territoryMode: "world" | "custom" = isWorld ? "world" : "custom";
  const customTerritories = isWorld ? [] : territories;

  return (
    <div className="space-y-5">
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" /> {t.releaseWizard.dspTitle}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t.releaseWizard.dspSubtitle}
          </p>
        </CardHeader>
        <CardContent>
          {dsps.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border/50 rounded-md text-muted-foreground">
              <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t.releaseWizard.noDspsSelected}</p>
              <Button className="mt-3" onClick={() => setPickerOpen(true)}>{t.releaseWizard.selectDsps}</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {dsps.map((c) => (
                  <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                ))}
              </div>
              <Button variant="outline" onClick={() => setPickerOpen(true)}>
                <Settings2 className="h-4 w-4 mr-1" /> {t.releaseWizard.changeSelection.replace("{count}", String(dsps.length))}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" /> {t.releaseWizard.territories}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant={territoryMode === "world" ? "default" : "outline"} onClick={() => setTerritories(["WW"])}>
              {t.releaseWizard.worldwide}
            </Button>
            <Button variant={territoryMode === "custom" ? "default" : "outline"}
              onClick={() => setTerritories(customTerritories.length > 0 ? customTerritories : ["TJ"])}>
              {t.releaseWizard.selectCountries}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t.releaseWizard.autoSavedOnNext}</p>
          {territoryMode === "custom" && (
            <div className="grid grid-cols-3 gap-2 pt-2">
              {COUNTRIES.map((c) => {
                const on = customTerritories.includes(c.code);
                return (
                  <label key={c.code} className="flex items-center gap-2 p-2 rounded bg-background/40 border border-border/50 cursor-pointer hover:bg-accent/40">
                    <Checkbox checked={on} onCheckedChange={(v) => {
                      const next = v ? [...customTerritories, c.code] : customTerritories.filter((x) => x !== c.code);
                      setTerritories(next.length > 0 ? next : ["WW"]);
                    }} />
                    <span className="text-xs flex-1">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{c.code}</span>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" /> {t.releaseWizard.releaseDateTime}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.date}</FieldLabel>
            <Input type="date" value={form.releaseDate} onChange={(e) => setForm((p) => ({ ...p, releaseDate: e.target.value }))} className="bg-background/40" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.timeUtc}</FieldLabel>
            <Input type="time" value={form.releaseTime} onChange={(e) => setForm((p) => ({ ...p, releaseTime: e.target.value }))} className="bg-background/40" />
          </div>
        </CardContent>
      </Card>

      <DspPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} value={dsps} onChange={setDsps} />
    </div>
  );
}

// ─── STEP 4: Submission ─────────────────────────────────────────────────────
const SECTION_LABELS: Record<ValidationIssueSection, string> = {
  release: "Информация о релизе",
  tracks: "Треки",
  delivery: "Доставка",
  contributors: "Контрибьюторы",
};
const SECTION_TO_STEP: Record<ValidationIssueSection, StepKey> = {
  release: "details",
  contributors: "details",
  tracks: "tracks",
  delivery: "delivery",
};

function Step4Submission({
  release, tracks, artists, dsps, validation,
  isValidating, onRevalidate, onSubmit, submitting, onGoToStep,
}: {
  release: any;
  tracks: any[];
  artists: ReleaseArtistRef[];
  dsps: string[];
  validation: { ok: boolean; issues: ValidationIssue[] } | null;
  isValidating: boolean;
  onRevalidate: () => void;
  onSubmit: () => void;
  submitting: boolean;
  onGoToStep: (s: StepKey) => void;
}) {
  const { t } = useLang();
  const errors = validation?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = validation?.issues.filter((i) => i.severity === "warning") ?? [];
  const canSubmit = validation?.ok ?? false;

  return (
    <div className="space-y-5">
      {validation && (
        <div
          className={`p-4 rounded-md border flex items-start gap-3 ${
            errors.length === 0
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-rose-500/10 border-rose-500/30"
          }`}
        >
          {errors.length === 0
            ? <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
            : <AlertCircle className="h-5 w-5 text-rose-400 mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className="font-medium">
              {errors.length === 0
                ? t.releaseWizard.readyToSubmit
                : t.releaseWizard.errorsFound.replace("{count}", String(errors.length))}
            </p>
            {warnings.length > 0 && (
              <p className="text-xs text-amber-400 mt-1">{t.releaseWizard.warningsOptional.replace("{count}", String(warnings.length))}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onRevalidate} disabled={isValidating}>
            {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : t.releaseWizard.revalidate}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title={t.releaseWizard.sectionRelease} icon={Settings2}
          issues={(validation?.issues ?? []).filter((i) => i.section === "release" || i.section === "contributors")}
          onFix={() => onGoToStep("details")}
        >
          <p className="text-sm font-medium">{release?.title}</p>
          <p className="text-xs text-muted-foreground">
            {release?.releaseType} · {release?.genre ?? "—"} · {release?.releaseDate ?? t.releaseWizard.dateNotSet}
          </p>
          <div className="text-xs">
            {t.releaseWizard.artistsLabel}: {artists.map((a) => `${a.name} (${a.role})`).join(", ") || "—"}
          </div>
        </SectionCard>

        <SectionCard
          title={t.releaseWizard.sectionTracks.replace("{count}", String(tracks.length))} icon={ListMusic}
          issues={(validation?.issues ?? []).filter((i) => i.section === "tracks")}
          onFix={() => onGoToStep("tracks")}
        >
          {tracks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t.releaseWizard.noTracks}</p>
          ) : (
            <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
              {tracks.map((tr) => (
                <li key={tr.id} className="truncate">
                  #{tr.trackNumber ?? "?"} {tr.title} {tr.audioUrl ? "" : <span className="text-amber-400">{t.releaseWizard.noAudio}</span>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t.releaseWizard.sectionDelivery} icon={Globe}
          issues={(validation?.issues ?? []).filter((i) => i.section === "delivery")}
          onFix={() => onGoToStep("delivery")}
        >
          <div className="text-xs">
            DSP: {dsps.length === 0 ? <span className="text-amber-400">{t.releaseWizard.notSelected}</span> : dsps.join(", ")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t.releaseWizard.territoriesLabel}: {(release?.territories ?? []).join(", ") || "—"}
          </div>
        </SectionCard>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> {t.releaseWizard.submission}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {t.releaseWizard.submissionNote}
          </div>
          <Button size="lg" onClick={onSubmit} disabled={!canSubmit || submitting}>
            {submitting
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.releaseWizard.submittingReview}</>
              : <><Send className="h-4 w-4 mr-2" /> {t.releaseWizard.submitForReview}</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionCard({
  title, icon: Icon, issues, children, onFix,
}: {
  title: string;
  icon: any;
  issues: ValidationIssue[];
  children: React.ReactNode;
  onFix: () => void;
}) {
  const { t } = useLang();
  const errs = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warning");
  const [showIssues, setShowIssues] = useState(false);
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
        </CardTitle>
        {errs.length > 0 ? (
          <Badge variant="destructive" className="text-[10px]">{t.releaseWizard.errorsBadge.replace("{count}", String(errs.length))}</Badge>
        ) : warns.length > 0 ? (
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">{t.releaseWizard.warningsBadge.replace("{count}", String(warns.length))}</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">OK</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        {(errs.length > 0 || warns.length > 0) && (
          <>
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2"
              onClick={() => setShowIssues((p) => !p)}>
              {showIssues ? t.releaseWizard.hideIssues : t.releaseWizard.showIssues}
            </Button>
            {showIssues && (
              <ul className="text-[11px] space-y-1">
                {errs.map((i, idx) => (
                  <li key={`e${idx}`} className="text-rose-400 flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {i.message}
                  </li>
                ))}
                {warns.map((i, idx) => (
                  <li key={`w${idx}`} className="text-amber-400 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {i.message}
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={onFix}>
              {t.releaseWizard.goAndFix}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
