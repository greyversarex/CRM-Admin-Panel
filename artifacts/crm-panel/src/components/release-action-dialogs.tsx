/**
 * Общие диалоги действий над релизом: Deliver to DSPs, Take Down и Restore.
 * Вынесены из pages/releases/[id].tsx, чтобы использоваться также
 * в модалке модерации (pages/distribution/moderation-detail-dialog.tsx).
 */
import { useState } from "react";
import { useDeliverRelease, type DeliveryTarget } from "@workspace/api-client-react";
import { Send, ShieldAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { adminApi } from "@/lib/admin-api";
import { toast } from "@/hooks/use-toast";

// Соответствует enum DeliveryTarget в openapi.yaml + connectors/registry.ts.
// label — что видит пользователь, code — что уходит в API.
export const DELIVER_TARGETS: Array<{ code: DeliveryTarget; label: string }> = [
  { code: "spotify",       label: "Spotify" },
  { code: "apple_music",   label: "Apple Music" },
  { code: "youtube_music", label: "YouTube Music" },
  { code: "yandex_music",  label: "Yandex Music" },
  { code: "vk_music",      label: "VK Music" },
  { code: "tiktok",        label: "TikTok" },
  { code: "deezer",        label: "Deezer" },
  { code: "amazon_music",  label: "Amazon Music" },
  { code: "vevo",          label: "VEVO" },
  { code: "zvuk",          label: "Zvuk" },
  { code: "tidal",         label: "Tidal" },
  { code: "boomplay",      label: "Boomplay" },
  { code: "ok_music",      label: "OK Music" },
];

export const TAKEDOWN_REASONS = [
  "Other", "Legal/contractual obligations", "Incorrect metadata",
  "Wrong audio file", "Replacement release", "Artist request",
];

// ─── Take Down dialog ─────────────────────────────────────────────────────
export function TakeDownDialog({ releaseId, onClose }: { releaseId: number; onClose: () => void }) {
  const [pending, setPending] = useState(false);
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
          disabled={!confirmed || pending}
          onClick={async () => {
            const note = reason === "Other" ? other : reason;
            setPending(true);
            try {
              await adminApi(`/api/releases/${releaseId}/request-takedown`, {
                method: "POST",
                body: JSON.stringify({ note: note || reason }),
              });
              toast({ title: "Takedown requested", description: "Your release will be removed from DSPs." });
              onClose();
            } catch (e) {
              toast({ variant: "destructive", title: "Не удалось снять релиз", description: (e as Error).message });
              setPending(false);
            }
          }}
        >
          Take Down
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Restore dialog ───────────────────────────────────────────────────────
// Отмена снятия. Доступно только админу/менеджеру и только для релизов в
// статусах takedown_requested / removed — на бэкенде это POST /restore.
// Куда именно вернётся релиз, решает сервер (live или approved) и сообщает
// в поле restoredTo: показываем это админу человеческим текстом.
export function RestoreDialog({
  releaseId,
  status,
  onClose,
}: {
  releaseId: number;
  status: string;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const notYetRemoved = status === "takedown_requested";

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>Восстановить релиз</DialogTitle>
        <DialogDescription>
          {notYetRemoved
            ? "Снятие ещё не выполнено — заявка будет отменена, и релиз вернётся в прежнее состояние."
            : "Релиз уже убран с площадок. Он вернётся в статус «Одобрен» — чтобы он снова появился на площадках, отгрузите его заново (Deliver to DSPs)."}
        </DialogDescription>
      </DialogHeader>

      <div className="text-xs text-muted-foreground bg-emerald-500/10 border border-emerald-500/30 rounded p-3 space-y-1">
        <div className="font-semibold text-emerald-400">Что произойдёт:</div>
        <ul className="list-disc pl-4">
          <li>{notYetRemoved ? "Статус вернётся на «В эфире» или «Одобрен»." : "Статус сменится на «Одобрен»."}</li>
          <li>Артист и лейбл получат уведомление о восстановлении.</li>
          <li>Действие попадёт в журнал аудита.</li>
        </ul>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Комментарий (не обязательно)</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Например: «Снятие было ошибочным, права подтверждены»"
          rows={3}
          className="bg-background/40"
          data-testid="textarea-restore-note"
        />
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              const res = await adminApi<{ restoredTo?: string }>(`/api/releases/${releaseId}/restore`, {
                method: "POST",
                body: JSON.stringify({ note: note.trim() || undefined }),
              });
              toast({
                title: "Релиз восстановлен",
                description: res?.restoredTo === "live"
                  ? "Снятие отменено, релиз остаётся на площадках."
                  : "Релиз вернулся в статус «Одобрен». Чтобы вернуть его на площадки, нажмите Deliver to DSPs.",
              });
              onClose();
            } catch (e) {
              toast({ variant: "destructive", title: "Не удалось восстановить релиз", description: (e as Error).message });
              setPending(false);
            }
          }}
          data-testid="button-restore-confirm"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {pending ? "Восстанавливаем…" : "Восстановить"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Deliver to DSPs dialog ───────────────────────────────────────────────
// Создаёт по одной delivery-job на каждый выбранный target. Воркер заберёт
// очередь на ближайшем тике (≤30 сек). Прогресс смотрим в /distribution.
export function DeliverDialog({ releaseId, onClose }: { releaseId: number; onClose: () => void }) {
  const deliver = useDeliverRelease();
  const [selected, setSelected] = useState<Set<DeliveryTarget>>(new Set());
  // Когда бэкенд вернул 409 label_blocked_too_many_strikes — показываем
  // подтверждение перед повторной отправкой с force=true.
  const [strikeBlock, setStrikeBlock] = useState<null | {
    labelName: string; copyrightStrikes: number; threshold: number; targets: DeliveryTarget[];
  }>(null);

  const toggle = (code: DeliveryTarget) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(DELIVER_TARGETS.map((t) => t.code)));
  const clearAll = () => setSelected(new Set());

  const sendDelivery = async (targets: DeliveryTarget[], force: boolean) => {
    // Используем direct fetch (а не useDeliverRelease.mutateAsync), чтобы
    // получить доступ к телу 409-ответа и понять причину блокировки.
    const resp = await fetch(`/api/releases/${releaseId}/deliver`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets, ddexVersion: "4.3", force }),
    });
    if (resp.status === 409) {
      const body = await resp.json().catch(() => ({}));
      if (body?.error === "label_blocked_too_many_strikes") {
        setStrikeBlock({
          labelName: body.labelName ?? "—",
          copyrightStrikes: body.copyrightStrikes ?? 0,
          threshold: body.threshold ?? 3,
          targets,
        });
        return;
      }
      throw new Error(body?.error || body?.message || `HTTP 409`);
    }
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body?.error || body?.message || `HTTP ${resp.status}`);
    }
    const res = await resp.json();
    toast({
      title: "Доставка поставлена в очередь",
      description: `${res.jobs.length} job${res.jobs.length === 1 ? "" : "s"} → DDEX ERN 4.3. Прогресс — на /distribution.`,
    });
    onClose();
  };

  const submit = async () => {
    const targets = Array.from(selected);
    if (targets.length === 0) return;
    try {
      await sendDelivery(targets, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Ошибка отгрузки", description: msg, variant: "destructive" });
    }
  };

  // ── Сценарий блокировки лейбла: подтверждаем и повторяем с force=true ──
  if (strikeBlock) {
    return (
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="h-5 w-5" />
            Внимание: лейбл заблокирован
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <p>
              У лейбла <strong className="text-foreground">«{strikeBlock.labelName}»</strong> накоплено{" "}
              <span className="font-mono text-rose-400">{strikeBlock.copyrightStrikes}</span>{" "}
              копирайт-страйков от DSP (порог: {strikeBlock.threshold}).
            </p>
            <p>
              Повторная отгрузка может привести к ещё одному отказу и пометке лейбла как
              ненадёжного. Вы уверены, что хотите продолжить?
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setStrikeBlock(null)}>Отмена</Button>
          <Button
            variant="destructive"
            disabled={deliver.isPending}
            onClick={async () => {
              try {
                await sendDelivery(strikeBlock.targets, true);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                toast({ title: "Ошибка отгрузки", description: msg, variant: "destructive" });
                setStrikeBlock(null);
              }
            }}
          >
            <Send className="mr-2 h-4 w-4" />
            Подтвердить и отгрузить
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="bg-card border-border max-w-lg">
      <DialogHeader>
        <DialogTitle>Deliver Release to DSPs</DialogTitle>
        <DialogDescription>
          На каждый выбранный DSP сгенерируется отдельный DDEX ERN 4.3 пакет
          и поставится в очередь. Воркер обработает в течение 30 секунд.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between text-xs">
        <div className="text-muted-foreground">Выбрано: <span className="font-mono text-foreground">{selected.size}</span> / {DELIVER_TARGETS.length}</div>
        <div className="flex gap-2">
          <button type="button" onClick={selectAll} className="text-primary hover:underline">Выбрать все</button>
          <span className="text-muted-foreground">·</span>
          <button type="button" onClick={clearAll} className="text-muted-foreground hover:text-foreground">Очистить</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
        {DELIVER_TARGETS.map((t) => (
          <label
            key={t.code}
            className="flex items-center gap-2 px-2.5 py-2 rounded border border-border bg-background/40 hover:bg-accent/40 cursor-pointer text-sm"
          >
            <Checkbox
              checked={selected.has(t.code)}
              onCheckedChange={() => toggle(t.code)}
            />
            <span className="flex-1">{t.label}</span>
            <span className="text-[10px] text-muted-foreground font-mono">{t.code}</span>
          </label>
        ))}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={selected.size === 0 || deliver.isPending}
          onClick={submit}
        >
          <Send className="mr-2 h-4 w-4" />
          {deliver.isPending ? "Отправка…" : `Deliver (${selected.size})`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
