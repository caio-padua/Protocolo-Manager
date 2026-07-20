// ─────────────────────────────────────────────────────────────────────────────
// ARABESCO OCIDENTAL — 6 variantes arquitetônicas em escala de cinza
//
// W1 — Guilloché Óptico      : ondas senoidais sobrepostas de banco central
// W2 — Traceria Gótica       : arcos apontados com trefoil no interior
// W3 — Meandro Duplex        : dois fluxos de meandro grego entrelaçados
// W4 — Art Déco Chevron      : cascata de chevrons aninhados estilo Chrysler
// W5 — Óculo Clássico        : série de oculi romanos com raios e anéis
// W6 — Cosmatesque           : mosaico românico/bizantino de círculos encaixados
// ─────────────────────────────────────────────────────────────────────────────

const INK   = "#111";
const DARK  = "#1a1a1a";
const MID   = "#444";
const CREAM = "#f9f9f7";
const OVERFLOW = 28;
const SIDE_PAD = 44;

// ═══════════════════════════════════════════════════════════════════════════
// W1 — GUILLOCHÉ ÓPTICO
// Padrão de segurança de notas bancárias: múltiplas ondas senoidais sobrepostas
// em frequências levemente diferentes criam interferência óptica hipnótica.
// ═══════════════════════════════════════════════════════════════════════════
function PadGuilloche() {
  const T = 120;
  const H = 60;
  const id = "w1-gc";
  const cy = H / 2;

  function wave(n1: number, n2: number, amp1: number, amp2: number, phase: number): string {
    let d = "";
    for (let x = 0; x <= T; x += 0.8) {
      const f1 = (n1 * 2 * Math.PI * x) / T;
      const f2 = (n2 * 2 * Math.PI * x) / T;
      const y = cy + Math.sin(f1 + phase) * amp1 + Math.sin(f2 + phase * 0.7) * amp2;
      d += x === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return d;
  }

  const waves = [
    { n1: 5, n2: 7,  a1: H * 0.34, a2: H * 0.10, ph: 0,            sw: 1.6, op: 0.85 },
    { n1: 5, n2: 7,  a1: H * 0.34, a2: H * 0.10, ph: Math.PI / 2,  sw: 1.6, op: 0.85 },
    { n1: 5, n2: 7,  a1: H * 0.34, a2: H * 0.10, ph: Math.PI,      sw: 1.6, op: 0.85 },
    { n1: 5, n2: 7,  a1: H * 0.34, a2: H * 0.10, ph: Math.PI*3/2,  sw: 1.6, op: 0.85 },
    { n1: 3, n2: 11, a1: H * 0.20, a2: H * 0.12, ph: Math.PI / 4,  sw: 0.9, op: 0.55 },
    { n1: 3, n2: 11, a1: H * 0.20, a2: H * 0.12, ph: Math.PI*5/4,  sw: 0.9, op: 0.55 },
    { n1: 9, n2: 4,  a1: H * 0.14, a2: H * 0.18, ph: 0.3,          sw: 0.6, op: 0.38 },
    { n1: 9, n2: 4,  a1: H * 0.14, a2: H * 0.18, ph: Math.PI+0.3,  sw: 0.6, op: 0.38 },
  ];

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={H} patternUnits="userSpaceOnUse">
          <rect width={T} height={H} fill="#f5f5f2"/>
          {waves.map((w, i) => (
            <path key={i} d={wave(w.n1, w.n2, w.a1, w.a2, w.ph)}
              fill="none" stroke={DARK} strokeWidth={w.sw} opacity={w.op}
              strokeLinecap="round"/>
          ))}
          {/* Linha de base e topo para definir a faixa */}
          <line x1="0" y1="1" x2={T} y2="1" stroke={DARK} strokeWidth="0.5" opacity="0.3"/>
          <line x1="0" y1={H - 1} x2={T} y2={H - 1} stroke={DARK} strokeWidth="0.5" opacity="0.3"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// W2 — TRACERIA GÓTICA
// Arcos apontados em série com trefoil (3 folhas) no interior.
// O ritmo de colunas de catedral — vertical, elevado, preciso.
// ═══════════════════════════════════════════════════════════════════════════
function PadGothic() {
  const TW = 36;
  const TH = 64;
  const id = "w2-gt";
  const sw = 1.1;
  const thinSw = 0.6;

  // Pointed arch path: from (x0,yBase) to (x1,yBase), center-line pointing up to (mx, yTop)
  // Uses two circular arcs with radii = span (equilateral pointed arch)
  function pointedArch(x0: number, x1: number, yBase: number, yTop: number): string {
    const mx = (x0 + x1) / 2;
    const span = x1 - x0;
    const R = span; // equilateral: radius equals span for proper pointed arch
    // Apex computed from circle intersection
    const apexY = yTop;
    // Left arc: center at (x1, yBase), sweeps from (x0, yBase) to apex
    // Right arc: center at (x0, yBase), sweeps from apex to (x1, yBase)
    return [
      `M${x0.toFixed(2)},${yBase.toFixed(2)}`,
      `A${R.toFixed(2)},${R.toFixed(2)},0,0,1,${mx.toFixed(2)},${apexY.toFixed(2)}`,
      `A${R.toFixed(2)},${R.toFixed(2)},0,0,1,${x1.toFixed(2)},${yBase.toFixed(2)}`,
    ].join(" ");
  }

  // Trefoil: 3 circles of radius r arranged at 120° inside the arch
  function trefoil(cx: number, cy: number, r: number): string[] {
    const paths: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ang = (-90 + i * 120) * (Math.PI / 180);
      const ccx = cx + r * 0.9 * Math.cos(ang);
      const ccy = cy + r * 0.9 * Math.sin(ang);
      paths.push(`M${(ccx - r).toFixed(2)},${ccy.toFixed(2)} A${r.toFixed(2)},${r.toFixed(2)},0,1,1,${(ccx + r).toFixed(2)},${ccy.toFixed(2)} A${r.toFixed(2)},${r.toFixed(2)},0,1,1,${(ccx - r).toFixed(2)},${ccy.toFixed(2)}`);
    }
    return paths;
  }

  const W = TW;
  const H = TH;
  const archX0 = W * 0.12, archX1 = W * 0.88;
  const archYBase = H * 0.98, archYTop = H * 0.04;
  const archMid = (archX0 + archX1) / 2;
  // Inner arch (smaller, inside the outer)
  const inX0 = W * 0.22, inX1 = W * 0.78;
  const inYBase = H * 0.88, inYTop = H * 0.18;
  // Trefoil center: in upper third of inner arch
  const tfCx = archMid;
  const tfCy = inYTop + (inYBase - inYTop) * 0.45;
  const tfR = (inX1 - inX0) * 0.22;
  // Column shafts
  const colW = W * 0.07;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f3f3f0"/>
          {/* Column shafts at left and right edges */}
          <rect x={0} y={H * 0.92} width={archX0 + 1} height={H * 0.08} fill="#d0d0ce" stroke={DARK} strokeWidth={thinSw}/>
          <rect x={archX1 - 1} y={H * 0.92} width={TW - archX1 + 1} height={H * 0.08} fill="#d0d0ce" stroke={DARK} strokeWidth={thinSw}/>
          {/* Outer arch */}
          <path d={pointedArch(archX0, archX1, archYBase, archYTop)}
            fill="#eaeae8" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          {/* Inner arch (concentric, slightly smaller) */}
          <path d={pointedArch(inX0, inX1, inYBase, inYTop)}
            fill="#f3f3f0" stroke={DARK} strokeWidth={thinSw} strokeLinejoin="round"/>
          {/* Cusped arch at top of inner arch */}
          <path d={pointedArch(inX0 + 3, inX1 - 3, inYBase - 2, inYTop + 4)}
            fill="none" stroke={DARK} strokeWidth={thinSw * 0.8} strokeLinejoin="round" opacity="0.5"/>
          {/* Trefoil */}
          {trefoil(tfCx, tfCy, tfR).map((d, i) => (
            <path key={i} d={d} fill="#dededc" stroke={DARK} strokeWidth={thinSw} fillRule="evenodd"/>
          ))}
          {/* Thin panel lines between arches (Gothic mullion style) */}
          <line x1={archMid} y1={archYBase} x2={archMid} y2={inYBase}
            stroke={DARK} strokeWidth={thinSw * 0.7} opacity="0.4"/>
          {/* Quatrefoil hint at base */}
          <circle cx={archMid} cy={H * 0.94} r={W * 0.05}
            fill="#e0e0de" stroke={DARK} strokeWidth={thinSw * 0.6}/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// W3 — MEANDRO DUPLEX
// Dois fluxos de meandro grego fluindo em direções opostas, entrelaçados.
// O labirinto geométrico mais hipnótico da Grécia antiga em versão dupla.
// ═══════════════════════════════════════════════════════════════════════════
function PadMeandro() {
  const U = 8;   // unidade base do meandro
  const TW = U * 16;
  const TH = U * 8;
  const id = "w3-me";
  const sw = 1.5;

  // Meandro grego: L-shapes encadeados formando um labirinto
  // Desenho manual do tile via path
  // Fluxo 1 (parte superior): meandro clássico
  // Fluxo 2 (parte inferior): meandro espelhado verticalmente
  const s = U; // step

  // Upper meander (classic right-hand Greek key)
  const m1 = `
    M0,${s} L${s},${s} L${s},0 L${4*s},0 L${4*s},${3*s} L${s*2},${3*s} L${2*s},${2*s} L${3*s},${2*s}
    M${4*s},0 L${8*s},0 L${8*s},${s} L${5*s},${s} L${5*s},${3*s} L${8*s},${3*s}
    M${8*s},0 L${12*s},0 L${12*s},${3*s} L${9*s},${3*s} L${9*s},${s} L${11*s},${s} L${11*s},${2*s} L${10*s},${2*s}
    M${12*s},0 L${16*s},0 L${16*s},${s} L${13*s},${s} L${13*s},${3*s} L${16*s},${3*s}
  `;

  // Lower meander (mirror of upper, offset)
  const yOff = TH;
  const m2 = `
    M0,${yOff-s} L${s},${yOff-s} L${s},${yOff} L${4*s},${yOff} L${4*s},${yOff-3*s} L${2*s},${yOff-3*s} L${2*s},${yOff-2*s} L${3*s},${yOff-2*s}
    M${4*s},${yOff} L${8*s},${yOff} L${8*s},${yOff-s} L${5*s},${yOff-s} L${5*s},${yOff-3*s} L${8*s},${yOff-3*s}
    M${8*s},${yOff} L${12*s},${yOff} L${12*s},${yOff-3*s} L${9*s},${yOff-3*s} L${9*s},${yOff-s} L${11*s},${yOff-s} L${11*s},${yOff-2*s} L${10*s},${yOff-2*s}
    M${12*s},${yOff} L${16*s},${yOff} L${16*s},${yOff-s} L${13*s},${yOff-s} L${13*s},${yOff-3*s} L${16*s},${yOff-3*s}
  `;

  // Central divider line
  const midY = TH / 2;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f1f1ee"/>
          {/* Central stripe between the two meander flows */}
          <rect x="0" y={midY - s * 0.3} width={TW} height={s * 0.6}
            fill="#e2e2df" stroke="none"/>
          {/* Upper meander path */}
          <path d={m1} fill="none" stroke={DARK} strokeWidth={sw}
            strokeLinecap="square" strokeLinejoin="miter"/>
          {/* Lower meander path (mirrored) */}
          <path d={m2} fill="none" stroke={DARK} strokeWidth={sw}
            strokeLinecap="square" strokeLinejoin="miter"/>
          {/* Fine inner lines to give the meander a 3D engraved look */}
          <path d={m1} fill="none" stroke="#fff" strokeWidth={sw * 0.4}
            strokeLinecap="square" strokeLinejoin="miter" opacity="0.5"/>
          <path d={m2} fill="none" stroke="#fff" strokeWidth={sw * 0.4}
            strokeLinecap="square" strokeLinejoin="miter" opacity="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// W4 — ART DÉCO CHEVRON CASCATA
// Chevrons aninhados como os ornamentos do Chrysler Building.
// Cada unidade é uma pirâmide de 7 camadas com linhas finas de detalhe.
// Padrão mais associado ao glamour e precisão dos anos 1920–1930.
// ═══════════════════════════════════════════════════════════════════════════
function PadDeco() {
  const TW = 60;
  const TH = 56;
  const id = "w4-dc";
  const cx = TW / 2;
  const cy = TH / 2;
  const levels = 8;

  // Compute chevron points for level i (0=outermost)
  function chevronPath(i: number, pointing: "up" | "down"): string {
    const maxW = TW * 0.96;
    const maxH = TH * 0.88;
    const step = 1 / levels;
    const t = 1 - i * step;
    const w = maxW * t * 0.5;  // half-width
    const h = maxH * t * 0.5;  // half-height
    const tipY = pointing === "up" ? cy - h : cy + h;
    const baseY = pointing === "up" ? cy + h : cy - h;
    return [
      `M${(cx - w).toFixed(2)},${baseY.toFixed(2)}`,
      `L${cx.toFixed(2)},${tipY.toFixed(2)}`,
      `L${(cx + w).toFixed(2)},${baseY.toFixed(2)}`,
    ].join(" ");
  }

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f0f0ed"/>
          {/* Draw chevrons from outermost to innermost */}
          {Array.from({ length: levels }).map((_, i) => {
            const lightness = 220 - i * 8;
            const fill = `rgb(${lightness},${lightness},${lightness - 3})`;
            return (
              <path key={i}
                d={chevronPath(i, "up")}
                fill={fill}
                stroke={DARK}
                strokeWidth={i === 0 ? 1.2 : 0.7}
                strokeLinejoin="miter"
              />
            );
          })}
          {/* Fine engraving lines between chevrons (Art Déco detail) */}
          {Array.from({ length: levels - 1 }).map((_, i) => {
            const t0 = 1 - i / levels;
            const t1 = 1 - (i + 0.5) / levels;
            const w = TW * 0.96 * t1 * 0.5;
            const h = TH * 0.88 * t1 * 0.5;
            const tipY = cy - h;
            const baseY = cy + h;
            return (
              <path key={`l${i}`}
                d={`M${(cx - w).toFixed(2)},${baseY.toFixed(2)} L${cx.toFixed(2)},${tipY.toFixed(2)} L${(cx + w).toFixed(2)},${baseY.toFixed(2)}`}
                fill="none" stroke="#fff" strokeWidth={0.5} opacity={0.4}/>
            );
          })}
          {/* Center diamond accent */}
          <polygon
            points={`${cx},${cy - TH * 0.06} ${cx + TW * 0.05},${cy} ${cx},${cy + TH * 0.06} ${cx - TW * 0.05},${cy}`}
            fill={DARK} opacity="0.25"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// W5 — ÓCULO CLÁSSICO ROMANO
// Série de oculi (janelas circulares) com anéis concêntricos e raios —
// como os óculos das cúpulas do Panteão de Roma e das basílicas.
// ═══════════════════════════════════════════════════════════════════════════
function PadOculo() {
  const T = 56;
  const id = "w5-oc";
  const cx = T / 2;
  const cy = T / 2;
  const sw = 0.9;

  // Concentric rings
  const rings = [T * 0.46, T * 0.38, T * 0.30, T * 0.22, T * 0.14, T * 0.07];
  const spokes = 12;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={T} patternUnits="userSpaceOnUse">
          <rect width={T} height={T} fill="#f2f2ef"/>
          {/* Outer square frame */}
          <rect x={T * 0.03} y={T * 0.03} width={T * 0.94} height={T * 0.94}
            fill="none" stroke={DARK} strokeWidth={sw * 0.6}/>
          <rect x={T * 0.06} y={T * 0.06} width={T * 0.88} height={T * 0.88}
            fill="none" stroke={DARK} strokeWidth={sw * 0.3} opacity="0.4"/>
          {/* Concentric rings */}
          {rings.map((r, i) => (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill={i === 0 ? "#e8e8e5" : i % 2 === 0 ? "#ebebea" : "#f2f2ef"}
              stroke={DARK} strokeWidth={i === 0 ? sw : sw * 0.65}
              opacity={i === 0 ? 1 : 0.8}/>
          ))}
          {/* Radial spokes */}
          {Array.from({ length: spokes }).map((_, i) => {
            const ang = ((i * 360) / spokes) * (Math.PI / 180);
            const x1 = (cx + rings[4] * Math.cos(ang)).toFixed(2);
            const y1 = (cy + rings[4] * Math.sin(ang)).toFixed(2);
            const x2 = (cx + rings[1] * Math.cos(ang)).toFixed(2);
            const y2 = (cy + rings[1] * Math.sin(ang)).toFixed(2);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={DARK} strokeWidth={sw * 0.55} opacity="0.6"/>
            );
          })}
          {/* Center filled circle */}
          <circle cx={cx} cy={cy} r={rings[5]} fill={DARK} opacity="0.25"/>
          <circle cx={cx} cy={cy} r={T * 0.025} fill={DARK} opacity="0.5"/>
          {/* Corner mini-oculi (partial, tessellation blending) */}
          {[[0, 0], [T, 0], [0, T], [T, T]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={T * 0.12}
              fill="none" stroke={DARK} strokeWidth={sw * 0.5} opacity="0.35"/>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// W6 — COSMATESQUE
// Mosaico geométrico romano-cristão: círculos grandes com satélites pequenos
// dispostos em arranjo hexagonal — visto nos pavimentos das basílicas de Roma.
// Cria a ilusão de profundidade e movimento pelo contraste de escala.
// ═══════════════════════════════════════════════════════════════════════════
function PadCosmatesque() {
  const R = 18;  // raio do círculo grande
  const r = 5;   // raio dos satélites
  const gap = 3; // gap entre círculos
  const TW = (R + gap) * 2;
  const TH = (R + gap) * 2;
  const id = "w6-cos";
  const cx = TW / 2;
  const cy = TH / 2;
  const sw = 0.9;

  // Inner concentric rings for the large circle
  const innerRings = [R * 0.75, R * 0.55, R * 0.35, R * 0.18];
  // 8 satellite positions at 45° intervals at distance R+r+gap from center
  const satDist = R + r + gap * 0.8;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#efefec"/>
          {/* Main large circle */}
          <circle cx={cx} cy={cy} r={R}
            fill="#e5e5e2" stroke={DARK} strokeWidth={sw}/>
          {/* Inner concentric rings */}
          {innerRings.map((ir, i) => (
            <circle key={i} cx={cx} cy={cy} r={ir}
              fill="none" stroke={DARK}
              strokeWidth={i === 0 ? sw * 0.8 : sw * 0.5}
              opacity={i === 0 ? 0.8 : 0.55}/>
          ))}
          {/* Fine diagonal cross through center */}
          {[0, 45, 90, 135].map(deg => {
            const a = (deg * Math.PI) / 180;
            return (
              <line key={deg}
                x1={(cx + innerRings[2] * Math.cos(a)).toFixed(2)}
                y1={(cy + innerRings[2] * Math.sin(a)).toFixed(2)}
                x2={(cx - innerRings[2] * Math.cos(a)).toFixed(2)}
                y2={(cy - innerRings[2] * Math.sin(a)).toFixed(2)}
                stroke={DARK} strokeWidth={sw * 0.45} opacity="0.5"/>
            );
          })}
          {/* Center accent */}
          <circle cx={cx} cy={cy} r={r * 0.5} fill={DARK} opacity="0.3"/>
          {/* 4 satellite small circles at cardinal directions (edge of tile) */}
          {[0, 90, 180, 270].map(deg => {
            const a = (deg * Math.PI) / 180;
            const sx = cx + satDist * Math.cos(a);
            const sy = cy + satDist * Math.sin(a);
            return (
              <g key={deg}>
                <circle cx={sx.toFixed(2)} cy={sy.toFixed(2)} r={r}
                  fill="#dcdcda" stroke={DARK} strokeWidth={sw * 0.7}/>
                <circle cx={sx.toFixed(2)} cy={sy.toFixed(2)} r={r * 0.55}
                  fill="none" stroke={DARK} strokeWidth={sw * 0.4} opacity="0.6"/>
                <circle cx={sx.toFixed(2)} cy={sy.toFixed(2)} r={r * 0.2}
                  fill={DARK} opacity="0.3"/>
              </g>
            );
          })}
          {/* 4 corner diamond fills */}
          {[[0, 0], [TW, 0], [0, TH], [TW, TH]].map(([x, y]) => (
            <circle key={`c${x}${y}`} cx={x} cy={y} r={r * 0.9}
              fill="#d8d8d6" stroke={DARK} strokeWidth={sw * 0.55} opacity="0.75"/>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Caixas de identificação compactas
// ─────────────────────────────────────────────────────────────────────────────
function CaixaId({ titulo, lado }: { titulo: string; lado: "esq" | "dir" }) {
  const rows = lado === "esq"
    ? [["Nome", "Maria Fernanda Souza Almeida"], ["CPF", "123.456.789-00"], ["CRM", "SP 125.475"]]
    : [["Emitente", "Dr. Caio H. F. Pádua"], ["Especialidade", "Medicina Integrativa"], ["CRM/RQE", "SP 125.475 · RQE 56789"]];
  return (
    <div style={{ flex: 1, border: "0.7px solid #777", padding: "5px 8px", background: CREAM }}>
      <div style={{
        fontSize: 5.5, fontWeight: 800, letterSpacing: 2.8, color: "#555",
        textTransform: "uppercase", textAlign: "center",
        borderBottom: "0.4px solid #ccc", paddingBottom: 2, marginBottom: 4,
      }}>
        {titulo}
      </div>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display: "flex", alignItems: "baseline", marginBottom: 2, fontSize: 7 }}>
          <span style={{ color: "#777", fontSize: 5.5, flexShrink: 0, width: 65 }}>{l}</span>
          <span style={{ flex: 1, color: INK, fontWeight: 600 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// Faixa de amostra limpa do padrão (SEM boxes cobrindo)
function Amostra({ padrao }: { padrao: React.ReactNode }) {
  return (
    <div style={{
      height: 56, border: "1px solid #555", overflow: "hidden",
      marginBottom: 6, position: "relative",
    }}>
      <div style={{ position: "absolute", inset: 0 }}>{padrao}</div>
      <div style={{
        position: "absolute", top: 2, left: 6,
        fontSize: 5, letterSpacing: 1.5, color: "rgba(0,0,0,0.35)", textTransform: "uppercase",
      }}>
        amostra completa do padrão
      </div>
    </div>
  );
}

// 1 faixa com margens laterais
function Faixa1({ padrao }: { padrao: React.ReactNode }) {
  return (
    <>
      <Amostra padrao={padrao} />
      <div style={{ position: "relative" }}>
        <div style={{
          position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: OVERFLOW,
          overflow: "hidden", borderTop: "1px solid #444", borderBottom: "1px solid #444", zIndex: 0,
        }}>
          {padrao}
        </div>
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, padding: `0 ${SIDE_PAD}px` }}>
          <CaixaId titulo="Paciente" lado="esq" />
          <CaixaId titulo="Emitente" lado="dir" />
        </div>
      </div>
    </>
  );
}

// 2 faixas paralelas com margens laterais
function Faixa2({ padrao }: { padrao: React.ReactNode }) {
  return (
    <>
      <Amostra padrao={padrao} />
      <div style={{ position: "relative" }}>
        <div style={{
          position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: "53%",
          overflow: "hidden", borderTop: "1px solid #444", borderBottom: "0.5px solid #888", zIndex: 0,
        }}>
          {padrao}
        </div>
        <div style={{
          position: "absolute", top: "calc(50% - 1px)", left: 0, right: 0,
          height: 2, background: "#aaa", zIndex: 1,
        }} />
        <div style={{
          position: "absolute", top: "47%", left: 0, right: 0, bottom: OVERFLOW,
          overflow: "hidden", borderTop: "0.5px solid #888", borderBottom: "1px solid #444", zIndex: 0,
        }}>
          {padrao}
        </div>
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, padding: `0 ${SIDE_PAD}px` }}>
          <CaixaId titulo="Paciente" lado="esq" />
          <CaixaId titulo="Emitente" lado="dir" />
        </div>
      </div>
    </>
  );
}

// Bloco de variante com rótulo
function Variante({ codigo, nome, subtitulo, faixa }: {
  codigo: string; nome: string; subtitulo: string; faixa: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24, background: "#fff", padding: "14px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 7, fontWeight: 900, letterSpacing: 2, color: "#fff",
          background: DARK, padding: "2px 8px", textTransform: "uppercase",
        }}>{codigo}</span>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: DARK, textTransform: "uppercase" }}>
          {nome}
        </span>
        <span style={{ fontSize: 6.5, color: "#888" }}>{subtitulo}</span>
      </div>
      {faixa}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ArabescoOcidental() {
  return (
    <div className="min-h-screen bg-stone-300 flex items-start justify-center p-6 py-8">
      <div style={{
        width: 680,
        background: "#e5e5e2",
        border: "1px solid #888",
        boxShadow: "0 6px 28px rgba(0,0,0,0.20)",
      }}>
        <div style={{ background: "#111", color: "#fff", padding: "10px 20px", fontSize: 7.5, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Faixas Ocidentais &amp; Arquitetônicas — 6 Variantes · Escala de Cinza
        </div>
        <div style={{ background: "#333", color: "#ccc", padding: "4px 20px", fontSize: 6, letterSpacing: 1.5 }}>
          W1 Guilloché · W2 Gótico · W3 Meandro Duplex · W4 Art Déco · W5 Óculo Romano · W6 Cosmatesque
        </div>
        <div style={{ padding: "14px 0" }}>
          <Variante codigo="W1" nome="Guilloché Óptico" subtitulo="Padrão de segurança de papel-moeda · 8 ondas sobrepostas em frequências diferentes · efeito moiré"
            faixa={<Faixa1 padrao={<PadGuilloche />} />} />
          <Variante codigo="W2" nome="Traceria Gótica" subtitulo="Arcos apontados com trefoil interior · ritmo de catedral · estilo séc. XIII Europa"
            faixa={<Faixa2 padrao={<PadGothic />} />} />
          <Variante codigo="W3" nome="Meandro Duplex" subtitulo="Dois fluxos de meandro grego fluindo em sentidos opostos · labirinto geométrico clássico"
            faixa={<Faixa1 padrao={<PadMeandro />} />} />
          <Variante codigo="W4" nome="Art Déco Chevron" subtitulo="Cascata de 8 chevrons aninhados · ornamento do Chrysler Building · precisão dos anos 1920–1930"
            faixa={<Faixa2 padrao={<PadDeco />} />} />
          <Variante codigo="W5" nome="Óculo Romano" subtitulo="Série de oculi com anéis concêntricos e 12 raios · pavimento do Panteão de Roma"
            faixa={<Faixa1 padrao={<PadOculo />} />} />
          <Variante codigo="W6" nome="Cosmatesque" subtitulo="Mosaico romano-cristão · círculos grandes com satélites · pavimentos das basílicas de Roma séc. XII"
            faixa={<Faixa2 padrao={<PadCosmatesque />} />} />
        </div>
      </div>
    </div>
  );
}
