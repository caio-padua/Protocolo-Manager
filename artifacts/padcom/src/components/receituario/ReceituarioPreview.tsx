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

// ── Fórmula real (da tela de prescrição) ────────────────────────────────────
export interface RealFormula {
  numero: number;
  nome: string;
  ativos: string;    // multi-linha (ex: "Bupropiona 180mg\nTopiramato 20mg")
  posologia: string; // multi-linha (ex: "1 dose VO – Antes do Almoço")
  via?: string;
  forma?: string;
}

// ── Dados do paciente (data-bind para o Box 2) ───────────────────────────────
export interface PacienteDataBind {
  nome?: string;
  cpf?: string;
  nascimento?: string;
  telefone?: string;
  endereco?: string;
}

// ── Campo unitário: label + value (data-bind) ou linha pontilhada ─────────────
type CampoField = { label: string; value?: string; manuscrito?: boolean };
type CampoRow = CampoField | CampoField[];  // field único ou linha multi-coluna

function FieldLine({ label, value, manuscrito }: { label: string; value?: string; manuscrito?: boolean }) {
  // Modo manuscrito: linha pontilhada acima (espaço para escrever) + label abaixo
  if (manuscrito) {
    return (
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 5, gap: 1 }}>
        {/* Linha pontilhada NO TOPO — borderTop coloca a linha na borda superior exata */}
        <span style={{
          borderTop: "0.6px dashed #bbb",
          display: "block",
          minHeight: 11,
        }}/>
        {/* Label imediatamente abaixo da linha */}
        <span style={{
          fontWeight: 700, color: "#aaa",
          fontSize: 5, letterSpacing: 0.7,
          textTransform: "uppercase",
        }}>{label}</span>
      </div>
    );
  }
  // Modo normal: label acima + valor (ou linha fina se vazio)
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 5, gap: 1 }}>
      <span style={{
        fontWeight: 700, color: "#888",
        fontSize: 5.5, letterSpacing: 0.8,
        textTransform: "uppercase",
      }}>{label}</span>
      {value
        ? <span style={{ color: "#111", fontWeight: 600, fontSize: 7.5, lineHeight: 1.3 }}>{value}</span>
        : <span style={{ borderBottom: "0.4px dotted #bbb", display: "block", minHeight: 11, marginTop: 2 }}/>
      }
    </div>
  );
}

