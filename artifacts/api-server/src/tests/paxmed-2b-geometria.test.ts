import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { recortarSimbolo } from "../lib/documentos/paxmed-recortar-simbolo";
import { tamanhoNomeCabecalho, validarTextosEmpresa2b } from "../lib/documentos/paxmed-2b-limites";

describe("geometria da identidade empresarial", () => {
  it("remove apenas margens transparentes, preservando os pixels visíveis", () => {
    const image = new PNG({ width: 10, height: 12 });
    const first = (3 * 10 + 4) * 4;
    image.data[first] = 50;
    image.data[first + 3] = 255;
    const last = (8 * 10 + 6) * 4;
    image.data[last] = 200;
    image.data[last + 3] = 128;
    const cropped = PNG.sync.read(recortarSimbolo(PNG.sync.write(image)));
    expect([cropped.width, cropped.height]).toEqual([3, 6]);
    expect([cropped.data[0], cropped.data[3]]).toEqual([50, 255]);
    expect([cropped.data[cropped.data.length - 4], cropped.data[cropped.data.length - 1]]).toEqual([200, 128]);
  });
  it("encaixa nome comprido sem invadir o limite e rejeita nome ilegível", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.TimesRomanBold);
    const name = "Instituto Paduzzi Guarulhos";
    const size = tamanhoNomeCabecalho(font, name);
    expect(size).toBeLessThan(20);
    expect(size).toBeGreaterThanOrEqual(12);
    expect(font.widthOfTextAtSize(name, size)).toBeLessThanOrEqual(54 * 72 / 25.4 + 0.001);
    await expect(validarTextosEmpresa2b({
      nomeCabecalho: name, rodapeLinha1: name, rodapeLinha2: "Rua de teste", rodapeLinha3: "Cidade de teste",
    })).resolves.toBeUndefined();
    await expect(validarTextosEmpresa2b({
      nomeCabecalho: "W".repeat(35), rodapeLinha1: name, rodapeLinha2: "Rua de teste", rodapeLinha3: "Cidade de teste",
    })).rejects.toThrow(/não cabe/);
  });
});
