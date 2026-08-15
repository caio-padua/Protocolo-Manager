/**
 * pdf-carta-tratamento.ts
 * Carta de Tratamento Premium PAXMED — Onda 0 (Fidelidade)
 *
 * Arquitetura: Dr. Manus, Manual Executável Item #88 (12/08/2026)
 * Executor:    Dr. Replit Paxter
 *
 * REGRA DE OURO: este arquivo NÃO modifica generateProtocolDocumentPdf.
 * Convive como segundo gerador, acessível via GET /protocols/:id/carta-pdf.
 *
 * Sistema de coordenadas:
 *   pdf-lib: Y cresce de BAIXO para CIMA (Y=0 = rodapé).
 *   topToY(mm): converte mm a partir do TOPO da página para Y em pontos pdf-lib.
 *
 * Tipografia:
 *   Títulos/nomes  → EB Garamond (ebReg / ebSemi / ebBold / ebSemiItal)
 *   Dados/rótulos  → Manrope (mrReg / mrBold)
 *   Fontes woff lidas de assets/fonts/ em runtime.
 */

import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument, PDFPage, PDFFont,
  rgb, degrees,
  type Color, type PDFImage,
} from "pdf-lib";
import { embedPadesSignature, getCertInfo, drawPadconMark, PADCON_INNER_SCALE } from "./pdf-signer";

// ─── A4 EM PONTOS ─────────────────────────────────────────────────────────────
const PT      = 72 / 25.4;       // pontos por milímetro
const PAGE_W  = 595.28;           // 210 mm
const PAGE_H  = 841.89;           // 297 mm
const MG      = 14 * PT;          // CONTENT_X  = 39.69 pt (margem esquerda)
const MG_R    = 196 * PT;         // CONTENT_RIGHT = 555.59 pt (margem direita)
const CW      = 182 * PT;         // CONTENT_W = 515.91 pt

function topToY(mm: number): number { return PAGE_H - mm * PT; }

// ─── CORES (Dr. Manus Seção 3.1) ──────────────────────────────────────────────
const NAVY       = rgb(0.0863, 0.1569, 0.2902); // #16284A
const NAVY_DEEP  = rgb(0.0353, 0.0824, 0.1569); // #091528
const GOLD       = rgb(0.6039, 0.4824, 0.1961); // #9A7B32
const PAPER      = rgb(1,      0.9961, 0.9804); // #FFFEFA
const MARBLE     = rgb(0.9804, 0.9725, 0.9529); // #FAF8F3
const LINE_CLR   = rgb(0.8431, 0.8196, 0.7647); // #D7D1C3
const WARM_CLR   = rgb(0.4392, 0.4078, 0.3569); // #70685B
const SAFETY_CLR = rgb(0.5686, 0.3020, 0.2706); // #914D45
const WHITE      = rgb(1, 1, 1);

// ─── ESCALA TIPOGRÁFICA (pt) — Dr. Manus Seção 4 ─────────────────────────────
const T = {
  coverBrand:  53,   // PAXMED na capa
  coverTitle:  31,   // Título capa / páginas internas / substância
  opData:      12,   // Dado operacional (dose, via, sessões)
  numDest:     20,   // Número de destaque (selos)
  numSmall:    17,   // Número menor de destaque
  body:        6.8,  // Corpo clínico Manrope (7pt alvo, ajustado para woff latin)
  label:       5,    // Rótulo / eixo Manrope Bold caixa-alta
  footer:      5.2,  // Rodapé
  caption:     5.8,  // Eyebrow / kicker
  headerBrand: 9,    // Marca no cabeçalho das internas
  sectionHdr:  9,    // Título de seção interna
};

// ─── SISTEMAS DO CORPO (ordem canônica, seção 6) ──────────────────────────────
const BODY_SYSTEMS = [
  { key: "longevidade",    label: "Longevidade" },
  { key: "cardiovascular", label: "Cardiovascular" },
  { key: "muscular",       label: "Muscular" },
  { key: "metabolismo",    label: "Metabolismo" },
  { key: "neurologico",    label: "Neurologico" },
  { key: "ossos",          label: "Ossos & art." },
] as const;

type BsKey = (typeof BODY_SYSTEMS)[number]["key"];

// ─── INTERFACES ───────────────────────────────────────────────────────────────
export interface CartaFonts {
  ebReg:      PDFFont;
  ebSemi:     PDFFont;
  ebBold:     PDFFont;
  ebSemiItal: PDFFont;
  mrReg:      PDFFont;
  mrBold:     PDFFont;
}

export interface CartaAssets {
  symbolGlass?: PDFImage;
  wordmarkImg?: PDFImage;
  clinicImg?:   PDFImage;
  padconSymbol?: PDFImage;
  padconWords?:  PDFImage;
}

export interface LetterSubstance {
  idx:               number;
  name:              string;
  dose:              string;
  via:               string;
  totalSessions:     number;
  completedSessions: number;
  intervalDays:      number;
  startDate:         string;
  timeToEffect?:     string;
  starRating?:       number;
  bodySystemEffects: Partial<Record<BsKey, number>>;
  description?:      string;
  mainFunction?:     string;
  perceivedEffects?: string;
  contraindications?: string;
  scientificEvidence?: string;
  benefits: { label: string; value: string }[];
  compositionRaw?: string;
  color:             string;
}

export interface CartaTratamentoData {
  protocolId:        number;
  protocolTitle:     string;
  clientName:        string;
  clientCpf:         string;
  professionalName:  string;
  professionalCrm?:  string | null;
  unit:              string;
  startDate:         string;
  totalSessions:     number;
  completedSessions: number;
  substances:        LetterSubstance[];
}

// ─── HELPERS DE BAIXO NÍVEL ───────────────────────────────────────────────────

/**
 * Traduz a tipografia fina (travessao, aspas curvas, marcador, reticencias) para
 * o equivalente Latin-1 e SO ENTAO descarta o que sobrar fora da faixa.
 *
 * Antes esta funcao trocava por "?" tudo acima de U+00FF. O travessao longo do
 * titulo ("LONGEVIDADE — CARLUCIA") e o marcador de lista ("•") caem nessa faixa,
 * entao o documento do paciente imprimia interrogacao no lugar. Descartar em
 * silencio tambem seria errado: o texto perderia o separador. Por isso traduz-se
 * primeiro. A faixa Latin-1 continua sendo o limite final porque um glifo ausente
 * faz o pdf-lib lancar excecao e o bloco inteiro de texto sumiria sem aviso.
 */
/**
 * Caracteres acima de Latin-1 que ficam INTACTOS porque as duas fontes do
 * documento (EB Garamond e Manrope) desenham os dois: travessao e meia-risca.
 * Isso esta provado no proprio PDF — o mapa de enfases imprime "A — COENZIMA".
 * Rebaixar para hifen deixaria a capa com um traco curto e o miolo com um
 * traco longo, no mesmo documento.
 */
const PRESERVAR_ACIMA_DE_LATIN1 = new Set(["\u2013", "\u2014"]);

const TRANSLITERACAO: Record<string, string> = {
  "\u2010": "-", "\u2011": "-", "\u2012": "-",
  "\u2015": "-", "\u2212": "-", "\u00AD": "",
  "\u2018": "'", "\u2019": "'", "\u201A": "'", "\u201B": "'", "\u2032": "'",
  "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u201F": '"', "\u2033": '"',
  "\u2022": "\u00B7", "\u2023": "\u00B7", "\u2043": "\u00B7",
  "\u25AA": "\u00B7", "\u25CF": "\u00B7", "\u25E6": "\u00B7",
  "\u2026": "...", "\u2044": "/", "\u2039": "<", "\u203A": ">",
  "\u2192": "->", "\u2190": "<-", "\u2264": "<=", "\u2265": ">=",
  "\u2260": "!=", "\u2248": "~", "\u00A0": " ", "\u202F": " ",
  "\u2002": " ", "\u2003": " ", "\u2009": " ", "\u200A": " ", "\u200B": "",
  "\u2713": "OK", "\u2714": "OK", "\u2717": "x", "\u2718": "x",
  "\u2122": "(TM)", "\u2117": "(P)", "\u03BC": "\u00B5", "\u2103": "\u00B0C",
  // Letras gregas que aparecem em nome de substancia (alfa-lipoico, beta-alanina,
  // omega-3). Escritas por extenso porque a Manrope, usada no corpo do texto,
  // nao desenha grego — e nome de medicamento nao pode sair truncado.
  "\u03B1": "alfa", "\u0391": "ALFA", "\u03B2": "beta", "\u0392": "BETA",
  "\u03B3": "gama", "\u0393": "GAMA", "\u03B4": "delta", "\u0394": "DELTA",
  "\u03C9": "omega", "\u03A9": "OMEGA", "\u03BB": "lambda", "\u03C3": "sigma",
};

