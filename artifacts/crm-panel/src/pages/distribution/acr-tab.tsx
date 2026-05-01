/**
 * Distribution / ACRCloud tab — список проверок аудио-отпечатка + запуск новой.
 */
import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { ScanSearch, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Search, X, ChevronDown, ChevronRight, Music, Clock, Database, Hash, Fingerprint, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";
import { useListReleases } from "@workspace/api-client-react";

interface AcrCheck {
  id: number;
  releaseId: number | null;
  trackId: number | null;
  status: string;
  confidence: string | null;
  matchedTitle: string | null;
  matchedArtist: string | null;
  matchedIsrc: string | null;
  matchedLabel: string | null;
  resultJson: Record<string, unknown> | null;
  errorMessage: string | null;
  scannedAt: string;
}

export function AcrTab() {
  const [checks, setChecks] = useState<AcrCheck[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showJson, setShowJson] = useState<Set<number>>(new Set());

  // Search state
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const releasesQ = useListReleases({ limit: 200 });
  const releases = releasesQ.data?.data ?? [];

  const filtered = query.trim()
    ? releases.filter((r) =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        String(r.id).includes(query.trim())
      )
    : releases;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ checks: AcrCheck[]; configured: boolean }>("/api/distribution/acr/checks");
      setChecks(r.checks); setConfigured(r.configured);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectRelease = (id: number, title: string) => {
    setSelectedId(id);
    setSelectedTitle(title);
    setQuery(title);
    setOpen(false);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedTitle("");
    setQuery("");
    inputRef.current?.focus();
  };

  const scan = async () => {
    if (!selectedId) { toast({ title: "Выберите релиз", variant: "destructive" }); return; }
    setScanning(true);
    try {
      await adminApi("/api/distribution/acr/scan", { method: "POST", body: JSON.stringify({ releaseId: selectedId }) });
      toast({ title: "Проверка запущена" });
      clearSelection();
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setScanning(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">ACRCloud — проверка аудио</h3>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-xs text-muted-foreground">Сравнение аудио-отпечатка трека с глобальной базой авторских прав.</span>
            {configured
              ? <Badge variant="default">credentials configured</Badge>
              : <Badge variant="destructive">credentials not configured</Badge>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-acr">
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
        </Button>
      </div>

      {!configured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-xs text-amber-400">
          Для запуска сканирования укажите ключи ACRCloud в разделе <strong>Настройки → Интеграции</strong> (host, access key, access secret).
        </div>
      )}

      <div className="rounded-md border bg-card p-3 flex items-end gap-2">
        <div className="flex-1 relative">
          <Label className="text-xs mb-1.5 block">Поиск релиза для сканирования</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" style={{ color: "hsl(220 12% 52%)" }} />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
                setSelectedTitle("");
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Введите название или ID релиза…"
              className="pl-8 pr-8"
              data-testid="input-acr-release-id"
            />
            {query && (
              <button
                onClick={clearSelection}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                style={{ color: "hsl(220 12% 52%)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {open && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-card shadow-xl max-h-52 overflow-y-auto"
            >
              {releasesQ.isLoading ? (
                <div className="p-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">Ничего не найдено</div>
              ) : (
                filtered.slice(0, 20).map((r) => (
                  <button
                    key={r.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 flex items-center justify-between gap-2 transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); selectRelease(r.id, r.title); }}
                  >
                    <span className="truncate">{r.title}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {r.status === "pending_review" && (
                        <span className="text-[10px] text-amber-400">на модерации</span>
                      )}
                      <span className="text-[10px] text-muted-foreground/60">#{r.id}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <Button
          onClick={() => void scan()}
          disabled={!selectedId || scanning}
          data-testid="button-acr-scan"
          className="mb-0"
        >
          {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1" />}
          Запустить
        </Button>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {checks.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Проверок ещё не было.
            <span className="block mt-1 text-xs opacity-60">Найдите релиз выше и нажмите «Запустить».</span>
          </div>
        ) : checks.map((c) => (
          <ScanReportCard
            key={c.id}
            check={c}
            releaseTitle={releases.find((r) => r.id === c.releaseId)?.title ?? `Релиз #${c.releaseId}`}
            isExpanded={expanded.has(c.id)}
            isJsonOpen={showJson.has(c.id)}
            onToggleExpand={() => setExpanded((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
            onToggleJson={() => setShowJson((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * ScanReportCard — детальный отчёт по одной проверке ACRCloud.
 * Показывает: статус, технические метаданные скана, найденные совпадения
 * с полным набором полей из ACRCloud (включая внешние ссылки на стриминги),
 * и raw JSON по требованию.
 * ========================================================================== */

interface ScanReportCardProps {
  check: AcrCheck;
  releaseTitle: string;
  isExpanded: boolean;
  isJsonOpen: boolean;
  onToggleExpand: () => void;
  onToggleJson: () => void;
}

/** Runtime-guard: возвращает безопасный объект-словарь или пустой. */
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x)) : [];
}

function ScanReportCard({ check: c, releaseTitle, isExpanded, isJsonOpen, onToggleExpand, onToggleJson }: ScanReportCardProps) {
  const rj = asRecord(c.resultJson);
  const scanMeta = asRecord(rj["_scan_meta"]);
  const acrStatus = asRecord(rj["status"]);
  const acrMetadata = asRecord(rj["metadata"]);
  const musicMatches = asArray(acrMetadata["music"]);
  const costTime = typeof rj["cost_time"] === "number" ? (rj["cost_time"] as number) : null;
  const resultType = rj["result_type"];
  const acrVersion = typeof acrStatus["version"] === "string" ? acrStatus["version"] : null;
  const acrCode = typeof acrStatus["code"] === "number" ? acrStatus["code"] : null;
  const acrMsg = typeof acrStatus["msg"] === "string" ? acrStatus["msg"] : null;

  const sampleBytes = typeof scanMeta["sample_bytes"] === "number" ? scanMeta["sample_bytes"] as number : null;
  const sampleKb = typeof scanMeta["sample_kb"] === "number" ? scanMeta["sample_kb"] as number : null;
  const sampleOffsetKb = typeof scanMeta["sample_offset_kb"] === "number" ? scanMeta["sample_offset_kb"] as number : null;
  const totalFileKb = typeof scanMeta["total_file_kb"] === "number" ? scanMeta["total_file_kb"] as number : null;
  const samplePositionPct = typeof scanMeta["sample_position_pct"] === "number" ? scanMeta["sample_position_pct"] as number : null;
  const acrHost = typeof scanMeta["acr_host"] === "string" ? scanMeta["acr_host"] as string : null;
  const fetchMs = typeof scanMeta["fetch_ms"] === "number" ? scanMeta["fetch_ms"] as number : null;
  const identifyMs = typeof scanMeta["identify_ms"] === "number" ? scanMeta["identify_ms"] as number : null;
  const totalMs = typeof scanMeta["total_ms"] === "number" ? scanMeta["total_ms"] as number : null;
  const requestedAt = typeof scanMeta["requested_at_utc"] === "string" ? scanMeta["requested_at_utc"] as string : null;
  const completedAt = typeof scanMeta["completed_at_utc"] === "string" ? scanMeta["completed_at_utc"] as string : null;
  const audioUrl = typeof scanMeta["audio_url"] === "string" ? scanMeta["audio_url"] as string : null;

  const statusColor =
    c.status === "matched" ? "text-orange-400" :
    c.status === "clean" ? "text-green-400" :
    c.status === "error" ? "text-destructive" :
    "text-muted-foreground";

  const statusBg =
    c.status === "matched" ? "bg-orange-500/8 border-orange-500/25" :
    c.status === "clean" ? "bg-green-500/8 border-green-500/25" :
    c.status === "error" ? "bg-destructive/10 border-destructive/30" :
    "bg-muted/30 border-border";

  return (
    <div className="p-4" data-testid={`row-acr-${c.id}`}>
      {/* === HEADER ROW === */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-controls={`acr-report-${c.id}`}
        className="w-full text-left flex items-start gap-3 group"
      >
        <div className="mt-0.5 shrink-0">
          {c.status === "matched" ? <AlertTriangle className={`h-5 w-5 ${statusColor}`} /> :
           c.status === "clean" ? <CheckCircle2 className={`h-5 w-5 ${statusColor}`} /> :
           c.status === "error" ? <AlertTriangle className={`h-5 w-5 ${statusColor}`} /> :
           <Loader2 className={`h-5 w-5 ${statusColor} animate-spin`} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="font-semibold text-sm">{releaseTitle}</span>
            {c.trackId && <span className="text-xs text-muted-foreground">· Трек #{c.trackId}</span>}
            <Badge
              variant={c.status === "matched" ? "destructive" : c.status === "error" ? "secondary" : "outline"}
              className={c.status === "clean" ? "border-green-500/40 text-green-400" : ""}
            >
              {c.status === "matched" ? "совпадение" : c.status === "clean" ? "чисто" : c.status === "error" ? "ошибка" : c.status}
            </Badge>
            <span className="text-[11px] font-mono text-muted-foreground">#{c.id}</span>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{fmtDate(c.scannedAt)}</span>
          </div>

          {/* Краткая сводка (всегда видна) */}
          <div className="mt-1 text-xs text-muted-foreground">
            {c.status === "matched" && c.matchedTitle ? (
              <>«{c.matchedTitle}» — {c.matchedArtist ?? "?"} · уверенность {c.confidence ?? "?"}%</>
            ) : c.status === "clean" ? (
              <>Совпадений не найдено · {sampleKb ?? "?"} КБ проанализировано · {totalMs ?? "?"} мс</>
            ) : c.status === "error" ? (
              <>{c.errorMessage}</>
            ) : (
              <>Идёт обработка…</>
            )}
          </div>
        </div>
      </button>

      {/* === EXPANDED REPORT === */}
      {isExpanded && (
        <div id={`acr-report-${c.id}`} className={`mt-3 rounded-lg border ${statusBg} overflow-hidden`}>
          {/* === ВЕРДИКТ === */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className={`text-sm font-semibold ${statusColor} flex items-center gap-2`}>
              {c.status === "matched" && <>Обнаружено совпадение в базе ACRCloud</>}
              {c.status === "clean" && <>Аудио-отпечаток уникален — совпадений не найдено</>}
              {c.status === "error" && <>Ошибка идентификации</>}
              {c.status === "pending" && <>Идёт обработка отпечатка…</>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {c.status === "matched" && (
                <>Аудио-сэмпл совпал с {musicMatches.length === 1 ? "одной записью" : `${musicMatches.length} записями`} в глобальной базе авторских прав ACRCloud (~75 млн треков). Это означает, что трек уже зарегистрирован под существующим правообладателем.</>
              )}
              {c.status === "clean" && (
                <>Аудио-отпечаток (acoustic fingerprint) сравнён с глобальной базой ACRCloud (~75 млн коммерческих записей и пользовательского контента). Совпадений не обнаружено — трек считается оригинальным с точки зрения сервиса распознавания.</>
              )}
              {c.status === "clean" && (
                <div className="mt-2.5 rounded-md bg-yellow-500/8 border border-yellow-500/20 px-2.5 py-2 text-[11.5px] text-yellow-200/90">
                  <div className="font-medium text-yellow-300/90 mb-1">Если вы уверены, что это известный трек, возможные причины «чистого» результата:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-yellow-200/70">
                    <li>База ACRCloud охватывает в основном западную и азиатскую коммерческую музыку — региональные треки (таджикские, узбекские, казахские) часто не индексируются, даже если очень популярны локально.</li>
                    <li>Это может быть другая версия трека (live, кавер, ремикс, ремастер) — отпечаток отличается от оригинала.</li>
                    <li>Если файл начинается с длинной тишины, эффектов или нестандартного интро — взятый сэмпл мог попасть мимо узнаваемой части.</li>
                    <li>Низкое качество записи (плохая запись с микрофона, перекодирование с потерями) ослабляет отпечаток.</li>
                  </ul>
                </div>
              )}
              {c.status === "error" && (
                <>Не удалось получить ответ от сервиса распознавания. Подробности в технических данных ниже.</>
              )}
            </div>
          </div>

          {/* === MUSIC MATCHES (если есть) === */}
          {c.status === "matched" && musicMatches.length > 0 && (
            <div className="border-b border-white/5">
              {musicMatches.slice(0, 5).map((m, idx) => <MatchEntry key={idx} match={m} index={idx} />)}
              {musicMatches.length > 5 && (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  …и ещё {musicMatches.length - 5} совпадений в полном JSON-ответе ниже.
                </div>
              )}
            </div>
          )}

          {/* === ТЕХНИЧЕСКИЕ ДАННЫЕ СКАНА === */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="text-xs font-semibold text-foreground/80 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Fingerprint className="h-3 w-3" /> Технические данные скана
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
              <DetailRow icon={<Hash className="h-3 w-3" />} label="ID проверки" value={`#${c.id}`} mono />
              {acrCode !== null && <DetailRow label="Код ACRCloud" value={`${acrCode}${acrMsg ? ` (${acrMsg})` : ""}`} mono />}
              {acrVersion && <DetailRow label="Версия API" value={acrVersion} mono />}
              {acrHost && <DetailRow icon={<Globe className="h-3 w-3" />} label="Сервер" value={acrHost} mono />}
              {sampleBytes !== null && (
                <DetailRow
                  icon={<Database className="h-3 w-3" />}
                  label="Размер сэмпла"
                  value={`${sampleKb} КБ (${sampleBytes.toLocaleString("ru-RU")} б)`}
                  mono
                />
              )}
              {totalFileKb !== null && (
                <DetailRow
                  label="Размер файла"
                  value={`${totalFileKb.toLocaleString("ru-RU")} КБ`}
                  mono
                />
              )}
              {sampleOffsetKb !== null && samplePositionPct !== null && (
                <DetailRow
                  label="Сэмпл взят с позиции"
                  value={`${sampleOffsetKb.toLocaleString("ru-RU")} КБ (${samplePositionPct}% файла)`}
                  mono
                />
              )}
              {fetchMs !== null && <DetailRow icon={<Clock className="h-3 w-3" />} label="Загрузка аудио" value={`${fetchMs} мс`} mono />}
              {identifyMs !== null && <DetailRow icon={<Clock className="h-3 w-3" />} label="Идентификация" value={`${identifyMs} мс`} mono />}
              {totalMs !== null && <DetailRow icon={<Clock className="h-3 w-3" />} label="Всего" value={`${totalMs} мс`} mono />}
              {costTime !== null && <DetailRow label="Время на стороне ACRCloud" value={`${costTime.toFixed(3)} с`} mono />}
              {resultType !== undefined && <DetailRow label="Тип результата" value={String(resultType)} mono />}
              {requestedAt && <DetailRow label="Запрос отправлен (UTC)" value={requestedAt} mono />}
              {completedAt && <DetailRow label="Ответ получен (UTC)" value={completedAt} mono />}
              {audioUrl && <DetailRow label="Источник аудио" value={audioUrl} mono span2 />}
            </div>
          </div>

          {/* === ОШИБКА === */}
          {c.status === "error" && c.errorMessage && (
            <div className="px-4 py-3 border-b border-white/5 text-xs text-destructive/90 bg-destructive/5 font-mono break-all">
              {c.errorMessage}
            </div>
          )}

          {/* === RAW JSON === */}
          <div className="px-4 py-2.5 bg-black/20">
            <button
              type="button"
              onClick={onToggleJson}
              aria-expanded={isJsonOpen}
              aria-controls={`acr-json-${c.id}`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              {isJsonOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {isJsonOpen ? "Скрыть" : "Показать"} полный JSON-ответ от ACRCloud (с метаданными скана)
            </button>
            {isJsonOpen && (
              <pre id={`acr-json-${c.id}`} className="mt-2 text-[10.5px] leading-tight font-mono text-muted-foreground bg-black/40 border border-white/5 rounded p-3 max-h-96 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(c.resultJson, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value, mono, span2 }: { icon?: ReactNode; label: string; value: string; mono?: boolean; span2?: boolean }) {
  return (
    <div className={`flex items-start gap-1.5 ${span2 ? "md:col-span-3 col-span-2" : ""}`}>
      {icon && <span className="text-muted-foreground/50 mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/60">{label}</div>
        <div className={`text-foreground/90 break-all ${mono ? "font-mono text-[11px]" : "text-xs"}`}>{value}</div>
      </div>
    </div>
  );
}

function MatchEntry({ match: m, index }: { match: Record<string, unknown>; index: number }) {
  const title = typeof m["title"] === "string" ? m["title"] : null;
  const artistsArr = asArray(m["artists"]);
  const artists = artistsArr.map((a) => typeof a["name"] === "string" ? a["name"] : null).filter((s): s is string => Boolean(s)).join(", ");
  const albumObj = asRecord(m["album"]);
  const album = typeof albumObj["name"] === "string" ? albumObj["name"] : null;
  const label = typeof m["label"] === "string" ? m["label"] : null;
  const releaseDate = typeof m["release_date"] === "string" ? m["release_date"] : null;
  const durationMs = typeof m["duration_ms"] === "number" ? m["duration_ms"] as number : null;
  const playOffsetMs = typeof m["play_offset_ms"] === "number" ? m["play_offset_ms"] as number : null;
  const score = typeof m["score"] === "number" ? m["score"] as number : null;
  const externalIds = asRecord(m["external_ids"]);
  const externalMeta = asRecord(m["external_metadata"]);
  const genresArr = asArray(m["genres"]);
  const genres = genresArr.map((g) => typeof g["name"] === "string" ? g["name"] : null).filter((s): s is string => Boolean(s));
  const acrid = typeof m["acrid"] === "string" ? m["acrid"] : null;
  const isrc = typeof externalIds["isrc"] === "string" ? externalIds["isrc"] as string : null;
  const upc = typeof externalIds["upc"] === "string" ? externalIds["upc"] as string : null;

  const spotify = externalMeta["spotify"] as { track?: { id?: string }; album?: { id?: string }; artists?: Array<{ id?: string }> } | undefined;
  const youtube = externalMeta["youtube"] as { vid?: string } | undefined;
  const deezer = externalMeta["deezer"] as { track?: { id?: string | number } } | undefined;

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="px-4 py-3 border-t border-white/5 first:border-t-0">
      <div className="flex items-start gap-2">
        <Music className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Совпадение #{index + 1}</span>
            {score !== null && (
              <span className={`text-xs font-bold ${score >= 80 ? "text-orange-400" : "text-foreground/80"}`}>
                {score}% уверенности
              </span>
            )}
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">{title ?? "Без названия"}</div>
          {artists && <div className="text-xs text-muted-foreground">{artists}</div>}

          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            {album && <DetailRow label="Альбом" value={album} />}
            {label && <DetailRow label="Лейбл" value={label} />}
            {releaseDate && <DetailRow label="Дата релиза" value={releaseDate} mono />}
            {durationMs !== null && <DetailRow label="Длительность" value={`${fmtMs(durationMs)} (${durationMs} мс)`} mono />}
            {playOffsetMs !== null && <DetailRow label="Совпало в позиции" value={fmtMs(playOffsetMs)} mono />}
            {isrc && <DetailRow label="ISRC" value={isrc} mono />}
            {upc && <DetailRow label="UPC" value={upc} mono />}
            {acrid && <DetailRow label="ACR ID" value={acrid} mono />}
            {genres && genres.length > 0 && <DetailRow label="Жанры" value={genres.join(", ")} />}
          </div>

          {/* Внешние ссылки */}
          {(spotify?.track?.id || youtube?.vid || deezer?.track?.id) && (
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/60">Найдено также в:</span>
              {spotify?.track?.id && (
                <a
                  href={`https://open.spotify.com/track/${spotify.track.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs px-2 py-0.5 rounded bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/25 transition-colors"
                >
                  Spotify
                </a>
              )}
              {youtube?.vid && (
                <a
                  href={`https://youtube.com/watch?v=${youtube.vid}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors"
                >
                  YouTube
                </a>
              )}
              {deezer?.track?.id && (
                <a
                  href={`https://www.deezer.com/track/${deezer.track.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-colors"
                >
                  Deezer
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
