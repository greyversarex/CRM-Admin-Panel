import { Layout } from "@/components/layout";
import { useListTransferImports } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronDown, CheckCircle2, AlertCircle, Plus, ArrowLeft, Music2, User } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function TransferTrack() {
  const [, setLocation] = useLocation();
  const { data: imports, isLoading } = useListTransferImports();
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <button onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Releases
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Transfer Track</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Import your existing releases from Spotify (by ISRC / UPC). Click each import to expand details.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation("/releases")} className="bg-card">
              <ArrowLeft className="mr-2 h-4 w-4" /> Go to Releases
            </Button>
            <Button onClick={() => setLocation("/releases/transfer/new")}>
              <Plus className="mr-2 h-4 w-4" /> New Import
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            : imports?.length === 0
              ? <Card className="bg-card/50 border-border/50"><CardContent className="p-10 text-center text-sm text-muted-foreground">No imports yet. Click "New Import" to start.</CardContent></Card>
              : imports?.map((imp) => {
                  const open = openId === imp.id;
                  const isError = imp.status === "error";
                  return (
                    <Card key={imp.id} className={cn("bg-card/50 backdrop-blur border-border/50 overflow-hidden", isError && "border-rose-500/30")}>
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
                              {isError ? "Error" : "Complete"}
                              <span className="ml-2 text-muted-foreground font-normal">
                                {isError
                                  ? `Failed to import ${imp.failedCount} Release(s)`
                                  : `Imported ${imp.importedCount} Release(s)`}
                              </span>
                            </div>
                            {imp.spotifyArtistName && (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                Source: {imp.spotifyArtistName}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-muted-foreground">
                          <span>{new Date(imp.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
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
                              <Step title="Upload assets" desc="Upload audio and assign to appropriate tracks. Album art may need to be provided in some cases." done />
                              <Step title="Complete metadata" desc="Populate audio style: vocal or instrumental, explicit status, and specify DSPs for delivery." done />
                              <Step title="Review release" desc="Review your release, bring it up to DSP standards, and submit it for approval." done />
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
                                  </div>
                                  <div className="text-muted-foreground hidden sm:block">Label: <span className="text-foreground">{it.label || "—"}</span></div>
                                  <div className="text-muted-foreground hidden sm:block">Tracks: <span className="text-foreground">{it.tracks}</span></div>
                                  <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border", it.success ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10")}>
                                    {it.success ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                                    {it.success ? "Success" : "Failed"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {isError && (
                            <p className="text-xs text-rose-300/80">
                              The batch failed validation. Common causes: ISRC conflicts, missing audio assets, or unknown DSP mapping. Retry from "New Import".
                            </p>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
        </div>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed pt-2 border-t border-border/40">
          With this release now approved and submitted, you have agreed to the terms of the agreement signed with Tajik Music Distribution. You hereby agree that all samples, musical works, vocals, and other compositions used within this release are owned by the label/artist or properly licensed for distribution to the partners chosen.
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
