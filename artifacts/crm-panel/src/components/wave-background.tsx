function makeSinPath(
  totalW: number,
  amp: number,
  period: number,
  cy: number,
  phaseRad = 0,
  step = 6
): string {
  const parts: string[] = [];
  for (let x = 0; x <= totalW; x += step) {
    const y = cy + amp * Math.sin(((2 * Math.PI) / period) * x + phaseRad);
    parts.push(
      x === 0
        ? `M ${x.toFixed(1)},${y.toFixed(1)}`
        : `L ${x.toFixed(1)},${y.toFixed(1)}`
    );
  }
  return parts.join(" ");
}

const TILE_W = 1600;
const H = 700;

const LAYERS = [
  // Giant slow primary wave — lower half
  { amp: 90,  period: 780,  cy: 510, phase: 0.0,  dur: 52,  violet: false, op: 0.22,  sw: 2.4 },
  // Medium wave — lower third
  { amp: 55,  period: 460,  cy: 575, phase: 1.1,  dur: 36,  violet: false, op: 0.16,  sw: 1.6 },
  // Flowing violet wave — bottom
  { amp: 32,  period: 310,  cy: 625, phase: 2.4,  dur: 24,  violet: true,  op: 0.15,  sw: 1.3 },
  // Majestic slow violet wave — mid page
  { amp: 100, period: 1050, cy: 370, phase: 3.3,  dur: 72,  violet: true,  op: 0.11,  sw: 2.8 },
  // Graceful high primary wave — upper portion
  { amp: 40,  period: 600,  cy: 240, phase: 0.9,  dur: 58,  violet: false, op: 0.09,  sw: 1.4 },
  // Ripple — bottom
  { amp: 22,  period: 230,  cy: 655, phase: 1.7,  dur: 19,  violet: false, op: 0.12,  sw: 1.0 },
  // Subtle cyan accent wave — mid-upper
  { amp: 28,  period: 520,  cy: 300, phase: 5.1,  dur: 44,  violet: false, op: 0.07,  sw: 1.0, cyan: true },
];

export function WaveBackground() {
  const doubleW = TILE_W * 2;

  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute inset-0 overflow-hidden z-0"
    >
      {/* Ambient glow blobs — more luminous */}
      <div className="absolute -top-48 -right-32 w-[800px] h-[800px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.10) 0%, hsl(var(--primary)/0.03) 45%, transparent 70%)" }} />
      <div className="absolute top-1/3 -left-48 w-[680px] h-[680px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(271 80% 68%/0.08) 0%, transparent 65%)" }} />
      <div className="absolute -bottom-24 right-1/4 w-[560px] h-[560px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(196 80% 60%/0.06) 0%, transparent 65%)" }} />
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.04) 0%, transparent 60%)" }} />

      {/* Full-height wave SVG */}
      <svg
        viewBox={`0 0 ${doubleW} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        style={{ width: "200%", left: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="waveGlow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="waveGlowStrong" x="-20%" y="-80%" width="140%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <style>{`
          ${LAYERS.map(
            (_, i) => `
          @keyframes wave${i} {
            from { transform: translateX(0); }
            to   { transform: translateX(-${TILE_W}px); }
          }`
          ).join("")}
        `}</style>

        {LAYERS.map((l, i) => {
          const pLeft  = makeSinPath(TILE_W, l.amp, l.period, l.cy, l.phase);
          const pRight = makeSinPath(
            TILE_W, l.amp, l.period, l.cy,
            l.phase + (2 * Math.PI * TILE_W) / l.period
          );
          const lDef = l as typeof l & { cyan?: boolean };
          const stroke = lDef.cyan
            ? "hsl(196 80% 60%)"
            : lDef.violet
              ? "hsl(271 80% 68%)"
              : "hsl(var(--primary))";
          const useGlow = i <= 3;

          return (
            <g
              key={i}
              style={{ animation: `wave${i} ${l.dur}s linear infinite` }}
              filter={useGlow ? (i <= 1 ? "url(#waveGlowStrong)" : "url(#waveGlow)") : undefined}
            >
              <path d={pLeft}  fill="none" stroke={stroke} strokeWidth={l.sw} strokeOpacity={l.op} />
              <path d={pRight} fill="none" stroke={stroke} strokeWidth={l.sw} strokeOpacity={l.op}
                    transform={`translate(${TILE_W},0)`} />
            </g>
          );
        })}

        {/* Glowing dots at peaks */}
        {[0, 1, 3].map((li) => {
          const layer = LAYERS[li];
          const lDef = layer as typeof layer & { cyan?: boolean };
          const stroke = lDef.cyan
            ? "hsl(196 80% 60%)"
            : lDef.violet
              ? "hsl(271 80% 68%)"
              : "hsl(var(--primary))";
          return [0.12, 0.28, 0.45, 0.60, 0.77, 0.92].map((f) => {
            const x = f * TILE_W;
            const y = layer.cy + layer.amp * Math.sin((2 * Math.PI / layer.period) * x + layer.phase);
            return (
              <circle key={`${li}-${f}`} cx={x} cy={y} r={li === 0 ? 4 : 3}
                fill={stroke} fillOpacity={0.30} />
            );
          });
        })}
      </svg>

      {/* Equalizer bars — bottom-right corner */}
      <div className="absolute bottom-0 right-5 flex items-end gap-[3px] opacity-[0.13]">
        {[16, 30, 50, 68, 54, 82, 40, 62, 76, 48, 70, 36, 28, 56, 72, 44, 60, 34].map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-t-sm"
            style={{
              height: `${h}px`,
              background: i % 3 === 2 ? "hsl(271 80% 68%)" : i % 3 === 1 ? "hsl(196 80% 60%)" : "hsl(var(--primary))",
            }}
          />
        ))}
      </div>
    </div>
  );
}
