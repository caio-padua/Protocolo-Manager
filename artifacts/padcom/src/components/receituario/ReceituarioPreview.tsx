// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO PREVIEW — Layout completo do receituário médico
// Usado tanto no preview da tela (scale 0.55) quanto na impressão (1:1)
// Spec: specs/receituario-designer-v2.md
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { type ReceituarioConfig } from "@/lib/arabesques/receituario-config";
import { ArabesqueBand } from "@/lib/arabesques/ArabesqueBand";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCampos(s: string): string[] {
  return s.split(",").map(f => f.trim()).filter(Boolean);
}

// ── Linha decorativa (Kaizen C) ───────────────────────────────────────────────
function LinhaDecorativa({ estilo }: { estilo: ReceituarioConfig["linhaEstiloCabecalho"] }) {
  if (estilo === "dupla") return (
    <div style={{ margin: "3mm 0", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ borderTop: "0.6px solid #bbb", width: "100%" }}/>
      <div style={{ borderTop: "0.3px solid #ddd", width: "100%" }}/>
    </div>
  );
  if (estilo === "ornamentada") return (
    <div style={{ margin: "3mm 0", display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, borderTop: "0.5px solid #bbb" }}/>
      <span style={{ fontSize: 8, color: "#bbb", letterSpacing: 2 }}>❧</span>
      <div style={{ flex: 1, borderTop: "0.5px solid #bbb" }}/>
    </div>
  );
  return <div style={{ margin: "3mm 0", borderTop: "0.5px solid #ccc" }}/>;
}

// ── Box de identificação (dentro da faixa) ────────────────────────────────────
function IdentBox({ titulo, campos, faixinha, faixinhaCor, borderWidth }: {
  titulo: string; campos: string[];
  faixinha: boolean; faixinhaCor: string; borderWidth: number;
}) {
  return (
    <div style={{
      position: "relative", zIndex: 2,
      background: "#ffffff",
      border: `${borderWidth}px solid #454545`,
      borderRadius: 1,
      borderLeft: faixinha ? `${Math.max(borderWidth, 3)}px solid ${faixinhaCor}` : `${borderWidth}px solid #454545`,
      padding: "3mm 4mm",
      boxShadow: "0.4mm 0.4mm 0 rgba(0,0,0,0.05)",
    }}>
      <div style={{
        textAlign: "center", fontWeight: 700, fontSize: 7, letterSpacing: 1.5,
        textTransform: "uppercase", marginBottom: 4,
        borderBottom: "0.4px solid #ddd", paddingBottom: 3, color: "#222",
      }}>{titulo}</div>
      {campos.map((campo) => (
        <div key={campo} style={{
          display: "flex", alignItems: "baseline", gap: 6,
          fontSize: 6.5, marginBottom: 4, color: "#111",
        }}>
          <span style={{ fontWeight: 600, color: "#555", whiteSpace: "nowrap", minWidth: 28 }}>
            {campo}:
          </span>
          <span style={{
            flex: 1, borderBottom: "0.4px dotted #ccc",
            display: "block", minHeight: 10,
          }}/>
        </div>
      ))}
    </div>
  );
}

// ── Faixa ornamental + 2 boxes ────────────────────────────────────────────────
function BandaComBoxes({ cfg, bandModelId, customBandDataUrl, leftTitulo, leftCampos, rightTitulo, rightCampos }: {
  cfg: ReceituarioConfig; bandModelId: string; customBandDataUrl?: string;
  leftTitulo: string; leftCampos: string[];
  rightTitulo: string; rightCampos: string[];
}) {
  const [lw, rw] = cfg.boxSplitRatio === "60/40" ? ["60%","40%"]
    : cfg.boxSplitRatio === "40/60" ? ["40%","60%"]
    : ["50%","50%"];

  return (
    <ArabesqueBand modelId={bandModelId} customDataUrl={customBandDataUrl}>
      <div style={{ width: lw }}>
        <IdentBox titulo={leftTitulo} campos={leftCampos}
          faixinha={cfg.boxFaixinhaEsquerda} faixinhaCor={cfg.boxFaixinhaCor}
          borderWidth={cfg.boxBorderWidth}/>
      </div>
      <div style={{ width: rw }}>
        <IdentBox titulo={rightTitulo} campos={rightCampos}
          faixinha={cfg.boxFaixinhaEsquerda} faixinhaCor={cfg.boxFaixinhaCor}
          borderWidth={cfg.boxBorderWidth}/>
      </div>
    </ArabesqueBand>
  );
}

