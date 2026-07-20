// ─────────────────────────────────────────────────────────────────────────────
// ARABESCO LUXO — 6 variantes que remetem a luxo e documentos de alto valor
// Inspiração: caligrafia ornamental, acanto barroco, palmeta otomana,
//             filete entalhado, candelabra renascentista, volutas entrelaçadas
// ─────────────────────────────────────────────────────────────────────────────

const INK   = "#111";
const DARK  = "#1a1a1a";
const CREAM = "#f9f9f7";
const OVERFLOW = 28;
const SIDE_PAD = 44;

// ═══════════════════════════════════════════════════════════════════════════
// L1 — VOLUTA CALIGRÁFICA
// Dois filetes em S cruzando-se no centro formando um símbolo de infinito —
// idêntico aos ornamentos separadores de documentos de prestígio (ref. print 1).
// Traço grosso com highlight branco simula caligrafia com pena.
// ═══════════════════════════════════════════════════════════════════════════
function PadVoluta() {
  const TW = 120, TH = 46;
  const id = "lx1";
  const cy = TH / 2;

  // Two crossing S-curves
  const c1 = `M0,${cy + 5} C22,${cy - 17} 48,${cy - 17} ${TW / 2},${cy} C${TW - 48},${cy + 17} ${TW - 22},${cy + 17} ${TW},${cy - 5}`;
  const c2 = `M0,${cy - 5} C22,${cy + 17} 48,${cy + 17} ${TW / 2},${cy} C${TW - 48},${cy - 17} ${TW - 22},${cy - 17} ${TW},${cy + 5}`;

  // Small volute loop at the left end of c1 (inward curl)
  const vol1 = `M0,${cy + 5} C-4,${cy - 5} 4,${cy - 12} 10,${cy - 4} C14,${cy + 2} 8,${cy + 8} 4,${cy + 4}`;
  const vol2 = `M${TW},${cy + 5} C${TW + 4},${cy - 5} ${TW - 4},${cy - 12} ${TW - 10},${cy - 4} C${TW - 14},${cy + 2} ${TW - 8},${cy + 8} ${TW - 4},${cy + 4}`;

  const sw = 4.5;
  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f6f6f4"/>
          {/* Drop shadow */}
          <path d={c1} fill="none" stroke="#888" strokeWidth={sw + 2.5} strokeLinecap="round" opacity="0.15"/>
          <path d={c2} fill="none" stroke="#888" strokeWidth={sw + 2.5} strokeLinecap="round" opacity="0.15"/>
          {/* Main strokes */}
          <path d={c1} fill="none" stroke={DARK} strokeWidth={sw} strokeLinecap="round"/>
          <path d={c2} fill="none" stroke={DARK} strokeWidth={sw} strokeLinecap="round"/>
          {/* White highlight — simulates convex surface of a carved line */}
          <path d={c1} fill="none" stroke="white" strokeWidth={1.4} strokeLinecap="round" opacity="0.55"/>
          <path d={c2} fill="none" stroke="white" strokeWidth={1.4} strokeLinecap="round" opacity="0.55"/>
          {/* Thin engraving detail lines flanking main strokes */}
          <path d={c1} fill="none" stroke={DARK} strokeWidth={0.5} strokeLinecap="round" opacity="0.25"
            strokeDasharray="0"/>
          <path d={c2} fill="none" stroke={DARK} strokeWidth={0.5} strokeLinecap="round" opacity="0.25"/>
          {/* Center crossing ornament */}
          <circle cx={TW / 2} cy={cy} r={3.5} fill="#f6f6f4"/>
          <circle cx={TW / 2} cy={cy} r={3.5} fill="none" stroke={DARK} strokeWidth={0.8}/>
          <circle cx={TW / 2} cy={cy} r={1.4} fill={DARK} opacity="0.45"/>
          {/* Small diamond at quarter points */}
          <polygon points={`${TW * 0.25},${cy} ${TW * 0.25 + 2.5},${cy - 2} ${TW * 0.25},${cy - 4} ${TW * 0.25 - 2.5},${cy - 2}`}
            fill={DARK} opacity="0.2"/>
          <polygon points={`${TW * 0.75},${cy} ${TW * 0.75 + 2.5},${cy + 2} ${TW * 0.75},${cy + 4} ${TW * 0.75 - 2.5},${cy + 2}`}
            fill={DARK} opacity="0.2"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// L2 — ROLO DE ACANTO BARROCO
// Folha de acanto em S grande fluindo como a frisa da print 2.
// Caule principal + braço esquerdo com voluta + folha direita aberta.
// Highlight triplo simula o relevo tridimensional do estuque.
// ═══════════════════════════════════════════════════════════════════════════
function PadAcanto() {
  const TW = 96, TH = 56;
  const id = "lx2";

  // Main stem S-curve (large, baroque)
  const stem = `M0,48 C8,20 28,8 48,28 C68,48 88,36 96,10`;
  // Left curl (volute) wrapping from stem base
  const curlL = `M0,48 C-4,38 2,28 10,32 C16,35 14,44 8,42 C4,40 6,36 10,38`;
  // Right leaf opening upward
  const leafR = `M96,10 C100,2 106,4 104,12 C102,18 94,18 96,10`;
  // Mid branch leaf curling to the right from the S midpoint
  const branchMid = `M48,28 C52,14 62,12 64,22 C66,30 58,34 54,28`;
  // Small secondary volute lower
  const curlMid = `M30,40 C26,30 34,24 38,30 C40,34 36,38 32,36`;

  const sw = 4.0;
  const thinSw = 1.2;
  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f5f5f2"/>
          {/* Shadow layer */}
          {[stem, curlL, branchMid, curlMid, leafR].map((d, i) => (
            <path key={`sh${i}`} d={d} fill="none" stroke="#888" strokeWidth={sw + 3}
              strokeLinecap="round" strokeLinejoin="round" opacity="0.12"/>
          ))}
          {/* Mid-tone layer (body) */}
          {[stem, curlL, branchMid, curlMid, leafR].map((d, i) => (
            <path key={`md${i}`} d={d} fill="none" stroke="#444" strokeWidth={sw + 1}
              strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
          ))}
          {/* Main dark layer */}
          {[stem, curlL, branchMid, curlMid, leafR].map((d, i) => (
            <path key={`dk${i}`} d={d} fill="none" stroke={DARK} strokeWidth={sw}
              strokeLinecap="round" strokeLinejoin="round"/>
          ))}
          {/* Specular highlight — white ridge on convex surface */}
          {[stem, curlL, branchMid].map((d, i) => (
            <path key={`hl${i}`} d={d} fill="none" stroke="white" strokeWidth={1.6}
              strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
          ))}
          {/* Fine detail engraving lines */}
          {[stem, curlL].map((d, i) => (
            <path key={`en${i}`} d={d} fill="none" stroke={DARK} strokeWidth={0.45}
              strokeLinecap="round" strokeLinejoin="round" opacity="0.22"/>
          ))}
          {/* Leaf vein on mid branch */}
          <path d={`M48,28 C52,20 58,18 60,22`}
            fill="none" stroke={DARK} strokeWidth={0.4} opacity="0.3"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// L3 — PALMETA OTOMANA
// Leque floral em forma de palmeta com volutas laterais — exatamente o
// padrão da borda dourada da print 3, em versão monocromática.
// Tile simétrico: palmeta central + 2 volutas + 2 folhas laterais.
// ═══════════════════════════════════════════════════════════════════════════
function PadPalmeta() {
  const TW = 64, TH = 52;
  const cx = TW / 2;
  const id = "lx3";

  // Palmette fan: 5 petals radiating from base point
  function petal(angle: number, len: number, w: number): string {
    const a = (angle * Math.PI) / 180;
    const tipX = cx + Math.cos(a) * len;
    const tipY = 34 - Math.sin(a) * len;
    const ctrlA = cx + Math.cos(a - 0.3) * len * 0.6;
    const ctrlAY = 34 - Math.sin(a - 0.3) * len * 0.6;
    const ctrlB = cx + Math.cos(a + 0.3) * len * 0.6;
    const ctrlBY = 34 - Math.sin(a + 0.3) * len * 0.6;
    return `M${cx},34 C${ctrlA},${ctrlAY} ${tipX - 0.5},${tipY} ${tipX},${tipY} C${tipX + 0.5},${tipY} ${ctrlB},${ctrlBY} ${cx},34`;
  }

  const petals = [90, 72, 108, 54, 126].map((a, i) => petal(a, 16 - i * 0.5, 3));

  // Connecting scrolls: left arm going from (0, 40) to base, right mirrored
  const scrollL = `M0,42 C8,42 14,38 18,34 C22,30 20,22 14,22 C10,22 8,28 12,30 C14,31 16,28 13,27`;
  const scrollR = `M${TW},42 C${TW - 8},42 ${TW - 14},38 ${TW - 18},34 C${TW - 22},30 ${TW - 20},22 ${TW - 14},22 C${TW - 10},22 ${TW - 8},28 ${TW - 12},30 C${TW - 14},31 ${TW - 16},28 ${TW - 13},27`;

  // Stem (thin, going from base to bottom of tile)
  const stem = `M${cx},34 L${cx},46`;
  // Small berry/jewel at base of stem
  const berryY = 46;

  const sw = 3.0;
  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f5f5f2"/>
          {/* Petals — shadow, body, highlight */}
          {petals.map((d, i) => <path key={`ps${i}`} d={d} fill="#bbb" stroke="none" opacity="0.3"/>)}
          {petals.map((d, i) => <path key={`pb${i}`} d={d} fill="#ddd" stroke={DARK} strokeWidth={0.7}/>)}
          {petals.map((d, i) => (
            <path key={`ph${i}`} d={d} fill="none" stroke="white" strokeWidth={0.8} opacity="0.5"/>
          ))}
          {/* Scrolls */}
          <path d={scrollL} fill="none" stroke="#666" strokeWidth={sw + 1} strokeLinecap="round" opacity="0.3"/>
          <path d={scrollR} fill="none" stroke="#666" strokeWidth={sw + 1} strokeLinecap="round" opacity="0.3"/>
          <path d={scrollL} fill="none" stroke={DARK} strokeWidth={sw} strokeLinecap="round"/>
          <path d={scrollR} fill="none" stroke={DARK} strokeWidth={sw} strokeLinecap="round"/>
          <path d={scrollL} fill="none" stroke="white" strokeWidth={1.0} strokeLinecap="round" opacity="0.5"/>
          <path d={scrollR} fill="none" stroke="white" strokeWidth={1.0} strokeLinecap="round" opacity="0.5"/>
          {/* Stem */}
          <line x1={cx} y1="34" x2={cx} y2={berryY} stroke={DARK} strokeWidth={1.2}/>
          {/* Berry/jewel at base */}
          <circle cx={cx} cy={berryY} r={3.5} fill="#ccc" stroke={DARK} strokeWidth={0.8}/>
          <circle cx={cx} cy={berryY} r={1.5} fill={DARK} opacity="0.3"/>
          {/* Fine arch border lines top and bottom */}
          <line x1="0" y1="2" x2={TW} y2="2" stroke={DARK} strokeWidth="0.5" opacity="0.35"/>
          <line x1="0" y1={TH - 2} x2={TW} y2={TH - 2} stroke={DARK} strokeWidth="0.5" opacity="0.35"/>
          {/* Thin wavy connector line between palmettes */}
          <path d={`M0,42 C${TW * 0.15},44 ${TW * 0.35},44 ${TW * 0.5},42`}
            fill="none" stroke={DARK} strokeWidth={0.4} opacity="0.3"/>
          <path d={`M${TW * 0.5},42 C${TW * 0.65},40 ${TW * 0.85},40 ${TW},42`}
            fill="none" stroke={DARK} strokeWidth={0.4} opacity="0.3"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// L4 — FILETE ENTALHADO
// Borda de documento clássico — o mesmo tipo que envolve o receituário da
// print 1. Três linhas paralelas com unidade ornamental repetida no centro.
// Muito usado em diplomas, contratos, receituários de prestígio.
// ═══════════════════════════════════════════════════════════════════════════
function PadFilete() {
  const TW = 48, TH = 44;
  const id = "lx4";
  const cx = TW / 2, cy = TH / 2;

  // The repeating unit: a shield/escudo shape flanked by S-scrolls
  // Central lozenge (diamond with curved sides)
  const lozenge = `M${cx},${cy - 12} C${cx + 9},${cy - 6} ${cx + 9},${cy + 6} ${cx},${cy + 12} C${cx - 9},${cy + 6} ${cx - 9},${cy - 6} ${cx},${cy - 12}Z`;
  // Inner smaller lozenge
  const innerLoz = `M${cx},${cy - 7} C${cx + 5},${cy - 3.5} ${cx + 5},${cy + 3.5} ${cx},${cy + 7} C${cx - 5},${cy + 3.5} ${cx - 5},${cy - 3.5} ${cx},${cy - 7}Z`;
  // Left scroll
  const scrollLeft = `M${cx - 9},${cy} C${cx - 14},${cy - 6} ${cx - 20},${cy - 4} ${cx - 22},${cy} C${cx - 24},${cy + 4} ${cx - 20},${cy + 7} ${cx - 16},${cy + 5} C${cx - 12},${cy + 3} ${cx - 14},${cy - 2} ${cx - 18},${cy - 1}`;
  const scrollRight = `M${cx + 9},${cy} C${cx + 14},${cy - 6} ${cx + 20},${cy - 4} ${cx + 22},${cy} C${cx + 24},${cy + 4} ${cx + 20},${cy + 7} ${cx + 16},${cy + 5} C${cx + 12},${cy + 3} ${cx + 14},${cy - 2} ${cx + 18},${cy - 1}`;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f5f5f2"/>
          {/* Three parallel border lines */}
          <line x1="0" y1="3" x2={TW} y2="3" stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1="6" x2={TW} y2="6" stroke={DARK} strokeWidth="0.4"/>
          <line x1="0" y1={TH - 3} x2={TW} y2={TH - 3} stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1={TH - 6} x2={TW} y2={TH - 6} stroke={DARK} strokeWidth="0.4"/>
          {/* Central zone faint fill */}
          <rect x="0" y="7" width={TW} height={TH - 14} fill="#eeeeeb" opacity="0.5"/>
          {/* Scrolls */}
          <path d={scrollLeft} fill="none" stroke="#888" strokeWidth={2.5} strokeLinecap="round" opacity="0.3"/>
          <path d={scrollLeft} fill="none" stroke={DARK} strokeWidth={2.0} strokeLinecap="round"/>
          <path d={scrollLeft} fill="none" stroke="white" strokeWidth={0.7} strokeLinecap="round" opacity="0.5"/>
          <path d={scrollRight} fill="none" stroke="#888" strokeWidth={2.5} strokeLinecap="round" opacity="0.3"/>
          <path d={scrollRight} fill="none" stroke={DARK} strokeWidth={2.0} strokeLinecap="round"/>
          <path d={scrollRight} fill="none" stroke="white" strokeWidth={0.7} strokeLinecap="round" opacity="0.5"/>
          {/* Central lozenge */}
          <path d={lozenge} fill="#e2e2df" stroke={DARK} strokeWidth={0.9}/>
          <path d={innerLoz} fill="#ebebea" stroke={DARK} strokeWidth={0.5} opacity="0.8"/>
          {/* Center dot */}
          <circle cx={cx} cy={cy} r={2} fill={DARK} opacity="0.3"/>
          <circle cx={cx} cy={cy} r={0.8} fill={DARK} opacity="0.6"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// L5 — CANDELABRA RENASCENTISTA
// O ornamento de candelabro (grotesca renascentista) que Raphael pintou nas
// Loggie do Vaticano. Eixo vertical simétrico com folhagem em ramos.
// Repete por rotação: lido de lado forma a faixa horizontal.
// ═══════════════════════════════════════════════════════════════════════════
function PadCandelabra() {
  const TW = 52, TH = 56;
  const id = "lx5";
  const cx = TW / 2;

  // Vertical stem (central axis)
  const stem = `M${cx},2 L${cx},${TH - 2}`;
  // Urn/vase at center
  const urnY = TH / 2;
  const urn = `M${cx - 7},${urnY + 8} C${cx - 10},${urnY + 4} ${cx - 8},${urnY - 4} ${cx - 4},${urnY - 8} L${cx},${urnY - 10} L${cx + 4},${urnY - 8} C${cx + 8},${urnY - 4} ${cx + 10},${urnY + 4} ${cx + 7},${urnY + 8} C${cx + 4},${urnY + 12} ${cx - 4},${urnY + 12} ${cx - 7},${urnY + 8}Z`;
  // Upper branch pair (symmetric)
  const brU1 = `M${cx},${urnY - 10} C${cx - 4},${urnY - 18} ${cx - 12},${urnY - 18} ${cx - 16},${urnY - 12} C${cx - 18},${urnY - 8} ${cx - 14},${urnY - 4} ${cx - 12},${urnY - 8}`;
  const brU2 = `M${cx},${urnY - 10} C${cx + 4},${urnY - 18} ${cx + 12},${urnY - 18} ${cx + 16},${urnY - 12} C${cx + 18},${urnY - 8} ${cx + 14},${urnY - 4} ${cx + 12},${urnY - 8}`;
  // Upper small leaf tips
  const leafU1 = `M${cx - 16},${urnY - 12} C${cx - 20},${urnY - 18} ${cx - 18},${urnY - 24} ${cx - 13},${urnY - 22} C${cx - 10},${urnY - 20} ${cx - 12},${urnY - 14} ${cx - 16},${urnY - 12}`;
  const leafU2 = `M${cx + 16},${urnY - 12} C${cx + 20},${urnY - 18} ${cx + 18},${urnY - 24} ${cx + 13},${urnY - 22} C${cx + 10},${urnY - 20} ${cx + 12},${urnY - 14} ${cx + 16},${urnY - 12}`;
  // Lower branch pair (below urn)
  const brD1 = `M${cx},${urnY + 8} C${cx - 4},${urnY + 16} ${cx - 12},${urnY + 16} ${cx - 14},${urnY + 10} C${cx - 16},${urnY + 6} ${cx - 12},${urnY + 2} ${cx - 10},${urnY + 6}`;
  const brD2 = `M${cx},${urnY + 8} C${cx + 4},${urnY + 16} ${cx + 12},${urnY + 16} ${cx + 14},${urnY + 10} C${cx + 16},${urnY + 6} ${cx + 12},${urnY + 2} ${cx + 10},${urnY + 6}`;

  const sw = 2.5;
  const paths = [brU1, brU2, brD1, brD2, leafU1, leafU2];
  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f4f4f1"/>
          {/* Shadow */}
          {paths.map((d, i) => <path key={`sh${i}`} d={d} fill="none" stroke="#aaa" strokeWidth={sw + 2} strokeLinecap="round" opacity="0.2"/>)}
          <line x1={cx} y1="2" x2={cx} y2={TH - 2} stroke="#bbb" strokeWidth={2} opacity="0.4"/>
          {/* Body */}
          {paths.map((d, i) => <path key={`bdy${i}`} d={d} fill="none" stroke={DARK} strokeWidth={sw} strokeLinecap="round"/>)}
          <line x1={cx} y1="2" x2={cx} y2={TH - 2} stroke={DARK} strokeWidth={1.2}/>
          {/* Highlight */}
          {paths.map((d, i) => <path key={`hl${i}`} d={d} fill="none" stroke="white" strokeWidth={0.9} strokeLinecap="round" opacity="0.45"/>)}
          {/* Urn */}
          <path d={urn} fill="#d8d8d5" stroke={DARK} strokeWidth={0.8}/>
          <path d={urn} fill="none" stroke="white" strokeWidth={0.8} opacity="0.4"/>
          {/* Top and bottom finials */}
          <circle cx={cx} cy={5} r={3} fill="#ccc" stroke={DARK} strokeWidth={0.7}/>
          <circle cx={cx} cy={5} r={1.2} fill={DARK} opacity="0.35"/>
          <circle cx={cx} cy={TH - 5} r={3} fill="#ccc" stroke={DARK} strokeWidth={0.7}/>
          <circle cx={cx} cy={TH - 5} r={1.2} fill={DARK} opacity="0.35"/>
          {/* Leaf vein details */}
          <path d={`M${cx - 16},${urnY - 12} C${cx - 14},${urnY - 17} ${cx - 13},${urnY - 22}`}
            fill="none" stroke={DARK} strokeWidth={0.35} opacity="0.3"/>
          <path d={`M${cx + 16},${urnY - 12} C${cx + 14},${urnY - 17} ${cx + 13},${urnY - 22}`}
            fill="none" stroke={DARK} strokeWidth={0.35} opacity="0.3"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// L6 — ENTRELAC DE LUXO (FITA TRIPLA)
// Três fitas largas tecidas em sobre-e-sob — a forma mais sofisticada do
// entrelaçamento, usada em encadernações florentinas e capas de livros de luxo.
// O corte nas interseções cria a ilusão óptica de profundidade e tridimensionalidade.
// ═══════════════════════════════════════════════════════════════════════════
function PadEntrelacLuxo() {
  const TW = 80, TH = 48;
  const id = "lx6";
  const cy = TH / 2;
  const amp = TH * 0.38;
  const freq = (2 * Math.PI) / TW;

  function sinePoints(yOffset: number, phase: number, n = 64): string {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * TW;
      const y = cy + yOffset + Math.sin(x * freq + phase) * amp;
      d += i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return d;
  }

  // Three ribbon paths at different phases (0°, 120°, 240°)
  const r1 = sinePoints(0, 0);
  const r2 = sinePoints(0, (2 * Math.PI) / 3);
  const r3 = sinePoints(0, (4 * Math.PI) / 3);

  const bw = 5.0; // ribbon body width
  const hw = 1.4; // highlight width

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill="#f4f4f1"/>
          {/* Render 3 ribbons, each with shadow → dark body → mid → highlight */}
          {/* Ribbon 1 */}
          <path d={r1} fill="none" stroke="#999" strokeWidth={bw + 3} strokeLinecap="round" opacity="0.2"/>
          <path d={r1} fill="none" stroke="#555" strokeWidth={bw + 1} strokeLinecap="round" opacity="0.5"/>
          <path d={r1} fill="none" stroke={DARK} strokeWidth={bw} strokeLinecap="round"/>
          <path d={r1} fill="none" stroke="#888" strokeWidth={bw * 0.5} strokeLinecap="round" opacity="0.6"/>
          <path d={r1} fill="none" stroke="white" strokeWidth={hw} strokeLinecap="round" opacity="0.6"/>
          {/* Ribbon 2 */}
          <path d={r2} fill="none" stroke="#999" strokeWidth={bw + 3} strokeLinecap="round" opacity="0.2"/>
          <path d={r2} fill="none" stroke="#555" strokeWidth={bw + 1} strokeLinecap="round" opacity="0.5"/>
          <path d={r2} fill="none" stroke={DARK} strokeWidth={bw} strokeLinecap="round"/>
          <path d={r2} fill="none" stroke="#888" strokeWidth={bw * 0.5} strokeLinecap="round" opacity="0.6"/>
          <path d={r2} fill="none" stroke="white" strokeWidth={hw} strokeLinecap="round" opacity="0.6"/>
          {/* Ribbon 3 */}
          <path d={r3} fill="none" stroke="#999" strokeWidth={bw + 3} strokeLinecap="round" opacity="0.2"/>
          <path d={r3} fill="none" stroke="#555" strokeWidth={bw + 1} strokeLinecap="round" opacity="0.5"/>
          <path d={r3} fill="none" stroke={DARK} strokeWidth={bw} strokeLinecap="round"/>
          <path d={r3} fill="none" stroke="#888" strokeWidth={bw * 0.5} strokeLinecap="round" opacity="0.6"/>
          <path d={r3} fill="none" stroke="white" strokeWidth={hw} strokeLinecap="round" opacity="0.6"/>
          {/* Over-under crossing effect: at crossing X positions, "clip" the under-ribbon */}
          {/* We approximate this by painting small cover patches at crossing points */}
          {[TW * 0.166, TW * 0.5, TW * 0.833].map(x => {
            const y1 = cy + Math.sin(x * freq) * amp;
            const y2 = cy + Math.sin(x * freq + (2 * Math.PI) / 3) * amp;
            return (
              <rect key={x} x={x - 3} y={Math.min(y1, y2) - 1} width={6} height={Math.abs(y1 - y2) + 2}
                fill="#f4f4f1" opacity="0.6"/>
            );
          })}
          {/* Border lines top and bottom */}
          <line x1="0" y1="1" x2={TW} y2="1" stroke={DARK} strokeWidth="0.7" opacity="0.4"/>
          <line x1="0" y1={TH - 1} x2={TW} y2={TH - 1} stroke={DARK} strokeWidth="0.7" opacity="0.4"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout components (identical to ArabescoOcidental)
// ─────────────────────────────────────────────────────────────────────────────
function CaixaId({ titulo, lado }: { titulo: string; lado: "esq" | "dir" }) {
  const rows = lado === "esq"
    ? [["Nome", "Maria Fernanda Souza Almeida"], ["CPF", "123.456.789-00"], ["CRM", "SP 125.475"]]
    : [["Emitente", "Dr. Caio H. F. Pádua"], ["Especialidade", "Medicina Integrativa"], ["CRM/RQE", "SP 125.475 · RQE 56789"]];
  return (
    <div style={{ flex: 1, border: "0.7px solid #777", padding: "5px 8px", background: CREAM }}>
      <div style={{ fontSize: 5.5, fontWeight: 800, letterSpacing: 2.8, color: "#555", textTransform: "uppercase", textAlign: "center", borderBottom: "0.4px solid #ccc", paddingBottom: 2, marginBottom: 4 }}>
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

function Amostra({ padrao }: { padrao: React.ReactNode }) {
  return (
    <div style={{ height: 56, border: "1px solid #555", overflow: "hidden", marginBottom: 6, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0 }}>{padrao}</div>
      <div style={{ position: "absolute", top: 2, left: 6, fontSize: 5, letterSpacing: 1.5, color: "rgba(0,0,0,0.3)", textTransform: "uppercase" }}>
        amostra completa
      </div>
    </div>
  );
}

function Faixa1({ padrao }: { padrao: React.ReactNode }) {
  return (
    <>
      <Amostra padrao={padrao} />
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: OVERFLOW, overflow: "hidden", borderTop: "1px solid #444", borderBottom: "1px solid #444", zIndex: 0 }}>
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

function Faixa2({ padrao }: { padrao: React.ReactNode }) {
  return (
    <>
      <Amostra padrao={padrao} />
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: "53%", overflow: "hidden", borderTop: "1px solid #444", borderBottom: "0.5px solid #888", zIndex: 0 }}>
          {padrao}
        </div>
        <div style={{ position: "absolute", top: "calc(50% - 1px)", left: 0, right: 0, height: 2, background: "#aaa", zIndex: 1 }} />
        <div style={{ position: "absolute", top: "47%", left: 0, right: 0, bottom: OVERFLOW, overflow: "hidden", borderTop: "0.5px solid #888", borderBottom: "1px solid #444", zIndex: 0 }}>
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

function Variante({ codigo, nome, subtitulo, faixa }: { codigo: string; nome: string; subtitulo: string; faixa: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, background: "#fff", padding: "14px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 2, color: "#fff", background: DARK, padding: "2px 8px", textTransform: "uppercase" }}>{codigo}</span>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: DARK, textTransform: "uppercase" }}>{nome}</span>
        <span style={{ fontSize: 6.5, color: "#888" }}>{subtitulo}</span>
      </div>
      {faixa}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ArabescoLuxo() {
  return (
    <div className="min-h-screen bg-stone-300 flex items-start justify-center p-6 py-8">
      <div style={{ width: 680, background: "#e5e5e2", border: "1px solid #888", boxShadow: "0 6px 28px rgba(0,0,0,0.22)" }}>
        <div style={{ background: "#111", color: "#fff", padding: "10px 20px", fontSize: 7.5, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Faixas de Luxo — 6 Variantes · Estilo Documento de Prestígio
        </div>
        <div style={{ background: "#333", color: "#ccc", padding: "4px 20px", fontSize: 6, letterSpacing: 1.5 }}>
          L1 Voluta Caligráfica · L2 Acanto Barroco · L3 Palmeta Otomana · L4 Filete Entalhado · L5 Candelabra · L6 Entrelac de Luxo
        </div>
        <div style={{ padding: "14px 0" }}>
          <Variante codigo="L1" nome="Voluta Caligráfica" subtitulo="Dois filetes em S cruzados · separador de diplomas e receituários de prestígio · pena caligráfica"
            faixa={<Faixa1 padrao={<PadVoluta />} />} />
          <Variante codigo="L2" nome="Rolo de Acanto Barroco" subtitulo="Folha de acanto em S fluindo em relevo · cornija barroca · estilo print 2 da referência"
            faixa={<Faixa2 padrao={<PadAcanto />} />} />
          <Variante codigo="L3" nome="Palmeta Otomana" subtitulo="Leque floral com volutas laterais · borda dourada em versão monocromática · estilo print 3"
            faixa={<Faixa1 padrao={<PadPalmeta />} />} />
          <Variante codigo="L4" nome="Filete Entalhado" subtitulo="Borda de documento clássico · losango central + volutas laterais + 3 linhas paralelas · diplomas e receituários"
            faixa={<Faixa2 padrao={<PadFilete />} />} />
          <Variante codigo="L5" nome="Candelabra Renascentista" subtitulo="Ornamento grotesco simétrico · Rafael pintou nas Loggie do Vaticano · eixo vertical com folhagem"
            faixa={<Faixa1 padrao={<PadCandelabra />} />} />
          <Variante codigo="L6" nome="Entrelac de Luxo — Fita Tripla" subtitulo="3 fitas tecidas em sobre-e-sob com efeito de profundidade · encadernação florentina séc. XV"
            faixa={<Faixa2 padrao={<PadEntrelacLuxo />} />} />
        </div>
      </div>
    </div>
  );
}
