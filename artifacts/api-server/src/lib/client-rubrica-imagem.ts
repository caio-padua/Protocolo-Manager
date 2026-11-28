import { createHash } from "node:crypto";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Rubrica do cliente como IMAGEM — preparo do arquivo enviado (funções puras, sem banco e sem storage).
 *
 * O que entra: foto ou arquivo de PNG/JPEG da rubrica (tinta escura em fundo claro). O que sai: um PNG
 * LIMPO, só com a tinta (fundo transparente), cortado rente ao traço e limitado em tamanho, pronto para
 * ser desenhado numa célula pequena do RAS FAP sem pintar a linha zebrada por baixo.
 *
 * Segurança: o arquivo é decodificado por inteiro com decoders de JavaScript puro (um decoder nativo já
 * derrubou o Node 24 neste projeto) e regravado do zero; EXIF, GPS, miniatura e identificação do aparelho
 * não sobrevivem. O tipo é conferido pelos bytes, não pelo que o navegador declarou.
 */

export const RUBRICA_MAX_BYTES = 2 * 1024 * 1024;
const MAX_MEGAPIXELS = 12;
const MAX_LADO = 8_000;
const SAIDA_MAX_LARGURA = 900;
const SAIDA_MAX_ALTURA = 600;
const TINTA_MIN_PIXELS = 40;
const TINTA_MAX_PROPORCAO = 0.25;
const TRACO_MIN_LADO = 48;
// Reforço do traço fino (expoente < 1 escurece a borda suavizada): a rubrica vai ser impressa pequena, numa célula de 15 pontos.
const REFORCO_TRACO = 0.6;

/** Erro com mensagem segura para mostrar ao usuário (nunca vaza detalhe interno). */
export class RubricaImagemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RubricaImagemError";
  }
}

export interface RubricaPronta {
  png: Buffer;
  largura: number;
  altura: number;
  sha256: string;
  origemMime: "image/png" | "image/jpeg";
}

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function tipoPelosBytes(buffer: Buffer): "image/png" | "image/jpeg" | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(ASSINATURA_PNG)) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return null;
}

function conferirTamanho(largura: number, altura: number): void {
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 1 || altura < 1) {
    throw new RubricaImagemError("A imagem não tem dimensões válidas.");
  }
  if (largura > MAX_LADO || altura > MAX_LADO || (largura * altura) / 1_000_000 > MAX_MEGAPIXELS) {
    throw new RubricaImagemError("A imagem é grande demais. Envie uma foto menor da rubrica.");
  }
}

/**
 * O decoder de PNG aceita arquivo cortado ao meio e devolve a imagem com a parte que faltou em branco: a rubrica
 * ficaria pela metade sem aviso. Por isso a estrutura é conferida: todo capítulo cabe no arquivo, há dados de imagem
 * (IDAT) e o capítulo final (IEND) está inteiro.
 */
function conferirPngCompleto(buffer: Buffer): void {
  let pos = 8;
  let temDados = false;
  while (pos + 12 <= buffer.length) {
    const tamanho = buffer.readUInt32BE(pos);
    const tipo = buffer.toString("latin1", pos + 4, pos + 8);
    if (tamanho > buffer.length - pos - 12) throw new Error("capítulo cortado");
    if (tipo === "IDAT") temDados = true;
    if (tipo === "IEND") {
      if (!temDados) throw new Error("sem dados de imagem");
      return;
    }
    pos += 12 + tamanho;
  }
  throw new Error("arquivo sem fim");
}

interface Rgba { data: Uint8Array; width: number; height: number }

function decodificar(buffer: Buffer, tipo: "image/png" | "image/jpeg"): Rgba {
  try {
    if (tipo === "image/png") {
      // Cabeçalho IHDR: largura e altura ANTES de alocar os pixels.
      if (buffer.length < 33 || buffer.toString("latin1", 12, 16) !== "IHDR") throw new Error("png sem cabeçalho");
      conferirTamanho(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
      // PNG entrelaçado: o decoder o descomprime SEM teto de memória (os 2 MB do arquivo podem virar gigabytes).
      // Rubrica é traço simples: recusar é mais seguro do que confiar no limite do decoder.
      if (buffer[28] !== 0) {
        throw new RubricaImagemError("PNG entrelaçado (interlaçado) não é aceito. Salve de novo como PNG comum ou envie em JPEG.");
      }
      conferirPngCompleto(buffer);
      const png = PNG.sync.read(buffer);
      return { data: png.data, width: png.width, height: png.height };
    }
    const jpg = jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 128,
      maxResolutionInMP: MAX_MEGAPIXELS,
    });
    return { data: jpg.data, width: jpg.width, height: jpg.height };
  } catch (error) {
    if (error instanceof RubricaImagemError) throw error;
    throw new RubricaImagemError("O arquivo não contém uma imagem PNG ou JPEG válida e completa.");
  }
}

/** Quanto cada pixel é "tinta": 0 = papel/transparente, 1 = preto opaco. */
function coberturaDaTinta(img: Rgba): Float32Array {
  const total = img.width * img.height;
  const cobertura = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const luminancia = 0.299 * img.data[o]! + 0.587 * img.data[o + 1]! + 0.114 * img.data[o + 2]!;
    cobertura[i] = ((255 - luminancia) / 255) * (img.data[o + 3]! / 255);
  }
  return cobertura;
}

