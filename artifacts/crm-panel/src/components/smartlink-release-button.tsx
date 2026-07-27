/**
 * Кнопка «Смартлинк» на карточке релиза.
 *
 * Главный вход в раздел: у релиза уже есть обложка, артист и дата, поэтому
 * смартлинк собирается одним нажатием. Кнопка сама решает, что делать —
 * создать ссылку или открыть существующую, чтобы у одного релиза не плодились
 * дубли страниц.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SmartlinkEditor } from "@/components/smartlink-editor";
import type { SmartLinkDto } from "@/lib/smartlink";

export function SmartlinkReleaseButton({ releaseId }: { releaseId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<SmartLinkDto | null>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["smartlink-by-release", releaseId],
    queryFn: async (): Promise<SmartLinkDto | null> => {
      const r = await fetch(`/api/marketing/links/by-release/${releaseId}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<SmartLinkDto | null>;
    },
  });

  const create = useMutation({
    mutationFn: async (): Promise<SmartLinkDto> => {
      const r = await fetch("/api/marketing/links", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId }),
      });
      if (!r.ok) {
        const text = await r.text();
        let msg = text;
        try { msg = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* не JSON */ }
        throw new Error(msg);
      }
      return r.json() as Promise<SmartLinkDto>;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["smartlink-by-release", releaseId] });
      qc.invalidateQueries({ queryKey: ["smartlinks"] });
      setEditing(created);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось создать смартлинк", description: e.message }),
  });

  const busy = isLoading || create.isPending;

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="bg-card h-8 text-xs"
        disabled={busy}
        onClick={() => (existing ? setEditing(existing) : create.mutate())}
        data-testid="release-smartlink-button"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
        {existing ? "Смартлинк" : "Создать смартлинк"}
      </Button>

      {editing && (
        <SmartlinkEditor
          link={editing}
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={(saved) => setEditing(saved)}
        />
      )}
    </>
  );
}
