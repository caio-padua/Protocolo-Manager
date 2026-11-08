// Prova sintética do Modelo 2B. Não gera link de verificação nem autoriza
// emissão clínica. As imagens vieram do pacote fornecido pelo usuário.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { PNG } from "pngjs";
import { tamanhoNomeCabecalho, type TextosEmpresa2b } from "./paxmed-2b-limites";

const MM = 72 / 25.4;
const mm = (n: number) => n * MM;
const WIDTH = mm(210);
const HEIGHT = mm(297);
const INK = rgb(20 / 255, 34 / 255, 56 / 255);
const GOLD = rgb(203 / 255, 155 / 255, 74 / 255);
export const PAXMED_LIMITE_CONTEUDO = mm(44);

export interface VisualProva {
  header: PDFImage;
  symbol: PDFImage;
  wordmark: PDFImage;
  tagline: PDFImage;
  serifBold: PDFFont;
  identidade?: TextosEmpresa2b;
  simboloEmpresa?: PDFImage;
}

function asset(nome: string): Uint8Array {
  // O pacote é copiado para dist/assets durante a compilação do servidor.
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const paths = [
    path.join(directory, "assets", "paxmed-modelo-2b", nome),
    path.resolve(directory, "../../../assets/paxmed-modelo-2b", nome),
  ];
  for (const p of paths) {
    try { return readFileSync(p); } catch { /* tenta outro local */ }
  }
  throw new Error(`Arte obrigatória do Modelo 2B ausente: ${nome}`);
}

export async function prepararVisualProva(
  doc: PDFDocument, custom?: { textos: TextosEmpresa2b; simboloDourado: Uint8Array },
): Promise<VisualProva> {
  let headerBytes = asset("header-instituto-padua-textfree.png");
  if (custom) {
    // A arte fornecida traz o nome e símbolo do Instituto impressos. Na prova
    // empresarial, cobrir somente essa área com amostras do mesmo tecido azul.
    // É uma aproximação para teste, não a arte aprovada para emissão clínica.
    const image = PNG.sync.read(Buffer.from(headerBytes));
    if (image.width !== 977 || image.height !== 157) throw new Error("Dimensões inesperadas da arte de prova.");
    for (let y = 18; y < 145; y++) {
      for (let x = 32; x < 410; x++) {
        const from = (y * image.width + 480 + ((x - 32) % 270)) * 4;
        const to = (y * image.width + x) * 4;
        const blend = Math.min(1, (x - 32) / 12, (409 - x) / 12, (y - 18) / 12, (144 - y) / 12);
        for (let channel = 0; channel < 3; channel++) {
          image.data[to + channel] = Math.round(image.data[to + channel] * (1 - blend) + image.data[from + channel] * blend);
        }
      }
    }
    headerBytes = PNG.sync.write(image);
  }
  const [header, symbol, wordmark, tagline, serifBold] = await Promise.all([
    doc.embedPng(headerBytes),
    doc.embedPng(asset("paxmed-simbolo-ouro-transparente.png")),
    doc.embedPng(asset("paxmed-nome-ouro-transparente.png")),
    doc.embedPng(asset("paxmed-tagline-ouro-renderizado.png")),
    doc.embedFont(StandardFonts.TimesRomanBold),
  ]);
  const simboloEmpresa = custom ? await doc.embedPng(custom.simboloDourado) : undefined;
  return { header, symbol, wordmark, tagline, serifBold, identidade: custom?.textos, simboloEmpresa };
}

function garantirA4(page: PDFPage): void {
  const { width, height } = page.getSize();
  if (Math.abs(width - WIDTH) > 1 || Math.abs(height - HEIGHT) > 1) {
    throw new Error("A prova do Modelo 2B exige página A4 retrato.");
  }
}

function imagemContida(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number, centro = false): void {
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: x + (centro ? (width - w) / 2 : 0), y: y + (height - h) / 2, width: w, height: h });
}

