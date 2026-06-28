// Fábrica de Padrão de Documentos — camada ÚNICA de cabeçalho, rodapé, marca,
// tipografia e cores para TODOS os documentos PDF do sistema (motor pdf-lib).
//
// Objetivo: cada gerador (solicitação de exame, protocolo, RAS, termos) consome
// este padrão em vez de redesenhar cabeçalho/rodapé à mão. Um formato, um motor
// (Art. 57 do Código Paxter). NÃO substitui o motor da grade do RAS FAP (pdfkit),
// que tem layout próprio e fica intocado.
//
// Identidade: marca PAXTER em ouro sobre faixa-mastro escura (a assinatura visual
// oficial é ouro-sobre-escuro). Exceção da marca: o RECEITUÁRIO usa "Instituto
// Pádua" como emissor clínico — por isso o emissor é parametrizável.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "../logger";

// ---- Paleta da marca (espelha os tokens do front em artifacts/padcom/src/index.css) ----
export const COR = {
  navy: rgb(0.086, 0.161, 0.29), // #16294a  (primary)
  navy700: rgb(0.133, 0.251, 0.416), // #22406a
  mastro: rgb(0.043, 0.047, 0.055), // near-black da arte oficial do wordmark
  ouro: rgb(0.722, 0.573, 0.302), // #b8924d  (accent)
  ouroClaro: rgb(0.851, 0.741, 0.494), // #d9bd7e
  tinta: rgb(0.11, 0.12, 0.14), // texto do corpo
  cinza: rgb(0.42, 0.45, 0.5), // texto secundário
  papel: rgb(0.973, 0.957, 0.929), // off-white quente (fundo do corpo)
  branco: rgb(1, 1, 1),
};

export const PAGINA = {
  larguraRetrato: 595.28,
  alturaRetrato: 841.89,
  margem: 50,
};

const MASTRO_ALTURA = 66; // altura da faixa-mastro do cabeçalho
const RODAPE_Y = 40; // linha de base do rodapé

export type Emissor = "paxter" | "instituto_padua";

export interface CabecalhoOpts {
  titulo: string; // ex.: "SOLICITAÇÃO DE EXAMES"
  subtitulo?: string | null; // ex.: "EXAMES — SANGUE"
  emissor?: Emissor; // default "paxter"
}

export interface RodapeOpts {
  legenda?: string; // default "PAXTER · Motor Clínico — Protocolos Injetáveis"
}