function st(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/[\u00A0-\uFFFF]/g, ch => {
      if (ch in TRANSLITERACAO)              return TRANSLITERACAO[ch];
      if (PRESERVAR_ACIMA_DE_LATIN1.has(ch)) return ch;
      // O que nao esta mapeado SOBREVIVE. Apagar em silencio seria pior que o
      // "?" antigo: sumiria com parte de um nome clinico sem ninguem perceber.
      // Aqui isso e seguro porque TODAS as fontes do documento sao embutidas
      // (embedFont), e fonte embutida nao lanca excecao por glifo ausente —
      // ao contrario das fontes padrao do PDF, que nao sao usadas neste gerador.
      return ch;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Quebra texto em linhas respeitando maxWidth (pontos). */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    const fitsOk = (() => { try { return font.widthOfTextAtSize(test, size) <= maxWidth; } catch { return true; } })();
    if (fitsOk) { cur = test; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Desenha texto multi-linha; retorna Y pdf-lib após última linha. */
function drawWrapped(page: PDFPage, text: string, opts: {
  x: number; y: number; width: number;
  font: PDFFont; size: number; color: Color;
  lineHeight?: number; maxLines?: number;
}): number {
  const lh    = opts.lineHeight ?? opts.size * 1.42;
  const lines = wrapText(st(text), opts.font, opts.size, opts.width);
  const shown = opts.maxLines ? lines.slice(0, opts.maxLines) : lines;
  let y = opts.y;
  for (const line of shown) {
    try { page.drawText(st(line), { x: opts.x, y, font: opts.font, size: opts.size, color: opts.color }); } catch { /**/ }
    y -= lh;
  }
  return y;
}

/** Carrega arquivo de asset (multi-path). Retorna null se ausente. */
function readAsset(name: string): Buffer | null {
  for (const base of [
    path.join(__dirname, "assets"),
    path.join(__dirname, "../assets"),
    path.join(__dirname, "../../assets"),
    path.join(__dirname, "../../../assets"),
  ]) {
    try { return fs.readFileSync(path.join(base, name)); } catch { /**/ }
  }
  console.warn(`[carta-pdf] asset ausente: ${name}`);
  return null;
}

/** Carrega fonte woff da pasta assets/fonts (multi-path). Lança erro se ausente. */
function readFont(name: string): Buffer {
  for (const base of [
    path.join(__dirname, "assets", "fonts"),
    path.join(__dirname, "../assets", "fonts"),
    path.join(__dirname, "../../assets", "fonts"),
    path.join(__dirname, "../../../assets", "fonts"),
  ]) {
    try { return fs.readFileSync(path.join(base, name)); } catch { /**/ }
  }
  throw new Error(`[carta-pdf] Fonte não encontrada: ${name}. Verifique assets/fonts/.`);
}

/** Desenha arco por segmentos em coordenadas PDF (Y-up). Horário = ângulo decrescente. */
function drawArc(page: PDFPage, cx: number, cy: number, r: number, aStart: number, aEnd: number, color: Color, thick: number) {
  const span  = Math.abs(aEnd - aStart);
  const n     = Math.max(8, Math.ceil(span * r / 1.8));
  const step  = (aEnd - aStart) / n;
  for (let i = 0; i < n; i++) {
    const a1 = aStart + i * step, a2 = aStart + (i + 1) * step;
    page.drawLine({
      start: { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) },
      end:   { x: cx + r * Math.cos(a2), y: cy + r * Math.sin(a2) },
      thickness: thick, color,
    });
  }
}

/** Desenha anel de progresso radial (centro em cx, cy PDF-coords, raio r em pt).
 *  progress: 0–1.  12 horas, horário. */
function drawProgressRing(page: PDFPage, cx: number, cy: number, r: number, progress: number) {
  // Trilho
  drawArc(page, cx, cy, r, 0, 2 * Math.PI, LINE_CLR, 2.8);
  // Progresso (dourado, horário = ângulo decresce a partir de 90°)
  const p = Math.min(1, Math.max(0, progress));
  if (p > 0.01) {
    const aS = Math.PI / 2;               // 12 horas = 90°
    const aE = aS - 2 * Math.PI * p;      // horário = decresce
    drawArc(page, cx, cy, r, aS, aE, GOLD, 3.2);
  }
}

/** Cabeçalho de marca (PAXMED) no canto superior direito — páginas internas. */
function drawInternalHeader(page: PDFPage, f: CartaFonts) {
  const mark = "PAXMED";
  const sub  = "Clinical Intelligence System";
  const mW   = f.ebSemi.widthOfTextAtSize(mark, T.headerBrand);
  const sW   = (() => { try { return f.mrReg.widthOfTextAtSize(sub, T.caption); } catch { return 120; } })();
  try { page.drawText(mark, { x: MG_R - mW, y: topToY(13), font: f.ebSemi, size: T.headerBrand, color: NAVY }); } catch { /**/ }
  try { page.drawText(sub,  { x: MG_R - sW, y: topToY(17), font: f.mrReg,  size: T.caption,     color: GOLD }); } catch { /**/ }
}

/** Rodapé das páginas internas. */
function drawInternalFooter(page: PDFPage, f: CartaFonts, pageNum: number, total: number, clientName: string, assets?: CartaAssets) {
  const h = 14;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: h, color: MARBLE });
  page.drawLine({ start: { x: 0, y: h }, end: { x: PAGE_W, y: h }, thickness: 0.5, color: LINE_CLR });
  const txt = `Documento clinico individual · tecnologia PADCON | ${st(clientName)} | Pag. ${pageNum} de ${total}`;
  try { page.drawText(txt, { x: MG, y: 4, font: f.mrReg, size: T.footer, color: WARM_CLR }); } catch { /**/ }
  // Mesmo bloco PADCON do documento de protocolo, a 50% do tamanho da capa,
  // encostado no canto inferior direito (arte oficial, sem placa atrás).
  drawPadconMark(page, assets?.padconSymbol ?? null, assets?.padconWords ?? null, MG_R, 4, PADCON_INNER_SCALE);
}

// ─── CAPA (Seção 5) ──────────────────────────────────────────────────────────

