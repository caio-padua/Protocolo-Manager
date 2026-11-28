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
import { ASSINATURA_3A1C_ALTURA, desenharAssinatura3a1c } from "./documentos/bloco-assinatura-3a1c";
import { marcarDemonstracao } from "./documentos/marca-demonstracao";
import type { TextosEmpresa2b } from "./documentos/paxmed-2b-limites";

export interface ExamRequestItem {
  nomeExame: string;
  codigoExame?: string | null;
  grupoPrincipal?: string | null;
  preparo?: string | null;
}

export interface ExamRequestPdfContext {
  homologacao?: boolean;
  /** Exclusivo para prova sintética offline, ainda sem verificação real. */
  modelo2bProva?: boolean;
  identidade2bProva?: { textos: TextosEmpresa2b; simboloDourado: Uint8Array };
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
  /** Imagem da assinatura cadastrada do médico (desenhada à direita do quadro do certificado). */
  assinaturaImagem?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" } | null;
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
  if ((ctx.modelo2bProva && !ctx.homologacao) || (ctx.identidade2bProva && !ctx.modelo2bProva)) {
    throw new Error("Modelo 2B de prova exige documento de homologação.");
  }
  const fab = await iniciarFabrica(ctx.modelo2bProva
    ? { modeloProva: "paxmed-2b-sintetico", identidadeProva: ctx.identidade2bProva }
    : undefined);
  const { font, fontBold, margem, larguraConteudo } = fab;

  const cabecalho: CabecalhoOpts = {
    titulo: ctx.homologacao && !ctx.modelo2bProva ? "DEMONSTRAÇÃO DE EXAMES" : "SOLICITAÇÃO DE EXAMES",
    subtitulo: `EXAMES — ${ctx.tipoLabel.toUpperCase()}`,
    ...(ctx.modelo2bProva && !ctx.identidade2bProva ? { emissor: "instituto_padua" as const } : {}),
  };

  let { page, y } = fab.novaPagina(cabecalho);
  const topoPagina = y;

  const ensureSpace = (needed: number) => {
    if (y - needed < fab.limiteInferior) {
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
  drawLine(ctx.homologacao ? "Exames para demonstração:" : "Solicito a realização dos seguintes exames:", 10, fontBold, COR.navy);
  y -= 4;

  let idx = 1;
  for (const item of ctx.items) {
    const titleLines = wrapText(`${idx}. ${item.nomeExame}`, fontBold, 11, larguraConteudo);
    const preparoLines = item.preparo && item.preparo.trim()
      ? wrapText(`Preparo: ${item.preparo}`, font, 9, larguraConteudo - 12) : [];
    // Regra do CEO: exame inteiro (título + preparo) + 1 linha em branco, senão página nova.
    if (blocoDeveIrParaProximaPagina({
      y, alturaBloco: titleLines.length * 14 + preparoLines.length * 11 + 6,
      limiteInferior: fab.limiteInferior, linhaEmBranco: 11, topoPaginaNova: topoPagina,
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

  ensureSpace(ASSINATURA_3A1C_ALTURA + 24);
  y -= 24;
  await desenharAssinatura3a1c(fab.doc, page, y - ASSINATURA_3A1C_ALTURA, {
    certificado: ctx.certificado,
    profissional: ctx.professionalName ?? "",
    crm: ctx.professionalCrm ?? "",
    assinaturaImagem: ctx.assinaturaImagem,
  });
  y -= ASSINATURA_3A1C_ALTURA;

  fab.carimbarRodape();
  if (ctx.homologacao) await marcarDemonstracao(fab.doc);
  return fab.doc.save();
}
