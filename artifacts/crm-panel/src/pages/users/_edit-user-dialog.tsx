import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateUser, type User } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

type Props = {
  user: User | null;
  onClose: () => void;
};

export function EditUserDialog({ user, onClose }: Props) {
  const queryClient = useQueryClient();
  const update = useUpdateUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "label" | "artist">("artist");
  const [status, setStatus] = useState<"active" | "inactive" | "suspended">("active");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role as any);
      setStatus(user.status as any);
    }
  }, [user]);

  async function save() {
    if (!user) return;
    try {
      await update.mutateAsync({
        id: user.id,
        data: { name, email, role, status } as any,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Сохранено", description: name });
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось сохранить", description: e?.message });
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать пользователя</DialogTitle>
          <DialogDescription>Изменить имя, email, роль и статус.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Имя</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Роль</label>
              <select
                aria-label="Role"
                className="w-full h-9 px-3 text-sm rounded-md bg-background border border-border"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="label">Label</option>
                <option value="artist">Artist</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Статус</label>
              <select
                aria-label="Status"
                className="w-full h-9 px-3 text-sm rounded-md bg-background border border-border"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
