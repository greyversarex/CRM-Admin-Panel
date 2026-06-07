// Reorder Tracks — drag-and-drop сортировка треков релиза.
// Маршрут: /releases/:id/reorder-tracks
// Сохранение: POST /api/releases/:id/tracks/reorder { order: [id, id, …] }
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useGetRelease } from "@workspace/api-client-react";
import { adminApi } from "@/lib/admin-api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, GripVertical, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackItem {
  id: number;
  title: string;
  trackNumber: number | null;
}

export default function ReorderTracks() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const [, navigate] = useLocation();

  const { data: release, isLoading } = useGetRelease(id);

  const [order, setOrder] = useState<TrackItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Инициализируем порядок из данных релиза
  useEffect(() => {
    if (release) {
      const tracks: TrackItem[] = ((release as any).tracks ?? [])
        .slice()
        .sort((a: any, b: any) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
        .map((t: any) => ({ id: t.id, title: t.title, trackNumber: t.trackNumber }));
      setOrder(tracks);
    }
  }, [release]);

  // ─── HTML5 Drag-and-Drop ──────────────────────────────────────────────────

  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent, i: number) => {
    dragIdx.current = i;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    // Прозрачный ghost-элемент
    const ghost = document.createElement("div");
    ghost.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.01;";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx.current !== null && i !== dragIdx.current) {
      setOverIdx(i);
    }
  };

  const handleDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i) {
      setOverIdx(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    setOrder(next);
    dragIdx.current = i;
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    dragIdx.current = null;
    setOverIdx(null);
    setIsDragging(false);
  };

  const handleDragLeave = () => {
    setOverIdx(null);
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true);
    try {
      await adminApi(`/api/releases/${id}/tracks/reorder`, {
        method: "POST",
        body: JSON.stringify({ order: order.map((t) => t.id) }),
      });
      toast({ title: "Track order saved" });
      navigate(`/releases/${id}`);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Failed to save order",
        description: (e as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </Layout>
    );
  }

  if (!release) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8 text-muted-foreground">
          Release not found.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            onClick={() => navigate(`/releases/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Reorder Tracks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag tracks into the desired order. Click Save when done.
          </p>
        </div>

        {/* Track list */}
        {order.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center border border-dashed border-border/50 rounded-xl">
            No tracks in this release yet.
          </div>
        ) : (
          <div className="space-y-2 mb-8">
            {order.map((track, i) => (
              <div
                key={track.id}
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                onDragLeave={handleDragLeave}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3.5 select-none",
                  "transition-all duration-100 bg-card/60 backdrop-blur",
                  overIdx === i && dragIdx.current !== null && dragIdx.current !== i
                    ? "border-primary/60 bg-primary/5 shadow-md shadow-primary/10"
                    : "border-border/60 hover:border-border",
                  isDragging && dragIdx.current === i
                    ? "opacity-40 scale-[0.98]"
                    : "opacity-100",
                )}
              >
                {/* Grip handle */}
                <GripVertical
                  className="h-5 w-5 text-muted-foreground/50 cursor-grab active:cursor-grabbing shrink-0"
                  strokeWidth={1.6}
                />

                {/* Track number */}
                <span className="w-7 text-center text-sm font-mono text-muted-foreground shrink-0">
                  {i + 1}
                </span>

                {/* Track title */}
                <span className="flex-1 text-sm font-medium truncate">
                  {track.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={saving || order.length < 2}
            className="min-w-[120px]"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving…</>
              : <><Save className="h-4 w-4 mr-1.5" /> Save</>
            }
          </Button>
        </div>
      </div>
    </Layout>
  );
}
