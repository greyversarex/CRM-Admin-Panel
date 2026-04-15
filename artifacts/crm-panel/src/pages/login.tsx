import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, type Role } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS: { role: Role; email: string; password: string; hint: string }[] = [
  { role: "admin",   email: "admin@tajikmusic.com",   password: "admin123",   hint: "Полный доступ" },
  { role: "manager", email: "manager@tajikmusic.com", password: "manager123", hint: "Без системных" },
  { role: "label",   email: "label@tajikmusic.com",   password: "label123",   hint: "Только своё" },
  { role: "artist",  email: "artist@tajikmusic.com",  password: "artist123",  hint: "Только своё" },
];

function MusicBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>{`
          @keyframes wave-drift { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
          @keyframes wave-drift2 { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
          @keyframes eq-bar1 { 0%,100%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} }
          @keyframes eq-bar2 { 0%,100%{transform:scaleY(1)} 33%{transform:scaleY(0.2)} 66%{transform:scaleY(0.8)} }
          @keyframes eq-bar3 { 0%,100%{transform:scaleY(0.6)} 40%{transform:scaleY(1)} 70%{transform:scaleY(0.1)} }
          @keyframes eq-bar4 { 0%,100%{transform:scaleY(0.8)} 25%{transform:scaleY(0.2)} 75%{transform:scaleY(1)} }
          @keyframes eq-bar5 { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(0.9)} }
          @keyframes float-note1 { 0%,100%{transform:translateY(0) rotate(-12deg) scale(1)} 50%{transform:translateY(-18px) rotate(-8deg) scale(1.05)} }
          @keyframes float-note2 { 0%,100%{transform:translateY(0) rotate(8deg) scale(1)} 50%{transform:translateY(-14px) rotate(12deg) scale(0.97)} }
          @keyframes float-note3 { 0%,100%{transform:translateY(0) rotate(15deg)} 50%{transform:translateY(-22px) rotate(10deg)} }
          @keyframes vinyl-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
          @keyframes glow-pulse { 0%,100%{opacity:0.12} 50%{opacity:0.22} }
          @keyframes dot-pulse { 0%,100%{r:2; opacity:0.5} 50%{r:3.5; opacity:1} }
          @keyframes scan-line { 0%{transform:translateX(-100%)} 100%{transform:translateX(100vw)} }
        `}</style>

        <linearGradient id="wave1g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(226 84% 67%)" stopOpacity="0" />
          <stop offset="20%" stopColor="hsl(226 84% 67%)" stopOpacity="0.35" />
          <stop offset="50%" stopColor="hsl(271 80% 68%)" stopOpacity="0.55" />
          <stop offset="80%" stopColor="hsl(226 84% 67%)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(226 84% 67%)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wave2g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(271 80% 68%)" stopOpacity="0" />
          <stop offset="25%" stopColor="hsl(271 80% 68%)" stopOpacity="0.3" />
          <stop offset="50%" stopColor="hsl(196 80% 60%)" stopOpacity="0.45" />
          <stop offset="75%" stopColor="hsl(271 80% 68%)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(271 80% 68%)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="staffg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="15%" stopColor="white" stopOpacity="0.06" />
          <stop offset="50%" stopColor="white" stopOpacity="0.1" />
          <stop offset="85%" stopColor="white" stopOpacity="0.06" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(226 84% 67%)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(271 80% 68%)" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="vinylg" cx="50%" cy="50%" r="50%" fx="50%" fy="50%" id="vinylg" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="hsl(226 84% 67%)" stopOpacity="0.25" />
          <stop offset="60%" stopColor="hsl(271 80% 68%)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </linearGradient>

        <filter id="glow-sm">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-lg">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Ambient radial glows ── */}
      <ellipse cx="1200" cy="160" rx="420" ry="320" fill="hsl(226 84% 67%)" opacity="0.055" style={{animation:"glow-pulse 6s ease-in-out infinite"}} />
      <ellipse cx="180"  cy="720" rx="380" ry="280" fill="hsl(271 80% 68%)" opacity="0.05"  style={{animation:"glow-pulse 8s ease-in-out infinite 2s"}} />
      <ellipse cx="720"  cy="450" rx="260" ry="200" fill="hsl(196 80% 60%)" opacity="0.035" style={{animation:"glow-pulse 10s ease-in-out infinite 4s"}} />

      {/* ── Music staff lines (sheet music) ─ left side ── */}
      {[0,1,2,3,4].map(i => (
        <line key={`ls${i}`}
          x1="0" y1={120 + i * 14} x2="340" y2={120 + i * 14}
          stroke="url(#staffg)" strokeWidth="0.8" opacity="0.9"
        />
      ))}
      {/* Right side staff */}
      {[0,1,2,3,4].map(i => (
        <line key={`rs${i}`}
          x1="1100" y1={700 + i * 14} x2="1440" y2={700 + i * 14}
          stroke="url(#staffg)" strokeWidth="0.8" opacity="0.9"
        />
      ))}
      {/* Top right corner staff */}
      {[0,1,2,3,4].map(i => (
        <line key={`trs${i}`}
          x1="1050" y1={60 + i * 14} x2="1440" y2={60 + i * 14}
          stroke="url(#staffg)" strokeWidth="0.7" opacity="0.7"
        />
      ))}
      {/* Bottom left staff */}
      {[0,1,2,3,4].map(i => (
        <line key={`bls${i}`}
          x1="0" y1={790 + i * 12} x2="300" y2={790 + i * 12}
          stroke="url(#staffg)" strokeWidth="0.7" opacity="0.6"
        />
      ))}

      {/* ── Big scrolling waveform — center band ── */}
      <g style={{animation:"wave-drift 18s linear infinite"}}>
        <path
          d="M0,450 C60,410 120,490 180,450 C240,410 300,490 360,450 C420,410 480,490 540,450 C600,410 660,490 720,450 C780,410 840,490 900,450 C960,410 1020,490 1080,450 C1140,410 1200,490 1260,450 C1320,410 1380,490 1440,450 C1500,410 1560,490 1620,450 C1680,410 1740,490 1800,450 C1860,410 1920,490 1980,450 C2040,410 2100,490 2160,450 C2220,410 2280,490 2340,450 C2400,410 2460,490 2520,450 C2580,410 2640,490 2700,450 C2760,410 2820,490 2880,450"
          fill="none" stroke="url(#wave1g)" strokeWidth="1.5" filter="url(#glow-sm)"
        />
        <path
          d="M0,460 C80,400 160,520 240,460 C320,400 400,520 480,460 C560,400 640,520 720,460 C800,400 880,520 960,460 C1040,400 1120,520 1200,460 C1280,400 1360,520 1440,460 C1520,400 1600,520 1680,460 C1760,400 1840,520 1920,460 C2000,400 2080,520 2160,460 C2240,400 2320,520 2400,460 C2480,400 2560,520 2640,460 C2720,400 2800,520 2880,460"
          fill="none" stroke="url(#wave1g)" strokeWidth="0.7" opacity="0.5"
        />
      </g>

      {/* ── Second waveform — upper zone ── */}
      <g style={{animation:"wave-drift2 24s linear infinite reverse"}}>
        <path
          d="M0,200 C90,160 180,240 270,200 C360,160 450,240 540,200 C630,160 720,240 810,200 C900,160 990,240 1080,200 C1170,160 1260,240 1350,200 C1440,160 1530,240 1620,200 C1710,160 1800,240 1890,200 C1980,160 2070,240 2160,200 C2250,160 2340,240 2430,200 C2520,160 2610,240 2700,200 C2790,160 2880,240 2880,200"
          fill="none" stroke="url(#wave2g)" strokeWidth="1.2" filter="url(#glow-sm)"
        />
      </g>

      {/* ── Third waveform — lower zone ── */}
      <g style={{animation:"wave-drift 30s linear infinite 5s"}}>
        <path
          d="M0,720 C70,685 140,755 210,720 C280,685 350,755 420,720 C490,685 560,755 630,720 C700,685 770,755 840,720 C910,685 980,755 1050,720 C1120,685 1190,755 1260,720 C1330,685 1400,755 1470,720 C1540,685 1610,755 1680,720 C1750,685 1820,755 1890,720 C1960,685 2030,755 2100,720 C2170,685 2240,755 2310,720 C2380,685 2450,755 2520,720 C2590,685 2660,755 2730,720 C2800,685 2870,755 2880,720"
          fill="none" stroke="url(#wave2g)" strokeWidth="1.1" filter="url(#glow-sm)" opacity="0.8"
        />
      </g>

      {/* ── Waveform visualizer bars — left panel ── */}
      {Array.from({length: 28}, (_, i) => {
        const x = 30 + i * 10;
        const maxH = Math.max(6, 25 + Math.sin(i * 0.7) * 20 + Math.cos(i * 1.3) * 15);
        const delay = `${(i * 0.08).toFixed(2)}s`;
        const dur = `${0.6 + (i % 5) * 0.15}s`;
        return (
          <rect key={`lbar${i}`}
            x={x - 3} y={300 - maxH / 2}
            width="5" height={maxH}
            rx="2.5"
            fill="url(#eqg)" opacity="0.35"
            style={{
              transformOrigin: `${x}px ${300}px`,
              animation: `eq-bar${(i % 5) + 1} ${dur} ease-in-out infinite ${delay}`
            }}
          />
        );
      })}

      {/* ── Waveform visualizer bars — right panel ── */}
      {Array.from({length: 22}, (_, i) => {
        const x = 1140 + i * 12;
        const maxH = Math.max(6, 20 + Math.sin(i * 0.9) * 18 + Math.cos(i * 1.1) * 12);
        const delay = `${(i * 0.1).toFixed(2)}s`;
        const dur = `${0.5 + (i % 5) * 0.18}s`;
        return (
          <rect key={`rbar${i}`}
            x={x - 3.5} y={550 - maxH / 2}
            width="6" height={maxH}
            rx="3"
            fill="url(#eqg)" opacity="0.3"
            style={{
              transformOrigin: `${x}px ${550}px`,
              animation: `eq-bar${((i + 2) % 5) + 1} ${dur} ease-in-out infinite ${delay}`
            }}
          />
        );
      })}

      {/* ── Glowing dots along upper wave ── */}
      {[0,1,2,3,4,5,6,7].map(i => {
        const x = 120 + i * 190;
        const y = 200 + Math.sin(i * 1.1) * 40;
        return (
          <circle key={`wd${i}`} cx={x} cy={y} r="2.5"
            fill="hsl(271 80% 68%)" filter="url(#glow-sm)"
            style={{animation:`dot-pulse ${1.2 + i * 0.2}s ease-in-out infinite ${i * 0.3}s`}}
          />
        );
      })}

      {/* ── Glowing dots along center wave ── */}
      {[0,1,2,3,4,5,6,7,8].map(i => {
        const x = 60 + i * 170;
        const y = 450 + Math.sin(i * 1.2) * 40;
        return (
          <circle key={`cd${i}`} cx={x} cy={y} r="2"
            fill="hsl(226 84% 67%)" filter="url(#glow-sm)"
            style={{animation:`dot-pulse ${1.0 + i * 0.15}s ease-in-out infinite ${i * 0.25}s`}}
          />
        );
      })}

      {/* ── Vinyl record — top right ── */}
      <g transform="translate(1310, 120)" style={{animation:"vinyl-spin 20s linear infinite", transformOrigin:"0px 0px"}}>
        <circle cx="0" cy="0" r="90" fill="none" stroke="hsl(226 84% 67%)" strokeWidth="0.6" opacity="0.12" />
        <circle cx="0" cy="0" r="75" fill="none" stroke="hsl(226 84% 67%)" strokeWidth="0.4" opacity="0.1" />
        <circle cx="0" cy="0" r="60" fill="none" stroke="hsl(271 80% 68%)" strokeWidth="0.5" opacity="0.13" />
        <circle cx="0" cy="0" r="45" fill="none" stroke="hsl(271 80% 68%)" strokeWidth="0.4" opacity="0.1" />
        <circle cx="0" cy="0" r="30" fill="none" stroke="hsl(226 84% 67%)" strokeWidth="0.5" opacity="0.15" />
        <circle cx="0" cy="0" r="10" fill="hsl(226 84% 67%)" opacity="0.12" />
        <circle cx="0" cy="0" r="4"  fill="hsl(271 80% 68%)" opacity="0.3" />
      </g>

      {/* ── Vinyl record — bottom left ── */}
      <g transform="translate(110, 790)" style={{animation:"vinyl-spin 28s linear infinite reverse", transformOrigin:"0px 0px"}}>
        <circle cx="0" cy="0" r="80" fill="none" stroke="hsl(271 80% 68%)" strokeWidth="0.6" opacity="0.1" />
        <circle cx="0" cy="0" r="65" fill="none" stroke="hsl(271 80% 68%)" strokeWidth="0.4" opacity="0.08" />
        <circle cx="0" cy="0" r="50" fill="none" stroke="hsl(226 84% 67%)" strokeWidth="0.5" opacity="0.12" />
        <circle cx="0" cy="0" r="35" fill="none" stroke="hsl(226 84% 67%)" strokeWidth="0.4" opacity="0.09" />
        <circle cx="0" cy="0" r="20" fill="none" stroke="hsl(271 80% 68%)" strokeWidth="0.5" opacity="0.13" />
        <circle cx="0" cy="0" r="7"  fill="hsl(271 80% 68%)" opacity="0.2" />
        <circle cx="0" cy="0" r="3"  fill="hsl(226 84% 67%)" opacity="0.35" />
      </g>

      {/* ── Floating music notes — top left ── */}
      <g opacity="0.18" style={{animation:"float-note1 6s ease-in-out infinite"}} filter="url(#glow-sm)">
        <g transform="translate(80, 280) rotate(-12) scale(1.4)">
          <ellipse cx="0" cy="0" rx="8" ry="6" fill="hsl(226 84% 67%)" transform="rotate(-15)" />
          <rect x="7.5" y="-28" width="2" height="28" fill="hsl(226 84% 67%)" />
          <path d="M9.5,-28 Q22,-24 22,-16 Q22,-10 9.5,-12 Z" fill="hsl(226 84% 67%)" />
        </g>
      </g>
      <g opacity="0.13" style={{animation:"float-note2 8s ease-in-out infinite 1.5s"}} filter="url(#glow-sm)">
        <g transform="translate(195, 220) rotate(8) scale(1.1)">
          <ellipse cx="0" cy="0" rx="7" ry="5.5" fill="hsl(271 80% 68%)" transform="rotate(-15)" />
          <rect x="6.5" y="-25" width="2" height="25" fill="hsl(271 80% 68%)" />
          <path d="M8.5,-25 Q19,-21 19,-14 Q19,-8 8.5,-10 Z" fill="hsl(271 80% 68%)" />
        </g>
      </g>

      {/* ── Floating double note — top right ── */}
      <g opacity="0.15" style={{animation:"float-note3 9s ease-in-out infinite 3s"}} filter="url(#glow-sm)">
        <g transform="translate(1180, 300) rotate(10) scale(1.3)">
          <ellipse cx="0"  cy="0" rx="7" ry="5.5" fill="hsl(196 80% 60%)" transform="rotate(-15)" />
          <ellipse cx="18" cy="5" rx="7" ry="5.5" fill="hsl(196 80% 60%)" transform="rotate(-15)" />
          <rect x="6.5"  y="-26" width="2" height="26" fill="hsl(196 80% 60%)" />
          <rect x="24.5" y="-21" width="2" height="26" fill="hsl(196 80% 60%)" />
          <line x1="8.5" y1="-26" x2="26.5" y2="-21" stroke="hsl(196 80% 60%)" strokeWidth="2" />
        </g>
      </g>

      {/* ── Small scattered notes ── */}
      <g opacity="0.1" transform="translate(1350, 480) rotate(-5) scale(0.9)" style={{animation:"float-note1 11s ease-in-out infinite 2s"}}>
        <ellipse cx="0" cy="0" rx="6" ry="5" fill="hsl(226 84% 67%)" transform="rotate(-15)" />
        <rect x="5.5" y="-22" width="1.8" height="22" fill="hsl(226 84% 67%)" />
      </g>
      <g opacity="0.09" transform="translate(60, 540) rotate(6) scale(0.85)" style={{animation:"float-note2 13s ease-in-out infinite 4s"}}>
        <ellipse cx="0" cy="0" rx="6" ry="5" fill="hsl(271 80% 68%)" transform="rotate(-15)" />
        <rect x="5.5" y="-22" width="1.8" height="22" fill="hsl(271 80% 68%)" />
      </g>

      {/* ── Grid-like frequency dots — background texture ── */}
      {Array.from({length: 6}, (_, row) =>
        Array.from({length: 8}, (_, col) => {
          const x = 1180 + col * 38;
          const y = 340 + row * 38;
          const op = 0.04 + Math.sin(row + col) * 0.02;
          return <circle key={`g${row}-${col}`} cx={x} cy={y} r="1.5" fill="hsl(226 84% 67%)" opacity={op} />;
        })
      )}
      {Array.from({length: 5}, (_, row) =>
        Array.from({length: 6}, (_, col) => {
          const x = 30 + col * 40;
          const y = 430 + row * 38;
          const op = 0.04 + Math.cos(row + col) * 0.02;
          return <circle key={`g2${row}-${col}`} cx={x} cy={y} r="1.5" fill="hsl(271 80% 68%)" opacity={op} />;
        })
      )}

      {/* ── Horizontal scan line ── */}
      <rect y="440" width="200" height="1"
        fill="url(#wave1g)" opacity="0.4"
        style={{animation:"scan-line 8s linear infinite"}}
      />
    </svg>
  );
}

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
      {/* Music-themed animated background */}
      <MusicBackground />

      {/* Soft radial glow behind card */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 700px 600px at 50% 50%, hsl(var(--primary)/0.06) 0%, transparent 70%)" }} />

      <div className="relative z-10 w-full max-w-[420px] px-4">
        {/* Logo — no icon, just image + subtitle */}
        <div className="flex flex-col items-center mb-8">
          <img src="/tajikmusic-logo.png" alt="Tajik Music" className="h-12 w-auto object-contain mb-2" />
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
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Вход...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />Войти
                  </span>
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
