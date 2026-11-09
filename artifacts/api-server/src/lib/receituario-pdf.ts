/**
 * RECEITUÁRIO MAGISTRAL — gerador de PDF com assinatura ICP-Brasil (PAdES).
 * Padrão visual PAXTER: faixa navy, tabela de fórmulas, rodapé com selo.
 */
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { assertPrescriptionSigner, signPrescriptionPdf, type PrescriptionSigner } from "./prescription-signing";
import { marcarDemonstracao } from "./documentos/marca-demonstracao";
import QRCode from "qrcode";
import { blocoDeveIrParaProximaPagina, separarTomadas } from "./pdf-bloco-integro";
import { ASSINATURA_3A1C_ALTURA, desenharAssinatura3a1c } from "./documentos/bloco-assinatura-3a1c";
import { PAXMED_LIMITE_CONTEUDO, prepararVisualProva, desenharCabecalhoProva, carimbarRodapesProva, carimbarRodapesClinicos } from "./documentos/paxmed-modelo-2b-prova";
import { GRAND_FINALE, prepararArteGrandFinale, desenharPaginaGrandFinale, desenharQuadrosEspeciaisGrandFinale, carimbarRodapeGrandFinale } from "./documentos/receituario-grand-finale";
import type { TextosEmpresa2b } from "./documentos/paxmed-2b-limites";

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