/**
 * Tira o ruído de fundo e estica o contraste: abaixo de `piso` é papel (ruído de JPEG, sombra leve);
 * o teto vem do próprio traço (95% dos pixels de tinta ficam em cheio), então caneta clara também aparece.
 */
function normalizarOpacidade(cobertura: Float32Array): Float32Array {
  const piso = 0.12;
  const histograma = new Uint32Array(256);
  let comTinta = 0;
  for (const c of cobertura) {
    if (c > piso) {
      histograma[Math.min(255, Math.round(c * 255))]!++;
      comTinta++;
    }
  }
  let teto = 1;
  if (comTinta > 0) {
    const alvo = comTinta * 0.05;
    let acumulado = 0;
    for (let b = 255; b >= 0; b--) {
      acumulado += histograma[b]!;
      if (acumulado >= alvo) { teto = b / 255; break; }
    }
  }
  teto = Math.min(1, Math.max(0.45, teto));
  const alfa = new Float32Array(cobertura.length);
  for (let i = 0; i < cobertura.length; i++) {
    alfa[i] = Math.min(1, Math.max(0, (cobertura[i]! - piso) / (teto - piso)));
  }
  return alfa;
}

function reduzir(alfa: Float32Array, largura: number, altura: number, novaLargura: number, novaAltura: number): Float32Array {
  if (novaLargura === largura && novaAltura === altura) return alfa;
  const saida = new Float32Array(novaLargura * novaAltura);
  for (let oy = 0; oy < novaAltura; oy++) {
    const y0 = Math.floor((oy * altura) / novaAltura);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * altura) / novaAltura));
    for (let ox = 0; ox < novaLargura; ox++) {
      const x0 = Math.floor((ox * largura) / novaLargura);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * largura) / novaLargura));
      let soma = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { soma += alfa[y * largura + x]!; n++; }
      saida[oy * novaLargura + ox] = soma / n;
    }
  }
  return saida;
}

export function prepararRubrica(buffer: Buffer): RubricaPronta {
  if (!buffer || buffer.length === 0) throw new RubricaImagemError("Arquivo vazio. Envie uma imagem PNG ou JPEG da rubrica.");
  if (buffer.length > RUBRICA_MAX_BYTES) throw new RubricaImagemError("Imagem maior que 2 MB. Envie um arquivo menor.");
  const tipo = tipoPelosBytes(buffer);
  if (!tipo) throw new RubricaImagemError("Arquivo inválido. Envie uma imagem PNG ou JPEG.");

  const img = decodificar(buffer, tipo);
  conferirTamanho(img.width, img.height);
  const alfa = normalizarOpacidade(coberturaDaTinta(img));

  let tinta = 0;
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const a = alfa[y * img.width + x]!;
      if (a >= 0.5) tinta++;
      if (a >= 0.3) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (tinta < TINTA_MIN_PIXELS || maxX < 0) {
    throw new RubricaImagemError("Não encontramos o traço da rubrica na imagem. Use tinta escura em fundo claro.");
  }
  if (tinta / (img.width * img.height) > TINTA_MAX_PROPORCAO) {
    throw new RubricaImagemError("A imagem parece uma foto ou tem fundo escuro. Envie a rubrica em fundo claro.");
  }
  const larguraTraco = maxX - minX + 1;
  const alturaTraco = maxY - minY + 1;
  if (Math.max(larguraTraco, alturaTraco) < TRACO_MIN_LADO) {
    throw new RubricaImagemError("Resolução baixa demais. Envie uma imagem maior da rubrica.");
  }

  // Corta rente ao traço com uma pequena margem.
  const margem = Math.max(2, Math.round(0.03 * Math.max(larguraTraco, alturaTraco)));
  const x0 = Math.max(0, minX - margem);
  const y0 = Math.max(0, minY - margem);
  const x1 = Math.min(img.width - 1, maxX + margem);
  const y1 = Math.min(img.height - 1, maxY + margem);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const recorte = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) recorte[y * cw + x] = alfa[(y0 + y) * img.width + (x0 + x)]!;
  }

  const escala = Math.min(1, SAIDA_MAX_LARGURA / cw, SAIDA_MAX_ALTURA / ch);
  const largura = Math.max(1, Math.round(cw * escala));
  const altura = Math.max(1, Math.round(ch * escala));
  const final = reduzir(recorte, cw, ch, largura, altura);

  // Só tinta: preto com opacidade variável (o fundo fica transparente).
  const saida = new PNG({ width: largura, height: altura });
  for (let i = 0; i < final.length; i++) {
    const o = i * 4;
    saida.data[o] = 0;
    saida.data[o + 1] = 0;
    saida.data[o + 2] = 0;
    saida.data[o + 3] = Math.round(Math.pow(final[i]!, REFORCO_TRACO) * 255);
  }
  const png = PNG.sync.write(saida, { colorType: 6 });
  return { png, largura, altura, sha256: createHash("sha256").update(png).digest("hex"), origemMime: tipo };
}
