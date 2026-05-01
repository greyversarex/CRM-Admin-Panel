/**
 * Диалог создания/редактирования лейбла. Только admin/manager.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  useCreateLabel, useUpdateLabel, useListLabels,
  getListLabelsQueryKey, getGetLabelQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export interface LabelFormValues {
  id?: number;
  name: string;
  country?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  parentLabelId?: number | null;
  status?: "active" | "inactive";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: LabelFormValues | null;
  onSaved?: (labelId: number) => void;
}

const EMPTY: LabelFormValues = {
  name: "",
  country: "",
  website: "",
  logoUrl: "",
  parentLabelId: null,
  status: "active",
};

export function LabelFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState<LabelFormValues>(EMPTY);

  useEffect(() => {
    if (open) setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
  }, [open, initial]);

  // Для parent-label выбора (исключаем самого себя при редактировании)
  const labelsQ = useListLabels({ limit: 200 });
  const labels = (labelsQ.data?.data ?? []).filter((l) => l.id !== initial?.id);

  const queryClient = useQueryClient();
  const createM = useCreateLabel();
  const updateM = useUpdateLabel();
  const isSaving = createM.isPending || updateM.isPending;

  const invalidateLists = (labelId?: number) => {
    queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    if (labelId) queryClient.invalidateQueries({ queryKey: getGetLabelQueryKey(labelId) });
  };

  const setField = <K extends keyof LabelFormValues>(k: K, v: LabelFormValues[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Укажите название лейбла", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      country: form.country?.trim() || null,
      website: form.website?.trim() || null,
      logoUrl: form.logoUrl?.trim() || null,
      parentLabelId: form.parentLabelId ?? null,
      status: form.status ?? "active",
    };
    try {
      if (isEdit && initial?.id) {
        const updated = await updateM.mutateAsync({ id: initial.id, data: payload });
        invalidateLists(updated.id);
        toast({ title: "Лейбл обновлён" });
        onSaved?.(updated.id);
      } else {
        const created = await createM.mutateAsync({ data: payload });
        invalidateLists(created.id);
        toast({ title: "Лейбл создан", description: `«${created.name}» добавлен` });
        onSaved?.(created.id);
      }
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Ошибка сохранения", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать лейбл" : "Новый лейбл"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Измените данные лейбла и сохраните."
              : "Заполните основные данные нового лейбла."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="lbl-name">Название *</Label>
            <Input
              id="lbl-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Например: Tajik Sound Records"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lbl-country">Страна</Label>
              <Input
                id="lbl-country"
                value={form.country ?? ""}
                onChange={(e) => setField("country", e.target.value)}
                placeholder="TJ, RU, UZ…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lbl-website">Сайт</Label>
              <Input
                id="lbl-website"
                value={form.website ?? ""}
                onChange={(e) => setField("website", e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lbl-logo">Ссылка на логотип</Label>
            <Input
              id="lbl-logo"
              value={form.logoUrl ?? ""}
              onChange={(e) => setField("logoUrl", e.target.value)}
              placeholder="https://…"
            />
          </div>

          {labels.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="lbl-parent">Материнский лейбл</Label>
              <Select
                value={form.parentLabelId ? String(form.parentLabelId) : "none"}
                onValueChange={(v) => setField("parentLabelId", v === "none" ? null : Number(v))}
              >
                <SelectTrigger id="lbl-parent"><SelectValue placeholder="Нет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Нет (независимый)</SelectItem>
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="lbl-status">Статус</Label>
            <Select
              value={form.status ?? "active"}
              onValueChange={(v) => setField("status", v as "active" | "inactive")}
            >
              <SelectTrigger id="lbl-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активный</SelectItem>
                <SelectItem value="inactive">Неактивный</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Сохранить" : "Создать лейбл"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
