import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { Copy, Check } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Role = "admin" | "manager" | "label" | "artist";
type Status = "active" | "inactive" | "suspended";

export function CreateUserDialog({ open, onClose }: Props) {
  const { t } = useLang();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("artist");
  const [status, setStatus] = useState<Status>("active");
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setName(""); setEmail(""); setRole("artist"); setStatus("active");
    setTempPassword(null); setCopied(false); setBusy(false);
  }

  function handleClose() { reset(); onClose(); }

  async function save() {
    if (!name.trim() || !email.trim()) {
      toast({ variant: "destructive", title: t.users.create_validation_error });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
      }
      const created = await res.json() as { id: number; name: string; tempPassword?: string };
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: t.users.create_saved, description: created.name });
      // Показываем temp-пароль одноразово (если backend его вернул).
      if (created.tempPassword) {
        setTempPassword(created.tempPassword);
      } else {
        handleClose();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: t.users.create_error, description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.users.create_dialog_title}</DialogTitle>
          <DialogDescription>{t.users.create_dialog_desc}</DialogDescription>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <div className="font-medium text-amber-300">{t.users.create_temp_pwd_title}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.users.create_temp_pwd_hint}</div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-sm">
                {tempPassword}
              </code>
              <Button variant="outline" size="sm" onClick={copyPassword} className="gap-1.5" data-testid="button-copy-temp-pwd">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t.users.create_copied : t.users.create_copy}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-create-done">{t.users.create_done}</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">{t.users.edit_name}</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-create-name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t.users.edit_email}</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-create-email" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t.users.edit_role}</label>
                  <select
                    aria-label="Role"
                    className="w-full h-9 px-3 text-sm rounded-md bg-background border border-border"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    data-testid="select-create-role"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="label">Label</option>
                    <option value="artist">Artist</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t.users.edit_status}</label>
                  <select
                    aria-label="Status"
                    className="w-full h-9 px-3 text-sm rounded-md bg-background border border-border"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    data-testid="select-create-status"
                  >
                    <option value="active">{t.users.status_active}</option>
                    <option value="inactive">{t.users.status_inactive}</option>
                    <option value="suspended">{t.users.status_suspended}</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>{t.users.edit_cancel}</Button>
              <Button onClick={save} disabled={busy} data-testid="button-create-save">
                {busy ? t.users.edit_saving : t.users.create_submit}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
