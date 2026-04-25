import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, AlertTriangle, ShieldCheck, FileAudio,
  Music2, ScanSearch, Disc3, ExternalLink, Loader2, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Auto-detected from uploaded audio file (на бэке через ffprobe / mediainfo) */
export type AudioFileInfo = {
  format: string;        // напр. ".wav" / ".flac" — расширение
  sampleRateHz: number;  // напр. 44100
  bitDepth: number;      // напр. 16
  channels: number;      // 2 = stereo
  fileSizeMb: number;    // размер файла
};

export type ModerationTrack = {
  id: number;
  title: string;
  isrc?: string;
  duration: string;
  explicit?: boolean;
  audio?: AudioFileInfo;
};

export type ModerationRelease = {
  id: number;
  title: string;
  artist: string;
  type: string;
  submitted: string;
  upc: string;
  issues: string[];
  coverUrl?: string;
  tracks: ModerationTrack[];
};

/** Эталонные требования платформы */
export const AUDIO_REQUIREMENTS = {
  formats: [".wav", ".flac"] as const,
  sampleRateHz: 44100,
  bitDepth: 16,
};

export function audioMatchesSpec(a?: AudioFileInfo): boolean {
  if (!a) return false;
  return (
    AUDIO_REQUIREMENTS.formats.includes(a.format.toLowerCase() as (typeof AUDIO_REQUIREMENTS.formats)[number]) &&
    a.sampleRateHz === AUDIO_REQUIREMENTS.sampleRateHz &&
    a.bitDepth === AUDIO_REQUIREMENTS.bitDepth
  );
}

export function formatSampleRate(hz: number): string {
  return `${(hz / 1000).toFixed(1)} kHz`;
}

const FAIL_CATEGORIES: { key: string; title: string; reasons: string[] }[] = [
  { key: "artwork",     title: "Artwork",
    reasons: [
      "Низкое разрешение обложки (< 3000×3000)",
      "Текст на обложке не соответствует названию релиза",
      "Логотип DSP / водяной знак на обложке",
      "Изображение содержит контактную информацию / URL",
    ] },
  { key: "titles",      title: "Titles",
    reasons: [
      "Названия не соответствуют тегам аудио",
      "ВСЕ ЗАГЛАВНЫЕ / странное форматирование",
      "Скобки/ремиксы оформлены неверно",
    ] },
  { key: "artists",     title: "Artists",
    reasons: [
      "Featured-артист не указан",
      "Орфография имени артиста не совпадает с профилем",
      "Указан артист, не подтверждённый лейблом",
    ] },
  { key: "album",       title: "Album",
    reasons: [
      "Тип релиза выбран неверно (Single / EP / Album)",
      "Дублирующиеся треки в альбоме",
      "Несоответствие количества треков в metadata",
    ] },
  { key: "composition", title: "Composition",
    reasons: [
      "Не указаны композиторы / авторы",
      "Сплиты роялти не равны 100%",
      "Не указан язык вокала",
    ] },
  { key: "rights",      title: "Rights & Terms of Use",
    reasons: [
      "Harmful to brand",
      "Illegal/unethical (hate speech, discrimination, etc.)",
      "Rejection for rights issues",
      "Rejection & termination for copyright infringement",
      "Rejection & termination for content standards",
      "Usage guidelines violation: warning 1",
      "Usage guidelines violation: warning 2",
      "Usage guidelines violation: warning 3 & account terminated",
      "Rejection for violation of DSP Terms of Use",
      "Incorrect Track Origin/Properties",
      "Inappropriate for UGC DSPs",
    ] },
  { key: "misc",        title: "Miscellaneous",
    reasons: [
      "Дата релиза слишком близкая (< 7 дней)",
      "Территория релиза указана некорректно",
      "Отсутствует UPC / некорректный UPC",
    ] },
];

