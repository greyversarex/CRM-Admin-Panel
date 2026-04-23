import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, AlertCircle, ImageIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  useCreateTransferImport,
  spotifySearchReleases,
  useListLabels,
  getListTransferImportsQueryKey,
} from "@workspace/api-client-react";
import type { SpotifySearchResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function NewImport() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createImport = useCreateTransferImport();
  const { data: labels } = useListLabels({ limit: 100 });

  const [link, setLink] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SpotifySearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelId, setLabelId] = useState<string>("none");

  const labelName = labelId !== "none" ? labels?.data.find((l) => String(l.id) === labelId)?.name ?? null : null;
  const labelMismatch = !!labelName && result && result.releases.some((r) => r.label && r.label !== labelName);

  const handleSearch = async () => {
    if (!link.trim()) return;
    setSearching(true);
    try {
      const r = await spotifySearchReleases({ query: link.trim() });
      setResult(r);
      setSelected(new Set(r.releases.slice(0, 2).map((rel) => rel.upc)));
    } catch (e: any) {
      toast({ title: "Search failed", description: e?.message ?? "Could not query Spotify.", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const toggleAll = (on: boolean) => {
    if (!result) return;
    setSelected(on ? new Set(result.releases.map((r) => r.upc)) : new Set());
  };

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
        success: true,
      }));
    try {
      await createImport.mutateAsync({
        data: {
          spotifyArtistId: result.artistId,
          spotifyArtistName: result.artistName,
          labelName,
          items,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListTransferImportsQueryKey() });
      toast({ title: "Import started", description: `Importing ${items.length} release(s).` });
      setLocation("/releases/transfer");
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <button onClick={() => setLocation("/releases/transfer")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Transfer Track
        </button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Import</h1>
        </div>

        <Card className="bg-emerald-500/10 border border-emerald-500/30">
          <CardContent className="p-4 flex gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <span className="text-emerald-400 text-sm font-bold">♫</span>
            </div>
            <div className="text-xs text-emerald-200/90 leading-relaxed">
              Paste your Spotify artist link and click "Find my artist". Your Spotify releases will appear below. Use the checkboxes to select which releases to import, then click "Import" to begin.
              <br />
              We display up to 30 releases at a time. If you don't see all your releases, after import completes, run the search again to pull more.
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="p-4 space-y-2">
            <label className="text-xs text-muted-foreground">Spotify artist link or UPC code</label>
            <div className="flex gap-2">
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://open.spotify.com/artist/..."
                className="bg-background/40 font-mono text-xs"
              />
              <Button onClick={handleSearch} disabled={!link.trim() || searching} variant="outline" className="bg-background/40">
                {searching ? "Searching…" : "Find my artist"}
              </Button>
            </div>
          </CardContent>
        </Card>

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
                    <div className="text-xs text-muted-foreground">Artist · Spotify ID: {result.artistId}</div>
                  </div>
                  <div className="ml-auto w-64">
                    <label className="text-xs text-muted-foreground block mb-1">Select a label</label>
                    <Select value={labelId} onValueChange={setLabelId}>
                      <SelectTrigger className="bg-background/40 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None (use Spotify label)</SelectItem>
                        {labels?.data.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {labelMismatch && (
                  <div className="text-xs flex items-start gap-2 rounded p-2 bg-amber-500/10 border border-amber-500/30 text-amber-200">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-semibold">Warning:</span> The selected label does not match the Spotify label for some releases. You can still import — you'll be able to keep or change the label per release before final submission.
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
                      checked={selected.size === result.releases.length}
                      onCheckedChange={(v) => toggleAll(!!v)}
                    />
                    Select All
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Selected: <span className="text-foreground font-semibold">{selected.size}</span> / Releases: <span className="text-emerald-400 font-semibold">{result.releases.length}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-background/30 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 w-10"></th>
                        <th className="text-left px-3 py-2">Release</th>
                        <th className="text-left px-3 py-2">Artist</th>
                        <th className="text-left px-3 py-2">Label</th>
                        <th className="text-left px-3 py-2">UPC</th>
                        <th className="text-left px-3 py-2">Tracks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {result.releases.map((r) => {
                        const checked = selected.has(r.upc);
                        const mismatch = !!labelName && r.label && r.label !== labelName;
                        return (
                          <tr key={r.upc} className={cn("hover:bg-accent/20", checked && "bg-primary/5")}>
                            <td className="px-3 py-2">
                              <Checkbox checked={checked} onCheckedChange={(v) => {
                                const next = new Set(selected);
                                if (v) next.add(r.upc); else next.delete(r.upc);
                                setSelected(next);
                              }} />
                            </td>
                            <td className="px-3 py-2 flex items-center gap-2">
                              <div className="h-7 w-7 rounded bg-muted flex items-center justify-center overflow-hidden">
                                {r.coverUrl
                                  ? <img src={r.coverUrl} className="h-full w-full object-cover" alt="" />
                                  : <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                              </div>
                              {r.title}
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
              <Button variant="outline" onClick={() => setLocation("/releases/transfer")}>Cancel</Button>
              <Button onClick={handleImport} disabled={selected.size === 0 || createImport.isPending} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                {createImport.isPending ? "Importing…" : `Import ${selected.size}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
