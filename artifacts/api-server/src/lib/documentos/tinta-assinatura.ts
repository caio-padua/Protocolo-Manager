import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/** Azul de caneta tinteiro. */
const AZUL = { r: 18, g: 48, b: 158 };

/**
 * Converte a imagem da rubrica em PNG com fundo transparente e traço azul de caneta tinteiro.
 * O fundo é estimado pelas bordas da imagem (claro ou escuro); só o que difere do fundo vira tinta.
 */
export function rubricaAzulTransparente(bytes: Uint8Array, mime: "image/png" | "image/jpeg"): Uint8Array {
  const buf = Buffer.from(bytes);
  let width: number, height: number, data: Uint8Array;
  if (mime === "image/png") {
    const png = PNG.sync.read(buf);
    ({ width, height } = png); data = png.data;
  } else {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    ({ width, height } = img); data = img.data;
  }
  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const border: number[] = [];
  const borda = Math.max(1, Math.floor(Math.min(width, height) * 0.04));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x >= borda && x < width - borda && y >= borda && y < height - borda) continue;
    const i = (y * width + x) * 4;
    if (data[i + 3] >= 128) border.push(lum(i));
  }
  border.sort((a, b) => a - b);
  const bg = border.length ? border[Math.floor(border.length / 2)] : 255;
  const claro = bg >= 128;
  const out = new PNG({ width, height });
  for (let i = 0; i < data.length; i += 4) {
    const diff = claro ? bg - lum(i) : lum(i) - bg;
    let a = Math.min(1, Math.max(0, (diff - 25) / 70));
    a *= data[i + 3] / 255;
    out.data[i] = AZUL.r; out.data[i + 1] = AZUL.g; out.data[i + 2] = AZUL.b;
    out.data[i + 3] = Math.round(a * 255);
  }
  return new Uint8Array(PNG.sync.write(out));
}
