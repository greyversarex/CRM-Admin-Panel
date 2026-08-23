// Страница по ссылке из письма «подтвердите почту».
// Открывается без входа: сам токен и есть доказательство доступа к ящику.
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function VerifyEmail() {
  const [, params] = useRoute("/verify-email/:token");
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const token = params?.token;
    if (!token) return;
    void fetch("/api/verify-email/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error ?? "Не удалось подтвердить");
        setState({ ok: true, message: `Адрес ${j.email} подтверждён.` });
      })
      .catch((e: Error) => setState({ ok: false, message: e.message }));
  }, [params?.token]);

  return (
    <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card/80 backdrop-blur-2xl p-8 text-center shadow-[0_8px_60px_rgba(0,0,0,0.7)]">
        {!state && (
          <p className="text-sm text-white/60 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Подтверждаем…
          </p>
        )}
        {state && (
          <>
            <div className={`h-14 w-14 rounded-full mx-auto mb-4 flex items-center justify-center border ${
              state.ok ? "bg-emerald-500/15 border-emerald-500/40" : "bg-red-500/15 border-red-500/40"
            }`}>
              {state.ok
                ? <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                : <XCircle className="h-7 w-7 text-red-400" />}
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {state.ok ? "Почта подтверждена" : "Не получилось"}
            </h2>
            <p className="text-sm text-white/60 mb-6">{state.message}</p>
            <Link to="/login" className="text-primary hover:underline text-sm">Войти в кабинет</Link>
          </>
        )}
      </div>
    </div>
  );
}
