// Geração de PDF de SOLICITAÇÃO DE EXAMES (ONDA B).
// Um PDF por TIPO (SANGUE / IMAGEM / OUTROS): exames de tipos diferentes nunca
// se misturam no mesmo documento.
//
// PILOTO da Fábrica de Padrão de Documentos: este gerador consome a camada única
// (lib/documentos/padrao.ts) para cabeçalho-mastro PAXTER, cores da marca, rodapé
// e paginação. O conteúdo específico (lista de exames) continua aqui.
import { blocoDeveIrParaProximaPagina } from "./pdf-bloco-integro";
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
  /** Dados do certificado ICP-Brasil que assina o documento (bloco visível de assinatura digital). */
  certificado?: { assinante: string; cpf?: string | null; ac?: string | null; serial?: string | null; validTo?: string | null } | null;
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
  const topoPagina = y;

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
    const titleLines = wrapText(`${idx}. ${item.nomeExame}`, fontBold, 11, larguraConteudo);
    const preparoLines = item.preparo && item.preparo.trim()
      ? wrapText(`Preparo: ${item.preparo}`, font, 9, larguraConteudo - 12) : [];
    // Regra do CEO: exame inteiro (título + preparo) + 1 linha em branco, senão página nova.
    if (blocoDeveIrParaProximaPagina({
      y, alturaBloco: titleLines.length * 14 + preparoLines.length * 11 + 6,
      limiteInferior: 72, linhaEmBranco: 11, topoPaginaNova: topoPagina,
    })) {
      const nova = fab.novaPagina(cabecalho);
      page = nova.page;
      y = nova.y;
    }
    ensureSpace(16);
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

  // Assinatura: caixa do certificado (esquerda, encurtada) e assinatura do médico (direita),
  // tudo na mesma faixa horizontal e alinhado pelas mesmas alturas.
  const c = ctx.certificado;
  const validade = c?.validTo ? c.validTo.slice(0, 10).split("-").reverse().join("/") : "—";
  const linhasCert = c ? [
    `Assinante: ${c.assinante}`,
    `CPF: ${c.cpf ?? "—"}`,
    `Certificadora: ${c.ac || "ICP-Brasil"}`,
    `Série: ${c.serial ? c.serial.slice(0, 20) : "—"}`,
    `Válido até: ${validade}`,
    "Verificação: validar.iti.gov.br",
  ] : [];
  const boxW = 262;
  const boxH = c ? 20 + linhasCert.length * 12 : 56;
  const passo = 12;
  ensureSpace(boxH + 40);
  y -= 30;
  const topo = y;
  const colDir = margem + boxW + 24;
  const larguraDir = larguraConteudo - boxW - 24;
  if (c) {
    page.drawRectangle({ x: margem, y: topo - boxH, width: boxW, height: boxH, borderColor: COR.navy, borderWidth: 0.8 });
    page.drawText("ASSINADO DIGITALMENTE (ICP-BRASIL / PAdES)", { x: margem + 8, y: topo - 11, size: 7.5, font: fontBold, color: COR.navy });
    linhasCert.forEach((l, k) => {
      page.drawText(l, { x: margem + 8, y: topo - 25 - k * passo, size: 7.5, font, color: COR.tinta });
    });
  }
  // Linha da assinatura, nome e CRM caem exatamente nas mesmas alturas das linhas de texto da caixa.
  const base = (k: number) => topo - 25 - k * passo;
  const yLinha = base(2) - 3;
  page.drawLine({ start: { x: colDir, y: yLinha }, end: { x: colDir + larguraDir, y: yLinha }, thickness: 1, color: COR.tinta });
  page.drawText(`${ctx.professionalName ?? ""}`, { x: colDir, y: base(3), size: 9.5, font: fontBold, color: COR.tinta });
  if (ctx.professionalCrm) page.drawText(`CRM ${ctx.professionalCrm}`, { x: colDir, y: base(4), size: 7.5, font, color: COR.cinza });
  y = topo - boxH;

  return fab.finalizar();
}
