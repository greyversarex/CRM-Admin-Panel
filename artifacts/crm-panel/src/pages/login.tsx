import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, type Role } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

const DEMO_ACCOUNTS: { role: Role; email: string; password: string; hintKey: "demo_hint_admin" | "demo_hint_manager" | "demo_hint_own" }[] = [
  { role: "admin",   email: "admin@tajikmusic.com",   password: "admin123",   hintKey: "demo_hint_admin" },
  { role: "manager", email: "manager@tajikmusic.com", password: "manager123", hintKey: "demo_hint_manager" },
  { role: "label",   email: "label@tajikmusic.com",   password: "label123",   hintKey: "demo_hint_own" },
  { role: "artist",  email: "artist@tajikmusic.com",  password: "artist123",  hintKey: "demo_hint_own" },
];

export default function Login() {
  const { login, loginAs } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLang();
  const l = t.login;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) navigate("/");
    else setError(result.error ?? l.error);
  };

  const handleDemo = async (role: Role) => {
    setError("");
    setLoading(true);
    const result = await loginAs(role);
    setLoading(false);
    if (result.ok) navigate("/");
    else setError(result.error ?? l.error_as + role);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 px-10 py-10"
        style={{
          background: "hsl(222 28% 6%)",
          borderRight: "1px solid hsl(220 16% 14%)",
        }}
      >
        <div>
          <img
            src="/tajikmusic-logo.png"
            alt="Tajik Music"
            className="h-10 w-auto object-contain select-none"
            draggable={false}
          />
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-[22px] font-semibold text-white/90 leading-snug">
              Платформа дистрибуции таджикской музыки
            </p>
            <p className="mt-3 text-sm text-white/45 leading-relaxed">
              Управление релизами, правами, роялти и аналитикой в едином пространстве.
            </p>
          </div>

          <div className="space-y-3">
            {[
              "Дистрибуция на 40+ платформ",
              "Мониторинг роялти и выплаты",
              "Управление правами и KYC",
              "Аналитика стримов и плейлистов",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "hsl(226 84% 67%)" }}
                />
                <span className="text-sm text-white/55">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-white/25">
          Tajik Music Distribution · PA-DPIDA-2024053004-T
        </p>
      </div>

      {/* Right panel — login form */}
      <div
        className="flex-1 flex items-center justify-center px-4"
        style={{ background: "hsl(222 22% 5%)" }}
      >
        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img
              src="/tajikmusic-logo.png"
              alt="Tajik Music"
              className="h-10 w-auto object-contain"
              draggable={false}
            />
          </div>

          <div className="mb-7">
            <h2 className="text-[20px] font-semibold text-white">{l.title}</h2>
            <p className="text-[13px] text-white/45 mt-1">{l.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/60 block">Email</label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="h-10 bg-white/[0.04] border-white/[0.10] text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/60 block">{l.password}</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="h-10 pr-10 bg-white/[0.04] border-white/[0.10] text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[12px] text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 font-semibold mt-1"
              style={{ background: "hsl(226 84% 62%)" }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {l.signing_in}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="h-3.5 w-3.5" />{l.sign_in}
                </span>
              )}
            </Button>
          </form>

          <p className="text-center text-[12px] text-white/40 mt-5">
            {l.no_account}{" "}
            <Link to="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
              {l.apply}
            </Link>
          </p>

          {import.meta.env.DEV && (
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid hsl(220 16% 14%)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mb-3">
                {l.demo_accounts}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map(acc => (
                  <button
                    key={acc.role}
                    onClick={() => handleDemo(acc.role)}
                    disabled={loading}
                    className={cn(
                      "flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer",
                      "hover:brightness-110 disabled:opacity-50",
                      ROLE_COLORS[acc.role],
                    )}
                  >
                    <span className="text-[11px] font-semibold">{ROLE_LABELS[acc.role]}</span>
                    <span className="text-[10px] opacity-60">{l[acc.hintKey]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
