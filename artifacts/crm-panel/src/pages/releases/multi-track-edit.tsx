// Multi Track Edit — массовое редактирование полей треков по категориям.
// Маршрут: /releases/:id/multi-track-edit
// UX: выбираешь категорию → открывается диалог → применяешь изменение ко всем трекам.
import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRelease, useUpdateTrack, getGetReleaseQueryKey,
  type Track,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Users2, UserPlus, ShieldAlert, Globe2, Calendar,
  Mic2, Music2, Timer, Bot, Loader2, Check,
} from "lucide-react";
import {
  GENRES, COUNTRIES, WRITER_ROLES, PERFORMER_ROLES, PRODUCTION_ROLES, DISPLAY_ARTIST_ROLES,
} from "@/components/release-wizard/types";
import { cn } from "@/lib/utils";

// ─── Category definitions ────────────────────────────────────────────────────

type CategoryKey =
  | "artists" | "contributors" | "explicit" | "country"
  | "year" | "vocals" | "genre" | "clipstart" | "ai";

interface Category {
  key: CategoryKey;
  icon: React.ElementType;
  title: string;
  description: string;
}

const CATEGORIES: Category[] = [
  { key: "artists",      icon: Users2,      title: "ARTISTS",                    description: "Top level artist roles: Primary, Featuring, Remixer." },
  { key: "contributors", icon: UserPlus,    title: "CONTRIBUTORS",               description: "Supporting production roles: Composer, Producer, Songwriter, etc." },
  { key: "explicit",     icon: ShieldAlert, title: "EXPLICIT STATUS",            description: "The explicit level of a track: Not Explicit, Explicit, Censored." },
  { key: "country",      icon: Globe2,      title: "COUNTRY OF RECORDING",       description: "The country the song was recorded in." },
  { key: "year",         icon: Calendar,    title: "RECORDING YEAR",             description: "The year the song was recorded." },
  { key: "vocals",       icon: Mic2,        title: "VOCALS",                     description: "The presence of voice in the song: singing, spoken word, call-outs." },
  { key: "genre",        icon: Music2,      title: "GENRE",                      description: "The style of music the songs belong to." },
  { key: "clipstart",    icon: Timer,       title: "CLIP START TIME",            description: "Start time of the audio clip. Utilized by partners like TikTok." },
  { key: "ai",           icon: Bot,         title: "STEREO AUDIO AI DISCLOSURE", description: "The AI usage level of the stereo audio for a track: None, Some, All." },
];

// ─── Shared apply-all helper ─────────────────────────────────────────────────

interface ApplyContext {
  tracks: Track[];
  updateTrack: ReturnType<typeof useUpdateTrack>;
  onDone: () => void;
  onError?: (msg: string) => void;
}

async function applyToAll(
  ctx: ApplyContext,
  patchFn: (t: Track) => Record<string, unknown>,
) {
  let ok = 0; let fail = 0; let firstErr = "";
  for (const t of ctx.tracks) {
    try {
      await ctx.updateTrack.mutateAsync({
        id: t.id,
        data: { artistId: t.artistId, title: t.title, ...patchFn(t) } as any,
      });
      ok++;
    } catch (e) {
      fail++;
      if (!firstErr) firstErr = (e as Error).message;
    }
  }
  if (fail === 0) {
    toast({ title: "Applied", description: `Changes applied to ${ok} track${ok === 1 ? "" : "s"}.` });
    ctx.onDone();
  } else {
    toast({
      variant: "destructive",
      title: `Failed on ${fail} of ${ok + fail} tracks`,
      description: firstErr,
    });
    if (ok > 0) ctx.onDone();
  }
}

// ─── Individual dialogs ───────────────────────────────────────────────────────

// ARTISTS
function ArtistsDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [role, setRole] = useState<"primary" | "featuring" | "with" | "remixer">("featuring");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      (t) => {
        const current: any[] = Array.isArray((t as any).displayArtists) ? (t as any).displayArtists : [];
        const newEntry = { name: name.trim(), role };
        const updated = mode === "replace"
          ? [...current.filter((a) => a.role !== role), newEntry]
          : [...current, newEntry];
        return { displayArtists: updated };
      },
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Artists</DialogTitle>
        <DialogDescription>
          Add or replace an artist role across all tracks in this release.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISPLAY_ARTIST_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Artist Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter artist name" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Action</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="add">Add to existing artists</SelectItem>
              <SelectItem value="replace">Replace all artists of this role</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// CONTRIBUTORS
function ContributorsDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [tab, setTab] = useState<"writers" | "performers" | "production">("writers");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [share, setShare] = useState("100");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !role) return;
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      (t) => {
        if (tab === "writers") {
          const current: any[] = Array.isArray((t as any).writers) ? (t as any).writers : [];
          return { writers: [...current, { name: name.trim(), role, share: Number(share) || 0 }] };
        } else if (tab === "performers") {
          const current: any[] = Array.isArray((t as any).performers) ? (t as any).performers : [];
          return { performers: [...current, { name: name.trim(), role }] };
        } else {
          const current: any[] = Array.isArray((t as any).production) ? (t as any).production : [];
          return { production: [...current, { name: name.trim(), role }] };
        }
      },
    );
    setSaving(false);
  };

  const rolesFor = tab === "writers"
    ? WRITER_ROLES.map((r) => ({ value: r.value, label: r.label }))
    : tab === "performers"
      ? PERFORMER_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }))
      : PRODUCTION_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }));

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Contributors</DialogTitle>
        <DialogDescription>
          Add a contributor to all tracks in this release.
        </DialogDescription>
      </DialogHeader>
      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setRole(""); }}>
        <TabsList className="w-full">
          <TabsTrigger value="writers" className="flex-1">Writers</TabsTrigger>
          <TabsTrigger value="performers" className="flex-1">Performers</TabsTrigger>
          <TabsTrigger value="production" className="flex-1">Production</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {rolesFor.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tab === "writers" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Share %</Label>
              <Input
                type="number" min={0} max={100}
                value={share} onChange={(e) => setShare(e.target.value)}
                placeholder="0–100"
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || !name.trim() || !role}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// EXPLICIT STATUS
function ExplicitDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [value, setValue] = useState<"non_explicit" | "explicit" | "censored">("non_explicit");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      () => ({ explicitStatus: value, isExplicit: value === "explicit" }),
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Explicit Status</DialogTitle>
        <DialogDescription>Set the explicit level for all tracks in this release.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Status</Label>
        <Select value={value} onValueChange={(v) => setValue(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="non_explicit">Not Explicit</SelectItem>
            <SelectItem value="explicit">Explicit</SelectItem>
            <SelectItem value="censored">Censored</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// COUNTRY OF RECORDING
function CountryDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!value) return;
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      () => ({ countryOfRecording: value }),
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Country of Recording</DialogTitle>
        <DialogDescription>Set the recording country for all tracks in this release.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Country</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || !value}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// RECORDING YEAR
function RecordingYearDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [value, setValue] = useState(String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const year = parseInt(value, 10);
    if (!year || year < 1900 || year > 2099) return;
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      () => ({ recordingYear: year }),
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Recording Year</DialogTitle>
        <DialogDescription>Set the year the tracks were recorded.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Year</Label>
        <Input
          type="number" min={1900} max={2099}
          value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={String(new Date().getFullYear())}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || !parseInt(value, 10)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// VOCALS
function VocalsDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [value, setValue] = useState<"vocal" | "instrumental">("vocal");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      () => ({ audioStyle: value }),
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Vocals</DialogTitle>
        <DialogDescription>
          Set whether tracks contain vocals (singing, spoken word, call-outs).
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Vocal Presence</Label>
        <Select value={value} onValueChange={(v) => setValue(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vocal">Contains Vocals</SelectItem>
            <SelectItem value="instrumental">Instrumental (No Vocals)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// GENRE
function GenreDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!value) return;
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      () => ({ genre: value }),
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Genre</DialogTitle>
        <DialogDescription>Set the music genre for all tracks in this release.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Genre</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger><SelectValue placeholder="Select genre" /></SelectTrigger>
          <SelectContent>
            {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || !value}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// CLIP START TIME
function ClipStartDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [seconds, setSeconds] = useState("0");
  const [saving, setSaving] = useState(false);

  const sec = parseInt(seconds, 10);
  const mm = isNaN(sec) ? 0 : Math.floor(sec / 60);
  const ss = isNaN(sec) ? 0 : sec % 60;

  const save = async () => {
    const s = parseInt(seconds, 10);
    if (isNaN(s) || s < 0) return;
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      () => ({ clipStartSeconds: s }),
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Clip Start Time</DialogTitle>
        <DialogDescription>
          The audio preview will start at this offset. Used by TikTok and other DSPs.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Start time (seconds)</Label>
        <Input
          type="number" min={0}
          value={seconds} onChange={(e) => setSeconds(e.target.value)}
          placeholder="0"
        />
        {!isNaN(sec) && sec > 0 && (
          <p className="text-xs text-muted-foreground">
            Preview starts at {mm}:{String(ss).padStart(2, "0")}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || isNaN(sec) || sec < 0}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// STEREO AUDIO AI DISCLOSURE
function AiDialog({ tracks, onClose, onSaved, updateTrack }: {
  tracks: Track[]; onClose: () => void; onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const [value, setValue] = useState<"none" | "some" | "all">("none");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await applyToAll(
      { tracks, updateTrack, onDone: onSaved },
      () => ({ aiUsage: value }),
    );
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Stereo Audio AI Disclosure</DialogTitle>
        <DialogDescription>
          Regulatory requirement — disclose AI usage level for the stereo master.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">AI Usage Level</Label>
        <Select value={value} onValueChange={(v) => setValue(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None — No AI used</SelectItem>
            <SelectItem value="some">Some — Partially AI-assisted</SelectItem>
            <SelectItem value="all">All — Fully AI-generated</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Apply to All {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Category dialog dispatcher ───────────────────────────────────────────────

function CategoryDialog({ category, tracks, onClose, onSaved, updateTrack }: {
  category: CategoryKey;
  tracks: Track[];
  onClose: () => void;
  onSaved: () => void;
  updateTrack: ReturnType<typeof useUpdateTrack>;
}) {
  const props = { tracks, onClose, onSaved, updateTrack };
  switch (category) {
    case "artists":      return <ArtistsDialog {...props} />;
    case "contributors": return <ContributorsDialog {...props} />;
    case "explicit":     return <ExplicitDialog {...props} />;
    case "country":      return <CountryDialog {...props} />;
    case "year":         return <RecordingYearDialog {...props} />;
    case "vocals":       return <VocalsDialog {...props} />;
    case "genre":        return <GenreDialog {...props} />;
    case "clipstart":    return <ClipStartDialog {...props} />;
    case "ai":           return <AiDialog {...props} />;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MultiTrackEdit() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const updateTrack = useUpdateTrack();

  const { data: release, isLoading } = useGetRelease(id);
  const tracks: Track[] = (release as any)?.tracks ?? [];

  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);

  const handleSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetReleaseQueryKey(id) });
    setActiveCategory(null);
  }, [queryClient, id]);

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!release) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-8 text-muted-foreground">Release not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            onClick={() => navigate(`/releases/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            {release.title} <span className="text-muted-foreground font-normal">Multi Track Edit</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select the track value you would like to change on the entire release.
          </p>
          {tracks.length === 0 && (
            <p className="text-sm text-amber-400 mt-2">
              This release has no tracks yet. Add tracks first before using Multi Track Edit.
            </p>
          )}
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                disabled={tracks.length === 0}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "group text-left rounded-xl border border-border/60 bg-card/60 backdrop-blur",
                  "p-5 transition-all duration-150",
                  "hover:border-primary/40 hover:bg-card hover:shadow-md hover:shadow-primary/5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 border border-primary/20 p-2 shrink-0 group-hover:bg-primary/15 transition-colors">
                    <Icon className="h-5 w-5 text-primary" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {cat.title}
                    </p>
                    <p className="text-[12.5px] text-foreground/80 leading-snug">
                      {cat.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Category Dialog */}
        <Dialog
          open={activeCategory !== null}
          onOpenChange={(open) => { if (!open) setActiveCategory(null); }}
        >
          {activeCategory && (
            <CategoryDialog
              category={activeCategory}
              tracks={tracks}
              onClose={() => setActiveCategory(null)}
              onSaved={handleSaved}
              updateTrack={updateTrack}
            />
          )}
        </Dialog>
      </div>
    </Layout>
  );
}
