// ─────────────────────────────────────────────────────────────────────────────
// ARABESCO RINCEAUX — Padrão clássico de rolo de acanto
// Técnica: tile de 120×60 desenhado à mão com bezier curves
// Motivo: haste S contínua com "baías" preenchidas por folhas de acanto
// Replicando fielmente o estilo da faixa no Drive
// ─────────────────────────────────────────────────────────────────────────────

const BAND_BG   = "#b2b2ae";   // cinza-pedra (fundo da faixa)
const BAND_DARK = "#8a8a85";   // cinza mais escuro (sombra)
const MOTIF     = "#efede5";   // forma principal (quase branco)
const MOTIF2    = "#e0ddd4";   // forma secundária (ligeiramente mais escuro)
const INK       = "#111111";   // contorno das formas
const HIGHLIGHT = "#ffffff";   // destaque convexo

// ──────────────────────────────────────────────────────────────────────────────
// Folha de acanto — 3 lobos por lado, apontando numa direção qualquer
// ox,oy = ponto de origem (base da folha no caule)
// angleDeg = direção da ponta (0=direita, 90=cima, 180=esquerda, -90=baixo)
// w = largura máxima dos lobos;  h = comprimento total
// ──────────────────────────────────────────────────────────────────────────────
function acanto(ox: number, oy: number, angleDeg: number, w: number, h: number): string {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  // vetor perpendicular (lateral)
  const nx = -sin, ny = cos;

  // pontos ao longo do eixo principal
  function along(t: number) { return { x: ox + cos * h * t, y: oy + sin * h * t }; }
  // offset lateral
  function lat(t: number, side: number, scale: number) {
    const p = along(t);
    return { x: p.x + nx * w * side * scale, y: p.y + ny * w * side * scale };
  }

  // Lado esquerdo: 3 lobos (pontos de "sela" entre os lobos + picos dos lobos)
  const lb1 = lat(0.18, 1, 0.9);  // pico lobe 1 esq
  const ls1 = lat(0.30, 1, 0.4);  // sela entre lobes 1 e 2 esq
  const lb2 = lat(0.48, 1, 0.85); // pico lobe 2 esq
  const ls2 = lat(0.62, 1, 0.35); // sela entre lobes 2 e 3 esq
  const lb3 = lat(0.78, 1, 0.65); // pico lobe 3 esq
  const tip = along(1.0);          // ponta da folha

  // Lado direito (espelhado)
  const rb3 = lat(0.78, -1, 0.55);
  const rs2 = lat(0.62, -1, 0.3);
  const rb2 = lat(0.48, -1, 0.75);
  const rs1 = lat(0.30, -1, 0.35);
  const rb1 = lat(0.18, -1, 0.85);

  const f = (n: number) => n.toFixed(2);

  return [
    `M${f(ox)},${f(oy)}`,
    // lado esquerdo subindo
    `C${f(ox + nx * w * 0.3)},${f(oy + ny * w * 0.3)} ${f(lb1.x - cos * h * 0.04)},${f(lb1.y - sin * h * 0.04)} ${f(lb1.x)},${f(lb1.y)}`,
    `C${f(lb1.x + cos * h * 0.05)},${f(lb1.y + sin * h * 0.05)} ${f(ls1.x)},${f(ls1.y)} ${f(ls1.x)},${f(ls1.y)}`,
    `C${f(ls1.x)},${f(ls1.y)} ${f(lb2.x - cos * h * 0.04)},${f(lb2.y - sin * h * 0.04)} ${f(lb2.x)},${f(lb2.y)}`,
    `C${f(lb2.x + cos * h * 0.04)},${f(lb2.y + sin * h * 0.04)} ${f(ls2.x)},${f(ls2.y)} ${f(ls2.x)},${f(ls2.y)}`,
    `C${f(ls2.x)},${f(ls2.y)} ${f(lb3.x - cos * h * 0.03)},${f(lb3.y - sin * h * 0.03)} ${f(lb3.x)},${f(lb3.y)}`,
    `C${f(lb3.x + cos * h * 0.03)},${f(lb3.y + sin * h * 0.03)} ${f(tip.x - nx * w * 0.1)},${f(tip.y - ny * w * 0.1)} ${f(tip.x)},${f(tip.y)}`,
    // lado direito descendo
    `C${f(tip.x + nx * w * 0.1)},${f(tip.y + ny * w * 0.1)} ${f(rb3.x)},${f(rb3.y)} ${f(rb3.x)},${f(rb3.y)}`,
    `C${f(rb3.x - cos * h * 0.03)},${f(rb3.y - sin * h * 0.03)} ${f(rs2.x)},${f(rs2.y)} ${f(rs2.x)},${f(rs2.y)}`,
    `C${f(rs2.x)},${f(rs2.y)} ${f(rb2.x)},${f(rb2.y)} ${f(rb2.x)},${f(rb2.y)}`,
    `C${f(rb2.x - cos * h * 0.04)},${f(rb2.y - sin * h * 0.04)} ${f(rs1.x)},${f(rs1.y)} ${f(rs1.x)},${f(rs1.y)}`,
    `C${f(rs1.x)},${f(rs1.y)} ${f(rb1.x)},${f(rb1.y)} ${f(rb1.x)},${f(rb1.y)}`,
    `C${f(rb1.x - cos * h * 0.04)},${f(rb1.y - sin * h * 0.04)} ${f(ox - nx * w * 0.25)},${f(oy - ny * w * 0.25)} ${f(ox)},${f(oy)}Z`,
  ].join(" ");
}

