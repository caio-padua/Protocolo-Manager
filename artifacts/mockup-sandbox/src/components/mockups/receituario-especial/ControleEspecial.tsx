import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO DE CONTROLE ESPECIAL — v2 (referência Maison Primum)
// Arabesco = MOLDURA/BORDA ao redor dos dois boxes juntos (não fundo interno).
// Paciente à ESQUERDA, Emitente à DIREITA.
// Bloco de assinatura digital ICP-Brasil + QR à direita da assinatura.
// ─────────────────────────────────────────────────────────────────────────────

const AMBER      = "#b8860b";
const AMBER_DARK = "#6b4c08";
const CREAM      = "#fffdf6";
const INK        = "#111008";
const RULE       = "#d4b87a";
const BORDER_W   = 22; // largura da moldura arabesca em px

// ── SVG arabesco para tile de borda (padrão floral denso) ────────────────────
function ArabescoBorder({ vertical = false }: { vertical?: boolean }) {
  const tileSize = 22;
  const patId = vertical ? "arab-v" : "arab-h";
  return (
    <svg
      width={vertical ? tileSize : "100%"}
      height={vertical ? "100%" : tileSize}
      style={{ display: "block", flexShrink: 0 }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id={patId} x="0" y="0" width={tileSize} height={tileSize} patternUnits="userSpaceOnUse">
          {/* Losango principal */}
          <path d={`M${tileSize/2},1 L${tileSize-1},${tileSize/2} L${tileSize/2},${tileSize-1} L1,${tileSize/2}Z`}
            fill="none" stroke={AMBER_DARK} strokeWidth="0.6"/>
          {/* Pétala topo */}
          <path d={`M${tileSize/2},1 Q${tileSize/2+4},${tileSize/2-4} ${tileSize/2},${tileSize/2-3} Q${tileSize/2-4},${tileSize/2-4} ${tileSize/2},1Z`}
            fill="none" stroke={AMBER_DARK} strokeWidth="0.45"/>
          {/* Pétala base */}
          <path d={`M${tileSize/2},${tileSize-1} Q${tileSize/2+4},${tileSize/2+4} ${tileSize/2},${tileSize/2+3} Q${tileSize/2-4},${tileSize/2+4} ${tileSize/2},${tileSize-1}Z`}
            fill="none" stroke={AMBER_DARK} strokeWidth="0.45"/>
          {/* Pétala dir */}
          <path d={`M${tileSize-1},${tileSize/2} Q${tileSize/2+4},${tileSize/2+4} ${tileSize/2+3},${tileSize/2} Q${tileSize/2+4},${tileSize/2-4} ${tileSize-1},${tileSize/2}Z`}
            fill="none" stroke={AMBER_DARK} strokeWidth="0.45"/>
          {/* Pétala esq */}
          <path d={`M1,${tileSize/2} Q${tileSize/2-4},${tileSize/2-4} ${tileSize/2-3},${tileSize/2} Q${tileSize/2-4},${tileSize/2+4} 1,${tileSize/2}Z`}
            fill="none" stroke={AMBER_DARK} strokeWidth="0.45"/>
          {/* Ponto central */}
          <circle cx={tileSize/2} cy={tileSize/2} r="1.5" fill="none" stroke={AMBER_DARK} strokeWidth="0.45"/>
          <circle cx={tileSize/2} cy={tileSize/2} r="0.6" fill={AMBER_DARK} opacity="0.6"/>
          {/* Losango interno pequeno */}
          <path d={`M${tileSize/2},${tileSize/2-5} L${tileSize/2+5},${tileSize/2} L${tileSize/2},${tileSize/2+5} L${tileSize/2-5},${tileSize/2}Z`}
            fill="none" stroke={AMBER_DARK} strokeWidth="0.3" opacity="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patId})`} opacity="0.85"/>
    </svg>
  );
}

// ── Painel com moldura arabesca ao redor de todo o conteúdo ─────────────────
function PainelMoldura({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "relative", margin: "0 18px", marginBottom: 0 }}>
      {/* borda externa */}
      <div style={{
        border: `1px solid ${AMBER}`,
        outline: `2.5px solid ${AMBER_DARK}`,
        outlineOffset: -1,
      }}>
        {/* Faixa top arabesco */}
        <div style={{ height: BORDER_W, overflow: "hidden", background: CREAM }}>
          <ArabescoBorder />
        </div>
        {/* Meio: faixas laterais + conteúdo */}
        <div style={{ display: "flex" }}>
          <div style={{ width: BORDER_W, overflow: "hidden", background: CREAM }}>
            <ArabescoBorder vertical />
          </div>
          <div style={{ flex: 1, background: CREAM, padding: "8px 10px" }}>
            {children}
          </div>
          <div style={{ width: BORDER_W, overflow: "hidden", background: CREAM }}>
            <ArabescoBorder vertical />
          </div>
        </div>
        {/* Faixa bottom arabesco */}
        <div style={{ height: BORDER_W, overflow: "hidden", background: CREAM }}>
          <ArabescoBorder />
        </div>
      </div>
    </div>
  );
}