function drawCoverPage(page: PDFPage, dto: CartaTratamentoData, f: CartaFonts, assets: CartaAssets) {
  // Fundo NAVY_DEEP
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: NAVY_DEEP });

  // Luz radial sutil — três elipses concêntricas decrescentes (simula gradiente)
  const lcx = 0.57 * PAGE_W, lcy = (1 - 0.35) * PAGE_H;
  for (const [xS, yS, op] of [[310, 220, 0.06], [200, 140, 0.05], [100, 70, 0.04]] as const) {
    page.drawEllipse({ x: lcx, y: lcy, xScale: xS, yScale: yS, color: NAVY, opacity: op });
  }

  // ── ZONA A: Cabeçalho (13–31 mm) ──────────────────────────────────────────
  const hdrY = topToY(13);
  // Clínica emissora (esquerda)
  if (assets.clinicImg) {
    const ci = assets.clinicImg;
    const scale = Math.min(28 / (ci.height * 0.352778), 70 / (ci.width * 0.352778)); // max 28pt tall, 70pt wide
    try {
      page.drawImage(assets.clinicImg, {
        x: MG, y: hdrY - ci.height * scale,
        width: ci.width * scale, height: ci.height * scale, opacity: 0.85,
      });
    } catch { /**/ }
  } else {
    // Fallback texto
    try { page.drawText(st(dto.unit), { x: MG, y: hdrY - 8, font: f.mrReg, size: T.body, color: WHITE, opacity: 0.8 }); } catch { /**/ }
  }
  // Rótulo direito
  try {
    const lbl = "CARTA DE TRATAMENTO · 01";
    const lW  = f.mrBold.widthOfTextAtSize(lbl, T.label);
    page.drawText(lbl, { x: MG_R - lW, y: hdrY - 6, font: f.mrBold, size: T.label, color: GOLD, opacity: 0.9 });
  } catch { /**/ }

  // ── ZONA B: Símbolo (38–74 mm, 36 mm de altura, 48 mm de largura) ─────────
  const symFrameW = 48 * PT, symFrameH = 36 * PT;
  const symX = (PAGE_W - symFrameW) / 2;
  const symY = topToY(38);
  if (assets.symbolGlass) {
    const si = assets.symbolGlass;
    const scS = Math.min(symFrameH / si.height, symFrameW / si.width);
    const imgW = si.width * scS, imgH = si.height * scS;
    try {
      page.drawImage(assets.symbolGlass, {
        x: symX + (symFrameW - imgW) / 2,
        y: symY - symFrameH + (symFrameH - imgH) / 2,
        width: imgW, height: imgH,
      });
    } catch { /**/ }
  }
  // Borda sutil ouro ao redor do frame do símbolo
  page.drawRectangle({ x: symX, y: symY - symFrameH, width: symFrameW, height: symFrameH, borderColor: GOLD, borderWidth: 0.5, opacity: 0 });

  // ── ZONA C: Assinatura do sistema (76–102 mm) ──────────────────────────────
  const kickerY = topToY(78);
  const kicker  = "SISTEMA CLINICO INTELIGENTE";
  const kW      = (() => { try { return f.mrBold.widthOfTextAtSize(kicker, T.label); } catch { return 100; } })();
  try { page.drawText(kicker, { x: (PAGE_W - kW) / 2, y: kickerY, font: f.mrBold, size: T.label, color: GOLD, opacity: 0.9 }); } catch { /**/ }

  // PAXMED — arte oficial da marca, nunca letras digitadas. A palavra e desenho:
  // remonta-la com fonte inventa um wordmark que nao existe.
  //
  // A colisao da capa nascia exatamente aqui. A palavra tinha linha de base em
  // 84 mm com corpo de 53 pt, entao subia ate cerca de 65 mm e entrava por cima
  // do simbolo (38 a 74 mm) e do kicker (78 mm). Agora a arte ocupa uma faixa
  // fechada, de 84 a 97 mm, e nada mais escreve nesse intervalo.
  const wmTopMm = 84, wmBotMm = 97;
  const wmMaxH  = (wmBotMm - wmTopMm) * PT;
  const wmMaxW  = CW * 0.62;
  if (assets.wordmarkImg) {
    const wi = assets.wordmarkImg;
    const sc = Math.min(wmMaxH / wi.height, wmMaxW / wi.width);
    const wmW = wi.width * sc, wmH = wi.height * sc;
    try {
      page.drawImage(wi, { x: (PAGE_W - wmW) / 2, y: topToY(wmTopMm) - wmH, width: wmW, height: wmH });
    } catch { /**/ }
  } else {
    // Sem a arte no disco, o texto de emergencia tem de caber DENTRO da mesma
    // faixa de 84 a 97 mm. Com os 53 pt de antes ele voltaria a subir ate o
    // kicker e a colisao renasceria justamente no caminho de falha.
    const brandTxt = "PAXMED";
    const brandSz  = Math.min(T.coverBrand, wmMaxH * 0.78);
    const brandW   = (() => { try { return f.ebSemi.widthOfTextAtSize(brandTxt, brandSz); } catch { return 280; } })();
    try { page.drawText(brandTxt, { x: (PAGE_W - brandW) / 2, y: topToY(wmBotMm - 1), font: f.ebSemi, size: brandSz, color: WHITE }); } catch { /**/ }
  }

  // Subtítulo
  const subTxt = "Clinical Intelligence System";
  const subSz  = T.sectionHdr;
  const subW   = (() => { try { return f.ebSemiItal.widthOfTextAtSize(subTxt, subSz); } catch { return 120; } })();
  const subY   = topToY(105);
  try { page.drawText(subTxt, { x: (PAGE_W - subW) / 2, y: subY, font: f.ebSemiItal, size: subSz, color: LINE_CLR }); } catch { /**/ }

  // ── ZONA D: Carta ao paciente (112–130 mm) ─────────────────────────────────
  const cartaY = topToY(115);
  const cartaW = CW * 0.6;
  const cartaX = (PAGE_W - cartaW) / 2;
  try {
    page.drawText("Carta do seu protocolo de cuidado.", {
      x: cartaX, y: cartaY, font: f.ebSemiItal, size: T.sectionHdr, color: LINE_CLR,
    });
  } catch { /**/ }
  drawWrapped(page, "Este documento resume o protocolo prescrito pelo seu medico e serve de guia para acompanhar cada etapa do tratamento.", {
    x: cartaX, y: cartaY - 14, width: cartaW, font: f.mrReg, size: T.body, color: WARM_CLR, maxLines: 3,
  });

  // Linha divisória
  const divY = topToY(137);
  page.drawLine({ start: { x: MG, y: divY }, end: { x: MG_R, y: divY }, thickness: 0.4, color: rgb(0.3, 0.35, 0.45) });

  // ── ZONA E: Identificação 3 colunas (139–157 mm) ──────────────────────────
  const idTop = topToY(141);
  const colW  = CW / 3;
  const idData: [string, string][] = [
    ["PACIENTE",    st(dto.clientName)    || "Nao informado"],
    ["PROTOCOLO",   st(dto.protocolTitle) || `#${dto.protocolId}`],
    ["RESPONSAVEL", `${st(dto.professionalName)}${dto.professionalCrm ? ` · ${dto.professionalCrm}` : ""}`],
  ];
  idData.forEach(([label, value], i) => {
    const x = MG + i * colW;
    // Separador vertical
    if (i > 0) page.drawLine({ start: { x, y: idTop + 2 }, end: { x, y: idTop - 14 * PT }, thickness: 0.4, color: rgb(0.3, 0.35, 0.45) });
    try { page.drawText(label, { x: x + (i > 0 ? 8 : 0), y: idTop, font: f.mrBold, size: T.label, color: GOLD }); } catch { /**/ }
    drawWrapped(page, value, {
      x: x + (i > 0 ? 8 : 0), y: idTop - 8, width: colW - 10,
      font: f.ebSemi, size: T.body, color: WHITE, maxLines: 2,
    });
  });

  // ── ZONA F: Status 3 colunas (161–183 mm) — Seção 5.1 ─────────────────────
  const statTop = topToY(165);
  const statColW = [0.88, 0.62, 1.50].map(w => w * (CW / 3));
  // Fundo suave para zona de status
  page.drawRectangle({ x: MG, y: statTop - 20 * PT, width: CW, height: 20 * PT, color: rgb(0.08, 0.14, 0.24), opacity: 0.6 });

  // Coluna 1: Anel radial de sessões
  const ringX  = MG + statColW[0] / 2;
  // O anel tinha raio de 9 mm e centro a 10 mm do topo da faixa, entao a borda
  // de baixo chegava a 19 mm — e a legenda e escrita a 18 mm. O circulo passava
  // por dentro da frase "de N sessoes previstas". Encolhido e subido, o anel
  // agora termina a 15 mm e a legenda fica limpa, abaixo dele.
  const ringY  = statTop - 9 * PT;
  const ringR  = 6 * PT;
  const total  = Math.max(dto.totalSessions, 1);
  const done   = dto.completedSessions;
  const prog   = done / total;
  const isZero = dto.totalSessions === 0;
  drawProgressRing(page, ringX, ringY, ringR, isZero ? 0 : prog);
  // Número central
  const ringLabel = isZero ? "—" : `${done}`;
  const rlW = (() => { try { return f.ebSemi.widthOfTextAtSize(ringLabel, T.numSmall); } catch { return 20; } })();
  try { page.drawText(ringLabel, { x: ringX - rlW / 2, y: ringY - T.numSmall / 3, font: f.ebSemi, size: T.numSmall, color: WHITE }); } catch { /**/ }
  // Legenda abaixo
  const sessLegend = isZero ? "cronograma a definir" : `de ${total} sessoes previstas`;
  const slW = (() => { try { return f.mrReg.widthOfTextAtSize(sessLegend, T.label); } catch { return 60; } })();
  try { page.drawText(sessLegend, { x: ringX - slW / 2, y: statTop - 18 * PT, font: f.mrReg, size: T.label, color: LINE_CLR }); } catch { /**/ }

  // Coluna 2: Contagem de dossiês
  const col2X = MG + statColW[0] + 8;
  const dossNum = String(dto.substances.length).padStart(2, "0");
  const dossW   = (() => { try { return f.ebSemi.widthOfTextAtSize(dossNum, T.numDest); } catch { return 24; } })();
  try { page.drawText(dossNum, { x: col2X, y: ringY - 2, font: f.ebSemi, size: T.numDest, color: WHITE }); } catch { /**/ }
  try { page.drawText("dossies neste protocolo", { x: col2X, y: statTop - 18 * PT, font: f.mrReg, size: T.label, color: LINE_CLR }); } catch { /**/ }

  // Coluna 3: Orientação de leitura
  const col3X = MG + statColW[0] + statColW[1] + 16;
  const guide = ["Este documento tem uma folha", "por substancia. Leia na ordem.", "Guarde para a proxima consulta."];
  guide.forEach((ln, i) => {
    try { page.drawText(ln, { x: col3X, y: statTop - 4 - i * (T.label + 2), font: f.mrReg, size: T.label, color: LINE_CLR }); } catch { /**/ }
  });

  // ── ZONA G: Rodapé da capa ─────────────────────────────────────────────────
  const footY = topToY(292);
  const footTxt = "Documento clinico individual — preparado para uso pessoal e nao transferivel | tecnologia PADCON | Pagina 01";
  try { page.drawText(footTxt, { x: MG, y: footY, font: f.mrReg, size: T.footer, color: WARM_CLR }); } catch { /**/ }
}

