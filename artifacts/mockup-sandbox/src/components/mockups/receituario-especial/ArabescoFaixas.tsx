// ─────────────────────────────────────────────────────────────────────────────
// ARABESCO FAIXAS — 6 variantes em escala de cinza para receituário
// Referência: col. direita, linhas 3 e 4 da imagem de arabescos árabes
//
// V1 — 1 faixa: Estrela-Cruz Islâmica (ref col.dir. linha 3)
// V2 — 1 faixa: Malha Densa de 8 Pontas (ref col.dir. linha 4)
// V3 — 2 faixas paralelas: Estrela-Cruz
// V4 — 2 faixas paralelas: Malha Densa
// V5 — SURPRESA: Mashrabiya (grade de claustra árabe com círculos entrelaçados)
// V6 — SURPRESA: Arabesco Entrelacado (espirais duplas / estilo borda de tapete persa)
// ─────────────────────────────────────────────────────────────────────────────

const INK   = "#111";
const DARK  = "#222";
const MID   = "#555";
const LIGHT = "#bbb";
const CREAM = "#f9f9f7";
const OVERFLOW = 28;  // px que os boxes transbordam da faixa
const SIDE_PAD = 44; // px de margem lateral — expõe o arabesco nas bordas

// Helper: polygon string for n-pointed star
function starPts(cx: number, cy: number, or: number, ir: number, n: number, startDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const ang = ((startDeg + i * (180 / n)) * Math.PI) / 180;
    const r = i % 2 === 0 ? or : ir;
    pts.push(`${(cx + Math.cos(ang) * r).toFixed(3)},${(cy + Math.sin(ang) * r).toFixed(3)}`);
  }
  return pts.join(" ");
}

// Helper: regular polygon string
function polyPts(cx: number, cy: number, r: number, n: number, startDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const ang = ((startDeg + i * (360 / n)) * Math.PI) / 180;
    pts.push(`${(cx + Math.cos(ang) * r).toFixed(3)},${(cy + Math.sin(ang) * r).toFixed(3)}`);
  }
  return pts.join(" ");
}

