// ─────────────────────────────────────────────────────────────────────────────
// ARABESCO VARIANTES — 4 versões para impressão em escala de cinza
// Cada variante exibe a faixa em contexto (atrás dos boxes de identificação)
//
// V1 — Neoclássico: Meandro Grego (Greek Key)
// V2 — Neoclássico: Guilloché / Engine Turning (estilo papel-moeda)
// V3 — Árabe: Mosaico de Estrela Islâmica 8 Pontas
// V4 — Árabe: Mosaico Marroquino (Zellige) 12 Pontas
// ─────────────────────────────────────────────────────────────────────────────

const INK   = "#111";
const GRAY  = "#333";
const LGRAY = "#777";
const CREAM = "#f8f8f6";
const OVERFLOW = 22; // px que os boxes transbordam acima/abaixo da faixa

// ═══════════════════════════════════════════════════════════════════════════
// PADRÃO 1 — MEANDRO GREGO (Greek Key)
// Tile 20×20: espiral em L que tesse o padrão de labirinto clássico
// ═══════════════════════════════════════════════════════════════════════════
function PadMeandro() {
  const T = 20;
  const sw = 1.4;
  const id = "p-meandro";
  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={T} patternUnits="userSpaceOnUse">
          <rect width={T} height={T} fill="#ddddd9"/>
          {/* Célula do meandro: F-shape que tesse */}
          <path
            d={`M1,${T-1} L1,1 L${T-1},1 L${T-1},${T/2-1} L${T/2+1},${T/2-1}
                L${T/2+1},${T/2+1} L${T-1},${T/2+1} L${T-1},${T-1}
                L${T/2+1},${T-1} L${T/2+1},${T/2+3} L${T/2-1},${T/2+3}
                L${T/2-1},1`}
            fill="#f5f5f2" stroke={GRAY} strokeWidth={sw} strokeLinejoin="miter"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PADRÃO 2 — GUILLOCHÉ (Engine Turning / papel-moeda)
// Faixas de curvas sinusoidais sobrepostas — padrão de documentos oficiais
// ═══════════════════════════════════════════════════════════════════════════
function PadGuilloché({ bandsH = 100 }: { bandsH?: number }) {
  const W = 640;
  const bands = 7;
  const amp = bandsH / (bands * 2.2);
  const freq = (2 * Math.PI) / 36;
  const pts = 400;

  function wave(phase: number, yCenter: number, ampScale = 1) {
    let d = "";
    for (let i = 0; i <= pts; i++) {
      const x = (i / pts) * W;
      const y = yCenter + Math.sin(i * (W / pts) * freq + phase) * amp * ampScale;
      d += i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : ` L${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return d;
  }

  const rows: { phase: number; cy: number; opacity: number; sw: number; ampS: number }[] = [];
  for (let b = 0; b < bands; b++) {
    const t = b / (bands - 1);
    rows.push({
      phase: b * 0.71,
      cy: (b + 0.5) * (bandsH / bands),
      opacity: b % 2 === 0 ? 0.7 : 0.45,
      sw: b % 2 === 0 ? 0.8 : 0.5,
      ampS: 0.7 + t * 0.5,
    });
  }

  return (
    <svg width={W} height={bandsH} style={{ display: "block", width: "100%" }} preserveAspectRatio="none">
      <rect width={W} height={bandsH} fill="#d0d0cc"/>
      {rows.map((r, i) => (
        <path key={i} d={wave(r.phase, r.cy, r.ampS)}
          fill="none" stroke={GRAY} strokeWidth={r.sw} opacity={r.opacity}/>
      ))}
      {/* Grade leve de linhas verticais espaçadas */}
      {Array.from({ length: 32 }, (_, i) => (
        <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={bandsH}
          stroke={LGRAY} strokeWidth="0.6" opacity="0.4"/>
      ))}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PADRÃO 3 — ESTRELA ISLÂMICA 8 PONTAS (Khatam / Star of Islam)
// Tile 28×28: octograma + quadrados intercalados
// ═══════════════════════════════════════════════════════════════════════════
function PadEstrelaCap8() {
  const T = 28;
  const cx = T / 2, cy = T / 2;
  const OR = 11.5; // raio externo da estrela
  const IR = 5.5;  // raio interno
  const n = 8;
  const id = "p-khatam";

  // Pontos da estrela de 8 pontas
  function starPts(cx: number, cy: number, or: number, ir: number, n: number) {
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const ang = (i * Math.PI) / n - Math.PI / 2;
      const r = i % 2 === 0 ? or : ir;
      pts.push(`${(cx + Math.cos(ang) * r).toFixed(2)},${(cy + Math.sin(ang) * r).toFixed(2)}`);
    }
    return pts.join(" ");
  }

  // Quadrado girado 45° no centro do tile (conexão entre estrelas)
  const sq = (IR * 0.82).toFixed(2);
  const squarePath = `M${cx},${(cy - +sq).toFixed(2)} L${(cx + +sq).toFixed(2)},${cy} L${cx},${(cy + +sq).toFixed(2)} L${(cx - +sq).toFixed(2)},${cy}Z`;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={T} patternUnits="userSpaceOnUse">
          <rect width={T} height={T} fill="#d4d4d0"/>
          {/* Estrela principal */}
          <polygon points={starPts(cx, cy, OR, IR, n)}
            fill="none" stroke={GRAY} strokeWidth="1.4" strokeLinejoin="round"/>
          {/* Estrelas nos cantos (¼ cada) */}
          <polygon points={starPts(0, 0, OR, IR, n)}
            fill="none" stroke={GRAY} strokeWidth="1.4" strokeLinejoin="round"/>
          <polygon points={starPts(T, 0, OR, IR, n)}
            fill="none" stroke={GRAY} strokeWidth="1.4" strokeLinejoin="round"/>
          <polygon points={starPts(0, T, OR, IR, n)}
            fill="none" stroke={GRAY} strokeWidth="1.4" strokeLinejoin="round"/>
          <polygon points={starPts(T, T, OR, IR, n)}
            fill="none" stroke={GRAY} strokeWidth="1.4" strokeLinejoin="round"/>
          {/* Losango de preenchimento entre estrelas */}
          <path d={squarePath} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          {/* Ponto central decorativo */}
          <circle cx={cx} cy={cy} r="1.2" fill={LGRAY} opacity="0.6"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PADRÃO 4 — ZELLIGE MARROQUINO (Mosaico 12 Pontas)
// Tile 36×36: estrela de 12 pontas + hexágonos irregulares (pattern persa)
// ═══════════════════════════════════════════════════════════════════════════
function PadZellige() {
  const T = 36;
  const cx = T / 2, cy = T / 2;
  const OR = 14.5;
  const IR = 7.5;
  const n = 12;
  const id = "p-zellige";

  function starPts(cx: number, cy: number, or: number, ir: number, n: number) {
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const ang = (i * Math.PI) / n - Math.PI / 2;
      const r = i % 2 === 0 ? or : ir;
      pts.push(`${(cx + Math.cos(ang) * r).toFixed(2)},${(cy + Math.sin(ang) * r).toFixed(2)}`);
    }
    return pts.join(" ");
  }

  // Hexágono preenchido leve entre as estrelas
  function hexPath(cx: number, cy: number, r: number) {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      pts.push(`${(cx + Math.cos(ang) * r).toFixed(2)},${(cy + Math.sin(ang) * r).toFixed(2)}`);
    }
    return "M" + pts.join(" L") + "Z";
  }

  const halfT = T / 2;
  const hexR = IR * 0.55;

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={T} patternUnits="userSpaceOnUse">
          <rect width={T} height={T} fill="#d4d4d0"/>
          {/* Estrela de 12 pontas principal */}
          <polygon points={starPts(cx, cy, OR, IR, n)}
            fill="none" stroke={GRAY} strokeWidth="1.3" strokeLinejoin="round"/>
          {/* Hexágonos nos 4 cantos (intercalação) */}
          <path d={hexPath(0, 0, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          <path d={hexPath(T, 0, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          <path d={hexPath(0, T, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          <path d={hexPath(T, T, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          {/* Quadrado de ligação nas arestas (meio dos lados) */}
          <path d={hexPath(halfT, 0, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          <path d={hexPath(0, halfT, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          <path d={hexPath(T, halfT, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          <path d={hexPath(halfT, T, hexR)} fill="none" stroke={LGRAY} strokeWidth="0.9"/>
          {/* Miolo da estrela */}
          <circle cx={cx} cy={cy} r="1.8" fill="none" stroke={GRAY} strokeWidth="0.9"/>
          <circle cx={cx} cy={cy} r="0.7" fill={GRAY} opacity="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Caixa de identificação demo (escala de cinza)
// ─────────────────────────────────────────────────────────────────────────────
function CaixaDemo({ titulo, lado }: { titulo: string; lado: "esq" | "dir" }) {
  const labels = lado === "esq"
    ? [["Nome", "Maria Fernanda Souza Almeida"], ["CPF", "123.456.789-00"], ["Data Nasc.", "15/03/1988"], ["Endereço", "Rua das Acácias, 250 · Apto. 42"], ["Cidade/UF", "São Paulo / SP"]]
    : [["Nome", "Dr. Caio Henrique Fernandes Pádua"], ["CRM", "SP 125.475 · RQE: 56789"], ["Especialidade", "Medicina Integrativa"], ["Endereço", "Rua Guaxupé, 327 · Vila Formosa"], ["Cidade/UF", "São Paulo / SP"]];
  return (
    <div style={{ flex: 1, border: "0.5px solid #999", padding: "6px 8px", background: CREAM }}>
      <div style={{
        fontSize: 6, fontWeight: 800, letterSpacing: 2.5, color: "#444",
        textTransform: "uppercase", textAlign: "center",
        borderBottom: "0.4px solid #bbb", paddingBottom: 3, marginBottom: 5,
      }}>
        {titulo}
      </div>
      {labels.map(([l, v]) => (
        <div key={l} style={{ display: "flex", alignItems: "baseline", marginBottom: 3, fontSize: 7 }}>
          <span style={{ color: "#666", fontSize: 6, flexShrink: 0, width: 70 }}>{l}</span>
          <span style={{ flex: 1, color: INK }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// Wrapper que exibe arabesco como faixa horizontal atrás dos boxes
function FaixaVariante({
  label, descricao, padrao,
}: {
  label: string;
  descricao: string;
  padrao: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 36, background: "#fff", padding: "16px 22px" }}>
      {/* Rótulo da variante */}
      <div style={{ marginBottom: 8, display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{
          fontSize: 8, fontWeight: 900, letterSpacing: 2, color: "#222",
          textTransform: "uppercase", borderBottom: "1px solid #333", paddingBottom: 1,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 7, color: "#888" }}>{descricao}</div>
      </div>

      {/* Faixa arabesco + boxes */}
      <div style={{ position: "relative" }}>
        {/* Faixa (fica atrás) */}
        <div style={{
          position: "absolute",
          top: OVERFLOW,
          left: 0,
          right: 0,
          bottom: OVERFLOW,
          overflow: "hidden",
          borderTop: "0.8px solid #666",
          borderBottom: "0.8px solid #666",
          zIndex: 0,
        }}>
          {padrao}
        </div>
        {/* Boxes (ficam na frente) */}
        <div style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          gap: 12,
        }}>
          <CaixaDemo titulo="Identificação do Paciente" lado="esq" />
          <CaixaDemo titulo="Identificação do Emitente" lado="dir" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ArabescoVariantes() {
  return (
    <div className="min-h-screen bg-stone-200 flex items-start justify-center p-6 py-8">
      <div style={{
        width: 640,
        background: "#e8e8e6",
        border: "1px solid #999",
        boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
        padding: 0,
      }}>
        {/* Cabeçalho de comparação */}
        <div style={{
          background: "#222", color: "#fff",
          padding: "10px 22px",
          fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase",
        }}>
          Receituário de Controle Especial — 4 Variantes de Arabesco (Escala de Cinza)
        </div>

        <div style={{ padding: "16px 0" }}>
          <FaixaVariante
            label="V1 — Neoclássico: Meandro Grego"
            descricao="Greek Key · padrão de labirinto retilíneo · séc. V a.C."
            padrao={<PadMeandro />}
          />
          <FaixaVariante
            label="V2 — Neoclássico: Guilloché (Engine Turning)"
            descricao="Curvas sinusoidais sobrepostas · estilo papel-moeda e documentos oficiais"
            padrao={<PadGuilloché />}
          />
          <FaixaVariante
            label="V3 — Árabe: Estrela Islâmica 8 Pontas"
            descricao="Khatam · mosaico geométrico islâmico · séc. IX–XIV"
            padrao={<PadEstrelaCap8 />}
          />
          <FaixaVariante
            label="V4 — Árabe: Zellige Marroquino 12 Pontas"
            descricao="Mosaico de estrela duodecagonal · tradição marroquina de azulejos"
            padrao={<PadZellige />}
          />
        </div>
      </div>
    </div>
  );
}
