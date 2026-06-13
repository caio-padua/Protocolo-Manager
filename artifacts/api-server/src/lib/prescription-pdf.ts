// Geração de PDF das receitas (manipulação/blend e controlado isolado).
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { RecipePlan, PrescriptionItemInput } from "./desmembramento";

const PETROLEO = rgb(0.24, 0.48, 0.48);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.4, 0.4, 0.4);

const HEADER_BOILERPLATE = [
  "À Farmácia e ao Paciente:",
  "- O Paciente está ciente de que deverá ser consultado ao término das formulações descritas, e as mesmas",
  "  deverão ser manipuladas de acordo com a posologia de cada prescrição e limitada à duração do tratamento.",
  "- As formulações abaixo são personalizadas e foram elaboradas exclusivamente para o presente tratamento,",
  "  com base na avaliação clínica e exames do paciente.",
  "- Sua reprodução total ou parcial, sem nova avaliação médica e prescrição atualizada, não está autorizada,",
  "  nos termos da Resolução CFM nº 1.974/2011 e RDC nº 67/2007 da ANVISA.",
];

export interface RecipePdfContext {
  clientName: string;
  clientCpf?: string | null;
  professionalName?: string | null;
  professionalCrm?: string | null;
  professionalUf?: string | null;
  cid?: string | null;
  durationDays?: string | null;
  dateBR: string;
  pharmacyName?: string | null;
  pharmacyType?: string | null;
  sncrNumber?: string | null;
  sncrStatus?: string | null;
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

export async function generateRecipePdf(plan: RecipePlan, ctx: RecipePdfContext): Promise<Uint8Array> {
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
  drawLine(plan.title, 12, fontBold, DARK);
  y -= 4;

  // Faixa de cor Anvisa (controlado)
  if (plan.recipeType === "controlado_isolado" && plan.anvisaColorName) {
    ensureSpace(22);
    const isWhite = (plan.anvisaColor ?? "").toUpperCase() === "#FFFFFF";
    page.drawRectangle({
      x: marginX,
      y: y - 4,
      width: contentW,
      height: 20,
      color: hexToRgb(plan.anvisaColor ?? "#CCCCCC"),
      borderColor: GRAY,
      borderWidth: isWhite ? 1 : 0,
    });
    page.drawText(
      `TIPO ANVISA: ${plan.anvisaType ?? "-"}  •  RECEITUÁRIO ${plan.anvisaColorName.toUpperCase()}`,
      { x: marginX + 8, y: y + 2, size: 10, font: fontBold, color: isWhite ? DARK : rgb(1, 1, 1) },
    );
    y -= 30;
  }

  // Numeração SNCR
  if (plan.needsSncr) {
    if (ctx.sncrNumber) {
      drawLine(`Nº Notificação de Receita (SNCR): ${ctx.sncrNumber}`, 10, fontBold, DARK);
    } else {
      drawLine("Nº Notificação de Receita (SNCR): ____________ (sem numeração disponível)", 10, fontBold, rgb(0.7, 0.1, 0.1));
    }
    y -= 2;
  }

  // Dados do paciente / médico
  drawLine(`Paciente: ${ctx.clientName}${ctx.clientCpf ? `  •  CPF: ${ctx.clientCpf}` : ""}`, 10, font, DARK);
  const profLine = `Médico: ${ctx.professionalName ?? "-"}${ctx.professionalCrm ? `  •  CRM: ${ctx.professionalCrm}` : ""}${ctx.professionalUf ? `/${ctx.professionalUf}` : ""}`;
  drawLine(profLine, 10, font, DARK);
  drawLine(
    `Data: ${ctx.dateBR}${ctx.cid ? `  •  CID: ${ctx.cid}` : ""}${ctx.durationDays ? `  •  Duração: ${ctx.durationDays} dias` : ""}`,
    10,
    font,
    GRAY,
  );
  if (ctx.pharmacyName) {
    drawLine(`Destino: ${ctx.pharmacyName}${ctx.pharmacyType ? ` (${ctx.pharmacyType})` : ""}`, 10, font, GRAY);
  }
  y -= 6;

  // Boilerplate legal
  page.drawRectangle({ x: marginX, y: y - (HEADER_BOILERPLATE.length * 11) - 4, width: contentW, height: HEADER_BOILERPLATE.length * 11 + 8, color: rgb(0.96, 0.98, 0.98) });
  for (const l of HEADER_BOILERPLATE) {
    ensureSpace(11);
    page.drawText(l, { x: marginX + 6, y: y - 2, size: 7.5, font, color: GRAY });
    y -= 11;
  }
  y -= 10;

  // Itens
  let idx = 1;
  for (const item of plan.items) {
    drawItem(page, item, idx, { marginX, contentW, font, fontBold }, () => {
      page = doc.addPage([pageW, pageH]);
      y = pageH - 50;
      return { page, y };
    }, () => y, (ny) => { y = ny; });
    idx++;
    y -= 8;
  }

  // Assinatura
  ensureSpace(60);
  y -= 24;
  page.drawLine({ start: { x: marginX, y }, end: { x: marginX + 240, y }, thickness: 1, color: DARK });
  y -= 14;
  drawLine(`${ctx.professionalName ?? ""}`, 10, fontBold, DARK);
  drawLine(`CRM ${ctx.professionalCrm ?? ""}${ctx.professionalUf ? `/${ctx.professionalUf}` : ""}`, 9, font, GRAY);

  return doc.save();
}

function drawItem(
  page: PDFPage,
  item: PrescriptionItemInput,
  idx: number,
  cfg: { marginX: number; contentW: number; font: PDFFont; fontBold: PDFFont },
  newPage: () => { page: PDFPage; y: number },
  getY: () => number,
  setY: (y: number) => void,
) {
  const { marginX, contentW, font, fontBold } = cfg;
  let curPage = page;
  let y = getY();

  const ensure = (needed: number) => {
    if (y - needed < 60) {
      const np = newPage();
      curPage = np.page;
      y = np.y;
    }
  };

  ensure(18);
  curPage.drawText(`${idx}. ${item.name}`, { x: marginX, y, size: 11, font: fontBold, color: DARK });
  if (item.isControlled) {
    curPage.drawText(`[CONTROLADO ${item.anvisaType ?? ""}]`, { x: marginX + contentW - 130, y, size: 8, font: fontBold, color: rgb(0.7, 0.1, 0.1) });
  }
  y -= 16;

  if (item.ativos) {
    for (const l of wrapText(item.ativos, font, 9, contentW - 12)) {
      ensure(11);
      curPage.drawText(l, { x: marginX + 12, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 11;
    }
  }

  const pos = item.posologia || buildPosologia(item);
  if (pos) {
    y -= 2;
    for (const l of wrapText(`Posologia: ${pos}`, font, 9, contentW - 12)) {
      ensure(11);
      curPage.drawText(l, { x: marginX + 12, y, size: 9, font, color: PETROLEO });
      y -= 11;
    }
  }

  setY(y);
}

function buildPosologia(item: PrescriptionItemInput): string {
  const parts = [item.dose, item.via, item.frequencia, item.periodo, item.observacao].filter(Boolean);
  return parts.join(" — ");
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0.8 : r, isNaN(g) ? 0.8 : g, isNaN(b) ? 0.8 : b);
}
