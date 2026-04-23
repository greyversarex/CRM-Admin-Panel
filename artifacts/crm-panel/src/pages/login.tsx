import { useState, useRef, useEffect } from "react";
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

/* ─── Canvas Music Visualizer ─── */
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; }
interface NoteParticle { x: number; y: number; vy: number; life: number; maxLife: number; symbol: string; size: number; hue: number; rotation: number; }

function useMusicCanvas(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let t = 0;

    // Resize
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Spectrum bars state — each bar has its own "target" energy
    const BAR_COUNT = 96;
    const barEnergy  = Array.from({ length: BAR_COUNT }, (_, i) =>
      0.15 + Math.random() * 0.5 + (i < 10 || i > 80 ? 0.1 : 0)
    );
    const barVel = new Array(BAR_COUNT).fill(0);

    // Particles along waves
    const particles: Particle[] = [];
    const MAX_PARTICLES = 120;

    // Floating note symbols
    const notes: NoteParticle[] = [];
    const NOTE_SYMBOLS = ["♩", "♪", "♫", "♬", "𝅗𝅥"];
    let noteTimer = 0;

    // Vinyl rings
    let vinylAngle = 0;

    function spawnParticle(W: number, H: number) {
      const side = Math.random() < 0.5 ? "wave" : "bottom";
      if (side === "wave") {
        const px = Math.random() * W;
        const waveY = H * 0.52 + Math.sin(px * 0.012 + t * 0.8) * H * 0.1;
        particles.push({
          x: px, y: waveY,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -0.4 - Math.random() * 0.6,
          life: 0, maxLife: 80 + Math.random() * 120,
          size: 1.5 + Math.random() * 2.5,
          hue: 220 + Math.random() * 80,
        });
      } else {
        particles.push({
          x: Math.random() * W,
          y: H * 0.88 + Math.random() * H * 0.08,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -1.2 - Math.random() * 1.5,
          life: 0, maxLife: 60 + Math.random() * 90,
          size: 1 + Math.random() * 2,
          hue: 260 + Math.random() * 60,
        });
      }
    }

    function spawnNote(W: number, H: number) {
      notes.push({
        x: 60 + Math.random() * (W - 120),
        y: H * 0.85,
        vy: -0.8 - Math.random() * 0.8,
        life: 0, maxLife: 150 + Math.random() * 100,
        symbol: NOTE_SYMBOLS[Math.floor(Math.random() * NOTE_SYMBOLS.length)],
        size: 14 + Math.random() * 22,
        hue: 210 + Math.random() * 100,
        rotation: (Math.random() - 0.5) * 30,
      });
    }

    function drawFrame() {
      const W = canvas.width;
      const H = canvas.height;
      t += 0.016;

      // Clear with slight trail
      ctx.fillStyle = "rgba(7,8,18,0.88)";
      ctx.fillRect(0, 0, W, H);

      // ── 1. Background ambient glows ──
      const g1 = ctx.createRadialGradient(W * 0.75, H * 0.2, 0, W * 0.75, H * 0.2, W * 0.45);
      g1.addColorStop(0, "hsla(226,84%,67%,0.06)");
      g1.addColorStop(1, "transparent");
      ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

      const g2 = ctx.createRadialGradient(W * 0.15, H * 0.8, 0, W * 0.15, H * 0.8, W * 0.4);
      g2.addColorStop(0, "hsla(271,80%,68%,0.07)");
      g2.addColorStop(1, "transparent");
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

      const g3 = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.35);
      g3.addColorStop(0, "hsla(200,80%,60%,0.035)");
      g3.addColorStop(1, "transparent");
      ctx.fillStyle = g3; ctx.fillRect(0, 0, W, H);

      // ── 2. Vinyl record — top-right ──
      vinylAngle += 0.004;
      const vx = W - 130, vy = 120, vr = 90;
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(vinylAngle);
      for (let i = 6; i >= 1; i--) {
        const r = vr * (i / 6);
        const alpha = 0.04 + i * 0.02;
        ctx.strokeStyle = i % 2 === 0 ? `hsla(226,84%,67%,${alpha})` : `hsla(271,80%,68%,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }
      // Center dot
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
      cg.addColorStop(0, "hsla(226,84%,67%,0.5)");
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      // Arm
      ctx.restore();
      ctx.save();
      ctx.translate(vx + 70, vy - 65);
      ctx.rotate(0.45);
      ctx.strokeStyle = "hsla(226,84%,67%,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 80); ctx.stroke();
      ctx.fillStyle = "hsla(226,84%,67%,0.4)";
      ctx.beginPath(); ctx.arc(0, 80, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // ── 3. Music staff lines — top-left ──
      for (let s = 0; s < 5; s++) {
        const sy = 90 + s * 16;
        const sg = ctx.createLinearGradient(0, sy, W * 0.28, sy);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.3, "rgba(255,255,255,0.08)");
        sg.addColorStop(0.8, "rgba(255,255,255,0.06)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W * 0.28, sy); ctx.stroke();
      }
      // Staff — bottom right
      for (let s = 0; s < 5; s++) {
        const sy = H - 80 + s * 14;
        const sg = ctx.createLinearGradient(W * 0.72, sy, W, sy);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.2, "rgba(255,255,255,0.07)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(W * 0.72, sy); ctx.lineTo(W, sy); ctx.stroke();
      }

      // ── 4. Wave layers ──
      const waveLayers = [
        { amp: H * 0.07, freq: 0.010, phase: 0,    speed: 0.5,  cy: H * 0.30, lw: 1.5, color1: "226,84%,67%", color2: "271,80%,68%", alpha: 0.55, glow: 8 },
        { amp: H * 0.06, freq: 0.014, phase: 1.1,  speed: 0.7,  cy: H * 0.52, lw: 2.0, color1: "226,84%,67%", color2: "196,80%,60%", alpha: 0.75, glow: 12 },
        { amp: H * 0.05, freq: 0.009, phase: 2.2,  speed: 0.35, cy: H * 0.72, lw: 1.2, color1: "271,80%,68%", color2: "226,84%,67%", alpha: 0.45, glow: 6 },
        { amp: H * 0.03, freq: 0.020, phase: 3.5,  speed: 0.9,  cy: H * 0.45, lw: 0.8, color1: "196,80%,60%", color2: "271,80%,68%", alpha: 0.30, glow: 4 },
      ];

      waveLayers.forEach(wl => {
        ctx.save();
        ctx.shadowColor = `hsla(${wl.color1},${wl.alpha})`;
        ctx.shadowBlur  = wl.glow;
        ctx.lineWidth   = wl.lw;

        const wg = ctx.createLinearGradient(0, 0, W, 0);
        wg.addColorStop(0,   `hsla(${wl.color1},0)`);
        wg.addColorStop(0.15, `hsla(${wl.color1},${wl.alpha})`);
        wg.addColorStop(0.5, `hsla(${wl.color2},${wl.alpha})`);
        wg.addColorStop(0.85,`hsla(${wl.color1},${wl.alpha})`);
        wg.addColorStop(1,   `hsla(${wl.color1},0)`);
        ctx.strokeStyle = wg;

        ctx.beginPath();
        for (let x = 0; x <= W; x += 3) {
          const y = wl.cy + Math.sin(x * wl.freq + t * wl.speed + wl.phase) * wl.amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      });

      // ── 5. Spectrum analyzer bars — bottom ──
      const BAR_W = W / BAR_COUNT;
      const BAR_X0 = 0;
      const BAR_BASE = H;
      const BAR_MAX_H = H * 0.22;

      // Evolve bar energies (simulate music beat)
      const beat = 0.5 + 0.5 * Math.sin(t * 4.2) * Math.sin(t * 2.7);
      for (let i = 0; i < BAR_COUNT; i++) {
        const targetBase = 0.08 + Math.sin(i * 0.18 + t * 1.1) * 0.18 + Math.cos(i * 0.31 + t * 0.7) * 0.12;
        const beatBoost = (i < 8 || (i > 40 && i < 52)) ? beat * 0.35 : beat * 0.12;
        const target = Math.max(0.04, Math.min(1.0, targetBase + beatBoost + (i < 6 ? 0.25 : 0)));
        barVel[i] += (target - barEnergy[i]) * 0.18;
        barVel[i] *= 0.72;
        barEnergy[i] = Math.max(0.02, barEnergy[i] + barVel[i]);
      }

      for (let i = 0; i < BAR_COUNT; i++) {
        const bx   = BAR_X0 + i * BAR_W;
        const bh   = Math.max(2, barEnergy[i] * BAR_MAX_H);
        const hue1 = 220 + (i / BAR_COUNT) * 80;
        const hue2 = 260 + (i / BAR_COUNT) * 60;
        const alpha = 0.55 + barEnergy[i] * 0.4;

        const bg = ctx.createLinearGradient(0, BAR_BASE - bh, 0, BAR_BASE);
        bg.addColorStop(0, `hsla(${hue1},85%,70%,${alpha})`);
        bg.addColorStop(1, `hsla(${hue2},80%,50%,0.15)`);

        ctx.save();
        if (barEnergy[i] > 0.7) {
          ctx.shadowColor = `hsla(${hue1},84%,67%,0.8)`;
          ctx.shadowBlur  = 12;
        }
        ctx.fillStyle = bg;
        const bw = BAR_W * 0.65;
        ctx.beginPath();
        ctx.roundRect(bx + (BAR_W - bw) / 2, BAR_BASE - bh, bw, bh, [bw / 2, bw / 2, 2, 2]);
        ctx.fill();

        // Peak dot
        if (barEnergy[i] > 0.35) {
          ctx.fillStyle = `hsla(${hue1},90%,80%,${alpha})`;
          ctx.shadowColor = `hsla(${hue1},90%,80%,1)`;
          ctx.shadowBlur  = 8;
          ctx.beginPath();
          ctx.arc(bx + BAR_W / 2, BAR_BASE - bh - 2, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }


      // ── 6. Particles ──
      if (particles.length < MAX_PARTICLES && Math.random() < 0.35) spawnParticle(W, H);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life++;
        const pr = p.life / p.maxLife;
        const alpha = pr < 0.2 ? pr / 0.2 : pr > 0.7 ? (1 - pr) / 0.3 : 1;
        ctx.save();
        ctx.shadowColor = `hsla(${p.hue},80%,70%,${alpha * 0.8})`;
        ctx.shadowBlur  = 6;
        ctx.fillStyle   = `hsla(${p.hue},80%,70%,${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (p.life >= p.maxLife) particles.splice(i, 1);
      }

      // ── 7. Floating music notes ──
      noteTimer++;
      if (noteTimer > 90 && notes.length < 8) {
        spawnNote(W, H);
        noteTimer = 0;
      }

      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        n.y  += n.vy;
        n.x  += Math.sin(n.life * 0.04) * 0.5;
        n.life++;
        const nr = n.life / n.maxLife;
        const nalpha = nr < 0.15 ? nr / 0.15 : nr > 0.7 ? (1 - nr) / 0.3 : 0.85;

        ctx.save();
        ctx.globalAlpha = nalpha * 0.5;
        ctx.translate(n.x, n.y);
        ctx.rotate((n.rotation * Math.PI) / 180);
        ctx.shadowColor = `hsla(${n.hue},80%,70%,0.9)`;
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = `hsla(${n.hue},80%,75%,1)`;
        ctx.font        = `${n.size}px serif`;
        ctx.textAlign   = "center";
        ctx.fillText(n.symbol, 0, 0);
        ctx.restore();
        if (n.life >= n.maxLife) notes.splice(i, 1);
      }

      // ── 8. Scan line ──
      const scanX = ((t * 80) % (W * 1.4)) - W * 0.2;
      const sg2 = ctx.createLinearGradient(scanX - 60, 0, scanX + 60, 0);
      sg2.addColorStop(0, "transparent");
      sg2.addColorStop(0.5, "hsla(226,84%,67%,0.06)");
      sg2.addColorStop(1, "transparent");
      ctx.fillStyle = sg2;
      ctx.fillRect(scanX - 60, 0, 120, H);

      rafId = requestAnimationFrame(drawFrame);
    }

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);
}

