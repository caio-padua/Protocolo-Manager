// Geração de PDF de SOLICITAÇÃO DE EXAMES (ONDA B).
// Um PDF por TIPO (SANGUE / IMAGEM / OUTROS): exames de tipos diferentes nunca
// se misturam no mesmo documento. Mesma identidade visual das receitas.
import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";

const PETROLEO = rgb(0.24, 0.48, 0.48);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.4, 0.4, 0.4);

export interface ExamRequestItem {
  nomeExame: string;
  codigoExame?: string | null;
  grupoPrincipal?: string | null;
  preparo?: string | null;
}

export interface ExamRequestPdfContext {
  tipo: string;
  tipoLabel: string;
  clientName: string;
  clientCpf?: string | null;
  professionalName?: string | null;
  professionalCrm?: string | null;
  dateBR: string;
  observacao?: string | null;
  items: ExamRequestItem[];
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.trim() === "") {
      out.push("");
      continue;
    }
    const words = rawLine.split(/\s+/);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export async function generateExamRequestPdf(ctx: ExamRequestPdfContext): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595.28;
  const pageH = 841.89;
  const marginX = 50;
  const contentW = pageW - marginX * 2;

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - 50;

  const ensureSpace = (needed: number) => {
    if (y - needed < 60) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - 50;
    }
  };

  const drawLine = (text: string, size: number, useFont: PDFFont, color = DARK, indent = 0) => {
    ensureSpace(size + 4);
    page.drawText(text, { x: marginX + indent, y, size, font: useFont, color });
    y -= size + 4;
  };

  // Cabeçalho clínica
  page.drawRectangle({ x: 0, y: pageH - 6, width: pageW, height: 6, color: PETROLEO });
  drawLine("INSTITUTO PADUA — Protocolos Injetáveis", 16, fontBold, PETROLEO);
  drawLine("SOLICITAÇÃO DE EXAMES", 13, fontBold, DARK);
  y -= 2;

  // Faixa do tipo
  ensureSpace(24);
  page.drawRectangle({ x: marginX, y: y - 4, width: contentW, height: 20, color: PETROLEO });
  page.drawText(`EXAMES — ${ctx.tipoLabel.toUpperCase()}`, {
    x: marginX + 8,
    y: y + 2,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  y -= 32;

  // Dados do paciente / médico / data
  drawLine(`Paciente: ${ctx.clientName}${ctx.clientCpf ? `  •  CPF: ${ctx.clientCpf}` : ""}`, 10, font, DARK);
  drawLine(`Médico: ${ctx.professionalName ?? "-"}${ctx.professionalCrm ? `  •  CRM: ${ctx.professionalCrm}` : ""}`, 10, font, DARK);
  drawLine(`Data: ${ctx.dateBR}`, 10, font, GRAY);
  y -= 6;

  // Lista de exames
  drawLine("Solicito a realização dos seguintes exames:", 10, fontBold, DARK);
  y -= 4;

  let idx = 1;
  for (const item of ctx.items) {
    ensureSpace(16);
    const titleLines = wrapText(`${idx}. ${item.nomeExame}`, fontBold, 11, contentW);
    for (const l of titleLines) {
      ensureSpace(14);
      page.drawText(l, { x: marginX, y, size: 11, font: fontBold, color: DARK });
      y -= 14;
    }
    if (item.preparo && item.preparo.trim()) {
      for (const l of wrapText(`Preparo: ${item.preparo}`, font, 9, contentW - 12)) {
        ensureSpace(11);
        page.drawText(l, { x: marginX + 12, y, size: 9, font, color: PETROLEO });
        y -= 11;
      }
    }
    y -= 6;
    idx++;
  }

  // Observação
  if (ctx.observacao && ctx.observacao.trim()) {
    y -= 4;
    drawLine("Observações:", 10, fontBold, DARK);
    for (const l of wrapText(ctx.observacao, font, 9, contentW - 12)) {
      ensureSpace(11);
      page.drawText(l, { x: marginX + 12, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 11;
    }
  }

  // Assinatura
  ensureSpace(60);
  y -= 30;
  page.drawLine({ start: { x: marginX, y }, end: { x: marginX + 240, y }, thickness: 1, color: DARK });
  y -= 14;
  drawLine(`${ctx.professionalName ?? ""}`, 10, fontBold, DARK);
  if (ctx.professionalCrm) drawLine(`CRM ${ctx.professionalCrm}`, 9, font, GRAY);

  return doc.save();
}