// ── Caixa de identificação individual ────────────────────────────────────────
function CaixaId({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{
      flex: 1,
      border: `0.5px solid ${AMBER}`,
      padding: "7px 9px",
      background: CREAM,
    }}>
      <div style={{
        fontSize: 6, fontWeight: 800, letterSpacing: 2.5, color: AMBER_DARK,
        textTransform: "uppercase", textAlign: "center",
        borderBottom: `0.4px solid ${RULE}`, paddingBottom: 4, marginBottom: 6,
      }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

function Linha({ label, valor, vazio, mini }: { label: string; valor?: string; vazio?: boolean; mini?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 3, fontSize: mini ? 6.5 : 7.5 }}>
      <span style={{ color: AMBER_DARK, fontSize: mini ? 6 : 6.5, flexShrink: 0, width: mini ? 64 : 76 }}>{label}</span>
      {vazio ? (
        <span style={{ flex: 1, borderBottom: `0.4px solid ${AMBER}`, minWidth: 40, marginLeft: 2 }} />
      ) : (
        <span style={{ flex: 1, color: INK, marginLeft: 2 }}>{valor}</span>
      )}
    </div>
  );
}

function DuplinhaVazia({ pairs }: { pairs: [string, string] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 3 }}>
      {pairs.map(l => (
        <div key={l} style={{ display: "flex", alignItems: "baseline", fontSize: 6.5 }}>
          <span style={{ color: AMBER_DARK, fontSize: 6, flexShrink: 0, marginRight: 3 }}>{l}</span>
          <span style={{ flex: 1, borderBottom: `0.4px solid ${AMBER}` }} />
        </div>
      ))}
    </div>
  );
}

// ── Ornamento divisor central ─────────────────────────────────────────────────
function Ornamento() {
  return (
    <div style={{ textAlign: "center", margin: "5px 0 4px" }}>
      <svg width="400" height="14" viewBox="0 0 400 14">
        <line x1="0" y1="7" x2="160" y2="7" stroke={RULE} strokeWidth="0.5"/>
        <path d="M164,7 L168,3 L172,7 L168,11Z" fill={AMBER} opacity="0.55"/>
        <path d="M180,7 L185,1 L190,7 L185,13Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.8"/>
        <circle cx="200" cy="7" r="2.2" fill={AMBER} opacity="0.7"/>
        <path d="M210,7 L215,1 L220,7 L215,13Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.8"/>
        <path d="M228,7 L232,3 L236,7 L232,11Z" fill={AMBER} opacity="0.55"/>
        <line x1="240" y1="7" x2="400" y2="7" stroke={RULE} strokeWidth="0.5"/>
      </svg>
    </div>
  );
}

// ── Símbolo Rx estilizado ─────────────────────────────────────────────────────
function RxSymbol() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 10 }}>
      <svg width="38" height="38" viewBox="0 0 38 38">
        <text x="2" y="32" fontFamily="Georgia, serif" fontSize="36" fontWeight="700"
          fill="none" stroke={INK} strokeWidth="1.2">R</text>
        <text x="2" y="32" fontFamily="Georgia, serif" fontSize="36" fontWeight="700"
          fill={INK} opacity="0.9">R</text>
        <text x="25" y="34" fontFamily="Georgia, serif" fontSize="14" fontWeight="700" fill={INK}>x</text>
      </svg>
    </div>
  );
}