function MusicCanvas() {
  const ref = useRef<HTMLCanvasElement>(null!);
  useMusicCanvas(ref);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full"
      style={{ display: "block" }}
    />
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

  const handleDemo = async (role: Role) => {
    setError("");
    setLoading(true);
    const result = await loginAs(role);
    setLoading(false);
    if (result.ok) navigate("/");
    else setError(result.error ?? "Не удалось войти как " + role);
  };

  return (
    <div className="min-h-screen bg-[hsl(222,47%,4%)] flex items-center justify-center relative overflow-hidden">
      {/* Real-time canvas music visualizer */}
      <MusicCanvas />

      {/* Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />

      <div className="relative z-10 w-full max-w-[420px] px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/tajikmusic-logo.png"
            alt="Tajik Music"
            className="h-13 w-auto object-contain mb-2 drop-shadow-[0_0_24px_hsla(226,84%,67%,0.35)]"
            style={{ filter: "drop-shadow(0 0 20px hsla(226,84%,67%,0.4))" }}
          />
          <p className="text-[11px] text-white/40 uppercase tracking-[0.2em] font-semibold">
            Distribution CRM
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-2xl shadow-[0_8px_60px_rgba(0,0,0,0.7)] overflow-hidden">
          {/* Gradient top stripe */}
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[hsl(226,84%,67%)] via-50% to-[hsl(271,80%,68%)] to-transparent" />

          <div className="p-7">
            <h2 className="text-[18px] font-bold text-white mb-1">Вход в систему</h2>
            <p className="text-[13px] text-white/50 mb-6">Введите данные аккаунта для входа</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-white/65 mb-1.5 block">Email</label>
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
                <label className="text-[12px] font-medium text-white/65 mb-1.5 block">Пароль</label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
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
                className="w-full h-10 bg-gradient-to-r from-[hsl(226,84%,60%)] to-[hsl(271,80%,62%)] hover:opacity-90 text-white font-semibold border-0"
                style={{ boxShadow: "0 0 28px hsla(226,84%,67%,0.4), 0 4px 16px rgba(0,0,0,0.5)" }}
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

            {/* Demo accounts — visible only in development */}
            {import.meta.env.DEV && (
            <div className="mt-6 pt-5 border-t border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30 mb-3">
                Демо-аккаунты (dev)
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
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-white/25 mt-5">
          Tajik Music Distribution · PA-DPIDA-2024053004-T
        </p>
      </div>
    </div>
  );
}
