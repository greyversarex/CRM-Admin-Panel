// ─── Public Signup (Task #6) ──────────────────────────────────────────────
// Простая страница «Подать заявку» — публичная, без auth. Отправляет POST
// на /api/signup-requests; backend сам ограничивает 3/час/IP и валидирует
// email/имя. После успеха показываем подтверждение + ссылку на /login.
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ArrowLeft, Loader2, Send } from "lucide-react";

type EntityType = "artist" | "label";

export default function Signup() {
  const [, navigate] = useLocation();
  const [entityType, setEntityType] = useState<EntityType>("artist");
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [phone, setPhone]     = useState("");
  const [country, setCountry] = useState("tj");
  const [legalName, setLegalName] = useState("");
  const [inn, setInn]         = useState("");
  const [message, setMessage] = useState("");
  const [agree, setAgree]     = useState(false);

  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState<{ requestId: number } | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError("Подтверди согласие на обработку персональных данных");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/signup-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType, name, email,
          phone:     phone     || null,
          country:   country   || null,
          legalName: legalName || null,
          inn:       inn       || null,
          message:   message   || null,
        }),
      });
      const j: unknown = await res.json().catch(() => ({}));
      const obj = (j && typeof j === "object") ? (j as Record<string, unknown>) : {};
      if (!res.ok) {
        const errMsg = typeof obj.error === "string" ? obj.error : `Ошибка ${res.status}`;
        setError(errMsg);
        return;
      }
      const reqId = typeof obj.requestId === "number" ? obj.requestId : 0;
      setSubmitted({ requestId: reqId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка сети";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-card/80 backdrop-blur-2xl p-8 shadow-[0_8px_60px_rgba(0,0,0,0.7)]">
          <div className="flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Заявка отправлена</h2>
            <p className="text-sm text-white/60 mb-1">
              Номер заявки: <span className="text-white font-mono">#{submitted.requestId}</span>
            </p>
            <p className="text-sm text-white/60 mb-6">
              После одобрения мы пришлём логин и временный пароль на указанный email.
              Обычно это занимает 1–2 рабочих дня.
            </p>
            <Button onClick={() => navigate("/login")} className="w-full">
              Перейти на страницу входа
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> К входу
        </Link>
        <div className="rounded-2xl border border-white/10 bg-card/80 backdrop-blur-2xl shadow-[0_8px_60px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[hsl(226,84%,67%)] via-50% to-[hsl(271,80%,68%)] to-transparent" />
          <div className="p-7">
            <h2 className="text-xl font-bold text-white mb-1">Подать заявку на регистрацию</h2>
            <p className="text-[13px] text-white/55 mb-6">
              Заполни форму — менеджер свяжется с тобой и активирует аккаунт.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* entity type */}
              <div>
                <Label className="text-[12px] font-medium text-white/65 mb-1.5">Тип аккаунта</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEntityType("artist")}
                    className={`px-4 py-3 rounded-lg border text-left transition-all ${
                      entityType === "artist"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-white/10 bg-background/40 text-white/60 hover:border-white/20"
                    }`}
                  >
                    <div className="text-sm font-semibold">Артист</div>
                    <div className="text-[11px] opacity-70 mt-0.5">Соло-исполнитель / коллектив</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntityType("label")}
                    className={`px-4 py-3 rounded-lg border text-left transition-all ${
                      entityType === "label"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-white/10 bg-background/40 text-white/60 hover:border-white/20"
                    }`}
                  >
                    <div className="text-sm font-semibold">Лейбл / компания</div>
                    <div className="text-[11px] opacity-70 mt-0.5">Юр.лицо или ИП</div>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-[12px] font-medium text-white/65 mb-1.5">
                    {entityType === "artist" ? "Имя артиста" : "Название лейбла"} *
                  </Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
                </div>
                <div>
                  <Label className="text-[12px] font-medium text-white/65 mb-1.5">Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-[12px] font-medium text-white/65 mb-1.5">Телефон</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+992 ..." />
                </div>
                <div>
                  <Label className="text-[12px] font-medium text-white/65 mb-1.5">Страна</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tj">🇹🇯 Таджикистан</SelectItem>
                      <SelectItem value="ru">🇷🇺 Россия</SelectItem>
                      <SelectItem value="uz">🇺🇿 Узбекистан</SelectItem>
                      <SelectItem value="kz">🇰🇿 Казахстан</SelectItem>
                      <SelectItem value="kg">🇰🇬 Кыргызстан</SelectItem>
                      <SelectItem value="es">🇪🇸 Испания</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {entityType === "label" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-[12px] font-medium text-white/65 mb-1.5">Юридическое название</Label>
                    <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="ООО / OOO ..." />
                  </div>
                  <div>
                    <Label className="text-[12px] font-medium text-white/65 mb-1.5">ИНН / Tax ID</Label>
                    <Input value={inn} onChange={(e) => setInn(e.target.value)} />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-[12px] font-medium text-white/65 mb-1.5">Сообщение менеджеру</Label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  placeholder="Расскажи кратко о себе/каталоге, ссылки на портфолио…"
                  className="w-full min-h-[110px] px-3 py-2 text-sm rounded-md bg-background/50 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-white/55 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  Я согласен на обработку персональных данных в рамках Закона РТ
                  «О защите персональных данных» (политика конфиденциальности — в подвале сайта).
                </span>
              </label>

              {error && (
                <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-gradient-to-r from-[hsl(226,84%,60%)] to-[hsl(271,80%,62%)] hover:opacity-90 text-white font-semibold border-0"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Отправка...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" /> Отправить заявку
                  </span>
                )}
              </Button>
            </form>

            <p className="text-center text-[11px] text-white/40 mt-5">
              Уже есть аккаунт? <Link to="/login" className="text-primary hover:underline">Войти</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
