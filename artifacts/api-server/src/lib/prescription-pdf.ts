// Geração de PDF das receitas (manipulação/blend e controlado isolado).
//
// Consome a Fábrica de Padrão de Documentos (lib/documentos/padrao.ts) para o
// cabeçalho-mastro, cores da marca, rodapé e paginação. EXCEÇÃO de marca: o
// receituário usa o emissor "Instituto Pádua" (não PAXTER) — regra clínica.
// O conteúdo regulatório (faixa Anvisa, SNCR, boilerplate, itens) continua aqui.
import { rgb, PDFFont, PDFPage } from "pdf-lib";
import { blocoDeveIrParaProximaPagina, separarTomadas } from "./pdf-bloco-integro";
import { COR, iniciarFabrica, type CabecalhoOpts } from "./documentos/padrao";
import type { RecipePlan, PrescriptionItemInput } from "./desmembramento";

const ALERTA = rgb(0.7, 0.1, 0.1); // vermelho regulatório (SNCR ausente, controlado)

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
  homologationNotice?: boolean;
  /** Exclusivo para prova sintética offline, não para emissão clínica. */
  modelo2bProva?: boolean;
  unsignedSignatureNotice?: boolean;
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
  if (ctx.modelo2bProva && !ctx.homologationNotice) {
    throw new Error("Modelo 2B de prova exige documento de homologação.");
  }
  const fab = await iniciarFabrica(ctx.modelo2bProva ? { modeloProva: "paxmed-2b-sintetico" } : undefined);
  const { font, fontBold, margem, larguraConteudo } = fab;

  const cabecalho: CabecalhoOpts = {
    titulo: ctx.modelo2bProva ? "PRESCRIÇÃO MÉDICA" : ctx.homologationNotice ? "DOCUMENTO DE TESTE" : plan.title,
    ...(ctx.modelo2bProva ? { subtitulo: "RECEITUÁRIO / MEDICAMENTOS" } : {}),
    emissor: "instituto_padua",
  };

  const novaPagina = () => {
    const next = fab.novaPagina(cabecalho);
    if (ctx.unsignedSignatureNotice) {
      const bannerHeight = 34;
      next.page.drawRectangle({
        x: margem,
        y: next.y - bannerHeight + 8,
        width: larguraConteudo,
        height: bannerHeight,
        color: rgb(1, 0.93, 0.93),
        borderColor: ALERTA,
        borderWidth: 1,
      });
      next.page.drawText("GERADA SEM ASSINATURA DIGITAL — NÃO ASSINADA", {
        x: margem + 8,
        y: next.y - 9,
        size: 8.5,
        font: fontBold,
        color: ALERTA,
      });
      next.page.drawText("Exige assinatura manual antes de uso clínico.", {
        x: margem + 8,
        y: next.y - 22,
        size: 8,
        font,
        color: ALERTA,
      });
      next.y -= bannerHeight + 6;
    }
    return next;
  };

  let { page, y } = novaPagina();
  const topoPagina = y;

  const ensureSpace = (needed: number) => {
    if (y - needed < fab.limiteInferior) {
      const nova = novaPagina();
      page = nova.page;
      y = nova.y;
    }
  };

  if (ctx.homologationNotice) {
    const notice = "HOMOLOGAÇÃO — DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA";
    const lines = wrapText(notice, fontBold, 11, larguraConteudo - 16);
    const height = lines.length * 14 + 10;
    ensureSpace(height + 8);
    page.drawRectangle({
      x: margem,
      y: y - height,
      width: larguraConteudo,
      height,
      color: rgb(1, 0.93, 0.93),
      borderColor: ALERTA,
      borderWidth: 1,
    });
    let noticeY = y - 15;
    for (const line of lines) {
      page.drawText(line, { x: margem + 8, y: noticeY, size: 11, font: fontBold, color: ALERTA });
      noticeY -= 14;
    }
    y -= height + 10;
  }

  const drawLine = (text: string, size: number, useFont: PDFFont, color = COR.tinta, indent = 0) => {
    ensureSpace(size + 4);
    page.drawText(text, { x: margem + indent, y, size, font: useFont, color });
    y -= size + 4;
  };

  // Faixa de cor Anvisa (controlado) — cores regulatórias preservadas como estão.
  if (plan.recipeType === "controlado_isolado" && plan.anvisaColorName) {
    ensureSpace(22);
    const isWhite = (plan.anvisaColor ?? "").toUpperCase() === "#FFFFFF";
    page.drawRectangle({
      x: margem,
      y: y - 4,
      width: larguraConteudo,
      height: 20,
      color: hexToRgb(plan.anvisaColor ?? "#CCCCCC"),
      borderColor: COR.cinza,
      borderWidth: isWhite ? 1 : 0,
    });
    page.drawText(`TIPO ANVISA: ${plan.anvisaType ?? "-"}  •  RECEITUÁRIO ${plan.anvisaColorName.toUpperCase()}`, {
      x: margem + 8,
      y: y + 2,
      size: 10,
      font: fontBold,
      color: isWhite ? COR.tinta : rgb(1, 1, 1),
    });
    y -= 30;
  }

  // Numeração SNCR
  if (plan.needsSncr) {
    if (ctx.sncrNumber) {
      drawLine(`Nº Notificação de Receita (SNCR): ${ctx.sncrNumber}`, 10, fontBold, COR.tinta);
    } else {
      drawLine("Nº Notificação de Receita (SNCR): ____________ (sem numeração disponível)", 10, fontBold, ALERTA);
    }
    y -= 2;
  }

  // Dados do paciente / médico
  drawLine(`Paciente: ${ctx.clientName}${ctx.clientCpf ? `  •  CPF: ${ctx.clientCpf}` : ""}`, 10, font, COR.tinta);
  const profLine = `Médico: ${ctx.professionalName ?? "-"}${ctx.professionalCrm ? `  •  CRM: ${ctx.professionalCrm}` : ""}${ctx.professionalUf ? `/${ctx.professionalUf}` : ""}`;
  drawLine(profLine, 10, font, COR.tinta);
  drawLine(
    `Data: ${ctx.dateBR}${ctx.cid ? `  •  CID: ${ctx.cid}` : ""}${ctx.durationDays ? `  •  Duração: ${ctx.durationDays} dias` : ""}`,
    10,
    font,
    COR.cinza,
  );
  if (ctx.pharmacyName) {
    drawLine(`Destino: ${ctx.pharmacyName}${ctx.pharmacyType ? ` (${ctx.pharmacyType})` : ""}`, 10, font, COR.cinza);
  }
  y -= 6;

  // Clinical boilerplate must not appear on a synthetic homologation document.
  if (!ctx.homologationNotice) {
    ensureSpace(HEADER_BOILERPLATE.length * 11 + 12);
    page.drawRectangle({
      x: margem,
      y: y - HEADER_BOILERPLATE.length * 11 - 4,
      width: larguraConteudo,
      height: HEADER_BOILERPLATE.length * 11 + 8,
      color: rgb(0.95, 0.96, 0.97),
    });
    for (const l of HEADER_BOILERPLATE) {
      page.drawText(l, { x: margem + 6, y: y - 2, size: 7.5, font, color: COR.cinza });
      y -= 11;
    }
    y -= 10;
  }

  // Itens
  let idx = 1;
  for (const item of plan.items) {
    drawItem(
      page,
      item,
      idx,
      { margem, larguraConteudo, font, fontBold, limiteInferior: fab.limiteInferior },
      () => {
        const nova = novaPagina();
        page = nova.page;
        y = nova.y;
        return { page, y };
      },
      () => y,
      (ny) => {
        y = ny;
      },
      topoPagina,
    );
    idx++;
    y -= 8;
  }

  // Assinatura
  ensureSpace(60);
  y -= 24;
  page.drawLine({ start: { x: margem, y }, end: { x: margem + 240, y }, thickness: 1, color: COR.tinta });
  y -= 14;
  drawLine(`${ctx.professionalName ?? ""}`, 10, fontBold, COR.tinta);
  drawLine(`CRM ${ctx.professionalCrm ?? ""}${ctx.professionalUf ? `/${ctx.professionalUf}` : ""}`, 9, font, COR.cinza);

  return fab.finalizar();
}

