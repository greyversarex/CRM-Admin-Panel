/**
 * Полнокартонный модальный диалог модерации релиза.
 *
 * Источник данных: GET /api/distribution/moderation/:releaseId/details
 * Действия:        PATCH /api/releases/:id/status  ({status, note})
 *
 * Структура (соответствует professional reference из attached_assets):
 *   1. Header: cover + title + artists + status + UPC + submitted-at
 *   2. Audio File Requirements card (X из N не прошли) с тремя tile'ами
 *   3. Tracks list — каждая строка с tech-specs и FAIL/OK badge
 *   4. Auto QC issues — список с trackId-привязкой
 *   5. ACR history (если есть)
 *   6. Footer actions: Закрыть · Отклонить (с обязательным note) · Одобрить
 *
 * Все цифры (sample rate, bit depth, channels, codec, размер) приходят из
 * assets-таблицы: они извлекаются music-metadata при загрузке файла, либо
 * через одноразовый POST /distribution/backfill-audio-tech для legacy-данных.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, CheckCircle2, XCircle, AlertCircle, ShieldAlert, FileMusic, Music2, ScanSearch,
  Image as ImageIcon, Calendar, Globe, Disc3, Hash, Loader2, ExternalLink, Languages,
  PenTool, Mic, Sliders,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// ─── Типы ответа от /distribution/moderation/:id/details ───────────────

type Audio = {
  filename: string; mimeType: string; sizeBytes: number;
  sampleRateHz: number | null; bitDepth: number | null;
  channels: number | null; codec: string | null; bitrateKbps: number | null;
};
type Requirements = { ok: boolean; missing: boolean; checks: { format: boolean; sampleRate: boolean; bitDepth: boolean } };
type Contributor = { name: string; role?: string; share?: number };
type TrackDetail = {
  id: number; position: number | null; title: string; trackVersion: string | null;
  isrc: string | null; durationSeconds: number | null;
  explicitStatus: string; aiUsage: string;
  recordingYear: number | null; countryOfRecording: string | null;
  audioStyle: string; vocalLanguage: string | null; hasLyrics: boolean;
  displayArtists: Contributor[]; writers: Contributor[]; performers: Contributor[]; production: Contributor[];
  audio: Audio | null; requirements: Requirements;
};
type DetailResponse = {
  release: {
    id: number; title: string; releaseType: string; releaseVersion: string | null;
    catalogNumber: string | null; upc: string | null; status: string; statusNote: string | null;
    genre: string | null; subgenre: string | null; language: string | null;
    isExplicit: boolean; isCompilation: boolean; isVariousArtists: boolean;
    releaseDate: string | null; releaseTime: string | null;
    cLine: string | null; cLineYear: number | null; pLine: string | null; pLineYear: number | null;
    submittedAt: string; riskScore: number | null; riskFactors: Array<{ code: string; severity: string; message?: string }>;
  };
  legacyArtist: { id: number; name: string } | null;
  label: { id: number; name: string } | null;
  artists: Array<{ artistId: number; name: string; role: string; position: number }>;
  dsps: string[];
  cover: { id: number; filename: string; mimeType: string; sizeBytes: number; objectPath: string } | null;
  tracks: TrackDetail[];
  acr: { status: string; totalChecks: number; latest: Array<{ id: number; scannedAt: string; status: string; confidence: number | null; matchedTitle: string | null; matchedArtist: string | null }> };
  requirements: { losslessMimes: string[]; minSampleRate: number; minBitDepth: number };
  issues: Array<{ code: string; severity: "error" | "warning"; message: string; trackId?: number }>;
};

// ─── Утилиты ───────────────────────────────────────────────────────────

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}
async function jpatch<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PATCH", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

function fmtMb(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${mb.toFixed(1)} МБ`;
}
function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtKHz(hz: number | null): string {
  if (!hz) return "—";
  return `${(hz / 1000).toFixed(1)} kHz`;
}
function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("wav"))  return ".wav";
  if (m.includes("flac")) return ".flac";
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  if (m.includes("aac"))  return ".aac";
  if (m.includes("ogg"))  return ".ogg";
  return mime.split("/")[1] ? `.${mime.split("/")[1]}` : "—";
}
function statusLabel(s: string): string {
  return ({
    draft: "Черновик", pending_review: "На модерации", approved: "Одобрен",
    rejected: "Отклонён", delivering: "Доставляется", live: "В эфире",
  } as Record<string, string>)[s] ?? s;
}

// ─── Компонент ─────────────────────────────────────────────────────────

export function ModerationDetailDialog({
  releaseId,
  onClose,
  onDecided,
}: {
  releaseId: number;
  onClose: () => void;
  onDecided: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["moderation-detail", releaseId],
    queryFn: () => jget<DetailResponse>(`/api/distribution/moderation/${releaseId}/details`),
  });

  const decide = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      jpatch(`/api/releases/${releaseId}/status`, { status, note: note.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moderation"] });
      qc.invalidateQueries({ queryKey: ["moderation-detail", releaseId] });
      onDecided();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось сохранить решение", description: e.message }),
  });

  const errors  = useMemo(() => q.data?.issues.filter((i) => i.severity === "error")  ?? [], [q.data]);
  const warns   = useMemo(() => q.data?.issues.filter((i) => i.severity === "warning") ?? [], [q.data]);
  const reqFail = useMemo(() => q.data?.tracks.filter((t) => !t.requirements.ok && !t.requirements.missing).length ?? 0, [q.data]);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[920px] max-h-[92vh] overflow-y-auto p-0 gap-0">
        {q.isLoading && <div className="p-6 space-y-4"><Skeleton className="h-32" /><Skeleton className="h-48" /></div>}

        {q.data && (
          <>
            {/* Header */}
            <Header data={q.data} onClose={onClose} />

            <div className="px-6 pb-6 space-y-5">
              {/* Top error banner */}
              {errors.length > 0 && (
                <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-3 flex items-start gap-2" data-testid="banner-errors">
                  <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold text-red-700 dark:text-red-300">{errors.length} критическая ошибка{errors.length === 1 ? "" : errors.length < 5 ? "и" : "" }</div>
                    <div className="text-xs text-red-700/80 dark:text-red-300/80">Релиз нельзя одобрить, пока ошибки не устранены.</div>
                  </div>
                </div>
              )}

              {/* Release meta */}
              <ReleaseMetaCard data={q.data} />

              {/* Audio File Requirements */}
              <RequirementsCard data={q.data} reqFail={reqFail} />

              {/* Tracks */}
              <TracksCard tracks={q.data.tracks} />

              {/* QC issues */}
              {(errors.length + warns.length) > 0 && (
                <IssuesCard errors={errors} warns={warns} />
              )}

              {/* ACR history */}
              {q.data.acr.totalChecks > 0 && <AcrCard acr={q.data.acr} />}

              {/* Comment */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Комментарий (попадёт в releases.status_note и в email-уведомление)
                </label>
                <Textarea
                  value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Например: «Обложка ниже 3000×3000 — пришлите версию большего размера»"
                  rows={3}
                  data-testid="textarea-decision-note"
                />
                {errors.length === 0 && warns.length === 0 && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    Все автоматические проверки пройдены — релиз готов к одобрению.
                  </p>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-t bg-muted/30 px-6 py-4 flex items-center justify-end gap-2 sticky bottom-0">
              <Button variant="outline" onClick={onClose} data-testid="button-close">Закрыть</Button>
              <Button
                variant="destructive"
                disabled={decide.isPending || !note.trim()}
                onClick={() => decide.mutate("rejected")}
                data-testid="button-reject"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Отклонить ({errors.length} ошибок)
              </Button>
              <Button
                disabled={decide.isPending || errors.length > 0}
                onClick={() => decide.mutate("approved")}
                data-testid="button-approve"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Одобрить релиз
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Под-карточки ──────────────────────────────────────────────────────

function Header({ data, onClose }: { data: DetailResponse; onClose: () => void }) {
  const { release, artists, legacyArtist, label } = data;
  const primaryArtists = artists.length > 0
    ? artists.map((a) => a.name).join(", ")
    : (legacyArtist?.name ?? "—");

  return (
    <div className="border-b px-6 py-4 flex items-start gap-4 sticky top-0 bg-background z-10">
      <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
        {data.cover
          ? <ImageIcon className="h-8 w-8 text-muted-foreground" />
          : <Disc3 className="h-8 w-8 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold truncate" data-testid="text-release-title">{release.title}</h2>
          <Badge variant="outline" className="capitalize">{release.releaseType}</Badge>
          {release.isExplicit && <Badge className="bg-red-500/15 text-red-700 dark:text-red-300" variant="outline">explicit</Badge>}
        </div>
        <div className="text-sm text-muted-foreground mt-1 truncate">
          {primaryArtists}{label ? ` · ${label.name}` : ""} {release.upc ? ` · UPC: ${release.upc}` : ""}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">{statusLabel(release.status)}</Badge>
          <span className="text-xs text-muted-foreground">
            Получено: {new Date(release.submittedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-x">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ReleaseMetaCard({ data }: { data: DetailResponse }) {
  const { release, artists, dsps } = data;
  const fmt = (v: string | number | null | undefined) => (v == null || v === "" ? "—" : String(v));
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Disc3 className="h-4 w-4" /> Метаданные релиза</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <Field icon={Hash} label="Каталожный №" value={fmt(release.catalogNumber)} />
        <Field icon={Hash} label="UPC" value={fmt(release.upc)} mono />
        <Field icon={Music2} label="Жанр" value={`${fmt(release.genre)}${release.subgenre ? ` / ${release.subgenre}` : ""}`} />
        <Field icon={Globe} label="Язык" value={fmt(release.language)} />
        <Field icon={Calendar} label="Дата релиза" value={`${fmt(release.releaseDate)}${release.releaseTime ? ` ${release.releaseTime}` : ""}`} />
        <Field icon={ScanSearch} label="© Copyright" value={`${fmt(release.cLineYear)} ${fmt(release.cLine)}`} />
        <Field icon={ScanSearch} label="℗ Phonogram" value={`${fmt(release.pLineYear)} ${fmt(release.pLine)}`} />
        {release.releaseVersion && <Field icon={Sliders} label="Версия" value={release.releaseVersion} />}
        {release.isCompilation && <Field icon={Disc3} label="Сборник" value="да" />}
      </div>
      {artists.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-xs text-muted-foreground mb-1">Primary-артисты ({artists.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {artists.map((a) => (
                <Badge key={a.artistId} variant="outline" className="text-xs">
                  {a.name}{a.role !== "primary" ? ` (${a.role})` : ""}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}
      {dsps.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-xs text-muted-foreground mb-1">Выбранные площадки ({dsps.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {dsps.map((d) => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ icon: Icon, label, value, mono }: { icon: typeof Hash; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" />{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function RequirementsCard({ data, reqFail }: { data: DetailResponse; reqFail: number }) {
  const { requirements: r, tracks } = data;
  const total = tracks.filter((t) => t.audio).length;
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileMusic className="h-4 w-4 text-blue-500" /> Audio File Requirements</h3>
        {reqFail > 0
          ? <Badge className="bg-red-500/15 text-red-700 dark:text-red-300" data-testid="badge-req-fail">{reqFail} из {total} не прошли</Badge>
          : total > 0 ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">все треки соответствуют</Badge>
                     : <Badge variant="outline">нет загруженного аудио</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">Технические характеристики определяются автоматически из заголовка файла.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReqTile title="Допустимые форматы" value=".wav, .flac" hint="требуется: lossless" />
        <ReqTile title="Sampling Rate" value={`${r.minSampleRate / 1000} kHz`} hint={`требуется: не ниже ${r.minSampleRate / 1000} kHz`} />
        <ReqTile title="Bit Depth" value={`${r.minBitDepth} bit`} hint={`требуется: не ниже ${r.minBitDepth} bit`} />
      </div>
    </div>
  );
}

function ReqTile({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border p-3 bg-muted/30">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function TracksCard({ tracks }: { tracks: TrackDetail[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Music2 className="h-4 w-4" />Треки ({tracks.length})</h3>
      {tracks.length === 0 && <div className="text-sm text-muted-foreground">В релизе ещё нет треков.</div>}
      <div className="space-y-2">
        {tracks.map((t) => {
          const ck = t.requirements;
          const failed = ck.missing || !ck.ok;
          const isOpen = expanded === t.id;
          return (
            <div key={t.id} className="border rounded-md" data-testid={`row-track-${t.id}`}>
              <button
                className="w-full text-left p-3 flex items-start gap-3 hover:bg-accent/40"
                onClick={() => setExpanded(isOpen ? null : t.id)}
                data-testid={`button-expand-track-${t.id}`}
              >
                <div className="font-mono text-xs text-muted-foreground w-6 pt-1">
                  {String(t.position ?? "?").padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.title}{t.trackVersion ? ` (${t.trackVersion})` : ""}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ISRC: <span className="font-mono">{t.isrc ?? "—"}</span>
                  </div>
                  {t.audio && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs">
                      <Tag tone="blue">{extFromMime(t.audio.mimeType)}</Tag>
                      <Tag tone={ck.checks.sampleRate ? "emerald" : "red"}>{fmtKHz(t.audio.sampleRateHz)}</Tag>
                      <Tag tone={ck.checks.bitDepth ? "emerald" : "red"}>{t.audio.bitDepth ? `${t.audio.bitDepth} bit` : "—"}</Tag>
                      <Tag tone="muted">{t.audio.channels === 2 ? "stereo" : t.audio.channels === 1 ? "mono" : `${t.audio.channels ?? "?"} ch`}</Tag>
                      <Tag tone="muted">{fmtMb(t.audio.sizeBytes)}</Tag>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className="text-sm tabular-nums text-muted-foreground">{fmtDuration(t.durationSeconds)}</div>
                  {ck.missing
                    ? <Badge className="bg-red-500/15 text-red-700 dark:text-red-300"><AlertCircle className="h-3 w-3 mr-1" />нет аудио</Badge>
                    : failed
                      ? <Badge className="bg-red-500/15 text-red-700 dark:text-red-300"><XCircle className="h-3 w-3 mr-1" />FAIL</Badge>
                      : <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>}
                </div>
              </button>
              {isOpen && <TrackDetailsExpanded t={t} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "blue" | "emerald" | "red" | "muted" }) {
  const cls =
    tone === "emerald" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
    tone === "red"     ? "bg-red-500/15 text-red-700 dark:text-red-300" :
    tone === "blue"    ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" :
                         "bg-muted text-muted-foreground";
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>{children}</span>;
}

function TrackDetailsExpanded({ t }: { t: TrackDetail }) {
  return (
    <div className="border-t bg-muted/20 p-3 space-y-3 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <KV label="Explicit" value={t.explicitStatus.replace("_", " ")} />
        <KV label="AI Usage" value={t.aiUsage} />
        <KV label="Audio Style" value={t.audioStyle} />
        <KV label="Vocal Lang" value={t.vocalLanguage ?? "—"} />
        <KV label="Recording Year" value={t.recordingYear?.toString() ?? "—"} />
        <KV label="Country" value={t.countryOfRecording ?? "—"} />
        <KV label="Lyrics" value={t.hasLyrics ? "загружены" : "нет"} />
        {t.audio && <KV label="Codec" value={t.audio.codec ?? "—"} />}
      </div>

      <ContribGroup icon={Mic} title="Display Artists" items={t.displayArtists} />
      <ContribGroup icon={PenTool} title="Writers" items={t.writers} showShare />
      <ContribGroup icon={Mic} title="Performers" items={t.performers} />
      <ContribGroup icon={Sliders} title="Production" items={t.production} />
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function ContribGroup({ icon: Icon, title, items, showShare }: { icon: typeof Mic; title: string; items: Contributor[]; showShare?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1"><Icon className="h-3 w-3" />{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((c, i) => (
          <Badge key={`${c.name}-${i}`} variant="outline" className="text-xs">
            {c.name}
            {c.role && <span className="text-muted-foreground ml-1">· {c.role}</span>}
            {showShare && c.share != null && <span className="text-muted-foreground ml-1">· {c.share}%</span>}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function IssuesCard({ errors, warns }: { errors: DetailResponse["issues"]; warns: DetailResponse["issues"] }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        Auto QC — {errors.length + warns.length} замечани{errors.length + warns.length === 1 ? "е" : "й"}
      </h3>
      <ul className="space-y-1.5 text-sm">
        {errors.map((i, n) => (
          <li key={`e-${n}`} className="flex items-start gap-2 text-red-600 dark:text-red-400" data-testid={`issue-error-${i.code}`}>
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{i.message}</span>
          </li>
        ))}
        {warns.map((i, n) => (
          <li key={`w-${n}`} className="flex items-start gap-2 text-amber-600 dark:text-amber-400" data-testid={`issue-warning-${i.code}`}>
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AcrCard({ acr }: { acr: DetailResponse["acr"] }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <ScanSearch className="h-4 w-4" />ACRCloud — {acr.totalChecks} проверок
        <Badge className={
          acr.status === "match" ? "bg-red-500/15 text-red-700 dark:text-red-300" :
          acr.status === "clean" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
          "bg-muted text-muted-foreground"
        } variant="outline">{acr.status}</Badge>
      </h3>
      {acr.latest.length > 0 && (
        <div className="text-xs space-y-1">
          {acr.latest.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Languages className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground tabular-nums">{new Date(c.scannedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</span>
              <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
              {c.confidence != null && <span className="text-muted-foreground">conf: {c.confidence}</span>}
              {c.matchedTitle && <span className="truncate">→ {c.matchedTitle} {c.matchedArtist ? `(${c.matchedArtist})` : ""}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
