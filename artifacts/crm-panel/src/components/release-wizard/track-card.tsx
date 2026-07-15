import { useRef, useState } from "react";
import {
  useUpdateTrack, useDeleteTrack,
  getListTracksQueryKey, getGetReleaseQueryKey,
  type Track,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Trash2, Music2, Save, Wand2, Upload, Loader2 } from "lucide-react";
import { AudioUploader, assetHref, useAssetUpload } from "@/components/asset-uploader";
import { SUBGENRES, subgenreOptionsFor, genreOptionsWith, LANGS, COUNTRIES } from "./types";
import { useCatalogOptions } from "./use-catalog";
import { DictionaryCombobox } from "./dictionary-combobox";
import {
  DisplayArtistsEditor, WritersEditor, PerformersEditor, ProductionEditor,
  splitWriterSharesEvenly,
} from "./contributors-editor";
import { useLang } from "@/lib/i18n";
import { generateIsrcCode } from "@/lib/codes";

export function TrackCard({
  track, releaseId, expanded, onExpandToggle,
}: {
  track: Track;
  releaseId: number;
  expanded: boolean;
  onExpandToggle: () => void;
}) {
  const { t } = useLang();
  const qc = useQueryClient();
  const updateTrack = useUpdateTrack();
  const deleteTrack = useDeleteTrack();
  const [draft, setDraft] = useState<Track>(track);
  const dirty = JSON.stringify(draft) !== JSON.stringify(track);

  // Инлайн-загрузка аудио прямо из шапки строки трека (когда audioUrl ещё пуст).
  const inlineUploadRef = useRef<HTMLInputElement>(null);
  const { upload: inlineUpload, isUploading: isInlineUploading } = useAssetUpload();
  const onInlineAudio = async (file: File | undefined) => {
    if (!file) return;
    try {
      const asset = await inlineUpload(file, { kind: "audio", trackId: track.id, attach: true });
      setDraft((p) => ({ ...p, audioUrl: asset.objectPath, durationSeconds: asset.durationSeconds ?? p.durationSeconds }));
      qc.invalidateQueries({ queryKey: getListTracksQueryKey({ release_id: releaseId }) });
      qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(releaseId) });
      toast({ title: t.releaseWizard.audioUploaded, description: file.name });
    } catch (e: any) {
      toast({ title: t.releaseWizard.uploadFailed, description: e?.message ?? "", variant: "destructive" });
    }
  };

  const set = <K extends keyof Track>(k: K, v: Track[K]) => setDraft((p) => ({ ...p, [k]: v }));

  const [isrcBusy, setIsrcBusy] = useState(false);
  const genIsrc = async () => {
    setIsrcBusy(true);
    try {
      const { code, warning } = await generateIsrcCode();
      set("isrc", code);
      if (warning) toast({ title: "ISRC", description: warning });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setIsrcBusy(false);
    }
  };

  const save = async () => {
    const hasProducer =
      draft.production.some((p) => /producer/i.test(p.role) && p.name.trim()) ||
      draft.performers.some((p) => /producer/i.test(p.role) && p.name.trim());
    if (!hasProducer) {
      toast({
        title: t.releaseWizard.producerRequiredTitle,
        description: t.releaseWizard.producerRequiredDesc,
        variant: "destructive",
      });
      return;
    }
    try {
      await updateTrack.mutateAsync({
        id: track.id,
        data: {
          artistId: draft.artistId,
          title: draft.title,
          trackVersion: draft.trackVersion ?? null,
          isrc: draft.isrc ?? null,
          iswc: draft.iswc ?? null,
          trackNumber: draft.trackNumber ?? null,
          genre: draft.genre ?? null,
          subgenre: draft.subgenre ?? null,
          language: draft.language ?? null,
          isExplicit: draft.isExplicit,
          explicitStatus: draft.explicitStatus || undefined,
          aiUsage: draft.aiUsage || undefined,
          clipStartSeconds: draft.clipStartSeconds,
          recordingYear: draft.recordingYear ?? null,
          countryOfRecording: draft.countryOfRecording ?? null,
          audioStyle: draft.audioStyle || undefined,
          vocalLanguage: draft.vocalLanguage ?? null,
          lyrics: draft.lyrics ?? null,
          audioUrl: draft.audioUrl ?? null,
          displayArtists: draft.displayArtists,
          writers: splitWriterSharesEvenly(draft.writers.filter((w) => w.name.trim())),
          performers: draft.performers,
          production: draft.production,
        },
      });
      qc.invalidateQueries({ queryKey: getListTracksQueryKey({ release_id: releaseId }) });
      qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(releaseId) });
      toast({ title: t.releaseWizard.trackSaved });
    } catch (e: any) {
      toast({ title: t.releaseWizard.saveFailed, description: e?.message ?? "", variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!confirm(t.releaseWizard.confirmDeleteTrack.replace("{title}", track.title))) return;
    try {
      await deleteTrack.mutateAsync({ id: track.id });
      qc.invalidateQueries({ queryKey: getListTracksQueryKey({ release_id: releaseId }) });
      qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(releaseId) });
      toast({ title: t.releaseWizard.trackDeleted });
    } catch (e: any) {
      toast({ title: t.releaseWizard.error, description: e?.message ?? "", variant: "destructive" });
    }
  };

  // Справочники Broma16 для метаданных трека (с запасными курируемыми списками).
  const langOpts = useCatalogOptions("language", { valueKey: "code", fallback: LANGS.map((l) => ({ value: l.value, label: l.label })) });
  const countryOpts = useCatalogOptions("country", {
    valueKey: "code",
    fallback: COUNTRIES.map((c) => ({ value: c.code, label: c.name })),
  });

  return (
    <Card className="bg-card/40 border-border/50">
      {/* Заголовок: номер + название + аудио + раскрывашка */}
      <div className="flex items-center gap-3 p-3">
        <div className="text-xs text-muted-foreground tabular-nums w-6">#{track.trackNumber ?? "?"}</div>
        <Music2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder={t.releaseWizard.trackTitlePlaceholder}
          className="bg-background/40 flex-1 min-w-0"
        />
        {draft.audioUrl ? (
          <audio controls className="h-7 max-w-[200px]" src={assetHref(draft.audioUrl)} />
        ) : (
          <>
            <input
              ref={inlineUploadRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => onInlineAudio(e.target.files?.[0])}
            />
            <Button
              type="button" size="sm" variant="outline"
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              disabled={isInlineUploading}
              onClick={() => inlineUploadRef.current?.click()}
            >
              {isInlineUploading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t.releaseWizard.uploading}</>
                : <><Upload className="h-3.5 w-3.5 mr-1" /> {t.releaseWizard.uploadTrack}</>}
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={onExpandToggle}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="ml-1">{expanded ? t.releaseWizard.collapse : t.releaseWizard.audioDetails}</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={remove} title={t.releaseWizard.deleteTrack}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border/40 p-4 space-y-5">
          {/* Audio + ISRC + Clip ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FieldLabel className="text-xs text-muted-foreground">{t.releaseWizard.audioWav}</FieldLabel>
              <AudioUploader
                value={draft.audioUrl ?? null}
                durationSeconds={draft.durationSeconds ?? null}
                onChange={(p, d) => {
                  setDraft((prev) => ({ ...prev, audioUrl: p, durationSeconds: d ?? prev.durationSeconds }));
                }}
                trackId={track.id}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ISRC">
                <div className="flex gap-1.5">
                  <Input value={draft.isrc ?? ""} onChange={(e) => set("isrc", e.target.value)}
                    placeholder="TJCTM2500001" className="bg-background/40 font-mono" />
                  <Button type="button" variant="outline" size="icon" title={t.releaseWizard.generateIsrcTitle}
                    disabled={isrcBusy} onClick={() => void genIsrc()}><Wand2 className="h-4 w-4" /></Button>
                </div>
              </Field>
              <Field label={t.releaseWizard.iswcLabel}>
                <Input value={draft.iswc ?? ""} onChange={(e) => set("iswc", e.target.value)}
                  placeholder="T-123.456.789-0" className="bg-background/40 font-mono" />
              </Field>
              <Field label={t.releaseWizard.trackNumberLabel}>
                <Input type="number" min={1} value={draft.trackNumber ?? 1}
                  onChange={(e) => set("trackNumber", Number(e.target.value) || null)}
                  className="bg-background/40" />
              </Field>
              <Field label={t.releaseWizard.clipStart}>
                <Input type="number" min={0} value={draft.clipStartSeconds}
                  onChange={(e) => set("clipStartSeconds", Number(e.target.value) || 0)}
                  className="bg-background/40" />
              </Field>
              <Field label={t.releaseWizard.trackVersionLabel}>
                <Input value={draft.trackVersion ?? ""} onChange={(e) => set("trackVersion", e.target.value || null)}
                  placeholder="Acoustic, Remix..." className="bg-background/40" />
              </Field>
              <Field label={t.releaseWizard.recordingYear}>
                <Input type="number" min={1900} max={new Date().getFullYear()}
                  value={draft.recordingYear ?? ""}
                  onChange={(e) => set("recordingYear", e.target.value ? Number(e.target.value) : null)}
                  className="bg-background/40" />
              </Field>
            </div>
          </div>

          {/* Жанр / Язык / Country / AI / Audio Style / Explicit */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label={t.createRelease.genre}>
              <DictionaryCombobox
                value={draft.genre ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, genre: v, subgenre: (SUBGENRES[v] ?? []).includes(p.subgenre ?? "") ? p.subgenre : null }))}
                options={genreOptionsWith(draft.genre)}
                placeholder={t.releaseWizard.selectPlaceholder}
              />
            </Field>
            <Field label={t.releaseWizard.subgenre}>
              <DictionaryCombobox
                value={draft.subgenre ?? ""}
                onChange={(v) => set("subgenre", v)}
                options={subgenreOptionsFor(draft.genre, draft.subgenre)}
                placeholder="—"
              />
            </Field>
            <Field label={t.createRelease.metadataLanguage}>
              <DictionaryCombobox
                value={draft.language ?? ""}
                onChange={(v) => set("language", v)}
                options={langOpts.options}
                placeholder={t.releaseWizard.selectPlaceholder}
              />
            </Field>
            <Field label={t.releaseWizard.countryOfRecording}>
              <DictionaryCombobox
                value={draft.countryOfRecording ?? ""}
                onChange={(v) => set("countryOfRecording", v)}
                options={countryOpts.options}
                placeholder="—"
              />
            </Field>
            <Field label={t.releaseWizard.audioStyleLabel}>
              <Select value={draft.audioStyle ?? ""} onValueChange={(v) => set("audioStyle", v as Track["audioStyle"])}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder={t.releaseWizard.selectPlaceholder} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vocal">{t.releaseWizard.vocal}</SelectItem>
                  <SelectItem value="instrumental">{t.releaseWizard.instrumental}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t.releaseWizard.aiUsageLabel}>
              <Select value={draft.aiUsage ?? ""} onValueChange={(v) => set("aiUsage", v as Track["aiUsage"])}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder={t.releaseWizard.selectPlaceholder} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.releaseWizard.aiNotUsed}</SelectItem>
                  <SelectItem value="some">{t.releaseWizard.aiPartial}</SelectItem>
                  <SelectItem value="all">{t.releaseWizard.aiFull}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t.releaseWizard.explicitStatusLabel}>
              <Select value={draft.explicitStatus ?? ""} onValueChange={(v) => {
                set("explicitStatus", v as Track["explicitStatus"]);
                set("isExplicit", v === "explicit");
              }}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder={t.releaseWizard.selectPlaceholder} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_explicit">{t.releaseWizard.nonExplicit}</SelectItem>
                  <SelectItem value="explicit">Explicit</SelectItem>
                  <SelectItem value="censored">{t.releaseWizard.censored}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {draft.audioStyle === "vocal" && (
              <Field label={t.releaseWizard.vocalLanguage}>
                <DictionaryCombobox
                  value={draft.vocalLanguage ?? ""}
                  onChange={(v) => set("vocalLanguage", v)}
                  options={langOpts.options}
                  placeholder="—"
                />
              </Field>
            )}
          </div>

          {/* Lyrics */}
          <Field label={t.releaseWizard.lyricsLabel}>
            <Textarea
              value={draft.lyrics ?? ""}
              onChange={(e) => set("lyrics", e.target.value || null)}
              placeholder={t.releaseWizard.lyricsPlaceholder}
              rows={5}
              className="bg-background/40 font-mono text-sm"
            />
          </Field>

          {/* Contributors */}
          <div className="space-y-5 pt-3 border-t border-border/40">
            <DisplayArtistsEditor value={draft.displayArtists} onChange={(v) => set("displayArtists", v)} />
            <WritersEditor       value={draft.writers}         onChange={(v) => set("writers", v)} />
            <PerformersEditor    value={draft.performers}      onChange={(v) => set("performers", v)} />
            <ProductionEditor    value={draft.production}      onChange={(v) => set("production", v)} />
          </div>

          {/* Save bar */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border/40 sticky bottom-0 bg-card/80 backdrop-blur">
            <Button variant="outline" size="sm" onClick={() => setDraft(track)} disabled={!dirty}>{t.releaseWizard.reset}</Button>
            <Button size="sm" onClick={save} disabled={!dirty || updateTrack.isPending}>
              <Save className="h-4 w-4 mr-1" /> {t.releaseWizard.saveTrack}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <FieldLabel className="text-[11px] text-muted-foreground">{label}</FieldLabel>
      {children}
    </div>
  );
}