function drawItem(
  page: PDFPage,
  item: PrescriptionItemInput,
  idx: number,
  cfg: { margem: number; larguraConteudo: number; font: PDFFont; fontBold: PDFFont; limiteInferior: number },
  newPage: () => { page: PDFPage; y: number },
  getY: () => number,
  setY: (y: number) => void,
  topoPagina: number,
) {
  const { margem, larguraConteudo, font, fontBold } = cfg;
  // Cada tomada em sua própria linha ("Posologia:" abre o grupo).
  const linhasPosologia = (texto: string) => {
    const tomadas = separarTomadas(texto);
    return [
      "Posologia:",
      ...tomadas.flatMap((t) => wrapText(`  ${t}`, font, 9, larguraConteudo - 12)),
    ];
  };
  let curPage = page;
  let y = getY();

  // Regra do CEO: item inteiro (até o fim da posologia) + 1 linha em branco, senão página nova.
  const posPrevia = item.posologia || buildPosologia(item);
  const altura = 16
    + (item.ativos ? wrapText(item.ativos, font, 9, larguraConteudo - 12).length * 11 : 0)
    + (posPrevia ? 2 + linhasPosologia(posPrevia).length * 11 : 0);
  if (blocoDeveIrParaProximaPagina({
    y, alturaBloco: altura, limiteInferior: cfg.limiteInferior, linhaEmBranco: 11, topoPaginaNova: topoPagina,
  })) {
    const np = newPage();
    curPage = np.page;
    y = np.y;
  }

  const ensure = (needed: number) => {
    if (y - needed < cfg.limiteInferior) {
      const np = newPage();
      curPage = np.page;
      y = np.y;
    }
  };

  ensure(18);
  curPage.drawText(`${idx}. ${item.name}`, { x: margem, y, size: 11, font: fontBold, color: COR.tinta });
  if (item.isControlled) {
    curPage.drawText(`[CONTROLADO ${item.anvisaType ?? ""}]`, {
      x: margem + larguraConteudo - 130,
      y,
      size: 8,
      font: fontBold,
      color: ALERTA,
    });
  }
  y -= 16;

  if (item.ativos) {
    for (const l of wrapText(item.ativos, font, 9, larguraConteudo - 12)) {
      ensure(11);
      curPage.drawText(l, { x: margem + 12, y, size: 9, font, color: COR.tinta });
      y -= 11;
    }
  }

  const pos = item.posologia || buildPosologia(item);
  if (pos) {
    y -= 2;
    for (const l of linhasPosologia(pos)) {
      ensure(11);
      curPage.drawText(l, { x: margem + 12, y, size: 9, font, color: COR.navy700 });
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
