// ─────────────────────────────────────────────────────────────────────────────
// ARABESCO LUXO DENSO — 6 variantes com fundo preenchido e motivos em relevo
// Técnica: fundo cinza/pedra + formas claras preenchidas + contorno escuro
// Inspiração direta na imagem do Drive: faixa de folhagem densa com volutas
// ─────────────────────────────────────────────────────────────────────────────

const INK    = "#111";
const DARK   = "#1a1a1a";
const BAND   = "#b8b8b4";    // fundo cinza-pedra da faixa
const MOTIF  = "#f0efe9";    // forma principal (claro sobre o cinza)
const MOTIF2 = "#e2e0d8";    // forma secundária (ligeiramente mais escuro)
const CREAM  = "#f9f9f7";
const OVERFLOW = 28;
const SIDE_PAD = 44;

// Helper: folha simétrica com curvas bezier
// cx,cy = base da folha; angle = direção (radianos); w = largura; h = comprimento
function leaf(
  cx: number, cy: number,
  angleDeg: number, w: number, h: number
): string {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const nc = Math.cos(a + Math.PI / 2), ns = Math.sin(a + Math.PI / 2);
  const tip = { x: cx + cos * h, y: cy + sin * h };
  const l1  = { x: cx + cos * h * 0.25 + nc * w * 0.55, y: cy + sin * h * 0.25 + ns * w * 0.55 };
  const l2  = { x: cx + cos * h * 0.65 + nc * w * 0.45, y: cy + sin * h * 0.65 + ns * w * 0.45 };
  const r1  = { x: cx + cos * h * 0.25 - nc * w * 0.55, y: cy + sin * h * 0.25 - ns * w * 0.55 };
  const r2  = { x: cx + cos * h * 0.65 - nc * w * 0.45, y: cy + sin * h * 0.65 - ns * w * 0.45 };
  const f = (n: number) => n.toFixed(2);
  return (
    `M${f(cx)},${f(cy)} ` +
    `C${f(l1.x)},${f(l1.y)} ${f(l2.x)},${f(l2.y)} ${f(tip.x)},${f(tip.y)} ` +
    `C${f(r2.x)},${f(r2.y)} ${f(r1.x)},${f(r1.y)} ${f(cx)},${f(cy)}Z`
  );
}

// Helper: petala/oval simples
function petal(cx: number, cy: number, rx: number, ry: number, angleDeg: number): string {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const tip = { x: cx + cos * ry, y: cy + sin * ry };
  const base = { x: cx - cos * ry, y: cy - sin * ry };
  const lc = { x: cx + cos * ry * 0.4 + (-sin) * rx, y: cy + sin * ry * 0.4 + cos * rx };
  const rc = { x: cx + cos * ry * 0.4 - (-sin) * rx, y: cy + sin * ry * 0.4 - cos * rx };
  const lc2 = { x: cx - cos * ry * 0.4 + (-sin) * rx, y: cy - sin * ry * 0.4 + cos * rx };
  const rc2 = { x: cx - cos * ry * 0.4 - (-sin) * rx, y: cy - sin * ry * 0.4 - cos * rx };
  const f = (n: number) => n.toFixed(2);
  return `M${f(base.x)},${f(base.y)} C${f(lc2.x)},${f(lc2.y)} ${f(lc.x)},${f(lc.y)} ${f(tip.x)},${f(tip.y)} C${f(rc.x)},${f(rc.y)} ${f(rc2.x)},${f(rc2.y)} ${f(base.x)},${f(base.y)}Z`;
}

