import { useState } from "react";
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
import { ChevronDown, ChevronUp, Trash2, Music2, Save, Wand2 } from "lucide-react";
import { AudioUploader, assetHref } from "@/components/asset-uploader";
import { GENRES, SUBGENRES, LANGS, COUNTRIES } from "./types";
import {
  DisplayArtistsEditor, WritersEditor, PerformersEditor, ProductionEditor,
} from "./contributors-editor";

/** Создаёт заглушечный, но валидный ISRC «XX-AAA-YY-NNNNN». Сервер примет
 *  любой 12-символьный код. Полноценная регистрация в Soundscan у нас вне
 *  скоупа — это удобство для самиздата. */
function generateIsrc(): string {
  const yy = String(new Date().getFullYear()).slice(-2);
  const nnnnn = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
  return `TJ-CTM-${yy}-${nnnnn}`.replace(/-/g, "");
}

export function TrackCard({
  track, releaseId, expanded, onExpandToggle,
}: {
  track: Track;
  releaseId: number;
  expanded: boolean;
  onExpandToggle: () => void;
}) {
  const qc = useQueryClient();
  const updateTrack = useUpdateTrack();
  const deleteTrack = useDeleteTrack();
  const [draft, setDraft] = useState<Track>(track);
  const dirty = JSON.stringify(draft) !== JSON.stringify(track);

  const set = <K extends keyof Track>(k: K, v: Track[K]) => setDraft((p) => ({ ...p, [k]: v }));

  const save = async () => {
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
          explicitStatus: draft.explicitStatus,
          aiUsage: draft.aiUsage,
          clipStartSeconds: draft.clipStartSeconds,
          recordingYear: draft.recordingYear ?? null,
          countryOfRecording: draft.countryOfRecording ?? null,
          audioStyle: draft.audioStyle,
          vocalLanguage: draft.vocalLanguage ?? null,
          lyrics: draft.lyrics ?? null,
          audioUrl: draft.audioUrl ?? null,
          displayArtists: draft.displayArtists,
          writers: draft.writers,
          performers: draft.performers,
          production: draft.production,
        },
      });
      qc.invalidateQueries({ queryKey: getListTracksQueryKey({ release_id: releaseId }) });
      qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(releaseId) });
      toast({ title: "Трек сохранён" });
    } catch (e: any) {
      toast({ title: "Не удалось сохранить", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!confirm(`Удалить трек «${track.title}»?`)) return;
    try {
      await deleteTrack.mutateAsync({ id: track.id });
      qc.invalidateQueries({ queryKey: getListTracksQueryKey({ release_id: releaseId }) });
      qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(releaseId) });
      toast({ title: "Трек удалён" });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const subgenresFor = draft.genre ? (SUBGENRES[draft.genre] ?? []) : [];

  return (
    <Card className="bg-card/40 border-border/50">
      {/* Заголовок: номер + название + аудио + раскрывашка */}
      <div className="flex items-center gap-3 p-3">
        <div className="text-xs text-muted-foreground tabular-nums w-6">#{track.trackNumber ?? "?"}</div>
        <Music2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Название трека"
          className="bg-background/40 flex-1 min-w-0"
        />
        {draft.audioUrl ? (
          <audio controls className="h-7 max-w-[200px]" src={assetHref(draft.audioUrl)} />
        ) : (
          <span className="text-[11px] text-amber-500 italic">аудио не загружено</span>
        )}
        <Button size="sm" variant="outline" onClick={onExpandToggle}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="ml-1">{expanded ? "Свернуть" : "Audio Details"}</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={remove} title="Удалить трек">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border/40 p-4 space-y-5">
          {/* Audio + ISRC + Clip ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FieldLabel className="text-xs text-muted-foreground">Аудио (.wav рекомендуется)</FieldLabel>
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
                  <Button type="button" variant="outline" size="icon" title="Сгенерировать ISRC"
                    onClick={() => set("isrc", generateIsrc())}><Wand2 className="h-4 w-4" /></Button>
                </div>
              </Field>
              <Field label="ISWC (для composition rights)">
                <Input value={draft.iswc ?? ""} onChange={(e) => set("iswc", e.target.value)}
                  placeholder="T-123.456.789-0" className="bg-background/40 font-mono" />
              </Field>
              <Field label="Track #">
                <Input type="number" min={1} value={draft.trackNumber ?? 1}
                  onChange={(e) => set("trackNumber", Number(e.target.value) || null)}
                  className="bg-background/40" />
              </Field>
              <Field label="Clip start (сек)">
                <Input type="number" min={0} value={draft.clipStartSeconds}
                  onChange={(e) => set("clipStartSeconds", Number(e.target.value) || 0)}
                  className="bg-background/40" />
              </Field>
              <Field label="Track version">
                <Input value={draft.trackVersion ?? ""} onChange={(e) => set("trackVersion", e.target.value || null)}
                  placeholder="Acoustic, Remix..." className="bg-background/40" />
              </Field>
              <Field label="Год записи">
                <Input type="number" min={1900} max={new Date().getFullYear()}
                  value={draft.recordingYear ?? ""}
                  onChange={(e) => set("recordingYear", e.target.value ? Number(e.target.value) : null)}
                  className="bg-background/40" />
              </Field>
            </div>
          </div>

          {/* Жанр / Язык / Country / AI / Audio Style / Explicit */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Жанр">
              <Select value={draft.genre ?? ""} onValueChange={(v) => set("genre", v)}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="Выберите..." /></SelectTrigger>
                <SelectContent>{GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Сабжанр">
              <Select value={draft.subgenre ?? ""} onValueChange={(v) => set("subgenre", v)} disabled={subgenresFor.length === 0}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{subgenresFor.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Язык метаданных">
              <Select value={draft.language ?? ""} onValueChange={(v) => set("language", v)}>
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>{LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Страна записи">
              <Select value={draft.countryOfRecording ?? ""} onValueChange={(v) => set("countryOfRecording", v)}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Audio Style">
              <Select value={draft.audioStyle} onValueChange={(v) => set("audioStyle", v as Track["audioStyle"])}>
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vocal">Вокал</SelectItem>
                  <SelectItem value="instrumental">Инструментал</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Использование AI *">
              <Select value={draft.aiUsage} onValueChange={(v) => set("aiUsage", v as Track["aiUsage"])}>
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не используется</SelectItem>
                  <SelectItem value="some">Частично (вокал/гитара)</SelectItem>
                  <SelectItem value="all">Полностью сгенерировано AI</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Explicit статус">
              <Select value={draft.explicitStatus} onValueChange={(v) => {
                set("explicitStatus", v as Track["explicitStatus"]);
                set("isExplicit", v === "explicit");
              }}>
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_explicit">Не Explicit</SelectItem>
                  <SelectItem value="explicit">Explicit</SelectItem>
                  <SelectItem value="censored">Cенз. версия</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {draft.audioStyle === "vocal" && (
              <Field label="Язык вокала">
                <Select value={draft.vocalLanguage ?? ""} onValueChange={(v) => set("vocalLanguage", v)}>
                  <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>

          {/* Lyrics */}
          <Field label="Текст песни (lyrics)">
            <Textarea
              value={draft.lyrics ?? ""}
              onChange={(e) => set("lyrics", e.target.value || null)}
              placeholder="Текст по строкам..."
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
            <Button variant="outline" size="sm" onClick={() => setDraft(track)} disabled={!dirty}>Сбросить</Button>
            <Button size="sm" onClick={save} disabled={!dirty || updateTrack.isPending}>
              <Save className="h-4 w-4 mr-1" /> Сохранить трек
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
