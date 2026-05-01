/**
 * Диалог создания/редактирования артиста.
 *
 * Используется на странице /artists и в форме создания релиза
 * (inline-кнопка "+ Создать нового").
 *
 * Права:
 *  - admin / manager — могут создавать любого артиста и выбирать любой лейбл
 *  - label          — может создавать только артиста под свой лейбл (labelId fixed)
 *  - artist         — диалог не показывается
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  useCreateArtist, useUpdateArtist, useListLabels,
  getListArtistsQueryKey, getGetArtistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

export interface ArtistFormValues {
  id?: number;
  name: string;
  genre?: string | null;
  country?: string | null;
  bio?: string | null;
  imageUrl?: string | null;
  labelId?: number | null;
  spotifyId?: string | null;
  appleId?: string | null;
  status?: "active" | "inactive";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ArtistFormValues | null;
  onSaved?: (artistId: number) => void;
}

const EMPTY: ArtistFormValues = {
  name: "",
  genre: "",
  country: "",
  bio: "",
  imageUrl: "",
  labelId: null,
  spotifyId: "",
  appleId: "",
  status: "active",
};

export function ArtistFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const { user } = useAuth();
  const isLabel = user?.role === "label";
  const isEdit = Boolean(initial?.id);

  const [form, setForm] = useState<ArtistFormValues>(EMPTY);
  const [createAccount, setCreateAccount] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY, ...initial } : { ...EMPTY, labelId: isLabel ? user?.labelId ?? null : null });
      setCreateAccount(false);
      setInviteEmail("");
    }
  }, [open, initial, isLabel, user?.labelId]);

  const labelsQ = useListLabels({ limit: 200 });
  const labels = labelsQ.data?.data ?? [];

  const queryClient = useQueryClient();
  const createM = useCreateArtist();
  const updateM = useUpdateArtist();
  const isSaving = createM.isPending || updateM.isPending || inviting;

  const invalidateLists = (artistId?: number) => {
    queryClient.invalidateQueries({ queryKey: getListArtistsQueryKey() });
    if (artistId) queryClient.invalidateQueries({ queryKey: getGetArtistQueryKey(artistId) });
  };

  const setField = <K extends keyof ArtistFormValues>(k: K, v: ArtistFormValues[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Укажите имя артиста", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      genre: form.genre?.trim() || null,
      country: form.country?.trim() || null,
      bio: form.bio?.trim() || null,
      imageUrl: form.imageUrl?.trim() || null,
      labelId: isLabel ? user?.labelId ?? null : (form.labelId ?? null),
      spotifyId: form.spotifyId?.trim() || null,
      appleId: form.appleId?.trim() || null,
      status: form.status ?? "active",
    };
    try {
      if (isEdit && initial?.id) {
        const updated = await updateM.mutateAsync({ id: initial.id, data: payload });
        invalidateLists(updated.id);
        toast({ title: "Артист обновлён" });
        onSaved?.(updated.id);
      } else {
        const created = await createM.mutateAsync({ data: payload });
        invalidateLists(created.id);
        toast({ title: "Артист создан", description: `«${created.name}» добавлен` });

        // Опциональный инвайт юзера сразу после создания.
        if (createAccount && inviteEmail.trim()) {
          setInviting(true);
          try {
            const r = await fetch(`/api/artists/${created.id}/invite-user`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: inviteEmail.trim(), name: created.name }),
            });
            if (!r.ok) {
              const err = await r.json().catch(() => ({}));
              throw new Error(err?.error ?? "Не удалось отправить приглашение");
            }
            const data = await r.json();
            toast({
              title: "Приглашение отправлено",
              description: data?.tempPassword
                ? `Временный пароль: ${data.tempPassword}`
                : `Письмо ушло на ${inviteEmail}`,
            });
          } catch (e) {
            toast({ title: "Артист создан, но инвайт не ушёл", description: (e as Error).message, variant: "destructive" });
          } finally {
            setInviting(false);
          }
        }

        onSaved?.(created.id);
      }
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Ошибка сохранения", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать артиста" : "Новый артист"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Измените данные артиста и сохраните изменения."
              : "Заполните основные данные. Дополнительные поля можно заполнить позже."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="art-name">Имя артиста *</Label>
            <Input
              id="art-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Например: Mastam"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="art-genre">Жанр</Label>
              <Input
                id="art-genre"
                value={form.genre ?? ""}
                onChange={(e) => setField("genre", e.target.value)}
                placeholder="Поп, хип-хоп…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="art-country">Страна</Label>
              <Input
                id="art-country"
                value={form.country ?? ""}
                onChange={(e) => setField("country", e.target.value)}
                placeholder="TJ, RU, UZ…"
              />
            </div>
          </div>

          {!isLabel && (
            <div className="grid gap-1.5">
              <Label htmlFor="art-label">Лейбл</Label>
              <Select
                value={form.labelId ? String(form.labelId) : "none"}
                onValueChange={(v) => setField("labelId", v === "none" ? null : Number(v))}
              >
                <SelectTrigger id="art-label"><SelectValue placeholder="Независимый" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Независимый</SelectItem>
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="art-image">Ссылка на фото</Label>
            <Input
              id="art-image"
              value={form.imageUrl ?? ""}
              onChange={(e) => setField("imageUrl", e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="art-bio">Биография</Label>
            <Textarea
              id="art-bio"
              value={form.bio ?? ""}
              onChange={(e) => setField("bio", e.target.value)}
              placeholder="Краткая биография, стиль, заметки…"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="art-spotify">Spotify Artist ID</Label>
              <Input
                id="art-spotify"
                value={form.spotifyId ?? ""}
                onChange={(e) => setField("spotifyId", e.target.value)}
                placeholder="3WrFJ7ztbogyGnTHbHJFl2"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="art-apple">Apple Music ID</Label>
              <Input
                id="art-apple"
                value={form.appleId ?? ""}
                onChange={(e) => setField("appleId", e.target.value)}
                placeholder="123456789"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="art-status">Статус</Label>
            <Select
              value={form.status ?? "active"}
              onValueChange={(v) => setField("status", v as "active" | "inactive")}
            >
              <SelectTrigger id="art-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активный</SelectItem>
                <SelectItem value="inactive">Неактивный</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="art-create-account"
                  checked={createAccount}
                  onCheckedChange={(v) => setCreateAccount(v === true)}
                />
                <Label htmlFor="art-create-account" className="cursor-pointer text-sm font-normal">
                  Создать аккаунт пользователя для артиста и отправить приглашение по email
                </Label>
              </div>
              {createAccount && (
                <div className="grid gap-1.5">
                  <Label htmlFor="art-invite-email">Email для приглашения *</Label>
                  <Input
                    id="art-invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="artist@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Будет создан User с ролью artist. На указанный email уйдёт временный пароль.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Сохранить" : "Создать артиста"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
