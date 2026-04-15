function makeSinPath(
  totalW: number,
  amp: number,
  period: number,
  cy: number,
  phaseRad = 0,
  step = 8
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
  // Large slow primary wave — lower half
  { amp: 70,  period: 700,  cy: 520, phase: 0.0,  dur: 45,  violet: false, op: 0.14,  sw: 1.8 },
  // Medium wave — lower third
  { amp: 42,  period: 440,  cy: 580, phase: 1.1,  dur: 32,  violet: false, op: 0.10,  sw: 1.2 },
  // Small fast wave — very bottom
  { amp: 24,  period: 290,  cy: 630, phase: 2.4,  dur: 22,  violet: true,  op: 0.09,  sw: 1.0 },
  // Giant slow violet wave — mid page
  { amp: 85,  period: 980,  cy: 380, phase: 3.3,  dur: 65,  violet: true,  op: 0.07,  sw: 2.2 },
  // Subtle high primary wave — upper portion
  { amp: 30,  period: 560,  cy: 250, phase: 0.9,  dur: 52,  violet: false, op: 0.055, sw: 1.0 },
  // Tiny ripple wave — bottom
  { amp: 16,  period: 210,  cy: 660, phase: 1.7,  dur: 17,  violet: false, op: 0.075, sw: 0.8 },
];

export function WaveBackground() {
  const doubleW = TILE_W * 2;

  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute inset-0 overflow-hidden z-0"
    >
      {/* Ambient glow blobs */}
      <div className="absolute -top-48 -right-32 w-[720px] h-[720px] rounded-full opacity-100"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.07) 0%, transparent 70%)" }} />
      <div className="absolute top-1/3 -left-40 w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(271 80% 68%/0.05) 0%, transparent 70%)" }} />
      <div className="absolute -bottom-24 right-1/4 w-[500px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.04) 0%, transparent 70%)" }} />

      {/* Full-height wave SVG */}
      <svg
        viewBox={`0 0 ${doubleW} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        style={{ width: "200%", left: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
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
          const stroke = l.violet ? "hsl(271 80% 68%)" : "hsl(var(--primary))";

          return (
            <g
              key={i}
              style={{ animation: `wave${i} ${l.dur}s linear infinite` }}
            >
              <path d={pLeft}  fill="none" stroke={stroke} strokeWidth={l.sw} strokeOpacity={l.op} />
              <path d={pRight} fill="none" stroke={stroke} strokeWidth={l.sw} strokeOpacity={l.op}
                    transform={`translate(${TILE_W},0)`} />
            </g>
          );
        })}

        {/* Glowing dots at peaks of the 3 most visible waves */}
        {[0, 1, 2].map((li) => {
          const layer = LAYERS[li];
          const stroke = layer.violet ? "hsl(271 80% 68%)" : "hsl(var(--primary))";
          return [0.15, 0.3, 0.5, 0.65, 0.8, 1.0].map((f) => {
            const x = f * TILE_W;
            const y = layer.cy + layer.amp * Math.sin((2 * Math.PI / layer.period) * x + layer.phase);
            return (
              <circle key={`${li}-${f}`} cx={x} cy={y} r={3}
                fill={stroke} fillOpacity={0.22} />
            );
          });
        })}
      </svg>

      {/* Equalizer bars — bottom-right corner decoration */}
      <div className="absolute bottom-0 right-5 flex items-end gap-[3px] opacity-[0.10]">
        {[16, 30, 50, 68, 54, 82, 40, 62, 76, 48, 70, 36, 28, 56, 72, 44, 60, 34].map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-t-sm"
            style={{
              height: `${h}px`,
              background: i % 3 === 2 ? "hsl(271 80% 68%)" : "hsl(var(--primary))",
            }}
          />
        ))}
      </div>
    </div>
  );
}
