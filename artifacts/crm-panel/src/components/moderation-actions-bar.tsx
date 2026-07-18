/**
 * Панель модерации на странице деталей релиза (перенесена из модалки
 * moderation-detail-dialog на странице «Дистрибуция»).
 *
 * Показывается только админу и только когда релиз в статусе pending_review.
 * Действия те же, что в модалке: PATCH /api/releases/:id/status
 *   • Одобрить релиз (approved) — заблокировано, пока есть критические ошибки Auto QC
 *   • More actions → Fail & Return (rejected со структурированной причиной)
 *   • More actions → Park / Hide (parked)
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, ChevronDown, PauseCircle, AlertTriangle, ShieldAlert, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { FailReturnDialog } from "@/components/fail-return-dialog";

type Issue = { code: string; severity: "error" | "warning"; message: string };

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

export function ModerationActionsBar({
  releaseId,
  onDecided,
}: {
  releaseId: number;
  onDecided: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [failReturnOpen, setFailReturnOpen] = useState(false);

  const detailsQ = useQuery({
    queryKey: ["moderation-detail", releaseId],
    queryFn: () => jget<{ issues: Issue[] }>(`/api/distribution/moderation/${releaseId}/details`),
  });

  const decide = useMutation({
    mutationFn: async ({ status, noteOverride }: { status: "approved" | "rejected" | "parked"; noteOverride?: string }) => {
      const r = await fetch(`/api/releases/${releaseId}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: noteOverride ?? (note.trim() || undefined) }),
      });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["moderation"] });
      qc.invalidateQueries({ queryKey: ["moderation-detail", releaseId] });
      toast({
        title: vars.status === "approved" ? "Релиз одобрен" : vars.status === "parked" ? "Релиз скрыт (parked)" : "Релиз возвращён на доработку",
      });
      onDecided();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось сохранить решение", description: e.message }),
  });

  const errors = useMemo(() => detailsQ.data?.issues.filter((i) => i.severity === "error") ?? [], [detailsQ.data]);
  const warns  = useMemo(() => detailsQ.data?.issues.filter((i) => i.severity === "warning") ?? [], [detailsQ.data]);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3" data-testid="moderation-actions-bar">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-500" /> Модерация
      </h3>

      {detailsQ.isLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загружаем результаты проверок…
        </div>
      )}
      {detailsQ.isError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Не удалось загрузить результаты проверок — одобрение недоступно. Обновите страницу.
        </p>
      )}
      {detailsQ.data && (
        errors.length > 0 ? (
          <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-moderation-errors">
            Критических ошибок Auto QC: {errors.length}. Релиз нельзя одобрить, пока они не устранены.
          </p>
        ) : (
          <p className="text-xs text-emerald-600 dark:text-emerald-400" data-testid="text-moderation-ok">
            Все автоматические проверки пройдены — релиз готов к одобрению.
            {warns.length > 0 ? ` Предупреждений: ${warns.length}.` : ""}
          </p>
        )
      )}

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Комментарий (попадёт в статус релиза и в email-уведомление)
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Например: «Обложка ниже 3000×3000 — пришлите версию большего размера»"
          rows={2}
          data-testid="textarea-moderation-note"
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={decide.isPending} data-testid="button-more-actions">
              More actions
              <ChevronDown className="h-4 w-4 ml-1.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem
              onClick={() => setFailReturnOpen(true)}
              className="text-amber-400 focus:text-amber-300"
              data-testid="dropdown-fail-return"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Fail &amp; Return
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => decide.mutate({ status: "parked" })}
              disabled={decide.isPending}
              data-testid="dropdown-park"
            >
              <PauseCircle className="h-4 w-4 mr-2 text-violet-400" />
              Park / Hide
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          disabled={decide.isPending || detailsQ.isLoading || detailsQ.isError || errors.length > 0}
          onClick={() => decide.mutate({ status: "approved" })}
          data-testid="button-approve"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Одобрить релиз
        </Button>
      </div>

      <FailReturnDialog
        open={failReturnOpen}
        onClose={() => setFailReturnOpen(false)}
        onConfirm={(builtNote) => {
          const combined = [builtNote, note.trim()].filter(Boolean).join("\n\n---\n\n");
          decide.mutate({ status: "rejected", noteOverride: combined });
          setFailReturnOpen(false);
        }}
        isPending={decide.isPending}
      />
    </div>
  );
}
