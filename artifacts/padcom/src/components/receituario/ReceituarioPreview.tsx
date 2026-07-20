// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO PREVIEW v3 — Layout completo do receituário médico
// P3/P4/P5/P6: campos fixos conforme modelo ANVISA + data-bind emitente
// Usado tanto no preview da tela (scale 0.55) quanto na impressão (1:1)
// Spec: specs/receituario-designer-v2.md
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { type ReceituarioConfig } from "@/lib/arabesques/receituario-config";
import { ArabesqueBand } from "@/lib/arabesques/ArabesqueBand";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Data-bind types (P4) ──────────────────────────────────────────────────────
export interface MedicoDataBind {
  name?: string;
  crm?: string;
  rqe?: string;
  phone?: string;
  address?: string;
}
export interface ClinicaDataBind {
  name?: string;
  nomeFantasia?: string;
  phone?: string;
  address?: string;
}

// ── Campo unitário: label + value (data-bind) ou linha pontilhada ─────────────
type CampoField = { label: string; value?: string };
type CampoRow = CampoField | CampoField[];  // field único ou linha multi-coluna

function FieldLine({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 5,
      fontSize: 6.5, marginBottom: 3.5, color: "#111",
    }}>
      <span style={{
        fontWeight: 700, color: "#555",
        whiteSpace: "nowrap", flexShrink: 0,
        fontSize: 6, letterSpacing: 0.3,
        textTransform: "uppercase",
      }}>{label}:</span>
      {value
        ? <span style={{ color: "#111", fontWeight: 400, fontSize: 7 }}>{value}</span>
        : <span style={{
            flex: 1, borderBottom: "0.4px dotted #bbb",
            display: "block", minHeight: 10,
          }}/>
      }
    </div>
  );
}

// ── Box de identificação v2 — campos fixos por rows ───────────────────────────
function IdentBoxV2({
  titulo, rows, borderWidth, faixinha, faixinhaCor,
}: {
  titulo: string;
  rows: CampoRow[];
  borderWidth: number;
  faixinha: boolean;
  faixinhaCor: string;
}) {
  return (
    <div style={{
      position: "relative", zIndex: 2,
      background: "#ffffff",
      border: `${borderWidth}px solid #454545`,
      borderRadius: 1,
      borderLeft: faixinha
        ? `${Math.max(borderWidth, 3)}px solid ${faixinhaCor}`
        : `${borderWidth}px solid #454545`,
      padding: "3mm 4mm",
      boxShadow: "0.4mm 0.4mm 0 rgba(0,0,0,0.05)",
    }}>
      {/* Título do box */}
      <div style={{
        textAlign: "center", fontWeight: 700, fontSize: 7, letterSpacing: 1.5,
        textTransform: "uppercase", marginBottom: 5,
        borderBottom: "0.4px solid #ddd", paddingBottom: 3, color: "#222",
      }}>{titulo}</div>

      {/* Rows: single field ou array (multi-coluna) */}
      {rows.map((row, i) => {
        if (Array.isArray(row)) {
          return (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: `repeat(${row.length}, 1fr)`,
              gap: "0 6mm",
              marginBottom: 1,
            }}>
              {row.map((field) => (
                <FieldLine key={field.label} label={field.label} value={field.value}/>
              ))}
            </div>
          );
        }
        return <FieldLine key={i} label={row.label} value={row.value}/>;
      })}
    </div>
  );
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

// ── Faixa ornamental + 2 boxes (P3/P4/P5/P6) ─────────────────────────────────
function BandaComBoxes({
  cfg, bandModelId, customBandDataUrl,
  leftTitulo, leftRows,
  rightTitulo, rightRows,
}: {
  cfg: ReceituarioConfig;
  bandModelId: string;
  customBandDataUrl?: string;
  leftTitulo: string;
  leftRows: CampoRow[];
  rightTitulo: string;
  rightRows: CampoRow[];
}) {
  const [lw, rw] = cfg.boxSplitRatio === "60/40" ? ["60%", "40%"]
    : cfg.boxSplitRatio === "40/60" ? ["40%", "60%"]
    : ["50%", "50%"];

  return (
    <ArabesqueBand modelId={bandModelId} customDataUrl={customBandDataUrl}>
      <div style={{ width: lw }}>
        <IdentBoxV2
          titulo={leftTitulo}
          rows={leftRows}
          faixinha={cfg.boxFaixinhaEsquerda}
          faixinhaCor={cfg.boxFaixinhaCor}
          borderWidth={cfg.boxBorderWidth}/>
      </div>
      <div style={{ width: rw }}>
        <IdentBoxV2
          titulo={rightTitulo}
          rows={rightRows}
          faixinha={cfg.boxFaixinhaEsquerda}
          faixinhaCor={cfg.boxFaixinhaCor}
          borderWidth={cfg.boxBorderWidth}/>
      </div>
    </ArabesqueBand>
  );
}

// ── Fórmula demo ──────────────────────────────────────────────────────────────
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