// Resolve um asset de marca. Em produção/dev-workflow o servidor roda do bundle
// (dist), então `${__dirname}/assets` (o build copia ./assets -> dist/assets).
// Em execução avulsa via tsx (fonte), o __dirname é src/lib/documentos, então
// caímos no diretório de assets do pacote (../../../assets). Lança se faltar nos dois.
function lerAsset(nome: string): Uint8Array {
  const candidatos = [path.join(__dirname, "assets", nome), path.resolve(__dirname, "../../../assets", nome)];
  let ultimoErro: unknown;
  for (const p of candidatos) {
    try {
      return readFileSync(p);
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

// Trunca um texto com reticências para caber numa largura máxima (evita o título
// invadir a área do wordmark no cabeçalho-mastro).
function truncar(texto: string, font: PDFFont, size: number, maxLargura: number): string {
  if (font.widthOfTextAtSize(texto, size) <= maxLargura) return texto;
  const retic = "…";
  let corte = texto;
  while (corte.length > 1 && font.widthOfTextAtSize(corte + retic, size) > maxLargura) {
    corte = corte.slice(0, -1);
  }
  return corte + retic;
}

export interface Fabrica {
  doc: PDFDocument;
  font: PDFFont; // Helvetica
  fontBold: PDFFont; // Helvetica-Bold
  margem: number;
  larguraConteudo: number;
  /** Adiciona uma página nova com o cabeçalho-mastro desenhado; devolve o y inicial do conteúdo. */
  novaPagina(opts: CabecalhoOpts): { page: PDFPage; y: number };
  /** Desenha o cabeçalho-mastro numa página já existente; devolve o y inicial do conteúdo. */
  desenharCabecalho(page: PDFPage, opts: CabecalhoOpts): number;
  /**
   * Carimba o rodapé (fio de ouro + legenda + "Página i de N") em TODAS as páginas.
   * Idempotente: só carimba uma vez (proteção contra dupla chamada). DEVE ser o último
   * passo de desenho. Use isto (sem salvar) no fluxo assinado PAdES — carimbar o rodapé,
   * depois entregar `fab.doc` ao assinador (placeholder + assinatura). NÃO desenhe nada
   * depois de assinar.
   */
  carimbarRodape(opts?: RodapeOpts): void;
  /** Carimba o rodapé (se ainda não) e devolve o PDF salvo. Atalho para documentos NÃO assinados. */
  finalizar(opts?: RodapeOpts): Promise<Uint8Array>;
}

// Cria uma Fábrica ligada a um documento novo, com fontes e marca já embutidas.
export async function iniciarFabrica(): Promise<Fabrica> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margem = PAGINA.margem;
  const larguraPagina = PAGINA.larguraRetrato;
  const alturaPagina = PAGINA.alturaRetrato;
  const larguraConteudo = larguraPagina - margem * 2;

  // Pré-embute as marcas (embedPng é assíncrono) para o desenho do cabeçalho ser
  // síncrono. Degrada para texto se faltar o asset (registrado em log).
  const marcas: Partial<Record<Emissor, PDFImage>> = {};
  for (const emissor of ["paxter", "instituto_padua"] as Emissor[]) {
    const arquivo = emissor === "instituto_padua" ? "padua-wordmark.png" : "paxter-wordmark.png";
    try {
      marcas[emissor] = await doc.embedPng(lerAsset(arquivo));
    } catch (err) {
      logger.warn({ err: (err as Error).message, emissor }, "Fábrica: wordmark ausente, usando texto");
    }
  }

  // Emissor predominante do documento (definido no 1º cabeçalho): governa a legenda
  // padrão do rodapé. Receituário (instituto_padua) usa "Instituto Pádua".
  let emissorDoc: Emissor = "paxter";
  let rodapeCarimbado = false;

  function desenharCabecalho(page: PDFPage, opts: CabecalhoOpts): number {
    const emissor = opts.emissor ?? "paxter";
    emissorDoc = emissor;
    const topo = alturaPagina;
    const bandaY = topo - MASTRO_ALTURA;

    // Faixa-mastro escura (assinatura visual ouro-sobre-escuro da marca).
    page.drawRectangle({
      x: 0,
      y: bandaY,
      width: larguraPagina,
      height: MASTRO_ALTURA,
      color: COR.mastro,
    });

    // Wordmark à esquerda, centralizado verticalmente na faixa.
    const marca = marcas[emissor];
    const alvoLargura = emissor === "instituto_padua" ? 150 : 158;
    if (marca) {
      const escala = alvoLargura / marca.width;
      const w = alvoLargura;
      const h = marca.height * escala;
      const y = bandaY + (MASTRO_ALTURA - h) / 2;
      page.drawImage(marca, { x: margem, y, width: w, height: h });
    } else {
      // Degradação: nome em texto ouro (último recurso, registrado em log).
      const nome = emissor === "instituto_padua" ? "INSTITUTO PÁDUA" : "PAXTER";
      page.drawText(nome, {
        x: margem,
        y: bandaY + MASTRO_ALTURA / 2 - 8,
        size: 22,
        font: fontBold,
        color: COR.ouro,
      });
    }

    // Título do documento à direita, alinhado à direita dentro da faixa. Trunca
    // para nunca invadir a área do wordmark (que ocupa da margem até margem+alvoLargura).
    const maxTituloW = larguraPagina - margem - (margem + alvoLargura + 24);
    const tituloSize = 13;
    const titulo = truncar(opts.titulo, fontBold, tituloSize, maxTituloW);
    const tituloLargura = fontBold.widthOfTextAtSize(titulo, tituloSize);
    const tituloX = larguraPagina - margem - tituloLargura;
    const temSub = !!(opts.subtitulo && opts.subtitulo.trim());
    const tituloY = bandaY + (temSub ? MASTRO_ALTURA / 2 + 2 : MASTRO_ALTURA / 2 - 5);
    page.drawText(titulo, { x: tituloX, y: tituloY, size: tituloSize, font: fontBold, color: COR.ouroClaro });
    if (temSub) {
      const subSize = 9;
      const sub = truncar(opts.subtitulo!.trim(), font, subSize, maxTituloW);
      const subLargura = font.widthOfTextAtSize(sub, subSize);
      page.drawText(sub, {
        x: larguraPagina - margem - subLargura,
        y: bandaY + MASTRO_ALTURA / 2 - 12,
        size: subSize,
        font,
        color: COR.ouro,
      });
    }

    // Fio de ouro na base da faixa (2pt) + fio fino claro logo abaixo (refinamento).
    page.drawRectangle({ x: 0, y: bandaY - 2, width: larguraPagina, height: 2, color: COR.ouro });
    page.drawRectangle({ x: 0, y: bandaY - 4, width: larguraPagina, height: 0.6, color: COR.ouroClaro });

    return bandaY - 24; // y inicial do conteúdo
  }

  function novaPagina(opts: CabecalhoOpts): { page: PDFPage; y: number } {
    // Contrato: rodapé é o último passo. Adicionar página depois de carimbar deixaria
    // a página nova sem rodapé e a paginação "i de N" desatualizada — falha cedo.
    if (rodapeCarimbado) {
      throw new Error("Fábrica: novaPagina() após carimbarRodape()/finalizar() — carimbe o rodapé só no fim.");
    }
    const page = doc.addPage([larguraPagina, alturaPagina]);
    const y = desenharCabecalho(page, opts);
    return { page, y };
  }

  function carimbarRodape(opts?: RodapeOpts): void {
    if (rodapeCarimbado) return; // idempotência: nunca carimba duas vezes
    rodapeCarimbado = true;
    const legendaPadrao =
      emissorDoc === "instituto_padua"
        ? "Instituto Pádua — Protocolos Injetáveis"
        : "PAXTER · Motor Clínico — Protocolos Injetáveis";
    const legenda = opts?.legenda ?? legendaPadrao;
    const paginas = doc.getPages();
    const total = paginas.length;
    paginas.forEach((page, i) => {
      // Fio de ouro fino acima do rodapé.
      page.drawRectangle({
        x: margem,
        y: RODAPE_Y + 12,
        width: larguraConteudo,
        height: 0.6,
        color: COR.ouro,
      });
      page.drawText(legenda, { x: margem, y: RODAPE_Y, size: 7.5, font, color: COR.cinza });
      const paginacao = `Página ${i + 1} de ${total}`;
      const w = font.widthOfTextAtSize(paginacao, 7.5);
      page.drawText(paginacao, { x: larguraPagina - margem - w, y: RODAPE_Y, size: 7.5, font, color: COR.cinza });
    });
  }

  async function finalizar(opts?: RodapeOpts): Promise<Uint8Array> {
    carimbarRodape(opts);
    return doc.save();
  }

  return {
    doc,
    font,
    fontBold,
    margem,
    larguraConteudo,
    novaPagina,
    desenharCabecalho,
    carimbarRodape,
    finalizar,
  };
}
