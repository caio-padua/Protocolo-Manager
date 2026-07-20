import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO DE CONTROLE ESPECIAL — Painel Arabesco Integral
// Conceito CEO: os retângulos de identificação ficam SOBRE o fundo de arabesco,
// não abaixo dele em altura. O arabesco é position:absolute cobrindo todo o
// painel; as caixas brancas flutuam em cima (zIndex 2).
// ─────────────────────────────────────────────────────────────────────────────

const AMBER = "#c8950a";
const AMBER_DARK = "#7a5219";
const AMBER_LIGHT = "#f5d060";
const INK = "#1a1209";
const GOLD_RULE = "#d4b87a";

// SVG arabesco rico — losangos entrelaçados + pétalas curvas + roseta central
function ArabescoSvg({ id }: { id: string }) {
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.11 }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id={id} x="0" y="0" width="70" height="70" patternUnits="userSpaceOnUse">
          {/* Losango externo */}
          <path d="M35,2 L68,35 L35,68 L2,35 Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.7"/>
          {/* Losango interno */}
          <path d="M35,14 L56,35 L35,56 L14,35 Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.55"/>
          {/* Roseta central: 8 pétalas */}
          <path d="M35,14 Q42,21 35,28 Q28,21 35,14Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.5"/>
          <path d="M56,35 Q49,42 42,35 Q49,28 56,35Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.5"/>
          <path d="M35,56 Q28,49 35,42 Q42,49 35,56Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.5"/>
          <path d="M14,35 Q21,28 28,35 Q21,42 14,35Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.5"/>
          {/* Diagonais */}
          <path d="M14,14 Q26,24 28,35" fill="none" stroke={AMBER_DARK} strokeWidth="0.35" opacity="0.6"/>
          <path d="M56,14 Q44,24 42,35" fill="none" stroke={AMBER_DARK} strokeWidth="0.35" opacity="0.6"/>
          <path d="M14,56 Q26,46 28,35" fill="none" stroke={AMBER_DARK} strokeWidth="0.35" opacity="0.6"/>
          <path d="M56,56 Q44,46 42,35" fill="none" stroke={AMBER_DARK} strokeWidth="0.35" opacity="0.6"/>
          {/* Ponto central */}
          <circle cx="35" cy="35" r="2.2" fill="none" stroke={AMBER_DARK} strokeWidth="0.5"/>
          <circle cx="35" cy="35" r="0.8" fill={AMBER_DARK} opacity="0.5"/>
          {/* Pontos de canto */}
          <circle cx="0" cy="0" r="1.2" fill="none" stroke={AMBER_DARK} strokeWidth="0.4" opacity="0.5"/>
          <circle cx="70" cy="0" r="1.2" fill="none" stroke={AMBER_DARK} strokeWidth="0.4" opacity="0.5"/>
          <circle cx="0" cy="70" r="1.2" fill="none" stroke={AMBER_DARK} strokeWidth="0.4" opacity="0.5"/>
          <circle cx="70" cy="70" r="1.2" fill="none" stroke={AMBER_DARK} strokeWidth="0.4" opacity="0.5"/>
          {/* Filetes de conexão entre vértices do losango e cantos */}
          <path d="M2,35 Q1,18 0,0" fill="none" stroke={AMBER_DARK} strokeWidth="0.25" opacity="0.4"/>
          <path d="M35,2 Q52,1 70,0" fill="none" stroke={AMBER_DARK} strokeWidth="0.25" opacity="0.4"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// Painel arabesco: fundo absoluto + caixas flutuando em cima
function PainelArabesco({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div style={{ position: "relative", borderBottom: `0.5px solid ${GOLD_RULE}` }}>
      <ArabescoSvg id={id} />
      <div style={{
        display: "flex", gap: 10, padding: "10px 14px",
        position: "relative", zIndex: 2
      }}>
        {children}
      </div>
    </div>
  );
}

// Caixa individual de identificação com fundo quase-opaco
function CaixaId({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{
      flex: 1,
      background: "rgba(255,253,246,0.92)",
      border: `0.6px solid ${AMBER}`,
      padding: "8px 10px",
      backdropFilter: "blur(2px)",
    }}>
      <div style={{
        fontSize: 6, fontWeight: 800, letterSpacing: 3,
        color: AMBER_DARK, marginBottom: 6, textTransform: "uppercase",
        borderBottom: `0.4px solid ${GOLD_RULE}`, paddingBottom: 3,
      }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

function Linha({ label, valor, vazio }: { label: string; valor?: string; vazio?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 3.5, fontSize: 7.5 }}>
      <span style={{ color: AMBER_DARK, fontSize: 6.5, flexShrink: 0, width: 72 }}>{label}</span>
      {vazio ? (
        <span style={{ flex: 1, borderBottom: `0.4px solid ${AMBER}`, minWidth: 40, marginLeft: 2 }} />
      ) : (
        <span style={{ flex: 1, color: INK, marginLeft: 2 }}>{valor}</span>
      )}
    </div>
  );
}

