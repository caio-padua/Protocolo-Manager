// Geração de PDF de SOLICITAÇÃO DE EXAMES (ONDA B).
// Um PDF por TIPO (SANGUE / IMAGEM / OUTROS): exames de tipos diferentes nunca
// se misturam no mesmo documento.
//
// PILOTO da Fábrica de Padrão de Documentos: este gerador consome a camada única
// (lib/documentos/padrao.ts) para cabeçalho-mastro PAXTER, cores da marca, rodapé
// e paginação. O conteúdo específico (lista de exames) continua aqui.
import { PDFFont } from "pdf-lib";
import { COR, iniciarFabrica, type CabecalhoOpts } from "./documentos/padrao";

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
  const fab = await iniciarFabrica();
  const { font, fontBold, margem, larguraConteudo } = fab;

  const cabecalho: CabecalhoOpts = {
    titulo: "SOLICITAÇÃO DE EXAMES",
    subtitulo: `EXAMES — ${ctx.tipoLabel.toUpperCase()}`,
  };

  let { page, y } = fab.novaPagina(cabecalho);

  const ensureSpace = (needed: number) => {
    if (y - needed < 72) {
      const nova = fab.novaPagina(cabecalho);
      page = nova.page;
      y = nova.y;
    }
  };

  const drawLine = (text: string, size: number, useFont: PDFFont, color = COR.tinta, indent = 0) => {
    ensureSpace(size + 4);
    page.drawText(text, { x: margem + indent, y, size, font: useFont, color });
    y -= size + 4;
  };

  // Dados do cliente / médico / data
  drawLine(`Cliente: ${ctx.clientName}${ctx.clientCpf ? `  •  CPF: ${ctx.clientCpf}` : ""}`, 10, font, COR.tinta);
  drawLine(
    `Médico: ${ctx.professionalName ?? "-"}${ctx.professionalCrm ? `  •  CRM: ${ctx.professionalCrm}` : ""}`,
    10,
    font,
    COR.tinta,
  );
  drawLine(`Data: ${ctx.dateBR}`, 10, font, COR.cinza);
  y -= 6;

  // Lista de exames
  drawLine("Solicito a realização dos seguintes exames:", 10, fontBold, COR.navy);
  y -= 4;

  let idx = 1;
  for (const item of ctx.items) {
    ensureSpace(16);
    const titleLines = wrapText(`${idx}. ${item.nomeExame}`, fontBold, 11, larguraConteudo);
    for (const l of titleLines) {
      ensureSpace(14);
      page.drawText(l, { x: margem, y, size: 11, font: fontBold, color: COR.tinta });
      y -= 14;
    }
    if (item.preparo && item.preparo.trim()) {
      for (const l of wrapText(`Preparo: ${item.preparo}`, font, 9, larguraConteudo - 12)) {
        ensureSpace(11);
        page.drawText(l, { x: margem + 12, y, size: 9, font, color: COR.navy700 });
        y -= 11;
      }
    }
    y -= 6;
    idx++;
  }

  // Observação
  if (ctx.observacao && ctx.observacao.trim()) {
    y -= 4;
    drawLine("Observações:", 10, fontBold, COR.navy);
    for (const l of wrapText(ctx.observacao, font, 9, larguraConteudo - 12)) {
      ensureSpace(11);
      page.drawText(l, { x: margem + 12, y, size: 9, font, color: COR.tinta });
      y -= 11;
    }
  }

  // Assinatura
  ensureSpace(60);
  y -= 30;
  page.drawLine({ start: { x: margem, y }, end: { x: margem + 240, y }, thickness: 1, color: COR.tinta });
  y -= 14;
  drawLine(`${ctx.professionalName ?? ""}`, 10, fontBold, COR.tinta);
  if (ctx.professionalCrm) drawLine(`CRM ${ctx.professionalCrm}`, 9, font, COR.cinza);

  return fab.finalizar();
}
