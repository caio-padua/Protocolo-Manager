// Geração de PDF de ENCAMINHAMENTO clínico (Arsenal Clínico Paxter).
//
// Consome a Fábrica de Padrão de Documentos (lib/documentos/padrao.ts) para
// cabeçalho-mastro, cores da marca, rodapé e paginação. Emissor clínico
// "instituto_padua". O conteúdo específico (destino, urgência, motivo, resumo,
// corpo editável, assinatura) fica aqui. Texto longo quebra em novaPagina —
// nunca escreve fora da folha.
import { PDFFont } from "pdf-lib";
import { COR, iniciarFabrica, type CabecalhoOpts } from "./documentos/padrao";

export type UrgenciaEncaminhamento = "eletivo" | "prioritario" | "urgente";

export interface EncaminhamentoPdfContext {
  clientName: string;
  clientCpf?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  professionalName?: string | null;
  professionalCrm?: string | null;
  professionalUf?: string | null;
  especialidadeDestino: string;
  profissionalDestino?: string | null;
  urgencia: UrgenciaEncaminhamento;
  motivo: string;
  resumoClinico?: string | null;
  corpo: string;
  dateBR: string;
  local?: string | null;
}

// Rótulo e cor de destaque por urgência.
function urgenciaVisual(urgencia: UrgenciaEncaminhamento): { label: string; cor: typeof COR.navy; destaque: boolean } {
  switch (urgencia) {
    case "urgente":
      return { label: "URGENTE", cor: COR.navy, destaque: true };
    case "prioritario":
      return { label: "PRIORITÁRIO", cor: COR.navy, destaque: true };
    default:
      return { label: "ELETIVO", cor: COR.cinza, destaque: false };
  }
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

export async function gerarEncaminhamentoPdf(ctx: EncaminhamentoPdfContext): Promise<Uint8Array> {
  const fab = await iniciarFabrica();
  const { font, fontBold, margem, larguraConteudo } = fab;

  const cabecalho: CabecalhoOpts = {
    titulo: "ENCAMINHAMENTO",
    subtitulo: ctx.especialidadeDestino ? ctx.especialidadeDestino.toUpperCase() : null,
    emissor: "instituto_padua",
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

  const drawParagrafo = (text: string, size: number, useFont: PDFFont, color = COR.tinta, indent = 0) => {
    for (const l of wrapText(text, useFont, size, larguraConteudo - indent)) {
      ensureSpace(size + 3);
      page.drawText(l, { x: margem + indent, y, size, font: useFont, color });
      y -= size + 3;
    }
  };

  // ---- Etiqueta de URGÊNCIA (destaque visual quando prioritário/urgente) ----
  const uv = urgenciaVisual(ctx.urgencia);
  const etiquetaTexto = `URGÊNCIA: ${uv.label}`;
  const etiquetaSize = 10;
  if (uv.destaque) {
    const padX = 8;
    const padY = 5;
    const largura = fontBold.widthOfTextAtSize(etiquetaTexto, etiquetaSize) + padX * 2;
    const altura = etiquetaSize + padY * 2;
    ensureSpace(altura + 8);
    page.drawRectangle({
      x: margem,
      y: y - altura + etiquetaSize,
      width: largura,
      height: altura,
      color: COR.navy,
    });
    page.drawText(etiquetaTexto, {
      x: margem + padX,
      y: y - altura + etiquetaSize + padY,
      size: etiquetaSize,
      font: fontBold,
      color: COR.ouroClaro,
    });
    y -= altura + 8;
  } else {
    drawLine(etiquetaTexto, etiquetaSize, fontBold, COR.cinza);
    y -= 4;
  }

  // ---- Destino ----
  drawLine("DESTINO", 9, fontBold, COR.navy);
  drawLine(`Especialidade: ${ctx.especialidadeDestino || "—"}`, 10, font, COR.tinta, 4);
  drawLine(`Profissional de destino: ${ctx.profissionalDestino?.trim() || "—"}`, 10, font, COR.tinta, 4);
  y -= 6;

  // ---- Dados do cliente ----
  drawLine("DADOS DO CLIENTE", 9, fontBold, COR.navy);
  drawLine(`Nome: ${ctx.clientName || "—"}`, 10, font, COR.tinta, 4);
  drawLine(`CPF: ${ctx.clientCpf?.trim() || "—"}`, 10, font, COR.tinta, 4);
  drawLine(`Telefone: ${ctx.clientPhone?.trim() || "—"}   •   E-mail: ${ctx.clientEmail?.trim() || "—"}`, 9, font, COR.cinza, 4);
  y -= 6;

  // ---- Motivo ----
  drawLine("MOTIVO DO ENCAMINHAMENTO", 9, fontBold, COR.navy);
  drawParagrafo(ctx.motivo?.trim() || "—", 10, font, COR.tinta, 4);
  y -= 6;

  // ---- Resumo clínico ----
  if (ctx.resumoClinico && ctx.resumoClinico.trim()) {
    drawLine("RESUMO CLÍNICO", 9, fontBold, COR.navy);
    drawParagrafo(ctx.resumoClinico.trim(), 10, font, COR.tinta, 4);
    y -= 6;
  }

  // ---- Corpo editável ----
  if (ctx.corpo && ctx.corpo.trim()) {
    drawLine("DESCRIÇÃO", 9, fontBold, COR.navy);
    drawParagrafo(ctx.corpo.trim(), 10, font, COR.tinta, 4);
    y -= 6;
  }

  // ---- Local e data ----
  y -= 6;
  const localData = `${ctx.local?.trim() || "São Paulo"}, ${ctx.dateBR}`;
  drawLine(localData, 10, font, COR.tinta);

  // ---- Bloco de assinatura ----
  ensureSpace(70);
  y -= 34;
  page.drawLine({ start: { x: margem, y }, end: { x: margem + 260, y }, thickness: 1, color: COR.tinta });
  y -= 14;
  drawLine(`${ctx.professionalName?.trim() || ""}`, 10, fontBold, COR.tinta);
  const crmUf = [ctx.professionalCrm?.trim() ? `CRM ${ctx.professionalCrm.trim()}` : "", ctx.professionalUf?.trim() || ""]
    .filter(Boolean)
    .join("/");
  if (crmUf) drawLine(crmUf, 9, font, COR.cinza);

  return fab.finalizar();
}