function DuplinhaVazia({ labels }: { labels: [string, string] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 3.5 }}>
      {labels.map(l => (
        <div key={l} style={{ display: "flex", alignItems: "baseline", fontSize: 7 }}>
          <span style={{ color: AMBER_DARK, fontSize: 6.5, flexShrink: 0, marginRight: 3 }}>{l}</span>
          <span style={{ flex: 1, borderBottom: `0.4px solid ${AMBER}` }} />
        </div>
      ))}
    </div>
  );
}

// Ornamento central SVG
function Ornamento({ cor = AMBER }: { cor?: string }) {
  return (
    <div style={{ textAlign: "center", margin: "6px 0 3px" }}>
      <svg width="440" height="14" viewBox="0 0 440 14">
        <line x1="0" y1="7" x2="185" y2="7" stroke={cor} strokeWidth="0.5"/>
        <path d="M189,7 L193,3 L197,7 L193,11Z" fill={cor} opacity="0.55"/>
        <path d="M205,7 L210,1 L215,7 L210,13Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.8"/>
        <circle cx="220" cy="7" r="2" fill={cor} opacity="0.7"/>
        <path d="M225,7 L230,1 L235,7 L230,13Z" fill="none" stroke={AMBER_DARK} strokeWidth="0.8"/>
        <path d="M243,7 L247,3 L251,7 L247,11Z" fill={cor} opacity="0.55"/>
        <line x1="255" y1="7" x2="440" y2="7" stroke={cor} strokeWidth="0.5"/>
      </svg>
    </div>
  );
}