function configText(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function configNumber(config: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function parseDataImage(value: unknown): { bytes: Buffer; mime: "image/png" | "image/jpeg" } | null {
  if (typeof value !== "string" || value.length > 8_000_000) return null;
  const match = value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > 6_000_000) return null;
  return { bytes, mime: match[1] === "png" ? "image/png" : "image/jpeg" };
}

async function embedDesignerImage(pdfDoc: PDFDocument, value: unknown) {
  const raster = parseDataImage(value);
  if (raster) {
    return raster.mime === "image/png"
      ? pdfDoc.embedPng(raster.bytes)
      : pdfDoc.embedJpg(raster.bytes);
  }
  if (typeof value !== "string" || !/^data:image\/svg\+xml/i.test(value)) return null;
  const match = value.match(/^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]+)$/i);
  if (!match) throw new Error("A imagem SVG do modelo está malformada.");
  const svgBytes = match[1]
    ? Buffer.from(match[2], "base64")
    : Buffer.from(decodeURIComponent(match[2]), "utf8");
  if (!svgBytes.length || svgBytes.length > 1_000_000) {
    throw new Error("A imagem SVG do modelo excede o limite permitido.");
  }
  const svg = svgBytes.toString("utf8");
  if (!/<svg[\s>]/i.test(svg) ||
      /<script|<foreignObject|<!DOCTYPE|<!ENTITY|\son[a-z]+\s*=|url\(\s*(['"]?)(?!#|data:image\/(?:png|jpeg);base64,)[^)]+\)/i.test(svg) ||
      /(?:href|xlink:href|src)\s*=\s*(['"])(?!#|data:image\/(?:png|jpeg);base64,)[\s\S]*?\1/i.test(svg)) {
    throw new Error("A imagem SVG contém recursos ou conteúdo não permitido.");
  }
  const image = await loadImage(svgBytes);
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) ||
      image.width < 1 || image.height < 1 || image.width > 8192 || image.height > 8192) {
    throw new Error("As dimensões da imagem SVG do modelo não são válidas.");
  }
  const scale = Math.min(1, 1600 / image.width, 600 / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return pdfDoc.embedPng(canvas.toBuffer("image/png"));
}

function configuredFontFamily(value: unknown): "serif" | "sans" {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return /georgia|garamond|lora|cardo|times/.test(normalized) ? "serif" : "sans";
}

function fontAssetCandidates(name: string): string[] {
  return [
    resolve(import.meta.dirname, "../assets/fonts", name),
    resolve(import.meta.dirname, "../../assets/fonts", name),
    resolve(import.meta.dirname, "assets/fonts", name),
  ];
}

function readFontAsset(name: string): Buffer {
  for (const candidate of fontAssetCandidates(name)) {
    try {
      return readFileSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`A fonte configurada para o receituário não foi encontrada: ${name}`);
}

function configuredColor(value: unknown, fallback: ReturnType<typeof rgb>) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  const hex = value.slice(1);
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  );
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
    font: PDFFont;
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
export async function generateReceituarioPdf(data: ReceituarioData, signer?: PrescriptionSigner): Promise<Uint8Array> {
  assertPrescriptionSigner(signer);
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
  return signPrescriptionPdf(pdfDoc, signer);
}

// ─── V2: Layout ANVISA 4 Boxes ────────────────────────────────────────────────

export interface ReceituarioDataV2 {
  // Box 1 — Emitente (carregado automaticamente pelo backend)
  medicoName: string;
  medicoCrm: string;
  medicoRqe?: string;           // RQE do médico (ex: "12.345")
  clinicaNome: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;

  // Box 2 — Paciente
  pacienteNome?: string;
  pacienteCpf?: string;
  pacienteNascimento?: string;   // YYYY-MM-DD ou DD/MM/YYYY
  pacienteTelefone?: string;
  pacienteEndereco?: string;

  // Prescrição
  formulas: {
    nome: string;
    ativos?: string;       // texto livre multi-linha
    posologia?: string;    // texto livre multi-linha
    via?: string;
    forma?: string;
    observacao?: string;
  }[];

  // Metadados
  tipoReceita?: "especial" | "simples";
  dataEmissao?: string;   // YYYY-MM-DD; default = hoje BRT
  validadeDias?: number;  // default 30
  numeroReceita?: string;
  bandModel?: string;     // id do modelo arabesco (ex: "padua-01-floral-islamico")
  designerConfig?: Record<string, unknown>;
  assinaturaImagem?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };
  assinaturaDigitalEstado?: "assinado" | "sem_certificado_vencido";
  certificadoValidoAte?: string | null;
  duracaoDias?: string | null;
  cid?: string | null;
  farmaciaNome?: string | null;
  farmaciaTipo?: string | null;

  // URL pública de consulta do documento (QR code aponta para ela)
  consultaUrl?: string;   // ex: https://dominio.app/consulta-receituario?token=12C9AA79

  // Títulos dos boxes (opcional — usa defaults ANVISA se omitido)
  boxMedicoTitulo?: string;
  boxPacienteTitulo?: string;
  boxCompradorTitulo?: string;
  boxFarmaciaTitulo?: string;

  // Título e assinatura
  tituloSubtitulo?: string;         // ex: "MODELO DEMONSTRATIVO — SEM VALIDADE"
  homologacao?: boolean;
  /** Exclusivo para testes sintéticos offline; não autoriza emissão clínica. */
  modelo2bProva?: boolean;
  /** Prova do Grand Finale, restrita a dados sintéticos fora de produção. */
  modeloGrandFinaleProva?: boolean;
  /** Composição clínica experimental, permitida apenas em testes isolados. */
  modeloGrandFinaleClinico?: boolean;
  identidade2bProva?: { textos: TextosEmpresa2b; simboloDourado: Uint8Array; nomeImagem?: Uint8Array };
  identidade2bClinica?: { textos: TextosEmpresa2b; simboloDourado: Uint8Array };
  assinaturaTextoFallback?: string; // ex: "Caio H. Pádua" (cursivo acima da linha)

  // Rodapé: até 4 linhas de texto à esquerda (endereço, CNPJ, etc.)
  rodapeLinhas?: string[];
}

// ── Gera PDF a partir de uma imagem PNG capturada do motor HTML ──────────────
// Usada pela rota /assinar-imagem-pdf (motor html2canvas → PNG → este PDF → ICP-Brasil)
export async function generatePdfFromPngBase64(
  pngBase64: string,
  signer?: PrescriptionSigner,
): Promise<Uint8Array> {
  assertPrescriptionSigner(signer);
  const pdfDoc   = await PDFDocument.create();
  const pngBytes = Buffer.from(pngBase64, "base64");
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Página A4 (595.28 x 841.89 pts)
  const page   = pdfDoc.addPage([PAGE_W, PAGE_H]);
  // Escala o PNG para preencher a largura total da página A4
  const scale  = PAGE_W / pngImage.width;
  const drawH  = pngImage.height * scale;

  page.drawImage(pngImage, {
    x:      0,
    y:      Math.max(0, PAGE_H - drawH),
    width:  PAGE_W,
    height: Math.min(drawH, PAGE_H),
  });

  return signPrescriptionPdf(pdfDoc, signer);
}

export async function generateReceituarioPdfV2(data: ReceituarioDataV2, signer?: PrescriptionSigner): Promise<Uint8Array> {
  if (data.modeloGrandFinaleClinico && process.env.NODE_ENV !== "test") {
    throw new Error("O Grand Finale clínico ainda não está liberado fora de testes isolados.");
  }
  if (data.modeloGrandFinaleClinico &&
      (!data.identidade2bClinica || data.homologacao || data.modelo2bProva || data.modeloGrandFinaleProva)) {
    throw new Error("O modelo clínico Grand Finale exige identidade clínica autorizada e não aceita modo de prova.");
  }
  if (data.modeloGrandFinaleClinico && signer) {
    let caminhoProtegido = false;
    try {
      const url = new URL(data.consultaUrl ?? "");
      caminhoProtegido = ["http:", "https:"].includes(url.protocol) &&
        /^\/documento-clinico-receita\/[a-zA-Z0-9_-]{43}$/.test(url.pathname) &&
        !url.search && !url.hash && !url.username && !url.password;
    } catch { /* Sem endereço de acesso válido, a composição é recusada. */ }
    if (!caminhoProtegido) throw new Error("O Grand Finale clínico exige acesso protegido à cópia da receita.");
  }
  if (data.modeloGrandFinaleProva &&
      (!data.homologacao || !data.modelo2bProva || !data.identidade2bProva || process.env.NODE_ENV !== "test" || signer)) {
    throw new Error("A prova Grand Finale exige homologação isolada em ambiente de teste e não aceita assinatura.");
  }
  if (data.modeloGrandFinaleProva &&
      data.clinicaNome?.trim() !== data.identidade2bProva?.textos.nomeCabecalho.trim()) {
    throw new Error("A identidade da clínica não corresponde à identidade da prova.");
  }
  if ((data.modelo2bProva && (!data.homologacao || process.env.NODE_ENV === "production")) ||
      (data.identidade2bProva && !data.modelo2bProva) ||
      (data.identidade2bClinica && (data.modelo2bProva || data.homologacao))) {
    throw new Error("Modelo 2B de prova exige homologação sintética fora de produção.");
  }
  if (data.identidade2bClinica && signer && !data.consultaUrl) {
    throw new Error("A receita assinada exige endereço de acesso protegido.");
  }
  if (signer) assertPrescriptionSigner(signer);
  else if (data.assinaturaDigitalEstado !== "sem_certificado_vencido") {
    throw new Error("A receita precisa de um certificado válido ou da indicação explícita de certificado vencido.");
  }
  const designer = data.designerConfig ?? {};
  const pdfDoc   = await PDFDocument.create();
  const grandFinale = data.modeloGrandFinaleProva || data.modeloGrandFinaleClinico
    ? await prepararArteGrandFinale(pdfDoc, (data.identidade2bClinica ?? data.identidade2bProva)!) : null;
  const visualProva = data.modelo2bProva || data.identidade2bClinica
    ? await prepararVisualProva(pdfDoc, data.identidade2bClinica ?? data.identidade2bProva) : null;
  const fonteProva = visualProva ? await pdfDoc.embedFont(StandardFonts.Helvetica) : null;
  const fonteProvaNegrito = visualProva ? await pdfDoc.embedFont(StandardFonts.HelveticaBold) : null;
  const titleSerif = configuredFontFamily(designer["corpoFonteTitulo"]) === "serif";
  const bodySerif = configuredFontFamily(designer["corpoFonteCorpo"]) === "serif";
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  pdfDoc.registerFontkit(fontkit);
  const [titleRegularBytes, titleBoldBytes, titleItalicBytes, bodyRegularBytes, bodyBoldBytes] = await Promise.all([
    readFontAsset(titleSerif ? "EBGaramond-Regular.ttf" : "Manrope-Regular.woff"),
    readFontAsset(titleSerif ? "EBGaramond-Bold.ttf" : "Manrope-Bold.woff"),
    readFontAsset(titleSerif ? "EBGaramond-SemiBoldItalic.ttf" : "Manrope-Regular.woff"),
    readFontAsset(bodySerif ? "EBGaramond-Regular.ttf" : "Manrope-Regular.woff"),
    readFontAsset(bodySerif ? "EBGaramond-Bold.ttf" : "Manrope-Bold.woff"),
  ]);
  // Rótulos (Via, Forma, Posologia): sempre EB Garamond itálico — clássico e elegante.
  const rotuloBytes = titleSerif ? titleItalicBytes : await readFontAsset("EBGaramond-SemiBoldItalic.ttf");
  const fontRotulo = await pdfDoc.embedFont(rotuloBytes, { subset: false, features: { liga: false, clig: false } });
  const [titleReg, titleBold, fontReg, fontBold, fontItal] = await Promise.all([
    pdfDoc.embedFont(titleRegularBytes, titleSerif ? { subset: false, features: { liga: false, clig: false } } : { subset: true, features: { liga: false, clig: false } }),
    pdfDoc.embedFont(titleBoldBytes, titleSerif ? { subset: false, features: { liga: false, clig: false } } : { subset: true, features: { liga: false, clig: false } }),
    pdfDoc.embedFont(bodyRegularBytes, bodySerif ? { subset: false, features: { liga: false, clig: false } } : { subset: true, features: { liga: false, clig: false } }),
    pdfDoc.embedFont(bodyBoldBytes, bodySerif ? { subset: false, features: { liga: false, clig: false } } : { subset: true, features: { liga: false, clig: false } }),
    titleSerif
      ? pdfDoc.embedFont(titleItalicBytes, { subset: false, features: { liga: false, clig: false } })
      : pdfDoc.embedFont(StandardFonts.HelveticaOblique),
  ]);

  // ── QR da cópia exata da receita; a validação PAdES ocorre no próprio PDF.
  const ITI_VALIDATION_URL = "https://validar.iti.gov.br/";
  const qrTarget = signer ? (data.consultaUrl ?? ITI_VALIDATION_URL) : null;
  const certMeta = signer?.meta;
  let certQrImg: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try {
    if (qrTarget) {
      const qrBuf = await QRCode.toBuffer(qrTarget, {
        width: 80, margin: 1,
        color: { dark: "#151c2eff", light: "#ffffffff" },
      });
      certQrImg = await pdfDoc.embedPng(qrBuf);
    }
  } catch (error) {
    if (data.consultaUrl) {
      throw new Error(`Não foi possível gerar o QR de acesso à receita: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Cursor de página único e reapontável: o conteúdo longo continua na página seguinte.
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const M  = 36;
  const CW = PAGE_W - M * 2; // ≈ 523

  const dataStr   = data.dataEmissao ?? hoje();
  const dataFmt   = fmtData(dataStr);
  const tipo      = data.tipoReceita ?? "especial";
  const tituloDoc = tipo === "especial"
    ? "RECEITUÁRIO DE CONTROLE ESPECIAL"
    : "RECEITUÁRIO SIMPLES — FÓRMULAS MANIPULADAS";

  // Data por extenso para o bloco de assinatura
  const MESES = [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro",
  ];
  const [ano, mes, dia] = dataStr.split("-");
  const dataExtenso = `${parseInt(dia, 10)} de ${MESES[parseInt(mes, 10) - 1] ?? ""} de ${ano}`;

  // Linha CRM + RQE usada em cabeçalho e assinatura
  const crmRqeStr = data.medicoCrm
    ? (data.medicoRqe ? `${data.medicoCrm} — RQE: ${data.medicoRqe}` : data.medicoCrm)
    : "";

  // ── Helpers internos ──────────────────────────────────────────────────────
  function wrapLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const words = safeTxt(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if ((font as any).widthOfTextAtSize(cand, size) > maxW && cur) {
        lines.push(cur); cur = w;
      } else { cur = cand; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  /**
   * Rótulo em maiúsculas muted 6pt + valor dark 7pt (ou linha pontilhada).
   * bold=true usa fontBold para o valor — aplicar no campo de nome (destaque).
   * Retorna novo y após o campo (campo ocupa ~19pt total).
   */
  function drawField(
    bx: number, by: number, label: string,
    value: string | null | undefined,
    maxW: number,
    opts: { bold?: boolean; valueSize?: number; escala?: number } = {},
  ): number {
    const escala = opts.escala ?? 1;
    const vSize = (opts.valueSize ?? 7) * escala;
    const vFont = opts.bold ? fontBold : fontReg;
    // Rótulo: 6pt bold #555, letterSpacing via espaçamento manual entre palavras
    page.drawText(`${label.toUpperCase()}:`, {
      x: bx, y: by, font: fontBold, size: 6 * escala, color: MUTED,
    });
    by -= 9 * escala;
    if (value?.trim()) {
      for (const ln of wrapLines(value, vFont, vSize, maxW)) {
        page.drawText(ln, { x: bx, y: by, font: vFont, size: vSize, color: DARK });
        by -= (vSize + 2 * escala);
      }
    } else {
      // Linha pontilhada: 0.4px dotted #bbb (motor: borderBottom dotted #bbb)
      page.drawLine({
        start: { x: bx, y: by + 2 }, end: { x: bx + maxW, y: by + 2 },
        thickness: 0.4, color: rgb(0.73, 0.73, 0.73), dashArray: [1, 2.5], dashPhase: 0,
      });
      by -= 10 * escala;
    }
    return by - 2 * escala;
  }

  /**
   * Linha inline de múltiplas colunas — gap 6mm entre colunas (motor: gap "0 6mm").
   * Retorna novo y.
   */
  function drawInlineRow(
    bx: number, by: number,
    cols: { label: string; value?: string | null }[],
    totalW: number,
    escala = 1,
  ): number {
    const GAP  = 6;  // gap em pt entre colunas (≈ 6mm seria 17pt mas comprimimos)
    const nCols = cols.length;
    const colW = (totalW - GAP * (nCols - 1)) / nCols;
    for (let i = 0; i < nCols; i++) {
      const cx = bx + i * (colW + GAP);
      const c  = cols[i];
      page.drawText(`${c.label.toUpperCase()}:`, {
        x: cx, y: by, font: fontBold, size: 6 * escala, color: MUTED,
      });
      const vy = by - 9 * escala;
      if (c.value?.trim()) {
        let txt = safeTxt(c.value);
        while (txt.length > 1 && (fontReg as any).widthOfTextAtSize(txt, 7 * escala) > colW - 2) {
          txt = txt.slice(0, -1);
        }
        page.drawText(txt, { x: cx, y: vy, font: fontReg, size: 7 * escala, color: DARK });
      } else {
        page.drawLine({
          start: { x: cx, y: vy + 2 }, end: { x: cx + colW - 2, y: vy + 2 },
          thickness: 0.4, color: rgb(0.73, 0.73, 0.73), dashArray: [1, 2.5], dashPhase: 0,
        });
      }
    }
    return by - 21 * escala;
  }

  /** Linha decorativa fina — igual ao <LinhaDecorativa/> do motor. */
  function drawDecorLine(
    y: number,
    active = true,
    thickness = 0.4,
    style: "simples" | "dupla" | "ornamentada" = "simples",
    color: ReturnType<typeof rgb> = LINE,
  ): void {
    if (!active) return;
    if (style === "dupla") {
      page.drawLine({ start: { x: M, y: y + 1.5 }, end: { x: PAGE_W - M, y: y + 1.5 }, thickness, color });
      page.drawLine({ start: { x: M, y: y - 1.5 }, end: { x: PAGE_W - M, y: y - 1.5 }, thickness, color });
      return;
    }
    if (style === "ornamentada") {
      const middle = PAGE_W / 2;
      page.drawLine({ start: { x: M, y }, end: { x: middle - 5, y }, thickness, color });
      page.drawLine({ start: { x: middle + 5, y }, end: { x: PAGE_W - M, y }, thickness, color });
      page.drawRectangle({ x: middle - 1.5, y: y - 1.5, width: 3, height: 3, color });
      return;
    }
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness, color });
  }

  // ── Arabesco: carrega o PNG uma só vez, reutiliza nas duas faixas ─────────
  const ARAB_IDS = [
    "padua-01-floral-islamico","padua-02-floral-simetrico","padua-03-rinceau-flamingo",
    "padua-04-acanto-florentino","padua-05-ogival-moghul","padua-06-rinceau-mandala",
    "padua-07-acanto-barroco","padua-08-acanto-renascentista","padua-09-rinceau-fino",
    "padua-10-acanto-floral","padua-11-acanto-romantico",
  ];
  const bandId = data.bandModel
    || (typeof designer["bandModelId"] === "string" ? designer["bandModelId"] : "")
    || "padua-01-floral-islamico";
  let arabImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  const customBands = Array.isArray(designer["customBands"])
    ? designer["customBands"] as Array<Record<string, unknown>>
    : [];
  const customBand = customBands.find((band) => band["id"] === bandId);
  if (customBand) {
    arabImg = await embedDesignerImage(pdfDoc, customBand["dataUrl"]) as typeof arabImg;
    if (!arabImg) throw new Error("A faixa personalizada selecionada não contém uma imagem válida.");
  } else if (ARAB_IDS.includes(bandId)) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(currentDir, "assets", "arabesques", `${bandId}.png`),
      resolve(currentDir, "../../../padcom/public/assets/arabesques", `${bandId}.png`),
    ];
    let buf: Buffer | undefined;
    for (const candidate of candidates) {
      try { buf = readFileSync(candidate); break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (!buf) throw new Error("Faixa do receituário não encontrada nos recursos do servidor.");
    arabImg = await pdfDoc.embedPng(buf);
  } else {
    throw new Error("A faixa selecionada não existe no modelo ativo do receituário.");
  }

  /**
   * Desenha a faixa arabesca ATRÁS dos boxes.
   * Motor HTML: a faixa cobre TODA a altura do bloco (bandH = boxH),
   * full-width da página — os boxes brancos ficam por cima.
   * Borda superior e inferior de 0.8px (motor: borderTop + borderBottom 0.8px solid #8f8f8b).
   */
  function drawArabBand(boxTop: number, boxH: number): void {
    if (!arabImg) return;
    const bandY = boxTop - boxH;          // topo do box = topo da faixa
    const bandH = boxH;                   // faixa cobre toda a altura do bloco
    page.drawImage(arabImg, { x: 0, y: bandY, width: PAGE_W, height: bandH });
    // Linhas de borda (motor: borderTop + borderBottom #8f8f8b 0.8px)
    const borderC = rgb(0.56, 0.56, 0.545); // #8f8f8b
    page.drawLine({ start: { x: 0, y: bandY + bandH }, end: { x: PAGE_W, y: bandY + bandH },
      thickness: 0.8, color: borderC });
    page.drawLine({ start: { x: 0, y: bandY }, end: { x: PAGE_W, y: bandY },
      thickness: 0.8, color: borderC });
  }

  /** Desenha o par de boxes (D06 corrigido: borda escura #454545 + faixinha lateral ciano). */
  // Borda escura: rgb(0.27, 0.27, 0.27) = #454545 (motor: border 1px #454545)
  const BOX_BORDER = rgb(182 / 255, 138 / 255, 55 / 255); // dourado #B68A37 (igual ao quadro do certificado)
  // Faixinha lateral esquerda: 3pt de largura, cor ciano da marca (#45B8CC)
  const BOX_STRIP  = configuredColor(designer["boxFaixinhaCor"], rgb(0.271, 0.722, 0.800));
  const STRIP_W    = designer["boxFaixinhaEsquerda"] === true ? 3 : 0;
  const BOX_BORDER_W = configNumber(designer, "boxBorderWidth", 0.8, 0.25, 3);

  function drawBoxPair(
    boxTop: number, boxH: number, titleH: number,
    bx1: number, bx2: number, boxW1: number, boxW2: number,
    titulo1: string, titulo2: string,
  ): void {
    for (const [bx, boxW, titulo] of [
      [bx1, boxW1, titulo1], [bx2, boxW2, titulo2],
    ] as [number, number, string][]) {
      // ① Caixa principal branca — borda escura #454545, borderWidth 0.8
      // Contorno dourado com cantos arredondados (mesmo estilo do quadro do certificado).
      // Caminho SVG tem eixo Y para baixo: ancora no topo da caixa.
      const k = 2.1 * (72 / 25.4); // mesmo raio do quadro do certificado
      page.drawSvgPath(
        `M ${k} 0 L ${boxW - k} 0 Q ${boxW} 0 ${boxW} ${k} L ${boxW} ${boxH - k} Q ${boxW} ${boxH} ${boxW - k} ${boxH} L ${k} ${boxH} Q 0 ${boxH} 0 ${boxH - k} L 0 ${k} Q 0 0 ${k} 0 Z`,
        { x: bx, y: boxTop, color: WHITE, borderColor: BOX_BORDER, borderWidth: BOX_BORDER_W });

      // ② Faixinha lateral esquerda ciano (3pt) — cobre a borda esq. da caixa
      if (STRIP_W > 0) {
        page.drawRectangle({ x: bx, y: boxTop - boxH, width: STRIP_W, height: boxH,
          color: BOX_STRIP });
      }

      // ③ Título: texto centralizado bold 7pt (motor: fontSize:7 fontWeight:700)
      //    SEM fill rect — apenas linha pontilhada ABAIXO do texto (motor: borderBottom 0.4px #ddd)
      const tW = (titleBold as any).widthOfTextAtSize(titulo, 7);
      page.drawText(titulo, {
        x: bx + (boxW - tW) / 2, y: boxTop - 11,
        font: titleBold, size: 7, color: rgb(0.13, 0.13, 0.13),
      });
      // Linha separadora abaixo do título (motor: borderBottom: "0.4px solid #ddd")
      const titleLineY = boxTop - titleH;
      page.drawLine({
        start: { x: bx + STRIP_W + 2, y: titleLineY },
        end:   { x: bx + boxW - 2,    y: titleLineY },
        thickness: 0.4, color: rgb(0.87, 0.87, 0.87),
      });
    }
  }

  // ── Constantes de layout ──────────────────────────────────────────────────
  const MM = 72 / 25.4;
  const BOX_GAP = configNumber(designer, "boxBandGap", 4, 2, 15) * MM;
  const BOX_TOTAL_W = CW * configNumber(designer, "boxWidthPct", 100, 30, 100) / 100;
  const BOX_CONTENT_W = Math.max(1, BOX_TOTAL_W - BOX_GAP);
  const especialCompacto = !!grandFinale && tipo === "especial";
  const escalaQuadros = especialCompacto ? GRAND_FINALE.quadrosEspecialEscala : 1;
  const deslocamentoQuadros = PAGE_W * (1 - escalaQuadros) / 2;
  const BOX1_W = grandFinale ? 388 * PAGE_W / 1055 * escalaQuadros : BOX_CONTENT_W * configNumber(designer, "boxLeftWidthPercent", 50, 30, 70) / 100;
  const BOX2_W = grandFinale ? BOX1_W : BOX_CONTENT_W - BOX1_W;
  const BX1 = grandFinale ? deslocamentoQuadros + 83 * PAGE_W / 1055 * escalaQuadros : M + (CW - BOX_TOTAL_W) / 2;
  const BX2 = grandFinale ? deslocamentoQuadros + 582 * PAGE_W / 1055 * escalaQuadros : BX1 + BOX1_W + BOX_GAP;
  const TITLE_H  = 14;

  // ══════════════════════════════════════════════════════════════════════════
  // PAGINAÇÃO — o receituário cresce em páginas; nunca recusa por excesso de itens.
  // ══════════════════════════════════════════════════════════════════════════
  let y = 0;
  const FOOTER_TOP = configNumber(designer, "sepInfBottom", 20, 8, 35) * MM + 7.3;
  const BODY_BOTTOM = especialCompacto ? GRAND_FINALE.corpoEspecialBase
    : grandFinale ? GRAND_FINALE.corpoBase : visualProva ? PAXMED_LIMITE_CONTEUDO : FOOTER_TOP + 12;

  const footerMarkData = designer["rodapeSistemaModo"] === "imagem"
    ? designer["rodapeSistemaImagemDataUrl"] ?? designer["rodapeSistemaLogoDataUrl"]
    : undefined;
  const footerMarkImg = footerMarkData ? await embedDesignerImage(pdfDoc, footerMarkData) : null;
  if (footerMarkData && !footerMarkImg) {
    throw new Error("A imagem configurada no rodapé do receituário não é válida.");
  }

  /** Rodapé da página corrente (identidade da clínica + marca do modelo). */
  function drawFooter(): void {
    if (visualProva) return;
    if (designer["sepInfAtivo"] !== false) {
      page.drawLine({
        start: { x: M, y: FOOTER_TOP }, end: { x: PAGE_W - M, y: FOOTER_TOP },
        thickness: configNumber(designer, "sepInfEspessura", 0.3, 0.2, 2.5) * 0.6,
        color: LINE,
      });
    }
    const rodapeLinhas = (data.rodapeLinhas?.length)
      ? data.rodapeLinhas
      : [
          safeTxt(data.clinicaNome),
          ...(data.clinicaEndereco ? [safeTxt(data.clinicaEndereco)] : []),
          ...(data.clinicaTelefone ? [`Tel: ${safeTxt(data.clinicaTelefone)}`] : []),
          signer
            ? "Documento assinado digitalmente — ICP-Brasil / PAdES"
            : "Documento gerado sem assinatura digital",
        ];
    let rl_y = FOOTER_TOP - 5;
    rodapeLinhas.slice(0, 4).forEach((linha, i) => {
      page.drawText(safeTxt(linha).slice(0, 72), {
        x: M, y: rl_y,
        font: fontReg, size: i === 0 ? 5.5 : 5, color: i === 0 ? DARK : MUTED,
      });
      rl_y -= 7;
    });
    // A marca lateral é parte do modelo; não substitui a identidade clínica.
    if (footerMarkImg) {
      const wmarkH = 22;
      const wmarkW = (footerMarkImg.width / footerMarkImg.height) * wmarkH;
      page.drawImage(footerMarkImg, { x: PAGE_W - M - wmarkW, y: FOOTER_TOP - wmarkH - 2, width: wmarkW, height: wmarkH });
    } else {
      const brandName = configText(designer, "rodapePaxterNome", "PAXTER");
      const paxterW = (titleBold as any).widthOfTextAtSize(brandName, 9);
      const subTxt  = configText(designer, "rodapePaxterSubtitulo", "Clinical Intelligence System");
      const subW    = (fontReg as any).widthOfTextAtSize(subTxt, 5);
      const rightX  = PAGE_W - M - Math.max(paxterW, subW);
      page.drawText(brandName, { x: rightX, y: FOOTER_TOP - 6, font: titleBold, size: 9, color: GOLD });
      page.drawText(subTxt, { x: rightX, y: FOOTER_TOP - 15, font: fontReg, size: 5, color: MUTED });
    }
  }

  /** Usa a área fixa das caixas da arte, sem truncar dados clínicos. */
  function drawGrandIdentidade(): void {
    const top = PAGE_H - 330 * PAGE_H / 1491;
    const bottom = PAGE_H - 452 * PAGE_H / 1491;
    const largura = 200;
    function quadro(x: number, nome: string | undefined, infos: Array<{ label: string; value?: string | null }>, endereco?: string) {
      const nomeLinhas = wrapLines(nome || "—", fontBold, 7.5, largura);
      const enderecoLinhas = wrapLines(endereco || "—", fontReg, 6.8, largura);
      const total = 9 + nomeLinhas.length * 9 + 4 + 9 + 10 + 4 + 9 + enderecoLinhas.length * 8;
      if (top - total < bottom ||
          nomeLinhas.some(t => fontBold.widthOfTextAtSize(t, 7.5) > largura) ||
          enderecoLinhas.some(t => fontReg.widthOfTextAtSize(t, 6.8) > largura)) {
        throw new Error("Os dados de identificação excedem o espaço do receituário.");
      }
      let fy = top;
      page.drawText("NOME:", { x, y: fy, font: fontBold, size: 5.5, color: MUTED });
      fy -= 9;
      for (const line of nomeLinhas) {
        page.drawText(line, { x, y: fy, font: fontBold, size: 7.5, color: DARK });
        fy -= 9;
      }
      fy -= 4;
      const colW = largura / infos.length;
      for (let i = 0; i < infos.length; i++) {
        const value = safeTxt(infos[i].value || "—");
        if (fontReg.widthOfTextAtSize(value, 6.3) > colW - 3) {
          throw new Error(`O campo ${infos[i].label} não cabe na identificação do receituário.`);
        }
        page.drawText(infos[i].label.toUpperCase(), { x: x + colW * i, y: fy, font: fontBold, size: 5, color: MUTED });
        page.drawText(value, { x: x + colW * i, y: fy - 9, font: fontReg, size: 6.3, color: DARK });
      }
      fy -= 23;
      page.drawText("ENDEREÇO:", { x, y: fy, font: fontBold, size: 5.5, color: MUTED });
      fy -= 9;
      for (const line of enderecoLinhas) {
        page.drawText(line, { x, y: fy, font: fontReg, size: 6.8, color: DARK });
        fy -= 8;
      }
    }
    const nasc = data.pacienteNascimento?.trim()
      ? (/^\d{2}\/\d{2}\/\d{4}$/.test(data.pacienteNascimento.trim())
        ? data.pacienteNascimento.trim() : fmtData(data.pacienteNascimento.trim()))
      : undefined;
    quadro(56, data.pacienteNome, [
      { label: "CPF", value: data.pacienteCpf }, { label: "Nascimento", value: nasc },
      { label: "Telefone", value: data.pacienteTelefone },
    ], data.pacienteEndereco);
    quadro(338, data.medicoName, [
      { label: "Conselho", value: data.medicoCrm }, { label: "RQE", value: data.medicoRqe },
      { label: "Telefone", value: data.clinicaTelefone },
    ], data.clinicaEndereco);
  }

  /** Fecha a página corrente (rodapé) e abre a seguinte com cabeçalho de continuação. */
  function newPage(): void {
    drawFooter();
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    if (grandFinale) {
      desenharPaginaGrandFinale(page, grandFinale, { titulo: titleBold, texto: fontReg }, tipo);
      drawGrandIdentidade();
      iniciarCorpoGrandFinale();
      return;
    }
    if (visualProva && fonteProva && fonteProvaNegrito) {
      y = desenharCabecalhoProva(page, visualProva, fonteProva, fonteProvaNegrito,
        "PRESCRIÇÃO MÉDICA", "RECEITUÁRIO / MEDICAMENTOS", !data.identidade2bClinica);
      return;
    }
    y = PAGE_H - M;
    page.drawText(safeTxt(data.clinicaNome), { x: M, y: y - 8, font: titleBold, size: 9, color: DARK });
    const cont = `Receituário (continuação) — Paciente: ${safeTxt(data.pacienteNome ?? "")}`.slice(0, 80);
    const contW = (fontReg as any).widthOfTextAtSize(cont, 7);
    page.drawText(cont, { x: PAGE_W - M - contW, y: y - 8, font: fontReg, size: 7, color: MUTED });
    y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.4, color: LINE });
    y -= 14;
  }

  function iniciarCorpoGrandFinale(): void {
    y = GRAND_FINALE.corpoTopo;
    if (!data.numeroReceita) return;
    const numero = `Número da receita: ${safeTxt(data.numeroReceita)}`;
    if (fontBold.widthOfTextAtSize(numero, 8) > CW) {
      throw new Error("O número da receita excede a largura disponível.");
    }
    page.drawText(numero, { x: M, y, font: fontBold, size: 8, color: DARK });
    y -= 14;
  }

  /** Garante `needed` pontos livres acima do rodapé; senão quebra a página. */
  function ensureSpace(needed: number): void {
    if (y - needed < BODY_BOTTOM) newPage();
  }

  /** Texto com quebra de linha E de página (uma linha por vez). */
  function drawWrappedPaged(
    text: string,
    opts: { x: number; maxWidth: number; font: PDFFont; size: number; color: ReturnType<typeof rgb>; lineHeight: number },
  ): void {
    for (const ln of wrapLines(text, opts.font, opts.size, opts.maxWidth)) {
      if (grandFinale && opts.font.widthOfTextAtSize(ln, opts.size) > opts.maxWidth) {
        throw new Error("Um trecho do conteúdo não cabe na largura do receituário.");
      }
      ensureSpace(opts.lineHeight);
      page.drawText(ln, { x: opts.x, y, font: opts.font, size: opts.size, color: opts.color });
      y -= opts.lineHeight;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CABEÇALHO (motor: logo LEFT + nome + subtítulo  |  RCE + vias RIGHT)
  // ══════════════════════════════════════════════════════════════════════════
  const lineStyle = (["simples", "dupla", "ornamentada"].includes(String(designer["linhaEstiloCabecalho"]))
    ? designer["linhaEstiloCabecalho"] : "simples") as "simples" | "dupla" | "ornamentada";
  if (grandFinale) {
    desenharPaginaGrandFinale(page, grandFinale, { titulo: titleBold, texto: fontReg }, tipo);
  } else if (visualProva && fonteProva && fonteProvaNegrito) {
    y = desenharCabecalhoProva(page, visualProva, fonteProva, fonteProvaNegrito,
      "PRESCRIÇÃO MÉDICA", "RECEITUÁRIO / MEDICAMENTOS", !data.identidade2bClinica);
  } else {
  y = PAGE_H - M;

  const headerLogoRaw = designer["cabecalhoLogoDataUrl"] ??
    (designer["cabecalhoNomeModo"] === "imagem" ? designer["cabecalhoNomeImagemDataUrl"] : undefined);
  const headerLogo = headerLogoRaw ? await embedDesignerImage(pdfDoc, headerLogoRaw) : null;
  if (headerLogoRaw && !headerLogo) {
    throw new Error("A imagem configurada no cabeçalho do receituário não é válida.");
  }
  if (headerLogo) {
    const scale = Math.min(34 / headerLogo.width, 26 / headerLogo.height);
    page.drawImage(headerLogo, {
      x: M, y: y - 26 + (26 - headerLogo.height * scale) / 2,
      width: headerLogo.width * scale, height: headerLogo.height * scale,
    });
  }

  // O modelo define tipografia e subtítulos; identidade real vem do cadastro ativo.
  const headerTextX = M + (headerLogo ? 40 : 0);
  page.drawText(safeTxt(data.clinicaNome), {
    x: headerTextX, y: y - 11, font: titleBold, size: 13, color: DARK,
  });
  const subtitle1 = configText(designer, "cabecalhoTitulo", " ");
  const subtitle2 = configText(designer, "cabecalhoSubtitulo", "");
  if (subtitle1.trim()) {
    page.drawText(subtitle1.slice(0, 75), { x: headerTextX, y: y - 25, font: titleReg, size: 7, color: MUTED });
  }
  if (subtitle2.trim()) {
    page.drawText(subtitle2.slice(0, 75), { x: headerTextX, y: y - 34, font: titleReg, size: 6, color: MUTED });
  }
  // D05 REMOVIDO: linha médico/CRM não existe no cabeçalho do motor

  // RCE code + vias (lado DIREITO — motor: textAlign right, stack de linhas)
  const rceTemplate = configText(designer, "cabecalhoRceNumero", "");
  const rce = data.numeroReceita
    ? `Nº ${data.numeroReceita}`
    : rceTemplate.replace(/\{\{ano\}\}/g, ano).replace(/\{\{numero\}\}/g, "");
  const rceW = (fontBold as any).widthOfTextAtSize(rce, 7);
  page.drawText(rce,
    { x: PAGE_W - M - rceW, y: y - 11, font: fontBold, size: 7, color: MUTED });
  if (!data.homologacao) {
    const vias = configText(designer, "cabecalhoVias", "1ª via - Farmácia — 2ª via - Paciente");
    page.drawText(vias.slice(0, 64),
      { x: PAGE_W - M - (fontReg as any).widthOfTextAtSize(vias.slice(0, 64), 6), y: y - 21, font: fontReg, size: 6, color: MUTED });
  }

  y -= 42;
  y -= configNumber(designer, "sepSup1MarginTop", 3, 0, 20) * MM;
  drawDecorLine(y, designer["sepSup1Ativo"] !== false,
    configNumber(designer, "sepSup1Espessura", 0.5, 0.2, 2.5) * 0.6, lineStyle);
  y -= 12;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. TÍTULO DO DOCUMENTO (motor: centrado bold 16px uppercase letterSpacing 2)
  // ══════════════════════════════════════════════════════════════════════════
  // D07 corrigido: size 16 (motor usa fontSize 16, fontWeight 800)
  const configuredTitle = data.homologacao
    ? "DEMONSTRAÇÃO DE RECEITUÁRIO"
    : configText(designer, "tituloDocumento", tituloDoc);
  const displayedTitle = tipo === "especial"
    ? configuredTitle
    : configuredTitle.replace(/(DE\s+)?CONTROLE\s+ESPECIAL/gi, "SIMPLES");
  if (!grandFinale) {
  const titW = (titleBold as any).widthOfTextAtSize(displayedTitle, 16);
  page.drawText(displayedTitle,
    { x: (PAGE_W - titW) / 2, y, font: titleBold, size: 16, color: DARK });
  y -= 18;
  // D10 corrigido: tituloSubtitulo abaixo do título (motor: fontSize 7, letterSpacing 2, color MUTED)
  const configuredSubtitle = data.tituloSubtitulo ?? configText(designer, "tituloSubtitulo", "");
  if (configuredSubtitle.trim()) {
    const subW = (titleReg as any).widthOfTextAtSize(configuredSubtitle.toUpperCase(), 7);
    page.drawText(configuredSubtitle.toUpperCase(),
      { x: (PAGE_W - subW) / 2, y, font: titleReg, size: 7, color: MUTED });
    y -= 10;
  } else {
    y -= 4;
  }
  y -= configNumber(designer, "sepSup2MarginTop", 3, 0, 20) * MM;
  drawDecorLine(y, designer["sepSup2Ativo"] !== false,
    configNumber(designer, "sepSup2Espessura", 0.5, 0.2, 2.5) * 0.6, lineStyle);
  y -= 10;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. FAIXA SUPERIOR — Box 1 (Emitente) + Box 2 (Paciente)
  //    Arabescos ATRÁS; boxes brancos NA FRENTE. (motor: BandaComBoxes)
  // ══════════════════════════════════════════════════════════════════════════
  const BOX1_H   = Math.max(116, configNumber(designer, "boxSuperiorMinHeight", 120, 100, 500) * 0.75);
  const BOX1_TOP = y;

  if (grandFinale) {
    drawGrandIdentidade();
  } else {
  drawArabBand(BOX1_TOP, BOX1_H);
  drawBoxPair(BOX1_TOP, BOX1_H, TITLE_H, BX1, BX2, BOX1_W, BOX2_W,
    configText(designer, "boxPacienteTitulo", data.boxPacienteTitulo ?? "IDENTIFICAÇÃO DO PACIENTE"),
    configText(designer, "boxMedicoTitulo", data.boxMedicoTitulo ?? "IDENTIFICAÇÃO DO EMITENTE"),
  );

  // Padding interno dos boxes — motor: padding "3mm 4mm" = ~8.5pt top / ~11.3pt left
  const BP_L = configNumber(designer, "boxInnerPaddingX", 4, 2, 12) * MM;
  const BP_T = 3 * MM;

  // Box 1 — Emitente (motor: emitentRows)
  {
    const iW = BOX2_W - BP_L - 6; // largura interna para campos
    let fy = BOX1_TOP - TITLE_H - BP_T;

    // ROW 1: Profissional/Prescritor — BOLD 8pt para destacar o nome (CEO req.)
    fy = drawField(BX2 + BP_L, fy, "Profissional/Prescritor",
      data.medicoName, iW, { bold: true, valueSize: 8 });

    // ROW 2 inline 3 cols: Conselho | RQE | Telefone
    fy = drawInlineRow(BX2 + BP_L, fy,
      [
        { label: "Conselho",  value: data.medicoCrm },
        { label: "RQE",       value: data.medicoRqe },
        { label: "Telefone",  value: data.clinicaTelefone },
      ], iW);

    // ROW 3 single: Endereço do Consultório
    drawField(BX2 + BP_L, fy, "Endereço do Consultório", data.clinicaEndereco, iW);
  }

  // Box 2 — Paciente (motor: pacienteRows)
  {
    const iW = BOX1_W - BP_L - 6;
    let fy = BOX1_TOP - TITLE_H - BP_T;

    // Normaliza nascimento: aceita DD/MM/YYYY ou YYYY-MM-DD
    let nasc: string | undefined;
    if (data.pacienteNascimento?.trim()) {
      const n = data.pacienteNascimento.trim();
      nasc = /^\d{2}\/\d{2}\/\d{4}$/.test(n) ? n : fmtData(n);
    }

    // ROW 1: Nome Completo — BOLD 8pt para destacar o nome do paciente (CEO req.)
    fy = drawField(BX1 + BP_L, fy, "Nome Completo",
      data.pacienteNome, iW, { bold: true, valueSize: 8 });

    // ROW 2 inline 3 cols: CPF | Nascimento | Telefone
    fy = drawInlineRow(BX1 + BP_L, fy,
      [
        { label: "CPF",        value: data.pacienteCpf },
        { label: "Nascimento", value: nasc },
        { label: "Telefone",   value: data.pacienteTelefone },
      ], iW);

    // ROW 3 single: Endereço Completo
    drawField(BX1 + BP_L, fy, "Endereço Completo", data.pacienteEndereco, iW);
  }

  y = BOX1_TOP - BOX1_H - 17;
  }
  // Campos especiais usam o mesmo espaçamento nos dois modelos.
  const BP_L = configNumber(designer, "boxInnerPaddingX", 4, 2, 12) * MM;
  const BP_T = 3 * MM;
  if (grandFinale) iniciarCorpoGrandFinale();

  // ══════════════════════════════════════════════════════════════════════════
  // 4. CORPO / FÓRMULAS (motor: "Prescrevo:" italic + FormulaReal)
  // ══════════════════════════════════════════════════════════════════════════
  if (!grandFinale) {
    page.drawText(data.homologacao ? "Itens para demonstração:" : "Prescrevo:", { x: M, y, font: fontItal, size: 11, color: rgb(0, 0, 0) });
    y -= 19;
  }

  // Preto puro e a mesma fonte para ativos e posologia: impressão a laser.
  const TINTA = rgb(0, 0, 0);
  const BODY_SIZE = especialCompacto ? 8.4 : 9;
  const BODY_LINE_HEIGHT = especialCompacto ? 10.8 : 12;

  for (let i = 0; i < data.formulas.length; i++) {
    const f   = data.formulas[i];
    const num = String(i + 1).padStart(2, "0");
    // A fórmula inteira fica na mesma página (não corta ativos/posologia ao meio).
    const lineCount = (text?: string | null) => (text ?? "").split("\n")
      .filter((line) => line.trim()).reduce((total, line) =>
        total + wrapLines(`  ${line.trim()}`, fontReg, BODY_SIZE, CW - 14).length, 0);
    const nAtivos = lineCount(f.ativos);
    // Cada tomada ocupa a(s) sua(s) própria(s) linha(s), uma embaixo da outra.
    const tomadas = separarTomadas(f.posologia);
    const nPos = tomadas.reduce((total, t) =>
      total + wrapLines(`  ${t}`, fontReg, BODY_SIZE, CW - 14).length, 0);
    const linhasNome = grandFinale ? wrapLines(safeTxt(f.nome), titleBold, 11, CW - 18).length : 1;
    const linhasObs = grandFinale && f.observacao?.trim()
      ? wrapLines(`  Obs.: ${safeTxt(f.observacao)}`, fontItal, 7.5, CW - 14).length : 1;
    const itemHeight = 16 * linhasNome + ((f.via || f.forma) ? 13 : 0) +
      nAtivos * BODY_LINE_HEIGHT + (nPos ? 15 + nPos * BODY_LINE_HEIGHT : 0) +
      (f.observacao ? 11 * linhasObs : 0) + 18;
    // Regra do CEO: fórmula inteira + 1 linha em branco, senão vai inteira para a próxima página.
    if (blocoDeveIrParaProximaPagina({
      y, alturaBloco: itemHeight, limiteInferior: BODY_BOTTOM,
      linhaEmBranco: BODY_LINE_HEIGHT, topoPaginaNova: grandFinale
        ? GRAND_FINALE.corpoTopo - (data.numeroReceita ? 14 : 0) : PAGE_H - M - 32,
    })) newPage();
    else ensureSpace(55);

    // D03 corrigido: número MUTED (cinza #555), NÃO dourado
    // D04 corrigido: nome preserva case original (NÃO força uppercase)
    page.drawText(`${num}`, { x: M, y, font: titleBold, size: 11, color: rgb(0, 0, 0) });
    if (grandFinale) {
      drawWrappedPaged(safeTxt(f.nome), { x: M + 18, maxWidth: CW - 18,
        font: titleBold, size: 11, color: rgb(0, 0, 0), lineHeight: 16 });
    } else {
      page.drawText(safeTxt(f.nome),
        { x: M + 18, y, font: titleBold, size: 11, color: rgb(0, 0, 0) });
      y -= 16;
    }

    // Via e Forma em UMA linha, alinhadas por duas guias verticais fixas
    // (iguais em todas as fórmulas), logo abaixo do nome.
    if (f.via || f.forma) {
      const xVia = M + 14;
      const xForma = M + 14 + 150;
      const par = (rotulo: string, valor: string, x: number) => {
        page.drawText(`${rotulo}:`, { x, y, font: fontRotulo, size: 9.5, color: TINTA });
        const w = fontRotulo.widthOfTextAtSize(`${rotulo}: `, 9.5);
        const limite = rotulo === "Via" ? xForma : PAGE_W - M;
        if (grandFinale && x + w + fontReg.widthOfTextAtSize(safeTxt(valor), BODY_SIZE) > limite - 4) {
          throw new Error(`O campo ${rotulo} excede a largura do receituário.`);
        }
        page.drawText(safeTxt(valor), { x: x + w, y, font: fontReg, size: BODY_SIZE, color: TINTA });
      };
      if (f.via) par("Via", f.via, xVia);
      if (f.forma) par("Forma", f.forma, xForma);
      y -= 13;
    }

    // Ativos — fonte monospace-like (motor: fontFamily monospace, fontSize 8)
    if (f.ativos?.trim()) {
      for (const raw of f.ativos.split("\n")) {
        const ln = raw.trim();
        if (!ln) continue;
        drawWrappedPaged(`  ${ln}`, {
          x: M + 14, maxWidth: CW - 14, font: fontReg, size: BODY_SIZE, color: TINTA, lineHeight: BODY_LINE_HEIGHT,
        });
      }
    }

    // Posologia: rótulo clássico + cada tomada em sua própria linha.
    if (tomadas.length) {
      ensureSpace(27);
      y -= 2;
      page.drawText("Posologia:", { x: M + 14, y, font: fontRotulo, size: 10.5, color: TINTA });
      y -= 13;
      for (const t of tomadas) {
        drawWrappedPaged(`  ${t}`, {
          x: M + 14, maxWidth: CW - 14, font: fontReg, size: BODY_SIZE, color: TINTA, lineHeight: BODY_LINE_HEIGHT,
        });
      }
    }

    // Observação (italic muted) — mantida
    if (f.observacao?.trim()) {
      if (grandFinale) {
        drawWrappedPaged(`  Obs.: ${safeTxt(f.observacao)}`, { x: M + 14, maxWidth: CW - 14,
          font: fontItal, size: 7.5, color: rgb(0, 0, 0), lineHeight: 11 });
      } else {
        ensureSpace(11);
        page.drawText(`  Obs.: ${safeTxt(f.observacao).slice(0, 90)}`,
          { x: M + 14, y, font: fontItal, size: 7.5, color: rgb(0, 0, 0) });
        y -= 11;
      }
    }

    // Separador pontilhado entre fórmulas
    if (i < data.formulas.length - 1) {
      ensureSpace(18);
      y -= 6;
      page.drawLine({ start: { x: M + 18, y }, end: { x: PAGE_W - M, y },
        thickness: 0.3, color: TINTA });
      y -= 12;
    } else {
      y -= 6;
    }
  }

  const details = [
    data.duracaoDias ? { label: "Duração", value: `${data.duracaoDias} dias` } : null,
    data.cid ? { label: "CID", value: data.cid } : null,
    data.farmaciaNome ? {
      label: data.farmaciaTipo ? `Farmácia (${data.farmaciaTipo})` : "Farmácia",
      value: data.farmaciaNome,
    } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  // A faixa final é ancorada acima do rodapé, independentemente da quantidade
  // de texto. O conteúdo deve terminar antes da linha que a separa do corpo.
  const assinaturaBase = especialCompacto ? GRAND_FINALE.assinaturaEspecialBase
    : grandFinale ? GRAND_FINALE.assinaturaBase : BODY_BOTTOM + 6;
  const assinaturaTopo = assinaturaBase + ASSINATURA_3A1C_ALTURA;
  const separadorAssinatura = assinaturaTopo + 14;
  const limiteCorpoFinal = grandFinale ? BODY_BOTTOM : separadorAssinatura + 10;
  if (details.length) {
    if (grandFinale) {
      for (const detail of details) {
        drawWrappedPaged(`${detail.label}: ${detail.value}`, {
          x: M, maxWidth: CW, font: fontReg, size: BODY_SIZE, color: TINTA, lineHeight: BODY_LINE_HEIGHT,
        });
      }
    } else {
      if (y - 30 < limiteCorpoFinal) newPage();
      y -= 3;
      y = drawInlineRow(M, y, details, CW);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. CAMPOS DO CORPO — Box 3 (Comprador) + Box 4 (Fornecedor/Farmácia)
  //    Apenas receituário especial. Arabescos ATRÁS. (motor: BandaComBoxes)
  // ══════════════════════════════════════════════════════════════════════════
  if (tipo === "especial") {
    const BOX2_H = grandFinale ? GRAND_FINALE.quadrosEspecialAltura
      : Math.max(120, configNumber(designer, "boxMinHeight", 150, 100, 500) * 0.75);
    let BOX2_TOP = y;
    if (grandFinale) {
      BOX2_TOP = GRAND_FINALE.quadrosEspecialBase + BOX2_H;
      if (BOX2_TOP + 8 > GRAND_FINALE.corpoTopo) {
        throw new Error("Os quadros da receita especial não cabem na página.");
      }
      if (y < BODY_BOTTOM) newPage();
    } else if (y - BOX2_H - 8 < limiteCorpoFinal) {
      newPage();
      BOX2_TOP = y;
    }

    if (grandFinale) {
      const fonteQuadro = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      desenharQuadrosEspeciaisGrandFinale(page, grandFinale, fonteQuadro, BOX2_TOP, BOX2_H, [
        configText(designer, "boxCompradorTitulo", data.boxCompradorTitulo ?? "Identificação do comprador"),
        configText(designer, "boxFarmaciaTitulo", data.boxFarmaciaTitulo ?? "Identificação da farmácia"),
      ]);
    } else {
      drawArabBand(BOX2_TOP, BOX2_H);
      drawBoxPair(BOX2_TOP, BOX2_H, TITLE_H, BX1, BX2, BOX1_W, BOX2_W,
        configText(designer, "boxCompradorTitulo", data.boxCompradorTitulo ?? "IDENTIFICAÇÃO DO COMPRADOR"),
        configText(designer, "boxFarmaciaTitulo", data.boxFarmaciaTitulo ?? "IDENTIFICAÇÃO DO FORNECEDOR / FARMÁCIA"),
      );
    }

    // Box 3 — Comprador (motor: compradorRows — 5 linhas)
    // Labels do screenshot: "Nome", "Endereço", "Cidade" | "UF", "Ident." | "Org. Emissor", "Telefone"
    {
      const iW = BOX1_W - BP_L - 6;
      let fy = BOX2_TOP - TITLE_H - BP_T;

      fy = drawField(BX1 + BP_L, fy, "Nome",     undefined, iW, { escala: escalaQuadros });
      fy = drawField(BX1 + BP_L, fy, "Endereço", undefined, iW, { escala: escalaQuadros });
      // Cidade | UF — coluna UF estreita (motor: repeat(2,1fr))
      fy = drawInlineRow(BX1 + BP_L, fy,
        [{ label: "Cidade" }, { label: "UF" }], iW, escalaQuadros);
      // Ident. | Org. Emissor — abreviados para caber (screenshot: "Ident." + "Org. Emissor")
      fy = drawInlineRow(BX1 + BP_L, fy,
        [{ label: "Ident." }, { label: "Org. Emissor" }], iW, escalaQuadros);
      drawField(BX1 + BP_L, fy, "Telefone", undefined, iW, { escala: escalaQuadros });
    }

    // Box 4 — Fornecedor/Farmácia (motor: fornecedorRows — 2 campos ANCORADOS NO FUNDO)
    // CEO: "no box 4 a posição dos campos está no FUNDO" — âncora bottom-up
    {
      const iW = BOX2_W - BP_L - 6;
      const boxBottom = BOX2_TOP - BOX2_H;
      // 2 campos × ~19pt + 9pt padding no fundo → começa em boxBottom + 47
      // drawField: label 6pt (-9pt) + value/linha (-10pt) + gap (-2pt) = -21pt por campo
      const FIELD_H = 21 * escalaQuadros;
      const BOT_PAD = 9;  // ~3mm fundo
      const fyStart = boxBottom + BOT_PAD + 2 * FIELD_H; // ≈ boxBottom + 51

      let fy = fyStart;
      fy = drawField(BX2 + BP_L, fy, "Assinatura do Farmacêutico", undefined, iW, { escala: escalaQuadros });
      drawField(BX2 + BP_L, fy, "Data", undefined, iW, { escala: escalaQuadros });
    }

    if (!grandFinale) y = BOX2_TOP - BOX2_H - 8;
  }

  // 6. ASSINATURA + CERTIFICADO: posição fixa na parte inferior.
  if (y < limiteCorpoFinal) newPage();
  if (!grandFinale) drawDecorLine(separadorAssinatura, true, 0.5, "ornamentada", GOLD);
  for (const paginaAssinatura of grandFinale ? pdfDoc.getPages() : [page]) {
    await desenharAssinatura3a1c(pdfDoc, paginaAssinatura, assinaturaBase, {
      certificado: certMeta,
      profissional: data.medicoName,
      crm: data.medicoCrm,
      assinaturaImagem: data.assinaturaImagem,
      vencimento: data.certificadoValidoAte,
      dataEmissao: dataStr,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. RODAPÉ — fundo BRANCO, borda fina no topo (motor: posição absoluta)
  //    LEFT: identidade real da clínica  |  RIGHT: marca configurada no modelo
  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // 7. RODAPÉ da última página + numeração "Página i de n" quando há mais de uma
  // ══════════════════════════════════════════════════════════════════════════
  drawFooter();
  if (grandFinale) {
    const pages = pdfDoc.getPages();
    pages.forEach((pg, index) => {
      carimbarRodapeGrandFinale(pg, grandFinale, { titulo: titleBold, texto: fontReg }, index + 1, pages.length);
      if (data.modeloGrandFinaleClinico && certQrImg && data.consultaUrl) {
        pg.drawImage(certQrImg, { x: 520, y: 67, width: 24, height: 24 });
        pg.drawText("Acesso com login", { x: 444, y: 70, font: fontReg, size: 6, color: rgb(0.97, 0.95, 0.89) });
      }
    });
  } else if (visualProva && fonteProva) {
    if (data.identidade2bClinica) carimbarRodapesClinicos(pdfDoc, visualProva, fonteProva, certQrImg);
    else carimbarRodapesProva(pdfDoc, visualProva, fonteProva);
  }
  const allPages = pdfDoc.getPages();
  if (!visualProva && allPages.length > 1) {
    // Cada página carrega sua própria identificação: nº da receita, paciente,
    // "Página X de Y" e o QR que abre a receita completa.
    const CENTER_X = 300;
    const TXT_X = CENTER_X + 28;
    const TXT_MAX = PAGE_W - M - 100 - TXT_X;
    const fitTxt = (t: string, font: PDFFont, size: number): string => {
      let out = safeTxt(t);
      while (out.length > 1 && (font as any).widthOfTextAtSize(out, size) > TXT_MAX) out = out.slice(0, -1);
      return out;
    };
    allPages.forEach((pg, idx) => {
      if (certQrImg) {
        pg.drawImage(certQrImg, { x: CENTER_X, y: FOOTER_TOP - 27, width: 24, height: 24 });
      }
      const linhas: [string, PDFFont, number, ReturnType<typeof rgb>][] = [
        [data.numeroReceita ? `Receita Nº ${data.numeroReceita}` : "Receituário", fontBold, 5.5, DARK],
        [`Paciente: ${data.pacienteNome ?? ""}`, fontReg, 5, MUTED],
        [`Página ${idx + 1} de ${allPages.length}${certQrImg && data.consultaUrl ? " — QR abre a receita completa" : ""}`, fontReg, 5, MUTED],
      ];
      let ty = FOOTER_TOP - 9;
      for (const [t, f, sz, c] of linhas) {
        pg.drawText(fitTxt(t, f, sz), { x: TXT_X, y: ty, font: f, size: sz, color: c });
        ty -= 8;
      }
    });
  }

  if (data.homologacao) await marcarDemonstracao(pdfDoc);
  return signer ? signPrescriptionPdf(pdfDoc, signer) : pdfDoc.save();
}