export function desenharCabecalhoProva(
  page: PDFPage, visual: VisualProva, font: PDFFont, bold: PDFFont, titulo: string, subtitulo: string,
  demonstracao = true,
): number {
  garantirA4(page);
  const title = titulo.trim();
  const subtitle = subtitulo.trim();
  if (!title || !subtitle) throw new Error("Título e subtítulo são obrigatórios no Modelo 2B.");
  if (bold.widthOfTextAtSize(title, 14.6) > mm(79) || font.widthOfTextAtSize(subtitle, 8.95) > mm(79)) {
    throw new Error("Título ou subtítulo excede o espaço do Modelo 2B.");
  }
  page.drawImage(visual.header, { x: mm(5), y: HEIGHT - mm(39), width: mm(200), height: mm(32) });
  if (visual.identidade && visual.simboloEmpresa) {
    imagemContida(page, visual.simboloEmpresa, mm(14), HEIGHT - mm(34), mm(16), mm(21), true);
    const size = tamanhoNomeCabecalho(visual.serifBold, visual.identidade.nomeCabecalho);
    page.drawText(visual.identidade.nomeCabecalho, {
      x: mm(34), y: HEIGHT - mm(23.5) - visual.serifBold.heightAtSize(size, { descender: false }) / 2,
      font: visual.serifBold, size,
      color: rgb(0.94, 0.79, 0.49),
    });
  }
  page.drawText(title, { x: mm(96.2), y: HEIGHT - mm(21), font: bold, size: 14.6, color: rgb(247 / 255, 217 / 255, 148 / 255) });
  page.drawText(subtitle, { x: mm(96.2), y: HEIGHT - mm(29), font, size: 8.95, color: rgb(245 / 255, 240 / 255, 232 / 255) });
  if (demonstracao) {
    const notice = "DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA";
    page.drawText(notice, { x: mm(13), y: HEIGHT - mm(50), font: bold, size: 9, color: rgb(0.65, 0.08, 0.08) });
  }
  return HEIGHT - mm(59);
}

function carimbarRodapes(
  doc: PDFDocument, visual: VisualProva, font: PDFFont,
  modo: { tipo: "prova" } | { tipo: "clinico"; qr: PDFImage | null },
): void {
  const pages = doc.getPages();
  if (!pages.length) throw new Error("Documento de prova sem páginas.");
  pages.forEach((page, index) => {
    garantirA4(page);
    const bottom = mm(10);
    page.drawRectangle({ x: mm(11), y: bottom + mm(29.5), width: mm(188), height: mm(0.35), color: GOLD });
    imagemContida(page, visual.symbol, mm(11), bottom + mm(3.3), mm(14.4), mm(14.5), true);
    imagemContida(page, visual.wordmark, mm(26.8), bottom + mm(10.9), mm(42), mm(6.5));
    imagemContida(page, visual.tagline, mm(26.8), bottom + mm(5.1), mm(42), mm(4.8));
    const center = (mm(71.16) + mm(138.84)) / 2;
    const central = (text: string, y: number, size: number, f: PDFFont) => {
      const width = f.widthOfTextAtSize(text, size);
      if (width > mm(66)) throw new Error("Endereço ultrapassa o espaço reservado.");
      page.drawText(text, { x: center - width / 2, y, size, font: f, color: INK });
    };
    central(visual.identidade?.rodapeLinha1 ?? "Instituto Pádua", bottom + mm(17.3), 12.6, visual.serifBold);
    central(visual.identidade?.rodapeLinha2 ?? "Rua Guaxupé, 327 - Tatuapé", bottom + mm(11.4), 7.65, font);
    central(visual.identidade?.rodapeLinha3 ?? "CEP.: 03416-050 - São Paulo - SP", bottom + mm(7.15), 7.65, font);
    const qrX = mm(199 - 18.3);
    const textRight = qrX - mm(1.6);
    const textos = modo.tipo === "prova"
      ? ["Documento de teste", "Sem verificação", `Página ${index + 1} de ${pages.length}`]
      : [modo.qr ? "Acesso com login" : "Sem assinatura digital", `Página ${index + 1} de ${pages.length}`];
    textos.forEach((text, i) => {
      const width = font.widthOfTextAtSize(text, 7.9);
      if (textRight - width < mm(139.64)) throw new Error("Texto da prova invade o espaço central.");
      page.drawText(text, { x: textRight - width, y: bottom + mm(16 - i * 4.7), size: 7.9, font, color: INK });
    });
    if (modo.tipo === "prova") {
      page.drawRectangle({ x: qrX, y: bottom + mm(2.45), width: mm(18.3), height: mm(18.3), borderColor: INK, borderWidth: 0.5 });
      page.drawText("SEM QR", { x: qrX + mm(2), y: bottom + mm(11), size: 6, font, color: INK });
      page.drawText("DE TESTE", { x: qrX + mm(2), y: bottom + mm(8), size: 5.5, font, color: INK });
    } else if (modo.qr) {
      page.drawImage(modo.qr, { x: qrX, y: bottom + mm(2.45), width: mm(18.3), height: mm(18.3) });
    }
  });
}

export function carimbarRodapesProva(doc: PDFDocument, visual: VisualProva, font: PDFFont): void {
  carimbarRodapes(doc, visual, font, { tipo: "prova" });
}

export function carimbarRodapesClinicos(doc: PDFDocument, visual: VisualProva, font: PDFFont, qr: PDFImage | null): void {
  if (!visual.identidade || !visual.simboloEmpresa) throw new Error("Identidade empresarial obrigatória.");
  carimbarRodapes(doc, visual, font, { tipo: "clinico", qr });
}