// ── Item de prescrição ────────────────────────────────────────────────────────
function ItemRx({
  n, nome, posologia, obs, qtd,
}: { n: number; nome: string; posologia: string; obs?: string; qtd: string }) {
  return (
    <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: `0.3px dashed ${RULE}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 800, color: INK, flexShrink: 0 }}>{n}.</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: INK, flex: 1, lineHeight: 1.3 }}>{nome}</span>
        <span style={{ fontSize: 6.5, color: "#777", whiteSpace: "nowrap" }}>{qtd}</span>
      </div>
      <div style={{ paddingLeft: 15, fontSize: 7.5, color: "#333", lineHeight: 1.7, marginTop: 2 }}>
        <em>{posologia}</em>
      </div>
      {obs && (
        <div style={{ paddingLeft: 15, fontSize: 6.5, color: AMBER_DARK, lineHeight: 1.5 }}>
          {obs}
        </div>
      )}
    </div>
  );
}

// ── Bloco de assinatura digital ICP-Brasil ───────────────────────────────────
function BlocoAssinaturaDigital() {
  return (
    <div style={{
      border: `0.5px solid ${RULE}`,
      padding: "7px 9px",
      background: "#fefcf3",
      flex: 1,
      fontSize: 6.5,
      color: INK,
    }}>
      <div style={{
        fontSize: 6, fontWeight: 800, letterSpacing: 2, color: AMBER_DARK,
        textTransform: "uppercase", marginBottom: 5, borderBottom: `0.3px solid ${RULE}`, paddingBottom: 3,
      }}>
        Documento Assinado Eletronicamente
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, lineHeight: 1.8 }}>
          <div><span style={{ color: AMBER_DARK }}>Assinante: </span>CAIO HENRIQUE FERNANDES PÁDUA · CPF: ***·293.***-**</div>
          <div><span style={{ color: AMBER_DARK }}>Certificado: </span>ICP-Brasil · AC SingularID Múltipla G7</div>
          <div><span style={{ color: AMBER_DARK }}>Assinado em: </span>20/07/2026, 09:14:22 · <span style={{ color: AMBER_DARK }}>Padrão: </span>PAdES</div>
          <div><span style={{ color: AMBER_DARK }}>Nº de Série: </span>2B6C-7F9A-5D31-9C4E</div>
          <div><span style={{ color: AMBER_DARK }}>Validade: </span>22/07/2025 a 22/07/2028</div>
          <div style={{ marginTop: 4, color: "#888", fontSize: 6 }}>
            Confira em: <span style={{ color: AMBER_DARK }}>https://verificador.iti.gov.br</span>
          </div>
        </div>
        {/* QR code placeholder */}
        <div style={{
          width: 44, height: 44, flexShrink: 0,
          border: `0.5px solid ${RULE}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="38" height="38" viewBox="0 0 38 38">
            {/* QR simulado com padrão de células */}
            {[0,1,2,3,4,5,6].map(r => [0,1,2,3,4,5,6].map(c => {
              const isCorner = (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2);
              const isDark = isCorner || (r === 0 || r === 6 || c === 0 || c === 6)
                ? true
                : ((r * 7 + c) * 13) % 5 < 2;
              return isDark ? (
                <rect key={`${r}-${c}`}
                  x={2 + c * 5} y={2 + r * 5} width={4} height={4}
                  fill={INK} opacity="0.85" rx="0.3"/>
              ) : null;
            }))}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ControleEspecial() {
  return (
    <div className="min-h-screen bg-stone-100 flex items-start justify-center p-6 py-8">
      <div style={{
        width: 640,
        background: CREAM,
        fontFamily: '"Arial", "Helvetica Neue", sans-serif',
        fontSize: 9,
        color: INK,
        border: `1.5px solid ${AMBER_DARK}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
      }}>

        {/* ── TARJA SUPERIOR LISTRADA ── */}
        <div style={{
          height: 10,
          background: `repeating-linear-gradient(90deg, ${AMBER} 0px, ${AMBER} 6px, #e8c565 6px, #e8c565 12px)`,
        }}/>

        {/* ── CABEÇALHO ── */}
        <div style={{ padding: "14px 22px 8px", borderBottom: `0.5px solid ${RULE}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>

            {/* Nome da clínica em estilo Cinzel */}
            <div>
              <div style={{
                fontSize: 18, fontFamily: "Georgia, 'Times New Roman', serif",
                fontWeight: 400, letterSpacing: 3, color: INK,
                fontVariant: "small-caps",
              }}>
                Instituto Pádua
              </div>
              <div style={{ fontSize: 6.5, letterSpacing: 3.5, color: AMBER_DARK, marginTop: 2 }}>
                Medicina Integrativa e Longevidade
              </div>
              <div style={{ width: 120, borderBottom: `0.4px solid ${RULE}`, margin: "4px 0" }}/>
              <div style={{ fontSize: 6, color: "#666", lineHeight: 1.7 }}>
                <div>Dr. Caio Henrique Fernandes Pádua · CRM/SP 125.475 · RQE 12.547</div>
                <div>Rua Guaxupé, 327 · Vila Formosa · São Paulo/SP · CEP 03371-010</div>
                <div>Tel. (11) 3209-4400 · padcon.com.br</div>
              </div>
            </div>

            {/* Número + vias */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 800, color: AMBER_DARK, letterSpacing: 1, marginBottom: 6 }}>
                RCE-2026-0073
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{
                  background: AMBER_DARK, color: "#fff",
                  padding: "2px 10px", fontSize: 6.5, fontWeight: 700, letterSpacing: 1, textAlign: "center",
                }}>
                  1ª VIA — FARMÁCIA
                </span>
                <span style={{
                  border: `0.5px solid ${AMBER}`, color: AMBER_DARK,
                  padding: "2px 10px", fontSize: 6.5, textAlign: "center",
                }}>
                  2ª VIA — RETENÇÃO
                </span>
              </div>
            </div>
          </div>

          <Ornamento />

          {/* Título */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 12, fontWeight: 900, letterSpacing: 5, color: INK, textTransform: "uppercase",
            }}>
              Receituário de Controle Especial
            </div>
            <div style={{ fontSize: 6.5, color: AMBER_DARK, letterSpacing: 1.5, marginTop: 2 }}>
              Portaria SVS/MS N.º 344/1998 · Lista C1 · Validade: 30 dias
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAINEL 1 — MOLDURA ARABESCA ao redor de Paciente + Emitente
            Paciente ESQUERDA | Emitente DIREITA
        ════════════════════════════════════════════════════════════════ */}
        <div style={{ padding: "10px 0 0" }}>
          <PainelMoldura>
            <div style={{ display: "flex", gap: 10 }}>

              {/* PACIENTE — ESQUERDA */}
              <CaixaId titulo="Identificação do Paciente">
                <Linha label="Nome" valor="Maria Fernanda Souza Almeida" />
                <Linha label="CPF" valor="123.456.789-00" />
                <Linha label="Data Nasc." valor="15/03/1988" />
                <Linha label="Endereço" valor="Rua das Acácias, 250 · Apto. 42" />
                <Linha label="Bairro" valor="Jardim Paulista · CEP: 01407-010" />
                <Linha label="Cidade/UF" valor="São Paulo / SP" />
                <Linha label="Telefone" valor="(11) 98765-4321" />
              </CaixaId>

              {/* EMITENTE — DIREITA */}
              <CaixaId titulo="Identificação do Emitente">
                <Linha label="Nome" valor="Dr. Caio Henrique Fernandes Pádua" />
                <Linha label="CRM" valor="SP 125.475 · RQE: 56789" />
                <Linha label="Especialidade" valor="Medicina Integrativa" />
                <Linha label="Endereço" valor="Rua Guaxupé, 327 · Vila Formosa" />
                <Linha label="Bairro" valor="Vila Formosa · CEP: 03371-010" />
                <Linha label="Cidade/UF" valor="São Paulo / SP" />
                <Linha label="Telefone" valor="(11) 3209-4400" />
              </CaixaId>

            </div>
          </PainelMoldura>
        </div>

        {/* ── PRESCRIÇÃO ── */}
        <div style={{ padding: "14px 22px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <RxSymbol />
          </div>

          <ItemRx
            n={1} nome="Zolpidem 10 mg — Comprimido"
            posologia="Tomar 1 comprimido à noite por sete dias; a partir do oitavo dia, 1 comprimido à noite."
            qtd="Qtde.: 30 comprimidos."
          />
          <ItemRx
            n={2} nome="Clonazepam 0,5 mg — Comprimido"
            posologia="Tomar 1 comprimido à noite."
            qtd="Qtde.: 30 comprimidos."
          />
          <ItemRx
            n={3} nome="Anastrozol 0,5 mg — Cápsula"
            posologia="1 cápsula 2x por semana."
            qtd="Qtde.: 8 cápsulas."
          />
          <ItemRx
            n={4} nome="Silimarina 150 mg — Cápsula"
            posologia="1 cápsula antes do almoço."
            qtd="Qtde.: 30 cápsulas."
          />
        </div>

        {/* ── DATA + ASSINATURA + BLOCO DIGITAL ── */}
        <div style={{ padding: "4px 22px 14px" }}>
          <div style={{ fontSize: 7.5, color: "#555", marginBottom: 10 }}>
            São Paulo, 20 de julho de 2026.
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
            {/* Assinatura manuscrita + identificação */}
            <div style={{ minWidth: 170, textAlign: "center" }}>
              {/* Assinatura cursiva SVG simulada */}
              <svg width="160" height="32" viewBox="0 0 160 32" style={{ display: "block", marginBottom: 2 }}>
                <path d="M10,22 C20,10 30,28 45,16 C55,8 62,24 75,14 C85,6 92,22 108,12 C118,5 126,20 140,14 C148,10 153,18 158,22"
                  fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ borderTop: `0.5px solid ${INK}`, paddingTop: 3 }}>
                <div style={{ fontSize: 7.5, fontWeight: 700 }}>Dr. Caio Henrique Fernandes Pádua</div>
                <div style={{ fontSize: 6, color: "#666", letterSpacing: 0.5 }}>CRM SP 125.475 · RQE 56789</div>
                <div style={{ fontSize: 5.5, letterSpacing: 1.5, color: AMBER_DARK, textTransform: "uppercase" }}>
                  Medicina Integrativa
                </div>
              </div>
            </div>

            {/* Bloco ICP-Brasil */}
            <BlocoAssinaturaDigital />
          </div>
        </div>

        {/* ── AVISO LEGAL ── */}
        <div style={{
          margin: "0 22px 10px",
          padding: "4px 10px",
          border: `0.5px solid ${AMBER}`,
          background: "#fffbec",
          fontSize: 6.5, color: AMBER_DARK, lineHeight: 1.5,
        }}>
          ⚠ Medicamento sujeito a controle especial — Portaria SVS/MS 344/1998 · Lista C1<br/>
          Conservar em local seco, fresco e fora do alcance de crianças. Não tomar mais do que o prescrito.
        </div>

        {/* ── BARRA RETENÇÃO ── */}
        <div style={{
          background: AMBER_DARK, padding: "5px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 6.5, fontWeight: 800, letterSpacing: 3, color: "#fff", textTransform: "uppercase" }}>
            Retenção — Farmácia / Dispensário
          </div>
          <div style={{ fontSize: 6, color: "rgba(255,255,255,0.7)" }}>
            Preencher no ato da dispensação
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PAINEL 2 — MOLDURA ARABESCA ao redor de Comprador + Fornecedor
        ════════════════════════════════════════════════════════════════ */}
        <div style={{ padding: "10px 0 0" }}>
          <PainelMoldura>
            <div style={{ display: "flex", gap: 10 }}>

              {/* COMPRADOR — ESQUERDA */}
              <CaixaId titulo="Identificação do Comprador">
                <Linha label="Nome completo" valor="Maria Fernanda Souza Almeida" />
                <Linha label="Endereço" valor="Rua das Acácias, 250 · Apto. 42" />
                <DuplinhaVazia pairs={["Cidade / UF", "Telefone"]} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 3, alignItems: "baseline" }}>
                  <div style={{ display: "flex", alignItems: "baseline", fontSize: 6.5 }}>
                    <span style={{ color: AMBER_DARK, fontSize: 6, marginRight: 3 }}>Ident.</span>
                    <span style={{ flex: 1, borderBottom: `0.4px solid ${AMBER}` }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", fontSize: 6.5 }}>
                    <span style={{ color: AMBER_DARK, fontSize: 6, marginRight: 3, whiteSpace: "nowrap" }}>Org. Emissor</span>
                    <span style={{ width: 40, borderBottom: `0.4px solid ${AMBER}` }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", fontSize: 7, marginBottom: 3 }}>
                  <span style={{ color: AMBER_DARK, fontSize: 6, marginRight: 4 }}>Data:</span>
                  <span style={{ borderBottom: `0.4px solid ${AMBER}`, flex: 1 }}>
                    ______ / ______ / __________
                  </span>
                </div>
              </CaixaId>

              {/* FORNECEDOR — DIREITA */}
              <CaixaId titulo="Identificação do Fornecedor / Farmácia">
                <div style={{ fontSize: 7.5, fontWeight: 700, color: INK, marginBottom: 4 }}>
                  Farmácia / Dispensário
                </div>
                <Linha label="Razão Social" valor="Farmácia Santé Manipulação" mini />
                <DuplinhaVazia pairs={["CNPJ", "CRF"]} />
                <Linha label="Endereço" valor="Alameda Santos, 1234" mini />
                <DuplinhaVazia pairs={["Bairro / CEP", "Telefone"]} />
                <div style={{ marginTop: 6 }}>
                  <div style={{ borderBottom: `0.4px solid ${INK}`, marginBottom: 2 }}/>
                  <div style={{ fontSize: 6.5, color: AMBER_DARK }}>Assinatura do Farmacêutico Responsável</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", fontSize: 7, marginTop: 4 }}>
                  <span style={{ color: AMBER_DARK, fontSize: 6, marginRight: 4 }}>Data:</span>
                  <span style={{ borderBottom: `0.4px solid ${AMBER}`, flex: 1 }}>______ / ______ / __</span>
                </div>
              </CaixaId>

            </div>
          </PainelMoldura>
        </div>

        {/* ── RODAPÉ ── */}
        <div style={{
          padding: "8px 22px",
          borderTop: `0.5px solid ${RULE}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 10,
        }}>
          <div style={{ fontSize: 5.8, color: "#999", lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: "#777" }}>Instituto Pádua — Medicina Integrativa e Longevidade</div>
            <div>Rua Guaxupé, 327 · Vila Formosa · São Paulo/SP · CEP 03371-010</div>
            <div>Tel. (11) 3209-4400 · contato@padcon.com.br · padcon.com.br</div>
          </div>

          {/* PAXTER logo */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {/* Hexágono símbolo */}
            <svg width="28" height="28" viewBox="0 0 28 28" style={{ display: "block", marginLeft: "auto", marginBottom: 2 }}>
              <polygon points="14,2 25,8 25,20 14,26 3,20 3,8"
                fill="none" stroke={AMBER_DARK} strokeWidth="1.2"/>
              <polygon points="14,6 21.5,10 21.5,18 14,22 6.5,18 6.5,10"
                fill="none" stroke={AMBER_DARK} strokeWidth="0.6" opacity="0.6"/>
              <circle cx="14" cy="14" r="3" fill={AMBER_DARK} opacity="0.7"/>
            </svg>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 3, color: AMBER_DARK, lineHeight: 1 }}>
              PAXTER
            </div>
            <div style={{ fontSize: 5, letterSpacing: 1.5, color: "#bbb", marginTop: 1 }}>
              CLINICAL INTELLIGENCE SYSTEM
            </div>
          </div>
        </div>

        {/* ── TARJA INFERIOR ── */}
        <div style={{
          height: 8,
          background: `repeating-linear-gradient(90deg, ${AMBER} 0px, ${AMBER} 6px, #e8c565 6px, #e8c565 12px)`,
        }}/>
      </div>
    </div>
  );
}
