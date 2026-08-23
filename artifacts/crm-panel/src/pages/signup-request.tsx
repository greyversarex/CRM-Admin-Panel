// Страница «дошлите данные по заявке». Открывается по ссылке из письма.
// Аккаунта у человека ещё нет, поэтому вход тут не нужен — доступ даёт токен
// в адресе. Страница показывает только то, что заявитель и так про себя знает.
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";

type Request = {
  id: number; name: string; email: string; status: string; createdAt: string;
  infoRequest: string | null; infoResponse: string | null; rejectionReason: string | null;
};

const STATUS_TEXT: Record<string, string> = {
  pending: "Заявка принята и ждёт рассмотрения.",
  under_review: "Заявку рассматривает менеджер.",
  info_requested: "Менеджер запросил дополнительные данные.",
  approved: "Заявка одобрена — проверьте почту, там логин и пароль.",
  rejected: "Заявка отклонена.",
};

export default function SignupRequestPage() {
  const [, params] = useRoute("/signup/request/:token");
  const token = params?.token ?? "";

  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    void fetch(`/api/signup-requests/by-token/${token}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error ?? "Заявка не найдена");
        setRequest(j.data as Request);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const send = async () => {
    setSending(true);
    try {
      const r = await fetch(`/api/signup-requests/by-token/${token}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: answer.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Не удалось отправить");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-card/80 backdrop-blur-2xl p-7 shadow-[0_8px_60px_rgba(0,0,0,0.7)]">
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!error && !request && (
          <p className="text-sm text-white/60 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем заявку…
          </p>
        )}

        {request && (
          <>
            <h2 className="text-xl font-bold text-white mb-1">Заявка №{request.id}</h2>
            <p className="text-[13px] text-white/55 mb-5">
              {request.name} · {request.email} · от {new Date(request.createdAt).toLocaleDateString("ru-RU")}
            </p>

            <p className="text-sm text-white/80 mb-4">{STATUS_TEXT[request.status] ?? request.status}</p>

            {request.rejectionReason && (
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                Причина: {request.rejectionReason}
              </p>
            )}

            {request.infoRequest && (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 mb-4">
                <p className="text-[12px] text-white/50 mb-1">Что нужно прислать</p>
                <p className="text-sm text-white/85">{request.infoRequest}</p>
              </div>
            )}

            {sent || request.infoResponse ? (
              <div className="flex items-start gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Ответ отправлен — менеджер вернётся к вашей заявке.</span>
              </div>
            ) : request.status === "info_requested" ? (
              <div className="space-y-3">
                <Textarea
                  rows={6}
                  placeholder="Ваш ответ. Ссылки на документы можно вставить прямо сюда."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <Button className="w-full" disabled={sending || answer.trim().length < 2} onClick={send}>
                  {sending ? "Отправляем…" : "Отправить ответ"}
                </Button>
              </div>
            ) : null}

            <p className="text-center text-[11px] text-white/40 mt-6">
              <Link to="/login" className="text-primary hover:underline">Войти в кабинет</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