// ── Box de identificação v2 — campos fixos por rows ───────────────────────────
function IdentBoxV2({
  titulo, rows, borderWidth, faixinha, faixinhaCor, minHeight, paddingX, contentAlign,
}: {
  titulo: string;
  rows: CampoRow[];
  borderWidth: number;
  faixinha: boolean;
  faixinhaCor: string;
  minHeight?: number;
  paddingX?: number;
  /** "bottom" empurra os campos para a parte inferior do box via spacer flex */
  contentAlign?: "top" | "bottom";
}) {
  const px = paddingX ?? 4;
  return (
    <div style={{
      position: "relative", zIndex: 2,
      background: "#ffffff",
      border: `${borderWidth}px solid #454545`,
      borderRadius: 1,
      borderLeft: faixinha
        ? `${Math.max(borderWidth, 3)}px solid ${faixinhaCor}`
        : `${borderWidth}px solid #454545`,
      padding: `3mm ${px}mm`,
      boxShadow: "0.4mm 0.4mm 0 rgba(0,0,0,0.05)",
      minHeight: minHeight ? `${minHeight}px` : undefined,
      height: "100%", boxSizing: "border-box",
      display: "flex", flexDirection: "column",
    }}>
      {/* Título do box — sempre no topo */}
      <div style={{
        textAlign: "center", fontWeight: 700, fontSize: 7, letterSpacing: 1.5,
        textTransform: "uppercase", marginBottom: 5,
        borderBottom: "0.4px solid #ddd", paddingBottom: 3, color: "#222",
        flexShrink: 0,
      }}>{titulo}</div>

      {/* Spacer: empurra rows para o fundo quando contentAlign="bottom" */}
      {contentAlign === "bottom" && <div style={{ flex: 1 }}/>}

      {/* Rows: single field ou array (multi-coluna) */}
      <div>
        {rows.map((row, i) => {
          if (Array.isArray(row)) {
            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: `repeat(${row.length}, auto)`,
                gap: "0 3mm",
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
  stretchBoxes,
  rightContentAlign,
}: {
  cfg: ReceituarioConfig;
  bandModelId: string;
  customBandDataUrl?: string;
  leftTitulo: string;
  leftRows: CampoRow[];
  rightTitulo: string;
  rightRows: CampoRow[];
  /** false = boxes encolhem ao conteúdo (sem espaço morto abaixo); padrão true */
  stretchBoxes?: boolean;
  /** "bottom" = campos do box direito ficam na parte inferior */
  rightContentAlign?: "top" | "bottom";
}) {
  const leftPct = cfg.boxLeftWidthPercent ?? 50;
  const columns = `${leftPct}fr ${100 - leftPct}fr`;
  const stretch = stretchBoxes !== false;

  return (
    <ArabesqueBand modelId={bandModelId} customDataUrl={customBandDataUrl}
      columns={columns} gap={`${cfg.boxBandGap}mm`} contentMinHeight={stretch ? cfg.boxMinHeight : undefined}>
      {/* box esquerdo: alinha à esquerda */}
      <div style={{
        minWidth: 0,
        height: stretch ? "100%" : undefined,
        alignSelf: stretch ? undefined : "start",
        display: "flex", alignItems: "stretch", justifyContent: "flex-start",
      }}>
        <div style={{ width: `${cfg.boxWidthPct ?? 100}%`, height: stretch ? "100%" : undefined }}>
          <IdentBoxV2
            titulo={leftTitulo}
            rows={leftRows}
            paddingX={cfg.boxInnerPaddingX}
            faixinha={cfg.boxFaixinhaEsquerda}
            faixinhaCor={cfg.boxFaixinhaCor}
            borderWidth={cfg.boxBorderWidth}
            minHeight={cfg.boxMinHeight}
            contentAlign="top"/>
        </div>
      </div>
      {/* box direito: alinha à direita */}
      <div style={{
        minWidth: 0,
        height: stretch ? "100%" : undefined,
        alignSelf: stretch ? undefined : "start",
        display: "flex", alignItems: "stretch", justifyContent: "flex-end",
      }}>
        <div style={{ width: `${cfg.boxWidthPct ?? 100}%`, height: stretch ? "100%" : undefined }}>
          <IdentBoxV2
            titulo={rightTitulo}
            rows={rightRows}
            paddingX={cfg.boxInnerPaddingX}
            faixinha={cfg.boxFaixinhaEsquerda}
            faixinhaCor={cfg.boxFaixinhaCor}
            borderWidth={cfg.boxBorderWidth}
            minHeight={cfg.boxMinHeight}
            contentAlign={rightContentAlign ?? "top"}/>
        </div>
      </div>
    </ArabesqueBand>
  );
}

// ── Fórmula REAL (dados vivos da tela de prescrição) ─────────────────────────
function FormulaReal({ f, cfg }: { f: RealFormula; cfg: { corpoFonteTitulo: string; corpoFonteCorpo: string } }) {
  const ativosLines = f.ativos.split("\n").filter(Boolean);
  const posologiaLines = f.posologia.split("\n").filter(Boolean);
  return (
    <div style={{ marginBottom: "5mm", borderBottom: "0.3px dashed #e5e5e5", paddingBottom: "4mm" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{
          fontWeight: 700, fontSize: 9, color: "#555", fontFamily: cfg.corpoFonteCorpo,
          minWidth: 18, textAlign: "right",
        }}>{String(f.numero).padStart(2, "0")}.</span>
        <span style={{ fontWeight: 700, fontSize: 10, color: "#111", fontFamily: cfg.corpoFonteTitulo }}>
          {f.nome}
        </span>
      </div>
      {(f.via || f.forma) && (
        <div style={{ marginLeft: 26, display: "flex", gap: "8mm", fontSize: 6.5, color: "#555", marginBottom: 4, fontFamily: cfg.corpoFonteCorpo }}>
          {f.via && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 5.5, textTransform: "uppercase", letterSpacing: 1, color: "#aaa" }}>Via</span>
              <span style={{ fontWeight: 600, color: "#333" }}>{f.via}</span>
            </div>
          )}
          {f.forma && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 5.5, textTransform: "uppercase", letterSpacing: 1, color: "#aaa" }}>Forma</span>
              <span style={{ fontWeight: 600, color: "#333" }}>{f.forma}</span>
            </div>
          )}
        </div>
      )}
      <div style={{ marginLeft: 26, fontFamily: "monospace", fontSize: 8, color: "#1a1a1a", marginBottom: 5, lineHeight: 1.55 }}>
        {ativosLines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      {posologiaLines.length > 0 && (
        <div style={{ marginLeft: 26, fontFamily: cfg.corpoFonteCorpo, fontSize: 7 }}>
          {posologiaLines.map((l, i) => (
            <div key={i} style={{ color: "#0a7a6e", fontWeight: 600, marginBottom: 2 }}>▸ {l}</div>
          ))}
        </div>
      )}
    </div>
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
  formulasReais,
  pacienteData,
  showDemoData,
}: {
  cfg: ReceituarioConfig;
  bandModelId: string;
  customBandDataUrl?: string;
  medicoData?: MedicoDataBind;
  clinicaData?: ClinicaDataBind;
  /** Fórmulas reais da tela de prescrição — substitui os demos quando fornecido */
  formulasReais?: RealFormula[];
  /** Dados reais do paciente — preenche o Box 2 quando fornecido */
  pacienteData?: PacienteDataBind;
  /** Preenche boxes 2–4 com dados fictícios para testar o layout no designer */
  showDemoData?: boolean;
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

  // ── P3/P5: Box 2 (Paciente) — data-bind quando pacienteData disponível ──
  const pacienteRows: CampoRow[] = [
    { label: "Nome Completo", value: pacienteData?.nome ?? (showDemoData ? "Marina Oliveira da Silva" : undefined) },
    [
      { label: "CPF",        value: pacienteData?.cpf        ?? (showDemoData ? "000.000.000-00" : undefined) },
      { label: "Nascimento", value: pacienteData?.nascimento ?? (showDemoData ? "01/01/1990" : undefined) },
      { label: "Telefone",   value: pacienteData?.telefone   ?? (showDemoData ? "(11) 99999-9999" : undefined) },
    ],
    { label: "Endereço Completo", value: pacienteData?.endereco ?? (showDemoData ? "Rua das Flores, 250 — São Paulo, SP" : undefined) },
  ];

  // ── P3/P5: Box 3 (Comprador) — sempre manuscrito (farmácia preenche à mão) ─
  const compradorRows: CampoRow[] = [
    { label: "Nome",      manuscrito: true },
    { label: "Endereço",  manuscrito: true },
    [{ label: "Cidade", manuscrito: true }, { label: "UF", manuscrito: true }],
    [{ label: "Identidade", manuscrito: true }, { label: "Org. Emissora", manuscrito: true }],
    { label: "Telefone",  manuscrito: true },
  ];

  // ── P3/P5: Box 4 (Fornecedor) — sempre manuscrito (farmácia preenche à mão) ─
  const fornecedorRows: CampoRow[] = [
    [
      { label: "Assinatura do Farmacêutico", manuscrito: true },
      { label: "Data",                       manuscrito: true },
    ],
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

      {/* ═══ 3. FAIXA SUPERIOR — Box 1 (Paciente) + Box 2 (Emitente) ══════ */}
      {/* P3: Paciente à esquerda, Emitente à direita (posições trocadas pelo CEO) */}
      {/* P2: stretchBoxes=false elimina espaço vazio abaixo do endereço */}
      <BandaComBoxes
        cfg={cfg} bandModelId={bandModelId} customBandDataUrl={customBandDataUrl}
        leftTitulo={cfg.boxPacienteTitulo}
        leftRows={pacienteRows}
        rightTitulo={cfg.boxMedicoTitulo}
        rightRows={emitentRows}
        stretchBoxes={false}/>

      {/* ═══ 4. CORPO / FÓRMULAS ════════════════════════════════════════════ */}
      <div style={{ padding: "5mm 2mm 3mm" }}>
        <div style={{ fontSize: 11, fontStyle: "italic", marginBottom: "4mm",
          fontFamily: cfg.corpoFonteTitulo }}>
          Prescrevo:
        </div>

        {/* ── Fórmulas REAIS (da tela de prescrição) ── */}
        {formulasReais && formulasReais.length > 0
          ? formulasReais.map((f) => (
              <FormulaReal key={f.numero} f={f} cfg={cfg}/>
            ))
          : (
            /* ── Demo (designer / visualização sem dados reais) ── */
            <>
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
            </>
          )
        }
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
      {/* P1: rightContentAlign="bottom" coloca campos do Fornecedor na parte inferior */}
      {cfg.tipoReceitaPadrao === "especial" && (
        <BandaComBoxes
          cfg={cfg} bandModelId={bandModelId} customBandDataUrl={customBandDataUrl}
          leftTitulo={cfg.boxCompradorTitulo}
          leftRows={compradorRows}
          rightTitulo={cfg.boxFarmaciaTitulo}
          rightRows={fornecedorRows}
          rightContentAlign="bottom"/>
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