// Voluta (espiral apertada — "olho" do rolo)
function voluta(cx: number, cy: number, r: number) {
  const r2 = r * 0.6, r3 = r * 0.3;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={BAND_DARK} opacity="0.4"/>
      <circle cx={cx} cy={cy} r={r} fill={MOTIF2} stroke={INK} strokeWidth={0.7}/>
      <circle cx={cx} cy={cy} r={r2} fill={BAND_BG} stroke={INK} strokeWidth={0.5}/>
      <circle cx={cx} cy={cy} r={r3} fill={MOTIF2} stroke={INK} strokeWidth={0.4}/>
      <circle cx={cx} cy={cy} r={r3 * 0.35} fill={INK} opacity="0.5"/>
    </>
  );
}

// Folha renderizada com sombra + corpo + highlight + veia central
function AcantoShape({ d, main }: { d: string; main?: boolean }) {
  return (
    <>
      <path d={d} fill={BAND_DARK} opacity="0.28" transform="translate(1.5,1.5)"/>
      <path d={d} fill={main ? MOTIF : MOTIF2} stroke={INK} strokeWidth={0.75}/>
      <path d={d} fill="none" stroke={HIGHLIGHT} strokeWidth={0.8} opacity="0.4"/>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tile do rinceaux principal (120×60)
// Haste S: (0,30)→(30,8)→(60,30)→(90,52)→(120,30)
// Baía superior: 3 folhas de acanto apontando para cima
// Baía inferior: 3 folhas de acanto apontando para baixo
// ═══════════════════════════════════════════════════════════════════════════

const TW = 120, TH = 60;
const STEM = `M0,30 C8,12 22,6 30,8 C38,10 46,28 60,30 C74,32 82,50 90,52 C98,54 112,48 120,30`;
const STEM_THIN = `M0,30 C8,14 24,8 30,9 C36,10 44,26 60,30 C76,34 84,52 90,51 C96,50 110,46 120,30`;

// Folhas da baía superior (raiz em ~30,28 — apex da curva superior)
const leafTopA  = acanto(30, 27, -105, 7, 22); // esquerda
const leafTopB  = acanto(30, 27,  -90, 8, 26); // centro (principal)
const leafTopC  = acanto(30, 27,  -75, 7, 22); // direita
const leafTopD  = acanto(22, 35, -125, 5, 16); // extra esquerda (preenche)
const leafTopE  = acanto(38, 34,  -55, 5, 16); // extra direita (preenche)

// Folhas da baía inferior (raiz em ~90,32 — nadir da curva inferior)
const leafBotA  = acanto(90, 33,  75, 7, 22);
const leafBotB  = acanto(90, 33,  90, 8, 26);
const leafBotC  = acanto(90, 33, 105, 7, 22);
const leafBotD  = acanto(82, 26,  55, 5, 16);
const leafBotE  = acanto(98, 27, 125, 5, 16);

// Folhas de borda (preenchem as extremidades do tile — tile 0-30 e 90-120)
const leafEdgeL1 = acanto(5, 20,  -90, 6, 16);
const leafEdgeL2 = acanto(5, 40,   90, 6, 14);
const leafEdgeR1 = acanto(115, 20, -90, 6, 16);
const leafEdgeR2 = acanto(115, 40,  90, 6, 14);

// ═══════════════════════════════════════════════════════════════════════════
// Componente do tile (SVG pattern)
// ═══════════════════════════════════════════════════════════════════════════
function RinceauxTile({ id }: { id: string }) {
  return (
    <pattern id={id} width={TW} height={TH} patternUnits="userSpaceOnUse">
      {/* Fundo cinza-pedra */}
      <rect width={TW} height={TH} fill={BAND_BG}/>

      {/* Folhas de borda (plano de fundo) */}
      <AcantoShape d={leafEdgeL1}/>
      <AcantoShape d={leafEdgeL2}/>
      <AcantoShape d={leafEdgeR1}/>
      <AcantoShape d={leafEdgeR2}/>

      {/* Folhas extras (preenche espaços) */}
      <AcantoShape d={leafTopD}/>
      <AcantoShape d={leafTopE}/>
      <AcantoShape d={leafBotD}/>
      <AcantoShape d={leafBotE}/>

      {/* Folhas principais da baía superior */}
      <AcantoShape d={leafTopA}/>
      <AcantoShape d={leafTopC}/>
      <AcantoShape d={leafTopB} main/>

      {/* Folhas principais da baía inferior */}
      <AcantoShape d={leafBotA}/>
      <AcantoShape d={leafBotC}/>
      <AcantoShape d={leafBotB} main/>

      {/* Sombra da haste (profundidade) */}
      <path d={STEM} fill="none" stroke={BAND_DARK} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>

      {/* Haste principal (caule do rinceaux) */}
      <path d={STEM} fill="none" stroke={MOTIF} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"/>
      {/* Haste fina interna (detalhe de entalhe) */}
      <path d={STEM_THIN} fill="none" stroke={INK} strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
      {/* Highlight convexo da haste */}
      <path d={STEM} fill="none" stroke={HIGHLIGHT} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity="0.45"/>

      {/* Volutas nos pontos de inflexão da haste */}
      {voluta(30, 8, 4.5)}
      {voluta(90, 52, 4.5)}

      {/* Linhas de moldura dupla (borda da faixa) */}
      <line x1="0" y1="1.5" x2={TW} y2="1.5" stroke={INK} strokeWidth="1.4"/>
      <line x1="0" y1="4.5" x2={TW} y2="4.5" stroke={INK} strokeWidth="0.45"/>
      <line x1="0" y1={TH - 1.5} x2={TW} y2={TH - 1.5} stroke={INK} strokeWidth="1.4"/>
      <line x1="0" y1={TH - 4.5} x2={TW} y2={TH - 4.5} stroke={INK} strokeWidth="0.45"/>
    </pattern>
  );
}

function PadRinceaux({ id }: { id: string }) {
  return (
    <svg width="100%" height="100%" style={{ display: "block" }}>
      <defs><RinceauxTile id={id}/></defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout de apresentação
// ─────────────────────────────────────────────────────────────────────────────
const CREAM    = "#f9f9f7";
const OVERFLOW = 28;
const SIDE_PAD = 44;

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

function Amostra({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 64, border: "1px solid #444", overflow: "hidden", marginBottom: 6, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0 }}>{children}</div>
      <div style={{ position: "absolute", top: 3, left: 7, fontSize: 5, letterSpacing: 1.5, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>
        amostra
      </div>
    </div>
  );
}

function FaixaComCaixas({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: OVERFLOW, overflow: "hidden", borderTop: "1.5px solid #333", borderBottom: "1.5px solid #333", zIndex: 0 }}>
        {children}
      </div>
      <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, padding: `0 ${SIDE_PAD}px` }}>
        <CaixaId titulo="Paciente" lado="esq" />
        <CaixaId titulo="Emitente" lado="dir" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ArabescoRinceaux() {
  const pad = <PadRinceaux id="rx1"/>;
  return (
    <div className="min-h-screen bg-stone-300 flex items-start justify-center p-6 py-8">
      <div style={{ width: 680, background: "#e5e5e2", border: "1px solid #888", boxShadow: "0 6px 28px rgba(0,0,0,0.22)" }}>
        {/* Cabeçalho */}
        <div style={{ background: "#111", color: "#fff", padding: "10px 20px", fontSize: 7.5, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Rinceaux de Acanto — Réplica Fiel do Padrão de Documento de Prestígio
        </div>
        <div style={{ background: "#333", color: "#ccc", padding: "4px 20px", fontSize: 6, letterSpacing: 1.5 }}>
          Haste S contínua · Baías com folhas de 3 lobos · Volutas nos inflexos · Moldura dupla
        </div>

        <div style={{ padding: "14px 20px" }}>

          {/* AMOSTRA PURA — tile exposto sem interrupção */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 6 }}>
              Amostra Pura — Padrão Contínuo
            </div>
            <Amostra><PadRinceaux id="rx-pure"/></Amostra>
          </div>

          {/* MOCK Receituário — FAIXA SIMPLES */}
          <div style={{ marginBottom: 20, background: "#fff", padding: "14px 20px" }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: "#222", textTransform: "uppercase", marginBottom: 10, borderBottom: "0.5px solid #ccc", paddingBottom: 4 }}>
              Aplicação: Faixa Única (identificação)
            </div>
            <FaixaComCaixas><PadRinceaux id="rx-s1"/></FaixaComCaixas>
          </div>

          {/* MOCK Receituário — FAIXA DUPLA */}
          <div style={{ marginBottom: 20, background: "#fff", padding: "14px 20px" }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: "#222", textTransform: "uppercase", marginBottom: 10, borderBottom: "0.5px solid #ccc", paddingBottom: 4 }}>
              Aplicação: Faixas Duplas (topo + rodapé)
            </div>
            {/* Faixa topo */}
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: OVERFLOW, overflow: "hidden", borderTop: "1.5px solid #333", borderBottom: "1.5px solid #333", zIndex: 0 }}>
                <PadRinceaux id="rx-d1"/>
              </div>
              <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, padding: `0 ${SIDE_PAD}px` }}>
                <CaixaId titulo="Paciente" lado="esq" />
                <CaixaId titulo="Emitente" lado="dir" />
              </div>
            </div>
            {/* Espaço de receituário */}
            <div style={{ height: 80, borderLeft: "0.5px solid #ccc", borderRight: "0.5px solid #ccc", padding: "8px 12px", background: "#fff" }}>
              <div style={{ fontSize: 7, color: "#555", borderBottom: "0.3px dashed #ccc", paddingBottom: 3, marginBottom: 5, fontStyle: "italic" }}>
                Rx — área de prescrição
              </div>
              <div style={{ fontSize: 6.5, color: "#777", lineHeight: 1.6 }}>
                1. Zolpidem 10 mg — Tomar 1 comprimido à noite · Qtde.: 30 comprimidos.<br/>
                2. Clonazepam 0,5 mg — Tomar 1 comprimido à noite · Qtde.: 30 comprimidos.
              </div>
            </div>
            {/* Faixa rodapé */}
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: OVERFLOW, left: 0, right: 0, bottom: OVERFLOW, overflow: "hidden", borderTop: "1.5px solid #333", borderBottom: "1.5px solid #333", zIndex: 0 }}>
                <PadRinceaux id="rx-d2"/>
              </div>
              <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, padding: `0 ${SIDE_PAD}px` }}>
                <CaixaId titulo="Comprador" lado="esq" />
                <CaixaId titulo="Farmácia" lado="dir" />
              </div>
            </div>
          </div>

          {/* MOCK — Faixa mais larga (altura 80px) */}
          <div style={{ marginBottom: 4, background: "#fff", padding: "14px 20px" }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: "#222", textTransform: "uppercase", marginBottom: 10, borderBottom: "0.5px solid #ccc", paddingBottom: 4 }}>
              Faixa Larga (80px de altura) — Mais impactante
            </div>
            <div style={{ height: 80, border: "1.5px solid #333", overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0 }}><PadRinceaux id="rx-lg"/></div>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 44px" }}>
                <div style={{ flex: 1, border: "0.7px solid rgba(255,255,255,0.6)", padding: "4px 10px", background: "rgba(249,249,247,0.92)" }}>
                  <div style={{ fontSize: 5.5, fontWeight: 800, letterSpacing: 2.5, color: "#555", textTransform: "uppercase", textAlign: "center", marginBottom: 3 }}>Paciente</div>
                  <div style={{ fontSize: 7, color: "#222" }}>Maria Fernanda Souza Almeida · CPF: 123.456.789-00</div>
                </div>
                <div style={{ width: 12 }}/>
                <div style={{ flex: 1, border: "0.7px solid rgba(255,255,255,0.6)", padding: "4px 10px", background: "rgba(249,249,247,0.92)" }}>
                  <div style={{ fontSize: 5.5, fontWeight: 800, letterSpacing: 2.5, color: "#555", textTransform: "uppercase", textAlign: "center", marginBottom: 3 }}>Emitente</div>
                  <div style={{ fontSize: 7, color: "#222" }}>Dr. Caio H. F. Pádua · CRM SP 125.475</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