// ── Bloco de certificado ──────────────────────────────────────────────────────
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
  medicoData, clinicaData,
}: {
  cfg: ReceituarioConfig;
  bandModelId: string;
  customBandDataUrl?: string;
  medicoData?: MedicoDataBind;   // P4: data-bind emitente
  clinicaData?: ClinicaDataBind; // P4: data-bind clínica
}) {
  const rodapeEsq = [cfg.rodapeEndereco, cfg.rodapeDados, cfg.rodapeDados2, cfg.rodapeDados3].filter(Boolean);

  const sistemaWordmarkSrc = cfg.rodapeSistemaModo === "imagem"
    ? (cfg.rodapeSistemaImagemDataUrl || `${BASE}/brand/paxter-wordmark.png`)
    : null;
  const sistemaLogoSrc = cfg.rodapeSistemaLogoDataUrl || `${BASE}/brand/paxter-symbol.png`;

  // ── P3/P4: Campos fixos do modelo ANVISA — Box 1 (Emitente) ─────────────
  const emitentRows: CampoRow[] = [
    { label: "Profissional/Prescritor", value: medicoData?.name },
    [
      { label: "Conselho", value: medicoData?.crm },
      { label: "RQE", value: medicoData?.rqe },
      { label: "Telefone", value: clinicaData?.phone },
    ],
    { label: "Endereço do Consultório", value: clinicaData?.address },
  ];

  // ── P3/P5: Box 2 (Paciente) — sempre em branco (preenchido na consulta) ──
  const pacienteRows: CampoRow[] = [
    { label: "Nome Completo" },
    [
      { label: "CPF" },
      { label: "Nascimento" },
      { label: "Telefone" },
    ],
    { label: "Endereço Completo" },
  ];

  // ── P3/P5: Box 3 (Comprador) — em branco (farmácia preenche) ─────────────
  const compradorRows: CampoRow[] = [
    { label: "Nome" },
    { label: "Endereço" },
    [{ label: "Cidade" }, { label: "UF" }],
    [{ label: "Identidade" }, { label: "Org. Emissora" }],
    { label: "Telefone" },
  ];

  // ── P3/P5: Box 4 (Fornecedor) — em branco (farmácia preenche) ─────────────
  const fornecedorRows: CampoRow[] = [
    { label: "Assinatura do Farmacêutico" },
    { label: "Data" },
  ];

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

      {/* ═══ 1. CABEÇALHO ═══════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 12,
        paddingBottom: "4mm",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 7, fontWeight: 700, color: "#555", letterSpacing: 1 }}>
            {cfg.cabecalhoRceNumero || "RCE: 2025"}
          </div>
          {cfg.cabecalhoVias.split("—").map((v, i) => (
            <div key={i} style={{ fontSize: 6, color: "#888" }}>{v.trim()}</div>
          ))}
        </div>
      </div>

      {/* ═══ Linha decorativa cabeçalho→título ═════════════════════════════ */}
      <LinhaDecorativa estilo={cfg.linhaEstiloCabecalho}/>

      {/* ═══ 2. TÍTULO DO DOCUMENTO ═════════════════════════════════════════ */}
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

      {/* ═══ Linha entre título e faixa superior ═══════════════════════════ */}
      <LinhaDecorativa estilo={cfg.linhaEstiloCabecalho}/>

      {/* ═══ 3. FAIXA SUPERIOR — Box 1 (Emitente) + Box 2 (Paciente) ══════ */}
      <BandaComBoxes
        cfg={cfg} bandModelId={bandModelId} customBandDataUrl={customBandDataUrl}
        leftTitulo={cfg.boxMedicoTitulo}
        leftRows={emitentRows}
        rightTitulo={cfg.boxPacienteTitulo}
        rightRows={pacienteRows}/>

      {/* ═══ 4. CORPO / FÓRMULAS ════════════════════════════════════════════ */}
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

      {/* ═══ 5. ASSINATURA + CERTIFICADO ════════════════════════════════════ */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "8mm",
        padding: "4mm 2mm 6mm", borderTop: "0.3px solid #eee", marginTop: "2mm",
      }}>
        <div style={{ flex: "0 0 auto", minWidth: 140 }}>
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
            {medicoData?.name || cfg.cabecalhoNome.split("—")[0]?.trim() || "Dr. Nome Completo"}<br/>
            {medicoData?.crm || "CRM SP 000.000 — RQE: 00.000"}<br/>
            {clinicaData?.address?.split(",")[1]?.trim()?.split("—")[0]?.trim() || "São Paulo"},
            {" "}{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>
        <BlocoCertificado cfg={cfg}/>
      </div>

      {/* ═══ 6. FAIXA INFERIOR — Box 3 (Comprador) + Box 4 (Fornecedor) ════ */}
      {cfg.tipoReceitaPadrao === "especial" && (
        <BandaComBoxes
          cfg={cfg} bandModelId={bandModelId} customBandDataUrl={customBandDataUrl}
          leftTitulo={cfg.boxCompradorTitulo}
          leftRows={compradorRows}
          rightTitulo={cfg.boxFarmaciaTitulo}
          rightRows={fornecedorRows}/>
      )}

      {/* ═══ 7. RODAPÉ ═══════════════════════════════════════════════════════ */}
      <div style={{
        position: "absolute", bottom: "8mm", left: "12mm", right: "12mm",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        borderTop: "0.3px solid #ddd", paddingTop: "3mm",
      }}>
        <div>
          {rodapeEsq.map((linha, i) => (
            <div key={i} style={{
              fontSize: i === 0 ? 6 : 5.5,
              color: i === 0 ? "#444" : "#999",
              marginBottom: 1,
            }}>{linha}</div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <img src={sistemaLogoSrc} alt="ícone"
            style={{ height: 22, width: 22, objectFit: "contain", opacity: 0.8 }}/>
          <div>
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
