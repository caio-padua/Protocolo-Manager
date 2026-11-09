import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFImage, PDFPage, PDFFont, rgb } from "pdf-lib";
import type { TextosEmpresa2b } from "./paxmed-2b-limites";

const LARGURA = 595.276;
const ALTURA = 841.89;
const escalaX = LARGURA / 1055;
const escalaY = ALTURA / 1491;
const px = (v: number) => v * escalaX;
const py = (v: number) => ALTURA - v * escalaY;
const ouro = rgb(0.96, 0.83, 0.54);
const tinta = rgb(0.06, 0.12, 0.22);
const claro = rgb(0.97, 0.95, 0.89);

/** Coordenadas da área utilizável. Os valores estão em pontos de documento. */
export const GRAND_FINALE = {
  largura: LARGURA,
  altura: ALTURA,
  corpoTopo: py(558),
  corpoBase: py(1004),
  assinaturaBase: py(1226),
} as const;

export type IdentidadeGrandFinale = {
  textos: TextosEmpresa2b;
  simboloDourado: Uint8Array;
};

export type ArteGrandFinale = {
  fundo: PDFImage;
  simbolo: PDFImage;
  textos: TextosEmpresa2b;
};

function arquivoBase(): Uint8Array {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    path.join(dir, "assets", "receituario-grand-finale", "base-neutra.jpg"),
    path.resolve(dir, "../../../assets/receituario-grand-finale/base-neutra.jpg"),
  ];
  for (const candidato of candidatos) {
    try { return readFileSync(candidato); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("A arte neutra do receituário não está disponível.");
}

/** Exige uma identidade explícita: nunca completa com a marca do Instituto Pádua. */
export async function prepararArteGrandFinale(
  doc: PDFDocument,
  identidade: IdentidadeGrandFinale,
): Promise<ArteGrandFinale> {
  if (!identidade?.simboloDourado?.length || !identidade.textos?.nomeCabecalho?.trim()) {
    throw new Error("A identidade empresarial do receituário está incompleta.");
  }
  const [fundo, simbolo] = await Promise.all([
    doc.embedJpg(arquivoBase()),
    doc.embedPng(identidade.simboloDourado),
  ]);
  if (fundo.width !== 1055 || fundo.height !== 1491) {
    throw new Error("As dimensões da arte neutra do receituário são inválidas.");
  }
  return { fundo, simbolo, textos: identidade.textos };
}

function tamanhoQueCabe(font: PDFFont, texto: string, largura: number, inicial: number, minimo: number): number {
  for (let tamanho = inicial; tamanho >= minimo; tamanho -= 0.25) {
    if (font.widthOfTextAtSize(texto, tamanho) <= largura) return tamanho;
  }
  throw new Error("Um dado da identidade não cabe no espaço do receituário.");
}

function imagemContida(page: PDFPage, image: PDFImage, x: number, y: number, w: number, h: number, opacity = 1): void {
  const escala = Math.min(w / image.width, h / image.height);
  const iw = image.width * escala;
  const ih = image.height * escala;
  page.drawImage(image, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih, opacity });
}

/** Desenha apenas a moldura e a identidade; não gera, assina ou envia receitas. */
export function desenharPaginaGrandFinale(
  page: PDFPage,
  arte: ArteGrandFinale,
  fontes: { titulo: PDFFont; texto: PDFFont },
  tipo: "simples" | "especial",
): void {
  if (Math.abs(page.getWidth() - LARGURA) > 1 || Math.abs(page.getHeight() - ALTURA) > 1) {
    throw new Error("O receituário Grand Finale exige página A4 retrato.");
  }
  page.drawImage(arte.fundo, { x: 0, y: 0, width: LARGURA, height: ALTURA });
  imagemContida(page, arte.simbolo, px(82), py(170), px(75), py(60) - py(170));
  const nome = arte.textos.nomeCabecalho.trim();
  const tamanhoNome = tamanhoQueCabe(fontes.titulo, nome, px(300), 18, 8);
  page.drawText(nome, { x: px(170), y: py(121), size: tamanhoNome, font: fontes.titulo, color: ouro });
  const titulo = tipo === "especial" ? "Receituário de controle especial" : "Receituário comum";
  const tamanhoTitulo = tamanhoQueCabe(fontes.titulo, titulo, px(330), 16, 9);
  page.drawText(titulo, {
    x: (LARGURA - fontes.titulo.widthOfTextAtSize(titulo, tamanhoTitulo)) / 2,
    y: py(229), font: fontes.titulo, size: tamanhoTitulo, color: tinta,
  });
  // O símbolo de água é sempre da empresa do contexto, nunca o da arte original.
  imagemContida(page, arte.simbolo, px(395), py(870), px(275), px(275), 0.05);
}

/** O número correto de páginas só é conhecido depois que todo o conteúdo existe. */
export function carimbarRodapeGrandFinale(
  page: PDFPage,
  arte: ArteGrandFinale,
  fontes: { titulo: PDFFont; texto: PDFFont },
  pagina: number,
  total: number,
): void {
  if (!Number.isInteger(pagina) || !Number.isInteger(total) || pagina < 1 || pagina > total) {
    throw new Error("Numeração de páginas inválida.");
  }
  const linhas = [arte.textos.rodapeLinha1, arte.textos.rodapeLinha2, arte.textos.rodapeLinha3];
  const centro = px(535);
  linhas.forEach((linha, i) => {
    if (!linha?.trim()) return;
    const font = i === 0 ? fontes.titulo : fontes.texto;
    const tamanho = tamanhoQueCabe(font, linha.trim(), px(300), i === 0 ? 12 : 8, 6);
    page.drawText(linha.trim(), {
      x: centro - font.widthOfTextAtSize(linha.trim(), tamanho) / 2,
      y: py(1306 + i * 22), font, size: tamanho, color: i === 0 ? ouro : claro,
    });
  });
  const rotulo = `Página ${pagina} de ${total}`;
  const size = 8;
  page.drawText(rotulo, { x: px(830) - fontes.texto.widthOfTextAtSize(rotulo, size) / 2,
    y: py(1345), font: fontes.texto, size, color: claro });
}
