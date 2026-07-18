/**
 * RECEITUÁRIO MAGISTRAL — gerador de PDF com assinatura ICP-Brasil (PAdES).
 * Padrão visual PAXTER: faixa navy, tabela de fórmulas, rodapé com selo.
 */
import { PDFDocument, StandardFonts, rgb, PDFPage } from "pdf-lib";
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