/* Mock ACRCloud matches — для демо */
const MOCK_ACR_MATCHES = [
  {
    id: 1, title: "Дилам мехохад", artist: "Давлатмандов Ш.",
    label: "Tajik Music", album: "Single", upc: "—", isrc: "—",
    releaseDate: "—", confidence: 100, segments: "1 Segment",
    matchedSegment: "00:00 - 03:24", foundOn: ["Spotify", "Apple Music"],
    isOwn: true,
  },
  {
    id: 2, title: "Empty Wagons", artist: "Roger Rotonda",
    label: "roger", album: "Empty Wagons", upc: "1963620322237", isrc: "—",
    releaseDate: "Oct 28, 2021", confidence: 38, segments: "2 Segments",
    matchedSegment: "00:02 - 00:13", foundOn: ["Deezer", "Spotify", "YouTube"],
    isOwn: false,
  },
  {
    id: 3, title: "Friday Afternoons", artist: "Daniel",
    label: "—", album: "—", upc: "—", isrc: "—",
    releaseDate: "—", confidence: 22, segments: "1 Segment",
    matchedSegment: "00:18 - 00:24", foundOn: ["YouTube"],
    isOwn: false,
  },
];

export function ModerationDialog({
  release, open, onOpenChange, onApprove, onReject,
}: {
  release: ModerationRelease | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApprove: (id: number) => void;
  onReject: (id: number, reasons: string[], comment: string) => void;
}) {
  const { toast } = useToast();
  const [failOpen, setFailOpen] = useState(false);
  const [acrOpen, setAcrOpen] = useState(false);
  const [acrLoading, setAcrLoading] = useState(false);
  const [acrChecked, setAcrChecked] = useState(false);
  const [reasons, setReasons] = useState<Set<string>>(new Set());
  const [otherReasons, setOtherReasons] = useState(false);
  const [comment, setComment] = useState("");

  // Reset internal state when switching releases or closing
  useEffect(() => {
    setFailOpen(false);
    setAcrOpen(false);
    setAcrLoading(false);
    setAcrChecked(false);
    setReasons(new Set());
    setOtherReasons(false);
    setComment("");
  }, [release?.id, open]);

  if (!release) return null;
  const tracks = release.tracks;
  const failedTracks = tracks.filter(t => !audioMatchesSpec(t.audio));
  const allOk = failedTracks.length === 0 && tracks.every(t => t.audio);

  const toggleReason = (r: string) => {
    setReasons(prev => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });
  };

  const handleAcrCheck = () => {
    setAcrOpen(true);
    if (acrChecked) return;
    setAcrLoading(true);
    setTimeout(() => {
      setAcrLoading(false);
      setAcrChecked(true);
    }, 1400);
  };

  const handleApprove = () => {
    onApprove(release.id);
    onOpenChange(false);
    toast({ title: "Релиз одобрен", description: `${release.title} отправлен в очередь доставки.` });
  };

  const handleSubmitReject = () => {
    const list = Array.from(reasons);
    onReject(release.id, list, comment);
    setFailOpen(false);
    onOpenChange(false);
    setReasons(new Set());
    setOtherReasons(false);
    setComment("");
    toast({
      variant: "destructive",
      title: "Релиз возвращён лейблу",
      description: `Причин: ${list.length}${comment ? " · с комментарием" : ""}`,
    });
  };

  return (
    <>
      {/* ── Main Moderation Dialog ── */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/20 border border-border flex items-center justify-center shrink-0">
                {release.coverUrl ? (
                  <img src={release.coverUrl} alt={release.title} className="h-full w-full object-cover rounded-xl" />
                ) : (
                  <Disc3 className="h-9 w-9 text-primary/70" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl">{release.title}</DialogTitle>
                <DialogDescription className="mt-1">
                  {release.artist} · <Badge variant="outline" className="text-[10px] mx-1">{release.type}</Badge>
                  <span className="text-xs">UPC: <span className="font-mono">{release.upc}</span></span>
                </DialogDescription>
                <div className="flex gap-1.5 mt-2">
                  <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                    Pending Moderation
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                    Submitted: {release.submitted}
                  </Badge>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* ── Audio File Requirements (эталон) ── */}
          <Card className="p-4 bg-background/40 border-border/60">
            <div className="flex items-center gap-2 mb-3">
              <FileAudio className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Audio File Requirements</h3>
              <span className="text-[10px] text-muted-foreground">·  определяется автоматически из файла</span>
              {allOk ? (
                <Badge className="ml-auto bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Все треки прошли
                </Badge>
              ) : (
                <Badge className="ml-auto bg-rose-500/15 text-rose-400 border-rose-500/25 text-[10px]">
                  <XCircle className="h-3 w-3 mr-1" /> {failedTracks.length} из {tracks.length} не прошли
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SpecItem label="Допустимые форматы" value={AUDIO_REQUIREMENTS.formats.join(", ")} expected="lossless" ok />
              <SpecItem label="Sampling rate" value={formatSampleRate(AUDIO_REQUIREMENTS.sampleRateHz)} expected="ровно 44.1 kHz" ok />
              <SpecItem label="Bit depth" value={`${AUDIO_REQUIREMENTS.bitDepth} bit`} expected="ровно 16 bit" ok />
            </div>
          </Card>

          {/* ── Tracks ── */}
          <Card className="p-4 bg-background/40 border-border/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold">Tracks ({tracks.length})</h3>
              </div>
              <Button size="sm" variant="outline" onClick={handleAcrCheck} className="h-7 text-xs gap-1.5">
                <ScanSearch className="h-3.5 w-3.5 text-cyan-400" />
                ACRCloud Check
              </Button>
            </div>
            <div className="space-y-1">
              {tracks.map((tr, i) => {
                const a = tr.audio;
                const ok = audioMatchesSpec(a);
                const fmtOk = a && AUDIO_REQUIREMENTS.formats.includes(a.format.toLowerCase() as any);
                const srOk  = a?.sampleRateHz === AUDIO_REQUIREMENTS.sampleRateHz;
                const bdOk  = a?.bitDepth === AUDIO_REQUIREMENTS.bitDepth;
                return (
                  <div key={tr.id} className="py-2.5 px-2 rounded-lg hover:bg-white/[0.025] border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-muted-foreground/50 w-5 text-right">{String(i + 1).padStart(2, "0")}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{tr.title}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">ISRC: {tr.isrc ?? "—"}</p>
                      </div>
                      {tr.explicit && (
                        <Badge variant="outline" className="text-[9px] border-rose-500/30 text-rose-400 bg-rose-500/10">E</Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground font-mono">{tr.duration}</span>
                      {a ? (
                        ok ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[9px] px-1.5">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> OK
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/25 text-[9px] px-1.5">
                            <XCircle className="h-2.5 w-2.5 mr-0.5" /> FAIL
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="text-[9px]">no file</Badge>
                      )}
                    </div>
                    {a && (
                      <div className="mt-1.5 ml-8 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="text-muted-foreground/60">Detected:</span>
                        <span className={cn("px-1.5 py-0.5 rounded font-mono", fmtOk ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>
                          {a.format}
                        </span>
                        <span className={cn("px-1.5 py-0.5 rounded font-mono", srOk ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>
                          {formatSampleRate(a.sampleRateHz)}
                        </span>
                        <span className={cn("px-1.5 py-0.5 rounded font-mono", bdOk ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>
                          {a.bitDepth} bit
                        </span>
                        <span className="px-1.5 py-0.5 rounded font-mono bg-white/[0.03] text-muted-foreground">
                          {a.channels === 2 ? "stereo" : a.channels === 1 ? "mono" : `${a.channels}ch`}
                        </span>
                        <span className="px-1.5 py-0.5 rounded font-mono bg-white/[0.03] text-muted-foreground">
                          {a.fileSizeMb.toFixed(1)} MB
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── QC Issues ── */}
          {release.issues.length > 0 && (
            <Card className="p-4 bg-amber-500/5 border-amber-500/30">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">Auto QC — {release.issues.length} issue(s)</h3>
              </div>
              <ul className="space-y-1">
                {release.issues.map((iss, i) => (
                  <li key={i} className="text-[12px] text-amber-200/80 flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>{iss}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
            <Button
              variant="outline"
              className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
              onClick={() => setFailOpen(true)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Fail & Return
            </Button>
            <Button onClick={handleApprove}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ACRCloud Check Dialog ── */}
      <Dialog open={acrOpen} onOpenChange={setAcrOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              Music recognition matches by <span className="text-cyan-400">ACRCloud</span>
            </DialogTitle>
            <DialogDescription>
              Анализ совпадений по аудио-отпечатку трека «{release.title}»
            </DialogDescription>
          </DialogHeader>

          {acrLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
              <p className="text-sm text-muted-foreground">Сканируем трек по базе ACRCloud…</p>
            </div>
          ) : (
            <Accordion type="single" collapsible defaultValue="match-1" className="space-y-2">
              {MOCK_ACR_MATCHES.map((m, idx) => (
                <AccordionItem
                  key={m.id}
                  value={`match-${m.id}`}
                  className={cn(
                    "rounded-xl border px-4 bg-background/40",
                    m.isOwn
                      ? "border-emerald-500/30"
                      : m.confidence >= 60
                        ? "border-rose-500/40"
                        : "border-border"
                  )}
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <span className="text-[11px] font-bold text-muted-foreground/60">#{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{m.title}</p>
                        <p className="text-[11px] text-muted-foreground">{m.artist}</p>
                      </div>
                      <Badge className={cn(
                        "text-[10px]",
                        m.isOwn
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                          : m.confidence >= 60
                            ? "bg-rose-500/15 text-rose-400 border-rose-500/25"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/25"
                      )}>
                        {m.confidence}% confidence
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1.5 text-[12px] pt-1">
                      <Row k="Scanned Segments" v={<span className="font-semibold underline">{m.segments}</span>} />
                      <Row k="Matched Segment" v={<span className="font-mono">{m.matchedSegment}</span>} />
                      <Row k="Label Name" v={m.label} />
                      <Row k="Album" v={m.album} />
                      <Row k="UPC" v={<span className="font-mono">{m.upc}</span>} />
                      <Row k="ISRC" v={<span className="font-mono">{m.isrc}</span>} />
                      <Row k="Release Date" v={m.releaseDate} />
                      <Row k="Confidence Score" v={<span className="font-bold">{m.confidence}</span>} />
                      {m.foundOn.map(p => (
                        <Row key={p} k="Found On" v={
                          <span className="inline-flex items-center gap-1 font-semibold text-primary">
                            {p} <ExternalLink className="h-3 w-3" />
                          </span>
                        } />
                      ))}
                      {m.isOwn && (
                        <p className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Это совпадение принадлежит вашему каталогу
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAcrOpen(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fail & Return Dialog ── */}
      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>Fail and return release to user for editing</DialogTitle>
            <DialogDescription>Indicate a specific error to the user</DialogDescription>
          </DialogHeader>

          <Accordion type="multiple" className="space-y-2">
            {FAIL_CATEGORIES.map(cat => {
              const checkedCount = cat.reasons.filter(r => reasons.has(`${cat.key}:${r}`)).length;
              return (
                <AccordionItem key={cat.key} value={cat.key}
                  className="rounded-xl border border-border px-4 bg-background/40 data-[state=open]:border-primary/40">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-2 flex-1 text-left">
                      <span className="text-sm font-semibold">{cat.title}</span>
                      {checkedCount > 0 && (
                        <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/25 text-[10px]">
                          {checkedCount}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pt-1">
                      {cat.reasons.map(r => {
                        const id = `${cat.key}:${r}`;
                        return (
                          <label key={r} className="flex items-start gap-2 cursor-pointer text-[12px] hover:bg-white/[0.03] rounded p-1">
                            <Checkbox
                              checked={reasons.has(id)}
                              onCheckedChange={() => toggleReason(id)}
                              className="mt-0.5"
                            />
                            <span>{r}</span>
                          </label>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <label className="flex items-center gap-2 cursor-pointer text-sm rounded-xl border border-border px-4 py-3 bg-background/40">
            <Checkbox checked={otherReasons} onCheckedChange={(v) => setOtherReasons(!!v)} />
            <span className="font-semibold">Other Reasons</span>
          </label>

          {otherReasons && (
            <Textarea
              placeholder="Опишите причину возврата (комментарий лейблу)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            {reasons.size === 0 && !comment.trim() && (
              <p className="text-xs text-muted-foreground sm:mr-auto">
                Выберите хотя бы одну причину или напишите комментарий — без этого вернуть нельзя.
              </p>
            )}
            <Button variant="outline" onClick={() => setFailOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              // Backend требует непустой `note` при отказе. Достаточно либо чекнутой
              // причины, либо текста в комментарии — что соберётся в note на отправке.
              disabled={reasons.size === 0 && !comment.trim()}
              onClick={handleSubmitReject}
            >
              Review & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SpecItem({ label, value, expected, ok }: { label: string; value: string; expected: string; ok: boolean }) {
  return (
    <div className={cn(
      "rounded-lg border p-3",
      ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
    )}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-bold mt-0.5">{value}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">требуется: {expected}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center border-b border-border/30 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}