// ── Fórmula demo (P9, P10) ────────────────────────────────────────────────────
function FormulaDemo({ numero, nome, forma, concentracao, quantidade, posologia, fonteTitulo, fonteCorpo }: {
  numero: string; nome: string; forma: string; concentracao: string;
  quantidade: string; posologia: string; fonteTitulo: string; fonteCorpo: string;
}) {
  return (
    <div style={{ marginBottom: "5mm", borderBottom: "0.3px dashed #e5e5e5", paddingBottom: "4mm" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{
          fontWeight: 700, fontSize: 9, color: "#555", fontFamily: fonteCorpo,
          minWidth: 16, textAlign: "right",
        }}>{numero}</span>
        <span style={{ fontWeight: 700, fontSize: 9.5, color: "#111", fontFamily: fonteTitulo }}>
          {nome}
        </span>
      </div>
      <div style={{
        marginLeft: 24, display: "grid",
        gridTemplateColumns: "auto auto auto auto 1fr",
        gap: "0 12mm", fontSize: 6.5, color: "#555", marginBottom: 3,
        fontFamily: fonteCorpo,
      }}>
        {[["Forma", forma], ["Concentração", concentracao], ["Quantidade", quantidade]].map(([l, v]) => (
          <div key={l} style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 5.5, textTransform: "uppercase", letterSpacing: 1, color: "#aaa" }}>{l}</span>
            <span style={{ fontWeight: 600, color: "#333" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ marginLeft: 24, fontSize: 6.5, color: "#444", fontFamily: fonteCorpo }}>
        <b>Posologia:</b> {posologia}
      </div>
    </div>
  );
}

// ── Bloco de certificado (P12) ────────────────────────────────────────────────
function BlocoCertificado({ cfg }: { cfg: ReceituarioConfig }) {
  if (!cfg.certificadoMostrar) return null;
  return (
    <div style={{
      border: "0.5px solid #ddd", borderRadius: 2, padding: "4mm",
      background: "#fafaf8", flex: 1,
    }}>
      <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 1, color: "#333",
        textTransform: "uppercase", marginBottom: 4 }}>
        Documento Assinado Eletronicamente
      </div>
      {[
        ["Assinante", "NOME DO MÉDICO — CPF: •••.•••.•••-••"],
        ["Certificado", "ICP-Brasil — AR Demonstrativo"],
        ["Assinado em", "00/00/0000, 00:00:00 — padrão PAdES"],
        ["Verificação", "exemplo.validar.parxis/demo"],
      ].map(([k, v]) => (
        <div key={k} style={{ fontSize: 5.5, marginBottom: 2, display: "flex", gap: 4 }}>
          <span style={{ fontWeight: 700, color: "#666", minWidth: 24 }}>{k}:</span>
          <span style={{ color: "#888" }}>{v}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        {cfg.certificadoQrDataUrl
          ? <img src={cfg.certificadoQrDataUrl} alt="QR"
              style={{ width: 28, height: 28, objectFit: "contain" }}/>
          : <div style={{
              width: 28, height: 28, border: "0.5px solid #ccc",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 4, color: "#ccc", letterSpacing: 0.5,
            }}>QR</div>
        }
        {cfg.certificadoLogoDataUrl && (
          <img src={cfg.certificadoLogoDataUrl} alt="Cert logo"
            style={{ height: 16, objectFit: "contain", marginLeft: 4 }}/>
        )}
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export function ReceituarioPreview({
  cfg, bandModelId, customBandDataUrl,
}: {
  cfg: ReceituarioConfig;
  bandModelId: string;
  customBandDataUrl?: string;
}) {
  const pacienteCampos   = parseCampos(cfg.boxPacienteCampos);
  const medicoCampos     = parseCampos(cfg.boxMedicoCampos);
  const compradorCampos  = parseCampos(cfg.boxCompradorCampos);
  const farmaciaCampos   = parseCampos(cfg.boxFarmaciaCampos);
  const rodapeEsq        = [cfg.rodapeEndereco, cfg.rodapeDados, cfg.rodapeDados2, cfg.rodapeDados3].filter(Boolean);

  // Resolução do logo do sistema (P1 / P5)
  const sistemaWordmarkSrc = cfg.rodapeSistemaModo === "imagem"
    ? (cfg.rodapeSistemaImagemDataUrl || `${BASE}/brand/paxter-wordmark.png`)
    : null;
  const sistemaLogoSrc = cfg.rodapeSistemaLogoDataUrl || `${BASE}/brand/paxter-symbol.png`;

  return (
    <div style={{
      background: "#fff",
      width: 794, minHeight: 1123,
      fontFamily: "Georgia, serif",
      fontSize: 8,
      color: "#111",
      position: "relative",
      boxSizing: "border-box",
      padding: "10mm 12mm",
    }}>

      {/* ═══ 1. CABEÇALHO (P4, P5, P6) ═══════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 12,
        paddingBottom: "4mm",
      }}>
        {/* Esquerda: logo + nome clínica */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Logo da clínica (P4) */}
          {cfg.cabecalhoLogoDataUrl
            ? <img src={cfg.cabecalhoLogoDataUrl} alt="Logo"
                style={{ height: 40, maxWidth: 70, objectFit: "contain" }}/>
            : <div style={{
                width: 48, height: 36, border: "0.5px dashed #ddd",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 5, color: "#ccc", borderRadius: 1,
              }}>LOGO</div>
          }
          <div>
            {/* Nome da clínica: modo texto ou imagem (P6) */}
            {cfg.cabecalhoNomeModo === "imagem" && cfg.cabecalhoNomeImagemDataUrl
              ? <img src={cfg.cabecalhoNomeImagemDataUrl} alt="Nome clínica"
                  style={{ maxHeight: 24, objectFit: "contain" }}/>
              : <div style={{ fontWeight: 800, fontSize: 13, color: "#1a1a1a", letterSpacing: 0.5 }}>
                  {cfg.cabecalhoNome || "NOME DA CLÍNICA"}
                </div>
            }
            {cfg.cabecalhoTitulo && (
              <div style={{ fontSize: 7, color: "#666", letterSpacing: 1.5, marginTop: 2 }}>
                {cfg.cabecalhoTitulo}
              </div>
            )}
            {cfg.cabecalhoSubtitulo && (
              <div style={{ fontSize: 6.5, color: "#999", marginTop: 1 }}>
                {cfg.cabecalhoSubtitulo}
              </div>
            )}
          </div>
        </div>

        {/* Direita: RCE + vias */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 7, fontWeight: 700, color: "#555", letterSpacing: 1 }}>
            {cfg.cabecalhoRceNumero || "RCE: 2025"}
          </div>
          {cfg.cabecalhoVias.split("—").map((v, i) => (
            <div key={i} style={{ fontSize: 6, color: "#888" }}>{v.trim()}</div>
          ))}
        </div>
      </div>

      {/* ═══ Linha decorativa cabeçalho→título (KC) ═══════════════════════════ */}
      <LinhaDecorativa estilo={cfg.linhaEstiloCabecalho}/>

      {/* ═══ 2. TÍTULO DO DOCUMENTO ══════════════════════════════════════════ */}
      <div style={{ textAlign: "center", marginBottom: "4mm" }}>
        <div style={{
          fontWeight: 800, fontSize: 16, letterSpacing: 2,
          textTransform: "uppercase", color: "#1a1a1a",
        }}>
          {cfg.tituloDocumento || "RECEITUÁRIO DE CONTROLE ESPECIAL"}
        </div>
        {cfg.tituloSubtitulo && (
          <div style={{ fontSize: 7, color: "#888", letterSpacing: 2, marginTop: 3 }}>
            {cfg.tituloSubtitulo}
          </div>
        )}
      </div>

      {/* ═══ Linha entre título e faixa superior (KC) ═════════════════════════ */}
      <LinhaDecorativa estilo={cfg.linhaEstiloCabecalho}/>

      {/* ═══ 3. FAIXA SUPERIOR (Emitente + Paciente) ════════════════════════ */}
      <BandaComBoxes cfg={cfg} bandModelId={bandModelId} customBandDataUrl={customBandDataUrl}
        leftTitulo={cfg.boxMedicoTitulo}   leftCampos={medicoCampos}
        rightTitulo={cfg.boxPacienteTitulo} rightCampos={pacienteCampos}/>

      {/* ═══ 4. CORPO / FÓRMULAS (P9, P10) ══════════════════════════════════ */}
      <div style={{ padding: "5mm 2mm 3mm" }}>
        <div style={{ fontSize: 11, fontStyle: "italic", marginBottom: "4mm",
          fontFamily: cfg.corpoFonteTitulo }}>
          Prescrevo:
        </div>
        <FormulaDemo numero="01"
          nome="EXEMPLO DE MEDICAMENTO A 150 mg — comprimido"
          forma="Comprimido" concentracao="150 mg" quantidade="60 (sessenta)"
          posologia="Orientação demonstrativa a ser validada pelo prescritor."
          fonteTitulo={cfg.corpoFonteTitulo} fonteCorpo={cfg.corpoFonteCorpo}/>
        <FormulaDemo numero="02"
          nome="EXEMPLO DE MEDICAMENTO B 50 mg — comprimido"
          forma="Comprimido" concentracao="50 mg" quantidade="30 (trinta)"
          posologia="Orientação demonstrativa a ser validada pelo prescritor."
          fonteTitulo={cfg.corpoFonteTitulo} fonteCorpo={cfg.corpoFonteCorpo}/>
      </div>

      {/* ═══ 5. ASSINATURA + CERTIFICADO (P11, P12) ══════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "8mm",
        padding: "4mm 2mm 6mm", borderTop: "0.3px solid #eee", marginTop: "2mm",
      }}>
        {/* Assinatura (P11) */}
        <div style={{ flex: "0 0 auto", minWidth: 140 }}>
          {/* R11: respeita assinaturaModo explicitamente */}
          {cfg.assinaturaModo === "imagem" && cfg.assinaturaDataUrl
            ? <img src={cfg.assinaturaDataUrl} alt="Assinatura"
                style={{ maxWidth: 130, maxHeight: 50, objectFit: "contain" }}/>
            : <div style={{
                fontFamily: "Georgia, serif", fontStyle: "italic",
                fontSize: 18, color: "#222", letterSpacing: 1, marginBottom: 3,
                borderBottom: "0.5px solid #555", paddingBottom: 4, width: 130,
              }}>
                {cfg.assinaturaTextoFallback || "Assinatura"}
              </div>
          }
          <div style={{ fontSize: 6.5, color: "#333", marginTop: 4, fontFamily: cfg.corpoFonteCorpo }}>
            {cfg.cabecalhoNome.split("—")[0]?.trim() || "Dr. Nome Completo"}<br/>
            CRM SP 000.000 — RQE: 00.000<br/>
            São Paulo, {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Certificado digital (P12) */}
        <BlocoCertificado cfg={cfg}/>
      </div>

      {/* ═══ 6. FAIXA INFERIOR (Comprador + Fornecedor) — só especial ══════ */}
      {cfg.tipoReceitaPadrao === "especial" && (
        <BandaComBoxes cfg={cfg} bandModelId={bandModelId} customBandDataUrl={customBandDataUrl}
          leftTitulo={cfg.boxCompradorTitulo}  leftCampos={compradorCampos}
          rightTitulo={cfg.boxFarmaciaTitulo} rightCampos={farmaciaCampos}/>
      )}

      {/* ═══ 7. RODAPÉ ══════════════════════════════════════════════════════ */}
      <div style={{
        position: "absolute", bottom: "8mm", left: "12mm", right: "12mm",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        borderTop: "0.3px solid #ddd", paddingTop: "3mm",
      }}>
        {/* Esquerda (P3) */}
        <div>
          {rodapeEsq.map((linha, i) => (
            <div key={i} style={{
              fontSize: i === 0 ? 6 : 5.5,
              color: i === 0 ? "#444" : "#999",
              marginBottom: 1,
            }}>{linha}</div>
          ))}
        </div>

        {/* Direita: sistema (P1, P5) */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Ícone do sistema (P1) */}
          <img src={sistemaLogoSrc} alt="ícone"
            style={{ height: 22, width: 22, objectFit: "contain", opacity: 0.8 }}/>
          <div>
            {/* Wordmark (P5): modo imagem ou texto */}
            {sistemaWordmarkSrc
              ? <img src={sistemaWordmarkSrc} alt="wordmark"
                  style={{ maxHeight: 16, objectFit: "contain", display: "block" }}/>
              : <div style={{
                  fontWeight: 800, fontSize: 9, letterSpacing: 3,
                  textTransform: "uppercase", color: "#c9a24e",
                }}>
                  {cfg.rodapePaxterNome || "PARXIS"}
                </div>
            }
            <div style={{ fontSize: 5.5, color: "#aaa", letterSpacing: 0.8, marginTop: 1 }}>
              {cfg.rodapePaxterSubtitulo || "Clinical Intelligence System"}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