// ═══════════════════════════════════════════════════════════════════════════
// PADRÃO A — ESTRELA-CRUZ ISLÂMICA 8 PONTAS
// Referência: col.dir. linha 3 — estrelas de 8 pontas conectadas por cruzes
// Tile: 40×40. Estrela central + 4 meias-estrelas nas bordas + cruz nos cantos
// ═══════════════════════════════════════════════════════════════════════════
function PadEstrelaCruz() {
  const T = 40;
  const cx = T / 2, cy = T / 2;
  const OR = 14.5, IR = 7.5;
  const id = "pad-ec";

  // Cross shape at (x, y): a + shape with arm length L and arm half-width W
  function crossPath(x: number, y: number, L: number, W: number) {
    return `M${x - W},${y - L} L${x + W},${y - L} L${x + W},${y - W} L${x + L},${y - W}
      L${x + L},${y + W} L${x + W},${y + W} L${x + W},${y + L} L${x - W},${y + L}
      L${x - W},${y + W} L${x - L},${y + W} L${x - L},${y - W} L${x - W},${y - W}Z`;
  }

  // Small connector square rotated 45° at edge midpoints
  function diamondPath(x: number, y: number, r: number) {
    return `M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y}Z`;
  }

  const sw = 1.1;
  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={T} patternUnits="userSpaceOnUse">
          <rect width={T} height={T} fill="#f2f2ef"/>
          {/* Estrela central de 8 pontas */}
          <polygon points={starPts(cx, cy, OR, IR, 8)}
            fill="#e0e0dc" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          {/* Losangos de conexão nas 4 bordas (meias-estrelas que tesseleiam) */}
          <polygon points={starPts(0, cy, OR, IR, 8)}
            fill="#e0e0dc" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          <polygon points={starPts(T, cy, OR, IR, 8)}
            fill="#e0e0dc" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          <polygon points={starPts(cx, 0, OR, IR, 8)}
            fill="#e0e0dc" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          <polygon points={starPts(cx, T, OR, IR, 8)}
            fill="#e0e0dc" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          {/* Quarteto de cruzes nos 4 cantos — cada tile contribui ¼ de cada cruz */}
          {[[0, 0], [T, 0], [0, T], [T, T]].map(([x, y]) => (
            <path key={`c${x}${y}`} d={crossPath(x, y, IR * 0.9, IR * 0.38)}
              fill="#ececea" stroke={DARK} strokeWidth={sw * 0.7} strokeLinejoin="round"/>
          ))}
          {/* Pequeno losango central preenchido */}
          <path d={diamondPath(cx, cy, IR * 0.42)} fill={DARK} opacity="0.35"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PADRÃO B — MALHA DENSA DE ESTRELAS (ref col.dir. linha 4)
// Tile: 44×44. Estrela de 8 pontas com losangos e triângulos de preenchimento.
// Cria a "trama de estalactites" do estilo Alhambra.
// ═══════════════════════════════════════════════════════════════════════════
function PadMalhaDensa() {
  const T = 44;
  const cx = T / 2, cy = T / 2;
  const OR = 16, IR = 8;
  const id = "pad-md";
  const sw = 1.0;

  // Triângulo isósceles preenchido entre duas pontas de estrela adjacentes
  function triPath(ax: number, ay: number, bx: number, by: number, tipX: number, tipY: number) {
    return `M${ax.toFixed(2)},${ay.toFixed(2)} L${bx.toFixed(2)},${by.toFixed(2)} L${tipX.toFixed(2)},${tipY.toFixed(2)}Z`;
  }

  // Compute star vertices
  function starVerts(cx: number, cy: number, or: number, ir: number, n: number, startDeg = -90) {
    const verts: { x: number; y: number }[] = [];
    for (let i = 0; i < n * 2; i++) {
      const ang = ((startDeg + i * (180 / n)) * Math.PI) / 180;
      const r = i % 2 === 0 ? or : ir;
      verts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }
    return verts;
  }

  const verts = starVerts(cx, cy, OR, IR, 8);
  // Between outer tips, fill with small inward triangles toward center
  const tris: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = verts[i * 2];       // outer tip i
    const b = verts[((i * 2 + 2) % 16)]; // outer tip i+1 (skip inner)
    const mid = verts[i * 2 + 1]; // inner notch between them
    // Small triangle pointing inward between two outer tips, using inner notch as tip
    tris.push(triPath(a.x, a.y, b.x, b.y, mid.x, mid.y));
  }

  // Small connector squares between tessellated stars
  function tinySquare(x: number, y: number, r: number, rot = 0) {
    const a = (rot * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const pts = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([dx, dy]) => ({
      x: x + dx * cos - dy * sin,
      y: y + dx * sin + dy * cos,
    }));
    return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)} ${pts.slice(1).map(p => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}Z`;
  }

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={T} patternUnits="userSpaceOnUse">
          <rect width={T} height={T} fill="#efefec"/>
          {/* Estrela principal */}
          <polygon points={starPts(cx, cy, OR, IR, 8)}
            fill="#e6e6e3" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          {/* Estrelas nas bordas para tesseleação */}
          {[[0, cy], [T, cy], [cx, 0], [cx, T]].map(([x, y]) => (
            <polygon key={`s${x}${y}`} points={starPts(x, y, OR, IR, 8)}
              fill="#e6e6e3" stroke={DARK} strokeWidth={sw} strokeLinejoin="round"/>
          ))}
          {/* Triângulos de preenchimento entre pontas */}
          {tris.map((d, i) => (
            <path key={i} d={d} fill="#d8d8d5" stroke={DARK} strokeWidth={sw * 0.6}/>
          ))}
          {/* Tiny squares at corners (connectors) */}
          <path d={tinySquare(0, 0, IR * 0.5, 45)} fill="#d0d0cd" stroke={DARK} strokeWidth={sw * 0.55}/>
          <path d={tinySquare(T, 0, IR * 0.5, 45)} fill="#d0d0cd" stroke={DARK} strokeWidth={sw * 0.55}/>
          <path d={tinySquare(0, T, IR * 0.5, 45)} fill="#d0d0cd" stroke={DARK} strokeWidth={sw * 0.55}/>
          <path d={tinySquare(T, T, IR * 0.5, 45)} fill="#d0d0cd" stroke={DARK} strokeWidth={sw * 0.55}/>
          {/* Central accent dot */}
          <circle cx={cx} cy={cy} r="2.5" fill={DARK} opacity="0.25"/>
          <circle cx={cx} cy={cy} r="1" fill={DARK} opacity="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SURPRESA V — MASHRABIYA (Grade de Claustra Árabe)
// Padrão de claustra / muxarabiê: círculos tangentes em arranjo hexagonal
// criando "flores" de 6 pétalas — padrão das janelas de madeira árabes
// ═══════════════════════════════════════════════════════════════════════════
function PadMashrabiya() {
  const R = 11;  // raio do círculo
  const TX = R * 2;                    // período horizontal
  const TY = R * Math.sqrt(3);         // período vertical
  const id = "pad-mash";
  const sw = 1.2;

  // Arco de pétala: arco do círculo vizinho cortando o atual
  // Para 6 círculos tangentes ao redor de um central:
  // os centros estão a 2R de distância em 0°, 60°, 120°, etc.

  // Build petal arc paths: for a lattice of circles, each circle is
  // clipped by its 6 neighbors, creating flower petal shapes
  const arcCmds: string[] = [];

  // For a hexagonal lattice, generate intersection arcs:
  // At each lattice point, draw 6 arcs of radius R,
  // each arc from one tangent point to the next
  function hexLatticeArcs(cx: number, cy: number) {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i * 60 * Math.PI) / 180;
      // Tangent point between this circle and neighbor at angle ang
      pts.push({ x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) });
    }
    // Draw arcs from tangent point to tangent point (each arc subtends 60°)
    const cmds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % 6];
      // Arc from p to q around center (cx, cy), radius R
      cmds.push(`M${p.x.toFixed(2)},${p.y.toFixed(2)} A${R},${R},0,0,1,${q.x.toFixed(2)},${q.y.toFixed(2)}`);
    }
    return cmds.join(" ");
  }

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={TX} height={TY} patternUnits="userSpaceOnUse">
          <rect width={TX} height={TY} fill="#f0f0ed"/>
          {/* Draw flower at (0,0) — contributes arcs to this tile and neighbors */}
          {[
            [0, 0], [TX, 0], [0, TY], [TX, TY],
            [TX / 2, TY / 2],
            [-TX / 2, TY / 2], [TX * 1.5, TY / 2],
          ].map(([x, y], i) => (
            <path key={i} d={hexLatticeArcs(x, y)}
              fill="none" stroke={DARK} strokeWidth={sw} strokeLinecap="round"/>
          ))}
          {/* Filled hexagon centers */}
          {[[TX / 2, TY / 2]].map(([x, y]) => (
            <polygon key="h" points={polyPts(x, y, R * 0.33, 6)}
              fill={DARK} opacity="0.3"/>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SURPRESA VI — ARABESCO ENTRELACADO (Tapete Persa / Double Spiral)
// Espirais duplas que se entrelaçam — estilo das bordas de tapetes persas
// Cria a ilusão de fitas passando por cima e por baixo umas das outras
// ═══════════════════════════════════════════════════════════════════════════
function PadEntrelacado() {
  const T = 48;
  const id = "pad-ent";
  const sw = 1.3;
  const swThin = 0.7;

  // Double interlace: two sine-wave bands interleaved with alternating "over/under"
  // Implemented as overlapping arcs that cross and form a braid pattern

  // Plait/braid: at regular intervals, two diagonal lines cross
  // creating the "over-under" weave. Fill each braid segment differently.
  // This creates a typical border braid of Islamic manuscripts.

  // Braid tile: two sinusoidal bands crossing every half-period
  const W = T; // tile width
  const H = T; // tile height (height of band pattern)
  const cy1 = H * 0.35;
  const cy2 = H * 0.65;
  const amp = H * 0.22;
  const freq = (2 * Math.PI) / W;

  // Generate crossing sinusoid paths
  function sineSegs(yCenter: number, phase: number, segments = 32): string {
    let d = "";
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * W;
      const y = yCenter + Math.sin(x * freq + phase) * amp;
      d += i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : ` L${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return d;
  }

  // For interlace effect: alternate filled segments
  function sineFilled(yCenter: number, phase: number, above: boolean, segments = 32): string {
    const halfStep = Math.floor(segments / 4);
    let d = "";
    for (let seg = 0; seg < 4; seg++) {
      const start = seg * halfStep;
      const end = Math.min((seg + 1) * halfStep, segments);
      const pts: string[] = [];
      for (let i = start; i <= end; i++) {
        const x = (i / segments) * W;
        const y = yCenter + Math.sin(x * freq + phase) * amp;
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      if (pts.length > 1) {
        const offset = above ? -3 : 3;
        // Upper edge
        d += `M${pts[0]} ` + pts.slice(1).map(p => `L${p}`).join(" ");
      }
    }
    return d;
  }

  // Braided ornament: intersecting diagonal lines (Celtic braid approximation)
  const nodes: string[] = [];
  const step = T / 3;
  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j <= 3; j++) {
      const x = i * step;
      const y = j * step;
      // Cross with rounded ends
      nodes.push(`M${x - step * 0.35},${y} Q${x},${y - step * 0.35} ${x + step * 0.35},${y}`);
      nodes.push(`M${x},${y - step * 0.35} Q${x + step * 0.35},${y} ${x},${y + step * 0.35}`);
    }
  }

  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <pattern id={id} x="0" y="0" width={T} height={T} patternUnits="userSpaceOnUse">
          <rect width={T} height={T} fill="#f0f0ec"/>

          {/* Braid band 1: sinusoid going left-to-right */}
          <path d={sineSegs(cy1, 0)} fill="none" stroke={MID} strokeWidth={sw * 2.2} strokeLinecap="round"/>
          <path d={sineSegs(cy1, 0)} fill="none" stroke="#f0f0ec" strokeWidth={sw * 1.1} strokeLinecap="round"/>
          <path d={sineSegs(cy1, 0)} fill="none" stroke={DARK} strokeWidth={swThin} strokeLinecap="round"/>

          {/* Braid band 2: sinusoid going right-to-left (offset phase π) */}
          <path d={sineSegs(cy2, Math.PI)} fill="none" stroke={MID} strokeWidth={sw * 2.2} strokeLinecap="round"/>
          <path d={sineSegs(cy2, Math.PI)} fill="none" stroke="#f0f0ec" strokeWidth={sw * 1.1} strokeLinecap="round"/>
          <path d={sineSegs(cy2, Math.PI)} fill="none" stroke={DARK} strokeWidth={swThin} strokeLinecap="round"/>

          {/* Crossing band 3: diagonal cross-band creates the "over" segments */}
          <path d={sineSegs(T / 2, Math.PI / 2)} fill="none" stroke={MID} strokeWidth={sw * 2.4} strokeLinecap="round"/>
          <path d={sineSegs(T / 2, Math.PI / 2)} fill="none" stroke="#eeecea" strokeWidth={sw * 1.3} strokeLinecap="round"/>
          <path d={sineSegs(T / 2, Math.PI / 2)} fill="none" stroke={DARK} strokeWidth={swThin} strokeLinecap="round"/>

          {/* Decorative dots at crossing nodes */}
          {[T / 4, T * 3 / 4].map(x => (
            [T / 4, T * 3 / 4].map(y => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill={DARK} opacity="0.35"/>
            ))
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Caixas de identificação demo — compactas para ocupar menos espaço
// ─────────────────────────────────────────────────────────────────────────────
function CaixaId({ titulo, lado }: { titulo: string; lado: "esq" | "dir" }) {
  const rows = lado === "esq"
    ? [["Nome", "Maria Fernanda Souza Almeida"], ["CPF", "123.456.789-00"], ["CRM Emitente", "SP 125.475"]]
    : [["Emitente", "Dr. Caio H. F. Pádua"], ["Especialidade", "Medicina Integrativa"], ["CRBM / CRM", "SP 125.475"]];
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

// ─────────────────────────────────────────────────────────────────────────────
// Amostra limpa do padrão (tira dedicada SEM boxes por cima)
// ─────────────────────────────────────────────────────────────────────────────
function AmostrasStrip({ padrao }: { padrao: React.ReactNode }) {
  return (
    <div style={{
      height: 52, border: "1px solid #555", overflow: "hidden",
      marginBottom: 6, position: "relative",
    }}>
      <div style={{ position: "absolute", inset: 0 }}>{padrao}</div>
      <div style={{
        position: "absolute", top: 2, left: 6,
        fontSize: 5, letterSpacing: 1.5, color: "#666", textTransform: "uppercase",
      }}>
        amostra · padrão completo sem sobreposição
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper de 1 faixa horizontal — boxes com MARGEM LATERAL para expor o arabesco
// ─────────────────────────────────────────────────────────────────────────────
function Faixa1({ padrao }: { padrao: React.ReactNode }) {
  return (
    <>
      <AmostrasStrip padrao={padrao} />
      <div style={{ position: "relative" }}>
        {/* Faixa de arabesco — estende pelas margens laterais e overflow vertical */}
        <div style={{
          position: "absolute",
          top: OVERFLOW, left: 0, right: 0, bottom: OVERFLOW,
          overflow: "hidden",
          borderTop: "1px solid #444", borderBottom: "1px solid #444",
          zIndex: 0,
        }}>
          {padrao}
        </div>
        {/* Boxes com margem lateral — expõe o arabesco nos dois lados */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, padding: `0 ${SIDE_PAD}px` }}>
          <CaixaId titulo="Paciente" lado="esq" />
          <CaixaId titulo="Emitente" lado="dir" />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper de 2 faixas paralelas — boxes sobre as duas faixas com margens laterais
// ─────────────────────────────────────────────────────────────────────────────
function Faixa2({ padrao }: { padrao: React.ReactNode }) {
  return (
    <>
      <AmostrasStrip padrao={padrao} />
      <div style={{ position: "relative" }}>
        {/* Faixa superior */}
        <div style={{
          position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: "53%",
          overflow: "hidden",
          borderTop: "1px solid #444", borderBottom: "0.5px solid #888",
          zIndex: 0,
        }}>
          {padrao}
        </div>
        {/* Linha divisória entre as duas faixas */}
        <div style={{
          position: "absolute", top: "calc(50% - 1px)", left: 0, right: 0,
          height: 2, background: "#aaa", zIndex: 1,
        }} />
        {/* Faixa inferior */}
        <div style={{
          position: "absolute", top: "47%", left: 0, right: 0, bottom: OVERFLOW,
          overflow: "hidden",
          borderTop: "0.5px solid #888", borderBottom: "1px solid #444",
          zIndex: 0,
        }}>
          {padrao}
        </div>
        {/* Boxes com margem lateral */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, padding: `0 ${SIDE_PAD}px` }}>
          <CaixaId titulo="Paciente" lado="esq" />
          <CaixaId titulo="Emitente" lado="dir" />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloco de variante com rótulo
// ─────────────────────────────────────────────────────────────────────────────
function Variante({
  codigo, nome, subtitulo, faixa,
}: {
  codigo: string; nome: string; subtitulo: string; faixa: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28, background: "#fff", padding: "14px 20px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 7, fontWeight: 900, letterSpacing: 2,
          color: "#fff", background: DARK,
          padding: "2px 8px", textTransform: "uppercase",
        }}>
          {codigo}
        </span>
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
export function ArabescoFaixas() {
  return (
    <div className="min-h-screen bg-stone-300 flex items-start justify-center p-6 py-8">
      <div style={{
        width: 660,
        background: "#e5e5e2",
        border: "1px solid #888",
        boxShadow: "0 6px 28px rgba(0,0,0,0.20)",
      }}>
        {/* Cabeçalho */}
        <div style={{
          background: "#111", color: "#fff",
          padding: "10px 20px",
          fontSize: 7.5, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase",
        }}>
          Receituário de Controle Especial — 6 Variantes de Faixa · Escala de Cinza
        </div>
        <div style={{
          background: "#333", color: "#ccc",
          padding: "4px 20px",
          fontSize: 6, letterSpacing: 1.5,
        }}>
          V1–V2: 1 faixa · V3–V4: 2 faixas paralelas · V5–V6: Surpresas do agente
        </div>

        <div style={{ padding: "14px 0" }}>
          <Variante
            codigo="V1" nome="Estrela-Cruz Islâmica" subtitulo="Ref. col. dir. linha 3 · 1 faixa · padrão de 8 pontas + cruzes nos cantos"
            faixa={<Faixa1 padrao={<PadEstrelaCruz />} />}
          />
          <Variante
            codigo="V2" nome="Malha Densa de 8 Pontas" subtitulo="Ref. col. dir. linha 4 · 1 faixa · estrelas com losangos e triângulos de preenchimento"
            faixa={<Faixa1 padrao={<PadMalhaDensa />} />}
          />
          <Variante
            codigo="V3" nome="Estrela-Cruz — Dupla" subtitulo="2 faixas paralelas · boxes sobre as duas faixas"
            faixa={<Faixa2 padrao={<PadEstrelaCruz />} />}
          />
          <Variante
            codigo="V4" nome="Malha Densa — Dupla" subtitulo="2 faixas paralelas · boxes sobre as duas faixas"
            faixa={<Faixa2 padrao={<PadMalhaDensa />} />}
          />
          <Variante
            codigo="V5" nome="Mashrabiya — Grade de Claustra" subtitulo="SURPRESA · flores de 6 pétalas por arcos de círculos tangentes · padrão das janelas árabes de madeira"
            faixa={<Faixa1 padrao={<PadMashrabiya />} />}
          />
          <Variante
            codigo="V6" nome="Arabesco Entrelacado" subtitulo="SURPRESA · 3 fitas sinusoidais entrelaçadas com efeito de relevo · bordas de tapetes persas"
            faixa={<Faixa2 padrao={<PadEntrelacado />} />}
          />
        </div>
      </div>
    </div>
  );
}
