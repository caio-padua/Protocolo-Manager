import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { aplicarOuroAoSimbolo } from "../lib/documentos/paxmed-ouro";

function imagem(opacity: number): Buffer {
  const png = new PNG({ width: 20, height: 20 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 40;
    png.data[i + 1] = 50;
    png.data[i + 2] = 60;
    png.data[i + 3] = opacity;
  }
  return PNG.sync.write(png);
}

describe("Modelo 2B: dourado aplicado ao símbolo", () => {
  it("preserva dimensões e transparência da arte isolada do Instituto", () => {
    const original = readFileSync("../padcom/src/assets/padua-dp-mask.png");
    const before = PNG.sync.read(original);
    const after = PNG.sync.read(aplicarOuroAoSimbolo(original));
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    const beforeAlpha = before.data.filter((_v, i) => i % 4 === 3);
    const afterAlpha = after.data.filter((_v, i) => i % 4 === 3);
    expect(Buffer.compare(beforeAlpha, afterAlpha)).toBe(0);
    const firstVisible = after.data.findIndex((v, i) => i % 4 === 3 && v === 255);
    expect(firstVisible).toBeGreaterThan(0);
    expect(after.data[firstVisible - 3]).toBeGreaterThan(after.data[firstVisible - 1]);
  });

  it("rejeita imagem opaca em vez de dourar o fundo", () => {
    expect(() => aplicarOuroAoSimbolo(imagem(255))).toThrow(/fundo transparente/);
  });

  it("rejeita imagem sem desenho visível", () => {
    expect(() => aplicarOuroAoSimbolo(imagem(0))).toThrow(/conteúdo visível/);
  });

  it("rejeita formatos inválidos, arquivos corrompidos e dimensões excessivas", () => {
    expect(() => aplicarOuroAoSimbolo(Buffer.from("não é imagem"))).toThrow(/PNG transparente/);
    const invalid = imagem(0);
    invalid.writeUInt32BE(9000, 16);
    expect(() => aplicarOuroAoSimbolo(invalid)).toThrow(/dimensões/);
    const broken = imagem(0);
    broken[30] ^= 255;
    expect(() => aplicarOuroAoSimbolo(broken)).toThrow(/ler a imagem/);
  });
});
