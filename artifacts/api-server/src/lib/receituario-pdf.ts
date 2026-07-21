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
  medicoRqe?: string;           // RQE do médico (ex: "12.345")
  clinicaNome: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;

  // Box 2 — Paciente
  pacienteNome?: string;
  pacienteCpf?: string;
  pacienteNascimento?: string;   // YYYY-MM-DD ou DD/MM/YYYY
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
  bandModel?: string;     // id do modelo arabesco (ex: "padua-01-floral-islamico")

  // Títulos dos boxes (opcional — usa defaults ANVISA se omitido)
  boxMedicoTitulo?: string;
  boxPacienteTitulo?: string;
  boxCompradorTitulo?: string;
  boxFarmaciaTitulo?: string;

  // Título e assinatura
  tituloSubtitulo?: string;         // ex: "MODELO DEMONSTRATIVO — SEM VALIDADE"
  assinaturaTextoFallback?: string; // ex: "Caio H. Pádua" (cursivo acima da linha)

  // Rodapé: até 4 linhas de texto à esquerda (endereço, CNPJ, etc.)
  rodapeLinhas?: string[];
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
  const M  = 36;
  const CW = PAGE_W - M * 2; // ≈ 523

  const dataStr   = data.dataEmissao ?? hoje();
  const dataFmt   = fmtData(dataStr);
  const tipo      = data.tipoReceita ?? "especial";
  const tituloDoc = tipo === "especial"
    ? "RECEITUÁRIO DE CONTROLE ESPECIAL"
    : "RECEITUÁRIO SIMPLES — FÓRMULAS MANIPULADAS";

  // Data por extenso para o bloco de assinatura
  const MESES = [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro",
  ];
  const [ano, mes, dia] = dataStr.split("-");
  const dataExtenso = `${parseInt(dia, 10)} de ${MESES[parseInt(mes, 10) - 1] ?? ""} de ${ano}`;

  // Linha CRM + RQE usada em cabeçalho e assinatura
  const crmRqeStr = data.medicoCrm
    ? (data.medicoRqe ? `${data.medicoCrm} — RQE: ${data.medicoRqe}` : data.medicoCrm)
    : "";

  // ── Helpers internos ──────────────────────────────────────────────────────
  function wrapLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const words = safeTxt(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if ((font as any).widthOfTextAtSize(cand, size) > maxW && cur) {
        lines.push(cur); cur = w;
      } else { cur = cand; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  /**
   * Rótulo em maiúsculas muted 6pt + valor dark 7pt (ou linha pontilhada).
   * bold=true usa fontBold para o valor — aplicar no campo de nome (destaque).
   * Retorna novo y após o campo (campo ocupa ~19pt total).
   */
  function drawField(
    bx: number, by: number, label: string,
    value: string | null | undefined,
    maxW: number,
    opts: { bold?: boolean; valueSize?: number } = {},
  ): number {
    const vSize = opts.valueSize ?? 7;
    const vFont = opts.bold ? fontBold : fontReg;
    // Rótulo: 6pt bold #555, letterSpacing via espaçamento manual entre palavras
    page.drawText(`${label.toUpperCase()}:`, {
      x: bx, y: by, font: fontBold, size: 6, color: MUTED,
    });
    by -= 9;
    if (value?.trim()) {
      for (const ln of wrapLines(value, vFont, vSize, maxW)) {
        page.drawText(ln, { x: bx, y: by, font: vFont, size: vSize, color: DARK });
        by -= (vSize + 2);
      }
    } else {
      // Linha pontilhada: 0.4px dotted #bbb (motor: borderBottom dotted #bbb)
      page.drawLine({
        start: { x: bx, y: by + 2 }, end: { x: bx + maxW, y: by + 2 },
        thickness: 0.4, color: rgb(0.73, 0.73, 0.73), dashArray: [1, 2.5], dashPhase: 0,
      });
      by -= 10;
    }
    return by - 2;
  }

  /**
   * Linha inline de múltiplas colunas — gap 6mm entre colunas (motor: gap "0 6mm").
   * Retorna novo y.
   */
  function drawInlineRow(
    bx: number, by: number,
    cols: { label: string; value?: string | null }[],
    totalW: number,
  ): number {
    const GAP  = 6;  // gap em pt entre colunas (≈ 6mm seria 17pt mas comprimimos)
    const nCols = cols.length;
    const colW = (totalW - GAP * (nCols - 1)) / nCols;
    for (let i = 0; i < nCols; i++) {
      const cx = bx + i * (colW + GAP);
      const c  = cols[i];
      page.drawText(`${c.label.toUpperCase()}:`, {
        x: cx, y: by, font: fontBold, size: 6, color: MUTED,
      });
      const vy = by - 9;
      if (c.value?.trim()) {
        let txt = safeTxt(c.value);
        while (txt.length > 1 && (fontReg as any).widthOfTextAtSize(txt, 7) > colW - 2) {
          txt = txt.slice(0, -1);
        }
        page.drawText(txt, { x: cx, y: vy, font: fontReg, size: 7, color: DARK });
      } else {
        page.drawLine({
          start: { x: cx, y: vy + 2 }, end: { x: cx + colW - 2, y: vy + 2 },
          thickness: 0.4, color: rgb(0.73, 0.73, 0.73), dashArray: [1, 2.5], dashPhase: 0,
        });
      }
    }
    return by - 9 - 9 - 3;
  }

  /** Linha decorativa fina — igual ao <LinhaDecorativa/> do motor. */
  function drawDecorLine(y: number): void {
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.4, color: LINE });
  }

  // ── Arabesco: carrega o PNG uma só vez, reutiliza nas duas faixas ─────────
  const ARAB_IDS = [
    "padua-01-floral-islamico","padua-02-floral-simetrico","padua-03-rinceau-flamingo",
    "padua-04-acanto-florentino","padua-05-ogival-moghul","padua-06-rinceau-mandala",
    "padua-07-acanto-barroco","padua-08-acanto-renascentista","padua-09-rinceau-fino",
    "padua-10-acanto-floral","padua-11-acanto-romantico",
  ];
  const bandId = data.bandModel ?? "padua-01-floral-islamico";
  let arabImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  try {
    if (ARAB_IDS.includes(bandId)) {
      const buf = readFileSync(join(
        "/home/runner/workspace/artifacts/padcom/public/assets/arabesques",
        `${bandId}.png`,
      ));
      arabImg = await pdfDoc.embedPng(buf);
    }
  } catch { /* sem arabesco — continua */ }

  const ARAB_H = 46; // altura da faixa em pontos

  /** Desenha a faixa arabesca ATRÁS dos boxes (full-width, centralizada no bloco). */
  function drawArabBand(boxTop: number, boxH: number): void {
    if (!arabImg) return;
    const cy    = boxTop - boxH / 2;
    const bandY = cy - ARAB_H / 2;
    page.drawImage(arabImg, { x: 0, y: bandY, width: PAGE_W, height: ARAB_H });
    page.drawLine({ start: { x: 0, y: bandY + ARAB_H }, end: { x: PAGE_W, y: bandY + ARAB_H }, thickness: 0.5, color: LINE });
    page.drawLine({ start: { x: 0, y: bandY         }, end: { x: PAGE_W, y: bandY         }, thickness: 0.5, color: LINE });
  }

  /** Desenha o par de boxes (D06 corrigido: borda escura #454545 + faixinha lateral ciano). */
  // Borda escura: rgb(0.27, 0.27, 0.27) = #454545 (motor: border 1px #454545)
  const BOX_BORDER = rgb(0.27, 0.27, 0.27);
  // Faixinha lateral esquerda: 3pt de largura, cor ciano da marca (#45B8CC)
  const BOX_STRIP  = rgb(0.271, 0.722, 0.800); // #45B8CC
  const STRIP_W    = 3;

  function drawBoxPair(
    boxTop: number, boxH: number, titleH: number,
    bx1: number, bx2: number, boxW: number,
    titulo1: string, titulo2: string,
  ): void {
    for (const [bx, titulo] of [[bx1, titulo1], [bx2, titulo2]] as [number, string][]) {
      // ① Caixa principal branca — borda escura #454545, borderWidth 0.8
      page.drawRectangle({ x: bx, y: boxTop - boxH, width: boxW, height: boxH,
        color: WHITE, borderColor: BOX_BORDER, borderWidth: 0.8 });

      // ② Faixinha lateral esquerda ciano (3pt) — cobre a borda esq. da caixa
      page.drawRectangle({ x: bx, y: boxTop - boxH, width: STRIP_W, height: boxH,
        color: BOX_STRIP });

      // ③ Título: texto centralizado bold 7pt (motor: fontSize:7 fontWeight:700)
      //    SEM fill rect — apenas linha pontilhada ABAIXO do texto (motor: borderBottom 0.4px #ddd)
      const tW = (fontBold as any).widthOfTextAtSize(titulo, 7);
      page.drawText(titulo, {
        x: bx + (boxW - tW) / 2, y: boxTop - 11,
        font: fontBold, size: 7, color: rgb(0.13, 0.13, 0.13),
      });
      // Linha separadora abaixo do título (motor: borderBottom: "0.4px solid #ddd")
      const titleLineY = boxTop - titleH;
      page.drawLine({
        start: { x: bx + STRIP_W + 2, y: titleLineY },
        end:   { x: bx + boxW - 2,    y: titleLineY },
        thickness: 0.4, color: rgb(0.87, 0.87, 0.87),
      });
    }
  }

  // ── Constantes de layout ──────────────────────────────────────────────────
  const BOX_GAP  = 8;
  const BOX_W    = (CW - BOX_GAP) / 2; // ≈ 257
  const BX1      = M;
  const BX2      = M + BOX_W + BOX_GAP;
  const TITLE_H  = 14;

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CABEÇALHO (motor: logo LEFT + nome + subtítulo  |  RCE + vias RIGHT)
  // ══════════════════════════════════════════════════════════════════════════
  let y = PAGE_H - M;

  // Placeholder de logo (motor: caixa dashed 48×36 → 34×26 em pt)
  page.drawRectangle({ x: M, y: y - 26, width: 34, height: 26,
    color: LIGHT, borderColor: LINE, borderWidth: 0.4 });
  page.drawText("LOGO", { x: M + 9, y: y - 16, font: fontReg, size: 5, color: MUTED });

  // Nome da clínica bold 13pt (motor: fontWeight 800, fontSize 13)
  page.drawText(safeTxt(data.clinicaNome), {
    x: M + 40, y: y - 11, font: fontBold, size: 13, color: DARK,
  });
  // Subtítulo: cabecalhoTitulo (motor: fontSize 7, letterSpacing 1.5, color #666)
  if (data.clinicaEndereco) {
    page.drawText(safeTxt(data.clinicaEndereco).slice(0, 75),
      { x: M + 40, y: y - 25, font: fontReg, size: 7, color: MUTED });
  }
  // D05 REMOVIDO: linha médico/CRM não existe no cabeçalho do motor

  // RCE code + vias (lado DIREITO — motor: textAlign right, stack de linhas)
  const rce  = data.numeroReceita ? `Nº ${data.numeroReceita}` : `RCE: ${ano}`;
  const rceW = (fontBold as any).widthOfTextAtSize(rce, 7);
  page.drawText(rce,
    { x: PAGE_W - M - rceW, y: y - 11, font: fontBold, size: 7, color: MUTED });
  const via1 = "1ª via - Farmácia";
  const via2 = "2ª via - Paciente";
  page.drawText(via1,
    { x: PAGE_W - M - (fontReg as any).widthOfTextAtSize(via1, 6), y: y - 21, font: fontReg, size: 6, color: MUTED });
  page.drawText(via2,
    { x: PAGE_W - M - (fontReg as any).widthOfTextAtSize(via2, 6), y: y - 30, font: fontReg, size: 6, color: MUTED });

  y -= 42;
  drawDecorLine(y);
  y -= 12;

  // ══════════════════════════════════════════════════════════════════════════
  // 2. TÍTULO DO DOCUMENTO (motor: centrado bold 16px uppercase letterSpacing 2)
  // ══════════════════════════════════════════════════════════════════════════
  // D07 corrigido: size 16 (motor usa fontSize 16, fontWeight 800)
  const titW = (fontBold as any).widthOfTextAtSize(tituloDoc, 16);
  page.drawText(tituloDoc,
    { x: (PAGE_W - titW) / 2, y, font: fontBold, size: 16, color: DARK });
  y -= 18;
  // D10 corrigido: tituloSubtitulo abaixo do título (motor: fontSize 7, letterSpacing 2, color MUTED)
  if (data.tituloSubtitulo?.trim()) {
    const subW = (fontReg as any).widthOfTextAtSize(data.tituloSubtitulo.toUpperCase(), 7);
    page.drawText(data.tituloSubtitulo.toUpperCase(),
      { x: (PAGE_W - subW) / 2, y, font: fontReg, size: 7, color: MUTED });
    y -= 10;
  } else {
    y -= 4;
  }
  drawDecorLine(y);
  y -= 10;

  // ══════════════════════════════════════════════════════════════════════════
  // 3. FAIXA SUPERIOR — Box 1 (Emitente) + Box 2 (Paciente)
  //    Arabescos ATRÁS; boxes brancos NA FRENTE. (motor: BandaComBoxes)
  // ══════════════════════════════════════════════════════════════════════════
  const BOX1_H   = 116;
  const BOX1_TOP = y;

  drawArabBand(BOX1_TOP, BOX1_H);
  drawBoxPair(BOX1_TOP, BOX1_H, TITLE_H, BX1, BX2, BOX_W,
    data.boxMedicoTitulo   ?? "IDENTIFICAÇÃO DO EMITENTE",
    data.boxPacienteTitulo ?? "IDENTIFICAÇÃO DO PACIENTE",
  );

  // Padding interno dos boxes — motor: padding "3mm 4mm" = ~8.5pt top / ~11.3pt left
  const BP_L = 11;   // 4mm left padding (do extremo esquerdo do box, incl. faixinha)
  const BP_T = 8;    // 3mm top padding abaixo da linha do título

  // Box 1 — Emitente (motor: emitentRows)
  {
    const iW = BOX_W - BP_L - 6; // largura interna para campos
    let fy = BOX1_TOP - TITLE_H - BP_T;

    // ROW 1: Profissional/Prescritor — BOLD 8pt para destacar o nome (CEO req.)
    fy = drawField(BX1 + BP_L, fy, "Profissional/Prescritor",
      data.medicoName, iW, { bold: true, valueSize: 8 });

    // ROW 2 inline 3 cols: Conselho | RQE | Telefone
    fy = drawInlineRow(BX1 + BP_L, fy,
      [
        { label: "Conselho",  value: data.medicoCrm },
        { label: "RQE",       value: data.medicoRqe },
        { label: "Telefone",  value: data.clinicaTelefone },
      ], iW);

    // ROW 3 single: Endereço do Consultório
    drawField(BX1 + BP_L, fy, "Endereço do Consultório", data.clinicaEndereco, iW);
  }

  // Box 2 — Paciente (motor: pacienteRows)
  {
    const iW = BOX_W - BP_L - 6;
    let fy = BOX1_TOP - TITLE_H - BP_T;

    // Normaliza nascimento: aceita DD/MM/YYYY ou YYYY-MM-DD
    let nasc: string | undefined;
    if (data.pacienteNascimento?.trim()) {
      const n = data.pacienteNascimento.trim();
      nasc = /^\d{2}\/\d{2}\/\d{4}$/.test(n) ? n : fmtData(n);
    }

    // ROW 1: Nome Completo — BOLD 8pt para destacar o nome do paciente (CEO req.)
    fy = drawField(BX2 + BP_L, fy, "Nome Completo",
      data.pacienteNome, iW, { bold: true, valueSize: 8 });

    // ROW 2 inline 3 cols: CPF | Nascimento | Telefone
    fy = drawInlineRow(BX2 + BP_L, fy,
      [
        { label: "CPF",        value: data.pacienteCpf },
        { label: "Nascimento", value: nasc },
        { label: "Telefone",   value: data.pacienteTelefone },
      ], iW);

    // ROW 3 single: Endereço Completo
    drawField(BX2 + BP_L, fy, "Endereço Completo", data.pacienteEndereco, iW);
  }

  y = BOX1_TOP - BOX1_H - 8;

  // ══════════════════════════════════════════════════════════════════════════
  // 4. CORPO / FÓRMULAS (motor: "Prescrevo:" italic + FormulaReal)
  // ══════════════════════════════════════════════════════════════════════════
  page.drawText("Prescrevo:", { x: M, y, font: fontItal, size: 11, color: DARK });
  y -= 16;

  // Verde posologia (motor: color #0a7a6e)
  const VERDE = rgb(0.039, 0.478, 0.431);

  for (let i = 0; i < data.formulas.length; i++) {
    const f   = data.formulas[i];
    const num = String(i + 1).padStart(2, "0");

    // D03 corrigido: número MUTED (cinza #555), NÃO dourado
    // D04 corrigido: nome preserva case original (NÃO força uppercase)
    page.drawText(`${num}.`, { x: M, y, font: fontBold, size: 9, color: MUTED });
    page.drawText(`  ${safeTxt(f.nome)}`,
      { x: M + 14, y, font: fontBold, size: 10, color: DARK });
    y -= 13;

    // D01 corrigido: Via | Forma vêm ANTES dos ativos (motor: FormulaReal linha 198-213)
    if (f.via || f.forma) {
      const viaCols = [
        f.via   ? { label: "Via",   value: f.via }   : null,
        f.forma ? { label: "Forma", value: f.forma } : null,
      ].filter(Boolean) as { label: string; value: string }[];
      const colW = 60;
      for (let ci = 0; ci < viaCols.length; ci++) {
        const cx = M + 26 + ci * colW;
        const c  = viaCols[ci];
        page.drawText(c.label.toUpperCase(),
          { x: cx, y, font: fontBold, size: 5.5, color: rgb(0.67, 0.67, 0.67) });
        page.drawText(c.value,
          { x: cx, y: y - 9, font: fontBold, size: 7, color: rgb(0.20, 0.20, 0.20) });
      }
      y -= 20;
    }

    // Ativos — fonte monospace-like (motor: fontFamily monospace, fontSize 8)
    if (f.ativos?.trim()) {
      for (const raw of f.ativos.split("\n")) {
        const ln = raw.trim();
        if (!ln) continue;
        y = drawWrappedText(page, `  ${ln}`, {
          x: M + 14, y, maxWidth: CW - 14, font: fontReg, size: 8, color: DARK, lineHeight: 11,
        });
      }
    }

    // D02 corrigido: posologia com ▸ prefix + cor verde #0a7a6e (motor: linha 220-222)
    if (f.posologia?.trim()) {
      for (const raw of f.posologia.split("\n")) {
        const ln = raw.trim();
        if (!ln) continue;
        y = drawWrappedText(page, `  >> ${ln}`, {
          x: M + 14, y, maxWidth: CW - 14, font: fontBold, size: 7, color: VERDE, lineHeight: 10,
        });
      }
    }

    // Observação (italic muted) — mantida
    if (f.observacao?.trim()) {
      page.drawText(`  Obs.: ${safeTxt(f.observacao).slice(0, 90)}`,
        { x: M + 14, y, font: fontItal, size: 7.5, color: MUTED });
      y -= 11;
    }

    // Separador pontilhado entre fórmulas
    if (i < data.formulas.length - 1) {
      y -= 4;
      page.drawLine({ start: { x: M + 14, y }, end: { x: PAGE_W - M, y },
        thickness: 0.3, color: LINE, dashArray: [2, 4], dashPhase: 0 });
      y -= 8;
    } else {
      y -= 6;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. ASSINATURA + CERTIFICADO — LADO A LADO (motor: flex row, gap 8mm)
  // ══════════════════════════════════════════════════════════════════════════
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.3, color: LIGHT });
  y -= 14;

  const SIG_W       = 155;
  const CERT_X      = M + SIG_W + 10;
  const CERT_W      = CW - SIG_W - 10;
  const CERT_H      = 64;
  const sigTopY     = y;

  // ESQUERDA: assinatura (D08 corrigido: texto cursivo italic 18pt ANTES da linha)
  // Motor: Georgia italic 18px, cor DARK, posição acima da linha horizontal
  {
    const sigTxt = safeTxt(data.assinaturaTextoFallback ?? data.medicoName ?? "Assinatura");
    page.drawText(sigTxt.slice(0, 28),
      { x: M, y: y + 18, font: fontItal, size: 18, color: DARK });
  }
  page.drawLine({ start: { x: M, y }, end: { x: M + 130, y },
    thickness: 0.5, color: DARK });
  y -= 10;
  page.drawText(safeTxt(data.medicoName),
    { x: M, y, font: fontBold, size: 8, color: DARK });
  y -= 10;
  page.drawText(crmRqeStr,
    { x: M, y, font: fontReg, size: 7, color: MUTED });
  y -= 10;
  page.drawText(`São Paulo, ${dataExtenso}`,
    { x: M, y, font: fontReg, size: 7, color: MUTED });

  // DIREITA: BlocoCertificado (motor: título + 4 campos + QR placeholder)
  page.drawRectangle({ x: CERT_X, y: sigTopY - CERT_H, width: CERT_W, height: CERT_H,
    color: WHITE, borderColor: LINE, borderWidth: 0.5 });
  const certTitulo = "DOCUMENTO ASSINADO ELETRONICAMENTE";
  const certTitW   = (fontBold as any).widthOfTextAtSize(certTitulo, 5.5);
  page.drawText(certTitulo,
    { x: CERT_X + (CERT_W - certTitW) / 2, y: sigTopY - 10,
      font: fontBold, size: 5.5, color: DARK });
  const certFields: [string, string][] = [
    ["Assinante",   safeTxt(data.medicoName)],
    ["Certificado", crmRqeStr || safeTxt(data.medicoCrm)],
    ["Assinado em", dataFmt],
    ["Verificação", "paxter.med.br/verificar"],
  ];
  let certY = sigTopY - 20;
  for (const [k, v] of certFields) {
    page.drawText(`${k}:`,
      { x: CERT_X + 5, y: certY, font: fontBold, size: 5, color: MUTED });
    page.drawText(v.slice(0, 55),
      { x: CERT_X + 38, y: certY, font: fontReg, size: 5.5, color: DARK });
    certY -= 8;
  }
  // QR placeholder (canto inferior direito do bloco)
  page.drawRectangle({ x: CERT_X + CERT_W - 32, y: sigTopY - CERT_H + 4,
    width: 28, height: 28, borderColor: LINE, borderWidth: 0.4 });
  page.drawText("QR",
    { x: CERT_X + CERT_W - 24, y: sigTopY - CERT_H + 14,
      font: fontReg, size: 6, color: LIGHT });

  y = sigTopY - CERT_H - 12;

  // ══════════════════════════════════════════════════════════════════════════
  // 6. FAIXA INFERIOR — Box 3 (Comprador) + Box 4 (Fornecedor/Farmácia)
  //    Apenas receituário especial. Arabescos ATRÁS. (motor: BandaComBoxes)
  // ══════════════════════════════════════════════════════════════════════════
  if (tipo === "especial") {
    const BOX2_H   = 120;
    const BOX2_TOP = y;

    drawArabBand(BOX2_TOP, BOX2_H);
    drawBoxPair(BOX2_TOP, BOX2_H, TITLE_H, BX1, BX2, BOX_W,
      data.boxCompradorTitulo ?? "IDENTIFICAÇÃO DO COMPRADOR",
      data.boxFarmaciaTitulo  ?? "IDENTIFICAÇÃO DO FORNECEDOR / FARMÁCIA",
    );

    // Box 3 — Comprador (motor: compradorRows — 5 linhas)
    // Labels do screenshot: "Nome", "Endereço", "Cidade" | "UF", "Ident." | "Org. Emissor", "Telefone"
    {
      const iW = BOX_W - BP_L - 6;
      let fy = BOX2_TOP - TITLE_H - BP_T;

      fy = drawField(BX1 + BP_L, fy, "Nome",     undefined, iW);
      fy = drawField(BX1 + BP_L, fy, "Endereço", undefined, iW);
      // Cidade | UF — coluna UF estreita (motor: repeat(2,1fr))
      fy = drawInlineRow(BX1 + BP_L, fy,
        [{ label: "Cidade" }, { label: "UF" }], iW);
      // Ident. | Org. Emissor — abreviados para caber (screenshot: "Ident." + "Org. Emissor")
      fy = drawInlineRow(BX1 + BP_L, fy,
        [{ label: "Ident." }, { label: "Org. Emissor" }], iW);
      drawField(BX1 + BP_L, fy, "Telefone", undefined, iW);
    }

    // Box 4 — Fornecedor/Farmácia (motor: fornecedorRows — 2 campos ANCORADOS NO FUNDO)
    // CEO: "no box 4 a posição dos campos está no FUNDO" — âncora bottom-up
    {
      const iW = BOX_W - BP_L - 6;
      const boxBottom = BOX2_TOP - BOX2_H;
      // 2 campos × ~19pt + 9pt padding no fundo → começa em boxBottom + 47
      // drawField: label 6pt (-9pt) + value/linha (-10pt) + gap (-2pt) = -21pt por campo
      const FIELD_H = 21;
      const BOT_PAD = 9;  // ~3mm fundo
      const fyStart = boxBottom + BOT_PAD + 2 * FIELD_H; // ≈ boxBottom + 51

      let fy = fyStart;
      fy = drawField(BX2 + BP_L, fy, "Assinatura do Farmacêutico", undefined, iW);
      drawField(BX2 + BP_L, fy, "Data", undefined, iW);
    }

    y = BOX2_TOP - BOX2_H - 8;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. RODAPÉ — fundo BRANCO, borda fina no topo (motor: posição absoluta)
  //    LEFT: rodapeLinhas  |  RIGHT: "PAXTER" ouro + subtítulo
  // ══════════════════════════════════════════════════════════════════════════
  const FOOTER_LINE_Y = 30;
  const FOOTER_TOP    = FOOTER_LINE_Y + 34;

  page.drawLine({ start: { x: M, y: FOOTER_TOP }, end: { x: PAGE_W - M, y: FOOTER_TOP },
    thickness: 0.3, color: LINE });

  // Linhas à esquerda
  const rodapeLinhas = (data.rodapeLinhas?.length)
    ? data.rodapeLinhas
    : [
        safeTxt(data.clinicaNome),
        ...(data.clinicaEndereco ? [safeTxt(data.clinicaEndereco)] : []),
        ...(data.clinicaTelefone ? [`Tel: ${safeTxt(data.clinicaTelefone)}`] : []),
        "Documento assinado digitalmente — ICP-Brasil / PAdES",
      ];
  let rl_y = FOOTER_TOP - 5;
  rodapeLinhas.slice(0, 4).forEach((linha, i) => {
    page.drawText(safeTxt(linha).slice(0, 72), {
      x: M, y: rl_y,
      font: fontReg, size: i === 0 ? 5.5 : 5, color: i === 0 ? DARK : MUTED,
    });
    rl_y -= 7;
  });

  // PAXTER wordmark à direita (D09 corrigido: PNG oficial, fallback texto ouro)
  {
    let drewPng = false;
    try {
      const wmarkBuf = readFileSync(
        "/home/runner/workspace/artifacts/padcom/public/brand/paxter-wordmark.png"
      );
      const wmarkImg  = await pdfDoc.embedPng(wmarkBuf);
      // Escala proporcional: altura alvo = 22pt
      const wmarkH    = 22;
      const wmarkW    = (wmarkImg.width / wmarkImg.height) * wmarkH;
      const wmarkX    = PAGE_W - M - wmarkW;
      page.drawImage(wmarkImg, { x: wmarkX, y: FOOTER_TOP - wmarkH - 2, width: wmarkW, height: wmarkH });
      drewPng = true;
    } catch { /* fallback abaixo */ }

    if (!drewPng) {
      const paxterW = (fontBold as any).widthOfTextAtSize("PAXTER", 9);
      const subTxt  = "Clinical Intelligence System";
      const subW    = (fontReg as any).widthOfTextAtSize(subTxt, 5);
      const rightX  = PAGE_W - M - Math.max(paxterW, subW);
      page.drawText("PAXTER",
        { x: rightX, y: FOOTER_TOP - 6, font: fontBold, size: 9, color: GOLD });
      page.drawText(subTxt,
        { x: rightX, y: FOOTER_TOP - 15, font: fontReg, size: 5, color: MUTED });
    }
  }

  return signPdfBytes(pdfDoc, safeTxt(data.medicoName));
}
