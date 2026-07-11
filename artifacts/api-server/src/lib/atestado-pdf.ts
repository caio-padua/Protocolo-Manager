// Geração de PDF de ATESTADO MÉDICO (Arsenal Clínico Paxter).
//
// Consome a Fábrica de Padrão de Documentos (lib/documentos/padrao.ts) para
// cabeçalho-mastro, cores da marca, rodapé e paginação. Emissor "instituto_padua"
// (documento clínico). O conteúdo específico (corpo, CID, tipo, assinatura) é
// desenhado aqui, com quebra de página para texto longo — nunca escreve fora da
// folha (ver memória `pdf-cursor-quebra-pagina`). Vocabulário: "cliente".
import { PDFFont } from "pdf-lib";
import { COR, iniciarFabrica, type CabecalhoOpts } from "./documentos/padrao";

export interface AtestadoPdfData {
  clientName: string;
  clientCpf?: string | null;
  professionalName?: string | null;
  professionalCrm?: string | null;
  professionalUf?: string | null;
  tipo?: string | null; // comparecimento | afastamento | acompanhante | aptidao
  dias?: number | null;
  dataInicio?: string | null;
  cid?: string | null;
  finalidade?: string | null;
  corpo: string; // texto editável, JÁ com as variáveis aplicadas
  observacao?: string | null;
  local?: string | null; // cidade da emissão (default São Paulo)
}

const TIPO_LABEL: Record<string, string> = {
  comparecimento: "Comparecimento",
  afastamento: "Afastamento",
  acompanhante: "Acompanhante",
  aptidao: "Aptidão",
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Data de hoje por extenso no horário de Brasília (ex.: "13 de junho de 2026").
function dataExtensoBR(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCDate()} de ${MESES[brt.getUTCMonth()]} de ${brt.getUTCFullYear()}`;
}

// Formata uma data ISO (aaaa-mm-dd) para dd/mm/aaaa; devolve o texto cru se não casar.
function dataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
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

export async function gerarAtestadoPdf(dados: AtestadoPdfData): Promise<Uint8Array> {
  const fab = await iniciarFabrica();
  const { font, fontBold, margem, larguraConteudo } = fab;

  const tipoLabel = TIPO_LABEL[(dados.tipo ?? "").trim()] ?? "Comparecimento";

  const cabecalho: CabecalhoOpts = {
    titulo: "ATESTADO MÉDICO",
    subtitulo: `ATESTADO — ${tipoLabel.toUpperCase()}`,
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
    ensureSpace(size + 5);
    page.drawText(text, { x: margem + indent, y, size, font: useFont, color });
    y -= size + 5;
  };

  const drawParagraph = (text: string, size: number, useFont: PDFFont, color = COR.tinta, indent = 0) => {
    for (const l of wrapText(text, useFont, size, larguraConteudo - indent)) {
      ensureSpace(size + 4);
      page.drawText(l, { x: margem + indent, y, size, font: useFont, color });
      y -= size + 4;
    }
  };

  // ---- Cabeçalho de identificação (cliente / profissional / tipo) ----
  drawLine(`Cliente: ${dados.clientName}`, 11, fontBold, COR.tinta);
  drawLine(`CPF: ${dados.clientCpf && dados.clientCpf.trim() ? dados.clientCpf : "—"}`, 10, font, COR.cinza);
  drawLine(`Tipo de atestado: ${tipoLabel}`, 10, font, COR.navy);
  if (dados.dias != null && Number(dados.dias) > 0) {
    const inicio = dados.dataInicio && dados.dataInicio.trim() ? ` a partir de ${dataBR(dados.dataInicio)}` : "";
    drawLine(`Período: ${dados.dias} dia(s)${inicio}`, 10, font, COR.tinta);
  }
  if (dados.finalidade && dados.finalidade.trim()) {
    drawLine(`Finalidade: ${dados.finalidade.trim()}`, 10, font, COR.tinta);
  }
  y -= 6;

  // Fio de ouro separando o cabeçalho do corpo.
  ensureSpace(12);
  page.drawRectangle({ x: margem, y: y + 2, width: larguraConteudo, height: 0.6, color: COR.ouro });
  y -= 12;

  // ---- Corpo (texto editável já com variáveis aplicadas) ----
  const corpo = (dados.corpo ?? "").trim();
  if (corpo) {
    drawParagraph(corpo, 11, font, COR.tinta);
    y -= 4;
  }

  // ---- CID (quando houver) ----
  if (dados.cid && dados.cid.trim()) {
    y -= 2;
    drawLine(`CID: ${dados.cid.trim()}`, 10, fontBold, COR.navy);
  }

  // ---- Observação (quando houver) ----
  if (dados.observacao && dados.observacao.trim()) {
    y -= 4;
    drawLine("Observações:", 10, fontBold, COR.navy);
    drawParagraph(dados.observacao.trim(), 9, font, COR.tinta, 12);
  }

  // ---- Local e data por extenso ----
  y -= 14;
  const local = (dados.local && dados.local.trim()) || "São Paulo";
  drawLine(`${local}, ${dataExtensoBR()}.`, 10, font, COR.tinta);

  // ---- Bloco de assinatura do profissional ----
  ensureSpace(70);
  y -= 40;
  page.drawLine({ start: { x: margem, y }, end: { x: margem + 260, y }, thickness: 1, color: COR.tinta });
  y -= 15;
  drawLine(dados.professionalName ?? "—", 10, fontBold, COR.tinta);
  const crmUf =
    dados.professionalCrm && dados.professionalCrm.trim()
      ? `CRM ${dados.professionalCrm.trim()}${dados.professionalUf && dados.professionalUf.trim() ? `/${dados.professionalUf.trim().toUpperCase()}` : ""}`
      : null;
  if (crmUf) drawLine(crmUf, 9, font, COR.cinza);

  return fab.finalizar();
}