export function ControleEspecial() {
  return (
    <div className="min-h-screen bg-amber-50 flex items-start justify-center p-6 py-8">
      <div style={{
        width: 636,
        background: "#fffdf6",
        fontFamily: '"Arial", sans-serif',
        fontSize: 9,
        color: INK,
        border: `1.5px solid ${AMBER_DARK}`,
        boxShadow: "0 6px 28px rgba(0,0,0,0.22)",
      }}>

        {/* ── TARJA SUPERIOR (identidade visual do Controle Especial) ── */}
        <div style={{ height: 8, background: `repeating-linear-gradient(90deg, ${AMBER} 0px, ${AMBER} 5px, ${AMBER_LIGHT} 5px, ${AMBER_LIGHT} 10px)` }}/>

        {/* ── CABEÇALHO ── */}
        <div style={{ padding: "11px 18px 9px", borderBottom: `0.5px solid ${GOLD_RULE}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 900, letterSpacing: 2, color: INK, textTransform: "uppercase", fontFamily: "Arial Black, Arial" }}>
                INSTITUTO PÁDUA
              </div>
              <div style={{ fontSize: 7, letterSpacing: 2.5, color: AMBER_DARK, marginTop: 2 }}>
                Endocrinologia · Medicina Integrativa · Longevidade
              </div>
              <div style={{ fontSize: 6.5, color: "#666", marginTop: 2.5 }}>
                Dr. Caio Henrique Fernandes Pádua · CRM/SP 125.475 · RQE 12.547
              </div>
              <div style={{ fontSize: 6.5, color: "#666" }}>
                Rua Guaxupé, 327 · Vila Formosa · São Paulo/SP · CEP 03371-010
              </div>
              <div style={{ fontSize: 6.5, color: "#666" }}>
                Tel. (11) 3209-4400 · padcon.com.br
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 800, color: AMBER_DARK, letterSpacing: 1, marginBottom: 5 }}>
                RCE-2026-0073
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ background: AMBER, color: "#fff", padding: "2px 8px", fontSize: 6.5, fontWeight: 700, letterSpacing: 1, textAlign: "center" }}>
                  1ª VIA — FARMÁCIA
                </span>
                <span style={{ border: `0.5px solid ${AMBER}`, color: AMBER_DARK, padding: "2px 8px", fontSize: 6.5, textAlign: "center" }}>
                  2ª VIA — RETENÇÃO
                </span>
              </div>
            </div>
          </div>

          <Ornamento />

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 4, color: INK, textTransform: "uppercase" }}>
              RECEITUÁRIO DE CONTROLE ESPECIAL
            </div>
            <div style={{ fontSize: 6.5, color: AMBER_DARK, letterSpacing: 1.5, marginTop: 2 }}>
              PORTARIA SVS/MS N.º 344/1998 · LISTA C1 · VALIDADE: 30 DIAS
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            PAINEL 1 — EMITENTE + PACIENTE flutuando sobre arabesco
        ═══════════════════════════════════════════════════════════ */}
        <PainelArabesco id="arab-emit-pac">
          <CaixaId titulo="Identificação do Emitente">
            <div style={{ fontSize: 8, fontWeight: 700, color: INK, marginBottom: 5 }}>
              PROFISSIONAL PRESCRITOR
            </div>
            <Linha label="Nome" valor="Dr. Caio Henrique Fernandes Pádua" />
            <Linha label="Especialidade" valor="Endocrinologia · Med. Integrativa" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 3.5 }}>
              <Linha label="CRM/SP" valor="125.475" />
              <Linha label="RQE" valor="12.547" />
            </div>
            <Linha label="Endereço" valor="Rua Guaxupé, 327 · Vila Formosa" />
            <Linha label="Cidade/UF" valor="São Paulo / SP" />
            <Linha label="Tel." valor="(11) 3209-4400" />
          </CaixaId>

          <CaixaId titulo="Identificação do Paciente">
            <div style={{ fontSize: 8, fontWeight: 700, color: INK, marginBottom: 5 }}>
              DADOS DO PACIENTE
            </div>
            <Linha label="Nome" valor="Marina Oliveira da Silva Ferreira" />
            <Linha label="Data Nasc." valor="12/03/1985 · (41 anos)" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 3.5 }}>
              <Linha label="CPF" valor="456.789.012-34" />
              <Linha label="RG" valor="42.891.234-7" />
            </div>
            <Linha label="Endereço" valor="Av. Paulista, 1578 · Ap. 82" />
            <Linha label="Cidade/UF" valor="São Paulo / SP" />
            <Linha label="Tel." valor="(11) 98765-4321" />
          </CaixaId>
        </PainelArabesco>

        {/* ── PRESCRIÇÃO ── */}
        <div style={{ padding: "11px 18px", borderBottom: `0.5px solid ${GOLD_RULE}` }}>
          <div style={{ fontSize: 6, fontWeight: 800, letterSpacing: 3.5, color: AMBER_DARK, marginBottom: 9, textTransform: "uppercase" }}>
            Prescrição Médica
          </div>

          {/* Item 1 */}
          <div style={{ marginBottom: 11 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: INK }}>1.</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: INK }}>
                CLONAZEPAM 0,5 mg — Comprimido
              </span>
              <span style={{ fontSize: 7, color: "#888", marginLeft: "auto", whiteSpace: "nowrap" }}>
                Qtd.: 30 (trinta) comprimidos
              </span>
            </div>
            <div style={{ paddingLeft: 18, fontSize: 8, color: "#333", lineHeight: 1.7 }}>
              Tomar 1 (um) comprimido por via oral, 1 vez ao dia, à noite antes de dormir.
              <br />
              <span style={{ color: AMBER_DARK, fontSize: 7 }}>
                Obs.: Não interromper abruptamente. Retorno em 30 dias.
              </span>
            </div>
          </div>

          {/* Item 2 */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: INK }}>2.</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: INK }}>
                ALPRAZOLAM 0,25 mg — Comprimido
              </span>
              <span style={{ fontSize: 7, color: "#888", marginLeft: "auto", whiteSpace: "nowrap" }}>
                Qtd.: 15 (quinze) comprimidos
              </span>
            </div>
            <div style={{ paddingLeft: 18, fontSize: 8, color: "#333", lineHeight: 1.7 }}>
              Tomar 1 (um) comprimido por via oral, se necessário (S.O.S.), máximo 1 vez ao dia.
              <br />
              <span style={{ color: AMBER_DARK, fontSize: 7 }}>
                Obs.: Uso eventual para crises. Evitar ingestão de bebidas alcoólicas.
              </span>
            </div>
          </div>

          {/* Assinatura */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18 }}>
            <div style={{ fontSize: 7.5, color: "#555" }}>
              São Paulo, 20 de julho de 2026
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: `0.5px solid ${INK}`, width: 176, marginBottom: 3 }}/>
              <div style={{ fontSize: 8, fontWeight: 700 }}>Dr. Caio Henrique Fernandes Pádua</div>
              <div style={{ fontSize: 6.5, color: "#666" }}>CRM/SP 125.475 · RQE 12.547</div>
            </div>
          </div>

          {/* Aviso legal */}
          <div style={{
            marginTop: 12, padding: "4px 10px",
            border: `0.5px solid ${AMBER}`,
            background: "#fffbec",
            fontSize: 6.5, color: AMBER_DARK,
            lineHeight: 1.5,
          }}>
            ⚠ MEDICAMENTO SUJEITO A CONTROLE ESPECIAL — PORTARIA SVS/MS 344/1998 · LISTA C1
            <br/>
            Conservar em local seco, fresco e fora do alcance de crianças. Não tomar mais do que o prescrito.
          </div>
        </div>

        {/* ── DIVISOR RETENÇÃO FARMÁCIA ── */}
        <div style={{
          background: AMBER, padding: "5px 18px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: 3, color: "#fff", textTransform: "uppercase" }}>
            Retenção — Farmácia / Dispensário
          </div>
          <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.8)" }}>
            Preencher no ato da dispensação
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            PAINEL 2 — COMPRADOR + FORNECEDOR flutuando sobre arabesco
        ═══════════════════════════════════════════════════════════ */}
        <PainelArabesco id="arab-comp-forn">
          <CaixaId titulo="Identificação do Comprador">
            <Linha label="Nome completo" vazio />
            <Linha label="Endereço" vazio />
            <DuplinhaVazia labels={["Cidade / UF", "Telefone"]} />
            <DuplinhaVazia labels={["RG / CNH", "Órgão emissor"]} />
            <div style={{ marginTop: 5, fontSize: 7 }}>
              <span style={{ color: AMBER_DARK }}>Data: </span>
              <span style={{ borderBottom: `0.4px solid ${AMBER}`, paddingRight: 72, fontSize: 7.5 }}>
                _______ / _______ / ___________
              </span>
            </div>
          </CaixaId>

          <CaixaId titulo="Identificação do Fornecedor">
            <div style={{ fontSize: 7.5, fontWeight: 700, color: INK, marginBottom: 5 }}>
              FARMÁCIA / DISPENSÁRIO
            </div>
            <div style={{
              height: 44,
              border: `0.5px dashed ${AMBER}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 8,
            }}>
              <span style={{ fontSize: 6.5, color: "#bbb", letterSpacing: 1 }}>
                CARIMBO DA FARMÁCIA
              </span>
            </div>
            <div style={{ borderTop: `0.4px solid ${GOLD_RULE}`, paddingTop: 4, marginBottom: 10 }}>
              <div style={{ fontSize: 6.5, color: AMBER_DARK, marginBottom: 12 }}>
                Assinatura do Farmacêutico Responsável
              </div>
              <div style={{ borderBottom: `0.4px solid ${INK}`, marginBottom: 3 }}/>
              <div style={{ fontSize: 7, color: AMBER_DARK }}>CRF/SP ____________</div>
            </div>
            <div style={{ fontSize: 7 }}>
              <span style={{ color: AMBER_DARK }}>Data: </span>
              <span style={{ borderBottom: `0.4px solid ${AMBER}`, paddingRight: 60 }}>
                _______ / _______ / ___________
              </span>
            </div>
          </CaixaId>
        </PainelArabesco>

        {/* ── RODAPÉ ── */}
        <div style={{
          padding: "5px 18px",
          borderTop: `0.5px solid ${GOLD_RULE}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 6, color: "#999", lineHeight: 1.7 }}>
            <div>INSTITUTO PÁDUA · Rua Guaxupé, 327 · Vila Formosa · São Paulo · SP · CEP 03371-010</div>
            <div>Tel. (11) 3209-4400 · Verificação digital: PARXIS.APP/RCE/2026-0073</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 3, color: AMBER_DARK, fontFamily: "Georgia, serif" }}>
              PARXIS
            </div>
            <div style={{ fontSize: 5.5, letterSpacing: 1.5, color: "#bbb", marginTop: 1 }}>
              CLINICAL INTELLIGENCE SYSTEM
            </div>
          </div>
        </div>

        {/* ── TARJA INFERIOR ── */}
        <div style={{ height: 6, background: `repeating-linear-gradient(90deg, ${AMBER} 0px, ${AMBER} 5px, ${AMBER_LIGHT} 5px, ${AMBER_LIGHT} 10px)` }}/>
      </div>
    </div>
  );
}