// ─── MAPA DE ÊNFASES (Seção 6) ────────────────────────────────────────────────

function drawOverviewMapPage(page: PDFPage, dto: CartaTratamentoData, f: CartaFonts) {
  // Fundo PAPER
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });

  // Cabeçalho interno
  const hdrY = topToY(13);
  page.drawLine({ start: { x: MG, y: hdrY }, end: { x: MG_R, y: hdrY }, thickness: 0.5, color: LINE_CLR });
  try { page.drawText("MAPA DE ENFASES", { x: MG, y: hdrY - 10, font: f.ebSemi, size: T.coverTitle, color: NAVY }); } catch { /**/ }
  drawInternalHeader(page, f);

  // Descobre quais sistemas têm dado em pelo menos uma substância
  const activeSystems = BODY_SYSTEMS.filter(sys =>
    dto.substances.some(s => (s.bodySystemEffects[sys.key] ?? null) !== null)
  );

  // Área de explicação + legenda (duas colunas 1.5:1)
  const explTop  = topToY(40);
  const explW    = CW * 1.5 / 2.5 - 4 * PT;
  const legendW  = CW * 1.0 / 2.5;
  const legendX  = MG + explW + 8 * PT;

  // Explicação (esquerda)
  drawWrapped(page, "Cada substancia recebe uma pontuacao de enfase (0 a 5) nos sistemas do corpo registrados no catalogo clinico. O grafico mostra exclusivamente os dados cadastrados — valores ausentes nao sao inferidos.", {
    x: MG, y: explTop, width: explW, font: f.mrReg, size: T.body, color: WARM_CLR, maxLines: 6,
  });

  // Legenda (direita)
  try { page.drawText("SUBSTANCIAS", { x: legendX, y: explTop, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }
  dto.substances.forEach((sub, i) => {
    const ly = explTop - 10 - i * 11;
    const letter = String.fromCharCode(65 + i); // A, B, C…
    page.drawRectangle({ x: legendX, y: ly - 4, width: 7, height: 7, color: NAVY });
    try { page.drawText(letter, { x: legendX + 1, y: ly - 3, font: f.mrBold, size: 5.5, color: WHITE }); } catch { /**/ }
    const subLabel = `${letter} — ${st(sub.name)}`;
    try { page.drawText(subLabel, { x: legendX + 10, y: ly, font: f.mrReg, size: T.body, color: NAVY }); } catch { /**/ }
  });

  // ── Matriz de barras (90 mm mín., seção 6 item 3–5) ───────────────────────
  if (activeSystems.length === 0) {
    // Sem dados suficientes
    try { page.drawText("Nenhum sistema do corpo cadastrado neste protocolo.", { x: MG, y: topToY(100), font: f.mrReg, size: T.body, color: WARM_CLR }); } catch { /**/ }
    drawInternalFooter(page, f, 2, -1, dto.clientName);
    return;
  }

  const matrixTop  = topToY(100);  // topo da matriz
  const matrixH    = 90 * PT;      // 90 mm mínimo
  const matrixBot  = matrixTop - matrixH;

  const barAreaW   = CW / activeSystems.length;
  const subBarW    = Math.min(18, (barAreaW - 8) / dto.substances.length);

  // Eixo Y: linhas horizontais em 1, 2, 3, 4, 5
  for (let v = 1; v <= 5; v++) {
    const ly = matrixBot + (v / 5) * matrixH;
    page.drawLine({ start: { x: MG, y: ly }, end: { x: MG_R, y: ly }, thickness: 0.3, color: LINE_CLR });
    try { page.drawText(String(v), { x: MG - 10, y: ly - 2, font: f.mrReg, size: T.label, color: WARM_CLR }); } catch { /**/ }
  }
  // Eixo base
  page.drawLine({ start: { x: MG, y: matrixBot }, end: { x: MG_R, y: matrixBot }, thickness: 0.8, color: NAVY });

  // Barras por sistema × substância
  activeSystems.forEach((sys, si) => {
    const clusterX = MG + si * barAreaW;
    // Rótulo do sistema (abaixo do eixo)
    try { page.drawText(sys.label, { x: clusterX, y: matrixBot - 10, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }

    dto.substances.forEach((sub, subIdx) => {
      const rawVal = sub.bodySystemEffects[sys.key];
      if (rawVal == null) {
        // Dado ausente — mostrar "—" no eixo X
        try { page.drawText("—", { x: clusterX + subIdx * (subBarW + 2) + subBarW / 4, y: matrixBot + 2, font: f.mrReg, size: T.label, color: WARM_CLR }); } catch { /**/ }
        return;
      }
      const val = Math.min(5, Math.max(0, rawVal));
      const barH = (val / 5) * matrixH;
      const barX = clusterX + subIdx * (subBarW + 2);
      // Barra NAVY com fill
      page.drawRectangle({ x: barX, y: matrixBot, width: subBarW, height: barH, color: NAVY });
      // Letra da substância no topo da barra
      const letter = String.fromCharCode(65 + subIdx);
      try { page.drawText(letter, { x: barX + subBarW / 4, y: matrixBot + barH + 2, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }
    });
  });

  // ── Faixa de síntese (3 maiores somas) ────────────────────────────────────
  const synthTop = matrixBot - 20 * PT;
  try { page.drawText("SUMARIO — maiores somas cadastradas", { x: MG, y: synthTop, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }

  const sums: { sys: string; total: number }[] = BODY_SYSTEMS.map(sys => ({
    sys: sys.label,
    total: dto.substances.reduce((acc, s) => acc + (s.bodySystemEffects[sys.key] ?? 0), 0),
  })).sort((a, b) => b.total - a.total).slice(0, 3);

  sums.forEach((item, i) => {
    const sx = MG + i * (CW / 3);
    try { page.drawText(`${item.sys}: ${item.total.toFixed(1)}`, { x: sx, y: synthTop - 10, font: f.mrReg, size: T.body, color: WARM_CLR }); } catch { /**/ }
  });

  // ── Nota de transparência ──────────────────────────────────────────────────
  const noteY = topToY(272);
  page.drawRectangle({ x: MG, y: noteY - 14, width: CW, height: 14, color: MARBLE });
  page.drawLine({ start: { x: MG, y: noteY }, end: { x: MG, y: noteY - 14 }, thickness: 1.5, color: GOLD });
  try {
    page.drawText("Os valores refletem o cadastro do catalogo clinico. Nao sao diagnostico nem medicao do estado individual do paciente.", {
      x: MG + 8, y: noteY - 9, font: f.mrReg, size: T.body, color: WARM_CLR,
    });
  } catch { /**/ }

  drawInternalFooter(page, f, 2, -1, dto.clientName);
}

// ─── FICHA DE SUBSTÂNCIA (Seção 7) ────────────────────────────────────────────

/** Desenha radar simples: retorna os pontos do polígono desenhado. */
function drawRadar(page: PDFPage, cx: number, cy: number, r: number, axes: { label: string; value: number }[], f: CartaFonts) {
  const n = axes.length;
  if (n < 3) {
    // Dado insuficiente (seção 8)
    try { page.drawText("MAPA 0-5 · dados insuficientes para radar", { x: cx - 60, y: cy, font: f.mrReg, size: T.label, color: WARM_CLR }); } catch { /**/ }
    return;
  }

  // Anéis do radar (20%, 40%, 60%, 80%)
  for (const frac of [0.2, 0.4, 0.6, 0.8]) {
    drawArc(page, cx, cy, r * frac, 0, 2 * Math.PI, LINE_CLR, 0.4);
  }

  // Eixos (linhas do centro a cada ponta)
  for (let i = 0; i < n; i++) {
    const angle = Math.PI / 2 - (2 * Math.PI * i) / n;
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }, thickness: 0.4, color: LINE_CLR });
    // Rótulo
    const lx = cx + (r + 8) * Math.cos(angle);
    const ly = cy + (r + 8) * Math.sin(angle);
    const lbl = st(axes[i].label);
    try { page.drawText(lbl, { x: lx - 12, y: ly - 2, font: f.mrReg, size: T.label - 0.5, color: WARM_CLR }); } catch { /**/ }
  }

  // Polígono dos valores — fill translúcido + contorno
  // drawSvgPath interpreta coordenadas SVG (y para BAIXO): ancorar em y=pageH
  // e converter cada ponto com svgY = pageH - pageY (ver memory/pdflib-drawsvgpath-y-flip.md)
  const pageH = page.getHeight();
  const svgY  = (py: number): number => pageH - py;
  const FILL_C = rgb(0.0863, 0.1569, 0.2902); // mesmo NAVY, aplicado com opacity baixa

  const points = axes.map((ax, i) => {
    const angle = Math.PI / 2 - (2 * Math.PI * i) / n;
    const v = Math.min(5, Math.max(0, ax.value));
    return { x: cx + (r * v / 5) * Math.cos(angle), y: cy + (r * v / 5) * Math.sin(angle) };
  });

  // Fill via drawSvgPath (fechado)
  try {
    const polySegs = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${svgY(p.y).toFixed(1)}`);
    polySegs.push("Z");
    page.drawSvgPath(polySegs.join(" "), {
      x: 0, y: pageH,
      color: FILL_C, opacity: 0.20,
      borderColor: FILL_C, borderWidth: 0,
    });
  } catch { /* fallback silencioso */ }

  // Contorno sólido por cima do fill
  for (let i = 0; i < n; i++) {
    const p1 = points[i], p2 = points[(i + 1) % n];
    page.drawLine({ start: p1, end: p2, thickness: 1.5, color: NAVY });
  }

  // Pontos dourados em cada vértice
  for (const pt of points) {
    page.drawEllipse({ x: pt.x, y: pt.y, xScale: 3, yScale: 3, color: GOLD });
  }

  // Legenda da escala (à direita do radar)
  const legX = cx + r + 14;
  try { page.drawText("0 — 5", { x: legX, y: cy + r, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }
}

function drawSubstanceDossierPage(
  page: PDFPage,
  sub: LetterSubstance,
  f: CartaFonts,
  assets: CartaAssets,
  totalPages: number,
  pageNum: number,
  clientName: string,
): void {
  // Fundo PAPER
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });

  // ── FAIXA 1: Identidade (0–21 mm) ─────────────────────────────────────────
  const idH = 21 * PT;
  page.drawRectangle({ x: 0, y: topToY(21), width: PAGE_W, height: idH, color: NAVY });
  // Número da ficha
  const numStr = String(sub.idx).padStart(2, "0");
  try { page.drawText(numStr, { x: MG, y: topToY(19), font: f.ebSemi, size: T.numDest, color: GOLD }); } catch { /**/ }
  // Nome da substância (pode quebrar em 2 linhas)
  const nameLines = wrapText(st(sub.name), f.ebSemi, T.coverTitle, CW - 80);
  const nLH = T.coverTitle * 0.9;
  nameLines.slice(0, 2).forEach((ln, i) => {
    try { page.drawText(ln, { x: MG + 40, y: topToY(11) - i * nLH, font: f.ebSemi, size: T.coverTitle, color: WHITE }); } catch { /**/ }
  });
  // Tipo de procedimento (direita)
  try {
    const procW = f.mrBold.widthOfTextAtSize(sub.via, T.label);
    page.drawText(sub.via, { x: MG_R - procW, y: topToY(19), font: f.mrBold, size: T.label, color: GOLD });
  } catch { /**/ }
  // PAXMED marca (canto superior direito)
  drawInternalHeader(page, f);

  // ── FAIXA 2: Operacional (21–49 mm) — Grade 3 × 2 ──────────────────────────
  const opTop    = topToY(23);
  const opH      = 26 * PT;
  const cellW    = CW / 3;
  const cellH    = opH / 2;
  const opCells: [string, string][] = [
    ["DOSE PRESCRITA",   st(sub.dose)         || "A definir"],
    ["VIA",              sub.via              || "A definir"],
    ["SESSOES",          sub.completedSessions > 0 ? `${sub.completedSessions} / ${sub.totalSessions}` : `0 / ${sub.totalSessions}`],
    ["INTERVALO",        sub.intervalDays > 0 ? `A cada ${sub.intervalDays} dias` : "Dose unica"],
    ["TEMPO ATE EFEITO", st(sub.timeToEffect) || "A definir"],
    ["INICIO",           sub.startDate        || "A definir"],
  ];
  opCells.forEach(([label, value], i) => {
    const col  = i % 3, row = Math.floor(i / 3);
    const cx   = MG + col * cellW;
    const cy   = opTop - row * cellH;
    // Borda de célula
    page.drawRectangle({ x: cx, y: cy - cellH, width: cellW, height: cellH, borderColor: LINE_CLR, borderWidth: 0.5, opacity: 0 });
    try { page.drawText(label, { x: cx + 4, y: cy - 7, font: f.mrBold, size: T.label, color: WARM_CLR }); } catch { /**/ }
    const valLines = wrapText(st(value), f.ebBold, T.opData, cellW - 8);
    try { page.drawText(valLines[0] ?? value, { x: cx + 4, y: cy - 18, font: f.ebBold, size: T.opData, color: NAVY }); } catch { /**/ }
  });

  // ── FAIXA 3: Narrativa + Radar (49–105 mm) ────────────────────────────────
  const narTop = topToY(51);
  const narW   = CW * 0.50;
  const radW   = CW - narW - 4 * PT;
  const radX   = MG + narW + 4 * PT;
  const narBlocks: [string, string][] = [
    ["O QUE E",                  st(sub.description)      || "Descricao nao cadastrada para esta apresentacao."],
    ["FUNCAO NO SEU PLANO",      st(sub.mainFunction)     || "Funcao nao cadastrada."],
    ["O QUE PODE SER PERCEBIDO", st(sub.perceivedEffects) || "Efeitos percebidos nao cadastrados."],
  ];
  const narBlockH = 17 * PT;
  narBlocks.forEach(([label, text], i) => {
    const by = narTop - i * narBlockH;
    page.drawRectangle({ x: MG, y: by - narBlockH, width: narW, height: narBlockH, color: MARBLE });
    page.drawLine({ start: { x: MG, y: by }, end: { x: MG, y: by - narBlockH }, thickness: 1.5, color: GOLD });
    try { page.drawText(label, { x: MG + 6, y: by - 6, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }
    drawWrapped(page, text, { x: MG + 6, y: by - 14, width: narW - 10, font: f.mrReg, size: T.body, color: WARM_CLR, maxLines: 4 });
  });

  // Radar (direita)
  const activeBs = BODY_SYSTEMS.filter(s => (sub.bodySystemEffects[s.key] ?? null) !== null);
  const radarR   = 26 * PT;
  const rCx      = radX + radW / 2;
  const rCy      = narTop - 28 * PT;
  drawRadar(page, rCx, rCy, radarR, activeBs.map(s => ({
    label: s.label,
    value: sub.bodySystemEffects[s.key] ?? 0,
  })), f);

  // A escala do catalogo ("5 / 5") NAO e desenhada aqui de proposito.
  //
  // Ela ficava com linha de base em 107 mm, que e exatamente onde a FAIXA 4
  // comeca, entao o numero grande caia por cima da lista de medidores e a legenda
  // caia por cima do texto "Nao cadastrado". Como a FAIXA 3 nao tem folga (o radar
  // ja termina perto de 105 mm), o selo mudou de casa: ele agora abre a coluna
  // direita da FAIXA 4, junto dos medidores, que e o lugar logico dele.

  // ── FAIXA 4: Leitura visual (105–147 mm) ─────────────────────────────────
  const visTop = topToY(107);
  const visH   = 40 * PT;
  const visW   = CW / 2 - 4;
  const visRX  = MG + visW + 8;

  // Rótulos das seções
  try { page.drawText("ENFASE POR SISTEMA", { x: MG, y: visTop, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }
  try { page.drawText("MEDIDORES DO CATALOGO", { x: visRX, y: visTop, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }
  page.drawLine({ start: { x: MG, y: visTop - 4 }, end: { x: MG_R, y: visTop - 4 }, thickness: 0.4, color: LINE_CLR });

  // Barras verticais (esquerda)
  const hasVisBs = activeBs.length > 0;
  if (!hasVisBs) {
    try { page.drawText("Sem sistema do corpo cadastrado.", { x: MG, y: visTop - 15, font: f.mrReg, size: T.body, color: WARM_CLR }); } catch { /**/ }
  } else {
    const barAreaW2 = visW / activeBs.length;
    const barMaxH   = visH - 12;
    activeBs.forEach((sys, si) => {
      const val   = Math.min(5, Math.max(0, sub.bodySystemEffects[sys.key] ?? 0));
      const bH    = (val / 5) * barMaxH;
      const bX    = MG + si * barAreaW2 + 4;
      const bW    = Math.min(20, barAreaW2 - 4);
      const bY    = visTop - visH + 6;
      // Trilho
      page.drawRectangle({ x: bX, y: bY, width: bW, height: barMaxH, color: MARBLE });
      // Valor
      page.drawRectangle({ x: bX, y: bY, width: bW, height: bH, color: NAVY });
      // Rótulo
      try { page.drawText(sys.label.slice(0, 6), { x: bX, y: bY - 7, font: f.mrBold, size: T.label - 0.5, color: WARM_CLR }); } catch { /**/ }
      try { page.drawText(`${val}/5`, { x: bX, y: visTop - 4 - 8, font: f.mrReg, size: T.label, color: WHITE }); } catch { /**/ }
    });
  }

  // Medidores (direita) — lista de quadrados 0–5
  const meters: [string, string][] = [
    ["Emagrecimento",        sub.benefits.find(b => b.label.toLowerCase().includes("emag"))?.value ?? ""],
    ["Hipertrofia",          sub.benefits.find(b => b.label.toLowerCase().includes("hiper"))?.value ?? ""],
    ["Recuperacao muscular", sub.benefits.find(b => b.label.toLowerCase().includes("recup"))?.value ?? ""],
    ["Neurocognicao",        sub.benefits.find(b => b.label.toLowerCase().includes("neuro") || b.label.toLowerCase().includes("mental"))?.value ?? ""],
  ];
  // Selo da escala do catalogo — abre a coluna direita (mudou de casa; ver FAIXA 3).
  let metersTop = visTop - 12;
  if (sub.starRating != null) {
    const srStr = `${sub.starRating} / 5`;
    try { page.drawText(srStr, { x: visRX, y: visTop - 19, font: f.ebSemi, size: T.numSmall, color: NAVY }); } catch { /**/ }
    const srW = (() => { try { return f.ebSemi.widthOfTextAtSize(srStr, T.numSmall); } catch { return 30; } })();
    try { page.drawText("escala do catalogo clinico", { x: visRX + srW + 6, y: visTop - 15, font: f.mrReg, size: T.label, color: WARM_CLR }); } catch { /**/ }
    metersTop = visTop - 33;
  } else {
    try { page.drawText("Escala nao cadastrada no catalogo.", { x: visRX, y: visTop - 15, font: f.mrReg, size: T.body, color: WARM_CLR }); } catch { /**/ }
    metersTop = visTop - 27;
  }

  meters.forEach(([label, val], i) => {
    const my = metersTop - i * 10;
    try { page.drawText(st(label) + ":", { x: visRX, y: my, font: f.mrBold, size: T.label, color: WARM_CLR }); } catch { /**/ }
    if (val) {
      try { page.drawText(st(val), { x: visRX + 90, y: my, font: f.mrReg, size: T.body, color: NAVY }); } catch { /**/ }
    } else {
      try { page.drawText("Nao cadastrado", { x: visRX + 90, y: my, font: f.mrReg, size: T.body, color: LINE_CLR }); } catch { /**/ }
    }
  });

  // ── FAIXA 5: Conhecimento clínico 2×2 (149–221 mm) ────────────────────────
  const knowTop = topToY(151);
  const knowH   = 68 * PT;
  const qW      = CW / 2 - 4;

  const quadrants: [string, string, Color][] = [
    ["COMPOSICAO & POSOLOGIA",
      st(sub.compositionRaw) || `Posologia: ${st(sub.dose)} · ${sub.via} · a cada ${sub.intervalDays} dias · ${sub.totalSessions} sessoes`,
      PAPER],
    ["BENEFICIOS CADASTRADOS",
      sub.benefits.slice(0, 4).map(b => `• ${st(b.label)}${b.value ? `: ${st(b.value)}` : ""}`).join("\n") || "Beneficios nao cadastrados.",
      PAPER],
    ["SEGURANCA",
      st(sub.contraindications) || "Orientacoes de seguranca nao cadastradas — confirme com a equipe antes da sessao.",
      MARBLE],
    ["CIENCIA & INDICACAO",
      st(sub.scientificEvidence) || "Evidencia cientifica nao cadastrada para esta substancia.",
      PAPER],
  ];
  quadrants.forEach(([label, content, bg], qi) => {
    const qCol = qi % 2, qRow = Math.floor(qi / 2);
    const qx   = MG + qCol * (qW + 8);
    const qy   = knowTop - qRow * (knowH / 2);
    const bColor = qi === 2 ? rgb(0.97, 0.95, 0.94) : bg; // SEGURANÇA tem fundo levemente avermelhado
    page.drawRectangle({ x: qx, y: qy - knowH / 2, width: qW, height: knowH / 2, color: bColor, borderColor: LINE_CLR, borderWidth: 0.5 });
    // Faixa de título
    const hdrBg = qi === 2 ? SAFETY_CLR : NAVY;
    page.drawRectangle({ x: qx, y: qy - 11, width: qW, height: 11, color: hdrBg });
    try { page.drawText(label, { x: qx + 4, y: qy - 8, font: f.mrBold, size: T.label, color: WHITE }); } catch { /**/ }
    drawWrapped(page, content, {
      x: qx + 4, y: qy - 18, width: qW - 8,
      font: f.mrReg, size: T.body, color: qi === 2 ? rgb(0.25, 0.10, 0.10) : WARM_CLR,
      maxLines: 8,
    });
  });

  // ── FAIXA 6: Rodapé ──────────────────────────────────────────────────────
  drawInternalFooter(page, f, pageNum, totalPages, clientName, assets);
}

// ─── ROTEIRO FINAL (Seção referência) ─────────────────────────────────────────

function drawProtocolRoutePage(page: PDFPage, dto: CartaTratamentoData, f: CartaFonts, pageNum: number, totalPages: number, assets?: CartaAssets) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });

  const hdrY = topToY(13);
  page.drawLine({ start: { x: MG, y: hdrY }, end: { x: MG_R, y: hdrY }, thickness: 0.5, color: LINE_CLR });
  try { page.drawText("ROTEIRO DO PROTOCOLO", { x: MG, y: hdrY - 10, font: f.ebSemi, size: 22, color: NAVY }); } catch { /**/ }
  drawInternalHeader(page, f);

  // Linha do tempo de substâncias
  const tlTop  = topToY(40);
  const tlRow  = 14 * PT;
  try { page.drawText("CRONOGRAMA DE SUBSTANCIAS", { x: MG, y: tlTop + 2, font: f.mrBold, size: T.label, color: NAVY }); } catch { /**/ }
  page.drawLine({ start: { x: MG, y: tlTop - 3 }, end: { x: MG_R, y: tlTop - 3 }, thickness: 0.5, color: LINE_CLR });

  dto.substances.forEach((sub, i) => {
    const ry   = tlTop - 10 - i * tlRow;
    const prog = sub.totalSessions > 0 ? sub.completedSessions / sub.totalSessions : 0;
    const barW = CW * 0.35;
    const barH = 7;
    // Número e nome
    try { page.drawText(`${String(sub.idx).padStart(2, "0")} ${st(sub.name)}`, { x: MG, y: ry, font: f.ebSemi, size: T.body + 0.5, color: NAVY }); } catch { /**/ }
    // Dose/sessões
    try { page.drawText(`${st(sub.dose)} · ${sub.totalSessions} sessoes`, { x: MG + CW * 0.42, y: ry, font: f.mrReg, size: T.body, color: WARM_CLR }); } catch { /**/ }
    // Barra de progresso
    const bx = MG_R - barW;
    page.drawRectangle({ x: bx, y: ry - barH, width: barW, height: barH, color: LINE_CLR });
    page.drawRectangle({ x: bx, y: ry - barH, width: barW * Math.min(1, prog), height: barH, color: NAVY });
    try { page.drawText(`${sub.completedSessions}/${sub.totalSessions}`, { x: bx - 28, y: ry - barH + 1, font: f.mrBold, size: T.label, color: WARM_CLR }); } catch { /**/ }
  });

  // Nota orientativa
  const noteY = topToY(272);
  page.drawRectangle({ x: MG, y: noteY - 14, width: CW, height: 14, color: MARBLE });
  page.drawLine({ start: { x: MG, y: noteY }, end: { x: MG, y: noteY - 14 }, thickness: 1.5, color: GOLD });
  try {
    page.drawText("Em caso de duvida sobre o roteiro, consulte a equipe antes de qualquer alteracao.", {
      x: MG + 8, y: noteY - 9, font: f.mrReg, size: T.body, color: WARM_CLR,
    });
  } catch { /**/ }

  drawInternalFooter(page, f, pageNum, totalPages, dto.clientName, assets);
}

// ─── CARREGAMENTO DE FONTES E ASSETS ──────────────────────────────────────────

async function loadFonts(pdfDoc: PDFDocument): Promise<CartaFonts> {
  pdfDoc.registerFontkit(fontkit);
  // ── DUAS REGRAS OPOSTAS, CADA UMA COM SEU MOTIVO. NAO UNIFICAR. ──────────────
  // Manrope (.woff): { subset: true } OBRIGATORIO — sem o recorte o .woff entra
  // comprimido cru e o PDF sai ilegivel ("Embedded font file may be invalid").
  // EB Garamond (.ttf): { subset: false } OBRIGATORIO — sao INSTANCIAS de fonte
  // variavel e o recorte do fontkit as corrompe (metade das letras some). O
  // recorte ja foi feito antes, com fontTools, no arquivo em assets/fonts.
  // Comprovado em 13/08/2026. Ver specs/carta-tratamento-premium-v2.md.
  const embedWoff = (name: string) => pdfDoc.embedFont(readFont(name), { subset: true });
  const embedTtf = (name: string) => pdfDoc.embedFont(readFont(name), { subset: false });
  return {
    ebReg:      await embedTtf("EBGaramond-Regular.ttf"),
    ebSemi:     await embedTtf("EBGaramond-SemiBold.ttf"),
    ebBold:     await embedTtf("EBGaramond-Bold.ttf"),
    ebSemiItal: await embedTtf("EBGaramond-SemiBoldItalic.ttf"),
    mrReg:      await embedWoff("Manrope-Regular.woff"),
    mrBold:     await embedWoff("Manrope-Bold.woff"),
  };
}

async function loadAssets(pdfDoc: PDFDocument): Promise<CartaAssets> {
  const assets: CartaAssets = {};
  const symbolBuf  = readAsset("paxmed-symbol.png");
  const wordmarkBuf = readAsset("paxmed-wordmark.png");
  const clinicBuf  = readAsset("padua-wordmark.png");
  const padconSymBuf = readAsset("padcon-symbol.png");
  const padconWrdBuf = readAsset("padcon-words.png");
  if (symbolBuf)  try { assets.symbolGlass = await pdfDoc.embedPng(symbolBuf); } catch { /**/ }
  if (wordmarkBuf) try { assets.wordmarkImg = await pdfDoc.embedPng(wordmarkBuf); } catch { /**/ }
  if (clinicBuf)  try { assets.clinicImg   = await pdfDoc.embedPng(clinicBuf);  } catch { /**/ }
  if (padconSymBuf) try { assets.padconSymbol = await pdfDoc.embedPng(padconSymBuf); } catch { /**/ }
  if (padconWrdBuf) try { assets.padconWords  = await pdfDoc.embedPng(padconWrdBuf); } catch { /**/ }
  return assets;
}

// ─── DTO DE APRESENTAÇÃO (Seção 2 / 9 — buildProtocolPresentationDto) ─────────

export function buildCartaTratamentoDto(raw: {
  protocolId: number;
  protocolTitle: string;
  clientName: string;
  clientCpf?: string | null;
  professionalName: string;
  professionalCrm?: string | null;
  unit: string;
  startDate: string;
  substances: Array<{
    name: string;
    dose: string;
    color: string;
    totalSessions: number;
    intervalDays: number;
    startDate?: string | null;
    procedureType: string;
    timeToEffect?: string | null;
    starRating?: number | null;
    bodySystemEffects?: Record<string, string | number> | null;
    description?: string | null;
    mainFunction?: string | null;
    perceivedEffects?: string | null;
    contraindications?: string | null;
    scientificEvidence?: string | null;
    longevityBenefit?: string | null;
    qualityOfLifeImpact?: string | null;
    sleepBenefit?: string | null;
    energyBenefit?: string | null;
    libidoBenefit?: string | null;
    physicalPerformance?: string | null;
    muscleStrength?: string | null;
    mentalClarity?: string | null;
    skinHairNails?: string | null;
    immuneSupport?: string | null;
    /** Sessoes ja concluidas DESTA substancia. Ausente = 0. */
    completedSessions?: number | null;
  }>;
  sessions?: Array<{ status: string }>;
}): CartaTratamentoData {

  const viaMap: Record<string, string> = {
    iv: "Endovenosa (IV)", im: "Intramuscular (IM)", implant: "Implante Subcutaneo", sc: "Subcutanea (SC)",
  };

  const bsKeyMap: Record<string, BsKey> = {
    longevidade: "longevidade", longevity: "longevidade",
    cardiovascular: "cardiovascular", cardiac: "cardiovascular",
    muscular: "muscular", muscle: "muscular",
    metabolismo: "metabolismo", metabolism: "metabolismo",
    neurologico: "neurologico", neurological: "neurologico", neuro: "neurologico",
    ossos: "ossos", bones: "ossos", joints: "ossos",
  };

  const completedSessions = (raw.sessions ?? []).filter(s => s.status === "completed").length;
  const totalSessions     = raw.substances.reduce((m, s) => Math.max(m, s.totalSessions), 0);

  const substances: LetterSubstance[] = raw.substances.map((sub, i) => {
    // Normaliza bodySystemEffects para BsKey → number 0–5
    const bse: Partial<Record<BsKey, number>> = {};
    if (sub.bodySystemEffects) {
      for (const [rawKey, rawVal] of Object.entries(sub.bodySystemEffects)) {
        const n = Number(rawVal);
        if (!isNaN(n) && n >= 0 && n <= 5) {
          const mapped = bsKeyMap[rawKey.toLowerCase().replace(/[^a-z]/g, "")] ??
            (Object.values(bsKeyMap).includes(rawKey.toLowerCase() as BsKey) ? rawKey.toLowerCase() as BsKey : null);
          if (mapped) bse[mapped] = Math.round(n * 10) / 10;
        }
      }
    }

    // Coleta benefícios das colunas individuais
    const benefits: { label: string; value: string }[] = [];
    const addBenefit = (label: string, val: string | null | undefined) => {
      if (val) benefits.push({ label, value: val });
    };
    addBenefit("Longevidade",         sub.longevityBenefit);
    addBenefit("Qualidade de vida",   sub.qualityOfLifeImpact);
    addBenefit("Sono",                sub.sleepBenefit);
    addBenefit("Energia",             sub.energyBenefit);
    addBenefit("Libido",              sub.libidoBenefit);
    addBenefit("Performance fisica",  sub.physicalPerformance);
    addBenefit("Forca muscular",      sub.muscleStrength);
    addBenefit("Clareza mental",      sub.mentalClarity);
    addBenefit("Pele/Cabelo/Unhas",   sub.skinHairNails);
    addBenefit("Imunidade",           sub.immuneSupport);

    return {
      idx:               i + 1,
      name:              sub.name,
      dose:              sub.dose,
      via:               viaMap[sub.procedureType] ?? sub.procedureType.toUpperCase(),
      totalSessions:     sub.totalSessions,
      // Contagem real por substancia. Quando o chamador nao informa, cai em 0.
      // Deixar 0 fixo fazia a ficha dizer "0 / 8" enquanto a capa dizia "3 de 8".
      completedSessions: Math.max(0, Math.min(sub.completedSessions ?? 0, sub.totalSessions)),
      intervalDays:      sub.intervalDays,
      startDate:         sub.startDate ?? raw.startDate,
      timeToEffect:      sub.timeToEffect ?? undefined,
      starRating:        sub.starRating != null && sub.starRating >= 0 && sub.starRating <= 5 ? sub.starRating : undefined,
      bodySystemEffects: bse,
      description:       sub.description ?? undefined,
      mainFunction:      sub.mainFunction ?? undefined,
      perceivedEffects:  sub.perceivedEffects ?? undefined,
      contraindications: sub.contraindications ?? undefined,
      scientificEvidence: sub.scientificEvidence ?? undefined,
      benefits,
      color: sub.color,
    };
  });

  return {
    protocolId:        raw.protocolId,
    protocolTitle:     raw.protocolTitle,
    clientName:        raw.clientName,
    clientCpf:         raw.clientCpf ?? "",
    professionalName:  raw.professionalName,
    professionalCrm:   raw.professionalCrm,
    unit:              raw.unit,
    startDate:         raw.startDate,
    totalSessions,
    completedSessions,
    substances,
  };
}

// ─── GERADOR PRINCIPAL ────────────────────────────────────────────────────────

/**
 * generateProtocolLetterPdf
 *
 * Gera a Carta de Tratamento Premium PAXMED seguindo a arquitetura Dr. Manus Item #88.
 * Retorna bytes do PDF assinado via PAdES (mesmo contrato de generateProtocolDocumentPdf).
 */
export async function generateProtocolLetterPdf(dto: CartaTratamentoData): Promise<{ pdfBytes: Uint8Array; certInfo: unknown }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Carta de Tratamento PAXMED — ${dto.protocolTitle}`);
  pdfDoc.setAuthor("PAXMED — Clinical Intelligence System");
  pdfDoc.setCreator("PADCON");

  // Carrega fontes e assets
  const [fonts, assets] = await Promise.all([loadFonts(pdfDoc), loadAssets(pdfDoc)]);

  // Calcula total de páginas: 1 capa + 1 mapa + N fichas + 1 roteiro
  const totalPages = 1 + 1 + dto.substances.length + 1;

  // ── Página 1: Capa ──────────────────────────────────────────────────────────
  const coverPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawCoverPage(coverPage, dto, fonts, assets);

  // ── Página 2: Mapa de ênfases ───────────────────────────────────────────────
  const mapPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  // Rodapé usa totalPages correto
  drawOverviewMapPage(mapPage, dto, fonts);
  // Corrige o rodapé do mapa (que já foi desenhado com total=-1 como placeholder)
  drawInternalFooter(mapPage, fonts, 2, totalPages, dto.clientName, assets);

  // ── Páginas 3…N+2: Fichas de substância ────────────────────────────────────
  dto.substances.forEach((sub, i) => {
    const subPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawSubstanceDossierPage(subPage, sub, fonts, assets, totalPages, 3 + i, dto.clientName);
  });

  // ── Página final: Roteiro ───────────────────────────────────────────────────
  const routePage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawProtocolRoutePage(routePage, dto, fonts, totalPages, totalPages, assets);

  // ── Assinatura PAdES (operação terminal, Seção 2 — Dr. Manus Item #88) ──────
  // Graceful fallback: se o certificado não estiver configurado no ambiente,
  // o PDF é entregue sem assinatura digital (válido e legível). O CEO recebe
  // o PDF + um aviso implícito via ausência dos headers X-Cert-*. Quando o
  // certificado estiver configurado, o PDF sai assinado com PAdES/ICP-Brasil.
  const sName = dto.professionalName;
  try {
    const certInfo = getCertInfo();
    const pdfBytes = await embedPadesSignature(pdfDoc, {
      name:        sName,
      reason:      "Assinatura digital da Carta de Tratamento PAXMED (ICP-Brasil)",
      location:    dto.unit || "Brasil",
      contactInfo: dto.clientCpf || "",
    });
    return { pdfBytes, certInfo: { ...certInfo, signerName: sName } };
  } catch (sigErr: any) {
    const msg: string = sigErr?.message ?? String(sigErr);
    // Fallback APENAS quando o certificado não está configurado no ambiente.
    // Qualquer outro erro (certificado inválido, senha errada, falha de assinatura
    // ou construção do PDF) é propagado — documento não é entregue sem aviso explícito.
    const isMissingCert =
      msg.includes("Certificado digital A1 nao configurado") ||
      msg.includes("nao configurado");
    if (!isMissingCert) {
      throw sigErr;
    }
    console.warn(
      "[carta-tratamento] Certificado PAdES não configurado — PDF entregue sem assinatura digital:",
      msg,
    );
    const pdfBytes = new Uint8Array(await pdfDoc.save());
    return { pdfBytes, certInfo: null };
  }
}
