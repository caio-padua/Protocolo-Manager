/**
 * RECEITUÁRIO MAGISTRAL — gerador de PDF com assinatura ICP-Brasil (PAdES).
 * Padrão visual PAXTER: faixa navy, tabela de fórmulas, rodapé com selo.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { getCertBufferSync, getCertPasswordsSync } from "./cert-source";

// ─── Cores Paxter ────────────────────────────────────────────────────────────
const NAVY   = rgb(0.082, 0.11,  0.18);   // #151C2E
const CYAN   = rgb(0.271, 0.722, 0.8);    // #45B8CC
const GOLD   = rgb(0.761, 0.627, 0.353);  // #C2A05A
const WHITE  = rgb(1, 1, 1);
const DARK   = rgb(0.12, 0.14, 0.20);
const MUTED  = rgb(0.45, 0.50, 0.58);
const LIGHT  = rgb(0.96, 0.97, 0.98);
const LINE   = rgb(0.84, 0.86, 0.90);

const PAGE_W = 595.28; // A4 largura
const PAGE_H = 841.89; // A4 altura
const MARGIN = 48;

function fmtData(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
function hoje(): string {
  const now = new Date();
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return brt.toISOString().split("T")[0];
}
function safeTxt(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface FormulaItem {
  nome: string;
  ativoPrincipal?: string | null;
  posologia?: string | null;
  dose?: string | null;
  via?: string | null;
  frequencia?: string | null;
  observacao?: string | null;
}

export interface ReceituarioData {
  clientName: string;
  clientCpf?: string | null;
  clientPhone?: string | null;
  professionalName?: string | null;
  professionalCrm?: string | null;
  nomeSerie: string;        // nome da agenda
  nomeSlot: string;         // nome da receita / slot
  dataLiberacao: string;    // YYYY-MM-DD
  formulas: FormulaItem[];
}

// ─── Motor de texto multi-linha ───────────────────────────────────────────────
function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: {
    x: number; y: number; maxWidth: number;
    font: ReturnType<PDFDocument["embedStandardFont"]> extends Promise<infer F> ? F : never;
    size: number; color: ReturnType<typeof rgb>; lineHeight?: number;
  },
): number {
  const words = text.split(" ");
  let line = "";
  let y = opts.y;
  const lh = opts.lineHeight ?? opts.size * 1.4;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    // @ts-ignore — font may not have .widthOfTextAtSize before type narrow
    const w = (opts.font as any).widthOfTextAtSize(candidate, opts.size);
    if (w > opts.maxWidth && line) {
      page.drawText(line, { x: opts.x, y, font: opts.font as any, size: opts.size, color: opts.color });
      y -= lh;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    page.drawText(line, { x: opts.x, y, font: opts.font as any, size: opts.size, color: opts.color });
    y -= lh;
  }
  return y;
}

// ─── Gerador principal ────────────────────────────────────────────────────────
export async function generateReceituarioPdf(data: ReceituarioData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  // ── Faixa NAVY superior ───────────────────────────────────────────────────
  const HEADER_H = 100;
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY });

  // Wordmark "PAXTER"
  page.drawText("PAXTER", {
    x: MARGIN, y: PAGE_H - 42,
    font: fontBold, size: 22, color: GOLD,
  });
  page.drawText("Clinical Intelligence System", {
    x: MARGIN, y: PAGE_H - 57,
    font: fontRegular, size: 8, color: CYAN,
  });

  // Título do documento (direita)
  page.drawText("RECEITUÁRIO MAGISTRAL", {
    x: PAGE_W - MARGIN - 180, y: PAGE_H - 42,
    font: fontBold, size: 12, color: WHITE,
  });
  page.drawText("Prescrição de Fórmulas Manipuladas", {
    x: PAGE_W - MARGIN - 180, y: PAGE_H - 57,
    font: fontRegular, size: 8, color: CYAN,
  });

  // Linha dourada sob o header
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: 2, color: GOLD });

  y = PAGE_H - HEADER_H - 28;

  // ── Identificação do documento ────────────────────────────────────────────
  page.drawText("SÉRIE / AGENDA", { x: MARGIN, y, font: fontBold, size: 7, color: MUTED });
  page.drawText(safeTxt(data.nomeSerie), { x: MARGIN, y: y - 12, font: fontBold, size: 10, color: DARK });

  page.drawText("RECEITA", { x: PAGE_W / 2, y, font: fontBold, size: 7, color: MUTED });
  page.drawText(safeTxt(data.nomeSlot), { x: PAGE_W / 2, y: y - 12, font: fontBold, size: 10, color: DARK });

  y -= 32;

  // Linha divisória
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE });
  y -= 18;

  // ── Dados do cliente + data ───────────────────────────────────────────────
  const COL2 = PAGE_W / 2;

  // Coluna esquerda — cliente
  page.drawText("PACIENTE", { x: MARGIN, y, font: fontBold, size: 7, color: MUTED });
  page.drawText(safeTxt(data.clientName), { x: MARGIN, y: y - 13, font: fontBold, size: 11, color: DARK });
  if (data.clientCpf) {
    page.drawText(`CPF: ${data.clientCpf}`, { x: MARGIN, y: y - 25, font: fontRegular, size: 8, color: MUTED });
  }

  // Coluna direita — datas
  page.drawText("DATA DE LIBERAÇÃO", { x: COL2, y, font: fontBold, size: 7, color: MUTED });
  page.drawText(fmtData(data.dataLiberacao), { x: COL2, y: y - 13, font: fontBold, size: 11, color: DARK });
  page.drawText(`Emitido em: ${fmtData(hoje())}`, { x: COL2, y: y - 25, font: fontRegular, size: 8, color: MUTED });

  y -= 44;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE });
  y -= 20;

  // ── Tabela de fórmulas ────────────────────────────────────────────────────
  page.drawText("FÓRMULAS MAGISTRAIS PRESCRITAS", {
    x: MARGIN, y, font: fontBold, size: 8, color: MUTED,
  });
  page.drawRectangle({ x: MARGIN, y: y - 2, width: 200, height: 1, color: CYAN });
  y -= 20;

  const COL_FORMULA = MARGIN;
  const COL_POSOL   = MARGIN + 230;
  const COL_VIA     = MARGIN + 380;
  const ROW_H       = 22;

  // Cabeçalho da tabela
  page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: NAVY });
  page.drawText("FÓRMULA / PRINCÍPIO ATIVO", { x: COL_FORMULA + 6, y: y - 10, font: fontBold, size: 7, color: WHITE });
  page.drawText("POSOLOGIA / DOSE",           { x: COL_POSOL + 4,   y: y - 10, font: fontBold, size: 7, color: WHITE });
  page.drawText("VIA",                         { x: COL_VIA + 4,     y: y - 10, font: fontBold, size: 7, color: WHITE });
  y -= ROW_H + 2;

  // Linhas
  for (let i = 0; i < data.formulas.length; i++) {
    const f = data.formulas[i];
    const bg = i % 2 === 0 ? LIGHT : WHITE;
    page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: bg });

    // Nome da fórmula (truncar se muito longo)
    const nomeStr = safeTxt(f.nome).slice(0, 45);
    const ativoStr = f.ativoPrincipal ? `(${safeTxt(f.ativoPrincipal).slice(0, 30)})` : "";
    page.drawText(nomeStr, { x: COL_FORMULA + 6, y: y - 8, font: fontBold, size: 8, color: DARK });
    if (ativoStr) {
      page.drawText(ativoStr, { x: COL_FORMULA + 6, y: y - 17, font: fontRegular, size: 6.5, color: MUTED });
    }

    // Posologia + dose
    const posol = [safeTxt(f.posologia), safeTxt(f.dose), safeTxt(f.frequencia)]
      .filter(Boolean).join(" — ").slice(0, 40);
    page.drawText(posol || "—", { x: COL_POSOL + 4, y: y - 8, font: fontRegular, size: 8, color: DARK });

    // Via
    page.drawText(safeTxt(f.via) || "—", { x: COL_VIA + 4, y: y - 8, font: fontRegular, size: 8, color: DARK });

    y -= ROW_H + 2;

    // Observação na linha extra
    if (f.observacao) {
      page.drawText(`Obs: ${safeTxt(f.observacao).slice(0, 90)}`, {
        x: COL_FORMULA + 6, y: y + 4,
        font: fontRegular, size: 7, color: MUTED,
      });
      y -= 12;
    }
  }

  y -= 16;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE });
  y -= 24;

  // ── Instruções gerais ─────────────────────────────────────────────────────
  page.drawText("INSTRUÇÕES GERAIS", { x: MARGIN, y, font: fontBold, size: 8, color: MUTED });
  y -= 14;
  const instrucoes = [
    "• Apresente este documento ao farmacêutico responsável pela manipulação.",
    "• Este receituário tem validade de 30 dias a partir da data de emissão.",
    "• Em caso de dúvidas, entre em contato com a clínica antes de realizar a manipulação.",
    "• Não altere doses ou princípios ativos sem orientação médica.",
  ];
  for (const linha of instrucoes) {
    page.drawText(linha, { x: MARGIN, y, font: fontRegular, size: 8, color: DARK });
    y -= 13;
  }

  y -= 24;

  // ── Assinatura do médico ──────────────────────────────────────────────────
  const SIG_W = 180;
  const SIG_X = PAGE_W / 2 - SIG_W / 2;
  page.drawLine({ start: { x: SIG_X, y }, end: { x: SIG_X + SIG_W, y }, thickness: 0.7, color: DARK });
  y -= 12;
  const profName = safeTxt(data.professionalName) || "Dr(a). ___________________________";
  page.drawText(profName, { x: SIG_X, y, font: fontBold, size: 9, color: DARK });
  y -= 12;
  if (data.professionalCrm) {
    page.drawText(`CRM: ${data.professionalCrm}`, { x: SIG_X, y, font: fontRegular, size: 8, color: MUTED });
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const FOOTER_H = 36;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: NAVY });
  page.drawText("PAXTER Clinical Intelligence System — Documento gerado e assinado digitalmente (ICP-Brasil / PAdES)", {
    x: MARGIN, y: 14, font: fontRegular, size: 6.5, color: CYAN,
  });
  page.drawText(`Receituário ID: ${data.nomeSlot} | ${fmtData(data.dataLiberacao)}`, {
    x: MARGIN, y: 6, font: fontRegular, size: 5.5, color: MUTED,
  });

  // ── Assinar com ICP-Brasil (PAdES) ────────────────────────────────────────
  let pfxBuf: Buffer;
  let password: string | undefined;
  try {
    pfxBuf  = getCertBufferSync();
    password = getCertPasswordsSync()[0] ?? "";
  } catch {
    // Sem certificado disponível — devolve PDF sem assinatura (não derruba o fluxo)
    return pdfDoc.save();
  }

  pdflibAddPlaceholder({
    pdfDoc,
    reason: "Receituário magistral assinado digitalmente — PAXTER",
    contactInfo: "PAXTER Clinical Intelligence System",
    name: safeTxt(data.professionalName) || "Médico Responsável",
    location: "Brasil",
    signatureLength: 16384,
  });

  const withPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  const signer  = new P12Signer(pfxBuf, { passphrase: password });
  const signpdf = new SignPdf();
  const signed  = await signpdf.sign(Buffer.from(withPlaceholder), signer);
  return new Uint8Array(signed);
}

// ─── V2: Layout ANVISA 4 Boxes ────────────────────────────────────────────────

export interface ReceituarioDataV2 {
  // Box 1 — Emitente (carregado automaticamente pelo backend)
  medicoName: string;
  medicoCrm: string;
  clinicaNome: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;

  // Box 2 — Paciente
  pacienteNome?: string;
  pacienteCpf?: string;
  pacienteNascimento?: string;   // YYYY-MM-DD
  pacienteTelefone?: string;
  pacienteEndereco?: string;

  // Prescrição
  formulas: {
    nome: string;
    ativos?: string;       // texto livre multi-linha
    posologia?: string;    // texto livre multi-linha
    via?: string;
    forma?: string;
    observacao?: string;
  }[];

  // Metadados
  tipoReceita?: "especial" | "simples";
  dataEmissao?: string;   // YYYY-MM-DD; default = hoje BRT
  validadeDias?: number;  // default 30
  numeroReceita?: string;
  // Faixa arabesca — id do modelo (ex: "padua-01-floral-islamico"); default = padua-01
  bandModel?: string;
}

async function signPdfBytes(
  pdfDoc: PDFDocument,
  profName: string,
): Promise<Uint8Array> {
  let pfxBuf: Buffer;
  let password: string;
  try {
    pfxBuf   = getCertBufferSync();
    password = getCertPasswordsSync()[0] ?? "";
  } catch {
    return pdfDoc.save();
  }
  pdflibAddPlaceholder({
    pdfDoc,
    reason:      "Receituário assinado digitalmente — PAXTER",
    contactInfo: "PAXTER Clinical Intelligence System",
    name:        profName || "Médico Responsável",
    location:    "Brasil",
    signatureLength: 16384,
  });
  const withPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  const signer  = new P12Signer(pfxBuf, { passphrase: password });
  const signpdf = new SignPdf();
  const signed  = await signpdf.sign(Buffer.from(withPlaceholder), signer);
  return new Uint8Array(signed);
}

// ── Gera PDF a partir de uma imagem PNG capturada do motor HTML ──────────────
// Usada pela rota /assinar-imagem-pdf (motor html2canvas → PNG → este PDF → ICP-Brasil)
export async function generatePdfFromPngBase64(
  pngBase64: string,
  profName: string,
): Promise<Uint8Array> {
  const pdfDoc   = await PDFDocument.create();
  const pngBytes = Buffer.from(pngBase64, "base64");
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Página A4 (595.28 x 841.89 pts)
  const page   = pdfDoc.addPage([PAGE_W, PAGE_H]);
  // Escala o PNG para preencher a largura total da página A4
  const scale  = PAGE_W / pngImage.width;
  const drawH  = pngImage.height * scale;

  page.drawImage(pngImage, {
    x:      0,
    y:      Math.max(0, PAGE_H - drawH),
    width:  PAGE_W,
    height: Math.min(drawH, PAGE_H),
  });

  return signPdfBytes(pdfDoc, profName);
}

export async function generateReceituarioPdfV2(data: ReceituarioDataV2): Promise<Uint8Array> {
  const pdfDoc   = await PDFDocument.create();
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItal = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const M    = 36;
  const CW   = PAGE_W - M * 2; // ~523

  const dataStr  = data.dataEmissao ?? hoje();
  const dataFmt  = fmtData(dataStr);
  const validade = data.validadeDias ?? 30;
  const tipo     = data.tipoReceita ?? "especial";
  const tituloDoc = tipo === "especial"
    ? "RECEITUÁRIO DE CONTROLE ESPECIAL"
    : "RECEITUÁRIO SIMPLES — FÓRMULAS MANIPULADAS";

  // ── Header MOTOR — cabeçalho limpo (sem faixa NAVY) ─────────────────────
  // Layout espelha o ReceituarioPreview: clínica + médico à esquerda,
  // título do documento centralizado, arabescos correm ATRÁS dos boxes.
  let hy = PAGE_H - 14;

  // Linha 1: "PAXTER" ouro (pequeno) | código RCE (direita)
  page.drawText("PAXTER", { x: M, y: hy, font: fontBold, size: 9, color: GOLD });
  const rceCode = data.numeroReceita ? `Nº ${data.numeroReceita}` : `RCE · ${dataStr.slice(0, 4)}`;
  const rceTxtW = fontBold.widthOfTextAtSize(rceCode, 7);
  page.drawText(rceCode, { x: PAGE_W - M - rceTxtW, y: hy, font: fontBold, size: 7, color: MUTED });
  hy -= 13;

  // Linha 2: nome da clínica bold
  page.drawText(safeTxt(data.clinicaNome), { x: M, y: hy, font: fontBold, size: 9, color: DARK });
  hy -= 11;

  // Linha 3: endereço da clínica
  if (data.clinicaEndereco) {
    page.drawText(safeTxt(data.clinicaEndereco).slice(0, 82),
      { x: M, y: hy, font: fontReg, size: 6.5, color: MUTED });
    hy -= 10;
  }

  // Linha 4: telefone + médico (mesma linha)
  const telMedico = [
    data.clinicaTelefone ? `Tel: ${safeTxt(data.clinicaTelefone)}` : null,
    `Dr(a). ${safeTxt(data.medicoName)} — ${safeTxt(data.medicoCrm)}`,
  ].filter(Boolean).join("   ");
  page.drawText(telMedico, { x: M, y: hy, font: fontReg, size: 6.5, color: MUTED });
  hy -= 12;

  // Separador fino
  page.drawLine({ start: { x: M, y: hy }, end: { x: PAGE_W - M, y: hy }, thickness: 0.5, color: LINE });
  hy -= 14;

  // Título do documento CENTRALIZADO (estilo motor)
  const titW = fontBold.widthOfTextAtSize(tituloDoc, 11);
  page.drawText(tituloDoc, { x: (PAGE_W - titW) / 2, y: hy, font: fontBold, size: 11, color: DARK });
  hy -= 12;

  // Sub-linha: vias
  const viasStr = "1ª via - Farmácia  /  2ª via - Paciente";
  const viasW   = fontReg.widthOfTextAtSize(viasStr, 7);
  page.drawText(viasStr, { x: (PAGE_W - viasW) / 2, y: hy, font: fontReg, size: 7, color: MUTED });
  hy -= 10;

  // Sub-linha: validade + data emissão
  const validStr = `Validade: ${validade} dias  |  Emitido: ${dataFmt}`;
  const validW   = fontReg.widthOfTextAtSize(validStr, 6.5);
  page.drawText(validStr, { x: (PAGE_W - validW) / 2, y: hy, font: fontReg, size: 6.5, color: MUTED });
  hy -= 14;

  // Separador de fechamento do cabeçalho
  page.drawLine({ start: { x: M, y: hy }, end: { x: PAGE_W - M, y: hy }, thickness: 0.5, color: LINE });
  hy -= 6;

  // ── Helper: draw a labelled field in a box ────────────────────────────────
  // Returns the new y after drawing (decremented).
  function drawBoxField(
    bx: number, by: number,
    label: string,
    value: string | null | undefined,
    maxW: number,
    fR: PDFFont, fB: PDFFont,
  ): number {
    bx; // keep bx in scope for linter
    page.drawText(label, { x: bx + 5, y: by, font: fB, size: 5.5, color: MUTED });
    by -= 10;
    if (value && value.trim()) {
      const words = value.split(" ");
      let line = "";
      for (const word of words) {
        const cand = line ? `${line} ${word}` : word;
        if (fR.widthOfTextAtSize(cand, 7.5) > maxW - 10 && line) {
          page.drawText(line, { x: bx + 5, y: by, font: fR, size: 7.5, color: DARK });
          by -= 10;
          line = word;
        } else {
          line = cand;
        }
      }
      if (line) {
        page.drawText(line, { x: bx + 5, y: by, font: fR, size: 7.5, color: DARK });
        by -= 10;
      }
    } else {
      page.drawLine({
        start: { x: bx + 5, y: by + 3 }, end: { x: bx + maxW - 5, y: by + 3 },
        thickness: 0.3, color: LINE, dashArray: [1, 3], dashPhase: 0,
      });
      by -= 10;
    }
    return by - 3;
  }

  // ── BOX PAIR 1: Emitente | Paciente com arabescos POR TRÁS ──────────────
  // Espelha o motor ReceituarioPreview: faixa horizontal corre no centro
  // da área de boxes; boxes brancos são desenhados DEPOIS (z-order = na frente).
  const BOX_GAP = 8;
  const BOX_W   = (CW - BOX_GAP) / 2;   // ~257
  const BX1     = M;
  const BX2     = M + BOX_W + BOX_GAP;
  const BOX1_H  = 148;
  const TITLE_H = 15;
  const BOX_TOP = hy;   // usa o cursor hy do cabeçalho

  // 1. Arabescos PRIMEIRO (ficarão atrás dos boxes brancos)
  const ARABESQUE_H = 46;
  const ARABESQUE_MODELS_RASTER = [
    "padua-01-floral-islamico", "padua-02-floral-simetrico", "padua-03-rinceau-flamingo",
    "padua-04-acanto-florentino", "padua-05-ogival-moghul", "padua-06-rinceau-mandala",
    "padua-07-acanto-barroco", "padua-08-acanto-renascentista", "padua-09-rinceau-fino",
    "padua-10-acanto-floral", "padua-11-acanto-romantico",
  ];
  const bandId = data.bandModel ?? "padua-01-floral-islamico";
  if (ARABESQUE_MODELS_RASTER.includes(bandId)) {
    try {
      const pngPath = join(
        "/home/runner/workspace/artifacts/padcom/public/assets/arabesques",
        `${bandId}.png`,
      );
      const pngBytes = readFileSync(pngPath);
      const pngImage = await pdfDoc.embedPng(pngBytes);
      // Centraliza verticalmente na área dos boxes (igual ao motor HTML)
      const bandCenterY = BOX_TOP - BOX1_H / 2;
      const bandDrawY   = bandCenterY - ARABESQUE_H / 2;
      // Largura total da página — a faixa "sangra" nas margens como no motor
      page.drawImage(pngImage, { x: 0, y: bandDrawY, width: PAGE_W, height: ARABESQUE_H });
      page.drawLine({ start: { x: 0, y: bandDrawY + ARABESQUE_H }, end: { x: PAGE_W, y: bandDrawY + ARABESQUE_H }, thickness: 0.5, color: LINE });
      page.drawLine({ start: { x: 0, y: bandDrawY }, end: { x: PAGE_W, y: bandDrawY }, thickness: 0.5, color: LINE });
    } catch {
      // PNG não encontrado — segue sem arabesco
    }
  }

  // 2. Boxes brancos DEPOIS (cobrem a faixa onde os boxes ficam)
  page.drawRectangle({
    x: BX1, y: BOX_TOP - BOX1_H, width: BOX_W, height: BOX1_H,
    borderColor: LINE, borderWidth: 0.6, color: WHITE,
  });
  page.drawRectangle({
    x: BX2, y: BOX_TOP - BOX1_H, width: BOX_W, height: BOX1_H,
    borderColor: LINE, borderWidth: 0.6, color: WHITE,
  });

  // Barras de título dos boxes
  page.drawRectangle({ x: BX1, y: BOX_TOP - TITLE_H, width: BOX_W, height: TITLE_H, color: LIGHT });
  page.drawRectangle({ x: BX2, y: BOX_TOP - TITLE_H, width: BOX_W, height: TITLE_H, color: LIGHT });

  const t1 = "IDENTIFICAÇÃO DO EMITENTE";
  const t2 = "IDENTIFICAÇÃO DO PACIENTE";
  page.drawText(t1, {
    x: BX1 + (BOX_W - fontBold.widthOfTextAtSize(t1, 6)) / 2,
    y: BOX_TOP - 10, font: fontBold, size: 6, color: DARK,
  });
  page.drawText(t2, {
    x: BX2 + (BOX_W - fontBold.widthOfTextAtSize(t2, 6)) / 2,
    y: BOX_TOP - 10, font: fontBold, size: 6, color: DARK,
  });

  // Box 1: Emitente
  let fy1 = BOX_TOP - TITLE_H - 6;
  fy1 = drawBoxField(BX1, fy1, "Profissional / Prescritor:", data.medicoName, BOX_W, fontReg, fontBold);
  fy1 = drawBoxField(BX1, fy1, "Conselho:", data.medicoCrm, BOX_W, fontReg, fontBold);
  if (data.clinicaTelefone) {
    fy1 = drawBoxField(BX1, fy1, "Telefone:", data.clinicaTelefone, BOX_W, fontReg, fontBold);
  }
  if (data.clinicaEndereco) {
    drawBoxField(BX1, fy1, "Endereço:", data.clinicaEndereco.slice(0, 55), BOX_W, fontReg, fontBold);
  }

  // Box 2: Paciente — data de nascimento normalizada (aceita DD/MM/YYYY ou YYYY-MM-DD)
  let fy2 = BOX_TOP - TITLE_H - 6;
  fy2 = drawBoxField(BX2, fy2, "Nome Completo:", data.pacienteNome, BOX_W, fontReg, fontBold);
  let nascFmt: string | undefined;
  if (data.pacienteNascimento) {
    const n = data.pacienteNascimento.trim();
    // já está em DD/MM/YYYY — usar direto; se YYYY-MM-DD, converter
    nascFmt = /^\d{2}\/\d{2}\/\d{4}$/.test(n) ? n : fmtData(n);
  }
  const cpfNasc = [
    data.pacienteCpf  && `CPF: ${data.pacienteCpf}`,
    nascFmt           && `Nasc.: ${nascFmt}`,
  ].filter(Boolean).join("   ") || undefined;
  fy2 = drawBoxField(BX2, fy2, "CPF / Data de Nascimento:", cpfNasc, BOX_W, fontReg, fontBold);
  fy2 = drawBoxField(BX2, fy2, "Telefone:", data.pacienteTelefone, BOX_W, fontReg, fontBold);
  drawBoxField(BX2, fy2, "Endereço:", data.pacienteEndereco, BOX_W, fontReg, fontBold);

  let y = BOX_TOP - BOX1_H - 12;

  // ── Separator ─────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: LINE });
  y -= 16;

  // ── Prescrição ────────────────────────────────────────────────────────────
  page.drawText("Prescrevo:", { x: M, y, font: fontItal, size: 11, color: DARK });
  y -= 18;

  for (let i = 0; i < data.formulas.length; i++) {
    const f = data.formulas[i];
    const numStr  = `${String(i + 1).padStart(2, "0")}.`;

    page.drawText(numStr, { x: M, y, font: fontBold, size: 9, color: GOLD });
    page.drawText(`  ${safeTxt(f.nome).toUpperCase()}`,
      { x: M + 14, y, font: fontBold, size: 9, color: DARK });
    y -= 14;

    // Ativos (multi-line)
    if (f.ativos?.trim()) {
      for (const rawLine of f.ativos.split("\n")) {
        const ln = rawLine.trim();
        if (!ln) continue;
        y = drawWrappedText(page, `    ${ln}`, {
          x: M + 14, y, maxWidth: CW - 14,
          font: fontReg, size: 8, color: DARK, lineHeight: 11,
        });
      }
    }

    // Posologia (multi-line)
    if (f.posologia?.trim()) {
      for (const rawLine of f.posologia.split("\n")) {
        const ln = rawLine.trim();
        if (!ln) continue;
        y = drawWrappedText(page, `    ${ln}`, {
          x: M + 14, y, maxWidth: CW - 14,
          font: fontReg, size: 8, color: DARK, lineHeight: 11,
        });
      }
    }

    // Via / Forma
    const viaForma = [
      f.via   && `Via: ${f.via}`,
      f.forma && `Forma: ${f.forma}`,
    ].filter(Boolean).join("  |  ");
    if (viaForma) {
      page.drawText(`    ${viaForma}`, { x: M + 14, y, font: fontReg, size: 7.5, color: MUTED });
      y -= 11;
    }

    // Observação
    if (f.observacao?.trim()) {
      page.drawText(`    Obs.: ${safeTxt(f.observacao).slice(0, 90)}`,
        { x: M + 14, y, font: fontItal, size: 7.5, color: MUTED });
      y -= 11;
    }

    // Thin separator between formulas
    if (i < data.formulas.length - 1) {
      y -= 4;
      page.drawLine({
        start: { x: M + 14, y }, end: { x: PAGE_W - M, y },
        thickness: 0.3, color: LINE, dashArray: [2, 4], dashPhase: 0,
      });
      y -= 8;
    } else {
      y -= 6;
    }
  }

  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: LINE });
  y -= 26;

  // ── Assinatura ────────────────────────────────────────────────────────────
  const SIG_W = 190;
  page.drawLine({
    start: { x: M, y }, end: { x: M + SIG_W, y }, thickness: 0.7, color: DARK,
  });
  y -= 13;
  page.drawText(safeTxt(data.medicoName), { x: M, y, font: fontBold, size: 9, color: DARK });
  y -= 12;
  page.drawText(safeTxt(data.medicoCrm), { x: M, y, font: fontReg, size: 8, color: MUTED });

  const dateCity = `São Paulo, ${dataFmt}`;
  page.drawText(dateCity, {
    x: PAGE_W - M - fontReg.widthOfTextAtSize(dateCity, 8), y,
    font: fontReg, size: 8, color: MUTED,
  });
  y -= 22;

  // ── BOX PAIR 2: Comprador | Fornecedor (apenas controle especial) ─────────
  if (tipo === "especial") {
    const BOX2_H  = 118;
    const BOX3_TOP = y;

    page.drawRectangle({
      x: BX1, y: BOX3_TOP - BOX2_H, width: BOX_W, height: BOX2_H,
      borderColor: LINE, borderWidth: 0.6, color: WHITE,
    });
    page.drawRectangle({
      x: BX2, y: BOX3_TOP - BOX2_H, width: BOX_W, height: BOX2_H,
      borderColor: LINE, borderWidth: 0.6, color: WHITE,
    });
    page.drawRectangle({ x: BX1, y: BOX3_TOP - TITLE_H, width: BOX_W, height: TITLE_H, color: LIGHT });
    page.drawRectangle({ x: BX2, y: BOX3_TOP - TITLE_H, width: BOX_W, height: TITLE_H, color: LIGHT });

    const t3 = "IDENTIFICAÇÃO DO COMPRADOR";
    const t4 = "IDENTIFICAÇÃO DO FORNECEDOR";
    page.drawText(t3, {
      x: BX1 + (BOX_W - fontBold.widthOfTextAtSize(t3, 6)) / 2,
      y: BOX3_TOP - 10, font: fontBold, size: 6, color: DARK,
    });
    page.drawText(t4, {
      x: BX2 + (BOX_W - fontBold.widthOfTextAtSize(t4, 6)) / 2,
      y: BOX3_TOP - 10, font: fontBold, size: 6, color: DARK,
    });

    let c3y = BOX3_TOP - TITLE_H - 6;
    c3y = drawBoxField(BX1, c3y, "Nome:", undefined, BOX_W, fontReg, fontBold);
    c3y = drawBoxField(BX1, c3y, "Endereço:", undefined, BOX_W, fontReg, fontBold);
    c3y = drawBoxField(BX1, c3y, "Cidade / UF:", undefined, BOX_W, fontReg, fontBold);
    drawBoxField(BX1, c3y, "Identidade Nº / Órgão Emissor:", undefined, BOX_W, fontReg, fontBold);

    let c4y = BOX3_TOP - TITLE_H - 6;
    c4y = drawBoxField(BX2, c4y, "Assinatura do Farmacêutico:", undefined, BOX_W, fontReg, fontBold);
    c4y = drawBoxField(BX2, c4y, "Data de Dispensação:", undefined, BOX_W, fontReg, fontBold);
    drawBoxField(BX2, c4y, "Nº CRF:", undefined, BOX_W, fontReg, fontBold);

    y = BOX3_TOP - BOX2_H - 10;
  }

  // ── Footer NAVY ───────────────────────────────────────────────────────────
  const FOOTER_H = 38;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: NAVY });
  page.drawRectangle({ x: 0, y: FOOTER_H - 2, width: PAGE_W, height: 1.5, color: GOLD });
  page.drawText(
    "PAXTER Clinical Intelligence System — Documento gerado e assinado digitalmente (ICP-Brasil / PAdES)",
    { x: M, y: 20, font: fontReg, size: 6.5, color: CYAN },
  );
  page.drawText(
    `${safeTxt(data.clinicaNome)} — CNPJ registrado`,
    { x: M, y: 9, font: fontReg, size: 6, color: MUTED },
  );

  return signPdfBytes(pdfDoc, safeTxt(data.medicoName));
}
