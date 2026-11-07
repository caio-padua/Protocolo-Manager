// Geração de PDF de SOLICITAÇÃO DE EXAMES (ONDA B).
// Um PDF por TIPO (SANGUE / IMAGEM / OUTROS): exames de tipos diferentes nunca
// se misturam no mesmo documento.
//
// PILOTO da Fábrica de Padrão de Documentos: este gerador consome a camada única
// (lib/documentos/padrao.ts) para cabeçalho-mastro PAXTER, cores da marca, rodapé
// e paginação. O conteúdo específico (lista de exames) continua aqui.
import { blocoDeveIrParaProximaPagina } from "./pdf-bloco-integro";
import { PDFFont, rgb } from "pdf-lib";
import QRCode from "qrcode";
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

  // Assinatura no padrão do receituário: quadro do certificado (esquerda, fundo creme, borda ouro,
  // QR do validador do ITI) e assinatura do médico (direita) na mesma faixa.
  const c = ctx.certificado;
  const GOLD = rgb(0.761, 0.627, 0.353);
  const VERDE = rgb(0.05, 0.42, 0.21);
  const VERMELHO = rgb(0.72, 0.12, 0.12);
  const validade = c?.validTo ? c.validTo.slice(0, 10).split("-").reverse().join("/") : "—";
  const campos: [string, string][] = c ? [
    ["Assinante", c.assinante],
    ["CPF", c.cpf ?? "—"],
    ["Certificadora", c.ac || "ICP-Brasil"],
    ["Número de série", c.serial ? c.serial.slice(0, 20) : "—"],
    ["Válido até", validade],
    ["QR", "Validador do ITI"],
  ] : [];
  const SIG_W = 150;
  const CERT_W = larguraConteudo - SIG_W - 14;
  const CERT_H = 78;
  const SIG_X = margem + larguraConteudo - SIG_W;
  ensureSpace(CERT_H + 50);
  y -= 24;
  const topo = y;

  // Direita: imagem da assinatura, linha, nome, CRM e local/data.
  let yy = topo - 40;
  if (ctx.assinaturaImagem) {
    const img = ctx.assinaturaImagem.mime === "image/png"
      ? await fab.doc.embedPng(ctx.assinaturaImagem.bytes)
      : await fab.doc.embedJpg(ctx.assinaturaImagem.bytes);
    const sc = Math.min(130 / img.width, 30 / img.height);
    page.drawImage(img, { x: SIG_X + (130 - img.width * sc) / 2, y: yy + 3, width: img.width * sc, height: img.height * sc });
  } else {
    page.drawText("Assinatura não cadastrada", { x: SIG_X, y: yy + 12, size: 7, font, color: COR.cinza });
  }
  page.drawLine({ start: { x: SIG_X, y: yy }, end: { x: SIG_X + 130, y: yy }, thickness: 0.5, color: COR.tinta });
  yy -= 11;
  page.drawText(`${ctx.professionalName ?? ""}`, { x: SIG_X, y: yy, size: 9, font: fontBold, color: COR.tinta });
  yy -= 11;
  if (ctx.professionalCrm) page.drawText(`CRM ${ctx.professionalCrm}`, { x: SIG_X, y: yy, size: 7.5, font, color: COR.cinza });
  yy -= 11;
  page.drawText(`São Paulo, ${ctx.dateBR}`, { x: SIG_X, y: yy, size: 7.5, font, color: COR.cinza });

  // Esquerda: quadro do certificado.
  page.drawRectangle({ x: margem, y: topo - CERT_H, width: CERT_W, height: CERT_H, color: rgb(0.99, 0.98, 0.96), borderColor: GOLD, borderWidth: 0.6 });
  const titulo = c ? "DOCUMENTO ASSINADO DIGITALMENTE" : "GERADO SEM ASSINATURA DIGITAL";
  const tw = fontBold.widthOfTextAtSize(titulo, 6.5);
  page.drawText(titulo, { x: margem + (CERT_W - tw) / 2, y: topo - 11, size: 6.5, font: fontBold, color: c ? VERDE : VERMELHO });
  let cy = topo - 24;
  for (const [k, v] of campos) {
    page.drawText(`${k}:`, { x: margem + 6, y: cy, size: 6, font: fontBold, color: COR.cinza });
    page.drawText(v.slice(0, 48), { x: margem + 62, y: cy, size: 6.5, font, color: COR.tinta });
    cy -= 8.5;
  }
  if (c) {
    const qr = await fab.doc.embedPng(await QRCode.toBuffer("https://validar.iti.gov.br", { type: "png", margin: 0, width: 160 }));
    const QS = 40;
    page.drawImage(qr, { x: margem + CERT_W - QS - 6, y: topo - CERT_H + 6, width: QS, height: QS });
  }
  y = topo - CERT_H;

  return fab.finalizar();
}
