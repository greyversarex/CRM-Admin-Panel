import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, type Role } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, LogIn, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS: { role: Role; email: string; password: string; hint: string }[] = [
  { role: "admin",   email: "admin@tajikmusic.com",   password: "admin123",   hint: "Полный доступ" },
  { role: "manager", email: "manager@tajikmusic.com", password: "manager123", hint: "Без системных" },
  { role: "label",   email: "label@tajikmusic.com",   password: "label123",   hint: "Только своё" },
  { role: "artist",  email: "artist@tajikmusic.com",  password: "artist123",  hint: "Только своё" },
];

export default function Login() {
  const { login, loginAs } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) navigate("/");
    else setError(result.error ?? "Ошибка входа");
  };

  const handleDemo = (role: Role) => {
    loginAs(role);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute -top-32 -right-32 w-[700px] h-[700px] rounded-full opacity-100 pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.08) 0%, transparent 65%)" }} />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(271 80% 68%/0.07) 0%, transparent 65%)" }} />

      <div className="relative z-10 w-full max-w-[420px] px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-[hsl(271_80%_68%)] flex items-center justify-center shadow-xl shadow-primary/30 mb-4 ring-1 ring-white/10">
            <Music2 className="h-7 w-7 text-white" />
          </div>
          <img src="/tajikmusic-logo.png" alt="Tajik Music" className="h-9 w-auto object-contain mb-1" />
          <p className="text-[11px] text-muted-foreground/60 uppercase tracking-[0.18em] font-semibold">
            Distribution CRM
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header stripe */}
          <div className="h-1 w-full bg-gradient-to-r from-primary via-[hsl(271_80%_68%)] to-primary/0" />

          <div className="p-7">
            <h2 className="text-[18px] font-bold text-white mb-1">Вход в систему</h2>
            <p className="text-[13px] text-muted-foreground/70 mb-6">Введите данные аккаунта для входа</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-white/70 mb-1.5 block">Email</label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="h-10"
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-white/70 mb-1.5 block">Пароль</label>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-gradient-to-r from-primary to-[hsl(271_80%_68%)] hover:opacity-90 text-white font-semibold shadow-lg shadow-primary/25 border-0"
              >
                {loading ? (
                  <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Вход...</span>
                ) : (
                  <span className="flex items-center gap-2"><LogIn className="h-4 w-4" />Войти</span>
                )}
              </Button>
            </form>

            {/* Demo accounts */}
            <div className="mt-6 pt-5 border-t border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 mb-3">
                Демо-аккаунты (для тестирования)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map(acc => (
                  <button
                    key={acc.role}
                    onClick={() => handleDemo(acc.role)}
                    className={cn(
                      "flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all hover:scale-[1.02] cursor-pointer",
                      ROLE_COLORS[acc.role],
                      "hover:brightness-110"
                    )}
                  >
                    <span className="text-[11px] font-bold">{ROLE_LABELS[acc.role]}</span>
                    <span className="text-[10px] opacity-70">{acc.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/40 mt-5">
          Tajik Music Distribution · PA-DPIDA-2024053004-T
        </p>
      </div>
    </div>
  );
}
