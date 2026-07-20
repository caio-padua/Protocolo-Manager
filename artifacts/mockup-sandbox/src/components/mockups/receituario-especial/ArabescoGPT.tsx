// ─────────────────────────────────────────────────────────────────────────────
// ARABESCO GPT — 6 variantes usando SVG inline com <pattern>
// SVG original do ChatGPT: rinceaux de acanto, tile 320×120, seamless
// Técnica: SVG inline (não background-image) garante renderização correta
// ─────────────────────────────────────────────────────────────────────────────

// ─── Os paths exatos do SVG gerado pelo ChatGPT ──────────────────────────────
// Tile: 320×120, todos os caminhos relativos a esse viewport
const PATHS: { d: string; sw: number; op?: number }[] = [
  // linha central fina
  { d: "M0 60 H320", sw: 0.7, op: 0.55 },
  // rolo superior esquerdo
  { d: "M0 60 C28 60 30 22 66 22 C92 22 100 47 80 58 C59 69 39 51 48 37 C55 26 73 29 75 41 C78 55 60 59 54 50", sw: 2.1 },
  // rolo superior direito
  { d: "M320 60 C292 60 290 22 254 22 C228 22 220 47 240 58 C261 69 281 51 272 37 C265 26 247 29 245 41 C242 55 260 59 266 50", sw: 2.1 },
  // rolo inferior esquerdo
  { d: "M0 60 C28 60 30 98 66 98 C92 98 100 73 80 62 C59 51 39 69 48 83 C55 94 73 91 75 79 C78 65 60 61 54 70", sw: 2.1 },
  // rolo inferior direito
  { d: "M320 60 C292 60 290 98 254 98 C228 98 220 73 240 62 C261 51 281 69 272 83 C265 94 247 91 245 79 C242 65 260 61 266 70", sw: 2.1 },
  // folha lateral esquerda
  { d: "M78 58 C101 42 118 26 125 8 C128 31 120 48 101 60 C120 72 128 89 125 112 C118 94 101 78 78 62", sw: 1.5 },
  // folha lateral direita
  { d: "M242 58 C219 42 202 26 195 8 C192 31 200 48 219 60 C200 72 192 89 195 112 C202 94 219 78 242 62", sw: 1.5 },
  // folhas superiores das laterais
  { d: "M104 48 C109 34 117 24 128 16 C126 29 121 41 110 53 Z", sw: 1.15 },
  { d: "M104 72 C109 86 117 96 128 104 C126 91 121 79 110 67 Z", sw: 1.15 },
  { d: "M216 48 C211 34 203 24 192 16 C194 29 199 41 210 53 Z", sw: 1.15 },
  { d: "M216 72 C211 86 203 96 192 104 C194 91 199 79 210 67 Z", sw: 1.15 },
  // medalhão central (losango / rombóide)
  { d: "M160 9 C171 25 181 37 199 47 C183 50 173 54 164 60 C173 66 183 70 199 73 C181 83 171 95 160 111 C149 95 139 83 121 73 C137 70 147 66 156 60 C147 54 137 50 121 47 C139 37 149 25 160 9 Z", sw: 1.8 },
  // elipses internas do medalhão
  { d: "M160 28 C168 38 173 47 173 60 C173 73 168 82 160 92 C152 82 147 73 147 60 C147 47 152 38 160 28 Z", sw: 1.15 },
  { d: "M136 60 C146 52 151 49 160 49 C169 49 174 52 184 60 C174 68 169 71 160 71 C151 71 146 68 136 60 Z", sw: 1.15 },
  // volutas de borda (esq e dir)
  { d: "M18 60 C27 52 34 48 44 48 C37 54 33 59 33 66 C27 64 22 62 18 60 Z", sw: 1.0 },
  { d: "M302 60 C293 52 286 48 276 48 C283 54 287 59 287 66 C293 64 298 62 302 60 Z", sw: 1.0 },
];

const CIRCLES = [
  { cx: 160, cy: 60, r: 3.1, sw: 1.0 },
  { cx: 0,   cy: 60, r: 2.2, sw: 1.0 },
  { cx: 320, cy: 60, r: 2.2, sw: 1.0 },
];

