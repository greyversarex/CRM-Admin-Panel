// Multi Track Edit — страница выбора категории.
// Маршрут: /releases/:id/multi-track-edit
// Каждая карточка переходит на /releases/:id/multi-track-edit/:category
import { useParams, useLocation } from "wouter";
import { useGetRelease } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Users2, UserPlus, ShieldAlert, Globe2, Calendar,
  Mic2, Music2, Timer, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function MultiTrackEdit() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const [, navigate] = useLocation();

  const { data: release, isLoading } = useGetRelease(id);
  const trackCount = ((release as any)?.tracks ?? []).length;

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
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
            {release?.title ? (
              <>{release.title} <span className="text-muted-foreground font-normal">Multi Track Edit</span></>
            ) : "Multi Track Edit"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select the track value you would like to change on the entire release.
          </p>
          {trackCount === 0 && (
            <p className="text-sm text-amber-400 mt-2">
              This release has no tracks yet. Add tracks first before using Multi Track Edit.
            </p>
          )}
        </div>

        {/* Category grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                disabled={trackCount === 0}
                onClick={() => navigate(`/releases/${id}/multi-track-edit/${cat.key}`)}
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
      </div>
    </Layout>
  );
}
