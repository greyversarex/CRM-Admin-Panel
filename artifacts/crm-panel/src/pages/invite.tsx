// Публичная страница приёма приглашения в команду лейбла.
// URL: /invite/:token. Без auth (по токену из URL).
//
// Сценарий:
//  1) GET /api/label-members/invite/:token — получаем email, имя, лейбл, роль.
//  2) Пользователь задаёт пароль (и опционально уточняет имя).
//  3) POST /api/label-members/invite/:token/accept — backend создаёт User
//     или обновляет существующий, привязывает к labelId, инвалидирует токен.
//  4) Редиректим на /login с подсказкой.
import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ArrowLeft, Loader2, UserPlus, AlertCircle } from "lucide-react";

interface InviteInfo {
  email: string;
  name: string;
  role: string;
  labelName: string;
  expiresAt: string | null;
  accountExists: boolean;
}

export default function InviteAccept() {
  const [, params] = useRoute<{ token: string }>("/invite/:token");
  const token = params?.token ?? "";
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Невалидная ссылка");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/label-members/invite/${encodeURIComponent(token)}`, {
          credentials: "same-origin",
        });
        const j: unknown = await res.json().catch(() => ({}));
        const obj = (j && typeof j === "object") ? (j as Record<string, unknown>) : {};
        if (!res.ok) {
          const errMsg = typeof obj.error === "string" ? obj.error : `Ошибка ${res.status}`;
          if (!cancelled) setLoadError(errMsg);
          return;
        }
        if (!cancelled) {
          const data = obj as unknown as InviteInfo;
          setInfo(data);
          setName(data.name);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Ошибка сети";
          setLoadError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (password.length < 8) {
      setSubmitError("Пароль должен быть не короче 8 символов");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/label-members/invite/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, name: name.trim() || undefined }),
      });
      const j: unknown = await res.json().catch(() => ({}));
      const obj = (j && typeof j === "object") ? (j as Record<string, unknown>) : {};
      if (!res.ok) {
        const errMsg = typeof obj.error === "string" ? obj.error : `Ошибка ${res.status}`;
        setSubmitError(errMsg);
        return;
      }
      setSubmitted(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка сети";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-card/80 backdrop-blur-2xl p-8 shadow-[0_8px_60px_rgba(0,0,0,0.7)]">
          <div className="flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center mb-4">
              <AlertCircle className="h-7 w-7 text-rose-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Приглашение недоступно</h2>
            <p className="text-sm text-white/70 mb-6">{loadError ?? "Не удалось загрузить данные"}</p>
            <Link href="/login">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                На вход
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-card/80 backdrop-blur-2xl p-8 shadow-[0_8px_60px_rgba(0,0,0,0.7)]">
          <div className="flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Приглашение принято</h2>
            <p className="text-sm text-white/70">Сейчас мы перенаправим вас на страницу входа.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card/80 backdrop-blur-2xl p-8 shadow-[0_8px_60px_rgba(0,0,0,0.7)]">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-full bg-blue-500/15 border border-blue-500/40 flex items-center justify-center mb-4">
            <UserPlus className="h-7 w-7 text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Присоединиться к команде</h2>
          <p className="text-sm text-white/70">
            Лейбл <span className="text-white font-medium">«{info.labelName}»</span> приглашает вас
            {" "}в роли <span className="text-white">{info.role}</span>.
          </p>
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          <div>
            <Label htmlFor="invite-email" className="text-white/80">Email</Label>
            <Input
              id="invite-email"
              value={info.email}
              disabled
              readOnly
              className="mt-1 bg-white/5 text-white/60"
            />
          </div>

          <div>
            <Label htmlFor="invite-name" className="text-white/80">Имя</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              maxLength={120}
            />
          </div>

          <div>
            <Label htmlFor="invite-password" className="text-white/80">
              {info.accountExists ? "Новый пароль" : "Пароль"}
            </Label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1"
              placeholder="Минимум 8 символов"
            />
            {info.accountExists && (
              <p className="text-xs text-amber-300/80 mt-1.5">
                У вас уже есть аккаунт с этим email — пароль будет обновлён.
              </p>
            )}
          </div>

          {submitError && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {submitError}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Принять и создать пароль
          </Button>

          <div className="text-center">
            <Link href="/login" className="text-xs text-white/50 hover:text-white/80">
              Уже есть аккаунт? Войти
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
