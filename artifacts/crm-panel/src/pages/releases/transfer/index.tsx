import { Layout } from "@/components/layout";
import { useListTransferImports } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronDown, CheckCircle2, AlertCircle, Plus, ArrowLeft, Music2, User } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export default function TransferTrack() {
  const [, setLocation] = useLocation();
  const { data: imports, isLoading } = useListTransferImports();
  const [openId, setOpenId] = useState<number | null>(null);
  const { t, lang } = useLang();
  const tt = t.transfer;
  const dateLocale = lang === "ru" ? "ru-RU" : "en-US";

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <button onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40">
          <ChevronLeft className="h-3.5 w-3.5" /> {tt.back_to_releases}
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{tt.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">{tt.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation("/releases")} className="bg-card">
              <ArrowLeft className="mr-2 h-4 w-4" /> {tt.go_to_releases}
            </Button>
            <Button onClick={() => setLocation("/releases/transfer/new")} data-testid="button-new-import">
              <Plus className="mr-2 h-4 w-4" /> {tt.new_import}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            : imports?.length === 0
              ? <Card className="bg-card/50 border-border/50"><CardContent className="p-10 text-center text-sm text-muted-foreground">{tt.empty}</CardContent></Card>
              : imports?.map((imp) => {
                  const open = openId === imp.id;
                  const isError = imp.status === "error";
                  return (
                    <Card key={imp.id} className={cn("bg-card/50 backdrop-blur border-border/50 overflow-hidden", isError && "border-rose-500/30")} data-testid={`row-import-${imp.id}`}>
                      <button
                        onClick={() => setOpenId(open ? null : imp.id)}
                        className="w-full flex items-center justify-between gap-4 p-4 hover:bg-accent/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {isError
                            ? <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
                            : <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">
                              {isError ? tt.status_error : tt.status_complete}
                              <span className="ml-2 text-muted-foreground font-normal">
                                {isError
                                  ? tt.failed_count.replace("{n}", String(imp.failedCount))
                                  : tt.imported_count.replace("{n}", String(imp.importedCount))}
                              </span>
                            </div>
                            {imp.spotifyArtistName && (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                {tt.source}: {imp.spotifyArtistName}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-muted-foreground">
                          <span>{new Date(imp.createdAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })}</span>
                          {imp.createdByName && (
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              <User className="h-3 w-3" />
                              {imp.createdByName}
                            </span>
                          )}
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                      </button>
                      {open && (
                        <div className="border-t border-border/50 p-4 bg-background/30 space-y-4">
                          {!isError && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                              <Step title={tt.step_upload_title} desc={tt.step_upload_desc} done />
                              <Step title={tt.step_metadata_title} desc={tt.step_metadata_desc} done />
                              <Step title={tt.step_review_title} desc={tt.step_review_desc} done />
                            </div>
                          )}
                          {imp.items.length > 0 && (
                            <div className="rounded-md border border-border/50 divide-y divide-border/40">
                              {imp.items.map((it) => (
                                <div key={it.upc} className="flex items-center gap-3 px-3 py-2 text-xs">
                                  <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm">{it.title}</div>
                                    <div className="text-muted-foreground font-mono text-[10px]">UPC: {it.upc}</div>
                                    {it.errorReason && (
                                      <div className="text-rose-300/80 text-[11px] mt-0.5">{it.errorReason}</div>
                                    )}
                                  </div>
                                  <div className="text-muted-foreground hidden sm:block">{tt.label_word}: <span className="text-foreground">{it.label || "—"}</span></div>
                                  <div className="text-muted-foreground hidden sm:block">{tt.tracks_word}: <span className="text-foreground">{it.tracks}</span></div>
                                  <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border", it.success ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10")}>
                                    {it.success ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                                    {it.success ? tt.success_word : tt.failed_word}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {isError && (
                            <p className="text-xs text-rose-300/80">{tt.error_hint}</p>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
        </div>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed pt-2 border-t border-border/40">
          {tt.legal_note}
        </p>
      </div>
    </Layout>
  );
}

function Step({ title, desc, done }: { title: string; desc: string; done?: boolean }) {
  return (
    <div className="flex gap-2">
      <CheckCircle2 className={cn("h-4 w-4 shrink-0 mt-0.5", done ? "text-emerald-400" : "text-muted-foreground/40")} />
      <div>
        <div className="font-semibold text-foreground">{title}</div>
        <div className="text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