// ═══════════════════════════════════════════════════════════════════════════
// D1 — ROLO BOTÂNICO (Acanto Clássico Denso)
// Referência direta à faixa mostrada no print do Drive.
// Fundo cinza-pedra completo, formas claras preenchidas, volutas em relevo.
// Tile 80×52 com haste central em S + 3 folhas grandes + volutas.
// ═══════════════════════════════════════════════════════════════════════════
function PadBotanico() {
  const TW = 80, TH = 52;
  const id = "d1-bot";
  const sw = 0.7;

  // Leaves positioned around the tile for dense coverage
  const leaves = [
    leaf(10, 40, -55, 14, 28),   // large lower-left
    leaf(10, 40, -20, 10, 22),   // secondary lower-left
    leaf(40, 26, -100, 12, 22),  // center-left pointing right
    leaf(40, 26, -80, 10, 18),   // center secondary
    leaf(70, 42, -130, 14, 28),  // large lower-right
    leaf(70, 42, -160, 10, 22),  // secondary lower-right
    leaf(80, 10, -200, 8, 16),   // upper-right small
    leaf(0, 10, -340, 8, 16),    // upper-left small
    leaf(55, 16, -90, 10, 20),   // upper-center
    leaf(25, 14, -80, 9, 18),    // upper-center-left
  ];

  // Volute circles at tile intersections (simulates the scroll "eye")
  const volutes = [
    { cx: 10, cy: 40, r: 5 },
    { cx: 40, cy: 26, r: 4.5 },
    { cx: 70, cy: 42, r: 5 },
  ];

  // Main S-stems connecting leaves
  const stems = [
    `M0,44 C12,30 28,30 40,26 C52,22 68,30 80,44`,
    `M0,10 C14,18 28,18 40,26 C52,34 66,24 80,10`,
  ];

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          {/* Fundo cinza-pedra preenchendo toda a faixa */}
          <rect width={TW} height={TH} fill={BAND}/>
          {/* Sombras das hastes (profundidade) */}
          {stems.map((d, i) => (
            <path key={`ss${i}`} d={d} fill="none" stroke="#888" strokeWidth={6} strokeLinecap="round" opacity="0.5"/>
          ))}
          {/* Hastes principais */}
          {stems.map((d, i) => (
            <path key={`s${i}`} d={d} fill="none" stroke={MOTIF} strokeWidth={4} strokeLinecap="round"/>
          ))}
          <path d={stems[0]} fill="none" stroke="white" strokeWidth={1.2} strokeLinecap="round" opacity="0.4"/>
          <path d={stems[1]} fill="none" stroke="white" strokeWidth={1.2} strokeLinecap="round" opacity="0.4"/>
          {/* Sombras das folhas */}
          {leaves.map((d, i) => (
            <path key={`ls${i}`} d={d} fill="#888" opacity="0.25"/>
          ))}
          {/* Folhas preenchidas claras */}
          {leaves.map((d, i) => (
            <path key={`l${i}`} d={d} fill={i % 3 === 0 ? MOTIF : MOTIF2} stroke={DARK} strokeWidth={sw}/>
          ))}
          {/* Destaque das folhas (veia central) */}
          {leaves.slice(0, 6).map((d, i) => (
            <path key={`lv${i}`} d={d} fill="none" stroke="white" strokeWidth={0.6} opacity="0.35"/>
          ))}
          {/* Volutas (olhos dos rolos) */}
          {volutes.map((v, i) => (
            <g key={i}>
              <circle cx={v.cx} cy={v.cy} r={v.r} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>
              <circle cx={v.cx} cy={v.cy} r={v.r * 0.55} fill={MOTIF2} stroke={DARK} strokeWidth={sw * 0.6}/>
              <circle cx={v.cx} cy={v.cy} r={v.r * 0.2} fill={DARK} opacity="0.4"/>
            </g>
          ))}
          {/* Linhas de moldura dupla */}
          <line x1="0" y1="1.5" x2={TW} y2="1.5" stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1="4" x2={TW} y2="4" stroke={DARK} strokeWidth="0.4"/>
          <line x1="0" y1={TH - 1.5} x2={TW} y2={TH - 1.5} stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1={TH - 4} x2={TW} y2={TH - 4} stroke={DARK} strokeWidth="0.4"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// D2 — TREPADEIRA FLORAL
// Videira com flores de 5 pétalas e folhas grandes cobrindo toda a faixa.
// As flores são o foco — pétalas sólidas claras no fundo escuro.
// ═══════════════════════════════════════════════════════════════════════════
function PadTrepadeira() {
  const TW = 72, TH = 52;
  const id = "d2-tre";
  const sw = 0.7;

  // Flowers: petals as filled shapes
  function flower(cx: number, cy: number, r: number, n = 5) {
    const pethals = Array.from({ length: n }, (_, i) =>
      petal(cx, cy, r * 0.55, r, (i * 360) / n)
    );
    return pethals;
  }

  const f1 = flower(18, 18, 12);
  const f2 = flower(54, 34, 11);
  const f3 = flower(0, 50, 10); // partial at edge
  const f4 = flower(72, 10, 10); // partial at edge

  const leavesT = [
    leaf(18, 26, -45, 10, 20),
    leaf(18, 26, -135, 10, 20),
    leaf(54, 26, -45, 10, 18),
    leaf(54, 26, -135, 10, 18),
    leaf(36, 36, -90, 12, 22),
    leaf(36, 16, -90, 9, 16),
  ];

  const vines = [
    `M0,50 C18,38 18,26 36,28 C54,30 54,26 72,10`,
    `M0,26 C12,20 24,22 36,28 C48,34 60,40 72,46`,
  ];

  const allPetals = [...f1, ...f2, ...f3, ...f4];

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill={BAND}/>
          {/* Vinhas */}
          {vines.map((d, i) => (
            <path key={`vs${i}`} d={d} fill="none" stroke="#888" strokeWidth={5} strokeLinecap="round" opacity="0.4"/>
          ))}
          {vines.map((d, i) => (
            <path key={`v${i}`} d={d} fill="none" stroke={MOTIF} strokeWidth={3.5} strokeLinecap="round"/>
          ))}
          {/* Sombra das folhas */}
          {leavesT.map((d, i) => <path key={`ls${i}`} d={d} fill="#888" opacity="0.22"/>)}
          {/* Folhas */}
          {leavesT.map((d, i) => (
            <path key={`l${i}`} d={d} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>
          ))}
          {/* Sombra das pétalas */}
          {allPetals.map((d, i) => <path key={`ps${i}`} d={d} fill="#777" opacity="0.25"/>)}
          {/* Pétalas preenchidas */}
          {allPetals.map((d, i) => (
            <path key={`p${i}`} d={d} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>
          ))}
          {/* Highlight das pétalas */}
          {allPetals.map((d, i) => (
            <path key={`ph${i}`} d={d} fill="none" stroke="white" strokeWidth={0.5} opacity="0.4"/>
          ))}
          {/* Centro das flores */}
          {[{ cx: 18, cy: 18 }, { cx: 54, cy: 34 }, { cx: 0, cy: 50 }, { cx: 72, cy: 10 }].map((c, i) => (
            <g key={i}>
              <circle cx={c.cx} cy={c.cy} r={4} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>
              <circle cx={c.cx} cy={c.cy} r={2} fill={MOTIF} stroke={DARK} strokeWidth={sw * 0.6}/>
              <circle cx={c.cx} cy={c.cy} r={0.8} fill={DARK} opacity="0.4"/>
            </g>
          ))}
          <line x1="0" y1="1.5" x2={TW} y2="1.5" stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1="4" x2={TW} y2="4" stroke={DARK} strokeWidth="0.4"/>
          <line x1="0" y1={TH - 1.5} x2={TW} y2={TH - 1.5} stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1={TH - 4} x2={TW} y2={TH - 4} stroke={DARK} strokeWidth="0.4"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// D3 — FESTÃO CLÁSSICO (Garland)
// Festão romano: guirlanda de folhas de louro em arcos alternados.
// Usado em frisos de templos e documentos imperiais romanos.
// ═══════════════════════════════════════════════════════════════════════════
function PadFestao() {
  const TW = 64, TH = 52;
  const id = "d3-fes";
  const sw = 0.7;

  // Laurel leaf shape (elongated and pointed)
  function laurelLeaf(cx: number, cy: number, angleDeg: number): string {
    return leaf(cx, cy, angleDeg, 5, 16);
  }

  // Arc of laurel leaves on an elliptical garland arc
  function garlandArc(cx: number, cy: number, rx: number, ry: number, startDeg: number, endDeg: number, n: number) {
    const ls: string[] = [];
    for (let i = 0; i <= n; i++) {
      const t = startDeg + ((endDeg - startDeg) * i) / n;
      const rad = (t * Math.PI) / 180;
      const x = cx + rx * Math.cos(rad);
      const y = cy + ry * Math.sin(rad);
      // Leaf points outward (tangent + 90°)
      const tangentDeg = t + 90;
      ls.push(laurelLeaf(x, y, tangentDeg));
    }
    return ls;
  }

  // Two garland arcs forming scallops
  const arc1 = garlandArc(16, 20, 16, 14, 0, 180, 9);
  const arc2 = garlandArc(48, 20, 16, 14, 0, 180, 9);
  const arc3 = garlandArc(16, 32, 16, 14, 180, 360, 9);
  const arc4 = garlandArc(48, 32, 16, 14, 180, 360, 9);

  const allLeaves = [...arc1, ...arc2, ...arc3, ...arc4];

  // Ribbons binding the garlands
  const ribbon1 = `M16,6 C16,4 17,2 18,3 C19,4 18,7 16,6Z`;
  const ribbon2 = `M48,6 C48,4 49,2 50,3 C51,4 50,7 48,6Z`;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill={BAND}/>
          {/* Sombras */}
          {allLeaves.map((d, i) => <path key={`ls${i}`} d={d} fill="#777" opacity="0.2"/>)}
          {/* Folhas de louro */}
          {allLeaves.map((d, i) => (
            <path key={`l${i}`} d={d}
              fill={i % 2 === 0 ? MOTIF : MOTIF2}
              stroke={DARK} strokeWidth={sw}/>
          ))}
          {/* Fitas de amarração */}
          {[ribbon1, ribbon2].map((d, i) => (
            <path key={i} d={d} fill={MOTIF} stroke={DARK} strokeWidth={sw * 0.8}/>
          ))}
          {/* Bagas decorativas */}
          {[{ x: 16, y: 26 }, { x: 48, y: 26 }, { x: 32, y: 12 }, { x: 32, y: 40 }].map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={3.5} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>
          ))}
          {/* Frutos/ornamentos centrais */}
          {[{ x: 32, y: 26 }].map((c, i) => (
            <g key={i}>
              <ellipse cx={c.x} cy={c.y} rx={5} ry={7} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>
              <ellipse cx={c.x} cy={c.y} rx={2.5} ry={3.5} fill={MOTIF2} stroke={DARK} strokeWidth={sw * 0.5}/>
            </g>
          ))}
          <line x1="0" y1="1.5" x2={TW} y2="1.5" stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1="4" x2={TW} y2="4" stroke={DARK} strokeWidth="0.4"/>
          <line x1="0" y1={TH - 1.5} x2={TW} y2={TH - 1.5} stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1={TH - 4} x2={TW} y2={TH - 4} stroke={DARK} strokeWidth="0.4"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// D4 — FOLHAGEM DE ÍRIS (Frisos de Documento)
// Flor-de-lis / íris em série densa com folhagem sobreposta.
// Símbolo heráldico por excelência — receituários reais, brasões, selos.
// ═══════════════════════════════════════════════════════════════════════════
function PadIris() {
  const TW = 56, TH = 52;
  const id = "d4-iri";
  const sw = 0.7;
  const cx = TW / 2, cy = TH / 2;

  // Fleur-de-lis: 3 petals + base band
  function fleurDeLis(ox: number, oy: number, scale: number) {
    const s = scale;
    // Central petal (pointing up)
    const cp = leaf(ox, oy, -90, s * 5, s * 14);
    // Left petal (angled left)
    const lp = leaf(ox, oy, -130, s * 5, s * 11);
    // Right petal (angled right)
    const rp = leaf(ox, oy, -50, s * 5, s * 11);
    // Horizontal band at base
    const band = `M${ox - s * 8},${oy + s * 2} C${ox - s * 4},${oy - s * 1} ${ox + s * 4},${oy - s * 1} ${ox + s * 8},${oy + s * 2} L${ox + s * 8},${oy + s * 5} C${ox + s * 4},${oy + s * 7} ${ox - s * 4},${oy + s * 7} ${ox - s * 8},${oy + s * 5}Z`;
    // Lower stem
    const stem2 = `M${ox},${oy} L${ox},${oy + s * 2}`;
    return { cp, lp, rp, band, stem2 };
  }

  const f1 = fleurDeLis(cx, cy - 4, 1.0);
  const f2 = fleurDeLis(0, cy - 4, 0.8);
  const f3 = fleurDeLis(TW, cy - 4, 0.8);

  // Background leaves filling gaps
  const bgLeaves = [
    leaf(14, 14, -60, 8, 18),
    leaf(42, 14, -120, 8, 18),
    leaf(14, 38, -120, 8, 16),
    leaf(42, 38, -60, 8, 16),
  ];

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill={BAND}/>
          {/* Background leaves (secondary plane) */}
          {bgLeaves.map((d, i) => <path key={`bls${i}`} d={d} fill="#888" opacity="0.2"/>)}
          {bgLeaves.map((d, i) => <path key={`bl${i}`} d={d} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>)}
          {/* Fleurs-de-lis */}
          {[f1, f2, f3].map((f, fi) => (
            <g key={fi}>
              <path d={f.band} fill="#999" opacity="0.25"/>
              <path d={f.band} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>
              <path d={f.lp} fill="#999" opacity="0.25"/>
              <path d={f.lp} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>
              <path d={f.lp} fill="none" stroke="white" strokeWidth={0.5} opacity="0.35"/>
              <path d={f.rp} fill="#999" opacity="0.25"/>
              <path d={f.rp} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>
              <path d={f.rp} fill="none" stroke="white" strokeWidth={0.5} opacity="0.35"/>
              <path d={f.cp} fill="#999" opacity="0.25"/>
              <path d={f.cp} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>
              <path d={f.cp} fill="none" stroke="white" strokeWidth={0.7} opacity="0.4"/>
            </g>
          ))}
          <line x1="0" y1="1.5" x2={TW} y2="1.5" stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1="4" x2={TW} y2="4" stroke={DARK} strokeWidth="0.4"/>
          <line x1="0" y1={TH - 1.5} x2={TW} y2={TH - 1.5} stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1={TH - 4} x2={TW} y2={TH - 4} stroke={DARK} strokeWidth="0.4"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// D5 — ESCAMA VENEZIANA (Squame Rinascimentali)
// Padrão de escamas/pétalas sobrepostas — revestimentos de mármore e seda
// dos palácios venezianos. Cada escama é uma pétala arcada preenchida.
// Cria efeito de textura sólida e profundidade por sobreposição.
// ═══════════════════════════════════════════════════════════════════════════
function PadEscama() {
  const TW = 40, TH = 40;
  const id = "d5-esc";
  const sw = 0.6;
  const scaleW = 20, scaleH = 16;

  // One scale: an arc (rounded bottom) with two sides
  function scalePath(x: number, y: number): string {
    const cx = x + scaleW / 2;
    const top = y;
    const bot = y + scaleH;
    return [
      `M${x},${top}`,
      `C${x - 2},${top + scaleH * 0.35} ${cx - scaleW * 0.35},${bot} ${cx},${bot}`,
      `C${cx + scaleW * 0.35},${bot} ${x + scaleW + 2},${top + scaleH * 0.35} ${x + scaleW},${top}`,
      `Z`,
    ].join(" ");
  }

  // Tile: 2 rows × 2 columns of scales, staggered
  const positions: { x: number; y: number; row: number }[] = [
    { x: 0, y: 0, row: 0 }, { x: 20, y: 0, row: 0 },
    { x: -10, y: 14, row: 1 }, { x: 10, y: 14, row: 1 }, { x: 30, y: 14, row: 1 },
    { x: 0, y: 28, row: 0 }, { x: 20, y: 28, row: 0 },
  ];

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill={BAND}/>
          {positions.map((p, i) => {
            const d = scalePath(p.x, p.y);
            const shade = p.row === 0 ? MOTIF : MOTIF2;
            return (
              <g key={i}>
                <path d={d} fill="#777" opacity="0.2"/>
                <path d={d} fill={shade} stroke={DARK} strokeWidth={sw}/>
                {/* Thin highlight arc on upper portion */}
                <path
                  d={`M${p.x + 2},${p.y + 2} C${p.x + 2},${p.y + scaleH * 0.2} ${p.x + scaleW * 0.4},${p.y + scaleH * 0.12} ${p.x + scaleW / 2},${p.y + scaleH * 0.12}`}
                  fill="none" stroke="white" strokeWidth={0.7} opacity="0.45"
                  strokeLinecap="round"/>
              </g>
            );
          })}
          <line x1="0" y1="0" x2={TW} y2="0" stroke={DARK} strokeWidth="1.0"/>
          <line x1="0" y1={TH} x2={TW} y2={TH} stroke={DARK} strokeWidth="1.0"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// D6 — ROSAS ENTALHADAS EM FAIXA
// Rosetas circulares densas com pétalas sobrepostas — o ornamento circular
// mais usado em caixilhos, móveis e documentos de luxo da Europa séc. XVI-XIX.
// ═══════════════════════════════════════════════════════════════════════════
function PadRosas() {
  const TW = 56, TH = 52;
  const id = "d6-ros";
  const sw = 0.7;

  function rose(cx: number, cy: number, r: number, n: number) {
    // n petals arranged radially, each is an oval shape
    const petals: string[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (i * 360) / n;
      petals.push(petal(cx, cy, r * 0.55, r * 0.9, angle));
    }
    return petals;
  }

  function innerRose(cx: number, cy: number, r: number, n: number) {
    const petals: string[] = [];
    for (let i = 0; i < n; i++) {
      const angle = ((i * 360) / n) + (180 / n); // offset by half step
      petals.push(petal(cx, cy, r * 0.4, r * 0.7, angle));
    }
    return petals;
  }

  const r1 = rose(14, 26, 12, 8);
  const r1i = innerRose(14, 26, 8, 8);
  const r2 = rose(42, 26, 12, 8);
  const r2i = innerRose(42, 26, 8, 8);
  const r3small = rose(0, 26, 8, 6);
  const r4small = rose(56, 26, 8, 6);

  // Filling leaves between roses
  const fillLeaves = [
    leaf(28, 10, -90, 8, 14),
    leaf(28, 42, 90, 8, 14),
    leaf(28, 26, -0, 5, 8),
  ];

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
          <rect width={TW} height={TH} fill={BAND}/>
          {/* Filling leaves */}
          {fillLeaves.map((d, i) => <path key={`fl${i}`} d={d} fill="#888" opacity="0.2"/>)}
          {fillLeaves.map((d, i) => <path key={`f${i}`} d={d} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>)}
          {/* Rose 1 outer petals */}
          {[...r1, ...r3small].map((d, i) => (
            <path key={`r1o${i}`} d={d} fill="#888" opacity="0.22"/>
          ))}
          {r1.map((d, i) => <path key={`r1${i}`} d={d} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>)}
          {r1.map((d, i) => <path key={`r1h${i}`} d={d} fill="none" stroke="white" strokeWidth={0.5} opacity="0.35"/>)}
          {/* Rose 1 inner */}
          {r1i.map((d, i) => <path key={`r1i${i}`} d={d} fill={MOTIF2} stroke={DARK} strokeWidth={sw * 0.8}/>)}
          {/* Rose 2 outer petals */}
          {r2.map((d, i) => <path key={`r2s${i}`} d={d} fill="#888" opacity="0.22"/>)}
          {r2.map((d, i) => <path key={`r2${i}`} d={d} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>)}
          {r2.map((d, i) => <path key={`r2h${i}`} d={d} fill="none" stroke="white" strokeWidth={0.5} opacity="0.35"/>)}
          {/* Rose 2 inner */}
          {r2i.map((d, i) => <path key={`r2i${i}`} d={d} fill={MOTIF2} stroke={DARK} strokeWidth={sw * 0.8}/>)}
          {/* Small edge roses */}
          {r3small.map((d, i) => <path key={`r3${i}`} d={d} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>)}
          {r4small.map((d, i) => <path key={`r4${i}`} d={d} fill={MOTIF2} stroke={DARK} strokeWidth={sw}/>)}
          {/* Center dots */}
          {[{ cx: 14, cy: 26 }, { cx: 42, cy: 26 }, { cx: 0, cy: 26 }, { cx: 56, cy: 26 }].map((c, i) => (
            <g key={i}>
              <circle cx={c.cx} cy={c.cy} r={3.5} fill={MOTIF} stroke={DARK} strokeWidth={sw}/>
              <circle cx={c.cx} cy={c.cy} r={1.5} fill={DARK} opacity="0.35"/>
            </g>
          ))}
          <line x1="0" y1="1.5" x2={TW} y2="1.5" stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1="4" x2={TW} y2="4" stroke={DARK} strokeWidth="0.4"/>
          <line x1="0" y1={TH - 1.5} x2={TW} y2={TH - 1.5} stroke={DARK} strokeWidth="1.2"/>
          <line x1="0" y1={TH - 4} x2={TW} y2={TH - 4} stroke={DARK} strokeWidth="0.4"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout (idêntico ao anterior)
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
    <div style={{ height: 60, border: "1px solid #555", overflow: "hidden", marginBottom: 6, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0 }}>{padrao}</div>
      <div style={{ position: "absolute", top: 2, left: 6, fontSize: 5, letterSpacing: 1.5, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>
        amostra
      </div>
    </div>
  );
}

function Faixa1({ padrao }: { padrao: React.ReactNode }) {
  return (
    <>
      <Amostra padrao={padrao} />
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: OVERFLOW, overflow: "hidden", borderTop: "1.5px solid #333", borderBottom: "1.5px solid #333", zIndex: 0 }}>
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
        <div style={{ position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: "53%", overflow: "hidden", borderTop: "1.5px solid #333", borderBottom: "0.5px solid #888", zIndex: 0 }}>
          {padrao}
        </div>
        <div style={{ position: "absolute", top: "47%", left: 0, right: 0, bottom: OVERFLOW, overflow: "hidden", borderTop: "0.5px solid #888", borderBottom: "1.5px solid #333", zIndex: 0 }}>
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
export function ArabescoLuxoDense() {
  return (
    <div className="min-h-screen bg-stone-300 flex items-start justify-center p-6 py-8">
      <div style={{ width: 680, background: "#e5e5e2", border: "1px solid #888", boxShadow: "0 6px 28px rgba(0,0,0,0.22)" }}>
        <div style={{ background: "#111", color: "#fff", padding: "10px 20px", fontSize: 7.5, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Faixas de Luxo Densas — Motivos Preenchidos em Relevo · Cinza-Pedra
        </div>
        <div style={{ background: "#333", color: "#ccc", padding: "4px 20px", fontSize: 6, letterSpacing: 1.5 }}>
          D1 Botânico · D2 Trepadeira Floral · D3 Festão Romano · D4 Fleur-de-Lis · D5 Escama Veneziana · D6 Rosas Entalhadas
        </div>
        <div style={{ padding: "14px 0" }}>
          <Variante codigo="D1" nome="Rolo Botânico" subtitulo="Acanto clássico denso · referência direta à faixa do Drive · haste em S + folhagem preenchida"
            faixa={<Faixa1 padrao={<PadBotanico />} />} />
          <Variante codigo="D2" nome="Trepadeira Floral" subtitulo="Videira com flores de 5 pétalas e folhas grandes · todo o fundo coberto · sem espaço vazio"
            faixa={<Faixa2 padrao={<PadTrepadeira />} />} />
          <Variante codigo="D3" nome="Festão Romano" subtitulo="Guirlanda de louro em arcos alternados · friso de templo · documentos imperiais romanos"
            faixa={<Faixa1 padrao={<PadFestao />} />} />
          <Variante codigo="D4" nome="Fleur-de-Lis em Série" subtitulo="Flor-de-lis heráldica densa com folhagem de fundo · receituários reais · brasões europeus"
            faixa={<Faixa2 padrao={<PadIris />} />} />
          <Variante codigo="D5" nome="Escama Veneziana" subtitulo="Pétalas arcadas sobrepostas em escama · revestimento de mármore e seda dos palácios venezianos"
            faixa={<Faixa1 padrao={<PadEscama />} />} />
          <Variante codigo="D6" nome="Rosas Entalhadas" subtitulo="Rosetas circulares com pétalas sobrepostas · caixilhos e documentos de luxo séc. XVI–XIX"
            faixa={<Faixa2 padrao={<PadRosas />} />} />
        </div>
      </div>
    </div>
  );
}
