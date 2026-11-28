import { PNG } from "pngjs";

// Remove apenas margens totalmente transparentes; mantém os pixels e a forma.
// O arquivo original continua intacto no armazenamento.
export function recortarSimbolo(bytes: Uint8Array): Buffer {
  const source = PNG.sync.read(Buffer.from(bytes));
  let left = source.width, top = source.height, right = -1, bottom = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (source.data[(y * source.width + x) * 4 + 3] !== 0) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) throw new Error("O símbolo não possui conteúdo visível.");
  const target = new PNG({ width: right - left + 1, height: bottom - top + 1 });
  PNG.bitblt(source, target, left, top, target.width, target.height, 0, 0);
  return PNG.sync.write(target);
}
