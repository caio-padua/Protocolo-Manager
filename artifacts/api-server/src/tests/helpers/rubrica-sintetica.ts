import jpeg from "jpeg-js";
import { PNG } from "pngjs";

// Imagens SINTÉTICAS de rubrica para os testes (Código Paxter, Art. 82): curvas desenhadas por código,
// nunca imagens de clientes.

export interface Cor { r: number; g: number; b: number }
export const PAPEL: Cor = { r: 255, g: 255, b: 255 };
export const TINTA: Cor = { r: 20, g: 20, b: 60 };

/** Quadro RGBA com fundo uniforme e um "rabisco" (onda com laço) de espessura `grossura`. */
export function rabisco(largura: number, altura: number, opcoes: { fundo?: Cor; tinta?: Cor; grossura?: number; margem?: number } = {}) {
  const { fundo = PAPEL, tinta = TINTA, grossura = 3, margem = 0.2 } = opcoes;
  const data = Buffer.alloc(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    data[i * 4] = fundo.r; data[i * 4 + 1] = fundo.g; data[i * 4 + 2] = fundo.b; data[i * 4 + 3] = 255;
  }
  const x0 = Math.round(largura * margem);
  const x1 = Math.round(largura * (1 - margem));
  const cy = altura / 2;
  const amplitude = altura * 0.25;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const y = Math.round(cy + Math.sin(t * Math.PI * 6) * amplitude * (1 - 0.5 * t));
    for (let dy = -grossura; dy <= grossura; dy++) {
      for (let dx = -Math.floor(grossura / 2); dx <= Math.floor(grossura / 2); dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= largura || py >= altura) continue;
        const o = (py * largura + px) * 4;
        data[o] = tinta.r; data[o + 1] = tinta.g; data[o + 2] = tinta.b;
      }
    }
  }
  return { data, width: largura, height: altura };
}

export const comoPng = (img: { data: Buffer; width: number; height: number }) => {
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy(png.data);
  return PNG.sync.write(png);
};
export const comoJpeg = (img: { data: Buffer; width: number; height: number }, qualidade = 90) =>
  Buffer.from(jpeg.encode(img, qualidade).data);
