import { Layout } from "@/components/layout";
import { useGetRelease, useUpdateReleaseStatus, useUpdateRelease, getGetReleaseQueryKey, getListReleasesQueryKey, getGetReleaseCountsQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ImageIcon, Edit3, XCircle, Globe2, Music2, AlertTriangle,
  Headphones, Calendar, Tag,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const DSPS = ["Spotify", "Apple Music", "YouTube Music", "Yandex", "VK Music", "Tidal", "Boom", "Zvooq", "Amazon"];
const TAKEDOWN_REASONS = [
  "Other", "Legal/contractual obligations", "Incorrect metadata",
  "Wrong audio file", "Replacement release", "Artist request",
];

export default function ReleaseDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { data: release, isLoading, error } = useGetRelease(id, {
    query: { enabled: Number.isFinite(id) && id > 0, retry: false },
  });
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [takedownOpen, setTakedownOpen] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetReleaseQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListReleasesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !release) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h2 className="text-xl font-semibold">Release not found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            We couldn't load release #{params.id}. It may have been deleted, or you don't have access to it.
          </p>
          <Button onClick={() => setLocation("/releases")} className="mt-2">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Releases
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* back */}
        <button onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Releases
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{release.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review your release for any issues before submitting to our review team for a final guideline check.
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={takedownOpen} onOpenChange={setTakedownOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="bg-card border-rose-500/30 text-rose-300 hover:bg-rose-500/10">
                  <XCircle className="mr-2 h-4 w-4" /> Take Down
                </Button>
              </DialogTrigger>
              <TakeDownDialog
                releaseId={id}
                onClose={() => { setTakedownOpen(false); invalidateAll(); }}
              />
            </Dialog>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary">
                  <Edit3 className="mr-2 h-4 w-4" /> Edit Release
                </Button>
              </DialogTrigger>
              <EditReleaseDialog
                releaseId={id}
                title={release.title}
                onClose={() => { setEditOpen(false); invalidateAll(); }}
              />
            </Dialog>
          </div>
        </div>

        {/* Status */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge status={release.status} className="text-xs" />
              {release.statusNote && (
                <span className="text-xs text-muted-foreground">— {release.statusNote}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Updated {new Date(release.updatedAt).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        {/* Release Details */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Release Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
            <div className="space-y-3">
              <KV label="Release Title" value={release.title} highlight />
              <KV label="Metadata Language" value={release.language || "English"} />
              <KV label="Primary Artist" value={release.artistName} chip />
              <KV label="Label" value={release.labelName || "Independent"} />
              <KV label="Release Date" value={release.releaseDate ? new Date(release.releaseDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "TBD"} />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <KV label="Genre" value={release.genre || "—"} />
                <KV label="Subgenre" value="—" />
                <KV label="UPC" value={release.upc || "Pending"} mono />
                <KV label="Release Type" value={release.releaseType} cap />
                <KV label="Tracks" value={String(release.totalTracks)} />
                <KV label="Explicit Content" value={release.isExplicit ? "Yes" : "No"} />
                <KV label="P-Line" value={release.pLine || "—"} />
                <KV label="C-Line" value={release.cLine || "—"} />
                <KV label="Territories" value={(release.territories || ["WW"]).join(", ")} />
              </div>
            </div>
            <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border/50">
              {release.coverUrl
                ? <img src={release.coverUrl} alt={release.title} className="h-full w-full object-cover" />
                : (
                  <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground/50 gap-2 bg-gradient-to-br from-indigo-900/20 to-violet-900/30">
                    <ImageIcon className="h-10 w-10" />
                    <span className="text-xs">No cover</span>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>

        {/* Tracks */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Music2 className="h-4 w-4" /> Tracks ({release.tracks?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(release.tracks ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border/50 rounded-md">
                No tracks added yet.
              </div>
            ) : (
              release.tracks!.map((t, i) => (
                <div key={t.id} className="rounded-md border border-border/50 bg-background/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">Track {i + 1}</span>
                      <span className="text-foreground">· {t.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Metadata Language: <span className="text-foreground">{t.language || "English"}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <KV label="Primary Artist" value={release.artistName} mini />
                    <KV label="Featuring" value={"—"} mini />
                    <KV label="Mix Version" value={"Remix"} mini />
                    <KV label="ISRC" value={t.isrc || "—"} mini mono />
                    <KV label="Explicit Status" value={t.isExplicit ? "EXPLICIT" : "NON-EXPLICIT"} mini />
                    <KV label="Genre" value={t.genre || "Pop"} mini />
                    <KV label="Recorded" value="2026" mini />
                    <KV label="Subgenre" value="Dance Pop" mini />
                  </div>
                  <Waveform />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Release Availability */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe2 className="h-4 w-4" /> Release Availability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-4 p-3 rounded-md border border-border/50 bg-background/40">
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-indigo-500/40 to-violet-500/40 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Timeline</span>
                  <StatusBadge status={release.status} className="text-[10px] px-1.5 py-0 h-4" />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Territory: {(release.territories || ["WW"]).join(", ")}</div>
                <div className="text-xs text-muted-foreground">Partners: All — {DSPS.join(", ")}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DSPS.map((d) => <DspPill key={d} name={d} />)}
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed pt-2 border-t border-border/40">
              With this release now approved and submitted, you have agreed to the terms of the agreement you have signed with Tajik Music Distribution. You confirm that all samples, musical works, vocals, and other compositions used within this release are owned by the label/artist or properly licensed for distribution to the partners chosen. Tajik Music Distribution will not be held responsible for any possible legal repercussions from misrepresented content.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function KV({
  label, value, highlight, chip, mono, cap, mini,
}: {
  label: string; value: string;
  highlight?: boolean; chip?: boolean; mono?: boolean; cap?: boolean; mini?: boolean;
}) {
  return (
    <div className={mini ? "" : "grid grid-cols-[140px_1fr] items-baseline gap-3"}>
      <div className={"text-xs text-muted-foreground " + (mini ? "block mb-0.5" : "")}>{label}</div>
      {chip ? (
        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 w-fit">
          {value}
        </span>
      ) : (
        <div className={
          "text-sm " +
          (highlight ? "font-semibold text-foreground " : "text-foreground ") +
          (mono ? "font-mono text-xs " : "") +
          (cap ? "capitalize " : "")
        }>
          {value}
        </div>
      )}
    </div>
  );
}

function Waveform() {
  // pseudo-random deterministic bars
  const bars = Array.from({ length: 80 }, (_, i) => 12 + Math.abs(Math.sin(i * 1.3) * 28));
  return (
    <div className="flex items-center gap-2 mt-2">
      <button className="h-8 w-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/25">
        <Headphones className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 h-9 flex items-center gap-[2px] overflow-hidden">
        {bars.map((h, i) => (
          <div key={i}
            className={"w-[3px] rounded-sm " + (i < 20 ? "bg-emerald-400/80" : "bg-muted-foreground/30")}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">00:00 / 03:24</span>
    </div>
  );
}

function DspPill({ name }: { name: string }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/50 bg-background/40 text-xs">
      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500/40 to-violet-500/40 flex items-center justify-center text-[9px] font-bold text-white">
        {initials}
      </div>
      {name}
    </div>
  );
}

// ─── Edit Release dialog ──────────────────────────────────────────────────
function EditReleaseDialog({ releaseId, title, onClose }: { releaseId: number; title: string; onClose: () => void }) {
  const updateStatus = useUpdateReleaseStatus();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Your Release</DialogTitle>
        <DialogDescription>Putting "{title}" into Edit state allows you to:</DialogDescription>
      </DialogHeader>
      <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
        <li>Include new metadata (contributors, etc.)</li>
        <li>Fix metadata mistakes</li>
        <li>Correct corrupt audio / artwork</li>
        <li>Add DSPs</li>
      </ul>
      <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 text-amber-300/90">
        <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Note:</span>
        Primary Artist name is permanent and cannot change. To change it, take down the release and create a new one.
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Your Responsibilities:</div>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>Make any necessary changes to the release.</li>
          <li>Re-upload audio files / album art if Tajik Music no longer has access.</li>
          <li>Submit your edited release. Once approved we'll deliver to all DSPs.</li>
        </ol>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
        Confirm Edit Release
      </label>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!confirmed || updateStatus.isPending}
          onClick={async () => {
            await updateStatus.mutateAsync({ id: releaseId, data: { status: "draft", note: "Edit requested" } });
            toast({ title: "Release moved to edit state", description: "You can now make changes." });
            onClose();
          }}
        >
          Edit Release
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Take Down dialog ─────────────────────────────────────────────────────
function TakeDownDialog({ releaseId, onClose }: { releaseId: number; onClose: () => void }) {
  const updateStatus = useUpdateReleaseStatus();
  const [reason, setReason] = useState<string>("Other");
  const [other, setOther] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>Take Down Your Release</DialogTitle>
        <DialogDescription>Taking down this release removes its availability on all delivered DSPs.</DialogDescription>
      </DialogHeader>
      <div className="text-xs text-muted-foreground bg-rose-500/10 border border-rose-500/30 rounded p-3 space-y-1">
        <div className="font-semibold text-rose-300">Reasons for takedown:</div>
        <ul className="list-disc pl-4">
          <li>Legal / contractual obligations</li>
          <li>Remove an incorrect version of a release from DSPs in order to deliver a correct one (track removal / re-ordering)</li>
        </ul>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Takedown Reason</label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TAKEDOWN_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Other Reason</label>
        <Textarea value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason for the take down…" rows={4} className="bg-background/40" />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
        Confirm Take Down Request
      </label>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          variant="destructive"
          disabled={!confirmed || updateStatus.isPending}
          onClick={async () => {
            const note = reason === "Other" ? other : reason;
            await updateStatus.mutateAsync({ id: releaseId, data: { status: "takedown_requested", note: note || reason } });
            toast({ title: "Takedown requested", description: "Your release will be removed from DSPs." });
            onClose();
          }}
        >
          Take Down
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