// ─── SVG pattern como componente React ───────────────────────────────────────
// Renderiza a faixa do ChatGPT como <svg> inline com <defs><pattern>
// Cor do traço é explícita (sem currentColor) — funciona em qualquer browser
function FaixaSVG({
  patternId,
  bandH,
  tileW,        // largura do tile em px (para background-size equivalente)
  strokeColor,
  bgColor,
  borderColor,
}: {
  patternId: string;
  bandH: number;
  tileW: number;
  strokeColor: string;
  bgColor: string;
  borderColor: string;
}) {
  // O tile original é 320×120. Escalamos para tileW pixels de largura,
  // mantendo a proporção: altura do tile = tileW * (120/320)
  const ORIG_W = 320, ORIG_H = 120;
  const scale = tileW / ORIG_W;
  const tileH = ORIG_H * scale;   // altura do tile escalado
  const scaleStr = `scale(${scale.toFixed(6)})`;

  return (
    <svg
      width="100%"
      height={bandH}
      style={{ display: "block", position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id={patternId}
          x="0" y="0"
          width={tileW}
          height={tileH}
          patternUnits="userSpaceOnUse"
        >
          {/* fundo da faixa */}
          <rect width={ORIG_W * scale} height={ORIG_H * scale} fill={bgColor}/>
          {/* motivos escalados */}
          <g
            fill="none"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={scaleStr}
          >
            {PATHS.map((p, i) => (
              <path key={i} d={p.d} strokeWidth={p.sw} opacity={p.op ?? 1}/>
            ))}
            {CIRCLES.map((c, i) => (
              <circle key={i} cx={c.cx} cy={c.cy} r={c.r} strokeWidth={c.sw}/>
            ))}
          </g>
        </pattern>
      </defs>

      {/* Borda superior e inferior da faixa */}
      <line x1="0" y1="0.5" x2="100%" y2="0.5" stroke={borderColor} strokeWidth="0.8"/>
      <line x1="0" y1={bandH - 0.5} x2="100%" y2={bandH - 0.5} stroke={borderColor} strokeWidth="0.8"/>
      {/* Filetes secundários */}
      <line x1="0" y1="3" x2="100%" y2="3" stroke={borderColor} strokeWidth="0.35" opacity="0.6"/>
      <line x1="0" y1={bandH - 3} x2="100%" y2={bandH - 3} stroke={borderColor} strokeWidth="0.35" opacity="0.6"/>

      {/* Retângulo preenchido com o pattern */}
      <rect x="0" y="1" width="100%" height={bandH - 2} fill={`url(#${patternId})`}/>
    </svg>
  );
}

// ─── tipos ───────────────────────────────────────────────────────────────────
type Var = {
  codigo: string;
  nome: string;
  descricao: string;
  bandH: number;     // pixels
  tileW: number;     // pixels (equivale ao mm do CSS)
  bgColor: string;
  strokeColor: string;
  borderColor: string;
  cardBorder: string;
};

const VARS: Var[] = [
  {
    codigo: "V1", nome: "Clássico",
    descricao: "O padrão original · fundo #F3F3F0 · tile 64mm · fiel ao receituário de referência",
    bandH: 88, tileW: 242,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b", cardBorder: "#454545",
  },
  {
    codigo: "V2", nome: "Suave",
    descricao: "Fundo mais claro · tile maior · padrão mais espaçado e arejado",
    bandH: 88, tileW: 264,
    bgColor: "#f7f7f4", strokeColor: "#aaaaaa", borderColor: "#aaaaaa", cardBorder: "#555555",
  },
  {
    codigo: "V3", nome: "Denso",
    descricao: "Tile menor · fundo mais escuro · padrão mais compacto e de maior presença",
    bandH: 88, tileW: 204,
    bgColor: "#eeeeeb", strokeColor: "#6a6a66", borderColor: "#7a7a76", cardBorder: "#333333",
  },
  {
    codigo: "V4", nome: "Largo",
    descricao: "Faixa mais alta (120px) · mais espaço visível do arabesco nas laterais",
    bandH: 120, tileW: 242,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b", cardBorder: "#454545",
  },
  {
    codigo: "V5", nome: "Pedra Escura",
    descricao: "Fundo cinza-pedra #D4D4D0 · contraste máximo · mais premium · alto valor",
    bandH: 88, tileW: 226,
    bgColor: "#d4d4d0", strokeColor: "#444440", borderColor: "#555552", cardBorder: "#222222",
  },
  {
    codigo: "V6", nome: "Ultradenso",
    descricao: "Tile 160px · medalhões sobrepostos · máxima riqueza visual · mais barroco",
    bandH: 88, tileW: 160,
    bgColor: "#f0f0ed", strokeColor: "#777772", borderColor: "#6a6a66", cardBorder: "#454545",
  },
];

// ─── Cartão de identificação (cartão branco sobre a faixa) ───────────────────
function InfoCard({
  titulo, rows, cardBorder,
}: {
  titulo: string;
  rows: [string, string][];
  cardBorder: string;
}) {
  return (
    <div style={{
      position: "relative", zIndex: 2,
      minHeight: 144, padding: "4mm 5mm",
      background: "#ffffff",
      border: `0.24mm solid ${cardBorder}`,
      borderRadius: 1,
      boxShadow: "0.7mm 0.7mm 0 rgba(0,0,0,0.055)",
    }}>
      <div style={{
        textAlign: "center", fontWeight: 700, fontSize: 7,
        letterSpacing: 2, textTransform: "uppercase",
        marginBottom: 4, borderBottom: "0.3px solid #ccc", paddingBottom: 3, color: "#222",
      }}>
        {titulo}
      </div>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display: "grid", gridTemplateColumns: "32mm 1fr", fontSize: 6.5, marginBottom: 2.5 }}>
          <b style={{ color: "#555" }}>{l}:</b>
          <span style={{ color: "#111" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Banda arabescada completa (faixa + 2 cartões) ───────────────────────────
function Banda({ v, pid, showPrescricao }: { v: Var; pid: string; showPrescricao?: boolean }) {
  const stageH = Math.max(v.bandH + 56, 155); // altura do estágio
  return (
    <div style={{
      position: "relative", isolation: "isolate",
      display: "grid", gridTemplateColumns: "1fr 1fr",
      gap: "5mm", paddingInline: "10mm",
      minHeight: stageH, alignItems: "center",
    }}>
      {/* Faixa SVG (z=0) */}
      <FaixaSVG
        patternId={pid}
        bandH={v.bandH}
        tileW={v.tileW}
        strokeColor={v.strokeColor}
        bgColor={v.bgColor}
        borderColor={v.borderColor}
      />
      {/* Cartão esquerdo */}
      <InfoCard cardBorder={v.cardBorder} titulo="Identificação — Paciente" rows={[
        ["Nome", "Maria Fernanda Souza Almeida"],
        ["CPF", "123.456.789-00"],
        ["Nascimento", "15/03/1988"],
        ["Telefone", "(11) 98765-4321"],
      ]}/>
      {/* Cartão direito */}
      <InfoCard cardBorder={v.cardBorder} titulo="Identificação — Emitente" rows={[
        ["Nome", "Dr. Caio H. F. Pádua"],
        ["CRM", "SP 123.456"],
        ["RQE", "56.789"],
        ["Telefone", "(11) 3090-0010"],
      ]}/>
    </div>
  );
}

// ─── Amostra pura (sem cartões, faixa correndo livre) ────────────────────────
function AmostraPura({ v, pid }: { v: Var; pid: string }) {
  return (
    <div style={{ position: "relative", height: v.bandH, marginBottom: 8, overflow: "hidden" }}>
      <FaixaSVG
        patternId={pid}
        bandH={v.bandH}
        tileW={v.tileW}
        strokeColor={v.strokeColor}
        bgColor={v.bgColor}
        borderColor={v.borderColor}
      />
      <div style={{ position: "absolute", top: 3, left: 6, fontSize: 5, letterSpacing: 1.5, color: "rgba(0,0,0,0.3)", textTransform: "uppercase", zIndex: 3 }}>
        amostra pura
      </div>
    </div>
  );
}

// ─── Card de variante ─────────────────────────────────────────────────────────
function CardVar({ v, idx }: { v: Var; idx: number }) {
  const base = `${v.codigo}-${idx}`;
  return (
    <div style={{ marginBottom: 24, background: "#fff", padding: "14px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, padding: "0 20px" }}>
        <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 2, color: "#fff", background: "#111", padding: "2px 8px", textTransform: "uppercase" }}>{v.codigo}</span>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: "#111", textTransform: "uppercase" }}>{v.nome}</span>
        <span style={{ fontSize: 6.5, color: "#888" }}>{v.descricao}</span>
      </div>
      <div style={{ padding: "0 20px", marginBottom: 6 }}>
        <table style={{ fontSize: 6, borderCollapse: "collapse", width: "100%", background: "#f8f8f6" }}>
          <thead>
            <tr style={{ background: "#ebebea" }}>
              {["Fundo", "Traço", "Tile (px)", "Faixa (px)"].map(h => (
                <th key={h} style={{ padding: "2px 6px", textAlign: "left", fontWeight: 700, color: "#555", letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "2px 6px", fontFamily: "monospace" }}>{v.bgColor}</td>
              <td style={{ padding: "2px 6px", fontFamily: "monospace" }}>{v.strokeColor}</td>
              <td style={{ padding: "2px 6px" }}>{v.tileW}px</td>
              <td style={{ padding: "2px 6px" }}>{v.bandH}px</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ padding: "0 20px" }}>
        <AmostraPura v={v} pid={`ap-${base}`}/>
      </div>
      <Banda v={v} pid={`bd-${base}`}/>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function ArabescoGPT() {
  const v0 = VARS[0];
  const v4 = VARS[4];

  return (
    <div className="min-h-screen bg-stone-300 flex items-start justify-center p-6 py-8">
      <div style={{ width: 780, background: "#e5e5e2", border: "1px solid #888", boxShadow: "0 6px 28px rgba(0,0,0,0.22)" }}>
        <div style={{ background: "#111", color: "#fff", padding: "10px 20px", fontSize: 7.5, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Rinceaux de Acanto — SVG ChatGPT · 6 Variantes
        </div>
        <div style={{ background: "#333", color: "#ccc", padding: "4px 20px", fontSize: 6, letterSpacing: 1.5 }}>
          Faixa contínua SVG inline (z-0) · filetes SVG (z-0) · cartões brancos (z-2) · arabesco visível nas laterais e entre cartões
        </div>

        {/* ── DEMO RECEITUÁRIO COMPLETO ── */}
        <div style={{ background: "#fff", padding: "18mm 0", boxShadow: "inset 0 0 10px rgba(0,0,0,0.05)" }}>
          <div style={{ textAlign: "center", marginBottom: "12mm", padding: "0 20px" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              Clínica Padua — Dr. Caio H. F. Pádua
            </div>
            <div style={{ fontSize: 7, letterSpacing: 4, color: "#555", marginTop: 3, textTransform: "uppercase" }}>
              Receituário de Controle Especial
            </div>
          </div>
          {/* Faixa superior */}
          <Banda v={v0} pid="demo-top"/>
          {/* Área de prescrição */}
          <div style={{ padding: "8mm 16mm", minHeight: "50mm" }}>
            <div style={{ fontSize: 7, color: "#888", borderBottom: "0.3px dashed #ccc", paddingBottom: 4, marginBottom: 8, fontStyle: "italic" }}>
              Rx — Área de prescrição médica
            </div>
            <div style={{ fontSize: 7, color: "#555", lineHeight: 1.8 }}>
              1. Zolpidem 10 mg — Tomar 1 comprimido à noite · Qtde.: 30 comprimidos.<br/>
              2. Clonazepam 0,5 mg — Tomar 1 comprimido à noite · Qtde.: 30 comprimidos.
            </div>
          </div>
          {/* Faixa inferior (pedra escura) */}
          <Banda v={v4} pid="demo-bot"/>
        </div>

        <div style={{ background: "#444", color: "#ddd", padding: "6px 20px", fontSize: 6.5, letterSpacing: 2, textTransform: "uppercase" }}>
          As 6 variantes — amostra pura + aplicação real
        </div>

        {/* ── 6 VARIANTES ── */}
        <div style={{ padding: "0 0 14px" }}>
          {VARS.map((v, i) => <CardVar key={v.codigo} v={v} idx={i}/>)}
        </div>
      </div>
    </div>
  );
}
