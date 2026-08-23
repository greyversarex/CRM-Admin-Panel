import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, AlertCircle, ImageIcon, Music2, Copy, Check } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  useCreateTransferImport,
  useImportReleaseByUpc,
  resolveReleaseLink,
  spotifySearchReleases,
  useListLabels,
  getListTransferImportsQueryKey,
} from "@workspace/api-client-react";
import type { SpotifySearchResult, ResolvedLink } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

/** Подпись + значение в карточке предпросмотра. Пустые поля не прячем: их
 *  отсутствие — тоже информация, релиз придётся дозаполнять руками. */
function PreviewField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("truncate", !value && "text-muted-foreground")} title={value ?? undefined}>
        {value || "—"}
      </div>
    </div>
  );
}

/** Код с кнопкой копирования — их переносят в чужие системы вручную. */
function CodeChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
      <button
        className="text-muted-foreground hover:text-foreground"
        title={`Скопировать ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export default function NewImport() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createImport = useCreateTransferImport();
  const importByUpc = useImportReleaseByUpc();
  const { data: labels } = useListLabels({ limit: 100 });
  const { user } = useAuth();
  const canImportUpc = user?.role === "admin" || user?.role === "manager";
  const { t } = useLang();
  const tt = t.transfer;

  const [link, setLink] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SpotifySearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelId, setLabelId] = useState<string>("none");
  // Источник для импорта по UPC. Deezer и MusicBrainz бесплатны (без ключей/Premium).
  const [upcSource, setUpcSource] = useState<"all" | "spotify" | "deezer" | "musicbrainz">("all");

  const labelName = labelId !== "none" ? labels?.data.find((l) => String(l.id) === labelId)?.name ?? null : null;
  const labelMismatch = !!labelName && result && result.releases.some((r) => r.label && r.label !== labelName);

  // Чистый UPC/EAN — это 8–14 цифр (можно с дефисами/пробелами). По нему
  // импортируем один релиз напрямую, без поиска исполнителя в Spotify.
  // Доступно только admin/manager — для остальных ролей вход в каталог по UPC
  // закрыт (см. серверный requireRole), поэтому численный ввод трактуем как
  // обычный поисковый запрос.
  const trimmedInput = link.trim();
  const compactInput = trimmedInput.replace(/[-\s]/g, "");
  const isUpcInput = canImportUpc && /^\d{8,14}$/.test(compactInput);
  // ISRC: две буквы страны, три знака регистранта, пять цифр года и номера.
  const isIsrcInput = canImportUpc && /^[A-Za-z]{2}[A-Za-z0-9]{3}\d{7}$/.test(compactInput);
  // Ссылку отличаем от имени артиста до отправки: иначе адрес уходил бы в
  // поиск по названию и находил чужие каверы вместо нужного релиза.
  // Предпросмотр по ссылке доступен всем ролям: серверный /releases/resolve-link
  // разрешён и лейблу, и артисту, а подсказка на странице просит вставить ссылку
  // независимо от роли. Схемы может не быть — «deezer.com/album/1» тоже ссылка.
  const isLinkInput = /^(https?:\/\/|spotify:)/i.test(trimmedInput)
    || /^[\w.-]+\.(com|link|page)\//i.test(trimmedInput);
  // Всё, что опознаёт релиз однозначно, идёт через предпросмотр.
  const isPreviewInput = isUpcInput || isIsrcInput || isLinkInput;

  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedLink | null>(null);

  // Сначала показываем, что нашлось, и только по кнопке заводим релиз:
  // ошибиться в одной цифре кода и увидеть это уже внутри созданной записи
  // слишком легко.
  const handleResolveLink = async () => {
    setResolving(true);
    setResolved(null);
    try {
      const r = await resolveReleaseLink({ query: trimmedInput });
      setResolved(r);
    } catch (e: any) {
      const code = String(e?.data?.error ?? "");
      const msg = e?.data?.message ?? e?.message ?? tt.toast_search_failed_desc;
      // Ограничение площадки — не сбой системы: красный «Поиск не удался»
      // пугает и выглядит как поломка.
      const isExpected = code === "platform_unsupported" || code === "artist_link"
        || code === "spotify_unavailable" || code === "no_upc";
      toast({
        title: isExpected ? "Так не сработает" : tt.toast_search_failed,
        description: msg,
        variant: isExpected ? "default" : "destructive",
      });
    } finally {
      setResolving(false);
    }
  };

  const handleImportUpc = async (upcOverride?: string) => {
    try {
      const created = await importByUpc.mutateAsync({ data: { upc: upcOverride ?? compactInput, source: upcSource } });
      queryClient.invalidateQueries({ queryKey: getListTransferImportsQueryKey() });
      toast({
        title: tt.toast_upc_imported,
        description: tt.toast_upc_imported_desc.replace("{title}", created.title),
      });
      setLocation(`/releases/${created.id}`);
    } catch (e: any) {
      const code = String(e?.data?.error ?? "");
      const msg = e?.data?.message ?? e?.message ?? tt.toast_import_failed_desc;
      if (code === "already_exists") {
        toast({ title: tt.toast_upc_exists, description: tt.toast_upc_exists_desc, variant: "destructive" });
      } else if (code === "not_found") {
        toast({ title: tt.toast_upc_not_found, description: tt.toast_upc_not_found_desc, variant: "destructive" });
      } else if (code === "spotify_not_configured") {
        toast({ title: tt.toast_import_failed, description: tt.spotify_not_configured, variant: "destructive" });
      } else {
        toast({ title: tt.toast_import_failed, description: msg, variant: "destructive" });
      }
    }
  };

  const handleSearch = async () => {
    if (!trimmedInput) return;
    // Ссылка, UPC или ISRC опознают конкретный релиз — показываем карточку,
    // импорт пойдёт отдельным подтверждением.
    if (isPreviewInput) {
      await handleResolveLink();
      return;
    }
    setSearching(true);
    try {
      const r = await spotifySearchReleases({ query: trimmedInput });
      setResult(r);
      // Не выбираем автоматически дубликаты (уже есть в каталоге).
      setSelected(new Set(r.releases.filter((rel) => !rel.alreadyInCatalog).slice(0, 2).map((rel) => rel.upc)));
    } catch (e: any) {
      const msg = e?.data?.message ?? e?.message ?? tt.toast_search_failed_desc;
      const isNotConfigured = String(e?.data?.error ?? "") === "spotify_not_configured";
      toast({
        title: tt.toast_search_failed,
        description: isNotConfigured ? tt.spotify_not_configured : msg,
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const toggleAll = (on: boolean) => {
    if (!result) return;
    // «Выбрать все» пропускает дубликаты — их переносить повторно нельзя.
    setSelected(on ? new Set(result.releases.filter((r) => !r.alreadyInCatalog).map((r) => r.upc)) : new Set());
  };
  const selectableCount = result ? result.releases.filter((r) => !r.alreadyInCatalog).length : 0;

  const handleImport = async () => {
    if (!result || selected.size === 0) return;
    const items = result.releases
      .filter((r) => selected.has(r.upc))
      .map((r) => ({
        upc: r.upc,
        title: r.title,
        artist: r.artist,
        label: labelName ?? r.label ?? null,
        tracks: r.tracks,
        coverUrl: r.coverUrl ?? null,
        releaseDate: r.releaseDate ?? null,
        success: true,
      }));
    try {
      const created = await createImport.mutateAsync({
        data: {
          spotifyArtistId: result.artistId,
          spotifyArtistName: result.artistName,
          labelName,
          items,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListTransferImportsQueryKey() });
      toast({
        title: tt.toast_import_started,
        description: tt.toast_import_started_desc.replace("{n}", String(created.importedCount)),
      });
      setLocation("/releases/transfer");
    } catch (e: any) {
      toast({
        title: tt.toast_import_failed,
        description: e?.message ?? tt.toast_import_failed_desc,
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <button onClick={() => setLocation("/releases/transfer")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40">
          <ChevronLeft className="h-3.5 w-3.5" /> {tt.back_to_transfer}
        </button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt.new_import_title}</h1>
        </div>

        <Card className="bg-emerald-500/10 border border-emerald-500/30">
          <CardContent className="p-4 flex gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Music2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-xs text-emerald-200/90 leading-relaxed">
              {tt.info_card}
              <br />
              {tt.info_card_2}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="p-4 space-y-2">
            <label className="text-xs text-muted-foreground">{tt.input_label}</label>
            <div className="flex gap-2">
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={tt.input_placeholder}
                className="bg-background/40 font-mono text-xs"
                data-testid="input-spotify-link"
              />
              <Button onClick={handleSearch} disabled={!trimmedInput || searching || resolving || importByUpc.isPending} variant="outline" className="bg-background/40" data-testid="button-search">
                {importByUpc.isPending ? tt.importing_upc
                  : resolving || searching ? tt.searching
                  : isPreviewInput ? "Найти релиз"
                  : tt.find_artist}
              </Button>
            </div>
            {isPreviewInput && !resolved && (
              <p className="text-[11px] text-muted-foreground pt-1">
                {isIsrcInput ? "Похоже на ISRC — найдём трек и его релиз."
                  : isUpcInput ? "Похоже на UPC — найдём релиз целиком."
                  : "Ссылки Spotify и Deezer работают напрямую. Apple Music код релиза не отдаёт — для неё укажите UPC или ISRC."}
                {" "}Сначала покажем, что нашлось, импорт — отдельной кнопкой.
              </p>
            )}
            {isUpcInput && (
              <div className="flex items-center gap-2 pt-1">
                <label className="text-xs text-muted-foreground whitespace-nowrap">{tt.source_label}</label>
                <Select value={upcSource} onValueChange={(v) => setUpcSource(v as "spotify" | "deezer" | "musicbrainz")}>
                  <SelectTrigger className="bg-background/40 h-8 w-56 text-xs" data-testid="select-upc-source"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tt.source_all}</SelectItem>
                    <SelectItem value="deezer">{tt.source_deezer}</SelectItem>
                    <SelectItem value="spotify">{tt.source_spotify}</SelectItem>
                    <SelectItem value="musicbrainz">{tt.source_musicbrainz}</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">{tt.source_hint}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {resolved && (
          <Card className="bg-card/50 backdrop-blur border-border/50" data-testid="card-resolved-link">
            <CardContent className="p-5 space-y-5">
              <div className="flex gap-5">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-lg font-semibold truncate">{resolved.trackTitle ?? resolved.title ?? "—"}</div>
                  {resolved.artist && <div className="text-sm text-muted-foreground">от {resolved.artist}</div>}
                  {resolved.releaseDate && (
                    <div className="text-sm text-muted-foreground">
                      Вышел {new Date(resolved.releaseDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  )}
                </div>
                {resolved.coverUrl && (
                  <img src={resolved.coverUrl} alt="" className="h-24 w-24 rounded-md object-cover border border-border/60 shrink-0" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <CodeChip label="UPC" value={resolved.upc} />
                {resolved.isrc && <CodeChip label="ISRC" value={resolved.isrc} />}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <PreviewField label="Лейбл" value={resolved.label} />
                <PreviewField label="Жанры" value={resolved.genres?.length ? resolved.genres.join(", ") : null} />
                <PreviewField label="Треков" value={resolved.trackCount != null ? String(resolved.trackCount) : null} />
                <PreviewField label="Тип" value={resolved.releaseType} />
                {resolved.durationSec != null && (
                  <PreviewField label="Длительность" value={`${Math.floor(resolved.durationSec / 60)}м ${resolved.durationSec % 60}с`} />
                )}
                {resolved.explicit != null && (
                  <PreviewField label="Ненормативная лексика" value={resolved.explicit ? "Да" : "Нет"} />
                )}
              </div>

              {resolved.tracks && resolved.tracks.length > 0 && (
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-background/40 border-b border-border/60">
                    Треки релиза — {resolved.tracks.length}
                  </div>
                  {/* Список прокручивается: у альбома их бывает под сотню,
                      а карточка не должна растягивать страницу. */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
                    {resolved.tracks.map((t) => (
                      <div key={`${t.number}-${t.title}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                          {t.number}
                        </span>
                        <span className="flex-1 min-w-0 truncate" title={t.title}>{t.title}</span>
                        {t.explicit && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-amber-500/15 text-amber-300">
                            explicit
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {t.isrc ?? "без ISRC"}
                        </span>
                        <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                          {t.durationSec != null
                            ? `${Math.floor(t.durationSec / 60)}:${String(t.durationSec % 60).padStart(2, "0")}`
                            : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resolved.existingReleaseId ? (
                <div className="flex items-center gap-2 text-xs text-amber-300 rounded p-2 bg-amber-500/10 border border-amber-500/30">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Этот релиз уже в каталоге — «{resolved.existingReleaseTitle}».{" "}
                    <button className="underline" onClick={() => setLocation(`/releases/${resolved.existingReleaseId}`)}>
                      Открыть
                    </button>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => handleImportUpc(resolved.upc)}
                    disabled={importByUpc.isPending}
                    data-testid="button-import-resolved"
                  >
                    {importByUpc.isPending ? tt.importing_upc : "Импортировать в каталог"}
                  </Button>
                  <Button variant="ghost" onClick={() => setResolved(null)} disabled={importByUpc.isPending}>
                    Отмена
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500/40 to-violet-500/40 flex items-center justify-center overflow-hidden">
                    {result.artistImage
                      ? <img src={result.artistImage} className="h-full w-full object-cover" alt="" />
                      : <ImageIcon className="h-5 w-5 text-white/70" />}
                  </div>
                  <div>
                    <div className="font-semibold">{result.artistName}</div>
                    <div className="text-xs text-muted-foreground">{tt.artist_word} · {tt.spotify_id}: {result.artistId}</div>
                  </div>
                  <div className="ml-auto w-64">
                    <label className="text-xs text-muted-foreground block mb-1">{tt.select_label}</label>
                    <Select value={labelId} onValueChange={setLabelId}>
                      <SelectTrigger className="bg-background/40 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tt.none_use_spotify}</SelectItem>
                        {labels?.data.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {result.source === "deezer" && (
                  // У Deezer артисты-тёзки слиты в одну страницу: под именем
                  // «Yasmina» там лежат релизы нескольких разных исполнителей.
                  // Поэтому список обязательно смотреть глазами, а не грузить целиком.
                  <div className="text-xs flex items-start gap-2 rounded p-2 bg-amber-500/10 border border-amber-500/30 text-amber-200">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Поиск шёл по Deezer — Spotify оказался недоступен. Deezer объединяет
                      исполнителей с одинаковыми именами — проверьте список, среди релизов
                      могут оказаться чужие. Надёжнее переносить по ссылке или UPC.
                    </span>
                  </div>
                )}
                {labelMismatch && (
                  <div className="text-xs flex items-start gap-2 rounded p-2 bg-amber-500/10 border border-amber-500/30 text-amber-200">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-semibold">{tt.label_mismatch_warning}</span> {tt.label_mismatch_text}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-3 border-b border-border/40">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectableCount > 0 && selected.size === selectableCount}
                      onCheckedChange={(v) => toggleAll(!!v)}
                      data-testid="checkbox-select-all"
                    />
                    {tt.select_all}
                  </label>
                  <div className="text-xs text-muted-foreground">
                    {tt.selected}: <span className="text-foreground font-semibold">{selected.size}</span> / {tt.releases_count}: <span className="text-emerald-400 font-semibold">{result.releases.length}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-background/30 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 w-10"></th>
                        <th className="text-left px-3 py-2">{tt.col_release}</th>
                        <th className="text-left px-3 py-2">{tt.col_artist}</th>
                        <th className="text-left px-3 py-2">{tt.col_label}</th>
                        <th className="text-left px-3 py-2">{tt.col_upc}</th>
                        <th className="text-left px-3 py-2">{tt.col_tracks}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {result.releases.map((r) => {
                        const checked = selected.has(r.upc);
                        const mismatch = !!labelName && r.label && r.label !== labelName;
                        return (
                          <tr key={r.upc} className={cn("hover:bg-accent/20", checked && "bg-primary/5", r.alreadyInCatalog && "opacity-50")} data-testid={`row-release-${r.upc}`}>
                            <td className="px-3 py-2">
                              <Checkbox checked={checked} disabled={r.alreadyInCatalog} onCheckedChange={(v) => {
                                const next = new Set(selected);
                                if (v) next.add(r.upc); else next.delete(r.upc);
                                setSelected(next);
                              }} />
                            </td>
                            <td className="px-3 py-2 flex items-center gap-2">
                              <div className="h-7 w-7 rounded bg-muted flex items-center justify-center overflow-hidden">
                                {r.coverUrl
                                  ? <img src={assetHref(r.coverUrl)} className="h-full w-full object-cover" alt="" />
                                  : <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                              </div>
                              {r.title}
                              {r.alreadyInCatalog && (
                                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">{tt.already_in_catalog}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{r.artist}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {r.label || "—"}
                              {mismatch && <AlertCircle className="inline h-3 w-3 text-amber-400 ml-1" />}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.upc}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.tracks}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setLocation("/releases/transfer")}>{tt.cancel}</Button>
              <Button
                onClick={handleImport}
                disabled={selected.size === 0 || createImport.isPending}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                data-testid="button-import"
              >
                {createImport.isPending ? tt.importing : tt.import_n.replace("{n}", String(selected.size))}
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
